/** GitHub App 私鑰只存在 Script Properties；不同站點分別取得限定 repo 的短效 token。 */
function artworkConfig_() {
  Core_.requireValue(
    setting_("ARTWORKS_ENABLED", true) === "true",
    "作品管理尚未啟用，請由維護者完成設定。",
    "NOT_CONFIGURED",
  );
  const config = {
    site: setting_("ARTWORK_SITE_ID"),
    repo: setting_("ARTWORK_GITHUB_REPO"),
    installation: setting_("ARTWORK_GITHUB_INSTALLATION_ID"),
    app: setting_("ARTWORK_GITHUB_APP_ID"),
  };
  Core_.requireValue(
    /^[a-z0-9-]{1,60}$/.test(config.site) &&
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repo) &&
      /^\d+$/.test(config.installation) &&
      /^\d+$/.test(config.app),
    "作品發布設定不正確。",
    "CONFIG",
  );
  return config;
}

function artworkGitHubToken_() {
  const config = artworkConfig_();
  const key = "artwork:github:" + digest_(config.repo + ":" + config.installation);
  const cache = CacheService.getScriptCache();
  const saved = cache.get(key);
  if (saved) return saved;
  const now = Math.floor(Date.now() / 1000);
  const signing =
    base64url_(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
    "." +
    base64url_(JSON.stringify({ iat: now - 60, exp: now + 540, iss: config.app }));
  const privateKey = setting_("ARTWORK_GITHUB_PRIVATE_KEY").replace(/\\n/g, "\n");
  // GitHub 下載的 PKCS#1 私鑰轉成 Utilities 可讀取的 PKCS#8；只轉封裝，不另產生金鑰。
  const pem = privateKey.includes("BEGIN RSA PRIVATE KEY")
    ? Forge_.pki.privateKeyInfoToPem(
        Forge_.pki.wrapRsaPrivateKey(
          Forge_.pki.privateKeyToAsn1(Forge_.pki.privateKeyFromPem(privateKey)),
        ),
      )
    : privateKey;
  const jwt = signing + "." + base64url_(Utilities.computeRsaSha256Signature(signing, pem));
  const response = UrlFetchApp.fetch(
    "https://api.github.com/app/installations/" + config.installation + "/access_tokens",
    {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      followRedirects: false,
      headers: {
        Authorization: "Bearer " + jwt,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      payload: JSON.stringify({
        repositories: [config.repo.split("/")[1]],
        permissions: { actions: "write", contents: "read" },
      }),
    },
  );
  Core_.requireValue(
    response.getResponseCode() === 201,
    "無法取得 GitHub 發布授權，請聯絡維護者。",
    "GITHUB",
  );
  const result = JSON.parse(response.getContentText());
  Core_.requireValue(
    typeof result.token === "string" && Date.parse(result.expires_at) > Date.now() + 120000,
    "GitHub 授權回應不完整。",
    "GITHUB",
  );
  cache.put(
    key,
    result.token,
    Math.min(3000, Math.floor((Date.parse(result.expires_at) - Date.now()) / 1000) - 60),
  );
  return result.token;
}

function artworkGitHub_(route, method, body) {
  const config = artworkConfig_();
  const response = UrlFetchApp.fetch("https://api.github.com/repos/" + config.repo + "/" + route, {
    method: method || "get",
    contentType: "application/json",
    muteHttpExceptions: true,
    followRedirects: false,
    headers: {
      Authorization: "Bearer " + artworkGitHubToken_(),
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    ...(body ? { payload: JSON.stringify(body) } : {}),
  });
  Core_.requireValue(
    response.getResponseCode() >= 200 && response.getResponseCode() < 300,
    "GitHub 操作未確認成功，已保存的工作可重試。",
    "GITHUB",
  );
  return response.getContentText() ? JSON.parse(response.getContentText()) : {};
}

function artworkManifest_(ref) {
  Core_.requireValue(ref === "main" || /^[a-f0-9]{40}$/.test(ref), "作品來源版本不正確。");
  const file = artworkGitHub_("contents/content/artworks.json?ref=" + ref);
  Core_.requireValue(
    file.encoding === "base64" && file.size < 900000,
    "作品清單格式或容量不正確。",
    "CAPACITY",
  );
  const manifest = JSON.parse(
    Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\s/g, ""))).getDataAsString(
      "UTF-8",
    ),
  );
  ArtworkCore_.mergeArtworks(ARTWORK_BASE_, manifest, true);
  return manifest;
}

function dispatchArtwork_() {
  return artworkGitHub_("actions/workflows/artworks.yml/dispatches", "post", { ref: "main" });
}

/** 清理前由 GAS 從 GitHub 再核對原檔；不相信瀏覽器或 runner 單方面聲稱已保存。 */
function verifyArtworkCommit_(job, sha) {
  Core_.requireValue(/^[a-f0-9]{40}$/.test(sha), "提交版本不正確。");
  const comparison = artworkGitHub_("compare/" + sha + "...main");
  Core_.requireValue(
    ["ahead", "identical"].includes(comparison.status),
    "作品提交不在遠端 main 歷史中。",
    "CONFLICT",
  );
  const manifest = artworkManifest_(sha);
  const item = manifest.items.find(function (entry) {
    return entry.operationId === job.operationId;
  });
  Core_.requireValue(
    item &&
      item.id === job.work.id &&
      item.revision === job.expectedRevision + 1 &&
      item.deleted === (job.action === "delete") &&
      item.title === job.work.title &&
      item.category === job.work.category &&
      item.alt === job.work.alt &&
      item.description === job.work.description,
    "提交與作品工作內容不符。",
    "CONFLICT",
  );
  if (!job.file) return;
  const source = item.media && item.media.source;
  Core_.requireValue(
    source &&
      source.sha256 === job.file.sha256 &&
      source.bytes === job.file.size &&
      source.path ===
        "assets/artworks/" +
          job.work.id +
          "/" +
          job.file.sha256 +
          "/original." +
          ArtworkCore_.ARTWORK_TYPES[job.file.type],
    "提交未完整保存作品原檔。",
    "CONFLICT",
  );
  const commit = artworkGitHub_("git/commits/" + sha);
  const tree = artworkGitHub_("git/trees/" + commit.tree.sha + "?recursive=1");
  Core_.requireValue(!tree.truncated, "作品目錄過大，無法完整核對。", "CAPACITY");
  const entry = tree.tree.find(function (file) {
    return file.path === "public/" + source.path && file.type === "blob";
  });
  Core_.requireValue(entry && entry.size === job.file.size, "Git 遠端原檔大小不符。", "CONFLICT");
  const blob = artworkGitHub_("git/blobs/" + entry.sha);
  Core_.requireValue(blob.encoding === "base64", "Git 原檔編碼不正確。", "CONFLICT");
  const bytes = Utilities.base64Decode(blob.content.replace(/\s/g, ""));
  Core_.requireValue(
    bytes.length === job.file.size && bytesDigest_(bytes) === job.file.sha256,
    "Git 遠端原檔雜湊不符，不可清理暫存。",
    "CONFLICT",
  );
}
