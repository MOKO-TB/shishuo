/**
 * 服务端教务会话：账号/密码只在登录请求里短暂使用，换取教务 Cookie 后立即丢弃。
 * 每个师说账号一个独立会话，不共享 .jw-state.json，也不把密码写入数据库。
 *
 * 生产环境需要 Chromium（Playwright 浏览器或系统 Chrome/Edge）；
 * 本地开发优先使用已安装的 Edge/Chrome。
 */
import { existsSync, readdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { scoresQueryScript } from './jw-scripts.mjs'
import { mergeScoreRows, parseScoreFrame, parseTimetableFrame } from './jw-parse.mjs'

const ROUTE_ERROR = '教务服务暂时不可用，请稍后重试。'
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
]

export class JwError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'JwError'
    this.status = status
  }
}

const LOGIN_CHECK_SCRIPT = `(() => {
  return Boolean(
    document.querySelector('#loginForm') ||
      document.querySelector('input[name="userAccount"]') ||
      /Logon\\.do/i.test(location.href)
  )
})()`

const SNAPSHOT_SCRIPT = `(() => {
  const clean = (value) => (value || '').replace(/\\u00a0/g, ' ').replace(/\\r/g, '')
  const tables = Array.from(document.querySelectorAll('table')).slice(0, 20).map((table) => {
    const rows = []
    Array.from(table.rows).forEach((row, rowIndex) => {
      rows[rowIndex] = rows[rowIndex] || []
      let column = 0
      Array.from(row.cells).forEach((cell) => {
        while (rows[rowIndex][column] !== undefined) column += 1
        const text = clean(cell.innerText)
        const rowSpan = Math.max(1, cell.rowSpan || 1)
        const colSpan = Math.max(1, cell.colSpan || 1)
        for (let r = 0; r < rowSpan; r += 1) {
          rows[rowIndex + r] = rows[rowIndex + r] || []
          for (let c = 0; c < colSpan; c += 1) {
            rows[rowIndex + r][column + c] = r === 0 && c === 0 ? text : ''
          }
        }
        column += colSpan
      })
    })
    return { id: table.id || '', rows }
  }).filter((table) => table.rows.length > 0)
  const selects = {}
  document.querySelectorAll('select[name]').forEach((select) => {
    if (selects[select.name] === undefined) selects[select.name] = select.value
  })
  return {
    url: location.href,
    title: document.title,
    tables,
    selects,
    text: clean(document.body && document.body.innerText).slice(0, 20000)
  }
})()`

const MENU_LINKS = `(() => {
  const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim()
  return [...document.querySelectorAll('a[href]')]
    .map((anchor) => ({ href: anchor.href, text: clean(anchor.textContent) }))
    .filter((link) => /成绩|课表|cjcx|kscj|xskb/i.test(link.text + ' ' + link.href))
    .slice(0, 16)
})()`

const SCORE_MENU_SCRIPT = `(() => {
  const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim()
  const isSubmission = /成绩提交|成绩替换|成绩认定|成绩复核|成绩免修|成绩置换|交流成绩|成绩管理|成绩申请/
  // 只匹配成绩查询类入口，排除成绩提交/替换等操作类菜单。
  const scoreLink = [...document.querySelectorAll('a')]
    .filter((el) => {
      const text = clean(el.textContent)
      return text.length <= 30 && /我的成绩|成绩查询|课程成绩|学生成绩|考试成绩/.test(text) && !isSubmission.test(text)
    })
    .sort((a, b) => {
      const ta = clean(a.textContent)
      const tb = clean(b.textContent)
      const exactA = /^我的成绩$/.test(ta) ? 0 : 1
      const exactB = /^我的成绩$/.test(tb) ? 0 : 1
      if (exactA !== exactB) return exactA - exactB
      return ta.length - tb.length
    })[0]
  if (!scoreLink) return { clicked: false }
  // 成绩入口在二级菜单里，默认隐藏；先展开所属分类（带 showMenuErji 的 li）再点击。
  if (scoreLink.offsetParent === null) {
    let li = scoreLink.closest('li')
    while (li) {
      const onclick = li.getAttribute('onclick') || ''
      if (/showMenuErji/.test(onclick)) {
        if (typeof window.showMenuErji === 'function') window.showMenuErji(li)
        else li.click()
        break
      }
      li = li.parentElement ? li.parentElement.closest('li') : null
    }
  }
  scoreLink.click()
  return { clicked: true }
})()`

function setWeekScript(target) {
  return `(() => {
    const select = document.querySelector('select[name="zc"]')
    if (!select) return { found: false }
    const options = Array.from(select.options).map((option) => ({
      value: option.value,
      text: (option.textContent || '').trim()
    }))
    const wanted = ${JSON.stringify(target)} === 'all'
      ? options.find((option) => /全部|所有/.test(option.text) || option.value === '')
      : options.find((option) => option.value === ${JSON.stringify(target)})
        || options.find((option) => option.text.includes(${JSON.stringify(target)}))
    if (!wanted) return { found: true, changed: false, options, value: select.value, before: select.value }
    const before = select.value
    select.value = wanted.value
    select.dispatchEvent(new Event('change', { bubbles: true }))
    const form = select.form || select.closest('form')
    if (form) {
      if (typeof form.requestSubmit === 'function') form.requestSubmit()
      else form.submit()
    }
    return { found: true, changed: true, options, value: select.value, before }
  })()`
}

function allowedHostsFromEnv() {
  return (process.env.JW_ALLOWED_HOSTS || 'jw.educationgroup.cn')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function isPrivateHost(host) {
  const value = host.toLowerCase()
  return (
    value === 'localhost' ||
    value === '127.0.0.1' ||
    value === '::1' ||
    value.endsWith('.local') ||
    /^10\./.test(value) ||
    /^192\.168\./.test(value) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(value)
  )
}

function normalizeBaseUrl(raw, { allowedHosts, allowLocal }) {
  let url
  try {
    url = new URL(String(raw || '').trim())
  } catch {
    throw new JwError('教务地址格式不正确，需要以 http(s) 开头。')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new JwError('教务地址只支持 http/https。')
  }
  const host = url.hostname.toLowerCase()
  const allowed =
    allowedHosts.some((item) => host === item || host.endsWith(`.${item}`)) ||
    (allowLocal && isPrivateHost(host))
  if (!allowed) {
    throw new JwError('这个教务地址不在服务器白名单里。')
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.toString()
}

function browserCandidates() {
  return BROWSER_CANDIDATES.filter((candidate) => existsSync(candidate))
}

function resolveBrowserPath(explicitPath) {
  if (explicitPath && existsSync(explicitPath)) return explicitPath
  const system = browserCandidates()[0]
  if (system) return system
  const cacheRoots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(homedir(), '.cache', 'ms-playwright'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : '',
  ].filter(Boolean)
  for (const cacheRoot of cacheRoots) {
    if (!existsSync(cacheRoot)) continue
    let entries = []
    try {
      entries = readdirSync(cacheRoot)
    } catch {
      continue
    }
    const shells = entries
      .filter((name) => name.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse()
    for (const shell of shells) {
      const candidates = [
        path.join(cacheRoot, shell, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
        path.join(cacheRoot, shell, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
        path.join(cacheRoot, shell, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
      ]
      const found = candidates.find((candidate) => existsSync(candidate))
      if (found) return found
    }
    const full = entries
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort()
      .reverse()
    for (const chromiumDir of full) {
      const candidates = [
        path.join(cacheRoot, chromiumDir, 'chrome-linux64', 'chrome'),
        path.join(cacheRoot, chromiumDir, 'chrome-win64', 'chrome.exe'),
        path.join(cacheRoot, chromiumDir, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      ]
      const found = candidates.find((candidate) => existsSync(candidate))
      if (found) return found
    }
  }
  try {
    const bundled = chromium.executablePath()
    if (bundled && existsSync(bundled)) return bundled
  } catch {
    // Full Chromium is not installed; the headless-shell search above already ran.
  }
  throw new JwError(
    '服务器没有可用的浏览器。请安装 Chromium（或 Chrome/Edge）后重启服务。',
    503,
  )
}

async function isLoginPage(page) {
  return (await page.evaluate(LOGIN_CHECK_SCRIPT).catch(() => false)) === true
}

async function pageSnapshot(page) {
  const snapshots = []
  for (const frame of page.frames()) {
    try {
      const data = await frame.evaluate(SNAPSHOT_SCRIPT)
      snapshots.push(data)
    } catch {
      // Cross-origin or detached frame.
    }
  }
  return { pageUrl: page.url(), frames: snapshots }
}

function targetUrl(session, kind) {
  if (kind === 'schedule') return session.timetableUrl || session.base
  return session.scoresUrl || session.base || session.timetableUrl
}

function readCandidates(session, kind) {
  const list = []
  const primary = targetUrl(session, kind)
  try {
    const origin = new URL(
      session.base || primary || session.timetableUrl || session.scoresUrl,
    ).origin
    if (kind === 'scores') {
      // 强智成绩入口是「我的成绩 → 课程成绩查询」，实际地址 /kscj/cjcx_frm，
      // 内含 cjcx_query 查询表单；直接访问旧 cjcx/cjkb 会返回「非法访问」。
      list.push(`${origin}/gzasc_jsxsd/kscj/cjcx_frm`)
      list.push(`${origin}/gzasc_jsxsd/framework/xsMain.jsp`)
      if (primary && primary !== session.base) list.push(primary)
      for (const path of [
        '/gzasc_jsxsd/kscj/cjcx_list.do',
        '/gzasc_jsxsd/cjcx/cjkb_cjb1.do',
        '/gzasc_jsxsd/cjcx/cjcx_list.do',
      ]) {
        list.push(`${origin}${path}`)
      }
    } else {
      if (primary) list.push(primary)
      list.push(`${origin}/gzasc_jsxsd/xskb/xskb_list.do`)
    }
    list.push(session.base || `${origin}/gzasc/`)
  } catch {
    // No usable origin.
  }
  return [...new Set(list.filter(Boolean))].slice(0, 6)
}

async function discoverState(page, base) {
  const state = {
    base,
    timetableUrl: '',
    scoresUrl: '',
  }
  const origin = new URL(base).origin
  state.timetableUrl = `${origin}/gzasc_jsxsd/xskb/xskb_list.do`
  // 成绩页不能直接访问（返回「非法访问」），不预设默认直链；由读取流程从主页菜单进入。
  const pageUrl = page.url()
  if (/xskb|kb\.do|kcb/i.test(pageUrl)) state.timetableUrl = pageUrl
  if (/cjcx|kscj|cjb/i.test(pageUrl)) state.scoresUrl = pageUrl

  for (const frame of page.frames()) {
    try {
      const frameUrl = frame.url()
      if (/xskb|kb\.do|kcb/i.test(frameUrl)) state.timetableUrl = frameUrl
      if (/cjcx|kscj|cjb/i.test(frameUrl)) state.scoresUrl = frameUrl
      const links = await frame.evaluate(MENU_LINKS)
      for (const link of links) {
        let linkUrl
        try {
          linkUrl = new URL(link.href)
        } catch {
          continue
        }
        if (linkUrl.origin !== origin) continue
        if (/成绩|cjcx|kscj/i.test(link.text + ' ' + link.href)) {
          state.scoresUrl = state.scoresUrl || linkUrl.href
        }
        if (/课表|xskb|kcb/i.test(link.text + ' ' + link.href)) {
          state.timetableUrl = state.timetableUrl || linkUrl.href
        }
      }
    } catch {
      // Detached frame.
    }
  }
  return state
}

function isExpiredSnapshot(snapshot) {
  return snapshot.frames.some((frame) => {
    // 「提示：非法访问！」是成绩页直链被拒，不是登录过期，不能当成会话失效。
    if (/非法访问/.test(frame.text)) return false
    return (
      /错误提示/.test(frame.title) ||
      /请重新登录|登录超时|会话已过期|尚未登录|Session.*(?:timeout|expired)/i.test(frame.text)
    )
  })
}

function tableSampleOf(snapshot) {
  const largest = snapshot.frames
    .flatMap((frame) => frame.tables)
    .sort((a, b) => b.rows.length - a.rows.length)[0]
  if (!largest) return ''
  return largest.rows
    .slice(0, 5)
    .map((row) =>
      row
        .slice(0, 6)
        .map((cell) => cell.replace(/\s+/g, ' ').slice(0, 18))
        .join(' | '),
    )
    .join('\n')
    .slice(0, 600)
}

async function applyWeek(page, target) {
  for (const frame of page.frames()) {
    try {
      const result = await frame.evaluate(setWeekScript(target))
      if (result?.found) {
        if (result.changed) await page.waitForTimeout(1200)
        return result
      }
    } catch {
      // Frame without the 周次 select.
    }
  }
  return undefined
}

async function runScoresQuery(page, target) {
  for (const frame of page.frames()) {
    try {
      const result = await frame.evaluate(scoresQueryScript(target))
      if (result?.select) return result
    } catch {
      // Frame without the score form.
    }
  }
  return undefined
}

async function openScoresMenu(page) {
  for (const frame of page.frames()) {
    try {
      const result = await frame.evaluate(SCORE_MENU_SCRIPT)
      if (result?.clicked) {
        await page.waitForTimeout(1200)
        return true
      }
    } catch {
      // Frame without a score menu.
    }
  }
  return false
}

async function snapshotScores(page) {
  const snapshot = await pageSnapshot(page)
  const rows = []
  let header = []
  let sourceUrl = snapshot.pageUrl
  for (const frame of snapshot.frames) {
    const parsed = parseScoreFrame(frame)
    if (parsed.rows.length === 0) continue
    mergeScoreRows(rows, parsed.rows)
    if (header.length === 0) header = parsed.header
    if (parsed.sourceUrl) sourceUrl = parsed.sourceUrl
  }
  return {
    rows,
    header,
    sourceUrl,
    diagnostics: snapshot.frames.map((frame) => ({
      url: frame.url,
      title: frame.title,
      tables: frame.tables.length,
    })),
  }
}

async function readScoresWithQuery(page) {
  const first = await runScoresQuery(page, '__all__')
  await page.waitForTimeout(900)
  let result = await snapshotScores(page)
  const autoQuery = {
    allSemester: Boolean(first?.all),
    clicked: Boolean(first?.clicked),
    semesters: 0,
    optionText: first?.optionText ?? '',
  }
  if (result.rows.length > 0) return { ...result, autoQuery }
  if (first?.select) {
    await runScoresQuery(page, '__all__')
    await page.waitForTimeout(900)
    result = await snapshotScores(page)
    if (result.rows.length > 0) return { ...result, autoQuery }
  }
  const values = (first?.options ?? []).filter((option) => option.value !== '').slice(0, 12)
  if (first?.select && !first.all && values.length > 1) {
    autoQuery.semesters = values.length
    for (const option of values) {
      await runScoresQuery(page, option.value)
      await page.waitForTimeout(800)
      const snap = await snapshotScores(page)
      mergeScoreRows(result.rows, snap.rows)
      result = { ...snap, rows: result.rows }
    }
  }
  return { ...result, autoQuery }
}

export function createJwService(options = {}) {
  const sessions = new Map()
  const pending = new Map()
  const attempts = new Map()
  const allowedHosts = options.allowedHosts ?? allowedHostsFromEnv()
  const allowLocal = options.allowLocal ?? process.env.JW_ALLOW_LOCAL === '1'
  const maxBrowserContexts = 12
  let browserPromise = null

  async function getBrowser() {
    if (!browserPromise) {
      const executablePath = resolveBrowserPath(options.browserPath)
      browserPromise = chromium.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=zh-CN'],
      })
      browserPromise.then((browser) => {
        browser.on('disconnected', () => {
          browserPromise = null
        })
      }).catch(() => {
        browserPromise = null
      })
    }
    return browserPromise
  }

  function rateLimit(userId) {
    const now = Date.now()
    const recent = (attempts.get(userId) ?? []).filter((stamp) => now - stamp < 10 * 60_000)
    if (recent.length >= 12) {
      throw new JwError('登录尝试过于频繁，请 10 分钟后再试。', 429)
    }
    recent.push(now)
    attempts.set(userId, recent)
  }

  async function closePending(loginId) {
    const item = pending.get(loginId)
    if (!item) return
    pending.delete(loginId)
    await item.context.close().catch(() => undefined)
  }

  async function closeUserPending(userId) {
    const ids = [...pending.entries()]
      .filter(([, item]) => item.userId === userId)
      .map(([id]) => id)
    await Promise.all(ids.map((id) => closePending(id)))
  }

  function cleanupExpiredPending() {
    const now = Date.now()
    for (const [id, item] of pending) {
      if (now - item.createdAt > 15 * 60_000) {
        void closePending(id)
      }
    }
  }

  async function startLogin(userId, rawBaseUrl) {
    rateLimit(userId)
    cleanupExpiredPending()
    await closeUserPending(userId)
    if (pending.size >= maxBrowserContexts) {
      throw new JwError('当前登录人数较多，请稍后再试。', 503)
    }
    const base = normalizeBaseUrl(rawBaseUrl, { allowedHosts, allowLocal })
    const browser = await getBrowser()
    const context = await browser.newContext({
      userAgent: DEFAULT_UA,
      viewport: { width: 1440, height: 1000 },
      locale: 'zh-CN',
    })
    const page = await context.newPage()
    let dialogMessage = ''
    page.on('dialog', (dialog) => {
      dialogMessage = dialog.message()
      void dialog.dismiss().catch(() => undefined)
    })
    try {
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(700)
      if (!(await isLoginPage(page))) {
        throw new JwError('教务页面没有进入登录页，请确认教务地址是否正确。', 502)
      }
      const captchaImage = page.locator('#SafeCodeImg')
      await captchaImage.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined)
      const buffer = await captchaImage.screenshot().catch(() => null)
      if (!buffer || buffer.length === 0) {
        throw new JwError('没有读取到教务验证码，请刷新重试。', 502)
      }
      const loginId = randomBytes(16).toString('hex')
      pending.set(loginId, {
        userId,
        base,
        context,
        page,
        createdAt: Date.now(),
        dialogMessage: () => dialogMessage,
      })
      return {
        loginId,
        captcha: `data:image/png;base64,${buffer.toString('base64')}`,
        base,
      }
    } catch (error) {
      await context.close().catch(() => undefined)
      if (error instanceof JwError) throw error
      throw new JwError(`无法打开教务登录页：${error.message || ROUTE_ERROR}`, 502)
    }
  }

  async function finishLogin(userId, input) {
    cleanupExpiredPending()
    const loginId = String(input?.loginId ?? '')
    const item = pending.get(loginId)
    if (!item || item.userId !== userId) {
      throw new JwError('登录会话已失效，请重新获取验证码。', 409)
    }
    const account = String(input?.account ?? '').trim()
    const password = String(input?.password ?? '')
    const captcha = String(input?.captcha ?? '').trim()
    if (!account || account.length > 80) throw new JwError('请输入教务账号。')
    if (!password || password.length > 200) throw new JwError('请输入教务密码。')
    if (!/^[A-Za-z0-9]{4,8}$/.test(captcha)) throw new JwError('请输入 4–8 位验证码。')
    const { page, context, base } = item
    try {
      await page.locator('#userAccount').fill(account).catch(() => undefined)
      await page.locator('#userPassword').fill(password).catch(() => undefined)
      await page.locator('#RANDOMCODE').fill(captcha).catch(() => undefined)
      await page.locator('button.login_btn').click({ timeout: 5_000 }).catch(async () => {
        await page.evaluate(() => {
          if (typeof window.login === 'function') window.login()
        }).catch(() => undefined)
      })
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null),
        page.waitForTimeout(6_000),
      ])
      await page.waitForTimeout(1_200)
      if (await isLoginPage(page)) {
        const message = await page.locator('#showMsg').innerText().catch(() => '')
        const dialog = item.dialogMessage?.() || ''
        throw new JwError(
          String(message || dialog).trim() || '教务登录失败，请检查账号、密码和验证码。',
          401,
        )
      }
      const state = await discoverState(page, base)
      const cookies = await context.cookies()
      if (cookies.length === 0) {
        throw new JwError('教务没有返回登录态，请重新登录。', 502)
      }
      const ua = await page.evaluate(() => navigator.userAgent).catch(() => DEFAULT_UA)
      sessions.set(userId, {
        ...state,
        ua: ua || DEFAULT_UA,
        cookies,
        updatedAt: Date.now(),
      })
      return { connected: true, ...state }
    } catch (error) {
      if (error instanceof JwError) throw error
      throw new JwError(error.message || ROUTE_ERROR, 502)
    } finally {
      await closePending(loginId)
    }
  }

  function status(userId) {
    cleanupExpiredPending()
    const session = sessions.get(userId)
    return {
      connected: Boolean(session?.cookies?.length),
      loginOpen: [...pending.values()].some((item) => item.userId === userId),
      base: session?.base ?? '',
      timetableUrl: session?.timetableUrl ?? '',
      scoresUrl: session?.scoresUrl ?? '',
    }
  }

  async function logout(userId) {
    await closeUserPending(userId)
    sessions.delete(userId)
    return { ok: true }
  }

  async function read(userId, kind, zc) {
    const session = sessions.get(userId)
    if (!session?.cookies?.length) {
      throw new JwError('还没有登录教务，请先输入账号、密码和验证码。', 401)
    }
    const browser = await getBrowser()
    const context = await browser.newContext({
      userAgent: session.ua || DEFAULT_UA,
      viewport: { width: 1440, height: 1000 },
      locale: 'zh-CN',
    })
    await context.addCookies(session.cookies).catch(() => undefined)
    const page = await context.newPage()
    page.on('dialog', (dialog) => {
      void dialog.dismiss().catch(() => undefined)
    })
    try {
      const result = await readPageInner(page, session, kind, zc)
      const cookies = await context.cookies()
      if (cookies.length > 0) {
        session.cookies = cookies
        session.updatedAt = Date.now()
      }
      return result
    } catch (error) {
      if (error instanceof JwError && error.status === 401) {
        sessions.delete(userId)
      }
      if (error instanceof JwError) throw error
      throw new JwError(error.message || ROUTE_ERROR, 502)
    } finally {
      await context.close().catch(() => undefined)
    }
  }

  async function readPageInner(page, session, kind, zc) {
    const targets = readCandidates(session, kind)
    if (targets.length === 0) throw new JwError('还没有绑定教务账号。', 401)
    let sawLogin = false
    let sawExpired = false
    let lastDiagnostics = []
    let lastUrl = ''
    let tableSample = ''
    const tried = []

    for (const target of targets) {
      tried.push(target)
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined)
      await page.waitForSelector('table', { timeout: 4_000 }).catch(() => undefined)
      await page.waitForTimeout(700)
      if (await isLoginPage(page)) {
        sawLogin = true
        continue
      }
      const applied = kind === 'schedule' && zc ? await applyWeek(page, zc) : undefined
      const snapshot = await pageSnapshot(page)
      if (isExpiredSnapshot(snapshot)) {
        sawExpired = true
        continue
      }
      lastUrl = snapshot.pageUrl
      lastDiagnostics = snapshot.frames.map((frame) => ({
        url: frame.url,
        title: frame.title,
        tables: frame.tables.length,
      }))
      if (!tableSample) tableSample = tableSampleOf(snapshot)

      if (kind === 'schedule') {
        for (const frame of snapshot.frames) {
          const parsed = parseTimetableFrame(frame)
          if (parsed.entries.length > 0) {
            return {
              entries: parsed.entries.map((entry, index) => ({
                ...entry,
                id: `cls-${Date.now()}-${index}`,
              })),
              sourceUrl: parsed.sourceUrl,
              selects: parsed.selects,
              unparsed: parsed.notes,
              diagnostics: lastDiagnostics,
              weekOptions: applied?.options ?? [],
              selectedWeek: applied?.value ?? '',
              currentWeekValue: applied?.before ?? applied?.value ?? '',
              weeksAvailable: parsed.entries.some((entry) => Boolean(entry.weeks)),
              tried,
              tableSample,
            }
          }
        }
        continue
      }

      const hasScoreTable = snapshot.frames.some((frame) => parseScoreFrame(frame).rows.length > 0)
      if (!hasScoreTable) await openScoresMenu(page)
      const scores = await readScoresWithQuery(page)
      if (scores.sourceUrl) lastUrl = scores.sourceUrl
      if (scores.diagnostics.length > 0) lastDiagnostics = scores.diagnostics
      if (scores.rows.length > 0) {
        return {
          rows: scores.rows.map((row, index) => ({ ...row, id: `score-${Date.now()}-${index}` })),
          header: scores.header,
          sourceUrl: scores.sourceUrl,
          diagnostics: lastDiagnostics,
          tried,
          tableSample,
          autoQuery: scores.autoQuery,
        }
      }
    }

    if (sawExpired) {
      throw new JwError(
        '教务登录已过期，请重新输入账号、密码和验证码。',
        401,
      )
    }
    if (sawLogin) {
      throw new JwError('教务登录已过期，请重新登录。', 401)
    }
    return kind === 'schedule'
      ? {
          entries: [],
          sourceUrl: lastUrl || targets[0],
          selects: {},
          unparsed: [],
          diagnostics: lastDiagnostics,
          weekOptions: [],
          selectedWeek: '',
          currentWeekValue: '',
          weeksAvailable: false,
          tried,
          tableSample,
        }
      : {
          rows: [],
          header: [],
          sourceUrl: lastUrl || targets[0],
          diagnostics: lastDiagnostics,
          tried,
          tableSample,
        }
  }

  async function close() {
    await Promise.all([...pending.keys()].map((id) => closePending(id)))
    sessions.clear()
    if (browserPromise) {
      const browser = await browserPromise.catch(() => null)
      browserPromise = null
      await browser?.close().catch(() => undefined)
    }
  }

  return {
    startLogin,
    finishLogin,
    status,
    read,
    logout,
    close,
  }
}
