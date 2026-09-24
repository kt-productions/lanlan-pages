import {
  ARTWORK_CATEGORIES,
  ARTWORK_STATES,
  artworkFields,
  artworkFile,
  compareArtworkOrder,
} from "./contract.js";

export function setupArtworkAdmin({ api, getToken, report }) {
  const $ = (id) => document.getElementById(id);
  const panel = $("artwork-panel");
  const dialog = $("artwork-dialog");
  const form = $("artwork-form");
  const fields = form.elements;
  let works = [];
  let previewBase = "../";
  let jobs = [];
  let selected;
  let draft;
  let operationId;
  let file;
  let fileInfo;
  let objectUrl;
  let busy = false;
  let changed = false;
  let generation = 0;
  let timer;
  let action = "upsert";
  let trigger;

  const request = (name, payload) => api(`admin.artworks.${name}`, payload, getToken());
  const jobState = (job) =>
    job.action === "delete" && job.state === "published"
      ? "已下架"
      : ARTWORK_STATES[job.state] || job.state;
  function message(text) {
    $(dialog.open ? "artwork-editor-status" : "artwork-status").textContent = text;
  }
  function clearPreview() {
    $("artwork-preview-media").querySelector("video")?.pause();
    $("artwork-preview-media").replaceChildren();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  function preview(url, type, title) {
    const host = $("artwork-preview-media");
    const element = document.createElement(
      type === "video/mp4" || type === "video" ? "video" : "img",
    );
    if (element.tagName === "VIDEO") {
      element.controls = true;
      element.playsInline = true;
      element.preload = "metadata";
    } else element.alt = title || "作品預覽";
    element.src = url;
    element.addEventListener("error", () => message("預覽無法載入，請確認檔案或稍後重試。"));
    host.replaceChildren(element);
  }
  function setBusy(value) {
    busy = value;
    dialog.setAttribute("aria-busy", String(value));
    for (const button of dialog.querySelectorAll("button")) button.disabled = value;
    $("artwork-fields").disabled =
      value || Boolean(draft && draft.state !== "draft") || action === "delete";
    fields.category.disabled = value || Boolean(selected || draft);
    fields.file.disabled = value || Boolean(draft?.uploaded);
  }
  async function task(callback) {
    if (busy) return;
    const epoch = generation;
    setBusy(true);
    try {
      await callback();
    } catch (error) {
      if (epoch !== generation) return;
      if (["AUTH", "FORBIDDEN", "SESSION_CHANGED"].includes(error.code)) report(error);
      else message(error.message || "作品操作未完成，請保留此頁重試。");
    } finally {
      if (epoch === generation) setBusy(false);
    }
  }
  function render() {
    const query = $("artwork-search").value.trim().toLocaleLowerCase();
    const category = $("artwork-category").value;
    const visible = works.filter(
      (work) =>
        (!category || category === work.category) &&
        (!query || work.title.toLocaleLowerCase().includes(query)),
    );
    $("artwork-list").replaceChildren(
      ...visible.map((work) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "artwork-admin-card";
        const image = document.createElement("img");
        image.alt = "";
        image.loading = "lazy";
        image.src = previewBase + work.poster;
        const title = document.createElement("strong");
        title.textContent = work.title;
        const label = document.createElement("span");
        label.textContent = ARTWORK_CATEGORIES[work.category];
        button.append(image, title, label);
        button.addEventListener("click", () => open(work, null, button));
        return button;
      }),
    );
    const recent = new Set(jobs.slice(-50));
    const visibleJobs = jobs.filter((job) => {
      const pendingCleanup = job.file && job.cleanup === "pending";
      if (job.state === "cancelled" && !pendingCleanup) return false;
      return (
        recent.has(job) ||
        pendingCleanup ||
        !["published", "superseded", "cancelled"].includes(job.state)
      );
    });
    $("artwork-jobs").replaceChildren(
      ...visibleJobs.reverse().map((job) => {
        const button = document.createElement("button");
        button.className = "artwork-job button";
        button.type = "button";
        button.textContent = `${job.work.title} · ${jobState(job)}${job.cleanup === "pending" && (job.commitSha || job.state === "cancelled") ? " · 暫存待清理" : ""}`;
        button.addEventListener("click", () =>
          open(
            works.find((work) => work.id === job.work.id),
            job,
            button,
          ),
        );
        return button;
      }),
    );
    $("artwork-status").textContent =
      `共 ${visible.length} 件作品；清單包含已保存的版本，發布紀錄顯示網站更新狀態。`;
  }
  async function load() {
    const epoch = generation;
    const data = await request("list");
    if (epoch !== generation) return;
    // 舊版 GAS 也會帶回覆寫欄位；在此套用共用排序，與公開放映室保持一致。
    works = data.works.slice().sort(compareArtworkOrder);
    previewBase = data.previewBase || "../";
    jobs = data.jobs;
    $("artwork-new").disabled = false;
    render();
    clearTimeout(timer);
    if (
      !panel.hidden &&
      jobs.some((job) => ["queued", "processing", "stored", "promoted"].includes(job.state))
    ) {
      const poll = () => {
        if (panel.hidden || !getToken()) return;
        if (dialog.open || busy) timer = setTimeout(poll, 20000);
        else task(load);
      };
      timer = setTimeout(poll, 20000);
    }
  }
  function open(work, job, source) {
    if (busy) return;
    trigger = source || $("artwork-new");
    selected = work;
    draft = job;
    operationId = job?.operationId || crypto.randomUUID();
    action = job?.action || "upsert";
    file = null;
    fileInfo = job?.file || null;
    changed = false;
    form.reset();
    clearPreview();
    const item = job?.work || work;
    for (const key of ["title", "category", "alt", "description"])
      fields[key].value = item?.[key] || (key === "category" ? "chibi" : "");
    if (work) preview(previewBase + (work.playbackSrc || work.src), work.type, work.title);
    $("artwork-preview-load").hidden = !job?.uploaded || job.cleanup === "cleaned";
    $("artwork-editor-heading").textContent =
      action === "delete" ? "下架作品" : work || job ? "編輯作品" : "新增作品";
    $("artwork-editor-status").textContent = job
      ? `${jobState(job)}。${job.error || ""}`
      : "草稿不會公開；發布後才會加入公開倉庫及網站。";
    $("artwork-save").hidden = Boolean(job && job.state !== "draft");
    $("artwork-publish").hidden = Boolean(
      job && ["processing", "published", "cancelled", "superseded"].includes(job.state),
    );
    $("artwork-publish").textContent =
      job && job.state !== "draft" ? "重試發布" : action === "delete" ? "確認下架" : "儲存並發布";
    $("artwork-delete").hidden = !work || Boolean(job);
    $("artwork-discard").hidden =
      !job || !["draft", "failed", "cancelled"].includes(job.state) || Boolean(job.commitSha);
    $("artwork-discard").textContent = job?.state === "cancelled" ? "重試清理草稿" : "放棄草稿";
    $("artwork-cleanup").hidden = !job?.commitSha || job.cleanup !== "pending";
    $("artwork-delete-hint").hidden = action !== "delete";
    $("artwork-discard-confirm").hidden = true;
    $("artwork-file-hint").textContent = job?.file
      ? `已保存：${job.file.name}。這份草稿的檔案已固定；需要換檔可放棄草稿後重新編輯。`
      : "PNG、JPG、GIF 或 MP4，每檔最多 10 MiB。GIF 最多 15 秒、MP4 最多 120 秒。編輯文字不必重傳。";
    setBusy(false);
    dialog.showModal();
    dialog.querySelector(".dialog-body").scrollTop = 0;
  }
  function close(force = false) {
    if (busy && !force) return;
    if (changed && !force) {
      message("尚有未儲存內容，請先儲存草稿，或按「放棄草稿」確認放棄。");
      $("artwork-discard").hidden = false;
      return;
    }
    dialog.close();
    clearPreview();
    trigger?.focus();
  }
  async function save() {
    const work = artworkFields(
      Object.fromEntries(
        ["title", "category", "alt", "description"].map((key) => [key, fields[key].value]),
      ),
    );
    if (!selected && !fileInfo) throw new Error("請選擇作品檔案。");
    const saved = await request("save", {
      operationId,
      revision: draft?.revision || 0,
      id: selected?.id || "",
      expectedRevision: draft?.expectedRevision ?? selected?.revision ?? 0,
      action,
      work,
      file: action === "delete" ? null : fileInfo,
    });
    draft = saved;
    if (fileInfo && !saved.uploaded) {
      if (!file) throw new Error("請重新選擇原檔完成上傳。");
      message("正在上傳作品，請保持此頁開啟……");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      draft = await request("upload", { operationId, data: btoa(binary) });
    }
    changed = false;
    $("artwork-discard").hidden = false;
    return draft;
  }
  form.addEventListener("input", () => {
    changed = true;
  });
  fields.file.addEventListener("change", () =>
    task(async () => {
      const epoch = generation;
      file = fields.file.files[0];
      fileInfo = draft?.file || null;
      clearPreview();
      if (!file) return;
      artworkFile({ name: file.name, size: file.size, type: file.type, sha256: "0".repeat(64) });
      const bytes = await file.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      if (epoch !== generation) return;
      fileInfo = artworkFile({ name: file.name, size: file.size, type: file.type, sha256: hash });
      clearPreview();
      objectUrl = URL.createObjectURL(file);
      preview(objectUrl, file.type, fields.title.value);
      message("預覽已準備完成，儲存草稿後才會上傳。");
    }),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    task(async () => {
      await save();
      await load();
      message("草稿已保存，尚未公開。");
    });
  });
  $("artwork-publish").addEventListener("click", () =>
    task(async () => {
      if (!draft || draft.state === "draft") {
        await save();
      }
      // 使用者要求直接以發布按鈕送出；保留現有 GAS 的發布／暫存清理契約。
      const result = await request("publish", {
        operationId,
        revision: draft.revision,
        publicConfirmed: true,
        backupConfirmed: true,
      });
      changed = false;
      close(true);
      await load();
      message(
        result.dispatchPending
          ? "發布工作已保存，但 GitHub 尚未接收，請稍後從發布紀錄重試。"
          : "已送出發布，請從發布紀錄查看處理結果。",
      );
    }),
  );
  $("artwork-delete").addEventListener("click", () => {
    action = "delete";
    fileInfo = null;
    file = null;
    $("artwork-delete-hint").hidden = false;
    $("artwork-publish").textContent = "確認下架";
    $("artwork-editor-heading").textContent = "下架作品";
    changed = true;
    setBusy(false);
    message("請確認公開變更後按「確認下架」，網站會在部署完成後移除這件作品。");
  });
  $("artwork-preview-load").addEventListener("click", () =>
    task(async () => {
      const epoch = generation;
      const chunks = [];
      for (let offset = 0; offset < draft.file.size; offset += 262144) {
        const part = await request("preview", { operationId, offset });
        chunks.push(Uint8Array.from(atob(part.data), (character) => character.charCodeAt(0)));
      }
      const blob = new Blob(chunks, { type: draft.file.type });
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
      ]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      if (epoch !== generation) return;
      if (blob.size !== draft.file.size || hash !== draft.file.sha256)
        throw new Error("預覽完整性檢查失敗。");
      clearPreview();
      objectUrl = URL.createObjectURL(blob);
      preview(objectUrl, draft.file.type, draft.work.title);
    }),
  );
  $("artwork-discard").addEventListener("click", () => {
    $("artwork-discard-confirm").hidden = false;
  });
  $("artwork-cleanup").addEventListener("click", () =>
    task(async () => {
      await request("cleanup", { operationId });
      changed = false;
      close(true);
      await load();
      message("已核對原檔並清理暫存。");
    }),
  );
  $("artwork-discard-no").addEventListener("click", () => {
    $("artwork-discard-confirm").hidden = true;
  });
  $("artwork-discard-yes").addEventListener("click", () =>
    task(async () => {
      if (draft) await request("cancel", { operationId, confirmed: true });
      changed = false;
      close(true);
      await load();
    }),
  );
  $("artwork-close").addEventListener("click", () => close());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  $("artwork-new").addEventListener("click", () => open(null, null));
  $("artwork-refresh").addEventListener("click", () => task(load));
  $("artwork-search").addEventListener("input", render);
  $("artwork-category").addEventListener("change", render);
  window.addEventListener("beforeunload", (event) => {
    if (changed) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  return {
    activate() {
      panel.hidden = false;
      task(load);
    },
    clear() {
      generation++;
      clearTimeout(timer);
      busy = false;
      changed = false;
      close(true);
      panel.hidden = true;
      $("artwork-new").disabled = true;
      works = [];
      jobs = [];
      draft = null;
      selected = null;
      file = null;
      fileInfo = null;
      $("artwork-list").replaceChildren();
      $("artwork-jobs").replaceChildren();
      form.reset();
    },
  };
}
