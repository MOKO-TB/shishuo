import { createSession, deleteSession, hashPassword, hashToken, publicUser, sessionCookie, expiredSessionCookie, sessionTokenFromRequest, userForRequest, verifyPassword, newId } from './auth.mjs'
import { WORKSPACE_ID } from './db.mjs'
import { HttpError } from './http-error.mjs'
import { PILOT_COURSES, PILOT_COURSE_IDS, TEACHER_COURSES, parseJsonObject } from './policy.mjs'
import { authorizeAndMerge, projectWorkspace } from './permissions.mjs'
import { buildActionNext } from './actions.mjs'
import { redactMessages } from './redact.mjs'
import { saveUpload } from './storage.mjs'
import { listArchivedThreads, syncWorkspaceEntities } from './maintenance.mjs'
import { listAudit, recordAudit, summarizeStateChange } from './audit.mjs'
import {
  activeTerms,
  addTerm,
  assertUserCanWrite,
  deleteTerm,
  effectiveUserStatus,
  findBlockedTerm as findModerationTerm,
  findBlockedTermInThread,
  listReviews,
  listTerms,
  reviewFor,
  upsertReview,
} from './moderation.mjs'
import { campusReviewSummary, reviewStateForFaq } from './campus-review.mjs'
import { sendMail, sendVerificationCode } from './mail.mjs'
import {
  checkSendRate,
  deleteEmailCode,
  issueEmailCode,
  recentCodeAt,
  validPurpose,
  verifyEmailCode,
} from './email-codes.mjs'

const STATE_BODY_LIMIT = 16 * 1024 * 1024
const ACTION_BODY_LIMIT = 512 * 1024
const CHAT_BODY_LIMIT = 12 * 1024 * 1024
const SMALL_BODY_LIMIT = 256 * 1024
const UPLOAD_BODY_LIMIT = 3 * 1024 * 1024
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const MAX_MESSAGES = 24
const AI_DEFAULT_MAX_TOKENS = 1200
const AI_MAX_TOKENS = 4096
const PILOT_COURSE_SET = new Set(PILOT_COURSE_IDS)

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(body)
}

function sendError(res, status, message) {
  sendJson(res, status, { error: { message } })
}

function readJson(req, limit) {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > limit) {
    req.resume()
    return Promise.reject(new HttpError(413, '请求体过大。'))
  }
  return new Promise((resolve, reject) => {
    let size = 0
    let tooLarge = false
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        tooLarge = true
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) {
        reject(new HttpError(413, '请求体过大。'))
        return
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new HttpError(400, '请求内容不是有效的 JSON。'))
      }
    })
    req.on('error', () => reject(new HttpError(400, '请求读取失败。')))
  })
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    const forwardedHost = req.headers['x-forwarded-host']
    const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : String(forwarded ?? '').split(',')[0]
  return (first || req.socket.remoteAddress || 'unknown').trim()
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200
}

function verificationMessage(reason) {
  if (reason === 'attempts') return '验证码尝试次数过多，请重新获取。'
  if (reason === 'expired') return '验证码已过期，请重新获取。'
  return '验证码错误或已过期，请重新获取。'
}

function dayStart() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function usageToday(db, userId) {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM ai_usage WHERE user_id = ? AND created_at >= ?')
    .get(userId, dayStart())
  return Number(row?.count ?? 0)
}

/** 按角色取当日额度：AI_DAILY_LIMIT_STUDENT / AI_DAILY_LIMIT_TEACHER，缺省回落 AI_DAILY_LIMIT。 */
function aiDailyLimitFor(config, role) {
  return role === 'teacher' ? config.ai.dailyLimitTeacher : config.ai.dailyLimitStudent
}

/** 内容审核钩子：命中词表任一项即拒绝发往上游。词表默认为空（不启用）。 */
function findBlockedTerm(config, messages) {
  if (config.ai.blocklist.length === 0) return null
  for (const message of messages) {
    const content = message?.content
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((part) => (part?.type === 'text' ? part.text : '')).join('\n')
          : ''
    for (const term of config.ai.blocklist) {
      if (term && text.includes(term)) return term
    }
  }
  return null
}

function workspaceRow(db) {
  return db
    .prepare('SELECT data_json, revision, updated_at, updated_by FROM workspaces WHERE id = ?')
    .get(WORKSPACE_ID)
}

function parsedWorkspace(row) {
  if (!row?.data_json) return null
  try {
    return JSON.parse(row.data_json)
  } catch {
    return null
  }
}

/** 管理台直接改工作区（撤下内容 / 删除违规图片）；仍走 revision 乐观锁 + 审计。 */
function mutateWorkspaceAsAdmin(db, { user, action, summary, courseIds = [], mutate }) {
  const row = workspaceRow(db)
  const prev = parsedWorkspace(row)
  if (!prev) throw new HttpError(409, '共享空间还没有初始化。')
  const next = JSON.parse(JSON.stringify(prev))
  const changed = mutate(next)
  if (!changed) throw new HttpError(400, '没有可更新的内容。')
  if (!validateState(next)) throw new HttpError(400, '更新后的工作区结构不正确。')
  const now = Date.now()
  const result = db
    .prepare(
      `UPDATE workspaces
          SET data_json = ?, revision = revision + 1, updated_at = ?, updated_by = ?
        WHERE id = ? AND revision = ?`,
    )
    .run(JSON.stringify(next), now, user.id, WORKSPACE_ID, Number(row?.revision ?? 0))
  if (Number(result.changes) === 0) {
    throw new HttpError(409, '共享空间已有更新，请刷新后重试。')
  }
  recordAudit(db, {
    user,
    revision: Number(row?.revision ?? 0) + 1,
    action,
    actions: [action],
    summary,
    courseIds,
  })
  try {
    syncWorkspaceEntities(db, next, now)
  } catch {
    // 镜像尽力而为；工作区本体已落库。
  }
  return { revision: Number(row?.revision ?? 0) + 1, updatedAt: now, data: next }
}

function validateState(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  if (!Number.isFinite(Number(data.version))) return false
  if (!Array.isArray(data.threads) || !Array.isArray(data.faqs)) return false
  if (!Array.isArray(data.daily) || !Array.isArray(data.notifications)) return false
  if (data.courseNotes !== undefined && !Array.isArray(data.courseNotes)) return false
  return true
}

/** 合并后新出现的老师回复（按学生去重：一个学生同组多问只发一封）。 */
function collectNewReplyRecipients(prev, merged) {
  const prevThreads = new Map((prev?.threads ?? []).map((thread) => [thread.id, thread]))
  const recipients = new Map()
  for (const thread of merged.threads ?? []) {
    const reply = thread.teacherReply
    if (!reply?.by) continue
    const before = prevThreads.get(thread.id)
    if (before?.teacherReply?.at === reply.at) continue
    const studentId = thread.student?.id
    if (!studentId || recipients.has(studentId)) continue
    recipients.set(studentId, {
      studentId,
      courseId: thread.courseId,
      question: thread.question ?? '',
      reply,
    })
  }
  return Array.from(recipients.values())
}

/** 尽力而为的邮件提醒；未开开关、未配 SMTP 或发送失败都不影响答疑主流程。 */
async function sendReplyEmails(db, config, entries) {
  for (const entry of entries) {
    try {
      const row = db
        .prepare('SELECT email, name, profile_json FROM users WHERE id = ?')
        .get(entry.studentId)
      if (!row?.email) continue
      const profile = parseJsonObject(row.profile_json, {})
      if (profile.emailOnTeacherReply !== true) continue
      const courseName = PILOT_COURSES[entry.courseId]?.name ?? '你的课程'
      const question = String(entry.question).replace(/\s+/g, ' ').slice(0, 80)
      const replyText = String(entry.reply.text).replace(/\s+/g, ' ').slice(0, 400)
      await sendMail(config, {
        to: row.email,
        subject: `师说：${entry.reply.by}老师回复了你的《${courseName}》提问`,
        text: `${row.name}同学你好：\n\n你在《${courseName}》的提问有了老师回复。\n\n问题：${question}\n\n${entry.reply.by}老师回复：\n${replyText}\n\n登录师说查看完整回复，可以继续追问或确认「已解决」。\n\n——师说 · AI 双通道课后答疑`,
      })
    } catch {
      // 邮件失败只影响提醒，不回滚工作区写入。
    }
  }
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw new HttpError(400, '消息列表格式不正确。')
  }
  return messages.map((message) => {
    if (!message || typeof message !== 'object') throw new HttpError(400, '消息格式不正确。')
    const role = message.role
    if (!['system', 'user', 'assistant'].includes(role)) throw new HttpError(400, '消息角色不正确。')
    const content = message.content
    if (typeof content === 'string') {
      if (content.length > 20_000) throw new HttpError(413, '单条消息过长。')
      return { role, content }
    }
    if (!Array.isArray(content) || content.length === 0) {
      throw new HttpError(400, '消息内容格式不正确。')
    }
    return {
      role,
      content: content.map((part) => {
        if (!part || typeof part !== 'object') throw new HttpError(400, '消息内容格式不正确。')
        if (part.type === 'text') {
          if (typeof part.text !== 'string' || part.text.length > 20_000) {
            throw new HttpError(413, '单条消息过长。')
          }
          return { type: 'text', text: part.text }
        }
        if (part.type === 'image_url') {
          const url = part.image_url?.url
          if (typeof url !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) {
            throw new HttpError(400, '只支持以 Data URL 提交题目图片。')
          }
          return { type: 'image_url', image_url: { url } }
        }
        throw new HttpError(400, '消息内容包含不支持的类型。')
      }),
    }
  })
}

function upstreamEndpoint(baseUrl) {
  const normalized = String(baseUrl).replace(/\/+$/, '')
  return normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`
}

function pickUpstreamMessage(status, raw) {
  let providerMessage = ''
  try {
    const parsed = JSON.parse(raw)
    providerMessage =
      typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message ?? ''
  } catch {
    providerMessage = raw.slice(0, 160)
  }
  if (status === 401 || status === 403) return '服务端 AI Key 无效，或没有该模型的权限。'
  if (status === 404) return '上游接口地址不存在，请检查 AI_BASE_URL。'
  if (status === 429) return '上游模型限流或额度不足，请稍后再试。'
  return `上游模型调用失败（HTTP ${status}）。${providerMessage ? ` ${providerMessage}` : ''}`.trim()
}

export function createApiHandler({ db, config }) {
  const loginAttempts = new Map()

  function requireUser(req) {
    const row = userForRequest(db, req)
    if (!row) throw new HttpError(401, '登录状态已失效，请重新登录。')
    return row
  }

  function requireAdmin(req) {
    const user = requireUser(req)
    if (!user.is_admin) throw new HttpError(403, '只有管理员可以执行该操作。')
    return user
  }

  function adminUserView(row) {
    let courses = []
    try {
      const parsed = JSON.parse(row.courses_json || '[]')
      courses = Array.isArray(parsed) ? parsed : []
    } catch {
      courses = []
    }
    const status = effectiveUserStatus(row)
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      courses,
      isAdmin: Boolean(row.is_admin),
      status: status.status,
      statusReason: status.reason,
      statusUntil: status.until,
      statusUpdatedAt: row.status_updated_at == null ? null : Number(row.status_updated_at),
      createdAt: Number(row.created_at),
    }
  }

  function checkLoginRate(req, email) {
    const key = `${clientIp(req)}:${email}`
    const entry = loginAttempts.get(key)
    if (!entry) return key
    if (entry.blockedUntil > Date.now()) {
      throw new HttpError(429, '尝试次数过多，请 15 分钟后再试。')
    }
    if (entry.blockedUntil && entry.blockedUntil <= Date.now()) {
      loginAttempts.delete(key)
    }
    return key
  }

  function recordLoginFailure(key) {
    const entry = loginAttempts.get(key) ?? { count: 0, blockedUntil: 0 }
    entry.count += 1
    if (entry.count >= 8) entry.blockedUntil = Date.now() + 15 * 60_000
    loginAttempts.set(key, entry)
  }

  async function handleAuth(req, res, pathname) {
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const row = userForRequest(db, req)
      return sendJson(res, 200, { user: row ? publicUser(row) : null })
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
      const body = await readJson(req, SMALL_BODY_LIMIT)
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      if (!validEmail(email) || !password) {
        return sendError(res, 400, '请输入有效的邮箱和密码。')
      }
      const rateKey = checkLoginRate(req, email)
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
      if (!row || !verifyPassword(password, row.password_hash)) {
        recordLoginFailure(rateKey)
        return sendError(res, 401, '邮箱或密码不正确。')
      }
      loginAttempts.delete(rateKey)
      if (effectiveUserStatus(row).status === 'banned') {
        return sendError(res, 403, '账号已被封禁，请联系管理员。')
      }
      const token = createSession(db, row.id)
      res.setHeader('Set-Cookie', sessionCookie(token, { secure: config.cookieSecure }))
      return sendJson(res, 200, { user: publicUser(row) })
    }

    if (pathname === '/api/auth/email-code' && req.method === 'POST') {
      if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
      const body = await readJson(req, SMALL_BODY_LIMIT)
      const email = String(body.email ?? '').trim().toLowerCase()
      const purpose = String(body.purpose ?? '').trim()
      if (!validEmail(email)) return sendError(res, 400, '请输入有效的邮箱。')
      if (!validPurpose(purpose)) return sendError(res, 400, '验证码用途不合法。')
      const account = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
      if (purpose === 'register' && account) {
        return sendError(res, 409, '这个邮箱已经注册过了，可以直接登录。')
      }
      const shouldSend = purpose === 'register' || Boolean(account)
      const now = Date.now()
      if (shouldSend) {
        const last = recentCodeAt(db, email, purpose)
        if (last && now - last < config.mail.resendCooldownMs) {
          return sendError(
            res,
            429,
            `请 ${Math.ceil((config.mail.resendCooldownMs - (now - last)) / 1000)} 秒后再获取验证码。`,
          )
        }
      }
      const rate = checkSendRate(req, email, purpose, config)
      if (!rate.ok) {
        return sendError(res, 429, `获取验证码过于频繁，请 ${rate.retryAfter} 秒后再试。`)
      }
      if (!shouldSend) {
        // Keep the response shape identical to a known account so this endpoint
        // cannot be used to enumerate registered emails.
        return sendJson(res, 200, {
          ok: true,
          expiresIn: Math.round(config.mail.codeTtlMs / 1000),
          devMode: config.mail.devMode,
          delivery: 'email',
        })
      }
      const issued = issueEmailCode(db, config, { email, purpose })
      try {
        const delivery = await sendVerificationCode(config, {
          to: email,
          code: issued.code,
          purpose,
        })
        return sendJson(res, 200, {
          ok: true,
          expiresIn: Math.round(config.mail.codeTtlMs / 1000),
          devMode: config.mail.devMode,
          delivery: delivery.dev ? 'dev' : 'email',
          ...(config.mail.devMode ? { devCode: issued.code } : {}),
        })
      } catch (error) {
        deleteEmailCode(db, issued.id)
        throw error
      }
    }

    if (pathname === '/api/auth/reset-password' && req.method === 'POST') {
      if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
      const body = await readJson(req, SMALL_BODY_LIMIT)
      const email = String(body.email ?? '').trim().toLowerCase()
      const code = String(body.code ?? '').trim()
      const newPassword = String(body.newPassword ?? '')
      if (!validEmail(email)) return sendError(res, 400, '请输入有效的邮箱。')
      if (newPassword.length < 8 || newPassword.length > 128) {
        return sendError(res, 400, '新密码长度需要在 8–128 位之间。')
      }
      if (!/^\d{6}$/.test(code)) return sendError(res, 400, '请输入 6 位邮箱验证码。')
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
      if (!row) return sendError(res, 400, verificationMessage('missing'))
      const verified = verifyEmailCode(db, config, { email, purpose: 'reset', code })
      if (!verified.ok) return sendError(res, 400, verificationMessage(verified.reason))
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        hashPassword(newPassword),
        row.id,
      )
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id)
      recordAudit(db, {
        user: row,
        action: 'password-reset',
        actions: ['password-reset'],
        summary: '通过邮箱验证码重置自己的密码',
        courseIds: [],
      })
      return sendJson(res, 200, { ok: true })
    }

    if (pathname === '/api/auth/register' && req.method === 'POST') {
      if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
      const body = await readJson(req, SMALL_BODY_LIMIT)
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      const name = String(body.name ?? '').trim()
      const role = body.role === 'teacher' ? 'teacher' : 'student'
      if (!validEmail(email)) return sendError(res, 400, '请输入有效的邮箱。')
      if (password.length < 8 || password.length > 128) {
        return sendError(res, 400, '密码长度需要在 8–128 位之间。')
      }
      if (name.length < 1 || name.length > 40) return sendError(res, 400, '请输入姓名。')
      let courses = []
      if (role === 'teacher') {
        if (!config.teacherInviteCode) return sendError(res, 403, '教师注册未开放，请使用教师演示账号。')
        if (String(body.inviteCode ?? '') !== config.teacherInviteCode) {
          return sendError(res, 403, '教师邀请码不正确。')
        }
        const requested = Array.isArray(body.courses)
          ? body.courses.filter((id) => typeof id === 'string' && PILOT_COURSE_SET.has(id))
          : []
        courses = requested.length > 0 ? Array.from(new Set(requested)) : TEACHER_COURSES[name] ?? []
        if (courses.length === 0) {
          return sendError(res, 400, '教师账号需要分配至少一门试点课程。')
        }
      }
      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
      if (exists) return sendError(res, 409, '这个邮箱已经注册过了。')
      const code = String(body.code ?? '').trim()
      if (!/^\d{6}$/.test(code)) return sendError(res, 400, '请输入 6 位邮箱验证码。')
      const verified = verifyEmailCode(db, config, { email, purpose: 'register', code })
      if (!verified.ok) return sendError(res, 400, verificationMessage(verified.reason))
      const id = newId(role === 'teacher' ? 'teacher' : 'student')
      try {
        db.prepare(
          `INSERT INTO users (id, email, name, role, password_hash, profile_json, courses_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          email,
          name,
          role,
          hashPassword(password),
          '{}',
          JSON.stringify(courses),
          Date.now(),
        )
      } catch {
        return sendError(res, 409, '这个邮箱已经注册过了。')
      }
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
      recordAudit(db, {
        user: row,
        action: 'user-create',
        actions: ['user-create'],
        summary: `邮箱验证注册 ${role === 'teacher' ? '教师' : '学生'}账号 ${name}（${email}）`,
        courseIds: courses,
      })
      const token = createSession(db, id)
      res.setHeader('Set-Cookie', sessionCookie(token, { secure: config.cookieSecure }))
      return sendJson(res, 201, { user: publicUser(row) })
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
      deleteSession(db, sessionTokenFromRequest(req))
      res.setHeader('Set-Cookie', expiredSessionCookie({ secure: config.cookieSecure }))
      return sendJson(res, 200, { ok: true })
    }

    return false
  }

  /**
   * 动作 API 通用执行：构建最小变更 → authorizeAndMerge 校验 → revision 乐观锁事务落库。
   * 与 PUT /api/state 共享同一套校验与合并语义，前端整包同步不受影响。
   */
  async function runAction(req, res, action, payload) {
    const user = requireUser(req)
    if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
    const postActions = new Set([
      'thread-create',
      'thread-escalate',
      'thread-supplement',
      'thread-reply',
      'thread-info-request',
    ])
    assertUserCanWrite(user, postActions.has(action) ? 'post' : 'interact')
    if (postActions.has(action)) {
      const terms = activeTerms(db)
      let blockedTerm = null
      if (action === 'thread-create') {
        blockedTerm = findBlockedTermInThread(payload?.thread, terms)
      } else {
        const texts =
          action === 'thread-escalate'
            ? [payload?.escalation?.title, payload?.escalation?.note]
            : action === 'thread-supplement'
              ? [payload?.supplement?.text]
              : action === 'thread-reply'
                ? [payload?.reply?.text]
                : action === 'thread-info-request'
                  ? [payload?.request?.text]
                  : []
        blockedTerm = texts.map((text) => findModerationTerm(text, terms)).find(Boolean) ?? null
      }
      if (blockedTerm) {
        recordAudit(db, {
          user,
          revision: 0,
          action: 'moderation-blocked',
          actions: ['moderation-blocked'],
          summary: `内容包含敏感词「${blockedTerm}」，已拒绝提交`,
          courseIds: [],
        })
        return sendError(res, 400, `内容包含不允许的词：${blockedTerm}`)
      }
    }
    const baseRevision = Number(payload?.baseRevision)
    if (!Number.isFinite(baseRevision) || baseRevision < 0) {
      return sendError(res, 400, '缺少工作区版本号。')
    }
    const row = workspaceRow(db)
    const prev = parsedWorkspace(row)
    const currentRevision = Number(row?.revision ?? 0)
    if (!prev) return sendError(res, 409, '共享空间还没有初始化，请先在页面上完成首次载入。')
    if (currentRevision !== baseRevision) {
      return sendJson(res, 409, {
        error: { message: '共享空间已有更新，请刷新后重试。' },
        data: projectWorkspace(prev, user),
        revision: currentRevision,
        updatedAt: Number(row?.updated_at ?? 0),
      })
    }
    const now = Date.now()
    let merged
    try {
      const next = buildActionNext(action, payload, prev, user, now)
      if (!next) return sendError(res, 400, `不支持的动作：${action}`)
      merged = authorizeAndMerge({ prev, next, user })
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) {
        recordAudit(db, {
          user,
          revision: currentRevision,
          action: 'permission-denied',
          actions: ['permission-denied'],
          summary: `越权动作被拒绝（${action}）：${error.message}`,
          courseIds: [],
        })
      }
      throw error
    }
    if (!validateState(merged)) return sendError(res, 400, '动作结果结构不正确。')
    const serialized = JSON.stringify(merged)
    if (Buffer.byteLength(serialized, 'utf8') > STATE_BODY_LIMIT) {
      return sendError(res, 413, '工作区数据过大。')
    }
    const result = db
      .prepare(
        `UPDATE workspaces
            SET data_json = ?, revision = revision + 1, updated_at = ?, updated_by = ?
          WHERE id = ? AND revision = ?`,
      )
      .run(serialized, now, user.id, WORKSPACE_ID, currentRevision)
    if (Number(result.changes) === 0) {
      const latest = workspaceRow(db)
      return sendJson(res, 409, {
        error: { message: '共享空间已有更新，请刷新后重试。' },
        data: projectWorkspace(parsedWorkspace(latest), user),
        revision: Number(latest?.revision ?? 0),
        updatedAt: Number(latest?.updated_at ?? 0),
      })
    }
    const change = summarizeStateChange({ prev, next: merged })
    recordAudit(db, {
      user,
      revision: currentRevision + 1,
      action: change.action,
      actions: change.actions,
      summary: change.summary,
      courseIds: change.courseIds,
    })
    const replyEntries = collectNewReplyRecipients(prev, merged)
    if (replyEntries.length > 0) void sendReplyEmails(db, config, replyEntries)
    try {
      syncWorkspaceEntities(db, merged, now)
    } catch {
      // 实体镜像尽力而为；工作区本体已经落库，下次写入会重新对齐。
    }
    return sendJson(res, 200, {
      revision: currentRevision + 1,
      updatedAt: now,
      updatedBy: user.id,
      data: projectWorkspace(merged, user),
    })
  }

  return async function handleApi(req, res) {
    const url = new URL(req.url || '/', 'http://localhost')
    const pathname = url.pathname
    try {
      if (pathname === '/api/health' && req.method === 'GET') {
        const row = workspaceRow(db)
        return sendJson(res, 200, {
          ok: true,
          service: 'shishuo',
          aiConfigured: config.ai.configured,
          // 前端据此决定是否显示演示账号；真实上线设 SHISHUO_DEMO_ACCOUNTS=0 即隐藏。
          demoAccounts: config.demoAccounts,
          // 教师自助注册是否开放（需配置 TEACHER_INVITE_CODE）。
          teacherRegistration: Boolean(config.teacherInviteCode),
          workspaceRevision: Number(row?.revision ?? 0),
        })
      }

      if (pathname.startsWith('/api/auth/')) {
        const result = await handleAuth(req, res, pathname)
        if (result !== false) return result
      }

      if (pathname === '/api/admin/users' && req.method === 'GET') {
        requireAdmin(req)
        const rows = db
          .prepare(
            `SELECT id, email, name, role, courses_json, is_admin,
                    status, status_reason, status_until, status_updated_at, created_at
               FROM users
              ORDER BY is_admin DESC, role DESC, created_at ASC`,
          )
          .all()
        return sendJson(res, 200, { users: rows.map(adminUserView) })
      }

      if (pathname === '/api/admin/users' && req.method === 'POST') {
        const admin = requireAdmin(req)
        if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
        const body = await readJson(req, SMALL_BODY_LIMIT)
        const email = String(body.email ?? '').trim().toLowerCase()
        const name = String(body.name ?? '').trim()
        const password = String(body.password ?? '')
        const role = body.role === 'teacher' ? 'teacher' : 'student'
        if (!validEmail(email)) return sendError(res, 400, '请输入有效的邮箱。')
        if (name.length < 1 || name.length > 40) return sendError(res, 400, '请输入账号姓名。')
        if (password.length < 8 || password.length > 128) {
          return sendError(res, 400, '密码长度需要在 8–128 位之间。')
        }
        let courses = []
        if (role === 'teacher') {
          const requested = Array.isArray(body.courses)
            ? body.courses.filter((id) => typeof id === 'string' && PILOT_COURSE_SET.has(id))
            : []
          courses = Array.from(new Set(requested))
          if (courses.length === 0) return sendError(res, 400, '教师账号至少需要分配一门试点课程。')
        }
        const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
        if (exists) return sendError(res, 409, '这个邮箱已经注册过了。')
        const id = newId(role === 'teacher' ? 'teacher' : 'student')
        try {
          db.prepare(
            `INSERT INTO users
               (id, email, name, role, password_hash, profile_json, courses_json, is_admin, created_at)
             VALUES (?, ?, ?, ?, ?, '{}', ?, 0, ?)`,
          ).run(id, email, name, role, hashPassword(password), JSON.stringify(courses), Date.now())
        } catch {
          return sendError(res, 409, '这个邮箱已经注册过了。')
        }
        const row = db
          .prepare(
            `SELECT id, email, name, role, courses_json, is_admin,
                    status, status_reason, status_until, status_updated_at, created_at
               FROM users WHERE id = ?`,
          )
          .get(id)
        recordAudit(db, {
          user: admin,
          action: 'user-create',
          actions: ['user-create'],
          summary: `创建${role === 'teacher' ? '教师' : '学生'}账号 ${name}（${email}）`,
          courseIds: courses,
        })
        return sendJson(res, 201, { user: adminUserView(row) })
      }

      if (pathname.startsWith('/api/admin/users/')) {
        const admin = requireAdmin(req)
        if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
        const rest = pathname.slice('/api/admin/users/'.length)
        const [rawId, suffix] = rest.split('/')
        let targetId = ''
        try {
          targetId = decodeURIComponent(rawId || '')
        } catch {
          return sendError(res, 400, '账号 ID 不合法。')
        }
        const target = db
          .prepare('SELECT * FROM users WHERE id = ?')
          .get(targetId)
        if (!target) return sendError(res, 404, '账号不存在。')

        if (suffix === 'status' && req.method === 'POST') {
          const body = await readJson(req, SMALL_BODY_LIMIT)
          const status = ['active', 'muted', 'banned'].includes(body.status)
            ? body.status
            : null
          if (!status) return sendError(res, 400, '账号状态不合法。')
          if (target.is_admin) {
            return sendError(res, 400, '管理员账号不能被禁言或封禁，请先取消其管理员身份。')
          }
          if (target.id === admin.id) return sendError(res, 400, '不能修改自己的账号状态。')
          const reason = String(body.reason ?? '').trim().slice(0, 300)
          let until = null
          if (status === 'muted' && body.until !== undefined && body.until !== null && body.until !== '') {
            until = Number(body.until)
            if (!Number.isFinite(until) || until <= Date.now()) {
              return sendError(res, 400, '禁言结束时间必须晚于现在。')
            }
          }
          db.prepare(
            `UPDATE users
                SET status = ?, status_reason = ?, status_until = ?, status_updated_at = ?
              WHERE id = ?`,
          ).run(
            status,
            reason || null,
            status === 'muted' ? until : null,
            Date.now(),
            target.id,
          )
          if (status === 'banned') {
            db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id)
          }
          const updated = db
            .prepare(
              `SELECT id, email, name, role, courses_json, is_admin,
                      status, status_reason, status_until, status_updated_at, created_at
                 FROM users WHERE id = ?`,
            )
            .get(target.id)
          const label =
            status === 'banned' ? '封禁' : status === 'muted' ? '禁言' : '恢复正常'
          recordAudit(db, {
            user: admin,
            action: 'moderation-user-status',
            actions: ['moderation-user-status'],
            summary: `${label}账号 ${target.name}（${target.email}）${reason ? `：${reason}` : ''}`,
            courseIds: [],
          })
          return sendJson(res, 200, { user: adminUserView(updated) })
        }

        if (suffix === 'password' && req.method === 'POST') {
          const body = await readJson(req, SMALL_BODY_LIMIT)
          const password = String(body.password ?? '')
          if (password.length < 8 || password.length > 128) {
            return sendError(res, 400, '密码长度需要在 8–128 位之间。')
          }
          db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
            hashPassword(password),
            target.id,
          )
          if (target.id === admin.id) {
            const currentHash = hashToken(sessionTokenFromRequest(req))
            db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(
              target.id,
              currentHash,
            )
          } else {
            db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id)
          }
          recordAudit(db, {
            user: admin,
            action: 'password-reset',
            actions: ['password-reset'],
            summary: `重置账号密码 ${target.name}（${target.email}）`,
            courseIds: [],
          })
          return sendJson(res, 200, { ok: true })
        }

        if (req.method === 'PATCH') {
          const body = await readJson(req, SMALL_BODY_LIMIT)
          const name = body.name === undefined ? target.name : String(body.name).trim()
          if (name.length < 1 || name.length > 40) return sendError(res, 400, '账号姓名不合法。')
          let courses = null
          if (body.courses !== undefined) {
            if (target.role !== 'teacher') return sendError(res, 400, '学生账号不需要分配课程。')
            const requested = Array.isArray(body.courses)
              ? body.courses.filter((id) => typeof id === 'string' && PILOT_COURSE_SET.has(id))
              : []
            courses = Array.from(new Set(requested))
            if (courses.length === 0) return sendError(res, 400, '教师账号至少需要保留一门试点课程。')
            let current = []
            try {
              const parsed = JSON.parse(target.courses_json || '[]')
              current = Array.isArray(parsed) ? parsed : []
            } catch {
              current = []
            }
            if (target.id === admin.id && JSON.stringify(current) !== JSON.stringify(courses)) {
              return sendError(res, 400, '不能修改自己的课程分配，请让另一位管理员操作。')
            }
          }
          if (courses === null) {
            db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, target.id)
          } else {
            db.prepare('UPDATE users SET name = ?, courses_json = ? WHERE id = ?').run(
              name,
              JSON.stringify(courses),
              target.id,
            )
          }
          const updated = db
            .prepare(
              `SELECT id, email, name, role, courses_json, is_admin,
                      status, status_reason, status_until, status_updated_at, created_at
                 FROM users WHERE id = ?`,
            )
            .get(target.id)
          recordAudit(db, {
            user: admin,
            action: 'user-update',
            actions: ['user-update'],
            summary: `修改账号 ${updated.name}（${updated.email}）${courses ? ' 与课程分配' : ''}`,
            courseIds: courses ?? [],
          })
          return sendJson(res, 200, { user: adminUserView(updated) })
        }

        return sendError(res, 405, '不支持的账号操作。')
      }

      if (pathname === '/api/admin/workspace-summary' && req.method === 'GET') {
        requireAdmin(req)
        const row = workspaceRow(db)
        const data = parsedWorkspace(row)
        const faqs = data?.faqs ?? []
        const threads = data?.threads ?? []
        const campusFaqs = faqs.filter((faq) => faq.courseId === 'campus')
        const byCourse = {}
        for (const faq of faqs) {
          byCourse[faq.courseId] = (byCourse[faq.courseId] ?? 0) + 1
        }
        const campusCategories = {}
        for (const faq of campusFaqs) {
          const category = faq.chapter || '未分类'
          const item = campusCategories[category] ?? { total: 0, unverified: 0 }
          item.total += 1
          if (String(faq.credibility ?? '').startsWith('D')) item.unverified += 1
          campusCategories[category] = item
        }
        const pendingThreads = threads.filter(
          (thread) => thread.status === 'pending' && !thread.withdrawnAt,
        )
        const campusThreads = threads.filter((thread) => thread.courseId === 'campus')
        return sendJson(res, 200, {
          revision: Number(row?.revision ?? 0),
          updatedAt: Number(row?.updated_at ?? 0),
          faqs: {
            total: faqs.length,
            byCourse,
            campus: {
              total: campusFaqs.length,
              verified: campusFaqs.filter((faq) =>
                /^[ABV]/.test(String(faq.credibility ?? '')),
              ).length,
              unverified: campusFaqs.filter((faq) =>
                String(faq.credibility ?? '').startsWith('D'),
              ).length,
              noSource: campusFaqs.filter((faq) => !faq.sourceUrl).length,
              categories: campusCategories,
            },
          },
          threads: {
            total: threads.length,
            pending: pendingThreads.length,
            campusTotal: campusThreads.length,
            campusPending: pendingThreads.filter(
              (thread) => thread.courseId === 'campus',
            ).length,
          },
          courseNotes: (data?.courseNotes ?? []).length,
        })
      }

      if (pathname === '/api/admin/moderation/terms' && req.method === 'GET') {
        requireAdmin(req)
        return sendJson(res, 200, { terms: listTerms(db) })
      }

      if (pathname === '/api/admin/moderation/terms' && req.method === 'POST') {
        const admin = requireAdmin(req)
        if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
        const body = await readJson(req, SMALL_BODY_LIMIT)
        const term = addTerm(db, {
          term: body.term,
          category: body.category,
          createdBy: admin.name,
        })
        recordAudit(db, {
          user: admin,
          action: 'moderation-term-add',
          actions: ['moderation-term-add'],
          summary: `新增敏感词「${term.term}」（${term.category}）`,
          courseIds: [],
        })
        return sendJson(res, 201, { term })
      }

      const moderationTermMatch = /^\/api\/admin\/moderation\/terms\/(\d+)$/.exec(pathname)
      if (moderationTermMatch && req.method === 'DELETE') {
        const admin = requireAdmin(req)
        if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
        const term = db
          .prepare('SELECT term FROM moderation_terms WHERE id = ?')
          .get(Number(moderationTermMatch[1]))
        deleteTerm(db, moderationTermMatch[1])
        recordAudit(db, {
          user: admin,
          action: 'moderation-term-delete',
          actions: ['moderation-term-delete'],
          summary: `删除敏感词「${term?.term ?? moderationTermMatch[1]}」`,
          courseIds: [],
        })
        return sendJson(res, 200, { ok: true })
      }

      if (pathname === '/api/admin/moderation/overview' && req.method === 'GET') {
        requireAdmin(req)
        const terms = listTerms(db)
        const userRows = db.prepare('SELECT status, status_until FROM users').all()
        const statuses = userRows.map((row) => effectiveUserStatus(row))
        const data = parsedWorkspace(workspaceRow(db)) ?? {}
        const threads = Array.isArray(data.threads) ? data.threads : []
        const active = activeTerms(db)
        const imageReviews = new Map(
          listReviews(db, 'image').map((review) => [review.targetId, review]),
        )
        const withImages = threads.filter(
          (thread) => thread.attachment?.url && !thread.withdrawnAt,
        )
        const pendingImages = withImages.filter(
          (thread) =>
            (imageReviews.get(thread.attachment.url)?.status ?? 'pending') === 'pending',
        ).length
        const flaggedThreads = threads.filter(
          (thread) => !thread.withdrawnAt && findBlockedTermInThread(thread, active),
        ).length
        return sendJson(res, 200, {
          terms: {
            total: terms.length,
            enabled: terms.filter((term) => term.enabled).length,
          },
          users: {
            muted: statuses.filter((status) => status.status === 'muted').length,
            banned: statuses.filter((status) => status.status === 'banned').length,
          },
          images: {
            total: withImages.length,
            pending: pendingImages,
            approved: withImages.filter(
              (thread) => imageReviews.get(thread.attachment.url)?.status === 'approved',
            ).length,
            rejected: withImages.filter(
              (thread) => imageReviews.get(thread.attachment.url)?.status === 'rejected',
            ).length,
          },
          threads: {
            total: threads.length,
            withImages: withImages.length,
            flagged: flaggedThreads,
            withdrawn: threads.filter((thread) => Boolean(thread.withdrawnAt)).length,
          },
        })
      }

      if (pathname === '/api/admin/moderation/threads' && req.method === 'GET') {
        requireAdmin(req)
        const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit') ?? 100)))
        const filter = String(url.searchParams.get('filter') ?? 'all')
        const data = parsedWorkspace(workspaceRow(db)) ?? {}
        const threads = Array.isArray(data.threads) ? data.threads : []
        const active = activeTerms(db)
        const imageReviews = new Map(
          listReviews(db, 'image').map((review) => [review.targetId, review]),
        )
        const threadReviews = new Map(
          listReviews(db, 'thread').map((review) => [review.targetId, review]),
        )
        let items = threads.map((thread) => {
          const attachmentUrl = thread.attachment?.url ?? ''
          const imageReview = attachmentUrl ? imageReviews.get(attachmentUrl) : null
          const threadReview = threadReviews.get(thread.id)
          return {
            id: thread.id,
            courseId: thread.courseId,
            student: {
              id: thread.student?.id ?? '',
              name: thread.student?.name ?? '',
              anonymous: Boolean(thread.student?.anonymous),
            },
            question: thread.question,
            createdAt: Number(thread.createdAt ?? 0),
            status: thread.status,
            withdrawn: Boolean(thread.withdrawnAt),
            attachment: thread.attachment
              ? {
                  url: thread.attachment.url,
                  name: thread.attachment.name,
                  type: thread.attachment.type,
                  review: imageReview?.status ?? 'pending',
                  reason: imageReview?.reason ?? '',
                }
              : null,
            matchedTerm: findBlockedTermInThread(thread, active),
            review: threadReview?.status ?? 'pending',
            reviewReason: threadReview?.reason ?? '',
          }
        })
        if (filter === 'flagged') {
          items = items.filter((item) => item.matchedTerm)
        } else if (filter === 'images') {
          items = items.filter((item) => item.attachment)
        } else if (filter === 'pending') {
          items = items.filter(
            (item) =>
              item.review === 'pending' ||
              item.attachment?.review === 'pending' ||
              item.matchedTerm,
          )
        }
        items.sort((a, b) => b.createdAt - a.createdAt)
        return sendJson(res, 200, { threads: items.slice(0, limit) })
      }

      const moderationThreadMatch =
        /^\/api\/admin\/moderation\/threads\/([\w.-]+)\/review$/.exec(pathname)
      if (moderationThreadMatch && req.method === 'POST') {
        const admin = requireAdmin(req)
        if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
        const body = await readJson(req, SMALL_BODY_LIMIT)
        const action = ['approve', 'reject', 'withdraw'].includes(body.action)
          ? body.action
          : null
        if (!action) return sendError(res, 400, '审核动作不合法。')
        const threadId = decodeURIComponent(moderationThreadMatch[1])
        const data = parsedWorkspace(workspaceRow(db)) ?? {}
        const thread = (data.threads ?? []).find((item) => item.id === threadId)
        if (!thread) return sendError(res, 404, '问答不存在。')
        const reason = String(body.reason ?? '').trim().slice(0, 500)
        if (action !== 'approve' && reason.length < 2) {
          return sendError(res, 400, '撤下或拒绝时请填写原因。')
        }
        if (action === 'approve') {
          upsertReview(db, {
            kind: 'thread',
            targetId: threadId,
            threadId,
            status: 'approved',
            reason,
            reviewer: admin.name,
          })
          recordAudit(db, {
            user: admin,
            action: 'moderation-thread-review',
            actions: ['moderation-thread-review'],
            summary: `通过问答审核：${String(thread.question ?? '').slice(0, 60)}`,
            courseIds: [thread.courseId].filter(Boolean),
          })
          return sendJson(res, 200, { ok: true, status: 'approved' })
        }
        const result = mutateWorkspaceAsAdmin(db, {
          user: admin,
          action: 'moderation-thread-review',
          summary: `${action === 'reject' ? '拒绝并撤下' : '撤下'}问答：${String(thread.question ?? '').slice(0, 60)}（${reason}）`,
          courseIds: [thread.courseId].filter(Boolean),
          mutate: (next) => {
            const target = (next.threads ?? []).find((item) => item.id === threadId)
            if (!target) return false
            target.withdrawnAt = Date.now()
            target.moderation = {
              status: action === 'reject' ? 'rejected' : 'withdrawn',
              reason,
              by: admin.id,
              at: Date.now(),
            }
            if (action === 'reject' && target.attachment) {
              delete target.attachment
            }
            return true
          },
        })
        if (action === 'reject' && thread.attachment?.url) {
          upsertReview(db, {
            kind: 'image',
            targetId: thread.attachment.url,
            threadId,
            status: 'rejected',
            reason,
            reviewer: admin.name,
          })
        }
        upsertReview(db, {
          kind: 'thread',
          targetId: threadId,
          threadId,
          status: action === 'reject' ? 'rejected' : 'withdrawn',
          reason,
          reviewer: admin.name,
        })
        return sendJson(res, 200, {
          ok: true,
          status: action === 'reject' ? 'rejected' : 'withdrawn',
          revision: result.revision,
        })
      }

      if (pathname === '/api/admin/moderation/images' && req.method === 'GET') {
        requireAdmin(req)
        const data = parsedWorkspace(workspaceRow(db)) ?? {}
        const threads = Array.isArray(data.threads) ? data.threads : []
        const reviews = new Map(
          listReviews(db, 'image').map((review) => [review.targetId, review]),
        )
        const images = threads
          .filter((thread) => thread.attachment?.url && !thread.withdrawnAt)
          .map((thread) => {
            const review = reviews.get(thread.attachment.url)
            return {
              url: thread.attachment.url,
              name: thread.attachment.name,
              type: thread.attachment.type,
              threadId: thread.id,
              courseId: thread.courseId,
              question: thread.question,
              createdAt: Number(thread.createdAt ?? 0),
              student: {
                id: thread.student?.id ?? '',
                name: thread.student?.name ?? '',
                anonymous: Boolean(thread.student?.anonymous),
              },
              review: review?.status ?? 'pending',
              reason: review?.reason ?? '',
              reviewedBy: review?.reviewedBy ?? '',
              reviewedAt: review?.reviewedAt ?? null,
            }
          })
          .sort(
            (a, b) =>
              Number(a.review !== 'pending') - Number(b.review !== 'pending') ||
              b.createdAt - a.createdAt,
          )
        return sendJson(res, 200, { images })
      }

      if (pathname === '/api/admin/moderation/images/review' && req.method === 'POST') {
        const admin = requireAdmin(req)
        if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
        const body = await readJson(req, SMALL_BODY_LIMIT)
        const action = ['approve', 'reject'].includes(body.action) ? body.action : null
        if (!action) return sendError(res, 400, '审核动作不合法。')
        const threadId = String(body.threadId ?? '')
        const imageUrl = String(body.url ?? '')
        if (!threadId || !imageUrl) return sendError(res, 400, '缺少问答或图片地址。')
        const data = parsedWorkspace(workspaceRow(db)) ?? {}
        const thread = (data.threads ?? []).find((item) => item.id === threadId)
        if (!thread || thread.attachment?.url !== imageUrl) {
          return sendError(res, 404, '图片不存在或已被撤下。')
        }
        const reason = String(body.reason ?? '').trim().slice(0, 500)
        if (action === 'reject' && reason.length < 2) {
          return sendError(res, 400, '拒绝图片时请填写原因。')
        }
        if (action === 'approve') {
          upsertReview(db, {
            kind: 'image',
            targetId: imageUrl,
            threadId,
            status: 'approved',
            reason,
            reviewer: admin.name,
          })
          recordAudit(db, {
            user: admin,
            action: 'moderation-image-review',
            actions: ['moderation-image-review'],
            summary: `通过图片审核：${String(thread.question ?? '').slice(0, 50)}`,
            courseIds: [thread.courseId].filter(Boolean),
          })
          return sendJson(res, 200, { ok: true, status: 'approved' })
        }
        const result = mutateWorkspaceAsAdmin(db, {
          user: admin,
          action: 'moderation-image-review',
          summary: `拒绝图片并移除附件：${String(thread.question ?? '').slice(0, 50)}（${reason}）`,
          courseIds: [thread.courseId].filter(Boolean),
          mutate: (next) => {
            const target = (next.threads ?? []).find((item) => item.id === threadId)
            if (!target || target.attachment?.url !== imageUrl) return false
            delete target.attachment
            target.moderation = {
              status: 'image-rejected',
              reason,
              by: admin.id,
              at: Date.now(),
            }
            return true
          },
        })
        upsertReview(db, {
          kind: 'image',
          targetId: imageUrl,
          threadId,
          status: 'rejected',
          reason,
          reviewer: admin.name,
        })
        return sendJson(res, 200, { ok: true, status: 'rejected', revision: result.revision })
      }

      if (pathname === '/api/admin/campus/verification' && req.method === 'GET') {
        requireAdmin(req)
        const data = parsedWorkspace(workspaceRow(db)) ?? {}
        const result = campusReviewSummary(data)
        return sendJson(res, 200, result)
      }

      const campusVerifyMatch =
        /^\/api\/admin\/campus\/faqs\/([\w.-]+)\/verify$/.exec(pathname)
      if (campusVerifyMatch && req.method === 'POST') {
        const admin = requireAdmin(req)
        if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
        const body = await readJson(req, SMALL_BODY_LIMIT)
        const intervalDays = Number(body.intervalDays)
        if (!Number.isFinite(intervalDays) || intervalDays < 7 || intervalDays > 730) {
          return sendError(res, 400, '复核周期需要在 7–730 天之间。')
        }
        const faqId = decodeURIComponent(campusVerifyMatch[1])
        const data = parsedWorkspace(workspaceRow(db)) ?? {}
        const original = (data.faqs ?? []).find(
          (faq) => faq.id === faqId && faq.courseId === 'campus',
        )
        if (!original) return sendError(res, 404, '校园 FAQ 不存在。')
        const note = String(body.note ?? '').trim().slice(0, 500)
        const now = Date.now()
        const result = mutateWorkspaceAsAdmin(db, {
          user: admin,
          action: 'campus-faq-verify',
          summary: `核实校园 FAQ：${String(original.question ?? '').slice(0, 60)}（${intervalDays} 天）${note ? ` · ${note}` : ''}`,
          courseIds: ['campus'],
          mutate: (next) => {
            const target = (next.faqs ?? []).find((faq) => faq.id === faqId)
            if (!target) return false
            target.lastVerifiedAt = now
            target.reviewIntervalDays = intervalDays
            target.nextReviewAt = now + intervalDays * 86_400_000
            target.reviewNeeded = false
            target.verifiedBy = admin.name
            if (String(target.credibility ?? '').startsWith('D')) {
              target.credibility = 'V-已核实'
            }
            if (note) target.reviewNote = note
            return true
          },
        })
        const updated = (result.data.faqs ?? []).find((faq) => faq.id === faqId)
        return sendJson(res, 200, {
          ok: true,
          revision: result.revision,
          item: updated ? reviewStateForFaq(updated, now) : null,
        })
      }

      if (pathname === '/api/admin/audit' && req.method === 'GET') {
        requireAdmin(req)
        const limit = Number(url.searchParams.get('limit') ?? 120)
        return sendJson(res, 200, { logs: listAudit(db, limit) })
      }

      if (pathname === '/api/admin/archived-threads' && req.method === 'GET') {
        requireAdmin(req)
        const limit = Number(url.searchParams.get('limit') ?? 100)
        return sendJson(res, 200, { threads: listArchivedThreads(db, limit) })
      }

      if (pathname === '/api/admin/ai-usage' && req.method === 'GET') {
        requireAdmin(req)
        const since = Date.now() - 7 * 86_400_000
        const rows = db
          .prepare(
            `SELECT user_id, model, prompt_tokens, completion_tokens, status, created_at
               FROM ai_usage
              WHERE created_at >= ?
              ORDER BY created_at DESC`,
          )
          .all(since)
        const userRows = db.prepare('SELECT id, name, email, role FROM users').all()
        const userMap = new Map(userRows.map((row) => [row.id, row]))
        const pad = (value) => String(value).padStart(2, '0')
        const dayKey = (ts) => {
          const date = new Date(ts)
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        }
        const today = dayStart()
        const days = new Map()
        const users = new Map()
        let calls = 0
        let tokens = 0
        let errors = 0
        let callsToday = 0
        for (const row of rows) {
          const rowTokens = Number(row.prompt_tokens ?? 0) + Number(row.completion_tokens ?? 0)
          calls += 1
          tokens += rowTokens
          if (Number(row.status) >= 400) errors += 1
          if (Number(row.created_at) >= today) callsToday += 1
          const key = dayKey(Number(row.created_at))
          const day = days.get(key) ?? { date: key, calls: 0, tokens: 0, errors: 0 }
          day.calls += 1
          day.tokens += rowTokens
          if (Number(row.status) >= 400) day.errors += 1
          days.set(key, day)
          const user = userMap.get(row.user_id)
          const entry = users.get(row.user_id) ?? {
            userId: row.user_id,
            name: user?.name ?? '未知账号',
            role: user?.role ?? 'student',
            calls: 0,
            tokens: 0,
          }
          entry.calls += 1
          entry.tokens += rowTokens
          users.set(row.user_id, entry)
        }
        return sendJson(res, 200, {
          configured: config.ai.configured,
          model: config.ai.model,
          dailyLimit: config.ai.dailyLimit,
          totals: { calls, tokens, errors, callsToday },
          days: Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date)),
          topUsers: Array.from(users.values())
            .sort((a, b) => b.calls - a.calls)
            .slice(0, 8),
        })
      }

      if (pathname === '/api/state' && req.method === 'GET') {
        const user = requireUser(req)
        const row = workspaceRow(db)
        return sendJson(res, 200, {
          data: projectWorkspace(parsedWorkspace(row), user),
          revision: Number(row?.revision ?? 0),
          updatedAt: Number(row?.updated_at ?? 0),
          updatedBy: row?.updated_by ?? null,
          currentUserId: user.id,
        })
      }

      if (pathname === '/api/state/revision' && req.method === 'GET') {
        requireUser(req)
        const row = workspaceRow(db)
        return sendJson(res, 200, {
          revision: Number(row?.revision ?? 0),
          updatedAt: Number(row?.updated_at ?? 0),
        })
      }

      // 动作 API：单动作事务化写入，复用整包同步的校验语义。
      if (pathname === '/api/threads' && req.method === 'POST') {
        const body = await readJson(req, ACTION_BODY_LIMIT)
        return await runAction(req, res, 'thread-create', body)
      }

      const threadActionMatch =
        /^\/api\/threads\/([\w.-]+)\/(escalate|feedback|resolve|withdraw|favorite|supplement|reply|undo-reply|request-info|withdraw-request)$/.exec(
          pathname,
        )
      if (threadActionMatch && req.method === 'POST') {
        const body = await readJson(req, ACTION_BODY_LIMIT)
        return await runAction(req, res, `thread-${threadActionMatch[2]}`, {
          ...body,
          threadId: threadActionMatch[1],
        })
      }

      if (pathname === '/api/faqs' && req.method === 'POST') {
        const body = await readJson(req, ACTION_BODY_LIMIT)
        return await runAction(req, res, 'faq-save', body)
      }

      const faqActionMatch = /^\/api\/faqs\/([\w.-]+)$/.exec(pathname)
      if (faqActionMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
        let body = {}
        if (req.method === 'PUT') {
          body = await readJson(req, ACTION_BODY_LIMIT)
        } else {
          try {
            body = await readJson(req, ACTION_BODY_LIMIT)
          } catch {
            // 无请求体的 DELETE 也允许：baseRevision 走不到校验会另行报错。
            body = {}
          }
        }
        return await runAction(req, res, req.method === 'PUT' ? 'faq-save' : 'faq-remove', {
          ...body,
          faq: { ...(body.faq ?? {}), id: body.faq?.id ?? faqActionMatch[1] },
          faqId: faqActionMatch[1],
        })
      }

      if (pathname === '/api/notifications/read' && req.method === 'POST') {
        const body = await readJson(req, ACTION_BODY_LIMIT)
        return await runAction(req, res, 'notifications-read', body)
      }

      if (pathname === '/api/state' && req.method === 'PUT') {
        const user = requireUser(req)
        if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
        const body = await readJson(req, STATE_BODY_LIMIT)
        if (!validateState(body.data)) return sendError(res, 400, '工作区数据结构不正确。')
        const baseRevision = Number(body.baseRevision)
        if (!Number.isFinite(baseRevision) || baseRevision < 0) {
          return sendError(res, 400, '缺少工作区版本号。')
        }
        const row = workspaceRow(db)
        const currentRevision = Number(row?.revision ?? 0)
        if (currentRevision !== baseRevision) {
          return sendJson(res, 409, {
            error: { message: '共享空间已有更新，已为你载入最新版本。' },
            data: projectWorkspace(parsedWorkspace(row), user),
            revision: currentRevision,
            updatedAt: Number(row?.updated_at ?? 0),
          })
        }
        const prev = parsedWorkspace(row)
        const incomingThreads = Array.isArray(body.data?.threads) ? body.data.threads : []
        const prevThreadMap = new Map(
          (Array.isArray(prev?.threads) ? prev.threads : []).map((thread) => [thread.id, thread]),
        )
        const newOrChanged = incomingThreads.filter(
          (thread) =>
            thread &&
            typeof thread.id === 'string' &&
            (!prevThreadMap.has(thread.id) ||
              prevThreadMap.get(thread.id)?.question !== thread.question),
        )
        if (newOrChanged.length > 0) {
          assertUserCanWrite(user, 'post')
          const terms = activeTerms(db)
          for (const thread of newOrChanged) {
            const blockedTerm = findBlockedTermInThread(thread, terms)
            if (blockedTerm) {
              recordAudit(db, {
                user,
                revision: Number(row?.revision ?? 0),
                action: 'moderation-blocked',
                actions: ['moderation-blocked'],
                summary: `内容包含敏感词「${blockedTerm}」，已拒绝提交`,
                courseIds: [thread.courseId].filter(Boolean),
              })
              return sendError(res, 400, `内容包含不允许的词：${blockedTerm}`)
            }
          }
        }
        let merged
        try {
          merged = authorizeAndMerge({
            prev,
            next: body.data,
            user,
            mode: body.mode,
          })
        } catch (error) {
          if (error instanceof HttpError && error.status === 403) {
            recordAudit(db, {
              user,
              revision: currentRevision,
              action: 'permission-denied',
              actions: ['permission-denied'],
              summary: `越权操作被拒绝：${error.message}`,
              courseIds: [],
            })
          }
          throw error
        }
        if (!validateState(merged)) return sendError(res, 400, '工作区数据结构不正确。')
        const serialized = JSON.stringify(merged)
        if (Buffer.byteLength(serialized, 'utf8') > STATE_BODY_LIMIT) {
          return sendError(res, 413, '工作区数据过大。')
        }
        const now = Date.now()
        const result = db
          .prepare(
            `UPDATE workspaces
                SET data_json = ?, revision = revision + 1, updated_at = ?, updated_by = ?
              WHERE id = ? AND revision = ?`,
          )
          .run(serialized, now, user.id, WORKSPACE_ID, currentRevision)
        if (Number(result.changes) === 0) {
          const latest = workspaceRow(db)
          return sendJson(res, 409, {
            error: { message: '共享空间已有更新，已为你载入最新版本。' },
            data: projectWorkspace(parsedWorkspace(latest), user),
            revision: Number(latest?.revision ?? 0),
            updatedAt: Number(latest?.updated_at ?? 0),
          })
        }
        const change = summarizeStateChange({ prev, next: merged, mode: body.mode })
        recordAudit(db, {
          user,
          revision: currentRevision + 1,
          action: change.action,
          actions: change.actions,
          summary: change.summary,
          courseIds: change.courseIds,
          mode: body.mode ?? null,
        })
        if (!body.mode) {
          const replyEntries = collectNewReplyRecipients(prev, merged)
          if (replyEntries.length > 0) {
            void sendReplyEmails(db, config, replyEntries)
          }
        }
        try {
          syncWorkspaceEntities(db, merged, now)
        } catch {
          // 实体镜像尽力而为；工作区本体已经落库，下次写入会重新对齐。
        }
        return sendJson(res, 200, {
          revision: currentRevision + 1,
          updatedAt: now,
          updatedBy: user.id,
          data: projectWorkspace(merged, user),
        })
      }

      if (pathname === '/api/profile' && req.method === 'PUT') {
        const user = requireUser(req)
        if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
        if (user.role !== 'student') return sendError(res, 403, '教师账号不需要学生资料。')
        const body = await readJson(req, SMALL_BODY_LIMIT)
        if (!body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) {
          return sendError(res, 400, '资料格式不正确。')
        }
        const serialized = JSON.stringify(body.profile)
        if (Buffer.byteLength(serialized, 'utf8') > SMALL_BODY_LIMIT) {
          return sendError(res, 413, '资料数据过大。')
        }
        db.prepare('UPDATE users SET profile_json = ? WHERE id = ?').run(serialized, user.id)
        return sendJson(res, 200, { profile: body.profile })
      }

      if (pathname === '/api/uploads/image' && req.method === 'POST') {
        const user = requireUser(req)
        if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
        assertUserCanWrite(user, 'post')
        const body = await readJson(req, UPLOAD_BODY_LIMIT)
        const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
          String(body.dataUrl ?? ''),
        )
        if (!match) return sendError(res, 400, '只支持 PNG、JPEG 或 WebP 题目图片。')
        const mime = `image/${match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()}`
        const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
        if (buffer.length === 0) return sendError(res, 400, '图片内容为空。')
        if (buffer.length > MAX_UPLOAD_BYTES) return sendError(res, 413, '图片超过 2MB，请压缩后再试。')
        const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
        const isPng =
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47
        const isWebp =
          buffer.toString('ascii', 0, 4) === 'RIFF' &&
          buffer.toString('ascii', 8, 12) === 'WEBP'
        if (
          (mime === 'image/jpeg' && !isJpeg) ||
          (mime === 'image/png' && !isPng) ||
          (mime === 'image/webp' && !isWebp)
        ) {
          return sendError(res, 400, '图片内容与文件类型不一致。')
        }
        const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'
        const id = newId('img')
        let stored
        try {
          stored = await saveUpload(config, buffer, { id, ext, mime })
        } catch (error) {
          return sendError(res, 502, error instanceof Error ? error.message : '图片存储失败。')
        }
        db.prepare(
          'INSERT INTO uploads (id, user_id, mime, size, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(id, user.id, mime, buffer.length, Date.now())
        return sendJson(res, 201, {
          url: stored.url,
          storage: stored.storage,
          name: String(body.name ?? '题目图片').slice(0, 200),
          type: mime,
        })
      }

      if (pathname === '/api/ai/status' && req.method === 'GET') {
        const user = requireUser(req)
        return sendJson(res, 200, {
          configured: config.ai.configured,
          model: config.ai.configured ? config.ai.model : null,
          usedToday: usageToday(db, user.id),
          dailyLimit: aiDailyLimitFor(config, user.role),
        })
      }

      if (pathname === '/api/ai/chat/completions' && req.method === 'POST') {
        const user = requireUser(req)
        if (!sameOrigin(req)) return sendError(res, 403, '请求来源不合法。')
        assertUserCanWrite(user, 'post')
        const body = await readJson(req, CHAT_BODY_LIMIT)
        const messages = sanitizeMessages(body.messages)
        const blockedTerm = findBlockedTerm(config, messages)
        if (blockedTerm) {
          return sendError(res, 400, '问题包含不被允许的内容，请调整后再试。')
        }
        const dbTerms = activeTerms(db)
        const dbBlockedTerm =
          messages
            .map((message) => {
              const content = message?.content
              return typeof content === 'string'
                ? content
                : Array.isArray(content)
                  ? content
                      .map((part) => (part?.type === 'text' ? part.text : ''))
                      .join('\n')
                  : ''
            })
            .map((text) => findModerationTerm(text, dbTerms))
            .find(Boolean) ?? null
        if (dbBlockedTerm) {
          return sendError(res, 400, `问题包含不允许的词：${dbBlockedTerm}`)
        }
        if (!config.ai.configured) {
          return sendError(res, 503, '服务端 AI 网关尚未配置，请联系管理员设置 AI_API_KEY。')
        }
        const dailyLimit = aiDailyLimitFor(config, user.role)
        const used = usageToday(db, user.id)
        if (used >= dailyLimit) {
          return sendError(res, 429, `今日 AI 调用额度已用完（${dailyLimit} 次），请明天再试或联系老师。`)
        }
        const wantStream = body.stream === true
        const upstreamBody = {
          model: config.ai.model,
          messages: redactMessages(messages),
          temperature: clamp(body.temperature, 0, 1.2, 0.2),
          max_tokens: Math.round(clamp(body.max_tokens, 64, AI_MAX_TOKENS, AI_DEFAULT_MAX_TOKENS)),
          stream: wantStream,
        }
        if (wantStream) upstreamBody.stream_options = { include_usage: true }
        if (body.enable_thinking === false) upstreamBody.enable_thinking = false

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs)
        let upstream
        try {
          upstream = await fetch(upstreamEndpoint(config.ai.baseUrl), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.ai.apiKey}`,
            },
            body: JSON.stringify(upstreamBody),
            signal: controller.signal,
          })
        } catch (error) {
          clearTimeout(timeout)
          const aborted = error instanceof DOMException && error.name === 'AbortError'
          try {
            db.prepare(
              'INSERT INTO ai_usage (user_id, model, status, created_at) VALUES (?, ?, ?, ?)',
            ).run(user.id, config.ai.model, aborted ? 504 : 502, Date.now())
          } catch {
            // Usage logging must never mask the real failure.
          }
          if (aborted) return sendError(res, 504, '上游模型请求超时，请稍后重试。')
          return sendError(res, 502, '服务端无法连接上游模型，请检查网关配置或网络。')
        }

        const logUsage = (promptTokens, completionTokens, status) => {
          try {
            db.prepare(
              `INSERT INTO ai_usage
                 (user_id, model, prompt_tokens, completion_tokens, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            ).run(
              user.id,
              config.ai.model,
              Number.isFinite(promptTokens) ? promptTokens : 0,
              Number.isFinite(completionTokens) ? completionTokens : 0,
              status,
              Date.now(),
            )
          } catch {
            // Usage logging is best-effort.
          }
        }

        const readUsage = (raw) => {
          const usage = { promptTokens: 0, completionTokens: 0 }
          for (const line of raw.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const parsed = JSON.parse(payload)
              if (parsed?.usage) {
                usage.promptTokens = Number(parsed.usage.prompt_tokens ?? 0) || usage.promptTokens
                usage.completionTokens =
                  Number(parsed.usage.completion_tokens ?? 0) || usage.completionTokens
              }
            } catch {
              // Ignore malformed SSE chunks when tallying usage.
            }
          }
          return usage
        }

        if (!upstream.ok) {
          clearTimeout(timeout)
          let raw = ''
          try {
            raw = await upstream.text()
          } catch {
            raw = ''
          }
          const usage = readUsage(raw)
          logUsage(usage.promptTokens, usage.completionTokens, upstream.status)
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('X-Content-Type-Options', 'nosniff')
          res.setHeader('x-shishuo-ai-proxy', '1')
          return res.end(JSON.stringify({ error: { message: pickUpstreamMessage(upstream.status, raw) } }))
        }

        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('x-shishuo-ai-proxy', '1')

        if (!wantStream) {
          const raw = await upstream.text()
          clearTimeout(timeout)
          let promptTokens = 0
          let completionTokens = 0
          try {
            const parsed = JSON.parse(raw)
            promptTokens = Number(parsed?.usage?.prompt_tokens ?? 0)
            completionTokens = Number(parsed?.usage?.completion_tokens ?? 0)
          } catch {
            // Non-JSON upstream payloads are still logged below.
          }
          logUsage(promptTokens, completionTokens, upstream.status)
          res.statusCode = upstream.status
          res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
          )
          return res.end(raw)
        }

        // 流式：把上游 SSE 逐块透传，客户端边收边渲染。
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('X-Accel-Buffering', 'no')
        let streamRaw = ''
        const decoder = new TextDecoder()
        try {
          for await (const chunk of upstream.body) {
            streamRaw += decoder.decode(chunk, { stream: true })
            res.write(chunk)
          }
          streamRaw += decoder.decode()
        } catch {
          // 上游中断：直接收尾，客户端按未完成内容处理。
        } finally {
          clearTimeout(timeout)
          if (!res.writableEnded) res.end()
        }
        const usage = readUsage(streamRaw)
        logUsage(usage.promptTokens, usage.completionTokens, upstream.status)
        return
      }

      if (pathname.startsWith('/api/')) {
        return sendError(res, 404, '接口不存在。')
      }

      return false
    } catch (error) {
      if (error instanceof HttpError) {
        return sendError(res, error.status, error.message)
      }
      return sendError(res, 500, '服务器开小差了，请稍后重试。')
    }
  }
}
