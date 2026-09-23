import { createHmac, randomUUID, sign } from "node:crypto";
import { backend, signingKeys } from "./apps-script.mjs";
import { sha256 } from "../../scripts/lib/artworks.mjs";

export const artworkPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7WQAAAAASUVORK5CYII=", "base64");
export function artworkPayload(overrides = {}) {
  return { operationId: randomUUID(), revision: 0, expectedRevision: 0, action: "upsert", id: "",
    work: { category: "chibi", title: "虛構作品", alt: "測試用圖像", description: "僅供離線驗證" },
    file: { name: "虛構作品.png", type: "image/png", size: artworkPng.length, sha256: sha256(artworkPng) }, ...overrides };
}
export function artworkBackend() {
  const service = backend();
  const { context, properties, files, faults, calls } = service;
  const rows = [];
  const sheet = {
    getLastRow: () => rows.length, getMaxRows: () => 10000, insertRowsAfter() {},
    getRange(row, column, height, width) {
      return {
        getValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => rows[row - 1 + i]?.[column - 1 + j] ?? "")),
        setValues(values) {
          if (faults.artworkWrite) throw new Error("模擬作品寫入失敗");
          values.forEach((value, index) => { rows[row - 1 + index] = [...value]; });
        },
      };
    },
  };
  const openBook = context.SpreadsheetApp.openById;
  context.SpreadsheetApp.openById = (...args) => ({
    getSheetByName: name => name === "ArtworkJobs" ? sheet : openBook(...args).getSheetByName(name),
    insertSheet: name => name === "ArtworkJobs" ? sheet : openBook(...args).insertSheet(name),
  });
  context.Utilities.computeRsaSha256Signature = (value, key) => [...sign("RSA-SHA256", Buffer.from(value), key)];
  for (const [key, value] of Object.entries({ ARTWORKS_ENABLED: "true", ARTWORK_SITE_ID: "fixture",
    ARTWORK_GITHUB_REPO: "fixture/site", ARTWORK_GITHUB_APP_ID: "123", ARTWORK_GITHUB_INSTALLATION_ID: "456",
    ARTWORK_GITHUB_PRIVATE_KEY: signingKeys.privateKey.export({ type: "pkcs1", format: "pem" }),
    ARTWORK_WORKER_SECRET: "fixture-worker-secret-not-for-production", ARTWORK_FOLDER_ID: "fixture-artwork-folder" })) properties.set(key, value);
  files.set("fixture-artwork-folder", { id: "fixture-artwork-folder", mimeType: "application/vnd.google-apps.folder", appProperties: { artworkStorage: "1" } });
  context.Drive.Files.remove = id => {
    if (faults.artworkDelete) throw new Error("模擬 Drive 刪除失敗");
    files.delete(id);
    if (faults.artworkDeleteResponse) throw new Error("模擬 Drive 刪除回報中斷");
  };
  const remote = { manifest: { version: 1, items: [] }, commits: new Map([["f".repeat(40), { manifest: { version: 1, items: [] } }]]),
    main: "f".repeat(40), production: "0".repeat(40), failDispatch: false, wrongBytes: false };
  const fetch = context.UrlFetchApp.fetch;
  const response = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  context.UrlFetchApp.fetch = (url, options = {}) => {
    if (!url.startsWith("https://api.github.com/")) {
      if (options.headers?.Range && url.includes("alt=media")) {
        calls.push({ url, options });
        const file = files.get(new URL(url).pathname.split("/").at(-1));
        const [start, end] = options.headers.Range.slice(6).split("-").map(Number);
        return { ...response(206, {}), getBlob: () => context.Utilities.newBlob(file.bytes.slice(start, end + 1)) };
      }
      return fetch(url, options);
    }
    calls.push({ url, options });
    if (url.endsWith("/access_tokens")) return response(201, { token: "fixture-installation-token", expires_at: new Date(Date.now() + 3600000).toISOString() });
    if (url.endsWith("/dispatches")) return response(remote.failDispatch ? 500 : 200, { workflow_run_id: 123 });
    if (url.includes("/contents/content/artworks.json?ref=")) {
      const ref = new URL(url).searchParams.get("ref");
      const manifest = ref === "main" ? remote.manifest : remote.commits.get(ref)?.manifest;
      if (!manifest) return response(404, {});
      const data = Buffer.from(JSON.stringify(manifest));
      return response(200, { content: data.toString("base64"), size: data.length, encoding: "base64" });
    }
    if (url.includes("/compare/")) {
      const sha = url.split("/compare/")[1].split("...")[0];
      return response(200, { status: remote.commits.has(sha) ? "ahead" : "diverged" });
    }
    if (url.endsWith("/git/ref/heads/production")) return response(200, { object: { sha: remote.production } });
    if (url.endsWith("/git/ref/heads/main")) return response(200, { object: { sha: remote.main } });
    if (url.includes("/git/commits/")) return response(200, { tree: { sha: url.split("/").at(-1) } });
    if (url.includes("/git/trees/")) {
      const commit = remote.commits.get(new URL(url).pathname.split("/").at(-1));
      return response(200, { tree: commit.manifest.items.flatMap(item => item.media ? [{ path: "public/" + item.media.source.path,
        sha: item.media.source.sha256, size: item.media.source.bytes, type: "blob" }] : []), truncated: false });
    }
    if (url.includes("/git/blobs/")) return response(200, { encoding: "base64", content: (remote.wrongBytes ? Buffer.alloc(artworkPng.length) : artworkPng).toString("base64") });
    return response(404, {});
  };
  context.setupArtworkStorage();
  const admin = (action, payload = {}) => service.invoke("admin.artworks." + action, payload, service.session());
  const machine = (action, payload = {}, envelopeChange = {}) => {
    const body = JSON.stringify({ siteId: "fixture", action, ...payload });
    const timestamp = Date.now();
    const nonce = envelopeChange.nonce || randomUUID();
    const signature = createHmac("sha256", properties.get("ARTWORK_WORKER_SECRET")).update(`${timestamp}.${nonce}.${body}`).digest("hex");
    return service.invoke("artworks.worker", { body, timestamp, nonce, signature, ...envelopeChange });
  };
  function commit(job) {
    const sha = String(remote.commits.size + 1).padStart(40, "0");
    const original = { path: `assets/artworks/${job.work.id}/${job.file?.sha256}/original.png`, bytes: job.file?.size, sha256: job.file?.sha256 };
    const previous = remote.manifest.items.find(item => item.id === job.work.id);
    const item = { ...job.work, revision: job.expectedRevision + 1, operationId: job.operationId, deleted: job.action === "delete",
      ...(job.file ? { media: { type: "image", width: 1, height: 1, src: original.path, poster: original.path, playbackSrc: original.path, source: original, assets: [original] } }
        : previous?.media && job.action !== "delete" ? { media: previous.media } : {}) };
    remote.manifest = { version: 1, items: [...remote.manifest.items.filter(entry => entry.id !== item.id), item] };
    remote.commits.set(sha, { manifest: structuredClone(remote.manifest) });
    remote.main = sha;
    return sha;
  }
  return { ...service, jobRows: rows, admin, machine, remote, commit };
}
