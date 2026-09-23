/** 機器端與管理登入分離；簽章涵蓋站點、操作、時間與完整負載。 */
function artworkWorker_(envelope) {
  const config = artworkConfig_();
  const secret = setting_("ARTWORK_WORKER_SECRET");
  Core_.requireValue(secret.length >= 32 && typeof envelope.body === "string" && envelope.body.length < 35000 &&
    Number.isInteger(envelope.timestamp) && Math.abs(Date.now() - envelope.timestamp) <= 300000 &&
    /^[a-f0-9-]{36}$/.test(envelope.nonce), "作品工作授權不正確。", "FORBIDDEN");
  const signed = envelope.timestamp + "." + envelope.nonce + "." + envelope.body;
  const expected = Utilities.computeHmacSha256Signature(signed, secret).map(function (byte) {
    return (byte & 255).toString(16).padStart(2, "0");
  }).join("");
  Core_.requireValue(equal_(expected, envelope.signature), "作品工作授權不正確。", "FORBIDDEN");
  const request = JSON.parse(envelope.body);
  Core_.requireValue(request.siteId === config.site, "作品站點不符。", "FORBIDDEN");
  return lock_(function () {
    // 重複傳輸的副作用由工作狀態與租約去重，不把可能提前失效的 Cache 當工作佇列。
    const props = PropertiesService.getScriptProperties();
    const lease = JSON.parse(props.getProperty("ARTWORK_LEASE") || "null");
    if (request.action === "claim") {
      Core_.requireValue(typeof request.owner === "string" && /^\d+:\d+$/.test(request.owner), "工作執行識別不正確。");
      if (lease && lease.until > Date.now()) return { job: null, busy: true };
      const job = artworkJobs_().find(function (item) {
        return item.siteId === config.site && (["queued", "processing", "stored"].includes(item.state) || item.retryRequested);
      });
      if (!job) return { job: null };
      const next = { operationId: job.operationId, leaseId: randomKey_(), owner: request.owner, until: Date.now() + 600000 };
      props.setProperty("ARTWORK_LEASE", JSON.stringify(next));
      job.state = job.commitSha ? "stored" : "processing";
      job.retryRequested = false;
      job.error = "";
      writeArtworkJob_(job);
      return { job: Object.assign(artworkPublicJob_(job), { siteId: job.siteId, publicConfirmed: job.publicConfirmed,
        backupConfirmed: job.backupConfirmed }), leaseId: next.leaseId };
    }
    if (request.action === "deployed") {
      Core_.requireValue(/^[a-f0-9]{40}$/.test(request.commitSha), "部署版本不正確。");
      const branch = artworkGitHub_("git/ref/heads/production");
      Core_.requireValue(branch.object.sha === request.commitSha, "此部署已被較新版本取代。", "CONFLICT");
      const manifest = artworkManifest_(request.commitSha);
      const jobs = artworkJobs_().filter(function (item) { return item.siteId === config.site && item.commitSha && ["stored", "promoted", "failed"].includes(item.state); });
      jobs.forEach(function (job) {
        const comparison = artworkGitHub_("compare/" + job.commitSha + "..." + request.commitSha);
        if (!["ahead", "identical"].includes(comparison.status)) return;
        job.state = manifest.items.some(function (item) { return item.operationId === job.operationId; }) ? "published" : "superseded";
        job.updatedAt = new Date().toISOString();
        writeArtworkJob_(job);
      });
      props.setProperty("ARTWORK_LAST_DEPLOYED_SHA", request.commitSha);
      return { published: true };
    }
    Core_.requireValue(lease && lease.until > Date.now() && lease.operationId === request.operationId &&
      equal_(lease.leaseId, request.leaseId), "工作租約已失效，請由新的工作接續。", "CONFLICT");
    const job = artworkJob_(lease.operationId);
    lease.until = Date.now() + 600000;
    props.setProperty("ARTWORK_LEASE", JSON.stringify(lease));
    switch (request.action) {
      case "heartbeat": return { active: true };
      case "download": return artworkChunk_(job, request.offset);
      case "stored":
        verifyArtworkCommit_(job, request.commitSha);
        job.commitSha = request.commitSha;
        job.state = "stored";
        job.updatedAt = new Date().toISOString();
        writeArtworkJob_(job);
        return artworkPublicJob_(job);
      case "cleanup":
        Core_.requireValue(job.commitSha && ["stored", "promoted", "published"].includes(job.state) &&
          (!job.file || (job.publicConfirmed && job.backupConfirmed)), "尚未確認遠端原檔及備份，不可清理。", "CONFLICT");
        if (job.file && job.cleanup !== "cleaned") {
          verifyArtworkCommit_(job, job.commitSha);
          deleteArtworkStaging_(job);
        }
        return artworkPublicJob_(job);
      case "promoted": {
        Core_.requireValue(job.commitSha, "作品尚未保存。", "CONFLICT");
        const branch = artworkGitHub_("git/ref/heads/production");
        const comparison = artworkGitHub_("compare/" + job.commitSha + "..." + branch.object.sha);
        Core_.requireValue(["ahead", "identical"].includes(comparison.status), "production 尚未同步此版本。", "CONFLICT");
        if (job.state !== "published") job.state = "promoted";
        if (props.getProperty("ARTWORK_LAST_DEPLOYED_SHA") === branch.object.sha) {
          const manifest = artworkManifest_(branch.object.sha);
          job.state = manifest.items.some(function (item) { return item.operationId === job.operationId; }) ? "published" : "superseded";
        }
        writeArtworkJob_(job);
        props.deleteProperty("ARTWORK_LEASE");
        return artworkPublicJob_(job);
      }
      case "failed":
        job.state = "failed";
        // 不把 runner 例外、網址或憑證回寫到可見訊息。
        job.error = "作品更新未完成，請檢查 Actions 執行結果後重試。";
        writeArtworkJob_(job);
        props.deleteProperty("ARTWORK_LEASE");
        return artworkPublicJob_(job);
      default: throw new Core_.OrderError("NOT_FOUND", "不支援這個作品工作操作。");
    }
  });
}
