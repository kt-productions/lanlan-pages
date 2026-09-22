function setting_(name, optional) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  Core_.requireValue(optional || value, "服務設定尚未完成。", "CONFIG");
  return value || "";
}

function randomKey_() {
  const secret = setting_("SESSION_SECRET");
  Core_.requireValue(
    secret.length >= 32,
    "登入工作階段密鑰設定不正確。",
    "CONFIG",
  );
  // Utilities UUID 沒有密碼學亂數保證；以獨立伺服器密鑰產生不可預測的驗證值。
  return Utilities.computeHmacSha256Signature(
    Utilities.getUuid() + Utilities.getUuid() + Date.now(),
    secret,
  )
    .map(function (byte) {
      return (byte & 255).toString(16).padStart(2, "0");
    })
    .join("");
}

function base64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}

function digest_(text) {
  return base64url_(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      text,
      Utilities.Charset.UTF_8,
    ),
  );
}

function decodeJson_(encoded) {
  return JSON.parse(
    Utilities.newBlob(Utilities.base64DecodeWebSafe(encoded)).getDataAsString(
      "UTF-8",
    ),
  );
}

function equal_(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++)
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function lock_(task) {
  const lock = LockService.getScriptLock();
  Core_.requireValue(
    lock.tryLock(10000),
    "目前有其他操作，請稍後重試。",
    "BUSY",
  );
  try {
    return task();
  } finally {
    lock.releaseLock();
  }
}

function takeCache_(key) {
  return lock_(function () {
    const cache = CacheService.getScriptCache();
    const value = cache.get(key);
    cache.remove(key);
    Core_.requireValue(value, "登入已逾時或已使用，請重新登入。", "AUTH");
    return JSON.parse(value);
  });
}

function isAdmin_(id) {
  return setting_("ADMIN_TELEGRAM_IDS")
    .split(",")
    .map(function (value) {
      return value.trim();
    })
    .includes(String(id));
}

function adminUrl_() {
  const url = setting_("ADMIN_URL");
  Core_.requireValue(
    /^https:\/\/[^\s?#]+\/admin(?:\/|\.html)$/.test(url),
    "管理頁網址設定不正確。",
    "CONFIG",
  );
  return url;
}

function callbackUrl_() {
  const url = setting_("WEB_APP_URL");
  Core_.requireValue(
    /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(
      url,
    ),
    "登入回呼網址設定不正確。",
    "CONFIG",
  );
  return url;
}

function beginLogin_(payload) {
  Core_.requireValue(
    /^[a-f0-9]{64}$/.test(payload.browserKey || ""),
    "登入請求不正確。",
    "AUTH",
  );
  adminUrl_();
  const state = randomKey_();
  const verifier = randomKey_();
  const nonce = randomKey_();
  CacheService.getScriptCache().put(
    "oauth:" + digest_(state),
    JSON.stringify({
      verifier: verifier,
      nonce: nonce,
      browserHash: digest_(payload.browserKey),
      createdAt: Date.now(),
    }),
    600,
  );
  const params = {
    client_id: setting_("TELEGRAM_CLIENT_ID"),
    redirect_uri: callbackUrl_(),
    response_type: "code",
    scope: "openid profile",
    state: state,
    nonce: nonce,
    code_challenge: digest_(verifier),
    code_challenge_method: "S256",
  };
  return {
    url:
      "https://oauth.telegram.org/auth?" +
      Object.keys(params)
        .map(function (key) {
          return (
            encodeURIComponent(key) + "=" + encodeURIComponent(params[key])
          );
        })
        .join("&"),
  };
}

function telegramKeys_(refresh) {
  const cache = CacheService.getScriptCache();
  const saved = !refresh && cache.get("telegram:jwks");
  if (saved) return JSON.parse(saved);
  const response = UrlFetchApp.fetch(
    "https://oauth.telegram.org/.well-known/jwks.json",
    {
      muteHttpExceptions: true,
      followRedirects: false,
      validateHttpsCertificates: true,
    },
  );
  Core_.requireValue(
    response.getResponseCode() === 200,
    "暫時無法驗證 Telegram 登入。",
    "AUTH",
  );
  const data = JSON.parse(response.getContentText());
  Core_.requireValue(
    Array.isArray(data.keys),
    "Telegram 登入金鑰格式不正確。",
    "AUTH",
  );
  cache.put("telegram:jwks", JSON.stringify(data.keys), 3600);
  return data.keys;
}

/** 只接受 RS256；先以 Telegram 公鑰驗證，再採用 ID 與權限，不能只解碼 JWT。 */
function verifyTelegramToken_(token, nonce) {
  Core_.requireValue(
    typeof token === "string" && token.length < 16000,
    "登入憑證不正確。",
    "AUTH",
  );
  const parts = token.split(".");
  Core_.requireValue(
    parts.length === 3 &&
      parts.every(function (part) {
        return /^[A-Za-z0-9_-]+$/.test(part);
      }),
    "登入憑證格式不正確。",
    "AUTH",
  );
  const header = decodeJson_(parts[0]);
  Core_.requireValue(
    header.alg === "RS256" && typeof header.kid === "string" && !header.crit,
    "登入簽章演算法不支援。",
    "AUTH",
  );
  const findKey = function (keys) {
    return keys.find(function (key) {
      return (
        key.kid === header.kid &&
        key.kty === "RSA" &&
        (!key.alg || key.alg === "RS256") &&
        (!key.use || key.use === "sig") &&
        (!key.key_ops || key.key_ops.includes("verify"))
      );
    });
  };
  let key = findKey(telegramKeys_(false));
  if (!key) key = findKey(telegramKeys_(true));
  Core_.requireValue(
    key &&
      typeof key.n === "string" &&
      key.n.length >= 342 &&
      key.n.length <= 700,
    "找不到有效的 Telegram 登入金鑰。",
    "AUTH",
  );
  const bytes = function (value) {
    return Utilities.base64DecodeWebSafe(value)
      .map(function (byte) {
        return String.fromCharCode(byte & 255);
      })
      .join("");
  };
  const integer = function (value) {
    return new Forge_.jsbn.BigInteger(Forge_.util.bytesToHex(bytes(value)), 16);
  };
  const publicKey = Forge_.pki.setRsaPublicKey(integer(key.n), integer(key.e));
  const hash = Forge_.md.sha256.create();
  hash.update(parts[0] + "." + parts[1], "utf8");
  Core_.requireValue(
    publicKey.verify(hash.digest().bytes(), bytes(parts[2])),
    "Telegram 登入簽章驗證失敗。",
    "AUTH",
  );
  const claims = decodeJson_(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  const client = setting_("TELEGRAM_CLIENT_ID");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  Core_.requireValue(
    claims.iss === "https://oauth.telegram.org" &&
      audiences.includes(client) &&
      (audiences.length === 1 || claims.azp === client) &&
      (!claims.azp || claims.azp === client) &&
      Number.isInteger(claims.exp) &&
      claims.exp > now &&
      Number.isInteger(claims.iat) &&
      claims.iat <= now + 60 &&
      claims.iat >= now - 600 &&
      (!claims.nbf || claims.nbf <= now) &&
      equal_(claims.nonce, nonce) &&
      typeof claims.sub === "string" &&
      claims.sub.length > 0,
    "Telegram 登入憑證已失效或不屬於本站。",
    "AUTH",
  );
  // OIDC sub 與 Telegram 的數字 ID 不一定相同；白名單採 profile 的 id，不採可更名的 username。
  Core_.requireValue(
    (Number.isSafeInteger(claims.id) && claims.id > 0) ||
      (typeof claims.id === "string" && /^[1-9][0-9]{0,15}$/.test(claims.id)),
    "缺少 Telegram 使用者 ID。",
    "AUTH",
  );
  Core_.requireValue(
    isAdmin_(String(claims.id)),
    "這個 Telegram 帳號沒有管理權限。",
    "FORBIDDEN",
  );
  return { id: String(claims.id) };
}

function completeLogin_(params) {
  Core_.requireValue(
    /^[a-f0-9]{64}$/.test(params.state || ""),
    "登入請求不正確。",
    "AUTH",
  );
  const pending = takeCache_("oauth:" + digest_(params.state));
  Core_.requireValue(
    !params.error &&
      typeof params.code === "string" &&
      params.code.length <= 4000 &&
      Date.now() - pending.createdAt < 600000,
    "登入取消或已逾時，請重新登入。",
    "AUTH",
  );
  const response = UrlFetchApp.fetch("https://oauth.telegram.org/token", {
    method: "post",
    headers: {
      Authorization:
        "Basic " +
        Utilities.base64Encode(
          setting_("TELEGRAM_CLIENT_ID") +
            ":" +
            setting_("TELEGRAM_CLIENT_SECRET"),
        ),
    },
    payload: {
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: callbackUrl_(),
      client_id: setting_("TELEGRAM_CLIENT_ID"),
      code_verifier: pending.verifier,
    },
    muteHttpExceptions: true,
    followRedirects: false,
    validateHttpsCertificates: true,
  });
  Core_.requireValue(
    response.getResponseCode() === 200,
    "Telegram 登入未完成，請重新登入。",
    "AUTH",
  );
  const identity = verifyTelegramToken_(
    JSON.parse(response.getContentText()).id_token,
    pending.nonce,
  );
  const ticket = randomKey_();
  CacheService.getScriptCache().put(
    "ticket:" + digest_(ticket),
    JSON.stringify({
      id: identity.id,
      browserHash: pending.browserHash,
      expiresAt: Date.now() + 120000,
    }),
    120,
  );
  return adminUrl_() + "#ticket=" + ticket;
}

function exchangeTicket_(payload) {
  Core_.requireValue(
    /^[a-f0-9]{64}$/.test(payload.ticket || "") &&
      /^[a-f0-9]{64}$/.test(payload.browserKey || ""),
    "登入請求不正確。",
    "AUTH",
  );
  // 同一票證只建立一次工作階段；回應遺失時，原分頁可在原期限內重取同一結果。
  return lock_(function () {
    const cache = CacheService.getScriptCache();
    const key = "ticket:" + digest_(payload.ticket);
    const saved = cache.get(key);
    Core_.requireValue(saved, "登入已逾時，請重新登入。", "AUTH");
    const ticket = JSON.parse(saved);
    Core_.requireValue(ticket.expiresAt > Date.now(), "登入票證已逾時，請重新登入。", "AUTH");
    Core_.requireValue(
      equal_(ticket.browserHash, digest_(payload.browserKey)),
      "請從原先登入的分頁完成驗證。",
      "AUTH",
    );
    Core_.requireValue(
      isAdmin_(ticket.id),
      "這個帳號沒有管理權限。",
      "FORBIDDEN",
    );
    if (ticket.session) {
      requireAdmin_(ticket.session.token);
      return ticket.session;
    }
    const token = randomKey_();
    const expiresAt = Date.now() + 3600000;
    cache.put(
      "session:" + digest_(token),
      JSON.stringify({ id: ticket.id, expiresAt: expiresAt }),
      3600,
    );
    ticket.session = { token: token, id: ticket.id, expiresAt: expiresAt };
    cache.put(key, JSON.stringify(ticket), Math.max(1, Math.ceil((ticket.expiresAt - Date.now()) / 1000)));
    return ticket.session;
  });
}

function requireAdmin_(token) {
  Core_.requireValue(
    /^[a-f0-9]{64}$/.test(token || ""),
    "請先登入管理後台。",
    "AUTH",
  );
  const value = CacheService.getScriptCache().get("session:" + digest_(token));
  Core_.requireValue(value, "登入已逾時，請重新登入。", "AUTH");
  const session = JSON.parse(value);
  Core_.requireValue(
    session.expiresAt > Date.now() && isAdmin_(session.id),
    "登入已失效或管理權限已移除。",
    "AUTH",
  );
  return session;
}
