/* ============================================================
   Server production — phục vụ bản build (dist/) + API lưu file.
   Chạy: npm run build && npm start
   Docker sẽ dùng file này làm entrypoint.
   ============================================================ */

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { createKvStore, kvMiddleware, DEFAULT_DATA_FILE } from "./kvStore.js";

const PORT = Number(process.env.PORT) || 3100;
const DIST_DIR = resolve(process.cwd(), "dist");
const DATA_FILE = process.env.DATA_FILE
  ? resolve(process.env.DATA_FILE)
  : DEFAULT_DATA_FILE;

const store = createKvStore(DATA_FILE);
const kv = kvMiddleware(store);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function serveStatic(req, res) {
  // Chặn path traversal, chuẩn hoá đường dẫn trong dist/
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST_DIR, safePath);

  try {
    let body = await readFile(filePath);
    let ext = extname(filePath);
    if (ext === "" ) {
      // thư mục -> index.html
      filePath = join(DIST_DIR, safePath, "index.html");
      body = await readFile(filePath);
      ext = ".html";
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.end(body);
  } catch {
    // SPA fallback -> index.html
    try {
      const body = await readFile(join(DIST_DIR, "index.html"));
      res.statusCode = 200;
      res.setHeader("Content-Type", MIME[".html"]);
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("Not found — chưa có bản build? Chạy `npm run build` trước.");
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/kv/")) {
    // next=null: middleware tự trả 404 nếu không khớp
    kv(req, res, null);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Xưởng Viết Sách đang chạy: http://localhost:${PORT}`);
  console.log(`Dữ liệu lưu tại: ${DATA_FILE}`);
});
