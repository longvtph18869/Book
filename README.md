# Xưởng Viết Sách (Gemini)

Trợ lý AI viết sách trọn quy trình. Dữ liệu **lưu vào file** `data/books.json`
(không dùng localStorage) qua một API key-value nhỏ.

## Cách chạy (local)
1. Tạo file `.env` từ mẫu:
   ```
   cp .env.example .env
   ```
   rồi điền `VITE_GEMINI_API_KEY=...` (key lấy tại https://aistudio.google.com/apikey)
2. `npm install`
3. `npm run dev` → mở http://localhost:5173

Khi chạy `npm run dev`, Vite phục vụ luôn API `/api/kv/*` (đọc/ghi `data/books.json`).

## Chạy như production (không cần Docker)
```
npm run build      # tạo thư mục dist/
npm start          # server Node phục vụ dist/ + API, mặc định cổng 3000
```

## Deploy bằng Docker
```
docker build -t book .
docker run -d -p 3000:3000 -v book-data:/app/data book
```
- Key được đọc từ `.env` lúc build (hoặc truyền `--build-arg VITE_GEMINI_API_KEY=xxx`).
- `-v book-data:/app/data` gắn volume để **giữ dữ liệu sách** qua các lần rebuild container.
- Đổi cổng: `-e PORT=8080 -p 8080:8080`.
- Đổi vị trí file dữ liệu: `-e DATA_FILE=/app/data/books.json`.

## Ghi chú bảo mật
- `.env` và `data/` đã bị `.gitignore` — **không** đẩy lên GitHub.
- Đây là app frontend gọi thẳng Gemini nên key vẫn bị nhúng vào bản build `dist`
  (người dùng cuối có thể trích ra). Chỉ dùng cá nhân, đừng chia sẻ link public rộng rãi.
  Nếu cần chặt chẽ hơn, hãy chuyển lời gọi Gemini sang backend.
