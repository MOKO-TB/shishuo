import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const api = spawn(process.execPath, [path.join(root, 'server', 'index.mjs'), '--api'], {
  cwd: root,
  env: { ...process.env, PORT: process.env.PORT || '8787' },
  stdio: 'inherit',
})
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], {
  cwd: root,
  env: { ...process.env, API_PORT: process.env.PORT || '8787' },
  stdio: 'inherit',
})

let closing = false
function shutdown(code = 0) {
  if (closing) return
  closing = true
  for (const child of [api, vite]) {
    if (child.exitCode === null && !child.killed) {
      try {
        child.kill('SIGTERM')
      } catch {
        // Ignore shutdown races.
      }
    }
  }
  setTimeout(() => process.exit(code), 250)
}

api.on('exit', (code) => {
  if (!closing && code !== 0) {
    console.error('[师说] API 服务退出，开发服务器即将关闭。')
    shutdown(code ?? 1)
  }
})
vite.on('exit', (code) => {
  if (!closing) shutdown(code ?? 0)
})
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
process.on('exit', () => {
  for (const child of [api, vite]) {
    if (child.exitCode === null && !child.killed) {
      try {
        child.kill('SIGTERM')
      } catch {
        // Ignore shutdown races.
      }
    }
  }
})
