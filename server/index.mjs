import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { createApiHandler } from './api.mjs'
import { demoAccountSummary, openDatabase, seedAdminAccount, seedDemoAccounts, WORKSPACE_ID } from './db.mjs'
import { loadConfig, ROOT_DIR } from './config.mjs'
import { recordAudit } from './audit.mjs'
import { campusReviewSummary } from './campus-review.mjs'

const config = loadConfig()
const apiOnly = process.argv.includes('--api')
const distDir = path.join(ROOT_DIR, 'dist')
const uploadsDir = config.uploadsDir
const db = openDatabase(config.dbPath)
const insertedDemoAccounts = seedDemoAccounts(db, config)
const adminSeed = seedAdminAccount(db, config)
if (adminSeed.created) {
  console.log(`[师说] 已创建独立管理员账号：${config.adminEmail}`)
}
const handleApi = createApiHandler({ db, config })

/** 每日校园内容复核提醒：有未核实/过期内容时，往审计写一条系统记录。 */
function checkCampusReview() {
  try {
    const row = db
      .prepare('SELECT data_json FROM workspaces WHERE id = ?')
      .get(WORKSPACE_ID)
    if (!row?.data_json) return
    const { summary } = campusReviewSummary(JSON.parse(row.data_json))
    if (summary.unverified + summary.overdue === 0) return
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const existing = db
      .prepare(
        "SELECT id FROM audit_log WHERE actions_json LIKE '%campus-review-due%' AND created_at >= ? LIMIT 1",
      )
      .get(dayStart.getTime())
    if (existing) return
    recordAudit(db, {
      user: { id: 'system', name: '系统', role: 'system' },
      action: 'campus-review-due',
      actions: ['campus-review-due'],
      summary: `校园内容复核：${summary.unverified} 条待核实、${summary.overdue} 条过期、${summary.soon} 条 14 天内到期`,
      courseIds: ['campus'],
    })
  } catch {
    // 提醒失败不能影响主服务。
  }
}

checkCampusReview()
const campusReviewTimer = setInterval(checkCampusReview, 6 * 60 * 60 * 1000)
campusReviewTimer.unref?.()

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
}

async function serveUpload(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.statusCode = 405
    res.end('Method not allowed')
    return
  }
  const name = pathname.slice('/uploads/'.length)
  if (!/^img_[a-f0-9]+\.(jpg|jpeg|png|webp)$/i.test(name)) {
    res.statusCode = 404
    res.end('Not found')
    return
  }
  const filePath = path.join(uploadsDir, name)
  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error('not-a-file')
    res.statusCode = 200
    res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    securityHeaders(res)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(filePath).pipe(res)
  } catch {
    res.statusCode = 404
    res.end('Not found')
  }
}

async function serveStatic(req, res, pathname) {
  if (apiOnly) {
    res.statusCode = 404
    res.end('Not found')
    return
  }
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.statusCode = 405
    res.end('Method not allowed')
    return
  }
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    res.statusCode = 400
    res.end('Bad request')
    return
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const target = path.resolve(distDir, relative)
  if (target !== distDir && !target.startsWith(`${distDir}${path.sep}`)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }
  let filePath = target
  try {
    const info = await stat(filePath)
    if (info.isDirectory()) filePath = path.join(filePath, 'index.html')
  } catch {
    // Missing assets should 404; only route-like paths fall back to the SPA entry.
    if (path.extname(pathname)) {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    filePath = path.join(distDir, 'index.html')
  }
  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error('not-a-file')
    res.statusCode = 200
    res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream')
    res.setHeader(
      'Cache-Control',
      filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    )
    securityHeaders(res)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(filePath).pipe(res)
  } catch {
    res.statusCode = 404
    res.end('Not found')
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const handled = await handleApi(req, res)
    if (handled === false && !res.writableEnded) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: { message: '接口不存在。' } }))
    }
    return
  }
  if (url.pathname.startsWith('/uploads/')) {
    await serveUpload(req, res, url.pathname)
    return
  }
  await serveStatic(req, res, url.pathname)
})

server.listen(config.port, config.host, () => {
  const base = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`
  console.log(`[师说] 服务已启动 ${apiOnly ? '(仅 API)' : base}`)
  console.log(`[师说] 数据库 ${config.dbPath}`)
  console.log(
    config.ai.configured
      ? `[师说] AI 网关已配置：${config.ai.model}（Key 只保存在服务端环境变量）`
      : '[师说] AI 网关未配置：低置信问题会直接转交老师（设置 AI_API_KEY 后启用）',
  )
  console.log(
    config.mail.smtpConfigured
      ? `[师说] 邮件已配置：${config.mail.host}:${config.mail.port}`
      : config.mail.devMode
        ? '[师说] 邮件开发模式：验证码打印到服务端日志，并显示在登录页'
        : '[师说] 邮件未配置：注册验证码和自助找回暂不可用',
  )
  if (!process.env.AUTH_SECRET) {
    console.warn('[师说] 未设置 AUTH_SECRET：验证码签名密钥为本次进程随机值，重启后旧验证码失效。')
  }
  if (insertedDemoAccounts.length > 0) {
    console.log('[师说] 已创建演示账号：')
    for (const account of demoAccountSummary(config)) {
      console.log(
        `  ${account.role === 'teacher' ? '教师' : '学生'}${account.isAdmin ? '(管理员)' : ''} ${account.email} / ${account.password}（${account.name}）`,
      )
    }
    console.log('  生产环境请设置 SHISHUO_DEMO_ACCOUNTS=0 关闭演示账号。')
  }
})

function shutdown(signal) {
  console.log(`[师说] 收到 ${signal}，正在关闭…`)
  server.close(() => {
    try {
      db.close()
    } catch {
      // Ignore close errors during shutdown.
    }
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 3000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
