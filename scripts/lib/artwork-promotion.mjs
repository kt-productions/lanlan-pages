import { artworkAssert } from "../../src/features/artworks/contract.js";

/** 只允許前進或略過已被包含的版本，絕不透過 force 重寫 production。 */
export async function promoteArtwork(git, sha, token, retryDeployment) {
  artworkAssert(/^[a-f0-9]{40}$/.test(sha), "發布版本不正確。");
  const current = (await git(["ls-remote", "origin", "refs/heads/production"])).split(/\s/)[0];
  if (current === sha) {
    await retryDeployment();
    return { state: "retry", sha };
  }
  if (current) {
    await git(["fetch", "origin", "production"]);
    let alreadyIncluded = false;
    try {
      await git(["merge-base", "--is-ancestor", sha, current]);
      alreadyIncluded = true;
    } catch {
      /* 尚未包含的版本仍須通過下方快轉檢查。 */
    }
    if (alreadyIncluded) {
      // 舊工作也可能遇到較新版部署失敗；重試現行 production，不能退回舊 SHA。
      await retryDeployment();
      return { state: "included", sha: current };
    }
    await git(["merge-base", "--is-ancestor", current, sha]);
  }
  await git(["push", "origin", `${sha}:refs/heads/production`], token);
  return { state: "promoted", sha };
}
