import { ATTACHMENT_TYPES, ATTACHMENT_MAX_BYTES } from "./attachment-contract.js";
import { element } from "./presentation.js";

/** 只有管理員按下檢視才讀取附件；關閉視窗或登出即撤銷記憶體網址。 */
export function setupAttachments(container, api, getToken, onAuthError) {
  let generation = 0;
  let urls = [];
  function clear() {
    generation += 1;
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = [];
    container.replaceChildren();
    container.hidden = true;
  }
  function show(order) {
    clear();
    const files = order.details.attachments || [];
    if (!files.length) return;
    const active = generation;
    container.hidden = false;
    container.append(element("h3", `參考檔案（${files.length}）`));
    files.forEach((file, index) => {
      const item = element("div", undefined, "attachment-item");
      const button = element("button", "載入預覽／下載", "button button-secondary");
      button.type = "button";
      const status = element("p", "", "field-hint");
      status.setAttribute("role", "status");
      item.append(element("p", `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`), button, status);
      button.addEventListener("click", async () => {
        button.disabled = true;
        status.textContent = "正在讀取附件……";
        try {
          const result = await api("admin.attachment", { orderId: order.orderId, index }, getToken());
          if (active !== generation) return;
          if (result.size !== file.size || result.type !== file.type || result.size > ATTACHMENT_MAX_BYTES)
            throw new Error("附件回應不符，請重新載入訂單。");
          const bytes = Uint8Array.from(atob(result.base64), (value) => value.charCodeAt(0));
          if (bytes.length !== result.size) throw new Error("附件尚未完整下載，請重試。");
          const previewable = ATTACHMENT_TYPES.includes(result.type);
          const url = URL.createObjectURL(new Blob([bytes], { type: previewable ? result.type : "application/octet-stream" }));
          urls.push(url);
          if (previewable) {
            const img = element("img");
            img.src = url;
            img.alt = file.name;
            img.addEventListener("error", () => { img.hidden = true; status.textContent = "此圖片無法預覽，仍可下載原檔。"; });
            item.append(img);
          }
          const download = element("a", "下載原檔", "button button-secondary");
          download.href = url;
          download.download = file.name;
          item.append(download);
          button.hidden = true;
          status.textContent = "附件已載入。";
        } catch (error) {
          if (active !== generation) return;
          if (["AUTH", "FORBIDDEN"].includes(error.code)) onAuthError(error);
          else status.textContent = error.message || "附件讀取失敗，請重試。";
        } finally {
          if (active === generation) button.disabled = false;
        }
      });
      container.append(item);
    });
  }
  window.addEventListener("pagehide", clear);
  return { clear, show };
}
