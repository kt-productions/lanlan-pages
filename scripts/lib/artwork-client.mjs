import { createHmac, randomUUID, sign } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { artworkAssert } from "../../src/features/artworks/contract.js";

export function workerClient(env = process.env, fetcher = fetch, wait = setTimeout) {
  artworkAssert(/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(env.ARTWORK_API_URL || ""), "缺少正確的作品 API 網址。");
  artworkAssert(env.ARTWORK_WORKER_SECRET?.length >= 32 && /^[a-z0-9-]{1,60}$/.test(env.ARTWORK_SITE_ID || ""), "作品工作憑證尚未設定。");
  return async function call(action, payload = {}) {
    artworkAssert(["claim", "heartbeat", "download", "stored", "cleanup", "promoted", "failed", "deployed"].includes(action), "作品工作操作不正確。");
    const body = JSON.stringify({ ...payload, action, siteId: env.ARTWORK_SITE_ID });
    const timestamp = Date.now();
    const nonce = randomUUID();
    const signature = createHmac("sha256", env.ARTWORK_WORKER_SECRET).update(`${timestamp}.${nonce}.${body}`).digest("hex");
    const signal = AbortSignal.timeout(240000);
    const envelope = JSON.stringify({ action: "artworks.worker", payload: { body, timestamp, nonce, signature } });
    let result;
    for (let delivery = 0; delivery < 3 && !signal.aborted; delivery++) {
      if (delivery) await wait(1000 * delivery);
      let response;
      try {
        response = await fetcher(env.ARTWORK_API_URL, { method: "POST", redirect: "manual", headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: envelope, signal });
      } catch { continue; }
      let resultUrl;
      if ([302, 303].includes(response.status)) {
        try { resultUrl = new URL(response.headers.get("location")); } catch { /* 不輸出包含結果票證的網址。 */ }
        artworkAssert(resultUrl?.protocol === "https:" && resultUrl.hostname === "script.googleusercontent.com" &&
          !resultUrl.username && !resultUrl.password && !resultUrl.port, "作品服務回應的轉址不正確。");
      }
      // 先重讀 Google 結果；票證持續失效才重送完全相同的簽章請求，由後端租約／收據去重。
      for (let attempt = 0; attempt < (resultUrl ? 3 : 1) && !signal.aborted; attempt++) {
        if (attempt) await wait(1000 * attempt);
        if (resultUrl) {
          try { response = await fetcher(resultUrl.href, { method: "GET", redirect: "error", signal }); }
          catch { continue; }
        }
        if (!response.ok) continue;
        result = await response.json().catch(() => null);
        if (typeof result?.ok === "boolean") break;
      }
      if (typeof result?.ok === "boolean") break;
    }
    artworkAssert(typeof result?.ok === "boolean", "作品服務未回傳可確認的結果，請稍後從後台重試。");
    artworkAssert(result.ok === true, result.error?.message || "作品服務操作失敗。");
    return result.data;
  };
}

export async function installationToken(env = process.env, fetcher = fetch) {
  artworkAssert(/^\d+$/.test(env.ARTWORK_APP_ID || "") && /^\d+$/.test(env.ARTWORK_INSTALLATION_ID || "") &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY || ""), "GitHub App 設定不完整。");
  const now = Math.floor(Date.now() / 1000);
  const body = [Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.ARTWORK_APP_ID })).toString("base64url")].join(".");
  const jwt = `${body}.${sign("RSA-SHA256", Buffer.from(body), env.ARTWORK_APP_PRIVATE_KEY.replace(/\\n/g, "\n")).toString("base64url")}`;
  const response = await fetcher(`https://api.github.com/app/installations/${env.ARTWORK_INSTALLATION_ID}/access_tokens`, {
    method: "POST", headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" },
    body: JSON.stringify({ repositories: [env.GITHUB_REPOSITORY.split("/")[1]], permissions: { contents: "write", actions: "write" } }),
    signal: AbortSignal.timeout(30000),
  });
  artworkAssert(response.status === 201, "無法取得 GitHub App 授權。");
  const result = await response.json();
  artworkAssert(typeof result.token === "string", "GitHub App 授權回應不完整。");
  return result.token;
}
