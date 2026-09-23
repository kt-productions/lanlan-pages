import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { processArtwork, run } from "../scripts/lib/artwork-media.mjs";
import { readArtworkCatalog, sha256 } from "../scripts/lib/artworks.mjs";

test("實際轉檔 PNG、JPG、GIF、MP4，原檔位元組不變、衍生檔可解碼且清單可重建", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lanlan-media-test-"));
  const items = [];
  let index = 0;
  for (const [extension, type] of [["png", "image/png"], ["jpg", "image/jpeg"], ["gif", "image/gif"], ["mp4", "video/mp4"]]) {
    const file = path.join(directory, `fixture.${extension}`);
    await run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=64x48:rate=10",
      ...(extension === "mp4" || extension === "gif" ? ["-t", "0.4"] : ["-frames:v", "1"]), file]);
    const bytes = await readFile(file);
    const id = `chibi-${++index}`;
    const media = await processArtwork(bytes, { name: `fixture.${extension}`, type, size: bytes.length, sha256: sha256(bytes) }, id, directory);
    assert.deepEqual(await readFile(path.join(directory, "public", media.src)), bytes);
    assert.equal(media.type, extension === "mp4" ? "video" : "image");
    assert.equal(media.animated, extension === "gif");
    for (const asset of media.assets) {
      const metadata = JSON.parse(await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_streams", "-of", "json", path.join(directory, "public", asset.path)]));
      assert.ok(metadata.streams.some(stream => stream.width > 0 && stream.height > 0));
    }
    items.push({ id, category: "chibi", title: "虛構測試", alt: "", description: "", revision: 1, deleted: false, media });
  }
  await mkdir(path.join(directory, "content"));
  await writeFile(path.join(directory, "content/artworks.json"), JSON.stringify({ version: 1, items }));
  const catalog = await readArtworkCatalog([], new Map(), directory);
  assert.equal(catalog.works.length, 5);
  const corrupted = catalog.manifest.items[0].media.source.path;
  await writeFile(path.join(directory, "public", corrupted), "損壞的原檔");
  await assert.rejects(readArtworkCatalog([], new Map(), directory), /完整性/);
});
