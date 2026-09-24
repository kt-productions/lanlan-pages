import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "../scripts/lib/artwork-media.mjs";
import { promoteArtwork } from "../scripts/lib/artwork-promotion.mjs";

test("以實際 Git 驗證首次發布、快轉、同 SHA 與已包含版本重試、分歧保護", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "artwork-git-test-"));
  const remote = path.join(temp, "remote.git");
  const local = path.join(temp, "local");
  await mkdir(local);
  await run("git", ["init", "--bare", remote]);
  const git = (args) => run("git", args, { cwd: local });
  await git(["init", "-b", "main"]);
  await git(["config", "user.name", "虛構測試"]);
  await git(["config", "user.email", "fixture@example.invalid"]);
  await git(["remote", "add", "origin", remote]);
  async function commit(text) {
    await writeFile(path.join(local, "fixture.txt"), text);
    await git(["add", "fixture.txt"]);
    await git(["commit", "-m", "test(artworks): 虛構分支測試"]);
    return git(["rev-parse", "HEAD"]);
  }
  const first = await commit("第一版");
  await git(["push", "origin", "main"]);
  let retries = 0;
  const retry = async () => {
    retries++;
  };
  assert.equal((await promoteArtwork(git, first, "", retry)).state, "promoted");
  assert.equal((await promoteArtwork(git, first, "", retry)).state, "retry");
  assert.equal(retries, 1);
  const second = await commit("第二版");
  await git(["push", "origin", "main"]);
  assert.equal((await promoteArtwork(git, second, "", retry)).state, "promoted");
  assert.equal((await promoteArtwork(git, first, "", retry)).state, "included");
  assert.equal(retries, 2);
  assert.ok((await git(["ls-remote", "origin", "refs/heads/production"])).startsWith(second));
  await git(["checkout", "-b", "production", second]);
  const divergent = await commit("production 的獨立修改");
  await git(["push", "origin", "production"]);
  await git(["checkout", "main"]);
  const third = await commit("main 的獨立修改");
  await assert.rejects(promoteArtwork(git, third, "", retry));
  assert.ok((await git(["ls-remote", "origin", "refs/heads/production"])).startsWith(divergent));
});
