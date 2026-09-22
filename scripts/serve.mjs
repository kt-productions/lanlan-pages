import http from "node:http";
import path from "node:path";
import { stat, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
if (!process.argv.includes("--dist")) {
  const build = spawnSync(
    process.execPath,
    [path.join(root, "scripts/build.mjs")],
    { stdio: "inherit" },
  );
  if (build.status !== 0) process.exit(build.status || 1);
}
const base = path.resolve(root, "dist");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};
http
  .createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://localhost");
      let pathname = decodeURIComponent(requestUrl.pathname);
      // 同時驗證 GitHub Pages 的專案子路徑，避免只在網域根目錄正常。
      if (pathname === "/lanlan-pages" || pathname.startsWith("/lanlan-pages/"))
        pathname = pathname.slice("/lanlan-pages".length);
      let target = path.resolve(base, "." + pathname);
      if (target !== base && !target.startsWith(base + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      let info = await stat(target);
      if (info.isDirectory()) {
        if (!requestUrl.pathname.endsWith("/")) {
          res.writeHead(301, {
            Location: requestUrl.pathname + "/" + requestUrl.search,
          }).end();
          return;
        }
        target = path.join(target, "index.html");
        info = await stat(target);
      }
      if (!info.isFile()) throw new Error("not found");
      const data = await readFile(target);
      res.setHeader(
        "Content-Type",
        types[path.extname(target)] || "application/octet-stream",
      );
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "no-cache");
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Math.min(
          range[2] ? Number(range[2]) : info.size - 1,
          info.size - 1,
        );
        if (start > end || start >= info.size) {
          res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
          return;
        }
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${info.size}`,
          "Content-Length": end - start + 1,
        });
        res.end(
          req.method === "HEAD" ? undefined : data.subarray(start, end + 1),
        );
      } else {
        res.writeHead(200, { "Content-Length": info.size });
        res.end(req.method === "HEAD" ? undefined : data);
      }
    } catch {
      res
        .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
        .end("找不到這個頁面");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`預覽：http://127.0.0.1:${port}/lanlan-pages/`),
  );
