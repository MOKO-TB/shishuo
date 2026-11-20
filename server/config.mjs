import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile() {
  const envPath = path.join(ROOT_DIR, '.env')
  if (!existsSync(envPath)) return
  try {
    process.loadEnvFile(envPath)
  } catch {
    // A malformed .env should not stop the server; defaults still apply.
  }
}

function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function loadConfig() {
  loadEnvFile()
  const production = process.env.NODE_ENV === 'production'
  const demoAccounts = process.env.SHISHUO_DEMO_ACCOUNTS !== '0'
  const aiBaseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const aiApiKey = process.env.AI_API_KEY || ''
  const smtpHost = process.env.SMTP_HOST || ''
  const smtpConfigured = Boolean(smtpHost && process.env.MAIL_FROM)
  return {
    production,
    host: process.env.HOST || '127.0.0.1',
    port: numberFromEnv('PORT', 8787),
    authSecret: process.env.AUTH_SECRET || randomBytes(32).toString('hex'),
    dbPath: process.env.SHISHUO_DB || path.join(ROOT_DIR, 'data', 'shishuo.db'),
    uploadsDir: process.env.SHISHUO_UPLOADS_DIR || path.join(ROOT_DIR, 'data', 'uploads'),
    librarySessionsDir:
      process.env.SHISHUO_LIBRARY_SESSION_DIR ||
      path.join(ROOT_DIR, 'data', 'library-sessions'),
    cookieSecure: process.env.COOKIE_SECURE === '1' || production,
    demoAccounts,
    demoStudentPassword: process.env.DEMO_STUDENT_PASSWORD || 'student123',
    demoTeacherPassword: process.env.DEMO_TEACHER_PASSWORD || 'teacher123',
    adminEmail: process.env.SHISHUO_ADMIN_EMAIL || 'admin@shishuo.local',
    adminPassword: process.env.SHISHUO_ADMIN_PASSWORD || 'admin123',
    adminName: '系统管理员',
    teacherInviteCode: process.env.TEACHER_INVITE_CODE || '',
    ai: {
      baseUrl: aiBaseUrl,
      apiKey: aiApiKey,
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      configured: Boolean(aiApiKey),
      dailyLimit: numberFromEnv('AI_DAILY_LIMIT', 120),
      dailyLimitStudent: numberFromEnv(
        'AI_DAILY_LIMIT_STUDENT',
        numberFromEnv('AI_DAILY_LIMIT', 120),
      ),
      dailyLimitTeacher: numberFromEnv(
        'AI_DAILY_LIMIT_TEACHER',
        numberFromEnv('AI_DAILY_LIMIT', 120),
      ),
      // 内容审核词表：逗号分隔，命中任一词直接拒绝调用；默认关闭，避免误伤正常课程提问。
      blocklist: (process.env.AI_BLOCKLIST || '')
        .split(/[,，\n]/)
        .map((term) => term.trim())
        .filter(Boolean),
      timeoutMs: numberFromEnv('AI_TIMEOUT_MS', 95_000),
    },
    mail: {
      smtpConfigured,
      host: smtpHost,
      port: numberFromEnv('SMTP_PORT', 587),
      secure: process.env.SMTP_SECURE === '1',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.MAIL_FROM || '师说 <no-reply@shishuo.local>',
      devMode: !smtpConfigured && !production && process.env.MAIL_DEV_MODE !== '0',
      codeTtlMs: 10 * 60_000,
      resendCooldownMs: 60_000,
      maxAttempts: 5,
      maxSendsPerWindow: 5,
      sendWindowMs: 15 * 60_000,
    },
    storage: loadStorageConfig(),
  }
}

/** 对象存储配置：STORAGE_DRIVER=s3 时必须配齐 endpoint / bucket / 密钥，否则回落本地磁盘。 */
function loadStorageConfig() {
  const s3 = {
    endpoint: process.env.S3_ENDPOINT || '',
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    publicBase: process.env.S3_PUBLIC_BASE || '',
  }
  const requestedS3 = process.env.STORAGE_DRIVER === 's3'
  const s3Ready = Boolean(s3.endpoint && s3.bucket && s3.accessKeyId && s3.secretAccessKey)
  return {
    driver: requestedS3 && s3Ready ? 's3' : 'local',
    requestedDriver: requestedS3 ? 's3' : 'local',
    s3,
  }
}
