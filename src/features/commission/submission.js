import { pageApi, integrationConfig } from "../orders/api.js";
import { attachmentManifest } from "../orders/contract.js";

function encodedFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    reader.onerror = () => reject(new Error("無法讀取參考檔案，請保留此頁並重試。"));
    reader.readAsDataURL(file);
  });
}

/** 未確認的送件保留同一份快照與識別碼；逾時後只重試，不讓編輯內容造成第二筆訂單。 */
export function setupSubmission(app, form, getSnapshot, showError, clearError) {
  const { apiUrl } = integrationConfig();
  const request = pageApi(apiUrl);
  const button = document.querySelector("#commission-submit");
  const status = document.querySelector("#submit-status");
  const link = document.querySelector("#progress-link");
  const referenceUrl = document.querySelector("#commission-reference-url");
  const states = new Map();
  let pending = null;
  let accepted = false;
  let sending = false;
  let files = [];
  let uploaded = 0;
  referenceUrl.required = false;
  document.querySelector("#submission-mode").textContent = apiUrl
    ? "填寫需求・確認後送出"
    : "服務尚未開放・可先下載草稿";
  document.querySelector("#review-notice").textContent = apiUrl
    ? "收件不代表確認報價、付款或排定交期，請等候繪師聯絡。"
    : "目前服務尚未開放，可下載草稿；內容不會送出或加入排單。";

  function freeze() {
    if (states.size) return;
    for (const input of app.querySelectorAll("input,select,textarea,button")) {
      if (input === button || input.id === "commission-download") continue;
      states.set(input, input.disabled);
      input.disabled = true;
    }
  }
  function restore() {
    for (const [control, disabled] of states) control.disabled = disabled;
    states.clear();
  }
  button.addEventListener("click", async () => {
    if (sending || accepted || !getSnapshot()) return;
    clearError();
    if (!pending) {
      files = [...document.querySelector("#commission-reference").files];
      uploaded = 0;
      pending = { requestId: crypto.randomUUID(), details: getSnapshot(),
        website: new FormData(form).get("website") || "" };
    }
    freeze();
    sending = true;
    button.disabled = true;
    status.textContent = "正在送出，請保留此頁……";
    try {
      if (!pending.attachments) {
        const manifest = [];
        for (const file of files) {
          status.textContent = `正在準備參考檔案 ${manifest.length + 1}／${files.length}……`;
          const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
          manifest.push({ name: file.name, type: file.type || "application/octet-stream", size: file.size,
            sha256: [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("") });
        }
        pending.attachments = attachmentManifest(manifest);
      }
      for (; uploaded < files.length; uploaded += 1) {
        status.textContent = `正在上傳參考檔案 ${uploaded + 1}／${files.length}，請保留此頁……`;
        const result = await request("orders.upload", { ...pending, index: uploaded, data: await encodedFile(files[uploaded]) });
        if (result?.index !== uploaded || result.uploaded !== true) throw new Error("無法確認附件上傳結果，請重試送出。");
      }
      status.textContent = "檔案已準備完成，正在建立委託與傳送通知……";
      const receipt = await request("orders.submit", pending);
      if (!/^LL-[A-F0-9]{16}$/.test(receipt?.orderId))
        throw new Error("收件回執格式不正確。");
      accepted = true;
      status.textContent = `已收到委託，編號 ${receipt.orderId}。請保存編號，等候繪師確認需求與報價。`;
      button.textContent = "已收件";
      link.hidden = false;
      link.href = "../progress/";
      status.focus();
    } catch (error) {
      status.textContent = "";
      showError(error.message || "無法確認收件結果，請保留此頁並重試。");
      button.textContent = "重試送出";
      // 可確定未受理的錯誤才解鎖編輯；網路中斷或不明回應保留冪等重試。
      if (
        ["VALIDATION", "VERSION", "CLOSED", "RATE_LIMIT", "NOT_CONFIGURED"].includes(
          error.code,
        )
      ) {
        restore();
        pending = null;
        button.textContent = "送出委託";
      }
    } finally {
      sending = false;
      button.disabled = accepted;
    }
  });
  return {
    showStep(step) {
      button.hidden = step !== 2 || !apiUrl;
    },
  };
}
