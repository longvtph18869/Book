/* ============================================================
   KV store lưu vào FILE JSON (thay cho localStorage)
   Dùng chung cho:
   - Vite dev server (npm run dev) qua plugin trong vite.config.js
   - Server production (server/index.js) khi deploy bằng Docker

   Dữ liệu nằm ở data/books.json (đổi được qua biến môi trường DATA_FILE).
   ============================================================ */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const DEFAULT_DATA_FILE = resolve(process.cwd(), "data", "books.json");

export function createKvStore(filePath = DEFAULT_DATA_FILE) {
  let cache = null;
  // Hàng đợi ghi để tránh 2 lần ghi đè lên nhau (ghi tuần tự).
  let writing = Promise.resolve();

  async function load() {
    if (cache) return cache;
    try {
      const raw = await readFile(filePath, "utf8");
      cache = JSON.parse(raw);
      if (!cache || typeof cache !== "object") cache = {};
    } catch {
      cache = {}; // file chưa tồn tại hoặc lỗi -> bắt đầu rỗng
    }
    return cache;
  }

  async function persist() {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(cache, null, 2), "utf8");
  }

  return {
    async get(key) {
      const data = await load();
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async set(key, value) {
      await load();
      cache[key] = value;
      writing = writing.then(persist);
      await writing;
    },
    async del(key) {
      await load();
      delete cache[key];
      writing = writing.then(persist);
      await writing;
    },
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function send(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(payload);
}

/* Middleware tương thích connect/express (req, res, next).
   Xử lý:
     GET    /api/kv/<key> -> { value: string | null }
     PUT    /api/kv/<key> (body = chuỗi) -> { ok: true }
     DELETE /api/kv/<key> -> { ok: true } */
export function kvMiddleware(store) {
  const PREFIX = "/api/kv/";
  return async (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(PREFIX)) {
      return next ? next() : send(res, 404, { error: "not found" });
    }
    const key = decodeURIComponent(url.pathname.slice(PREFIX.length));
    if (!key) return send(res, 400, { error: "thiếu key" });
    try {
      if (req.method === "GET") {
        send(res, 200, { value: await store.get(key) });
      } else if (req.method === "PUT" || req.method === "POST") {
        await store.set(key, await readBody(req));
        send(res, 200, { ok: true });
      } else if (req.method === "DELETE") {
        await store.del(key);
        send(res, 200, { ok: true });
      } else {
        send(res, 405, { error: "method not allowed" });
      }
    } catch (e) {
      console.error("[kv]", e);
      send(res, 500, { error: String(e?.message || e) });
    }
  };
}
