import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { jwProxyPlugin } from './dev/jw-proxy.ts'

const API_TARGET = `http://127.0.0.1:${process.env.API_PORT || 8787}`

const apiProxy = {
  '/api/auth': { target: API_TARGET },
  '/api/state': { target: API_TARGET },
  '/api/profile': { target: API_TARGET },
  '/api/ai': { target: API_TARGET },
  '/api/admin': { target: API_TARGET },
  '/api/uploads': { target: API_TARGET },
  '/api/health': { target: API_TARGET },
  '/uploads': { target: API_TARGET },
}

export default defineConfig({
  plugins: [react(), jwProxyPlugin()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
})
