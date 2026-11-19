/**
 * 学习通（超星）只读同步：二维码登录、课程列表、作业、资料、课程消息。
 *
 * - 每个师说学生账号一份内存会话；不保存学习通账号密码。
 * - 二维码登录在服务端无头 Chromium 里完成，学生用学习通 App 扫码确认。
 * - 同步结果写入 chaoxing_* 表，按账号隔离；页面结构变化只影响同步，不影响答疑。
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const LOGIN_URL = 'https://passport2.chaoxing.com/login?fid=&refer=https%3A%2F%2Fi.chaoxing.com'
const COURSE_API = 'https://mooc1-api.chaoxing.com/mycourse/backclazzdata'
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

export class ChaoxingError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'ChaoxingError'
    this.status = status
  }
}

function sha1(value) {
  return createHash('sha1').update(String(value)).digest('hex')
}

function resolveBrowserPath(explicitPath) {
  if (explicitPath && existsSync(explicitPath)) return explicitPath
  const system = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))
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
      ]
      const found = candidates.find((candidate) => existsSync(candidate))
      if (found) return found
    }
  }
  try {
    const bundled = chromium.executablePath()
    if (bundled && existsSync(bundled)) return bundled
  } catch {
    // no bundled browser
  }
  throw new ChaoxingError(
    '服务器没有可用的浏览器，无法同步学习通。请安装 Chromium 后重启服务。',
    503,
  )
}

function itemId(userId, kind, sourceId) {
  return `cx-${sha1(`${userId}|${kind}|${sourceId}`).slice(0, 32)}`
}

function coursePk(userId, courseId, classId) {
  return `cxc-${sha1(`${userId}|${courseId}|${classId}`).slice(0, 32)}`
}

function clean(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function parseDeadline(text) {
  if (!text) return null
  const normalized = String(text).replace(/[年月./]/g, '-').replace(/日/g, '')
  const match =
    /(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/.exec(normalized) ||
    /(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/.exec(normalized)
  if (!match) return null
  const year = match[1]?.length === 4 ? Number(match[1]) : new Date().getFullYear()
  const monthIndex = match[1]?.length === 4 ? 2 : 1
  const month = Number(match[monthIndex])
  const day = Number(match[monthIndex + 1])
  const hour = Number(match[monthIndex + 2] ?? 23)
  const minute = Number(match[monthIndex + 3] ?? 59)
  const stamp = new Date(year, month - 1, day, hour, minute).getTime()
  return Number.isFinite(stamp) ? stamp : null
}

async function isLoginPage(page) {
  return page
    .evaluate(() =>
      Boolean(
        document.querySelector('#loginForm') ||
          document.querySelector('input[name="phone"]') ||
          /passport2\.chaoxing\.com\/login/i.test(location.href),
      ),
    )
    .catch(() => false)
}

async function pageLinks(page) {
  return page
    .evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map((anchor) => ({
          href: anchor.href,
          text: String(anchor.textContent || '').replace(/\s+/g, ' ').trim(),
        }))
        .filter((link) => link.href && !/^javascript:/i.test(link.href))
        .slice(0, 300),
    )
    .catch(() => [])
}

export function createChaoxingService(db, options = {}) {
  const sessions = new Map()
  const pending = new Map()
  let browserPromise = null
  const urls = {
    login: options.loginUrl ?? LOGIN_URL,
    loginStatus: options.loginStatusUrl ?? 'https://passport2.chaoxing.com/getauthstatus/v2',
    courseApi: options.courseApi ?? COURSE_API,
    courseHome: options.courseHome ?? 'https://mooc1.chaoxing.com/visit/stucoursemiddle',
    middle:
      options.middleUrl ??
      'https://mooc1-2.chaoxing.com/mooc-ans/visit/stucoursemiddle',
    work: options.workUrl ?? 'https://mooc1.chaoxing.com/mooc2/work/list',
    materials:
      options.materialsUrl ??
      'https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist',
  }

  async function getBrowser() {
    if (!browserPromise) {
      const executablePath = resolveBrowserPath(options.browserPath)
      browserPromise = chromium.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=zh-CN'],
      })
      browserPromise.catch(() => {
        browserPromise = null
      })
    }
    return browserPromise
  }

  function accountRow(userId) {
    return db
      .prepare('SELECT * FROM chaoxing_accounts WHERE user_id = ?')
      .get(userId)
  }

  function touchAccount(userId, patch) {
    const now = Date.now()
    const existing = accountRow(userId)
    if (!existing) {
      db.prepare(
        `INSERT INTO chaoxing_accounts (user_id, connected, last_sync_at, last_error, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        userId,
        patch.connected ? 1 : 0,
        patch.lastSyncAt ?? null,
        patch.lastError ?? null,
        now,
      )
      return
    }
    db.prepare(
      `UPDATE chaoxing_accounts
          SET connected = ?, last_sync_at = ?, last_error = ?, updated_at = ?
        WHERE user_id = ?`,
    ).run(
      (patch.connected ?? existing.connected) ? 1 : 0,
      patch.lastSyncAt ?? existing.last_sync_at,
      patch.lastError ?? existing.last_error,
      now,
      userId,
    )
  }

  function listCourses(userId) {
    return db
      .prepare(
        `SELECT id, course_id, class_id, cpi, name, teacher, url, selected, updated_at
           FROM chaoxing_courses WHERE user_id = ? ORDER BY name ASC`,
      )
      .all(userId)
  }

  function listItems(userId, { kind = '', courseId = '', limit = 300 } = {}) {
    const clauses = ['i.user_id = ?']
    const params = [userId]
    if (kind && ['assignment', 'material', 'message'].includes(kind)) {
      clauses.push('i.kind = ?')
      params.push(kind)
    }
    if (courseId) {
      clauses.push('c.course_id = ?')
      params.push(courseId)
    }
    params.push(Math.min(1000, Math.max(1, Number(limit) || 300)))
    return db
      .prepare(
        `SELECT i.id, i.kind, i.title, i.body, i.url, i.due_at, i.published_at,
                i.read_at, i.created_at, c.course_id, c.class_id, c.name AS course_name
           FROM chaoxing_items i
           JOIN chaoxing_courses c ON c.id = i.course_pk
          WHERE ${clauses.join(' AND ')}
          ORDER BY COALESCE(i.published_at, i.created_at) DESC
          LIMIT ?`,
      )
      .all(...params)
  }

  function overview(userId) {
    const account = accountRow(userId)
    const courses = listCourses(userId)
    const items = listItems(userId, { limit: 300 })
    const counts = { assignment: 0, material: 0, message: 0 }
    let unread = 0
    for (const item of items) {
      counts[item.kind] = (counts[item.kind] ?? 0) + 1
      if (!item.read_at) unread += 1
    }
    return {
      connected: Boolean(account?.connected) && sessions.has(userId),
      lastSyncAt: account?.last_sync_at ?? null,
      lastError: account?.last_error ?? '',
      courses,
      counts,
      unread,
      items,
    }
  }

  function markRead(userId, id) {
    db.prepare(
      'UPDATE chaoxing_items SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL',
    ).run(Date.now(), id, userId)
  }

  function setCourseSelected(userId, id, selected) {
    db.prepare('UPDATE chaoxing_courses SET selected = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
      selected ? 1 : 0,
      Date.now(),
      id,
      userId,
    )
  }

  function saveCourses(userId, courses) {
    const now = Date.now()
    const existing = new Map(listCourses(userId).map((course) => [course.id, course]))
    for (const course of courses) {
      const id = coursePk(userId, course.courseId, course.classId)
      const previous = existing.get(id)
      if (previous) {
        db.prepare(
          `UPDATE chaoxing_courses
              SET course_id = ?, class_id = ?, cpi = ?, name = ?, teacher = ?, url = ?, updated_at = ?
            WHERE id = ? AND user_id = ?`,
        ).run(
          course.courseId,
          course.classId,
          course.cpi,
          course.name,
          course.teacher ?? previous.teacher ?? '',
          course.url,
          now,
          id,
          userId,
        )
      } else {
        db.prepare(
          `INSERT INTO chaoxing_courses
             (id, user_id, course_id, class_id, cpi, name, teacher, url, selected, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        ).run(
          id,
          userId,
          course.courseId,
          course.classId,
          course.cpi,
          course.name,
          course.teacher ?? '',
          course.url,
          now,
        )
      }
    }
  }

  function upsertItems(userId, course, kind, items) {
    const now = Date.now()
    for (const item of items) {
      const sourceId = clean(item.sourceId, 200)
      if (!sourceId || !clean(item.title, 300)) continue
      const id = itemId(userId, kind, sourceId)
      const existing = db
        .prepare('SELECT id FROM chaoxing_items WHERE user_id = ? AND kind = ? AND source_id = ?')
        .get(userId, kind, sourceId)
      if (existing) {
        db.prepare(
          `UPDATE chaoxing_items
              SET title = ?, body = ?, url = ?, due_at = ?, published_at = ?
            WHERE id = ? AND user_id = ?`,
        ).run(
          clean(item.title, 300),
          clean(item.body, 4000),
          clean(item.url, 1000),
          item.dueAt ?? null,
          item.publishedAt ?? null,
          existing.id,
          userId,
        )
      } else {
        db.prepare(
          `INSERT INTO chaoxing_items
             (id, user_id, course_pk, kind, source_id, title, body, url, due_at, published_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          userId,
          course.id,
          kind,
          sourceId,
          clean(item.title, 300),
          clean(item.body, 4000),
          clean(item.url, 1000),
          item.dueAt ?? null,
          item.publishedAt ?? null,
          now,
        )
      }
    }
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

  async function startLogin(userId) {
    await closeUserPending(userId)
    const browser = await getBrowser()
    const context = await browser.newContext({
      userAgent: DEFAULT_UA,
      viewport: { width: 1440, height: 1000 },
      locale: 'zh-CN',
    })
    const page = await context.newPage()
    try {
      await page.goto(urls.login, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(800)
      if (!(await isLoginPage(page))) {
        throw new ChaoxingError('学习通登录页没有正常打开，请稍后重试。', 502)
      }
      const qr = page.locator('#quickCode')
      await qr.waitFor({ state: 'visible', timeout: 8_000 })
      const buffer = await qr.screenshot()
      const uuid = await page.locator('#uuid').inputValue().catch(() => '')
      const enc = await page.locator('#enc').inputValue().catch(() => '')
      if (!uuid || !enc) {
        throw new ChaoxingError('学习通二维码参数读取失败，请重新获取。', 502)
      }
      const loginId = sha1(`${userId}|${Date.now()}|${uuid}`).slice(0, 32)
      pending.set(loginId, {
        userId,
        context,
        page,
        uuid,
        enc,
        createdAt: Date.now(),
      })
      return {
        loginId,
        qr: `data:image/png;base64,${buffer.toString('base64')}`,
        expiresAt: Date.now() + 5 * 60_000,
      }
    } catch (error) {
      await context.close().catch(() => undefined)
      if (error instanceof ChaoxingError) throw error
      throw new ChaoxingError(`无法打开学习通登录页：${error.message || '未知错误'}`, 502)
    }
  }

  async function pollLogin(userId, loginId) {
    const item = pending.get(loginId)
    if (!item || item.userId !== userId) {
      throw new ChaoxingError('登录会话已失效，请重新获取二维码。', 409)
    }
    if (Date.now() - item.createdAt > 5 * 60_000) {
      await closePending(loginId)
      throw new ChaoxingError('二维码已过期，请重新获取。', 410)
    }
    const response = await item.context.request.post(
      urls.loginStatus,
      {
        form: {
          enc: item.enc,
          uuid: item.uuid,
          doubleFactorLogin: '',
          forbidotherlogin: '',
        },
        headers: {
          Referer: LOGIN_URL,
          'User-Agent': DEFAULT_UA,
        },
      },
    )
    const data = (await response.json().catch(() => ({}))) || {}
    if (data.status) {
      const cookies = await item.context.cookies()
      const ua = await item.page
        .evaluate(() => navigator.userAgent)
        .catch(() => DEFAULT_UA)
      let courses = []
      try {
        courses = await fetchCourses(item.context)
      } catch {
        // 登录成功但课程列表暂时失败，不阻断绑定；用户可稍后同步。
      }
      saveCourses(userId, courses)
      sessions.set(userId, {
        cookies,
        ua: ua || DEFAULT_UA,
        connectedAt: Date.now(),
      })
      touchAccount(userId, { connected: true, lastError: null })
      await closePending(loginId)
      return { status: 'connected', courses: courses.length }
    }
    if (data.type === 4) {
      return { status: 'scanned', nickname: clean(data.nickname, 80) }
    }
    return { status: 'waiting' }
  }

  function status(userId) {
    const account = accountRow(userId)
    return {
      connected: Boolean(account?.connected) && sessions.has(userId),
      loginOpen: [...pending.values()].some((item) => item.userId === userId),
      lastSyncAt: account?.last_sync_at ?? null,
      lastError: account?.last_error ?? '',
      courseCount: listCourses(userId).length,
    }
  }

  async function logout(userId) {
    await closeUserPending(userId)
    sessions.delete(userId)
    touchAccount(userId, { connected: false, lastError: null })
    return { ok: true }
  }

  async function fetchCourses(context) {
    const response = await context.request.get(urls.courseApi, {
      headers: {
        Referer: 'https://mooc1.chaoxing.com/',
        'User-Agent': DEFAULT_UA,
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
    })
    if (response.url().includes('passport2.chaoxing.com/login')) {
      throw new ChaoxingError('学习通登录已过期，请重新扫码。', 401)
    }
    const data = await response.json().catch(() => null)
    if (!data || !Array.isArray(data.channelList)) {
      throw new ChaoxingError('学习通课程接口结构变化，请稍后重试。', 502)
    }
    const courses = []
    for (const channel of data.channelList) {
      const content = channel?.content ?? {}
      const courseBlock = content.course ?? {}
      const courseData = Array.isArray(courseBlock.data) ? courseBlock.data : []
      for (const course of courseData) {
        if (!course?.id) continue
        const courseId = String(course.id)
        const classId = String(content.id ?? '')
        const cpi = String(content.cpi ?? '')
        courses.push({
          courseId,
          classId,
          cpi,
          name: clean(course.name, 160) || `课程 ${courseId}`,
          teacher: clean(course.teacherName || content.teacherName || '', 80),
          url: `${urls.courseHome}?courseid=${encodeURIComponent(
            courseId,
          )}&clazzid=${encodeURIComponent(classId)}&vc=1&cpi=${encodeURIComponent(cpi)}`,
        })
      }
    }
    const seen = new Set()
    return courses.filter((course) => {
      const key = `${course.courseId}|${course.classId}`
      if (!course.classId || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  async function fetchPage(context, url) {
    const response = await context.request.get(url, {
      headers: {
        Referer: 'https://mooc1.chaoxing.com/',
        'User-Agent': DEFAULT_UA,
      },
    })
    if (response.url().includes('passport2.chaoxing.com/login')) {
      throw new ChaoxingError('学习通登录已过期，请重新扫码。', 401)
    }
    return await response.text()
  }

  async function gotoPage(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(600)
    if (await isLoginPage(page)) {
      throw new ChaoxingError('学习通登录已过期，请重新扫码。', 401)
    }
  }

  async function syncHomework(page, course) {
    const middleUrl = `${urls.middle}?courseid=${encodeURIComponent(
      course.course_id,
    )}&clazzid=${encodeURIComponent(course.class_id)}&vc=1&cpi=${encodeURIComponent(
      course.cpi,
    )}&ismooc2=1&v=2`
    await gotoPage(page, middleUrl)
    const enc = await page.locator('#workEnc').inputValue().catch(() => '')
    if (!enc) return []
    const workUrl = `${urls.work}?courseId=${encodeURIComponent(
      course.course_id,
    )}&classId=${encodeURIComponent(course.class_id)}&cpi=${encodeURIComponent(
      course.cpi,
    )}&ut=s&enc=${encodeURIComponent(enc)}`
    await gotoPage(page, workUrl)
    await page
      .waitForSelector('.bottomList li, .work-list li, .workList li', { timeout: 4_000 })
      .catch(() => undefined)
    const rows = await page.evaluate(() => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim()
      const list =
        document.querySelector('.bottomList ul') ||
        document.querySelector('.work-list') ||
        document.querySelector('.workList') ||
        document.querySelector('ul')
      if (!list) return []
      return [...list.querySelectorAll('li')]
        .map((li) => {
          const text = clean(li.innerText)
          const href = li.getAttribute('data') || li.querySelector('a')?.href || ''
          const title =
            clean(
              li.querySelector('.workTitle, .title, h3, h4, strong, a')?.textContent ||
                text.split(' ')[0],
            ) || text.slice(0, 80)
          const deadline =
            clean(li.querySelector('.deadline, .time, .date, [class*=time]')?.textContent) ||
            (/截止[：:]?\s*([^ ]+(?:\s+[^ ]+)?)/.exec(text)?.[1] ?? '')
          const status =
            clean(li.querySelector('.status, [class*=status], [class*=state]')?.textContent) ||
            (/(未交|待交|已完成|已交|已过期)/.exec(text)?.[1] ?? '')
          return { title, deadline, status, href, text }
        })
        .filter((item) => item.title)
        .slice(0, 80)
    })
    return rows.map((row) => {
      let url = row.href
      try {
        url = new URL(row.href, workUrl).href
      } catch {
        // keep raw
      }
      return {
        sourceId: url || `${course.course_id}|${row.title}|${row.deadline}`,
        title: row.title,
        body: [row.status, row.deadline ? `截止 ${row.deadline}` : ''].filter(Boolean).join(' · '),
        url: url || course.url,
        dueAt: parseDeadline(row.deadline),
      }
    })
  }

  async function syncMaterials(page, course) {
    const url = `${urls.materials}?courseid=${encodeURIComponent(
      course.course_id,
    )}&clazzid=${encodeURIComponent(course.class_id)}&cpi=${encodeURIComponent(
      course.cpi,
    )}&ut=s&pages=1`
    await gotoPage(page, url)
    await page
      .waitForSelector('tr[type][id], ul.dataBody_td[type][id]', { timeout: 4_000 })
      .catch(() => undefined)
    const rows = await page
      .evaluate(() => {
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim()
        const rows = [
          ...document.querySelectorAll('tr[type][id], ul.dataBody_td[type][id]'),
        ]
        return rows
          .map((row) => {
            const type = row.getAttribute('type') || ''
            const name =
              row.getAttribute('dataname') ||
              row.querySelector('a.rename_title[title], a[name][title]')?.getAttribute('title') ||
              clean(row.innerText).split(' ')[0] ||
              row.getAttribute('id') ||
              ''
            const size = clean(
              row.querySelector('.dataBody_size_stu')?.textContent ||
                row.querySelector('td:nth-child(4), .size')?.textContent,
            )
            const download =
              row.querySelector('a[href*="/coursedata/downloadData?"]')?.href ||
              row.getAttribute('url') ||
              ''
            return {
              id: row.getAttribute('id') || '',
              type,
              name,
              size,
              download,
            }
          })
          .filter((item) => item.name && item.type && item.type !== 'afolder')
          .slice(0, 120)
      })
      .then((rows) =>
        rows.map((row) => {
          let download = row.download
          try {
            download = new URL(row.download, url).href
          } catch {
            // keep raw
          }
          return {
            sourceId: row.id || `${course.course_id}|${row.name}`,
            title: row.name,
            body: [row.size, row.type].filter(Boolean).join(' · '),
            url: download || course.url,
          }
        }),
      )
    return rows
  }

  async function syncMessages(page, course) {
    // 课程消息没有稳定公开接口：先访问课程主页找「消息/通知/公告」入口，再通用解析列表。
    await gotoPage(page, course.url)
    const links = await pageLinks(page)
    const entry = links.find((link) => /消息|通知|公告/.test(link.text))
    if (!entry) return []
    await gotoPage(page, entry.href)
    await page.waitForTimeout(700)
    const rows = await page.evaluate(() => {
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim()
        const candidates = [
          ...document.querySelectorAll(
            '.message-list li, .notice-list li, .messageList li, .noticeList li, .list li, .item, .messageItem, .noticeItem',
          ),
        ]
        const seen = new Set()
        return candidates
          .map((item) => {
            const text = clean(item.innerText)
            const title =
              clean(item.querySelector('h3, h4, .title, .message-title, .notice-title, a')?.textContent) ||
              text.split(' ')[0] ||
              text.slice(0, 100)
            const href = item.querySelector('a[href]')?.href || ''
            const time =
              clean(item.querySelector('.time, .date, [class*=time]')?.textContent) ||
              (/(20\d{2}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}\s+\d{1,2}:\d{2})/.exec(text)?.[1] ??
                '')
            return { title, text, href, time }
          })
          .filter((item) => {
            if (!item.title || item.title.length < 2) return false
            const key = `${item.title}|${item.time}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          .slice(0, 50)
      })
      .then((rows) =>
        rows.map((row) => ({
          sourceId: row.href || `${course.course_id}|${row.title}|${row.time}`,
          title: row.title,
          body: row.text.slice(0, 1200),
          url: row.href || entry.href,
          publishedAt: parseDeadline(row.time),
        })),
      )
    return rows
  }

  async function sync(userId) {
    const session = sessions.get(userId)
    if (!session) {
      throw new ChaoxingError('还没有绑定学习通，请先扫码登录。', 401)
    }
    const account = accountRow(userId)
    const browser = await getBrowser()
    const context = await browser.newContext({
      userAgent: session.ua || DEFAULT_UA,
      viewport: { width: 1440, height: 1000 },
      locale: 'zh-CN',
    })
    await context.addCookies(session.cookies).catch(() => undefined)
    const page = await context.newPage()
    try {
      let remote = []
      try {
        remote = await fetchCourses(context)
      } catch (error) {
        if (error instanceof ChaoxingError && error.status === 401) {
          sessions.delete(userId)
          touchAccount(userId, { connected: false, lastError: error.message })
          throw error
        }
        throw error
      }
      saveCourses(userId, remote)
      const courses = listCourses(userId).filter((course) => course.selected)
      const result = { courses: remote.length, assignments: 0, materials: 0, messages: 0, errors: [] }
      for (const course of courses) {
        for (const [kind, fn, key] of [
          ['assignment', syncHomework, 'assignments'],
          ['material', syncMaterials, 'materials'],
          ['message', syncMessages, 'messages'],
        ]) {
          try {
            const items = await fn(page, course)
            upsertItems(userId, course, kind, items)
            result[key] += items.length
          } catch (error) {
            if (error instanceof ChaoxingError && error.status === 401) throw error
            result.errors.push({
              course: course.name,
              kind,
              message: error instanceof Error ? error.message : '同步失败',
            })
          }
        }
      }
      session.cookies = await context.cookies().catch(() => session.cookies)
      touchAccount(userId, {
        connected: true,
        lastSyncAt: Date.now(),
        lastError: result.errors.length ? result.errors[0].message : null,
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步失败'
      touchAccount(userId, { lastError: message })
      if (error instanceof ChaoxingError) throw error
      throw new ChaoxingError(message, 502)
    } finally {
      await context.close().catch(() => undefined)
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
    pollLogin,
    status,
    logout,
    sync,
    overview,
    markRead,
    setCourseSelected,
    close,
  }
}
