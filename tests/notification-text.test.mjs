import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { backend, submission, config } from "./helpers/apps-script.mjs";
import { formatPriceRange } from "../src/features/commission/pricing.js";

const response = (code = 200) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify({ ok: code === 200 }) });
const texts = (app) => app.calls.filter(call => call.url.endsWith("/sendMessage")).map(call => JSON.parse(call.options.payload));
const saved = (app) => Object.fromEntries(app.rows[0].map((key, index) => [key, app.rows[1][index]]));
function submit(app, details = submission()) {
  const input = { requestId: randomUUID(), details };
  const result = app.invoke("orders.submit", input);
  assert.equal(result.ok, true, JSON.stringify(result));
  return { input, orderId: result.data.orderId };
}

test("三類委託完整投影適用欄位，否與未詢問不同；預估沿用伺服器計價", () => {
  for (const service of ["animation", "chibi", "stickers"]) {
    const app = backend();
    const details = submission({ service, stickerIds: [33, 34, 35], chibiPlan: "animated",
      characterCount: 2, transition: true, commercial: true, background: false, rush: true,
      payment: "paypal", allowLivestream: false, allowPortfolio: true, estimatedPrice: { min: 1, max: 1 } });
    submit(app, details);
    const message = texts(app)[0];
    const clean = JSON.parse(saved(app).detailsJson);
    for (const part of [config.services[service].name, "暱稱：虛構委託者", "聯絡平台：Telegram",
      "聯絡方式：@fictional_test", "參考連結：https://example.com/reference", "可否當作品範例：是",
      "付款方式：PayPal", "已閱讀委託說明與製作流程：是", "計價明細：", "管理後台：https://example.com/lanlan-pages/admin/",
      formatPriceRange(clean.estimatedPrice.min, clean.estimatedPrice.max, clean.estimatedPrice.currency)]) {
      assert.ok(message.text.includes(part), service + ": " + part);
    }
    if (service === "chibi") {
      assert.match(message.text, /委託方案：插圖＋動畫/);
      assert.match(message.text, /可否直播繪製：此表單未詢問/);
      assert.match(message.text, /是否為商用：此表單未詢問/);
      assert.doesNotMatch(message.text, /加購轉場|背景與特效|特殊需求或想說的話/);
    } else {
      assert.match(message.text, /可否直播繪製：否/);
      assert.match(message.text, /是否為商用：是/);
      assert.match(message.text, /虛構測試需求/);
    }
    if (service === "stickers") {
      assert.match(message.text, /貼圖款式（3 款）：No.33、No.34、No.35/);
      assert.doesNotMatch(message.text, /角色人數|急件：/);
    } else {
      assert.match(message.text, /角色人數：雙人/);
      assert.match(message.text, /急件：是，需討論/);
    }
    if (service === "animation") {
      assert.match(message.text, /循環動畫加購轉場：加購/);
      assert.match(message.text, /背景與特效：單色／無背景/);
      assert.doesNotMatch(message.text, /NT\$/);
    }
    assert.equal(message.parse_mode, undefined);
    assert.equal(message.disable_web_page_preview, true);
    assert.equal(saved(app).notificationStatus, "sent");
  }
});

test("長網址、完整 48 款、4000 字需求與表情符號無截斷，逐段不超過 4096", () => {
  const app = backend();
  app.properties.set("TELEGRAM_NOTIFY_USER_IDS", Array.from({length: 20}, (_, i) => String(i + 1)).join(","));
  submit(app, submission({service: "stickers", stickerIds: config.stickerOptions.map(item => item.number),
    nickname: "暱".repeat(80), contact: {channel: "discord", value: "d".repeat(300)},
    referenceUrl: "https://example.com/" + "a".repeat(1980), notes: "😀".repeat(2000)}));
  const chunks = texts(app).filter(message => message.chat_id === "1").map(message => message.text);
  assert.ok(chunks.length > 1);
  for (const text of chunks) {
    assert.ok(text.length <= 4096);
    assert.ok(text.isWellFormed());
    assert.ok(text.includes(saved(app).orderId));
  }
  assert.equal(chunks.map(text => text.replace(/^委託內容 \d+\/\d+\n編號：[^\n]+\n\n/, "")).join(""),
    app.context.orderNotificationText_(saved(app)));
  assert.ok(saved(app).notificationRecipientsJson.length < 50000);
  assert.equal(saved(app).notificationStatus, "sent");
});

test("文字失敗只補未送段落，管理修改與通知名單變動不改寫已保存的文字快照", () => {
  const app = backend();
  let attempts = 0;
  app.faults.telegramResult = () => response(++attempts === 2 ? 403 : 200);
  const { orderId } = submit(app, submission({notes: "原需求".repeat(1300)}));
  const state = JSON.parse(saved(app).notificationRecipientsJson)[0];
  assert.ok(state.messageTexts.length > 1);
  assert.equal(state.textParts[0].status, "sent");
  assert.equal(saved(app).notificationStatus, "failed");
  const token = app.session();
  const order = app.invoke("admin.list", {}, token).data.orders[0];
  assert.equal(app.invoke("admin.update", {...order, details: {...order.details, notes: "管理員修改後"}}, token).ok, true);
  app.properties.set("TELEGRAM_NOTIFY_USER_IDS", "555");
  app.faults.telegramResult = null;
  const before = texts(app).length;
  assert.equal(app.invoke("admin.retryNotification", {orderId}, token).data.status, "sent");
  assert.deepEqual(texts(app).slice(before).map(message => message.text), state.messageTexts.slice(1));
  assert.ok(texts(app).every(message => message.chat_id === "987654"));
  assert.equal(JSON.parse(saved(app).detailsJson).notes, "管理員修改後");
  const completed = app.calls.length;
  app.invoke("admin.retryNotification", {orderId}, token);
  assert.equal(app.calls.length, completed);
});

test("文字第一段回應不明時保留 unknown，不因後續未送段落而自動重傳", () => {
  const app = backend();
  app.faults.telegram = true;
  const { input, orderId } = submit(app, submission({notes: "需求".repeat(2000)}));
  assert.equal(saved(app).notificationStatus, "unknown");
  assert.equal(texts(app).length, 1);
  app.invoke("orders.submit", input);
  assert.equal(texts(app).length, 1);
  app.faults.telegram = false;
  assert.equal(app.invoke("admin.retryNotification", {orderId}, app.session()).data.status, "sent");
});

test("文字與相簿獨立補送，五張圖片仍是一組且回執不重送已成功相簿", () => {
  const app = backend();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7WQAAAAASUVORK5CYII=", "base64");
  const input = {requestId: randomUUID(), details: submission({referenceUrl: ""}),
    attachments: Array.from({length:5}, (_, i) => ({name:`參考${i}.png`, type:"image/png", size:bytes.length,
      sha256:createHash("sha256").update(bytes).digest("hex")}))};
  for (let index = 0; index < 5; index++) assert.equal(app.invoke("orders.upload", {...input,index,data:bytes.toString("base64")}).ok, true);
  app.faults.telegramResult = (_, url, options) => url.endsWith("/sendMessage") ? response(403) : {
    getResponseCode: () => 200, getContentText: () => JSON.stringify({ok:true,result:JSON.parse(options.payload.media).map(() =>
      ({photo:[{file_id:"fixture-photo"}],media_group_id:"fixture-group"}))})};
  assert.equal(app.invoke("orders.submit", input).ok, true);
  assert.equal(saved(app).notificationStatus, "failed");
  assert.match(texts(app)[0].text, /參考檔案：5 個/);
  assert.match(texts(app)[0].text, /參考4.png/);
  app.faults.telegramResult = null;
  assert.equal(app.invoke("admin.retryNotification", {orderId:saved(app).orderId}, app.session()).data.status, "sent");
  const groups = app.calls.filter(call => call.url.endsWith("/sendMediaGroup"));
  assert.equal(groups.length, 1);
  const media = JSON.parse(groups[0].options.payload.media);
  assert.equal(media.length, 5);
  assert.equal(media.filter(item => item.caption).length, 1);
  assert.ok(media[0].caption.length <= 1024);
  assert.equal(texts(app).length, 2);
});

test("使用者 HTML 與 Markdown 原樣傳送，敏感管理欄位及通知快照不進入公開 API", () => {
  const app = backend();
  const {orderId} = submit(app, submission({nickname:"<b>虛構</b>", notes:"[範例](https://example.com) & <script>"}));
  const message = texts(app)[0];
  assert.match(message.text, /<b>虛構<\/b>/);
  assert.match(message.text, /\[範例\]\(https:\/\/example.com\) & <script>/);
  assert.equal(message.parse_mode, undefined);
  const order = {...saved(app), adminNote:"不可傳送的內部備註", notificationError:"私密錯誤"};
  assert.doesNotMatch(app.context.orderNotificationText_(order), /不可傳送|私密錯誤|fixture-bot|fixture-session/);
  const publicData = JSON.stringify(app.invoke("progress.list"));
  assert.ok(publicData.includes(orderId));
  assert.doesNotMatch(publicData, /fictional_test|messageTexts|textParts|example.com|<script>/);
});

test("舊版部分收件人已成功時不補寄，僅未成功者升級完整文字", () => {
  const app = backend();
  app.properties.set("TELEGRAM_NOTIFY_USER_IDS", "111,222");
  app.faults.telegram = true;
  const {orderId} = submit(app);
  const col = app.rows[0].indexOf("notificationRecipientsJson");
  app.rows[1][col] = JSON.stringify([{id:"111",status:"sent",attempts:1}, {id:"222",status:"failed",attempts:1}]);
  app.faults.telegram = false;
  const before = texts(app).length;
  assert.equal(app.invoke("admin.retryNotification", {orderId}, app.session()).data.status, "sent");
  assert.deepEqual(texts(app).slice(before).map(message => message.chat_id), ["222"]);
});
