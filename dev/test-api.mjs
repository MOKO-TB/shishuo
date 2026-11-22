/**
 * 权限回归测试：起一个临时数据库的师说服务端，直接打本地 API，
 * 固化 README「验证记录」里的核心权限断言。不会碰 data/shishuo.db。
 *
 * 运行：npm run test:api
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { rmSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase, WORKSPACE_ID } from '../server/db.mjs'
import { loadConfig } from '../server/config.mjs'
import { archiveOldThreads } from '../server/maintenance.mjs'
import { redactText } from '../server/redact.mjs'
import { signS3Request } from '../server/storage.mjs'

const sha256 = (data) => createHash('sha256').update(data).digest('hex')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 8790 + Math.floor(Math.random() * 40)
const MOCK_S3_PORT = 8830 + Math.floor(Math.random() * 40)
const BASE = `http://127.0.0.1:${PORT}`
const DB_PATH = path.join(ROOT, 'data', `test-api-${process.pid}.db`)
const UPLOADS_DIR = path.join(ROOT, 'data', `test-api-uploads-${process.pid}`)

let server
let mockS3Ref = null
const session = new Map() // 账号名 -> { cookie, user }
const s3Objects = new Map() // mock S3：url -> object bytes

function cleanDatabases() {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${DB_PATH}${suffix}`, { force: true })
  }
  rmSync(UPLOADS_DIR, { recursive: true, force: true })
}

async function api(pathname, { method = 'GET', as, body, cookie } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  headers.Origin = BASE
  const sessionCookie = cookie ?? (as ? session.get(as)?.cookie : undefined)
  if (sessionCookie) headers.Cookie = sessionCookie
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }
  return { status: response.status, json, setCookie: response.headers.get('set-cookie') ?? '' }
}

async function login(name, email, password) {
  const result = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  assert.equal(result.status, 200, `${name} 应该能登录`)
  const cookie = result.setCookie.split(';')[0]
  assert.ok(cookie.includes('='), `${name} 登录应下发会话 Cookie`)
  session.set(name, { cookie, user: result.json.user })
  return result.json.user
}

async function state(as) {
  const result = await api('/api/state', { as })
  assert.equal(result.status, 200, `${as} 应能读取工作区`)
  return result
}

async function putState(as, data, baseRevision, extra = {}) {
  return api('/api/state', {
    method: 'PUT',
    as,
    body: { data, baseRevision, ...extra },
  })
}

/** 动作 API：先探 revision 再提交动作，模拟真实客户端。 */
async function runAction(as, path, payload = {}, method = 'POST') {
  const probe = await api('/api/state/revision', { as })
  return api(path, {
    method,
    as,
    body: { ...payload, baseRevision: probe.json.revision },
  })
}

const DAY = 86_400_000

function seedWorkspace(user) {
  const now = Date.now()
  const faq = (id, courseId, question, answer, author) => ({
    id,
    courseId,
    question,
    aliases: [],
    answer,
    tags: [],
    author,
    source: 'teacher',
    createdAt: now - 30 * DAY,
    updatedAt: now - 5 * DAY,
    citations: 0,
    helpful: 0,
    unhelpful: 0,
    chapter: '第 1 章',
  })
  return {
    version: 18,
    seededAt: now,
    threads: [
      {
        id: 's1-thread-old',
        courseId: 'ds',
        student: { id: user.id, name: user.name, anonymous: false },
        question: '很久以前问过的递归问题',
        createdAt: now - 200 * DAY,
        status: 'answered',
        kind: 'ask',
        teacherReply: {
          text: '先写出递归树再判断规模。',
          at: now - 199 * DAY,
          by: '陈砚',
        },
        resolvedAt: now - 198 * DAY,
      },
    ],
    faqs: [
      faq('test-faq-ds', 'ds', '时间复杂度怎么算？', '把循环展开看增长量级。', '陈砚'),
      faq('test-faq-math', 'math', '极限怎么求？', '先判型，再选方法。', '李芸'),
    ],
    daily: [],
    notifications: [],
    courseNotes: [
      {
        courseId: 'ds',
        teacher: '陈砚',
        announcement: '欢迎提问',
        officeHours: '周三 15:00',
        updatedAt: now,
      },
    ],
    duplicatesMerged: 0,
    guideSeen: true,
  }
}

function makeThread(id, user, question, courseId = 'ds', status = 'pending') {
  return {
    id,
    courseId,
    student: { id: user.id, name: user.name, anonymous: false },
    question,
    createdAt: Date.now(),
    status,
    kind: 'ask',
  }
}

before(async () => {
  cleanDatabases()
  // mock S3：校验 SigV4 签名头并落对象，替代真实云存储。
  const mockS3 = createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const auth = String(req.headers.authorization ?? '')
      if (!auth.startsWith('AWS4-HMAC-SHA256')) {
        res.statusCode = 401
        res.end('missing signature')
        return
      }
      const body = Buffer.concat(chunks)
      const declared = String(req.headers['x-amz-content-sha256'] ?? '')
      if (declared && declared !== sha256(body)) {
        res.statusCode = 400
        res.end('payload hash mismatch')
        return
      }
      s3Objects.set(req.url, body)
      res.statusCode = 200
      res.setHeader('etag', '"mock"')
      res.end()
    })
  })
  await new Promise((resolve) => mockS3.listen(MOCK_S3_PORT, '127.0.0.1', resolve))
  mockS3Ref = mockS3

  server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SHISHUO_DB: DB_PATH,
      SHISHUO_UPLOADS_DIR: UPLOADS_DIR,
      SHISHUO_DEMO_ACCOUNTS: '1',
      AUTH_SECRET: 'test-api-secret',
      MAIL_DEV_MODE: '0',
      AI_DAILY_LIMIT_STUDENT: '3',
      AI_BLOCKLIST: '测试拦截词',
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: `http://127.0.0.1:${MOCK_S3_PORT}`,
      S3_BUCKET: 'shishuo-test',
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  const deadline = Date.now() + 15_000
  for (;;) {
    try {
      const result = await api('/api/health')
      if (result.status === 200) break
    } catch {
      // 服务还在启动
    }
    if (Date.now() > deadline) throw new Error('测试服务端启动超时')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
})

after(async () => {
  if (server) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    server.kill()
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3_000))])
  }
  if (mockS3Ref) {
    await new Promise((resolve) => mockS3Ref.close(resolve))
  }
  try {
    cleanDatabases()
  } catch {
    // Windows 上进程刚退出时文件句柄可能尚未释放；临时库带 pid 后缀，不会互相干扰。
  }
})

test('未登录访问 /api/auth/me 返回空用户', async () => {
  const result = await api('/api/auth/me')
  assert.equal(result.status, 200)
  assert.equal(result.json.user, null)
})

test('错误密码登录被拒绝', async () => {
  const result = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'student@shishuo.local', password: 'wrong-password' },
  })
  assert.equal(result.status, 401)
})

test('演示账号登录并初始化工作区', async () => {
  const student1 = await login('student1', 'student@shishuo.local', 'student123')
  await login('student2', 'student2@shishuo.local', 'student123')
  const teacherDs = await login('teacherDs', 'teacher@shishuo.local', 'teacher123')
  const admin = await login('admin', 'admin@shishuo.local', 'admin123')
  await login('teacherMath', 'teacher.math@shishuo.local', 'teacher123')
  assert.equal(admin.isAdmin, true, '独立管理员账号应拥有管理权限')
  assert.equal(teacherDs.isAdmin, false, '课程教师不再是管理员')

  const seeded = await putState('student1', seedWorkspace(student1), 0)
  assert.equal(seeded.status, 200, '首个账号应能初始化工作区')
  assert.ok(seeded.json.revision >= 1)

  const current = await state('student1')
  assert.ok(Array.isArray(current.json.data.faqs))
  assert.equal(current.json.currentUserId, student1.id)
  assert.ok(teacherDs.id)
})

test('学生可以新建自己的提问', async () => {
  const current = await state('student1')
  const thread = makeThread('s1-thread-1', session.get('student1').user, '什么是摊还分析？')
  const result = await putState(
    'student1',
    { ...current.json.data, threads: [...current.json.data.threads, thread] },
    current.json.revision,
  )
  assert.equal(result.status, 200)
})

test('学生不能改写课程 FAQ 正文', async () => {
  const current = await state('student1')
  const faqs = current.json.data.faqs.map((faq) =>
    faq.id === 'test-faq-ds' ? { ...faq, answer: '被学生篡改的答案' } : faq,
  )
  const result = await putState(
    'student1',
    { ...current.json.data, faqs },
    current.json.revision,
  )
  assert.equal(result.status, 403)
})

test('学生不能虚增 FAQ 引用计数', async () => {
  const current = await state('student1')
  const faqs = current.json.data.faqs.map((faq) =>
    faq.id === 'test-faq-ds' ? { ...faq, citations: (faq.citations ?? 0) + 1 } : faq,
  )
  const result = await putState(
    'student1',
    { ...current.json.data, faqs },
    current.json.revision,
  )
  assert.equal(result.status, 403)
})

test('学生不能修改其他同学的问答', async () => {
  const student2 = session.get('student2').user
  const own = await state('student2')
  const thread2 = makeThread('s2-thread-1', student2, '红黑树删除怎么调整？')
  const created = await putState(
    'student2',
    { ...own.json.data, threads: [...own.json.data.threads, thread2] },
    own.json.revision,
  )
  assert.equal(created.status, 200)

  // 学生 1 的投影里看不到学生 2 的问答，构造越权载荷塞进去。
  const current = await state('student1')
  const tampered = { ...thread2, question: '被同学篡改的问题' }
  const threads = [
    ...current.json.data.threads.filter((thread) => thread.id !== thread2.id),
    tampered,
  ]
  const result = await putState(
    'student1',
    { ...current.json.data, threads },
    current.json.revision,
  )
  assert.equal(result.status, 403)
})

test('学生不能伪造老师回复', async () => {
  const current = await state('student1')
  const threads = current.json.data.threads.map((thread) =>
    thread.id === 's1-thread-1'
      ? {
          ...thread,
          status: 'answered',
          teacherReply: { text: '伪造的老师回复', at: Date.now(), by: '陈砚' },
        }
      : thread,
  )
  const result = await putState(
    'student1',
    { ...current.json.data, threads },
    current.json.revision,
  )
  assert.equal(result.status, 403)
})

test('学生不能修改课程公告', async () => {
  const current = await state('student1')
  const courseNotes = current.json.data.courseNotes.map((note) =>
    note.courseId === 'ds' ? { ...note, announcement: '被学生改掉的公告' } : note,
  )
  const result = await putState(
    'student1',
    { ...current.json.data, courseNotes },
    current.json.revision,
  )
  assert.equal(result.status, 403)
})

test('教师可以发布带教学进度和有效期的课程公告', async () => {
  const current = await state('teacherDs')
  const courseNotes = current.json.data.courseNotes.map((note) =>
    note.courseId === 'ds'
      ? {
          ...note,
          currentChapter: '第 6 章 · 树与二叉树',
          expiresAt: Date.now() + 7 * 86_400_000,
          publishedAt: Date.now(),
        }
      : note,
  )
  const result = await putState(
    'teacherDs',
    { ...current.json.data, courseNotes },
    current.json.revision,
  )
  assert.equal(result.status, 200)
  const note = result.json.data.courseNotes.find((item) => item.courseId === 'ds')
  assert.equal(note.currentChapter, '第 6 章 · 树与二叉树')
  assert.ok(note.expiresAt > Date.now())
  assert.ok(note.publishedAt > 0)
})

test('学生不能重置共享空间', async () => {
  const current = await state('student1')
  const result = await putState('student1', current.json.data, current.json.revision, {
    mode: 'reset',
  })
  assert.equal(result.status, 403)
})

test('学生不能给自己以外的同学创建通知', async () => {
  const current = await state('student1')
  const student2 = session.get('student2').user
  const notification = {
    id: 'bad-notification',
    audience: 'student',
    recipientId: student2.id,
    courseId: 'ds',
    threadId: 's2-thread-1',
    kind: 'teacher-reply',
    title: '伪造通知',
    body: '不该送达',
    createdAt: Date.now(),
    read: false,
  }
  const result = await putState(
    'student1',
    {
      ...current.json.data,
      notifications: [...current.json.data.notifications, notification],
    },
    current.json.revision,
  )
  assert.equal(result.status, 403)
})

test('教师不能跨课程修改其他课程的 FAQ', async () => {
  const mathView = await state('teacherMath')
  assert.equal(
    mathView.json.data.faqs.some((faq) => faq.courseId === 'ds'),
    false,
    '数学老师的投影里不该有数据结构 FAQ',
  )
  const dsFaq = {
    id: 'test-faq-ds',
    courseId: 'ds',
    question: '时间复杂度怎么算？',
    aliases: [],
    answer: '被数学老师跨课篡改',
    tags: [],
    author: '陈砚',
    source: 'teacher',
    createdAt: Date.now() - 30 * DAY,
    updatedAt: Date.now(),
    citations: 0,
    helpful: 0,
    unhelpful: 0,
    chapter: '第 1 章',
  }
  const result = await putState(
    'teacherMath',
    {
      ...mathView.json.data,
      faqs: [...mathView.json.data.faqs, dsFaq],
    },
    mathView.json.revision,
  )
  assert.equal(result.status, 403)
})

test('教师不能改写学生的提问正文', async () => {
  const current = await state('teacherDs')
  const threads = current.json.data.threads.map((thread) =>
    thread.id === 's1-thread-1' ? { ...thread, question: '被老师改掉的问题' } : thread,
  )
  const result = await putState(
    'teacherDs',
    { ...current.json.data, threads },
    current.json.revision,
  )
  assert.equal(result.status, 403)
})

test('教师不能新增学生问答', async () => {
  const current = await state('teacherDs')
  const fake = makeThread('teacher-fake-thread', session.get('student1').user, '老师代提问')
  const result = await putState(
    'teacherDs',
    { ...current.json.data, threads: [...current.json.data.threads, fake] },
    current.json.revision,
  )
  assert.equal(result.status, 403)
})

test('教师可以回复待办问题', async () => {
  const current = await state('teacherDs')
  const threads = current.json.data.threads.map((thread) =>
    thread.id === 's1-thread-1'
      ? {
          ...thread,
          status: 'answered',
          teacherReply: {
            text: '先看循环次数随规模的增长。',
            at: Date.now(),
            by: '陈砚',
          },
        }
      : thread,
  )
  const result = await putState(
    'teacherDs',
    { ...current.json.data, threads },
    current.json.revision,
  )
  assert.equal(result.status, 200)
  const answered = result.json.data.threads.find((thread) => thread.id === 's1-thread-1')
  assert.equal(answered.status, 'answered')
  assert.equal(answered.teacherReply.by, '陈砚')
})

test('教师不能直接改写已发送的回复', async () => {
  const current = await state('teacherDs')
  const threads = current.json.data.threads.map((thread) =>
    thread.id === 's1-thread-1'
      ? {
          ...thread,
          teacherReply: { ...thread.teacherReply, text: '悄悄改掉已发送的回复' },
        }
      : thread,
  )
  const result = await putState(
    'teacherDs',
    { ...current.json.data, threads },
    current.json.revision,
  )
  assert.equal(result.status, 403)
})

test('教师可以更正 AI 直接回答的问题', async () => {
  const studentCurrent = await state('student1')
  const aiThread = makeThread(
    's1-ai-review-thread',
    session.get('student1').user,
    'AI 直接答掉、没有转老师的问题',
    'ds',
    'ai',
  )
  aiThread.aiAnswer = 'AI 给出的原答案'
  aiThread.confidence = 'medium'
  const created = await putState(
    'student1',
    { ...studentCurrent.json.data, threads: [...studentCurrent.json.data.threads, aiThread] },
    studentCurrent.json.revision,
  )
  assert.equal(created.status, 200)

  const teacherCurrent = await state('teacherDs')
  const threads = teacherCurrent.json.data.threads.map((thread) =>
    thread.id === 's1-ai-review-thread'
      ? {
          ...thread,
          status: 'answered',
          teacherReply: {
            text: '更正：这里还要补上边界条件。',
            at: Date.now(),
            by: '陈砚',
            recipientCount: 1,
          },
        }
      : thread,
  )
  const result = await putState(
    'teacherDs',
    { ...teacherCurrent.json.data, threads },
    teacherCurrent.json.revision,
  )
  assert.equal(result.status, 200)
  const answered = result.json.data.threads.find((thread) => thread.id === 's1-ai-review-thread')
  assert.equal(answered.status, 'answered')
  assert.equal(answered.teacherReply.by, '陈砚')
})

test('落后的 baseRevision 返回 409 和最新数据', async () => {
  const current = await state('student1')
  const result = await putState(
    'student1',
    current.json.data,
    Math.max(0, current.json.revision - 1),
  )
  assert.equal(result.status, 409)
  assert.ok(result.json.revision >= current.json.revision)
  assert.ok(result.json.data)
})

test('可见性投影：数学老师看不到数据结构问答', async () => {
  const mathView = await state('teacherMath')
  assert.equal(
    mathView.json.data.threads.some((thread) => thread.courseId === 'ds'),
    false,
  )
})

test('可见性投影：学生只看到自己的问答与同课程待办', async () => {
  const student2View = await state('student2')
  const ids = student2View.json.data.threads.map((thread) => thread.id)
  assert.ok(ids.includes('s2-thread-1'), '自己的问答要能看到')
  assert.ok(
    !ids.includes('s1-thread-1'),
    '同学已处理完的问答不该出现在自己的投影里',
  )
})

test('学生端能看到老师回复，管理审计仅管理员可读', async () => {
  const student1View = await state('student1')
  const mine = student1View.json.data.threads.find((thread) => thread.id === 's1-thread-1')
  assert.equal(mine.teacherReply.by, '陈砚')

  const denied = await api('/api/admin/audit', { as: 'student1' })
  assert.equal(denied.status, 403)

  const audit = await api('/api/admin/audit?limit=100', { as: 'admin' })
  assert.equal(audit.status, 200)
  const actions = audit.json.logs.flatMap((log) => log.actions ?? [])
  assert.ok(
    actions.includes('permission-denied'),
    '越权操作应写入审计日志',
  )
})

test('轻量 revision 探测与工作区一致', async () => {
  const probe = await api('/api/state/revision', { as: 'student1' })
  assert.equal(probe.status, 200)
  const current = await state('student1')
  assert.equal(probe.json.revision, current.json.revision)
})

test('AI 用量统计仅管理员可读', async () => {
  const denied = await api('/api/admin/ai-usage', { as: 'student1' })
  assert.equal(denied.status, 403)

  const usage = await api('/api/admin/ai-usage', { as: 'admin' })
  assert.equal(usage.status, 200)
  assert.ok(usage.json.totals)
  assert.ok(Array.isArray(usage.json.days))
  assert.ok(Array.isArray(usage.json.topUsers))
})

test('管理台汇总仅管理员可读，且统计全量内容', async () => {
  const denied = await api('/api/admin/workspace-summary', { as: 'student1' })
  assert.equal(denied.status, 403)

  const summary = await api('/api/admin/workspace-summary', { as: 'admin' })
  assert.equal(summary.status, 200)
  assert.ok(summary.json.faqs.total >= 1)
  assert.ok(Object.keys(summary.json.faqs.byCourse).length >= 1)
  assert.ok(summary.json.threads.total >= 1)
  assert.ok(Number.isInteger(summary.json.threads.pending))
})

test('实体表镜像：工作区写入同步到 workspace_entities', async () => {
  const db = openDatabase(DB_PATH)
  try {
    const threads = db
      .prepare(
        "SELECT COUNT(*) AS n FROM workspace_entities WHERE workspace_id = ? AND entity_type = 'thread'",
      )
      .get(WORKSPACE_ID)
    assert.equal(Number(threads.n), 4, '四条问答（含种子旧问答与 AI 抽查用例）都应镜像成行')
    const faqs = db
      .prepare(
        "SELECT COUNT(*) AS n FROM workspace_entities WHERE workspace_id = ? AND entity_type = 'faq'",
      )
      .get(WORKSPACE_ID)
    assert.equal(Number(faqs.n), 2)
  } finally {
    db.close()
  }
})

test('归档维护：旧问答移入归档，管理员可查学生不可查', async () => {
  const db = openDatabase(DB_PATH)
  try {
    const result = archiveOldThreads(db, { olderThanMs: 90 * 86_400_000 })
    assert.equal(result.archived, 1, '只有 200 天前结束的种子问答该被归档')
  } finally {
    db.close()
  }

  const view = await state('student1')
  const ids = view.json.data.threads.map((thread) => thread.id)
  assert.ok(!ids.includes('s1-thread-old'), '归档后的问答应离开工作区')
  assert.ok(ids.includes('s1-thread-1'), '近期问答不受归档影响')

  const denied = await api('/api/admin/archived-threads', { as: 'student1' })
  assert.equal(denied.status, 403)

  const list = await api('/api/admin/archived-threads', { as: 'admin' })
  assert.equal(list.status, 200)
  assert.ok(list.json.threads.some((thread) => thread.id === 's1-thread-old'))
})

test('匿名提问：老师能看到转交说明，保存工作区不 403', async () => {
  const student1 = session.get('student1').user
  const created = await runAction('student1', '/api/threads', {
    thread: {
      id: 's1-anon-thread',
      courseId: 'ds',
      student: { id: student1.id, name: student1.name, anonymous: true },
      question: '匿名提问：动态规划的边界怎么处理？',
      createdAt: Date.now(),
      status: 'ai',
      kind: 'ask',
    },
  })
  assert.equal(created.status, 200, JSON.stringify(created.json))
  const escalated = await runAction('student1', '/api/threads/s1-anon-thread/escalate', {
    escalation: {
      title: '动态规划边界',
      note: '作业最后一题要用，麻烦老师今天看一下',
      anonymous: true,
      urgency: 'today',
    },
  })
  assert.equal(escalated.status, 200, JSON.stringify(escalated.json))

  const teacherView = await state('teacherDs')
  const anon = teacherView.json.data.threads.find((thread) => thread.id === 's1-anon-thread')
  assert.equal(anon.student.name, '匿名同学')
  assert.equal(
    anon.escalation.note,
    '作业最后一题要用，麻烦老师今天看一下',
    '老师应看到学生写给老师的转交说明',
  )
  const revision = (await api('/api/state/revision', { as: 'teacherDs' })).json.revision
  const saved = await putState('teacherDs', teacherView.json.data, revision)
  assert.equal(saved.status, 200, JSON.stringify(saved.json))
})

test('动作 API：学生提问 → 转交 → 老师回复 → 撤回，全链路', async () => {
  // 1. 学生用动作 API 新建一条 AI 问答
  const student1 = session.get('student1').user
  const created = await runAction('student1', '/api/threads', {
    thread: {
      id: 's1-action-thread',
      courseId: 'ds',
      student: { id: student1.id, name: student1.name, anonymous: false },
      question: '动作 API 创建的问题：AVL 旋转怎么判断？',
      createdAt: Date.now(),
      status: 'ai',
      kind: 'ask',
    },
  })
  assert.equal(created.status, 200)
  const visible = await state('student1')
  assert.ok(visible.json.data.threads.some((thread) => thread.id === 's1-action-thread'))

  // 2. 学生转交老师（AI → pending，带老师通知）
  const escalated = await runAction('student1', '/api/threads/s1-action-thread/escalate', {
    escalation: { title: 'AVL 旋转', note: '四种旋转总是混', anonymous: false, urgency: 'week' },
  })
  assert.equal(escalated.status, 200)
  const escalatedThread = escalated.json.data.threads.find(
    (thread) => thread.id === 's1-action-thread',
  )
  assert.equal(escalatedThread.status, 'pending')
  assert.ok(escalatedThread.escalation)

  // 3. 老师用动作 API 回复（学生通知同步创建）
  const replied = await runAction('teacherDs', '/api/threads/s1-action-thread/reply', {
    reply: { text: '先看插入路径的祖父关系。', at: Date.now(), by: '陈砚' },
  })
  assert.equal(replied.status, 200)
  const answeredThread = replied.json.data.threads.find(
    (thread) => thread.id === 's1-action-thread',
  )
  assert.equal(answeredThread.status, 'answered')
  const studentView = await state('student1')
  assert.ok(
    studentView.json.data.notifications.some(
      (notification) =>
        notification.kind === 'teacher-reply' && notification.threadId === 's1-action-thread',
    ),
    '动作回复应创建学生通知',
  )

  // 4. 老师撤回回复（退回待办、清掉学生通知）
  const undone = await runAction('teacherDs', '/api/threads/s1-action-thread/undo-reply', {})
  assert.equal(undone.status, 200)
  const undoneThread = undone.json.data.threads.find(
    (thread) => thread.id === 's1-action-thread',
  )
  assert.equal(undoneThread.status, 'pending')
  assert.equal(undoneThread.teacherReply, undefined)
  const afterUndo = await state('student1')
  assert.ok(
    !afterUndo.json.data.notifications.some(
      (notification) =>
        notification.kind === 'teacher-reply' && notification.threadId === 's1-action-thread',
    ),
    '撤回后学生通知应被移除',
  )
})

test('动作 API：学生反馈 / 收藏 / 已解决 / 标记通知已读', async () => {
  const feedback = await runAction('student1', '/api/threads/s1-thread-1/feedback', {
    feedback: 'unhelpful',
    reason: 'skipped-steps',
  })
  assert.equal(feedback.status, 200)
  const feedbackThread = feedback.json.data.threads.find(
    (thread) => thread.id === 's1-thread-1',
  )
  assert.equal(feedbackThread.feedback, 'unhelpful')
  assert.equal(feedbackThread.feedbackReason, 'skipped-steps')

  const clearReason = await runAction('student1', '/api/threads/s1-thread-1/feedback', {
    feedback: 'helpful',
  })
  assert.equal(clearReason.status, 200)
  const clearThread = clearReason.json.data.threads.find(
    (thread) => thread.id === 's1-thread-1',
  )
  assert.equal(clearThread.feedbackReason, undefined)

  const favorite = await runAction('student1', '/api/threads/s1-thread-1/favorite', {
    favorite: true,
  })
  assert.equal(favorite.status, 200)
  assert.equal(
    favorite.json.data.threads.find((thread) => thread.id === 's1-thread-1').favorite,
    true,
  )

  const resolved = await runAction('student1', '/api/threads/s1-thread-1/resolve', {
    resolved: true,
  })
  assert.equal(resolved.status, 200)
  assert.ok(resolved.json.data.threads.find((thread) => thread.id === 's1-thread-1').resolvedAt)

  const studentView = await state('student1')
  const unread = studentView.json.data.notifications.find(
    (notification) => notification.kind === 'teacher-reply' && !notification.read,
  )
  if (unread) {
    const marked = await runAction('student1', '/api/notifications/read', { ids: [unread.id] })
    assert.equal(marked.status, 200)
    const after = marked.json.data.notifications.find((item) => item.id === unread.id)
    assert.equal(after.read, true)
  }
})

test('动作 API：教师 FAQ 增改删，学生被拒', async () => {
  const denied = await runAction('student1', '/api/faqs', {
    faq: {
      id: 'faq-action-denied',
      courseId: 'ds',
      question: '学生想偷偷加的 FAQ',
      aliases: [],
      answer: '不行',
      tags: [],
      author: '林晓',
      source: 'teacher',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      citations: 0,
      helpful: 0,
      unhelpful: 0,
    },
  })
  assert.equal(denied.status, 403)

  const added = await runAction('teacherDs', '/api/faqs', {
    faq: {
      id: 'faq-action-new',
      courseId: 'ds',
      question: '动作 API 新增的 FAQ：什么是堆的下沉？',
      aliases: ['堆下沉'],
      answer: '把大元素往下移到合适的位置。',
      tags: ['堆'],
      author: '陈砚',
      source: 'teacher',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      citations: 0,
      helpful: 0,
      unhelpful: 0,
    },
  })
  assert.equal(added.status, 200)

  const updated = await runAction('teacherDs', '/api/faqs/faq-action-new', {
    faq: {
      id: 'faq-action-new',
      courseId: 'ds',
      question: '动作 API 新增的 FAQ：什么是堆的下沉操作？',
      aliases: ['堆下沉'],
      answer: '把大元素往下移到合适的位置，直到满足堆序。',
      tags: ['堆'],
      author: '陈砚',
      source: 'teacher',
      createdAt: Date.now() - 1_000,
      updatedAt: Date.now(),
      citations: 0,
      helpful: 0,
      unhelpful: 0,
    },
  }, 'PUT')
  assert.equal(updated.status, 200, JSON.stringify(updated.json))
  const updatedFaq = updated.json.data.faqs.find((faq) => faq.id === 'faq-action-new')
  assert.equal(updatedFaq.history?.length, 1, '编辑前应留存历史快照')

  const removed = await runAction('teacherDs', '/api/faqs/faq-action-new', {}, 'DELETE')
  assert.equal(removed.status, 200, JSON.stringify(removed.json))
  assert.ok(!removed.json.data.faqs.some((faq) => faq.id === 'faq-action-new'))
})

test('动作 API：越权与过期版本被拒', async () => {
  const studentReply = await runAction('student1', '/api/threads/s2-thread-1/reply', {
    reply: { text: '学生伪造的回复', at: Date.now(), by: '陈砚' },
  })
  assert.equal(studentReply.status, 403)

  const crossCourse = await runAction('teacherMath', '/api/threads/s2-thread-1/reply', {
    reply: { text: '数学老师跨课回复', at: Date.now(), by: '李芸' },
  })
  assert.equal(crossCourse.status, 403)

  const probe = await api('/api/state/revision', { as: 'student1' })
  const stale = await api('/api/threads/s1-thread-1/feedback', {
    method: 'POST',
    as: 'student1',
    body: {
      feedback: 'unhelpful',
      baseRevision: Math.max(0, probe.json.revision - 1),
    },
  })
  assert.equal(stale.status, 409)
})

test('AI 治理：按角色配额与审核词表', async () => {
  const studentStatus = await api('/api/ai/status', { as: 'student1' })
  assert.equal(studentStatus.status, 200)
  assert.equal(studentStatus.json.dailyLimit, 3, '学生角色应使用 AI_DAILY_LIMIT_STUDENT')

  const teacherStatus = await api('/api/ai/status', { as: 'teacherDs' })
  assert.equal(teacherStatus.json.dailyLimit, 120, '教师角色应回落到 AI_DAILY_LIMIT')

  const blocked = await api('/api/ai/chat/completions', {
    method: 'POST',
    as: 'student1',
    body: {
      messages: [{ role: 'user', content: '这句话包含测试拦截词，应被拒绝。' }],
    },
  })
  assert.equal(blocked.status, 400, '命中审核词的调用应在配置检查前被拒绝')

  const clean = await api('/api/ai/chat/completions', {
    method: 'POST',
    as: 'student1',
    body: { messages: [{ role: 'user', content: '正常问题：什么是红黑树？' }] },
  })
  assert.equal(clean.status, 503, '未配置网关时仍应返回 503，而不是被审核拦截')
})

test('AI 治理：敏感信息脱敏（单元断言）', () => {
  const redacted = redactText(
    '我学号 20240312，邮箱 me@example.com，手机 13812345678，QQ：87654321。求 0.00000001 的极限是多少？',
  )
  assert.ok(!redacted.includes('me@example.com'), '邮箱应被隐藏')
  assert.ok(redacted.includes('[已隐藏邮箱]'))
  assert.ok(!redacted.includes('13812345678'), '手机号应被隐藏')
  assert.ok(redacted.includes('[已隐藏手机号]'))
  assert.ok(!/学号\s*20240312/.test(redacted), '带标签学号应被隐藏')
  assert.ok(redacted.includes('学号[已隐藏]'))
  assert.ok(!/QQ[:：]?\s*87654321/.test(redacted), '带标签 QQ 应被隐藏')
  assert.ok(redacted.includes('0.00000001'), '数学小数不应被误伤')
})

test('SigV4 签名对拍 AWS 官方测试套件（3 个向量）', () => {
  // 向量取自 aws/aws-sig-v4-test-suite：
  // AKIDEXAMPLE / wJalrXUtnFEMI+K7MDENG+bPxRfiCYEXAMPLEKEY / us-east-1 / service / 20150830T123600Z
  const cases = [
    {
      name: 'get-vanilla',
      query: '',
      headers: {},
      authorization:
        'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    },
    {
      name: 'get-vanilla-empty-query-key (Param1=value1)',
      query: 'Param1=value1',
      headers: {},
      authorization:
        'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=a67d582fa61cc504c4bae71f336f98b97f1ea3c7a6bfe1b6e45aec72011b9aeb',
    },
    {
      name: 'get-header-value-trim（连续空格折叠）',
      query: '',
      headers: { 'my-header1': 'value1', 'my-header2': '"a   b   c"' },
      authorization:
        'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;my-header1;my-header2;x-amz-date, Signature=acc3ed3afb60bb290fc8d2dd0098b9911fcaa05412b367055dee359757a9c736',
    },
  ]
  for (const testCase of cases) {
    const signed = signS3Request({
      method: 'GET',
      host: 'example.amazonaws.com',
      path: '/',
      query: testCase.query,
      headers: testCase.headers,
      body: undefined,
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 'service',
      now: new Date('2015-08-30T12:36:00Z'),
    })
    assert.equal(signed.amzDate, '20150830T123600Z')
    assert.equal(signed.headers.Authorization, testCase.authorization, testCase.name)
  }
})

test('S3 对象存储：上传走 SigV4 签名 PUT，URL 指向对象端点', async () => {
  const upload = await api('/api/uploads/image', {
    method: 'POST',
    as: 'student1',
    body: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', name: '题目.png' },
  })
  assert.equal(upload.status, 201, JSON.stringify(upload.json))
  assert.equal(upload.json.storage, 's3')
  assert.ok(
    upload.json.url.startsWith(`http://127.0.0.1:${MOCK_S3_PORT}/shishuo-test/shishuo/img_`),
    `URL 应指向 mock S3：${upload.json.url}`,
  )

  const objectPath = new URL(upload.json.url).pathname
  const object = s3Objects.get(objectPath)
  assert.ok(object, '对象应落到 mock S3')
  assert.equal(
    sha256(object),
    sha256(Buffer.from('iVBORw0KGgo=', 'base64')),
    '落到 S3 的字节应与上传内容一致',
  )
})

test('FAQ 附件：资料文件上传、地址校验与历史快照', async () => {
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n')
  const upload = await api('/api/uploads/file', {
    method: 'POST',
    as: 'teacherDs',
    body: {
      dataUrl: `data:application/pdf;base64,${pdfBytes.toString('base64')}`,
      name: '第6章 动态规划课件.pdf',
    },
  })
  assert.equal(upload.status, 201, JSON.stringify(upload.json))
  assert.equal(upload.json.type, 'application/pdf')
  assert.equal(upload.json.size, pdfBytes.length)
  const objectPath = new URL(upload.json.url).pathname
  assert.ok(s3Objects.has(objectPath), '资料文件应落到对象存储')

  const now = Date.now()
  const baseFaq = {
    id: 'faq-with-attachments',
    courseId: 'ds',
    question: '动态规划的课件在哪里？',
    aliases: ['dp 课件'],
    answer: '看附件里的第 6 章课件，重点看状态转移方程。',
    tags: ['动态规划'],
    author: '陈砚',
    source: 'teacher',
    createdAt: now,
    updatedAt: now,
    citations: 0,
    helpful: 0,
    unhelpful: 0,
    attachments: [
      {
        kind: 'document',
        name: '第6章 动态规划课件.pdf',
        type: 'application/pdf',
        url: upload.json.url,
        size: pdfBytes.length,
        excerpt: '状态转移方程：dp[i] = max(dp[i - 1], dp[i - 2] + a[i])',
        text: '状态转移方程：dp[i] = max(dp[i - 1], dp[i - 2] + a[i])',
      },
    ],
  }
  const added = await runAction('teacherDs', '/api/faqs', { faq: baseFaq })
  assert.equal(added.status, 200, JSON.stringify(added.json))
  assert.equal(
    added.json.data.faqs.find((faq) => faq.id === baseFaq.id)?.attachments?.length,
    1,
  )

  const updated = await runAction(
    'teacherDs',
    '/api/faqs/faq-with-attachments',
    { faq: { ...baseFaq, question: '动态规划的课件在哪里下载？', updatedAt: now + 1 } },
    'PUT',
  )
  assert.equal(updated.status, 200, JSON.stringify(updated.json))
  const updatedFaq = updated.json.data.faqs.find((faq) => faq.id === baseFaq.id)
  assert.equal(updatedFaq.history?.[0]?.attachments?.[0]?.name, '第6章 动态规划课件.pdf')

  const badUrl = await runAction('teacherDs', '/api/faqs', {
    faq: {
      ...baseFaq,
      id: 'faq-with-bad-attachment',
      attachments: [{ ...baseFaq.attachments[0], url: 'javascript:alert(1)' }],
    },
  })
  assert.equal(badUrl.status, 400)

  const badFile = await api('/api/uploads/file', {
    method: 'POST',
    as: 'teacherDs',
    body: {
      dataUrl: `data:application/pdf;base64,${Buffer.from('not a pdf').toString('base64')}`,
      name: '假课件.pdf',
    },
  })
  assert.equal(badFile.status, 400)
})

test('对象存储配置：S3 缺凭证时回落本地磁盘', () => {
  const keys = ['STORAGE_DRIVER', 'S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE']
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  try {
    process.env.STORAGE_DRIVER = 's3'
    for (const key of keys.slice(1)) delete process.env[key]
    const fallback = loadConfig()
    assert.equal(fallback.storage.driver, 'local', '缺凭证应回落本地')
    assert.equal(fallback.storage.requestedDriver, 's3')

    process.env.S3_ENDPOINT = 'http://127.0.0.1:9000'
    process.env.S3_BUCKET = 'demo'
    process.env.S3_ACCESS_KEY_ID = 'k'
    process.env.S3_SECRET_ACCESS_KEY = 's'
    const enabled = loadConfig()
    assert.equal(enabled.storage.driver, 's3')
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('风控：敏感词管理仅管理员可用，命中词拒绝学生提问', async () => {
  const deniedList = await api('/api/admin/moderation/terms', { as: 'student1' })
  assert.equal(deniedList.status, 403)
  const deniedAdd = await api('/api/admin/moderation/terms', {
    as: 'student1',
    method: 'POST',
    body: { term: '越权词', category: '测试' },
  })
  assert.equal(deniedAdd.status, 403)

  const added = await api('/api/admin/moderation/terms', {
    as: 'admin',
    method: 'POST',
    body: { term: '测试敏感词', category: '测试' },
  })
  assert.equal(added.status, 201)
  try {
    const current = await state('student1')
    const thread = makeThread(
      's1-blocked-1',
      session.get('student1').user,
      '请问测试敏感词能写吗？',
    )
    const blocked = await putState(
      'student1',
      { ...current.json.data, threads: [...current.json.data.threads, thread] },
      current.json.revision,
    )
    assert.equal(blocked.status, 400)
    assert.match(JSON.stringify(blocked.json), /不允许的词/)
  } finally {
    await api(`/api/admin/moderation/terms/${added.json.term.id}`, {
      as: 'admin',
      method: 'DELETE',
    })
  }
})

test('风控：禁言学生不能提问，封禁后不能登录', async () => {
  const target = session.get('student2').user
  try {
    const muted = await api(`/api/admin/users/${target.id}/status`, {
      as: 'admin',
      method: 'POST',
      body: { status: 'muted', reason: '测试禁言', until: Date.now() + 60 * 60 * 1000 },
    })
    assert.equal(muted.status, 200)
    assert.equal(muted.json.user.status, 'muted')

    const current = await state('student2')
    const thread = makeThread('s2-muted-1', target, '禁言期间还能提问吗？')
    const blocked = await putState(
      'student2',
      { ...current.json.data, threads: [...current.json.data.threads, thread] },
      current.json.revision,
    )
    assert.equal(blocked.status, 403)

    const banned = await api(`/api/admin/users/${target.id}/status`, {
      as: 'admin',
      method: 'POST',
      body: { status: 'banned', reason: '测试封禁' },
    })
    assert.equal(banned.status, 200)
    assert.equal(banned.json.user.status, 'banned')

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'student2@shishuo.local', password: 'student123' },
    })
    assert.equal(login.status, 403)
  } finally {
    await api(`/api/admin/users/${target.id}/status`, {
      as: 'admin',
      method: 'POST',
      body: { status: 'active', reason: '测试结束恢复' },
    })
  }
})

test('风控：封禁带时长并通知学生，恢复后通知可见', async () => {
  const target = session.get('student2').user
  try {
    const until = Date.now() + 60 * 60 * 1000
    const banned = await api(`/api/admin/users/${target.id}/status`, {
      as: 'admin',
      method: 'POST',
      body: { status: 'banned', reason: '测试限时封禁', until },
    })
    assert.equal(banned.status, 200)
    assert.equal(banned.json.user.status, 'banned')
    assert.equal(banned.json.user.statusUntil, until, '封禁应带结束时间')

    // 封禁会注销会话，被禁学生无法读取工作区；恢复后重新登录再验证通知。
    const restore = await api(`/api/admin/users/${target.id}/status`, {
      as: 'admin',
      method: 'POST',
      body: { status: 'active', reason: '测试结束恢复' },
    })
    assert.equal(restore.status, 200)

    await login('student2', 'student2@shishuo.local', 'student123')
    const notif = await state('student2')
    const notices = notif.json.data.notifications ?? []
    const bannedNotice = notices.find(
      (item) => item.kind === 'account-banned' && item.recipientId === target.id,
    )
    assert.ok(bannedNotice, '封禁后应给学生写入应用内通知')
    assert.match(bannedNotice.body, /封禁/)
    const restoredNotice = notices.find(
      (item) => item.kind === 'account-restored' && item.recipientId === target.id,
    )
    assert.ok(restoredNotice, '恢复后应给学生写入恢复通知')
  } finally {
    await api(`/api/admin/users/${target.id}/status`, {
      as: 'admin',
      method: 'POST',
      body: { status: 'active', reason: '测试结束恢复' },
    })
  }
})


test('独立管理员：教师无管理权限，AI 配置即时生效', async () => {
  const deniedSettings = await api('/api/admin/ai-settings', { as: 'teacherDs' })
  assert.equal(deniedSettings.status, 403)
  const deniedUsage = await api('/api/admin/ai-usage', { as: 'teacherDs' })
  assert.equal(deniedUsage.status, 403)

  const saved = await api('/api/admin/ai-settings', {
    as: 'admin',
    method: 'POST',
    body: {
      apiKey: 'test-key-12345678',
      baseUrl: 'https://example.com/v1',
      model: 'test-model',
      dailyLimitStudent: 7,
      dailyLimitTeacher: 8,
      enabled: true,
    },
  })
  assert.equal(saved.status, 200)
  assert.equal(saved.json.settings.configured, true)
  assert.equal(saved.json.settings.apiKeyMasked.includes('test'), false, '完整 Key 不能返回')

  try {
    const status = await api('/api/ai/status', { as: 'student1' })
    assert.equal(status.status, 200)
    assert.equal(status.json.configured, true)
    assert.equal(status.json.model, 'test-model')
    assert.equal(status.json.dailyLimit, 7)
    const teacherStatus = await api('/api/ai/status', { as: 'teacherDs' })
    assert.equal(teacherStatus.json.dailyLimit, 8)
    const health = await api('/api/health')
    assert.equal(health.json.aiConfigured, true)
  } finally {
    const cleared = await api('/api/admin/ai-settings', {
      as: 'admin',
      method: 'POST',
      body: { clearKey: true },
    })
    assert.equal(cleared.status, 200)
    assert.equal(cleared.json.settings.configured, false)
  }
})

test('管理端学生问答：管理员可查看校园提问并以校园主理人回复', async () => {
  const denied = await api('/api/admin/student-threads', { as: 'teacherDs' })
  assert.equal(denied.status, 403)

  const student1 = session.get('student1').user
  const created = await runAction('student1', '/api/threads', {
    thread: {
      id: 's1-campus-admin-thread',
      courseId: 'campus',
      student: { id: student1.id, name: student1.name, anonymous: false },
      question: '校园卡丢了怎么补办？',
      createdAt: Date.now(),
      status: 'ai',
      kind: 'ask',
      sources: [],
    },
  })
  assert.equal(created.status, 200)

  const escalated = await runAction(
    'student1',
    '/api/threads/s1-campus-admin-thread/escalate',
    {
      escalation: {
        title: '校园卡补办',
        note: '知识库没有找到可靠的补办流程。',
        anonymous: false,
        urgency: 'week',
        at: Date.now(),
        auto: true,
      },
    },
  )
  assert.equal(escalated.status, 200)

  const inbox = await api('/api/admin/student-threads?limit=300', { as: 'admin' })
  assert.equal(inbox.status, 200)
  const target = inbox.json.threads.find((thread) => thread.id === 's1-campus-admin-thread')
  assert.ok(target, '管理员应能看到学生提交的校园问题')
  assert.equal(target.courseId, 'campus')
  assert.ok(inbox.json.stats.campusPending >= 1)

  const replyText =
    '先在校园卡中心挂失，避免余额被冒用；再带学生证和照片补办。补办费用与办理时间以学校当年通知为准。'
  const replied = await runAction(
    'admin',
    '/api/admin/campus/threads/s1-campus-admin-thread/reply',
    { text: replyText, sediment: true },
  )
  assert.equal(replied.status, 200)

  const studentView = await state('student1')
  const answered = studentView.json.data.threads.find(
    (thread) => thread.id === 's1-campus-admin-thread',
  )
  assert.equal(answered.status, 'answered')
  assert.equal(answered.teacherReply.by, '校园主理人')
  assert.equal(answered.teacherReply.text, replyText)

  const faq = studentView.json.data.faqs.find(
    (item) => item.id === 'campus-reply-s1-campus-admin-thread',
  )
  assert.ok(faq, '勾选沉淀后应生成校园 FAQ')
  assert.equal(faq.courseId, 'campus')
  assert.equal(faq.credibility, 'B-教师回复')
  assert.ok(
    studentView.json.data.notifications.some(
      (notification) =>
        notification.threadId === 's1-campus-admin-thread' &&
        notification.kind === 'teacher-reply' &&
        notification.title.includes('校园主理人'),
    ),
    '学生应收到校园主理人的回复通知',
  )
})

test('管理端可以删除学生问题', async () => {
  const current = await state('student1')
  const thread = makeThread(
    's1-thread-admin-delete',
    session.get('student1').user,
    '这条问题需要管理员删除',
  )
  const created = await putState(
    'student1',
    { ...current.json.data, threads: [...current.json.data.threads, thread] },
    current.json.revision,
  )
  assert.equal(created.status, 200)

  const inbox = await api('/api/admin/student-threads?limit=500', { as: 'admin' })
  assert.equal(inbox.status, 200)
  assert.ok(inbox.json.threads.some((item) => item.id === thread.id))

  const denied = await api(`/api/admin/student-threads/${thread.id}`, {
    method: 'DELETE',
    as: 'student1',
  })
  assert.equal(denied.status, 403, '学生不能删除共享空间里的问题')

  const removed = await api(`/api/admin/student-threads/${thread.id}`, {
    method: 'DELETE',
    as: 'admin',
  })
  assert.equal(removed.status, 200)
  assert.equal(removed.json.ok, true)

  const afterInbox = await api('/api/admin/student-threads?limit=500', { as: 'admin' })
  assert.ok(!afterInbox.json.threads.some((item) => item.id === thread.id))
  const afterState = await state('student1')
  assert.ok(!afterState.json.data.threads.some((item) => item.id === thread.id))
})

test('教务接口：必须登录，状态接口返回未连接', async () => {
  const denied = await api('/api/jw/status', { method: 'POST', body: {} })
  assert.equal(denied.status, 401)

  const status = await api('/api/jw/status', {
    as: 'student1',
    method: 'POST',
    body: {},
  })
  assert.equal(status.status, 200)
  assert.equal(status.json.connected, false)
  assert.equal(status.json.loginOpen, false)
})

test('学习通接口：必须登录，未绑定时返回空概览', async () => {
  const denied = await api('/api/chaoxing/status', { method: 'POST', body: {} })
  assert.equal(denied.status, 401)

  const status = await api('/api/chaoxing/status', {
    as: 'student1',
    method: 'POST',
    body: {},
  })
  assert.equal(status.status, 200)
  assert.equal(status.json.connected, false)
  assert.equal(status.json.courseCount, 0)

  const overview = await api('/api/chaoxing/overview', { as: 'student1' })
  assert.equal(overview.status, 200)
  assert.equal(overview.json.connected, false)
  assert.equal(overview.json.items.length, 0)
})

test('本节提问墙：教师开启场次，学生匿名提问同步且跨端权限受控', async () => {
  const dsTeacherState = await state('teacherDs')
  const now = Date.now()
  const dsNote = {
    courseId: 'ds',
    teacher: '陈砚',
    announcement: '',
    officeHours: '',
    updatedAt: now,
    wallSession: {
      id: 'wall-ds-session-1',
      topic: '第 6 章 · 二叉树与图',
      startedAt: now,
      active: true,
    },
  }
  const savedWall = await putState(
    'teacherDs',
    {
      ...dsTeacherState.json.data,
      courseNotes: [
        dsNote,
        ...(dsTeacherState.json.data.courseNotes ?? []).filter((n) => n.courseId !== 'ds'),
      ],
    },
    dsTeacherState.json.revision,
  )
  assert.equal(savedWall.status, 200, '数据结构老师应该能开启本节提问墙')

  const studentState = await state('student1')
  const syncedWall = studentState.json.data.courseNotes.find((n) => n.courseId === 'ds')?.wallSession
  assert.equal(syncedWall?.id, 'wall-ds-session-1')
  assert.equal(syncedWall?.active, true)

  const studentTamperWall = await putState(
    'student1',
    {
      ...studentState.json.data,
      courseNotes: [
        { ...dsNote, wallSession: { ...dsNote.wallSession, active: false } },
        ...(studentState.json.data.courseNotes ?? []).filter((n) => n.courseId !== 'ds'),
      ],
    },
    studentState.json.revision,
  )
  assert.equal(studentTamperWall.status, 403, '学生不能修改提问墙场次')

  const studentUser = session.get('student1').user
  const wallThread = {
    id: `t-wall-${now}`,
    courseId: 'ds',
    student: { id: studentUser.id, name: studentUser.name, anonymous: true },
    question: '红黑树旋转后为什么还要重新染色？',
    createdAt: now,
    status: 'pending',
    confidence: 'low',
    confidenceScore: 0.12,
    sources: [],
    wallSessionId: 'wall-ds-session-1',
    wallTopic: '第 6 章 · 二叉树与图',
    escalation: {
      title: '红黑树旋转后为什么还要重新染色',
      note: 'AI 没有找到足够可靠的依据，自动转交。',
      anonymous: true,
      urgency: 'week',
      at: now,
      auto: true,
    },
  }
  const submitted = await putState(
    'student1',
    {
      ...studentState.json.data,
      threads: [wallThread, ...studentState.json.data.threads],
    },
    studentState.json.revision,
  )
  assert.equal(submitted.status, 200, '学生应该能提交本节提问墙匿名问题')

  const teacherAfter = await state('teacherDs')
  const seen = teacherAfter.json.data.threads.find((t) => t.id === wallThread.id)
  assert.ok(seen, '教师端应收到本节提问墙问题')
  assert.equal(seen.student.name, '匿名同学', '教师端应看到匿名保护')
  assert.equal(seen.wallSessionId, 'wall-ds-session-1')
})

test('公开提问墙：免登录问卷提交，结束后拒绝', async () => {
  const current = await state('teacherDs')
  const existing = (current.json.data.courseNotes ?? []).find((note) => note.courseId === 'ds') ?? {
    courseId: 'ds',
    teacher: '陈砚',
    announcement: '',
    officeHours: '',
    updatedAt: Date.now(),
  }
  const wallNote = {
    ...existing,
    updatedAt: Date.now(),
    wallSession: {
      id: 'wall-public-1',
      topic: '第 6 章 · 图',
      startedAt: Date.now(),
      active: true,
    },
  }
  const saved = await putState(
    'teacherDs',
    {
      ...current.json.data,
      courseNotes: [wallNote, ...(current.json.data.courseNotes ?? []).filter((note) => note.courseId !== 'ds')],
    },
    current.json.revision,
  )
  assert.equal(saved.status, 200)

  const info = await api('/api/wall/info?course=ds&session=wall-public-1')
  assert.equal(info.status, 200)
  assert.equal(info.json.active, true)
  assert.equal(info.json.courseName, '数据结构')
  assert.equal(info.json.teacher, '陈砚')

  const submitted = await api('/api/wall/submit', {
    method: 'POST',
    body: {
      courseId: 'ds',
      sessionId: 'wall-public-1',
      question: 'KMP 的 next 数组手算总是差一位，怎么理解？',
    },
  })
  assert.equal(submitted.status, 201)
  assert.equal(submitted.json.ok, true)
  assert.ok(['ai', 'pending'].includes(submitted.json.mode))

  const teacherView = await state('teacherDs')
  const wallThread = teacherView.json.data.threads.find((thread) => thread.id === submitted.json.id)
  assert.ok(wallThread, '公开问卷提交应进入教师工作区')
  assert.equal(wallThread.student.name, '匿名同学')
  assert.equal(wallThread.wallSessionId, 'wall-public-1')

  const latest = await state('teacherDs')
  const closedNotes = (latest.json.data.courseNotes ?? []).map((note) =>
    note.courseId === 'ds' && note.wallSession?.id === 'wall-public-1'
      ? { ...note, wallSession: { ...note.wallSession, active: false } }
      : note,
  )
  const closed = await putState(
    'teacherDs',
    { ...latest.json.data, courseNotes: closedNotes },
    latest.json.revision,
  )
  assert.equal(closed.status, 200)

  const rejected = await api('/api/wall/submit', {
    method: 'POST',
    body: {
      courseId: 'ds',
      sessionId: 'wall-public-1',
      question: '结束后还能提交吗？',
    },
  })
  assert.equal(rejected.status, 410)
})
