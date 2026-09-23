import { API_MAX_REQUEST_CHARS } from "./attachment-contract.js";

/** 核對 Html Service 的來源與 iframe 關係，不接受其他分頁偽造的完成訊息。 */
export function isBridgePeer(event, frameWindow, channel) {
  if (!/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin) ||
      event.data?.channel !== channel) return false;
  try {
    // GAS 在外層頁面下建立 sandboxFrame，再放入 userHtmlFrame。
    return Boolean(event.source &&
      (event.source === frameWindow || event.source.parent === frameWindow ||
       event.source.parent.parent === frameWindow));
  } catch {
    return false;
  }
}

/** 以官方 google.script.run 傳遞回應，避開 Content Service 的一次性重新導向。 */
export function createBridge(apiUrl, host = window, doc = document) {
  let connection;
  let dispose;
  const pending = new Map();

  function connect() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      const channel = [...host.crypto.getRandomValues(new Uint8Array(32))]
        .map(value => value.toString(16).padStart(2, "0")).join("");
      const frame = doc.createElement("iframe");
      frame.title = "委託服務連線";
      frame.hidden = true;
      frame.referrerPolicy = "no-referrer";
      let peer;
      let peerOrigin;
      const timer = host.setTimeout(() => {
        dispose();
        connection = undefined;
        reject(new Error("服務連線逾時"));
      }, 20000);
      const receive = event => {
        if (!isBridgePeer(event, frame.contentWindow, channel)) return;
        const message = event.data;
        if (message.type === "lanlan:ready" && !peer) {
          peer = event.source;
          peerOrigin = event.origin;
          host.clearTimeout(timer);
          resolve({ peer, peerOrigin, channel });
        } else if (message.type === "lanlan:response" && event.source === peer &&
                   event.origin === peerOrigin && typeof message.result === "string") {
          const task = pending.get(message.id);
          if (!task) return;
          pending.delete(message.id);
          host.clearTimeout(task.timer);
          try { task.resolve(JSON.parse(message.result)); }
          catch { task.reject(new Error("服務回應格式不正確")); }
        }
      };
      dispose = () => {
        host.clearTimeout(timer);
        host.removeEventListener("message", receive);
        frame.remove();
      };
      host.addEventListener("message", receive);
      const url = new URL(apiUrl);
      url.searchParams.set("bridge", channel);
      frame.src = url.href;
      doc.body.append(frame);
    });
    return connection;
  }

  return async request => {
    const { peer, peerOrigin, channel } = await connect();
    const text = JSON.stringify(request);
    if (text.length > (request.action === "orders.upload" ? API_MAX_REQUEST_CHARS : 40000)) throw new Error("請求內容過大");
    return new Promise((resolve, reject) => {
      const id = host.crypto.randomUUID();
      const timer = host.setTimeout(() => {
        pending.delete(id);
        // 已送出的修改可能已生效；不可自動換用另一通道重送。
        reject(new Error("服務回應逾時"));
      }, ["orders.upload", "orders.submit", "admin.attachment", "admin.retryNotification"].includes(request.action) ? 120000 : 45000);
      pending.set(id, { resolve, reject, timer });
      peer.postMessage({ type: "lanlan:request", channel, id, request: text }, peerOrigin);
    });
  };
}
