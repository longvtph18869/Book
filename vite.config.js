import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createKvStore, kvMiddleware } from './server/kvStore.js'

// Plugin: cho phép npm run dev đọc/ghi vào data/books.json qua /api/kv/*
function booksApiPlugin() {
  return {
    name: 'books-file-api',
    configureServer(server) {
      const kv = kvMiddleware(createKvStore())
      server.middlewares.use(kv)
    },
    // để `vite preview` cũng dùng được API
    configurePreviewServer(server) {
      const kv = kvMiddleware(createKvStore())
      server.middlewares.use(kv)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), booksApiPlugin()],
})
