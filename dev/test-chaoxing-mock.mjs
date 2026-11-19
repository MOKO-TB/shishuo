/**
 * 学习通只读同步 mock 闭环：二维码 -> 登录 -> 课程 -> 作业/资料/消息。
 * 不访问真实学习通账号。
 *
 * 运行：npm run test:chaoxing
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChaoxingService } from '../server/chaoxing.mjs'
import { openDatabase } from '../server/db.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = path.join(ROOT, 'data', `test-chaoxing-${process.pid}.db`)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const loginPage = `<!doctype html><html><head><meta charset="utf-8"><title>登录</title></head>
<body>
<form id="loginForm"><input name="phone" /></form>
<input id="uuid" value="mock-uuid" />
<input id="enc" value="mock-enc" />
<img id="quickCode" src="/createqr?uuid=mock-uuid" width="200" height="200" />
</body></html>`

const courseHome = `<!doctype html><html><head><meta charset="utf-8"><title>课程主页</title></head>
<body><h1>数据结构</h1><a href="/messages?courseId=course-1">课程消息</a>
<div class="timeline"><div class="units">
  <h2 class="levelfirst"><span class="chapterNumber">第1章</span><span class="fontCon">绪论</span></h2>
  <div class="leveltwo"><span class="chapterNumber">1.1</span><h3><span class="fontCon">数据结构基本概念</span></h3><input class="knowledgeJobCount" value="1" /></div>
</div></div>
</body></html>`

const workAllPage = `<!doctype html><html><head><meta charset="utf-8"></head>
<body><ul><li data="/work/1"><p>第一次作业：线性表</p><span class="status">未提交</span><span>《数据结构》</span><span class="fr">剩余10小时30分钟</span></li></ul></body></html>`

const middlePage = `<!doctype html><html><head><meta charset="utf-8"></head>
<body><input id="workEnc" value="work-enc" /></body></html>`

const workPage = `<!doctype html><html><head><meta charset="utf-8"></head>
<body>
<div class="bottomList"><ul>
  <li data="/work/1">
    <span class="title">第一次作业：线性表</span>
    <span class="status">未交</span>
    <span class="deadline">2026-11-30 23:59</span>
  </li>
</ul></div>
</body></html>`

const materialsPage = `<!doctype html><html><head><meta charset="utf-8"></head>
<body>
<table>
  <tr type="file" id="101" dataname="课件1.pdf" isdown="1">
    <td>课件1.pdf</td><td>PDF</td><td>2MB</td><td>2MB</td>
    <td><a href="/download/101">下载</a></td>
  </tr>
</table>
</body></html>`

const messagesPage = `<!doctype html><html><head><meta charset="utf-8"></head>
<body>
<ul class="message-list">
  <li><a href="/messages/1">课程调整通知</a><span class="time">2026-11-20 10:00</span><p>本周五改到 A302。</p></li>
</ul>
</body></html>`

function startMock() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const send = (body, type = 'text/html; charset=utf-8') => {
      res.statusCode = 200
      res.setHeader('Content-Type', type)
      res.end(body)
    }
    if (url.pathname === '/login') return send(loginPage)
    if (url.pathname === '/createqr') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'image/png')
      return res.end(PNG)
    }
    if (url.pathname === '/getauthstatus/v2') {
      res.setHeader('Set-Cookie', 'JSESSIONID=mock-session; Path=/')
      return send(JSON.stringify({ status: true, uid: 'mock-user' }), 'application/json')
    }
    if (url.pathname === '/course-api') {
      if (!String(req.headers.cookie || '').includes('mock-session')) {
        res.statusCode = 401
        return res.end('login required')
      }
      return send(
        JSON.stringify({
          channelList: [
            {
              content: {
                id: 'class-1',
                cpi: 'cpi-1',
                course: { data: [{ id: 'course-1', name: '数据结构' }] },
              },
            },
          ],
        }),
        'application/json',
      )
    }
    if (url.pathname === '/course-home') return send(courseHome)
    if (url.pathname === '/notices') {
      return send(
        JSON.stringify({
          notices: {
            list: [
              {
                uuid: 'notice-1',
                title: '课程调整通知',
                content: `课程名称：数据结构
本周五改到 A302。`,
                sendTime: '2026-11-20 10:00',
              },
            ],
          },
        }),
        'application/json',
      )
    }
    if (url.pathname === '/middle') return send(middlePage)
    if (url.pathname === '/work') return send(workPage)
    if (url.pathname === '/work-all') return send(workAllPage)
    if (url.pathname === '/materials') return send(materialsPage)
    if (url.pathname === '/messages') return send(messagesPage)
    if (url.pathname.startsWith('/download/')) return send('file')
    res.statusCode = 404
    res.end('not found')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port })
    })
  })
}

rmSync(DB_PATH, { force: true })
rmSync(`${DB_PATH}-wal`, { force: true })
rmSync(`${DB_PATH}-shm`, { force: true })
const db = openDatabase(DB_PATH)
db.prepare(
  `INSERT OR IGNORE INTO users (id, email, name, role, password_hash, profile_json, courses_json, is_admin, status, created_at)
   VALUES ('test-student', 'chaoxing-test@example.com', '测试学生', 'student', 'x', '{}', '[]', 0, 'active', ?)`,
).run(Date.now())
const { server, port } = await startMock()
const base = `http://127.0.0.1:${port}`
const cx = createChaoxingService(db, {
  loginUrl: `${base}/login`,
  loginStatusUrl: `${base}/getauthstatus/v2`,
  courseApi: `${base}/course-api`,
  courseHome: `${base}/course-home`,
  middleUrl: `${base}/middle`,
  workUrl: `${base}/work`,
  workAllUrl: `${base}/work-all`,
  materialsUrl: `${base}/materials`,
  noticesUrl: `${base}/notices`,
})
try {
  const start = await cx.startLogin('test-student')
  assert.ok(start.loginId)
  assert.ok(start.qr.startsWith('data:image/png;base64,'))
  const poll = await cx.pollLogin('test-student', start.loginId)
  assert.equal(poll.status, 'connected')
  assert.equal(poll.courses, 1)

  const result = await cx.sync('test-student')
  assert.equal(result.assignments, 1)
  assert.equal(result.materials, 1)
  assert.equal(result.messages, 1)
  assert.equal(result.chapters, 1)

  const overview = cx.overview('test-student')
  assert.equal(overview.connected, true)
  assert.equal(overview.courses.length, 1)
  assert.equal(overview.counts.assignment, 1)
  assert.equal(overview.counts.material, 1)
  assert.equal(overview.counts.message, 1)
  assert.equal(overview.chapters.length, 1)
  assert.equal(overview.chapters[0].unfinished, 1)
  assert.ok(overview.items.some((item) => item.title.includes('线性表')))
  assert.ok(overview.items.some((item) => item.title.includes('课件1')))
  assert.ok(overview.items.some((item) => item.title.includes('课程调整')))

  cx.markRead('test-student', overview.items[0].id)
  const afterRead = cx.overview('test-student')
  assert.ok(afterRead.items.find((item) => item.id === overview.items[0].id)?.read_at)

  console.log('✔ 学习通 mock 闭环通过：二维码、课程、作业、资料、消息')
} finally {
  await cx.close()
  db.close()
  await new Promise((resolve) => server.close(resolve))
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${DB_PATH}${suffix}`, { force: true })
}
