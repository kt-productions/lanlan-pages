import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createHash, createHmac, randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { readCommission } from "../../scripts/lib/content.mjs";

export const config = await readCommission();
const source = await Promise.all(
  [
    "Forge.gs",
    "Core.gs",
    "Config.gs",
    "ArtworkCore.gs",
    "ArtworkBase.gs",
    "Auth.gs",
    "Orders.gs",
    "Attachments.gs",
    "DriveStorage.gs",
    "AttachmentNotifications.gs",
    "NotificationText.gs",
    "Import.gs",
    "Bridge.gs",
    "Artworks.gs",
    "ArtworkGitHub.gs",
    "ArtworkWorker.gs",
    "Web.gs",
  ].map(async (name) => [
    name,
    await readFile(new URL(`../../build/apps-script/${name}`, import.meta.url), "utf8"),
  ]),
);
// 測試工具位於 tests/helpers，因此部署產物從專案根目錄取用。

export function submission(overrides = {}) {
  return {
    schemaVersion: config.version,
    service: "animation",
    nickname: "虛構委託者",
    contact: { channel: "telegram", value: "@fictional_test" },
    referenceUrl: "https://example.com/reference",
    characterCount: 1,
    transition: false,
    commercial: false,
    background: true,
    rush: false,
    payment: "bank",
    allowLivestream: false,
    allowPortfolio: false,
    rulesReviewed: true,
    notes: "虛構測試需求",
    stickerIds: [],
    chibiPlan: null,
    ...overrides,
  };
}

export const signingKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...signingKeys.publicKey.export({ format: "jwk" }),
  kid: "fixture-key",
  alg: "RS256",
  use: "sig",
};
export function jwt(claims = {}, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [
    Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture-key", ...header })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        iss: "https://oauth.telegram.org",
        aud: "12345",
        sub: "different-subject",
        id: 987654,
        iat: now,
        exp: now + 3600,
        nonce: "fixture-nonce",
        ...claims,
      }),
    ).toString("base64url"),
  ];
  return [
    ...parts,
    sign("RSA-SHA256", Buffer.from(parts.join(".")), signingKeys.privateKey).toString("base64url"),
  ].join(".");
}

export function backend() {
  const rows = [];
  const cache = new Map();
  const properties = new Map(
    Object.entries({
      SPREADSHEET_ID: "fixture-sheet",
      ACCEPTING_ORDERS: "true",
      DAILY_ORDER_LIMIT: "50",
      ADMIN_TELEGRAM_IDS: "987654",
      TELEGRAM_CLIENT_ID: "12345",
      TELEGRAM_CLIENT_SECRET: "fixture-client-secret",
      SESSION_SECRET: "fixture-session-secret-not-for-production",
      WEB_APP_URL: "https://script.google.com/macros/s/fixture/exec",
      ADMIN_URL: "https://example.com/lanlan-pages/admin/",
      TELEGRAM_BOT_TOKEN: "fixture-bot-token",
      TELEGRAM_CHAT_ID: "987654",
      LANLAN_PAGES_DRIVE_FOLDER_ID: "fixture-lanlan-pages-folder",
      REFERENCE_FOLDER_ID: "fixture-folder",
    }),
  );
  const calls = [];
  const files = new Map([
    [
      "fixture-folder",
      {
        id: "fixture-folder",
        mimeType: "application/vnd.google-apps.folder",
        parents: ["fixture-lanlan-pages-folder"],
        appProperties: { lanlanReferenceStorage: "1" },
      },
    ],
  ]);
  const writes = [];
  const faults = { telegram: false, lock: false, write: false, token: null, maxColumns: 26 };
  const sheet = {
    getLastRow: () => rows.length,
    getMaxRows: () => 1000,
    insertRowsAfter: () => {},
    getMaxColumns: () => faults.maxColumns,
    insertColumnsAfter: (_, count) => {
      faults.maxColumns += count;
    },
    setFrozenRows: () => {},
    getRange(row, column, height, width) {
      if (column + width - 1 > faults.maxColumns) throw new Error("超出工作表欄數");
      return {
        getFormulas: () =>
          Array.from({ length: height }, () =>
            Array.from({ length: width }, () => faults.tailFormula || ""),
          ),
        getValues: () =>
          Array.from({ length: height }, (_, index) =>
            Array.from(
              { length: width },
              (_, position) => rows[row - 1 + index]?.[column - 1 + position] ?? "",
            ),
          ),
        setValues(values) {
          if (faults.write) throw new Error("模擬寫入失敗");
          writes.push(structuredClone(values));
          values.forEach((value, index) => {
            rows[row - 1 + index] ||= [];
            value.forEach((entry, position) => {
              rows[row - 1 + index][column - 1 + position] =
                typeof entry === "string" && entry.startsWith("'") ? entry.slice(1) : entry;
            });
          });
        },
      };
    },
  };
  const context = vm.createContext({
    Session: {
      getActiveUser: () => ({ getEmail: () => "owner@example.com" }),
      getEffectiveUser: () => ({ getEmail: () => "owner@example.com" }),
    },
    Utilities: {
      getUuid: randomUUID,
      base64Encode: (value) => Buffer.from(value).toString("base64"),
      base64EncodeWebSafe: (value) => Buffer.from(value).toString("base64url"),
      base64DecodeWebSafe: (value) => [...Buffer.from(value, "base64url")],
      base64Decode: (value) => [...Buffer.from(value, "base64")],
      computeDigest: (algorithm, text) => [
        ...createHash(algorithm)
          .update(typeof text === "string" ? text : Buffer.from(text))
          .digest(),
      ],
      computeHmacSha256Signature: (text, key) => [
        ...createHmac("sha256", key).update(text).digest(),
      ],
      DigestAlgorithm: { SHA_256: "sha256", MD5: "md5" },
      Charset: { UTF_8: "utf8" },
      newBlob: (value, type, name) => ({
        getDataAsString: () => Buffer.from(value).toString("utf8"),
        getBytes: () => [...Buffer.from(value)],
        getContentType: () => type,
        getName: () => name,
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => {
          const item = cache.get(key);
          return item && item.until > Date.now() ? item.value : null;
        },
        put: (key, value, seconds) => cache.set(key, { value, until: Date.now() + seconds * 1000 }),
        remove: (key) => cache.delete(key),
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => properties.get(key) || null,
        getProperties: () => Object.fromEntries(properties),
        setProperty: (key, value) => properties.set(key, value),
        deleteProperty: (key) => properties.delete(key),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => !faults.lock,
        releaseLock: () => {},
      }),
    },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: () => sheet,
        insertSheet: () => sheet,
      }),
      flush: () => {
        if (faults.flush) throw new Error("模擬寫入後回應失敗");
      },
    },
    UrlFetchApp: {
      fetch(url, options) {
        calls.push({ url, options });
        if (url.startsWith("https://www.googleapis.com/drive/v3/files/")) {
          const parsed = new URL(url);
          const file = files.get(parsed.pathname.split("/").at(-1));
          return {
            getResponseCode: () => (file ? 200 : 404),
            getContentText: () => JSON.stringify(file || {}),
            getBlob: () => context.Utilities.newBlob(file.bytes, file.mimeType, file.name),
          };
        }
        const telegram = /\/send(Message|Photo|Animation|Document|MediaGroup)$/.test(url);
        if (telegram && faults.onTelegram) faults.onTelegram();
        if (telegram && faults.telegram) throw new Error("模擬網路錯誤，不得回傳憑證");
        if (telegram && faults.telegramResult) {
          return faults.telegramResult(
            typeof options.payload === "string"
              ? JSON.parse(options.payload).chat_id
              : options.payload.chat_id,
            url,
            options,
          );
        }
        const body = url.endsWith("jwks.json")
          ? { keys: [jwk] }
          : url.endsWith("/token")
            ? { id_token: faults.token || jwt() }
            : {
                ok: true,
                result: url.endsWith("/sendMediaGroup")
                  ? JSON.parse(options.payload.media).map((item, index) => ({
                      media_group_id: "fixture-group",
                      [item.type]:
                        item.type === "photo"
                          ? [{ file_id: "fixture-photo-" + index }]
                          : { file_id: "fixture-document-" + index },
                    }))
                  : url.endsWith("/sendPhoto")
                    ? { photo: [{ file_id: "fixture-photo" }] }
                    : url.endsWith("/sendAnimation")
                      ? { animation: { file_id: "fixture-animation" } }
                      : { document: { file_id: "fixture-document" } },
              };
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify(body),
        };
      },
    },
    ScriptApp: { getOAuthToken: () => "fixture-drive-token" },
    Drive: {
      Files: {
        generateIds: () => ({ ids: [randomUUID()] }),
        create(metadata, blob) {
          if (faults.drive) throw new Error("模擬 Drive 失敗");
          const bytes = blob?.getBytes();
          const file = {
            ...metadata,
            id: metadata.id || randomUUID(),
            ...(bytes
              ? {
                  size: String(bytes.length),
                  bytes,
                  md5Checksum: createHash("md5").update(Buffer.from(bytes)).digest("hex"),
                }
              : {}),
          };
          files.set(file.id, file);
          if (faults.driveResponse) throw new Error("模擬 Drive 寫入後回應中斷");
          return file;
        },
      },
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (value) => ({
        value,
        setMimeType() {
          return this;
        },
      }),
    },
    HtmlService: { createHtmlOutput: (value) => value },
  });
  for (const [name, code] of source) vm.runInContext(code, context, { filename: name });
  context.setupOrders();
  const invoke = (action, payload = {}, token = "") =>
    JSON.parse(
      context.doPost({
        postData: {
          contents: JSON.stringify({ action, payload, token }),
        },
      }).value,
    );
  const session = () => {
    const token = "b".repeat(64);
    context.CacheService.getScriptCache().put(
      "session:" + context.digest_(token),
      JSON.stringify({ id: "987654", expiresAt: Date.now() + 3600000 }),
      3600,
    );
    return token;
  };
  return {
    context,
    rows,
    cache,
    properties,
    calls,
    files,
    writes,
    faults,
    invoke,
    session,
  };
}
