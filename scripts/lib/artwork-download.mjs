import { artworkFile } from "../../src/features/artworks/contract.js";
import { sha256 } from "./artworks.mjs";
import { ArtworkWorkerError } from "./artwork-errors.mjs";
import { setTimeout } from "node:timers/promises";

const chunkSize = 262144;

export async function downloadArtwork(file, call, progress = () => {}, wait = setTimeout) {
  artworkFile(file);
  const chunks = [];
  const total = Math.ceil(file.size / chunkSize);
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    progress(`下載原檔區塊 ${offset / chunkSize + 1}/${total}`);
    let part;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        part = await call("download", { offset });
        break;
      } catch (error) {
        if (error?.code !== "API_RESULT" || attempt === 2) throw error;
        await wait(2000 * (attempt + 1));
      }
    }
    if (part?.sha256 !== file.sha256 || part?.size !== file.size) {
      throw new ArtworkWorkerError("DOWNLOAD_VERSION");
    }
    // Buffer 的 base64 解碼會默默接受截斷或非法字元，必須逐塊核對後才接續。
    const expected = Math.min(chunkSize, file.size - offset);
    if (typeof part.data !== "string" || part.data.length !== 4 * Math.ceil(expected / 3)) {
      throw new ArtworkWorkerError("DOWNLOAD_CHUNK");
    }
    const bytes = Buffer.from(part.data, "base64");
    if (bytes.length !== expected || bytes.toString("base64") !== part.data) {
      throw new ArtworkWorkerError("DOWNLOAD_CHUNK");
    }
    chunks.push(bytes);
  }
  progress("核對原檔完整性");
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== file.size || sha256(bytes) !== file.sha256) {
    throw new ArtworkWorkerError("DOWNLOAD_HASH");
  }
  return bytes;
}
