import test from "node:test";
import assert from "node:assert/strict";
import { downloadArtwork } from "../scripts/lib/artwork-download.mjs";
import { ArtworkWorkerError, artworkFailureSummary } from "../scripts/lib/artwork-errors.mjs";
import { run } from "../scripts/lib/artwork-media.mjs";
import { sha256 } from "../scripts/lib/artworks.mjs";

const bytes = Buffer.alloc(262144 * 2 + 17, 42);
const file = { name: "fixture.mp4", type: "video/mp4", size: bytes.length, sha256: sha256(bytes) };
const partAt = (offset) => ({
  data: bytes.subarray(offset, offset + 262144).toString("base64"),
  size: file.size,
  sha256: file.sha256,
});

test("分段下載核對每塊及完整雜湊，保留不滿一塊的尾端位元組", async () => {
  const offsets = [];
  const phases = [];
  const result = await downloadArtwork(file, async (action, { offset }) => {
    assert.equal(action, "download");
    offsets.push(offset);
    return partAt(offset);
  }, (phase) => phases.push(phase));
  assert.deepEqual(result, bytes);
  assert.deepEqual(offsets, [0, 262144, 524288]);
  assert.deepEqual(phases, ["下載原檔區塊 1/3", "下載原檔區塊 2/3", "下載原檔區塊 3/3", "核對原檔完整性"]);
});

test("版本、區塊截斷及非法 base64 在出錯區塊立即停止，不繼續下載", async () => {
  for (const [changes, code] of [
    [{ size: file.size + 1 }, "DOWNLOAD_VERSION"],
    [{ sha256: "0".repeat(64) }, "DOWNLOAD_VERSION"],
    [{ data: partAt(0).data.slice(4) }, "DOWNLOAD_CHUNK"],
    [{ data: "!" + partAt(0).data.slice(1) }, "DOWNLOAD_CHUNK"],
    [{ data: null }, "DOWNLOAD_CHUNK"],
  ]) {
    let calls = 0;
    await assert.rejects(downloadArtwork(file, async () => {
      calls++;
      return { ...partAt(0), ...changes };
    }), (error) => error.code === code);
    assert.equal(calls, 1);
  }
});

test("區塊大小正確但內容損壞仍拒絕，不把服務回應的雜湊當作下載驗證", async () => {
  await assert.rejects(downloadArtwork(file, async (_, { offset }) => {
    const part = partAt(offset);
    if (offset === 0) part.data = Buffer.alloc(262144, 43).toString("base64");
    return part;
  }), (error) => error.code === "DOWNLOAD_HASH");
});

test("下載服務失敗保留區塊階段，公開摘要不洩漏後端訊息或結果票證", async () => {
  let phase;
  const secret = "https://private.example/?token=private-token";
  await assert.rejects(downloadArtwork(file, async () => {
    throw new Error(secret);
  }, (next) => { phase = next; }), (error) => {
    assert.equal(phase, "下載原檔區塊 1/3");
    assert.match(artworkFailureSummary(error), /UNKNOWN/);
    assert.ok(!artworkFailureSummary(error).includes(secret));
    return true;
  });
  assert.match(artworkFailureSummary(new Error("作品區塊下載失敗。")), /DRIVE_DOWNLOAD/);
  const forged = new Error(secret);
  forged.code = "PROCESS_FAILED";
  assert.match(artworkFailureSummary(forged), /UNKNOWN/);
  const known = new ArtworkWorkerError("PROCESS_FAILED");
  known.message = secret;
  known.cause = new Error(secret);
  assert.equal(artworkFailureSummary(known), "[PROCESS_FAILED] 子程序執行失敗。");
});

test("子程序錯誤及逾時可分類，公開摘要不輸出 stderr", async () => {
  await assert.rejects(run(process.execPath, ["-e", "console.error('private-media-path'); process.exit(2)"]), (error) => {
    assert.equal(artworkFailureSummary(error), "[PROCESS_FAILED] 子程序執行失敗。");
    assert.match(error.cause.message, /private-media-path/);
    return true;
  });
  await assert.rejects(run(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeout: 100 }),
    (error) => error.code === "PROCESS_TIMEOUT");
});
