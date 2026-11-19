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
  const frames = page.frames()
  const results = await Promise.all(
    frames.map((frame) =>
      frame
        .evaluate(() =>
          [...document.querySelectorAll('a[href]')]
            .map((anchor) => ({
              href: anchor.href,
              text: String(anchor.textContent || '').replace(/\s+/g, ' ').trim(),
            }))
            .filter((link) => link.href && !/^javascript:/i.test(link.href))
            .slice(0, 300),
        )
        .catch(() => []),
    ),
  )
  return results.flat().slice(0, 500)
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
    workAll: options.workAllUrl ?? 'https://mooc1-api.chaoxing.com/work/stu-work',
    notices: options.noticesUrl ?? 'https://notice.chaoxing.com/pc/notice/getNoticeList',
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

  function saveAccountSession(userId, cookies, ua) {
    if (!accountRow(userId)) touchAccount(userId, { connected: true, lastError: null })
    db.prepare(
      `UPDATE chaoxing_accounts
          SET connected = 1, cookies_json = ?, ua = ?, updated_at = ?
        WHERE user_id = ?`,
    ).run(JSON.stringify(cookies || []), ua || DEFAULT_UA, Date.now(), userId)
  }

  function restoreSession(userId) {
    if (sessions.has(userId)) return
    const row = accountRow(userId)
    if (!row?.connected || !row.cookies_json) return
    try {
      const cookies = JSON.parse(row.cookies_json)
      if (Array.isArray(cookies) && cookies.length > 0) {
        sessions.set(userId, {
          cookies,
          ua: row.ua || DEFAULT_UA,
          connectedAt: Number(row.updated_at || Date.now()),
        })
      }
    } catch {
      // 旧数据/损坏的 Cookie 不恢复，用户重新登录即可。
    }
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
    restoreSession(userId)
    const account = accountRow(userId)
    const courses = listCourses(userId)
    const items = listItems(userId, { limit: 1000 })
    const counts = { assignment: 0, material: 0, message: 0 }
    let unread = 0
    const rows = db
      .prepare(
        `SELECT kind, COUNT(*) AS n,
                SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread
           FROM chaoxing_items
          WHERE user_id = ?
          GROUP BY kind`,
      )
      .all(userId)
    for (const row of rows) {
      counts[row.kind] = Number(row.n)
      unread += Number(row.unread)
    }
    const chapterRows = db
      .prepare(
        `SELECT ch.id, ch.course_pk, ch.chapter_no, ch.chapter_title, ch.section_no, ch.section_title,
                ch.task_count, ch.done, ch.url,
                c.course_id, c.name AS course_name
           FROM chaoxing_chapters ch
           JOIN chaoxing_courses c ON c.id = ch.course_pk
          WHERE ch.user_id = ?
          ORDER BY c.name ASC, ch.chapter_no ASC, ch.section_no ASC`,
      )
      .all(userId)
    const byCourse = new Map()
    let chapterUnfinished = 0
    for (const row of chapterRows) {
      const key = row.course_pk
      let group = byCourse.get(key)
      if (!group) {
        group = {
          course_id: row.course_pk,
          course_name: row.course_name,
          total: 0,
          unfinished: 0,
          items: [],
        }
        byCourse.set(key, group)
      }
      group.total += 1
      if (!row.done) {
        group.unfinished += 1
        chapterUnfinished += 1
      }
      group.items.push({
        id: row.id,
        chapterNo: row.chapter_no,
        chapterTitle: row.chapter_title,
        sectionNo: row.section_no,
        sectionTitle: row.section_title,
        taskCount: row.task_count,
        done: Boolean(row.done),
        url: row.url,
      })
    }
    return {
      connected: Boolean(account?.connected) && sessions.has(userId),
      lastSyncAt: account?.last_sync_at ?? null,
      lastError: account?.last_error ?? '',
      courses,
      counts,
      unread,
      chapterUnfinished,
      chapterTotal: chapterRows.length,
      chapters: [...byCourse.values()],
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

  async function captureQr(page) {
    const qr = page.locator('#quickCode')
    await qr.waitFor({ state: 'visible', timeout: 8_000 })
    // 截图期间暂停登录页自己的二维码轮询，避免 uuid 在读取过程中被刷新；
    // 截图结束后恢复，扫码确认后的跳转由官方 loopStatus 完成。
    await page
      .evaluate(() => {
        try {
          if (typeof qrInterValObj !== 'undefined' && qrInterValObj) {
            clearInterval(qrInterValObj)
          }
        } catch {
          // ignore
        }
      })
      .catch(() => undefined)
    await page.waitForTimeout(150)
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const uuidBefore = await page.locator('#uuid').inputValue().catch(() => '')
        const encBefore = await page.locator('#enc').inputValue().catch(() => '')
        const src = await qr.getAttribute('src').catch(() => '')
        const buffer = await qr.screenshot()
        await page.waitForTimeout(120)
        const uuidAfter = await page.locator('#uuid').inputValue().catch(() => '')
        const encAfter = await page.locator('#enc').inputValue().catch(() => '')
        let srcUuid = ''
        try {
          srcUuid = new URL(src || '', page.url()).searchParams.get('uuid') || ''
        } catch {
          // ignore malformed src
        }
        const stable =
          uuidBefore &&
          uuidBefore === uuidAfter &&
          encBefore &&
          encBefore === encAfter &&
          (!srcUuid || srcUuid === uuidBefore)
        if (stable) {
          return {
            uuid: uuidBefore,
            enc: encBefore,
            qr: `data:image/png;base64,${buffer.toString('base64')}`,
          }
        }
        await page.waitForTimeout(250)
      }
      throw new ChaoxingError('学习通二维码刷新过于频繁，请点「换一张二维码」重试。', 502)
    } finally {
      await page
        .evaluate(() => {
          try {
            if (typeof loopStatus === 'function') {
              qrInterValObj = window.setInterval(loopStatus, 3000)
            }
          } catch {
            // ignore
          }
        })
        .catch(() => undefined)
    }
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
      const { uuid, enc, qr } = await captureQr(page)
      const loginId = sha1(`${userId}|${Date.now()}|${uuid}`).slice(0, 32)
      pending.set(loginId, {
        userId,
        context,
        page,
        uuid,
        enc,
        createdAt: Date.now(),
        lastPoll: '',
      })
      return {
        loginId,
        qr,
        expiresAt: Date.now() + 5 * 60_000,
      }
    } catch (error) {
      await context.close().catch(() => undefined)
      if (error instanceof ChaoxingError) throw error
      throw new ChaoxingError(`无法打开学习通登录页：${error.message || '未知错误'}`, 502)
    }
  }

  async function loginWithPassword(userId, input) {
    const account = String(input?.account ?? '').trim()
    const password = String(input?.password ?? '')
    if (!account || account.length > 80) throw new ChaoxingError('请输入学习通手机号/账号。')
    if (!password || password.length > 200) throw new ChaoxingError('请输入学习通密码。')
    const browser = await getBrowser()
    const context = await browser.newContext({
      userAgent: DEFAULT_UA,
      viewport: { width: 1440, height: 1000 },
      locale: 'zh-CN',
    })
    const page = await context.newPage()
    try {
      await page.goto(urls.login, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(900)
      if (!(await isLoginPage(page))) {
        throw new ChaoxingError('学习通登录页没有正常打开，请稍后重试。', 502)
      }
      await page.locator('#phone').fill(account)
      await page.locator('#pwd').fill(password)
      await page
        .evaluate(() => {
          if (typeof loginByPhoneAndPwd === 'function') loginByPhoneAndPwd()
        })
        .catch(() => undefined)
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => null),
        page.waitForTimeout(7_000),
      ])
      await page.waitForTimeout(1_200)
      if (await isLoginPage(page)) {
        const messages = await page
          .locator('#err-txt, .err-txt, #phoneMsg, #pwdMsg')
          .allInnerTexts()
          .catch(() => [])
        throw new ChaoxingError(
          messages.map((item) => item.trim()).filter(Boolean).join(' ') ||
            '账号密码登录失败；可能需要短信/滑块验证，请改用扫码登录。',
          401,
        )
      }
      const cookies = await context.cookies()
      if (cookies.length === 0) {
        throw new ChaoxingError('学习通没有返回登录态，请重试。', 502)
      }
      const ua = await page.evaluate(() => navigator.userAgent).catch(() => DEFAULT_UA)
      let courses = []
      try {
        courses = await fetchCourses(context)
      } catch {
        // 课程列表稍后同步
      }
      saveCourses(userId, courses)
      sessions.set(userId, {
        cookies,
        ua: ua || DEFAULT_UA,
        connectedAt: Date.now(),
      })
      saveAccountSession(userId, cookies, ua || DEFAULT_UA)
      touchAccount(userId, { connected: true, lastError: null })
      return { connected: true, courses: courses.length }
    } catch (error) {
      if (error instanceof ChaoxingError) throw error
      throw new ChaoxingError(error.message || '账号密码登录失败。', 502)
    } finally {
      await context.close().catch(() => undefined)
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
    // 登录页自己的 loopStatus 会刷新二维码，这里跟随页面上的最新 uuid/enc，
    // 避免继续轮询旧码导致手机确认后仍无反应。
    if (await isLoginPage(item.page).catch(() => false)) {
      const current = await item.page
        .evaluate(() => ({
          uuid: document.querySelector('#uuid')?.value || '',
          enc: document.querySelector('#enc')?.value || '',
        }))
        .catch(() => null)
      if (current?.uuid) {
        item.uuid = current.uuid
        item.enc = current.enc
      }
    }
    let data = {}
    try {
      const pageUrl = item.page.url()
      if (pageUrl.includes('passport2.chaoxing.com')) {
        // 在登录页上下文里发请求，确保和二维码使用同一份会话/Referer。
        data = await item.page.evaluate(
          async ({ enc, uuid }) => {
            const body = new URLSearchParams({
              enc,
              uuid,
              doubleFactorLogin: '0',
              forbidotherlogin: '0',
            })
            const response = await fetch('/getauthstatus/v2', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
              },
              body: body.toString(),
            })
            return await response.json().catch(() => ({}))
          },
          { enc: item.enc, uuid: item.uuid },
        )
      } else if (!(await isLoginPage(item.page))) {
        // 登录页已经被扫码流程跳走，说明已登录。
        data = { status: true }
      }
    } catch {
      // fall through to context request
    }
    if (!data || (!data.status && data.type !== 4 && data.type !== 3)) {
      try {
        const response = await item.context.request.post(urls.loginStatus, {
          form: {
            enc: item.enc,
            uuid: item.uuid,
            doubleFactorLogin: '0',
            forbidotherlogin: '0',
          },
          headers: {
            Referer: LOGIN_URL,
            'User-Agent': DEFAULT_UA,
          },
        })
        data = (await response.json().catch(() => ({}))) || {}
      } catch {
        // 登录页/上下文已被新二维码替换或关闭，按过期处理，避免把底层异常抛给用户。
        return { status: 'expired' }
      }
    }
    // 官方 loopStatus 收到 status:true 后会跳转；以页面离开登录页为准。
    if (!data.status && !(await isLoginPage(item.page).catch(() => true))) {
      data = { status: true }
    }
    const signature = `${data.status === true}|${data.type ?? ''}`
    if (item.lastPoll !== signature) {
      item.lastPoll = signature
      console.log('[chaoxing poll]', userId, signature, clean(data.nickname, 80))
    }
    if (!data.status && data.type === 2) {
      // 二维码失效：官方轮询可能刚换过码，先看页面上的 uuid 是否已变化；
      // 没变化再主动 reload 拿新码，避免和页面轮询重复刷新。
      try {
        await item.page.waitForTimeout(900)
        if (!(await isLoginPage(item.page))) {
          data = { status: true }
        } else {
          const current = await item.page.evaluate(
            () => ({
              uuid: document.querySelector('#uuid')?.value || '',
              enc: document.querySelector('#enc')?.value || '',
            }),
          )
          if (current.uuid && current.uuid !== item.uuid) {
            const fresh = await captureQr(item.page)
            item.uuid = fresh.uuid
            item.enc = fresh.enc
            item.createdAt = Date.now()
            item.lastPoll = ''
            return { status: 'refreshed', qr: fresh.qr }
          }
          await item.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
          await item.page.waitForTimeout(700)
          if (!(await isLoginPage(item.page))) {
            data = { status: true }
          } else {
            const fresh = await captureQr(item.page)
            item.uuid = fresh.uuid
            item.enc = fresh.enc
            item.createdAt = Date.now()
            item.lastPoll = ''
            return { status: 'refreshed', qr: fresh.qr }
          }
        }
      } catch {
        return { status: 'expired' }
      }
    }
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
      saveAccountSession(userId, cookies, ua || DEFAULT_UA)
      touchAccount(userId, { connected: true, lastError: null })
      await closePending(loginId)
      return { status: 'connected', courses: courses.length }
    }
    if (data.type === 4 || data.type === 3) {
      return { status: 'scanned', nickname: clean(data.nickname, 80) }
    }
    return { status: 'waiting' }
  }

  function status(userId) {
    restoreSession(userId)
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
    db.prepare(
      'UPDATE chaoxing_accounts SET connected = 0, cookies_json = NULL, ua = NULL, updated_at = ? WHERE user_id = ?',
    ).run(Date.now(), userId)
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

  async function syncAllMessages(context, courses) {
    const response = await context.request.get(urls.notices, {
      headers: {
        Referer: 'https://i.chaoxing.com/',
        'User-Agent': DEFAULT_UA,
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
    })
    if (response.url().includes('passport2.chaoxing.com/login')) {
      throw new ChaoxingError('学习通登录已过期，请重新扫码。', 401)
    }
    const payload = await response.json().catch(() => null)
    if (!payload) return []
    const list =
      payload?.notices?.list ??
      payload?.notices?.data ??
      payload?.data ??
      (Array.isArray(payload) ? payload : [])
    if (!Array.isArray(list)) return []
    const byId = new Map(courses.map((course) => [String(course.course_id), course]))
    const byName = new Map(courses.map((course) => [course.name, course]))
    const items = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const id = String(item.uuid || item.idCode || item.id || '')
      if (!id) continue
      const rawContent = String(item.content || '')
      let content = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      let courseId = ''
      let detailUrl = ''
      let attachments = item.attachment
      if (typeof attachments === 'string') {
        try {
          attachments = JSON.parse(attachments)
        } catch {
          attachments = []
        }
      }
      if (attachments && !Array.isArray(attachments)) attachments = [attachments]
      for (const attachment of Array.isArray(attachments) ? attachments : []) {
        if (!attachment || typeof attachment !== 'object') continue
        let raw = attachment.att_web ?? attachment
        if (typeof raw === 'string') {
          try {
            raw = JSON.parse(raw)
          } catch {
            raw = {}
          }
        }
        if (raw && typeof raw === 'object') {
          courseId = String(raw.courseId || raw.courseid || courseId || '')
          detailUrl = String(raw.url || detailUrl || '')
        }
      }
      const nameMatch = /课程名称[：:]\s*([^\n<]+)/.exec(rawContent)
      const courseName = nameMatch?.[1]?.replace(/\s+/g, ' ').trim() || ''
      const course = byId.get(courseId) || byName.get(courseName)
      if (!course) continue
      const title = clean(item.title || content.split(/[。\n]/)[0] || course.name, 300)
      if (!title) continue
      let url = detailUrl
      try {
        url = new URL(detailUrl || course.url, course.url).href
      } catch {
        url = course.url
      }
      items.push({
        course,
        item: {
          sourceId: `notice:${id}`,
          title,
          body: content.slice(0, 1200),
          url,
          publishedAt: parseDeadline(item.sendTime || item.insertTime),
        },
      })
    }
    return items
  }

  function findCourseByName(courses, rawName) {
    const name = String(rawName || '')
      .replace(/[《》]/g, '')
      .replace(/\.{2,}|…+/g, '')
      .replace(/\s+/g, '')
      .trim()
    if (!name) return undefined
    return (
      courses.find((course) => course.name.replace(/\s+/g, '') === name) ||
      courses.find((course) => {
        const full = course.name.replace(/\s+/g, '')
        return full.startsWith(name) || name.startsWith(full) || full.includes(name)
      })
    )
  }

  async function syncAllHomework(page, courses) {
    await gotoPage(page, urls.workAll)
    await page
      .waitForSelector('li[data]', { timeout: 5_000 })
      .catch(() => undefined)
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('li[data]')].map((li, index) => {
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim()
        const p = li.querySelector('p')
        const spans = [...li.querySelectorAll('span')]
        const status =
          clean(li.querySelector('span.status')?.textContent) ||
          clean(spans.find((span) => /未提交|未交|待批阅|已完成|已交|已过期/.test(span.textContent || ''))?.textContent)
        const courseName =
          clean(spans.find((span) => /《.+》/.test(span.textContent || ''))?.textContent)
        const remaining = clean(li.querySelector('span.fr')?.textContent)
        return {
          index,
          title: clean(p?.textContent),
          status,
          courseName,
          remaining,
          href: li.getAttribute('data') || '',
        }
      }),
    )
    const now = Date.now()
    const result = []
    for (const row of rows) {
      const course = findCourseByName(courses, row.courseName)
      if (!course || !row.title) continue
      let dueAt = null
      const remain = /剩余(\d+)小时(\d+)分钟/.exec(row.remaining)
      if (remain) dueAt = now + Number(remain[1]) * 3_600_000 + Number(remain[2]) * 60_000
      result.push({
        course,
        item: {
          sourceId: row.href || `${course.course_id}|${row.title}`,
          title: row.title,
          body: [row.status, row.remaining].filter(Boolean).join(' · '),
          url: row.href || course.url,
          dueAt,
          publishedAt: now - row.index * 1000,
        },
      })
    }
    return result
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
    const frameResults = await Promise.all(
      page.frames().map((frame) =>
        frame
          .evaluate(() => {
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
          .catch(() => []),
      ),
    )
    const rows = frameResults.flat()
    return rows.map((row) => ({
      sourceId: row.href || `${course.course_id}|${row.title}|${row.time}`,
      title: row.title,
      body: row.text.slice(0, 1200),
      url: row.href || entry.href,
      publishedAt: parseDeadline(row.time),
    }))
  }

  async function syncChapters(page, course, userId) {
    await gotoPage(page, course.url)
    await page
      .waitForSelector('.timeline .units, .content1 .units', { timeout: 5_000 })
      .catch(() => undefined)
    const units = await page.evaluate(() => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim()
      const roots = [
        ...document.querySelectorAll('.timeline .units, .content1 .units'),
      ]
      return roots.map((unit) => {
        const chapterNo =
          clean(unit.querySelector('.levelfirst .chapterNumber, h2 .chapterNumber')?.textContent) ||
          ''
        const chapterTitle =
          clean(unit.querySelector('.levelfirst .fontCon, h2 .fontCon')?.textContent) ||
          clean(unit.querySelector('h2')?.textContent) ||
          chapterNo
        const sections = [...unit.querySelectorAll('.leveltwo')].map((section) => {
          // 旧版页面用 input.knowledgeJobCount 标记未完成任务数；新版课程首页
          // 已移除该节点，任务数可能渲染在其它 class 上，做兼容读取。
          const countEl = section.querySelector(
            'input.knowledgeJobCount, .knowledgeJobCount, .jobUnfinishCount, .unfinishCount, .taskCount',
          )
          const raw = countEl?.value ?? countEl?.textContent ?? ''
          const count = Number(String(raw).replace(/\D+/g, ''))
          const flags = [
            section.className,
            ...[...section.querySelectorAll('em, i, span, .icon')].map((el) => el.className),
          ].join(' ')
          const done = /finish|finished|complete|completed|done|pass/.test(flags)
          return {
            no: clean(section.querySelector('.chapterNumber')?.textContent),
            title:
              clean(section.querySelector('h3 .fontCon, h3')?.textContent) ||
              clean(section.querySelector('h3')?.textContent),
            count: Number.isFinite(count) ? count : null,
            done,
            href: section.querySelector('a[href]')?.href || '',
          }
        })
        return { chapterNo, chapterTitle, sections }
      })
    })
    // 课程首页的“待完成任务点”列表只列未完成章节：有任务数时按数判断，
    // 拿不到任务数时视为未完成，而不是反过来全部判成已完成。
    const hasCounts = units.some((unit) =>
      unit.sections.some((section) => typeof section.count === 'number'),
    )
    const rows = []
    for (const unit of units) {
      for (const section of unit.sections) {
        if (!section.title) continue
        rows.push({
          chapterNo: unit.chapterNo,
          chapterTitle: unit.chapterTitle,
          sectionNo: section.no,
          sectionTitle: section.title,
          taskCount: hasCounts ? section.count || 0 : 1,
          done: hasCounts ? (section.count || 0) <= 0 : section.done,
          url: section.href || course.url,
        })
      }
    }
    const now = Date.now()
    db.prepare('DELETE FROM chaoxing_chapters WHERE user_id = ? AND course_pk = ?').run(
      userId,
      course.id,
    )
    for (const row of rows) {
      const id = `cxch-${sha1(`${course.id}|${row.sectionNo}|${row.sectionTitle}`).slice(0, 32)}`
      db.prepare(
        `INSERT OR REPLACE INTO chaoxing_chapters
           (id, user_id, course_pk, chapter_no, chapter_title, section_no, section_title,
            task_count, done, url, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        course.id,
        row.chapterNo,
        row.chapterTitle,
        row.sectionNo,
        row.sectionTitle,
        row.taskCount,
        row.done ? 1 : 0,
        row.url,
        now,
      )
    }
    return rows.filter((row) => !row.done).length
  }

  async function syncMessagesOnly(userId) {
    restoreSession(userId)
    const session = sessions.get(userId)
    if (!session) throw new ChaoxingError('还没有绑定学习通，请先扫码或账号密码登录。', 401)
    const browser = await getBrowser()
    const context = await browser.newContext({
      userAgent: session.ua || DEFAULT_UA,
      viewport: { width: 1440, height: 1000 },
      locale: 'zh-CN',
    })
    await context.addCookies(session.cookies).catch(() => undefined)
    try {
      const remote = await fetchCourses(context)
      saveCourses(userId, remote)
      const courses = listCourses(userId).filter((course) => course.selected)
      const notices = await syncAllMessages(context, courses)
      for (const notice of notices) upsertItems(userId, notice.course, 'message', [notice.item])
      session.cookies = await context.cookies().catch(() => session.cookies)
      saveAccountSession(userId, session.cookies, session.ua)
      touchAccount(userId, { connected: true, lastSyncAt: Date.now(), lastError: null })
      return { courses: remote.length, messages: notices.length }
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步消息失败'
      touchAccount(userId, { lastError: message })
      if (error instanceof ChaoxingError) throw error
      throw new ChaoxingError(message, 502)
    } finally {
      await context.close().catch(() => undefined)
    }
  }

  async function sync(userId) {
    restoreSession(userId)
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
      const result = { courses: remote.length, assignments: 0, materials: 0, messages: 0, chapters: 0, errors: [] }
      let messagesFromEndpoint = false
      try {
        const notices = await syncAllMessages(context, courses)
        for (const notice of notices) {
          upsertItems(userId, notice.course, 'message', [notice.item])
        }
        result.messages = notices.length
        messagesFromEndpoint = true
      } catch (error) {
        if (error instanceof ChaoxingError && error.status === 401) throw error
        result.errors.push({
          course: '全部课程',
          kind: 'message',
          message: error instanceof Error ? error.message : '课程消息接口暂时不可用',
        })
      }
      let homeworkFromEndpoint = false
      try {
        const homework = await syncAllHomework(page, courses)
        for (const entry of homework) {
          upsertItems(userId, entry.course, 'assignment', [entry.item])
        }
        result.assignments = homework.length
        homeworkFromEndpoint = true
      } catch (error) {
        if (error instanceof ChaoxingError && error.status === 401) throw error
        result.errors.push({
          course: '全部课程',
          kind: 'assignment',
          message: error instanceof Error ? error.message : '作业接口暂时不可用',
        })
      }
      for (const course of courses) {
        try {
          result.chapters += await syncChapters(page, course, userId)
        } catch (error) {
          if (error instanceof ChaoxingError && error.status === 401) throw error
          result.errors.push({
            course: course.name,
            kind: 'chapter',
            message: error instanceof Error ? error.message : '章节同步失败',
          })
        }
        for (const [kind, fn, key] of [
          ...(homeworkFromEndpoint
            ? []
            : [['assignment', syncHomework, 'assignments']]),
          ['material', syncMaterials, 'materials'],
          ...(messagesFromEndpoint
            ? []
            : [['message', syncMessages, 'messages']]),
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
      saveAccountSession(userId, session.cookies, session.ua)
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
    loginWithPassword,
    pollLogin,
    status,
    logout,
    sync,
    syncMessagesOnly,
    overview,
    markRead,
    setCourseSelected,
    close,
  }
}
