# ---- Build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Key bundle vào frontend lúc build. Ưu tiên .env (nếu có trong context),
# hoặc truyền qua: docker build --build-arg VITE_GEMINI_API_KEY=xxx
ARG VITE_GEMINI_API_KEY
ARG VITE_GEMINI_MODEL
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV VITE_GEMINI_MODEL=$VITE_GEMINI_MODEL
RUN npm run build

# ---- Run ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
# Dữ liệu lưu ở /app/data (mount volume để giữ sau khi rebuild container)
ENV DATA_FILE=/app/data/books.json

# Chỉ copy thứ cần để chạy: server + bản build + package.json
COPY package*.json ./
COPY server ./server
COPY --from=build /app/dist ./dist
# Thư mục dữ liệu (mount volume vào đây để giữ dữ liệu). Server tự tạo file khi ghi.
RUN mkdir -p /app/data

EXPOSE 3100
CMD ["node", "server/index.js"]
