import { createHmac, randomUUID, sign } from "node:crypto";
import { artworkAssert } from "../../src/features/artworks/contract.js";

export function workerClient(env = process.env, fetcher = fetch) {
  artworkAssert(/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(env.ARTWORK_API_URL || ""), "缺少正確的作品 API 網址。");
  artworkAssert(env.ARTWORK_WORKER_SECRET?.length >= 32 && /^[a-z0-9-]{1,60}$/.test(env.ARTWORK_SITE_ID || ""), "作品工作憑證尚未設定。");
  return async function call(action, payload = {}) {
    const body = JSON.stringify({ ...payload, action, siteId: env.ARTWORK_SITE_ID });
    const timestamp = Date.now();
    const nonce = randomUUID();
    const signature = createHmac("sha256", env.ARTWORK_WORKER_SECRET).update(`${timestamp}.${nonce}.${body}`).digest("hex");
    const response = await fetcher(env.ARTWORK_API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ action: "artworks.worker", payload: { body, timestamp, nonce, signature } }), signal: AbortSignal.timeout(120000) });
    artworkAssert(response.ok, "作品服務回應失敗。");
    const result = await response.json();
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
