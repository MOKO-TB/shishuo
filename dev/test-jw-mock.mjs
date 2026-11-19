/**
 * 服务端教务代理的本地闭环测试：用 mock 教务页面验证
 * 验证码 -> 登录 -> 课表读取，不访问真实学校账号。
 *
 * 运行：npm run test:jw
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createJwService } from '../server/jw.mjs'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const loginPage = `<!doctype html><html><head><meta charset="utf-8"><title>登录</title></head>
<body>
<form id="loginForm" method="post" action="/gzasc/Logon.do?method=logon">
  <input id="userAccount" name="userAccount" />
  <input id="userPassword" name="userPassword" type="password" />
  <input id="RANDOMCODE" name="RANDOMCODE" />
  <img id="SafeCodeImg" src="/gzasc/verifycode.servlet" width="80" height="40" />
  <button type="button" class="btn btn-primary login_btn" onclick="login()">登录</button>
  <div id="showMsg"></div>
</form>
<script>
function login() {
  document.cookie = 'JSESSIONID=mock-session; path=/'
  location.href = '/gzasc/framework/xsMain.jsp'
}
</script>
</body></html>`

const timetablePage = `<!doctype html><html><head><meta charset="utf-8"><title>学期课表</title></head>
<body>
<form method="get" action="/gzasc_jsxsd/xskb/xskb_list.do">
<select name="zc"><option value="">全部</option><option value="1">第1周</option></select>
</form>
<table id="kb">
<tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th><th>星期六</th><th>星期日</th></tr>
<tr>
  <td>第1-2节<br>08:00-09:35</td>
  <td>高等数学<br>张三<br>1-16周<br>A101室</td>
  <td></td><td></td><td></td><td></td><td></td><td></td>
</tr>
<tr>
  <td>第3-4节<br>09:55-11:30</td>
  <td></td>
  <td>数据结构<br>李四<br>1-16周<br>B202室</td>
  <td></td><td></td><td></td><td></td><td></td>
</tr>
</table>
</body></html>`

const scoresPage = `<!doctype html><html><head><meta charset="utf-8"><title>成绩查询</title></head>
<body>
<table>
<tr><th>课程名称</th><th>成绩</th><th>学分</th><th>学期</th></tr>
<tr><td>高等数学</td><td>92</td><td>4</td><td>2026-2027-1</td></tr>
</table>
</body></html>`

function startMock() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const send = (status, body, type = 'text/html; charset=utf-8') => {
      res.statusCode = status
      res.setHeader('Content-Type', type)
      res.end(body)
    }
    if (url.pathname === '/gzasc/') return send(200, loginPage)
    if (url.pathname === '/gzasc/verifycode.servlet') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'image/png')
      return res.end(PNG)
    }
    if (url.pathname === '/gzasc/framework/xsMain.jsp') {
      res.setHeader('Set-Cookie', 'JSESSIONID=mock-session; Path=/')
      return send(200, '<html><body><a href="/gzasc_jsxsd/xskb/xskb_list.do">学期课表</a></body></html>')
    }
    if (url.pathname === '/gzasc_jsxsd/xskb/xskb_list.do') return send(200, timetablePage)
    if (url.pathname === '/gzasc_jsxsd/cjcx/cjkb_cjb1.do') return send(200, scoresPage)
    if (url.pathname === '/gzasc_jsxsd/kscj/cjcx_list.do') return send(200, scoresPage)
    return send(404, 'not found')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port })
    })
  })
}

const { server, port } = await startMock()
const base = `http://127.0.0.1:${port}/gzasc/`
const jw = createJwService({ allowLocal: true, allowedHosts: ['127.0.0.1'] })
try {
  let start
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      start = await jw.startLogin('test-user', base)
      break
    } catch (error) {
      if (attempt === 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
  }
  assert.ok(start.loginId, '应返回 loginId')
  assert.ok(start.captcha.startsWith('data:image/png;base64,'), '应返回验证码图片')

  const finish = await jw.finishLogin('test-user', {
    loginId: start.loginId,
    account: 'demo',
    password: 'demo',
    captcha: 'abcd',
  })
  assert.equal(finish.connected, true)

  const schedule = await jw.read('test-user', 'schedule', 'all')
  assert.equal(schedule.entries.length, 2)
  assert.equal(schedule.entries[0].course, '高等数学')
  assert.equal(schedule.entries[0].day, 1)
  assert.equal(schedule.entries[0].startSection, 1)
  assert.equal(schedule.entries[1].course, '数据结构')
  assert.equal(schedule.entries[1].day, 2)

  const scores = await jw.read('test-user', 'scores')
  assert.equal(scores.rows.length, 1)
  assert.equal(scores.rows[0].course, '高等数学')
  assert.equal(scores.rows[0].score, '92')
  assert.equal(scores.rows[0].credit, 4)

  console.log('✔ 服务端教务 mock 闭环通过：验证码、登录、课表、成绩')
} finally {
  await jw.close()
  await new Promise((resolve) => server.close(resolve))
}
