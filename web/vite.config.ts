import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Flask serves the API on :5000; in dev Vite proxies /api to it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://127.0.0.1:5000' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:5000' } },
})
