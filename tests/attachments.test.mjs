import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { backend, submission } from "./helpers/apps-script.mjs";
import { attachmentManifest } from "../src/features/orders/contract.js";
import { ATTACHMENT_MAX_BYTES } from "../src/features/orders/attachment-contract.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7WQAAAAASUVORK5CYII=",
  "base64",
);
function attachment(bytes = png, type = "image/png", name = "虛構測試.png") {
  return {
    name,
    type,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
function payload(count = 1) {
  return {
    requestId: randomUUID(),
    details: submission({ referenceUrl: "" }),
    attachments: Array.from({ length: count }, (_, index) =>
      attachment(png, "image/png", `測試${index}.png`),
    ),
  };
}
function upload(service, input) {
  input.attachments.forEach((_, index) => {
    const result = service.invoke("orders.upload", {
      ...input,
      index,
      data: png.toString("base64"),
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  });
}
function order(service) {
  return Object.fromEntries(service.rows[0].map((key, index) => [key, service.rows[1][index]]));
}
const response = (code, body) => ({
  getResponseCode: () => code,
  getContentText: () => JSON.stringify(body),
});

test("五個檔案可取代素材連結，私人檔案完整保存且匿名端無法讀取", () => {
  const service = backend();
  const input = payload(5);
  upload(service, input);
  assert.equal(service.rows.length, 1);
  assert.equal(service.files.size, 6);
  assert.equal(service.invoke("orders.submit", input).ok, true);
  assert.equal(service.rows.length, 2);
  const saved = order(service);
  assert.equal(saved.notificationStatus, "sent");
  assert.equal(JSON.parse(saved.detailsJson).attachments.length, 5);
  const groups = service.calls.filter((call) => call.url.endsWith("/sendMediaGroup"));
  assert.equal(groups.length, 1);
  const media = JSON.parse(groups[0].options.payload.media);
  assert.equal(media.length, 5);
  assert.equal(media.filter((item) => item.caption).length, 1);
  assert.equal(service.calls.filter((call) => call.url.endsWith("/sendPhoto")).length, 0);
  const read = { orderId: saved.orderId, index: 4, id: "ignored-untrusted-id" };
  assert.equal(service.invoke("admin.attachment", read).error.code, "AUTH");
  assert.equal(
    service.invoke("admin.attachment", read, service.session()).data.base64,
    png.toString("base64"),
  );
  assert.equal(
    service.invoke("admin.attachment", { ...read, index: 5 }, service.session()).ok,
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(service.invoke("progress.list")),
    /attachments|sha256|測試4|fixture-folder/,
  );
  assert.equal(service.properties.has("REFERENCE_UPLOAD_" + input.requestId), false);
});

test("第六個檔案、超過 10 MB、偽裝圖片、錯誤雜湊與缺少素材都遭拒絕", () => {
  const service = backend();
  assert.throws(() => attachmentManifest(payload(6).attachments), /5/);
  assert.equal(attachmentManifest([{ ...attachment(), size: ATTACHMENT_MAX_BYTES }]).length, 1);
  assert.throws(
    () => attachmentManifest([{ ...attachment(), size: ATTACHMENT_MAX_BYTES + 1 }]),
    /10 MB/,
  );
  assert.equal(
    attachmentManifest(Array(5).fill({ ...attachment(), size: 9 * 1024 * 1024 })).length,
    5,
  );
  assert.throws(
    () => attachmentManifest(Array(5).fill({ ...attachment(), size: 9 * 1024 * 1024 + 1 })),
    /45 MB/,
  );
  const input = payload();
  for (const change of [
    { data: Buffer.alloc(png.length).toString("base64") },
    { attachments: [{ ...attachment(), type: "image/jpeg" }] },
    { attachments: [{ ...attachment(), sha256: "0".repeat(64) }] },
    { index: 9 },
  ]) {
    assert.equal(
      service.invoke("orders.upload", {
        ...input,
        index: 0,
        data: png.toString("base64"),
        ...change,
      }).ok,
      false,
    );
  }
  assert.equal(service.invoke("orders.submit", { ...input, attachments: [] }).ok, false);
  assert.equal(service.files.size, 1);
  assert.equal(service.rows.length, 1);
});

test("Drive 回應中斷與 Sheet 寫入失敗後重試沿用檔案及訂單識別碼", () => {
  const service = backend();
  const input = payload(2);
  service.faults.driveResponse = true;
  assert.equal(
    service.invoke("orders.upload", { ...input, index: 0, data: png.toString("base64") }).ok,
    false,
  );
  assert.equal(service.files.size, 2);
  service.faults.driveResponse = false;
  upload(service, input);
  assert.equal(service.files.size, 3);
  service.faults.flush = true;
  assert.equal(service.invoke("orders.submit", input).ok, false);
  assert.equal(service.rows.length, 2);
  service.faults.flush = false;
  assert.equal(service.invoke("orders.submit", input).ok, true);
  assert.equal(service.rows.length, 2);
  assert.equal(service.files.size, 3);
});

test("上傳預留納入配額，暫停收件與未完成上傳不建立訂單", () => {
  const service = backend();
  const first = payload(2);
  assert.equal(
    service.invoke("orders.upload", { ...first, index: 0, data: png.toString("base64") }).ok,
    true,
  );
  assert.equal(service.invoke("orders.submit", first).error.code, "ATTACHMENT");
  service.properties.set("DAILY_ORDER_LIMIT", "1");
  assert.equal(
    service.invoke("orders.upload", { ...payload(), index: 0, data: png.toString("base64") }).error
      .code,
    "RATE_LIMIT",
  );
  upload(service, first);
  service.properties.set("ACCEPTING_ORDERS", "false");
  assert.equal(service.invoke("orders.submit", first).error.code, "CLOSED");
  assert.equal(service.rows.length, 1);
});

test("多人相簿部分失敗後只重試未送達者，送出期間不可重入", () => {
  const service = backend();
  service.properties.set("TELEGRAM_NOTIFY_USER_IDS", "987654,123456");
  const input = payload(3);
  upload(service, input);
  let count = 0;
  service.faults.telegramResult = (_, url, options) => {
    assert.equal(
      service.invoke(
        "admin.retryNotification",
        { orderId: order(service).orderId },
        service.session(),
      ).error.code,
      "BUSY",
    );
    if (url.endsWith("/sendMessage")) return response(200, { ok: true });
    count += 1;
    assert.ok(url.endsWith("/sendMediaGroup"));
    return response(count === 2 ? 500 : 200, {
      ok: count !== 2,
      result: JSON.parse(options.payload.media).map((_, index) => ({
        photo: [{ file_id: "fixture-" + index }],
        media_group_id: "fixture-group",
      })),
    });
  };
  service.invoke("orders.submit", input);
  assert.equal(count, 2);
  assert.equal(order(service).notificationStatus, "failed");
  service.faults.telegramResult = (_, url, options) => {
    count += 1;
    assert.ok(url.endsWith("/sendMediaGroup"));
    assert.ok(
      JSON.parse(options.payload.media).every((item) => !item.media.startsWith("attach://")),
    );
    return response(200, {
      ok: true,
      result: Array(3).fill({
        photo: [{ file_id: "fixture-file" }],
        media_group_id: "fixture-retry-group",
      }),
    });
  };
  assert.equal(
    service.invoke(
      "admin.retryNotification",
      { orderId: order(service).orderId },
      service.session(),
    ).data.status,
    "sent",
  );
  assert.equal(count, 3);
  assert.equal(service.invoke("orders.submit", input).ok, true);
  assert.equal(count, 3);
});

test("Telegram 明確拒絕圖片時改送原檔，管理員更新保留伺服器附件", () => {
  const service = backend();
  const input = payload();
  upload(service, input);
  service.faults.telegramResult = (_, url) =>
    response(url.endsWith("/sendPhoto") ? 400 : 200, { ok: !url.endsWith("/sendPhoto") });
  service.invoke("orders.submit", input);
  const saved = order(service);
  assert.equal(saved.notificationStatus, "sent");
  assert.equal(service.calls.filter((call) => call.url.endsWith("/sendDocument")).length, 1);
  const result = service.invoke(
    "admin.update",
    {
      orderId: saved.orderId,
      revision: 1,
      status: "queued",
      isRush: false,
      isOnHold: false,
      publicNote: "",
      adminNote: "",
      details: { ...input.details, attachments: [{ id: "forged" }] },
    },
    service.session(),
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.details.attachments[0].sha256, attachment().sha256);
  assert.notEqual(result.data.details.attachments[0].id, "forged");
});

test("一般檔案以不可執行內容保存並傳送文件；舊版訂單仍可編輯", () => {
  const service = backend();
  const bytes = Buffer.from("虛構測試檔案");
  const input = { ...payload(), attachments: [attachment(bytes, "application/zip", "測試.zip")] };
  assert.equal(
    service.invoke("orders.upload", { ...input, index: 0, data: bytes.toString("base64") }).ok,
    true,
  );
  service.invoke("orders.submit", input);
  assert.equal(
    JSON.parse(order(service).detailsJson).attachments[0].type,
    "application/octet-stream",
  );
  assert.equal(service.calls.filter((call) => call.url.endsWith("/sendDocument")).length, 1);
  const saved = order(service);
  const previous = { ...input.details, schemaVersion: 3, referenceUrl: "https://example.com/old" };
  service.rows[1][service.rows[0].indexOf("detailsJson")] = JSON.stringify(previous);
  assert.equal(
    service.invoke(
      "admin.update",
      {
        orderId: saved.orderId,
        revision: 1,
        status: "queued",
        isRush: false,
        isOnHold: false,
        publicNote: "",
        adminNote: "",
        details: previous,
      },
      service.session(),
    ).ok,
    true,
  );
});

test("既有第三版連結表單可重試同一回執，但不能使用新版附件協定", () => {
  const service = backend();
  const input = { requestId: randomUUID(), details: submission({ schemaVersion: 3 }) };
  const first = service.invoke("orders.submit", input);
  assert.equal(first.ok, true);
  assert.equal(JSON.parse(order(service).detailsJson).schemaVersion, 3);
  assert.equal(service.invoke("orders.submit", input).data.orderId, first.data.orderId);
  assert.equal(service.rows.length, 2);
  assert.equal(
    service.invoke("orders.upload", {
      ...input,
      attachments: [attachment()],
      index: 0,
      data: png.toString("base64"),
    }).error.code,
    "VERSION",
  );
});

test("相簿被明確拒絕時整組改送文件，成功結果保存同一群組，不拆成個別通知", () => {
  const service = backend();
  const input = payload(5);
  upload(service, input);
  let count = 0;
  service.faults.telegramResult = (_, url, options) => {
    if (url.endsWith("/sendMessage")) return response(200, { ok: true });
    count += 1;
    assert.ok(url.endsWith("/sendMediaGroup"));
    const media = JSON.parse(options.payload.media);
    assert.ok(media.every((item) => item.type === (count === 1 ? "photo" : "document")));
    return count === 1
      ? response(400, { ok: false })
      : response(200, {
          ok: true,
          result: media.map((_, index) => ({
            document: { file_id: "fixture-doc-" + index },
            media_group_id: "fixture-album",
          })),
        });
  };
  service.invoke("orders.submit", input);
  assert.equal(count, 2);
  const parts = JSON.parse(order(service).notificationRecipientsJson)[0].parts;
  assert.ok(parts.every((part) => part.status === "sent" && part.groupId === "fixture-album"));
});

test("舊版部分檔案已送達時，只把尚未送達圖片組成相簿", () => {
  const service = backend();
  const input = payload(3);
  upload(service, input);
  service.faults.telegram = true;
  service.invoke("orders.submit", input);
  const saved = order(service);
  const states = JSON.parse(saved.notificationRecipientsJson);
  states[0].parts[0] = {
    status: "sent",
    attempts: 1,
    media: { method: "sendPhoto", fileId: "previous-photo" },
  };
  service.rows[1][service.rows[0].indexOf("notificationRecipientsJson")] = JSON.stringify(states);
  service.faults.telegram = false;
  const start = service.calls.length;
  service.invoke("admin.retryNotification", { orderId: saved.orderId }, service.session());
  const groups = service.calls.slice(start).filter((call) => call.url.endsWith("/sendMediaGroup"));
  assert.equal(groups.length, 1);
  assert.deepEqual(
    JSON.parse(groups[0].options.payload.media).map((item) => item.media),
    ["attach://file_1", "attach://file_2"],
  );
  assert.equal(order(service).notificationStatus, "sent");
});

test("相簿成功回應缺少部分訊息時標示結果不明，不自行拆開重送", () => {
  const service = backend();
  const input = payload(3);
  upload(service, input);
  service.faults.telegramResult = () =>
    response(200, { ok: true, result: [{ photo: [{ file_id: "only-one" }] }] });
  service.invoke("orders.submit", input);
  assert.equal(order(service).notificationStatus, "unknown");
  assert.equal(service.calls.filter((call) => call.url.endsWith("/sendMediaGroup")).length, 1);
});
