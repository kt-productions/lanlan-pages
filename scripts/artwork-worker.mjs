import { readFile, writeFile, mkdir, mkdtemp, chmod, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { root } from "./lib/paths.mjs";
import { artworkAssert, artworkOperation } from "../src/features/artworks/contract.js";
import { stickerWork, applyArtworkJob, sha256, managedPath } from "./lib/artworks.mjs";
import { processArtwork, run } from "./lib/artwork-media.mjs";
import { workerClient, installationToken } from "./lib/artwork-client.mjs";
import { promoteArtwork } from "./lib/artwork-promotion.mjs";

const rpc = workerClient();
artworkAssert(process.env.GITHUB_ACTIONS === "true", "此腳本只在受信任的 GitHub Actions checkout 執行。");
const temp = await mkdtemp(path.join(os.tmpdir(), "artwork-auth-"));
const askpass = path.join(temp, "askpass.sh");
await writeFile(askpass, '#!/bin/sh\ncase "$1" in *Username*) printf "%s" "x-access-token" ;; *) printf "%s" "$ARTWORK_GIT_TOKEN" ;; esac\n');
await chmod(askpass, 0o700);
const git = (args, token = process.env.GITHUB_TOKEN) => run("git", args, { cwd: root,
  env: { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: "0", ARTWORK_GIT_TOKEN: token }, timeout: 180000 });
const owner = `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`;

async function processJob(job, leaseId) {
  artworkOperation(job.operationId);
  const call = (action, payload) => rpc(action, { operationId: job.operationId, leaseId, ...payload });
  let leaseError;
  let phase = "核對 main";
  const heartbeat = setInterval(() => { call("heartbeat").catch(error => { leaseError = error; }); }, 60000);
  try {
    await git(["fetch", "origin", "main"]);
    artworkAssert(!(await git(["status", "--porcelain"])), "工作目錄有未提交變更，停止處理。");
    await git(["checkout", "--detach", "origin/main"]);
    let sha = job.commitSha;
    if (!sha) {
      // push 成功但回報遺失時，從 main 歷史找回同一提交，不重複配號或轉檔。
      sha = (await git(["log", "origin/main", "--format=%H", "--fixed-strings", "--grep", `Artwork-Operation: ${job.operationId}`])).split("\n")[0];
    }
    if (!sha) {
      const manifest = JSON.parse(await readFile(path.join(root, "content/artworks.json"), "utf8"));
      const base = [...JSON.parse(await readFile(path.join(root, "content/works.json"), "utf8")), stickerWork];
      // 先驗證作品版本，再花時間下載與轉檔。
      applyArtworkJob(manifest, base, job, job.file ? {} : null);
      let media;
      if (job.file) {
        phase = "下載與轉檔";
        const chunks = [];
        for (let offset = 0; offset < job.file.size; offset += 262144) {
          const part = await call("download", { offset });
          artworkAssert(part.sha256 === job.file.sha256 && part.size === job.file.size, "作品下載版本已變更。");
          chunks.push(Buffer.from(part.data, "base64"));
        }
        const bytes = Buffer.concat(chunks);
        artworkAssert(sha256(bytes) === job.file.sha256, "作品下載雜湊不符。");
        media = await processArtwork(bytes, job.file, job.work.id, root);
      }
      phase = "驗證作品與建置";
      const next = applyArtworkJob(manifest, base, job, media);
      await writeFile(path.join(root, "content/artworks.json"), JSON.stringify(next, null, 2) + "\n");
      // 只清理受管目錄中已無引用的版本，舊素材、首頁與委託附件完全不在範圍內。
      const referenced = new Set(next.items.flatMap(item => item.media?.assets.map(asset => asset.path) || []));
      const managed = path.join(root, "public/assets/artworks");
      await mkdir(managed, { recursive: true });
      for (const entry of await readdir(managed, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const absolute = path.join(entry.parentPath, entry.name);
        const relative = path.relative(path.join(root, "public"), absolute).split(path.sep).join("/");
        managedPath(relative);
        if (!referenced.has(relative)) await rm(absolute);
      }
      for (const command of ["test", "build", "check"]) await run("npm", ["run", command], { cwd: root, timeout: 300000 });
      phase = "提交 main";
      if (leaseError) throw leaseError;
      await call("heartbeat");
      await git(["add", "--", "content/artworks.json", "public/assets/artworks"]);
      const changed = (await git(["diff", "--cached", "--name-only"])).split("\n");
      artworkAssert(changed.every(file => file === "content/artworks.json" || file.startsWith("public/assets/artworks/")), "作品提交超出允許範圍。");
      await git(["-c", "user.name=作品發布服務", "-c", "user.email=artworks@users.noreply.github.com", "commit", "-m", "feat(artworks): 更新核可的公開作品", "-m",
        `保存原檔、展示版本及作品資料；離線測試、建置與資產檢查通過。\n\nArtwork-Operation: ${job.operationId}`]);
      sha = await git(["rev-parse", "HEAD"]);
      await git(["push", "origin", `${sha}:refs/heads/main`]);
    }
    artworkAssert(/^[a-f0-9]{40}$/.test(sha), "作品提交版本不正確。");
    phase = "核對遠端保存";
    await call("stored", { commitSha: sha });
    try { await call("cleanup"); }
    catch { console.log("作品已保存；Drive 清理待重試，繼續發布。"); }
    if (leaseError) throw leaseError;
    await call("heartbeat");
    phase = "同步 production";
    const token = await installationToken();
    try {
      await promoteArtwork(git, sha, token, async () => {
        const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/pages.yml/dispatches`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" },
          body: JSON.stringify({ ref: "production" }), signal: AbortSignal.timeout(30000),
        });
        artworkAssert(response.ok, "無法重試部署。");
      });
      await call("promoted");
    } finally {
      await fetch(`https://api.github.com/installation/token`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }).catch(() => {});
    }
    console.log("作品已保存並送往部署。");
  } catch {
    await call("failed").catch(() => {});
    // 公開 workflow 日誌不包含私人草稿、原始請求或後端例外。
    throw new Error(`作品工作在「${phase}」階段未完成，暫存與提交紀錄已保留，請從後台重試。`);
  } finally { clearInterval(heartbeat); }
}
try {
  for (let count = 0; count < 5; count++) {
    const { job, leaseId } = await rpc("claim", { owner });
    if (!job) break;
    await processJob(job, leaseId);
  }
} finally {
  await rm(askpass, { force: true });
}
