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
  await login('teacherMath', 'teacher.math@shishuo.local', 'teacher123')

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

  const audit = await api('/api/admin/audit?limit=100', { as: 'teacherDs' })
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

  const usage = await api('/api/admin/ai-usage', { as: 'teacherDs' })
  assert.equal(usage.status, 200)
  assert.ok(usage.json.totals)
  assert.ok(Array.isArray(usage.json.days))
  assert.ok(Array.isArray(usage.json.topUsers))
})

test('实体表镜像：工作区写入同步到 workspace_entities', async () => {
  const db = openDatabase(DB_PATH)
  try {
    const threads = db
      .prepare(
        "SELECT COUNT(*) AS n FROM workspace_entities WHERE workspace_id = ? AND entity_type = 'thread'",
      )
      .get(WORKSPACE_ID)
    assert.equal(Number(threads.n), 3, '三条问答（含种子旧问答）都应镜像成行')
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

  const list = await api('/api/admin/archived-threads', { as: 'teacherDs' })
  assert.equal(list.status, 200)
  assert.ok(list.json.threads.some((thread) => thread.id === 's1-thread-old'))
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
    feedback: 'helpful',
  })
  assert.equal(feedback.status, 200)

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
