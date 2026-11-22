import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = `http://127.0.0.1:${process.env.API_PORT || 8787}`

const apiProxy = {
  '/api/auth': { target: API_TARGET },
  '/api/wall': { target: API_TARGET },
  '/api/feedback': { target: API_TARGET },
  '/api/state': { target: API_TARGET },
  '/api/profile': { target: API_TARGET },
  '/api/ai': { target: API_TARGET },
  '/api/jw': { target: API_TARGET },
  '/api/chaoxing': { target: API_TARGET },
  '/api/library': { target: API_TARGET },
  '/api/admin': { target: API_TARGET },
  '/api/uploads': { target: API_TARGET },
  '/api/notifications': { target: API_TARGET },
  '/api/health': { target: API_TARGET },
  '/uploads': { target: API_TARGET },
}

// public/intro 是纯静态页：生产环境由 Node 静态服务按目录索引命中，
// 开发/预览环境需要显式把 /intro 与 /intro/ 指到 index.html，避免 SPA 回落。
function introStatic(): Plugin {
  const rewrite = (req: { url?: string }) => {
    if (!req.url) return
    const [path, query] = req.url.split('?')
    const suffix = query ? `?${query}` : ''
    if (path === '/intro' || path === '/intro/') req.url = `/intro/index.html${suffix}`
    if (path === '/wall' || path === '/wall/') req.url = `/wall/index.html${suffix}`
  }
  return {
    name: 'shishuo-intro-static',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req)
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), introStatic()],
  build: {
    rolldownOptions: {
      input: {
        main: 'index.html',
        admin: 'admin/index.html',
      },
    },
  },
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
})
