import test from "node:test";
import assert from "node:assert/strict";
import { hasFastStart } from "../scripts/lib/video-assets.mjs";

function box(type, data = Buffer.alloc(0)) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + data.length);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, data]);
}

test("MP4 索引需在影片資料前，不能把內容中的 moov 字串當成快速起播", () => {
  assert.equal(hasFastStart(Buffer.concat([box("ftyp"), box("moov"), box("mdat")])), true);
  assert.equal(hasFastStart(Buffer.concat([box("ftyp"), box("mdat"), box("moov")])), false);
  assert.equal(hasFastStart(box("free", Buffer.from("moov"))), false);
  assert.equal(hasFastStart(Buffer.from("moov")), false);
});

test("MP4 支援 64 位元 box 長度，並拒絕截斷及非法長度", () => {
  const extended = Buffer.alloc(16);
  extended.writeUInt32BE(1);
  extended.write("free", 4, "ascii");
  extended.writeBigUInt64BE(16n, 8);
  assert.equal(hasFastStart(Buffer.concat([extended, box("moov")])), true);
  assert.equal(hasFastStart(extended.subarray(0, 10)), false);
  const invalid = box("moov");
  invalid.writeUInt32BE(100);
  assert.equal(hasFastStart(invalid), false);
});
