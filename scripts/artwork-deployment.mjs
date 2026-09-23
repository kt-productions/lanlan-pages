import { appendFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { workerClient } from "./lib/artwork-client.mjs";
import { artworkAssert } from "../src/features/artworks/contract.js";

artworkAssert(process.env.GITHUB_REF === "refs/heads/production" && /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || ""), "只允許 production 的指定版本部署。");
async function current() {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/git/ref/heads/production`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" }, signal: AbortSignal.timeout(30000),
  });
  artworkAssert(response.ok, "無法核對 production 版本。");
  return (await response.json()).object.sha === process.env.GITHUB_SHA;
}
if (process.argv[2] === "check") {
  await appendFile(process.env.GITHUB_OUTPUT, `current=${await current()}\n`);
} else {
  if (await current()) {
    const site = new URL(process.env.PAGE_URL);
    artworkAssert(site.protocol === "https:" && !site.username && !site.password, "正式網站網址不正確。");
    let verified = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const url = new URL("release.json", site.href.endsWith("/") ? site : site.href + "/");
      url.searchParams.set("version", process.env.GITHUB_SHA);
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) }).catch(() => null);
      const data = response?.ok ? await response.json().catch(() => null) : null;
      if (data?.commitSha === process.env.GITHUB_SHA) { verified = true; break; }
      await setTimeout(3000);
    }
    artworkAssert(verified, "Pages 尚未回傳指定版本，請稍後重試部署回報。");
    if (process.env.ARTWORKS_ENABLED === "true" && await current()) {
      try { await workerClient()("deployed", { commitSha: process.env.GITHUB_SHA }); }
      catch (error) {
        // 核對與回報之間仍可能有新提交；只略過確定已被取代的版本。
        if (await current()) throw error;
        console.log("回報期間已有較新 production，交由新版完成狀態核對。");
      }
    }
    console.log("正式網站版本核對完成。");
  } else console.log("已有較新版本等待發布，略過舊版本回報。");
}
