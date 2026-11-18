import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { scoresQueryScript } from './jw-scripts.mjs'

/**
 * School timetable / scores bridge.
 * Login happens once in a visible window (the human types the password/captcha);
 * afterwards the same on-disk browser profile is reused headlessly, so reads no
 * longer pop a window. Credentials never pass through the app.
 */

const ROUTE = '/api/jw/'
const PROFILE_DIR = path.resolve('.jw-profile')
const STATE_FILE = path.resolve('.jw-state.json')
const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]

interface JwState {
  base: string
  timetableUrl: string
  scoresUrl: string
  /** User agent of the login window; WAF-bound sessions break if the headless UA differs. */
  ua?: string
  /** JSESSIONID and friends are session cookies: closing the login window drops them. */
  cookies?: Array<{
    name: string
    value: string
    domain: string
    path: string
    expires: number
    httpOnly: boolean
    secure: boolean
    sameSite?: 'Strict' | 'Lax' | 'None'
  }>
}

let jwState: JwState = loadState()

function normalizeState(state: JwState): JwState {
  let origin = ''
  try {
    origin = new URL(state.timetableUrl || state.scoresUrl || state.base).origin
  } catch {
    // No usable URL yet; leave the state as-is.
  }
  if (!origin) return state
  return {
    ...state,
    base: state.base || `${origin}/gzasc/`,
    timetableUrl: state.timetableUrl || `${origin}/gzasc_jsxsd/xskb/xskb_list.do`,
    scoresUrl: state.scoresUrl || `${origin}/gzasc_jsxsd/cjcx/cjkb_cjb1.do`,
  }
}

function loadState(): JwState {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Partial<JwState>
    return normalizeState({
      base: parsed.base ?? '',
      timetableUrl: parsed.timetableUrl ?? '',
      scoresUrl: parsed.scoresUrl ?? '',
      ua: parsed.ua ?? '',
      cookies: Array.isArray(parsed.cookies) ? parsed.cookies : [],
    })
  } catch {
    return { base: '', timetableUrl: '', scoresUrl: '', ua: '', cookies: [] }
  }
}

function saveState() {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(jwState, null, 2), 'utf8')
  } catch {
    // Losing the remembered URL only costs one extra login.
  }
}

type Playwright = typeof import('playwright-core')
type BrowserContext = Awaited<ReturnType<Playwright['chromium']['launchPersistentContext']>>
type Page = Awaited<ReturnType<BrowserContext['newPage']>>

let playwright: Playwright | undefined
let context: BrowserContext | undefined
let activePage: Page | undefined
let loginWindowOpen = false

async function getPlaywright() {
  if (!playwright) playwright = await import('playwright-core')
  return playwright
}

function findBrowser() {
  return BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('x-shishuo-jw-proxy', '1')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8')
      if (data.length > 16_384) reject(new Error('too-large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

async function ensureContext(headless: boolean) {
  if (context) return context
  const playwrightModule = await getPlaywright()
  const executablePath = findBrowser()
  if (!executablePath) {
    throw new Error('没有找到 Edge 或 Chrome。请先安装浏览器，或改用手动添加。')
  }
  context = await playwrightModule.chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath,
    headless,
    viewport: headless ? { width: 1440, height: 1000 } : null,
    args: headless ? [] : ['--start-maximized'],
    ...(headless && jwState.ua ? { userAgent: jwState.ua } : {}),
  })
  loginWindowOpen = !headless
  return context
}

function currentPage() {
  if (!context) return undefined
  const pages = context.pages().filter((page) => !page.isClosed())
  if (pages.length === 0) return undefined
  if (activePage && pages.includes(activePage)) return activePage
  activePage = pages[pages.length - 1]
  return activePage
}

async function closeContext() {
  const existing = context
  context = undefined
  activePage = undefined
  loginWindowOpen = false
  if (existing) await existing.close().catch(() => undefined)
}

/** 强智 may rotate JSESSIONID mid-session; keep the saved copy in step. */
async function syncCookies(browserContext: BrowserContext | undefined) {
  if (!browserContext) return
  const fresh = await browserContext.cookies().catch(() => [])
  if (fresh.length > 0) {
    jwState.cookies = fresh
    saveState()
  }
}

async function openLogin(baseUrl: string) {
  await closeContext()
  jwState.base = baseUrl || jwState.base
  saveState()
  const browserContext = await ensureContext(false)
  const page = currentPage() ?? (await browserContext.newPage())
  activePage = page
  await page.goto(jwState.base, { waitUntil: 'domcontentloaded' }).catch(() => undefined)
  await page.bringToFront()
  return { url: page.url() }
}

const LOGIN_CHECK_SCRIPT = `(() => {
  return Boolean(
    document.querySelector('#loginForm') ||
      document.querySelector('input[name="userAccount"]') ||
      /Logon\\.do/i.test(location.href)
  )
})()`

async function isLoginPage(page: Page) {
  return (await page.evaluate(LOGIN_CHECK_SCRIPT).catch(() => false)) as boolean
}

async function finishLogin() {
  const page = currentPage()
  if (!page) throw new Error('登录窗口没有打开。')
  if (await isLoginPage(page)) {
    throw new Error('页面还停留在登录页。请先在窗口里完成登录，并打开「学期课表」或「成绩查询」页。')
  }
  const url = page.url()
  // The timetable usually lives in an iframe; record the frame URL, not just the shell.
  for (const frame of page.frames()) {
    try {
      const frameUrl = frame.url()
      if (/xskb|kb\.do|kcb/i.test(frameUrl)) jwState.timetableUrl = frameUrl
      if (/cjcx|kscj|cjb/i.test(frameUrl)) jwState.scoresUrl = frameUrl
    } catch {
      // Detached frame.
    }
  }
  if (/xskb|kb\.do|kcb/i.test(url)) jwState.timetableUrl = url
  if (/cjcx|kscj|cjb/i.test(url)) jwState.scoresUrl = url

  // The portal menu is where the real URLs live (they differ per school).
  const MENU_LINKS = `(() => {
    const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim()
    return [...document.querySelectorAll('a[href]')]
      .map((anchor) => ({ href: anchor.href, text: clean(anchor.textContent) }))
      .filter((link) => /成绩|课表|cjcx|kscj|xskb/i.test(link.text + ' ' + link.href))
      .slice(0, 16)
  })()`
  let discoveredScores = ''
  let discoveredTimetable = ''
  for (const frame of page.frames()) {
    try {
      const links = (await frame.evaluate(MENU_LINKS)) as Array<{ href: string; text: string }>
      for (const link of links) {
        try {
          const linkUrl = new URL(link.href)
          if (linkUrl.origin !== new URL(jwState.base || url).origin) continue
          if (!discoveredScores && /成绩|cjcx|kscj/i.test(link.text + ' ' + link.href)) {
            discoveredScores = linkUrl.href
          }
          if (!discoveredTimetable && /课表|xskb|kcb/i.test(link.text + ' ' + link.href)) {
            discoveredTimetable = linkUrl.href
          }
        } catch {
          // Skip malformed menu hrefs.
        }
      }
    } catch {
      // Detached frame.
    }
  }
  jwState.scoresUrl = jwState.scoresUrl || discoveredScores
  jwState.timetableUrl = jwState.timetableUrl || discoveredTimetable
  try {
    const origin = new URL(jwState.base || url).origin
    jwState.timetableUrl = jwState.timetableUrl || `${origin}/gzasc_jsxsd/xskb/xskb_list.do`
    jwState.scoresUrl = jwState.scoresUrl || `${origin}/gzasc_jsxsd/cjcx/cjkb_cjb1.do`
  } catch {
    jwState.timetableUrl = jwState.timetableUrl || url
  }
  // Session cookies die with the window; copy them so the headless reader can log in.
  jwState.cookies = await context?.cookies().catch(() => []) ?? []
  jwState.ua = (await page.evaluate('navigator.userAgent').catch(() => '')) as string
  saveState()
  await closeContext()
  return { url, connected: true, cookies: jwState.cookies.length }
}

function targetUrl(kind: 'schedule' | 'scores') {
  if (kind === 'schedule') return jwState.timetableUrl || jwState.base
  return jwState.scoresUrl || jwState.base || jwState.timetableUrl
}

interface FrameSnapshot {
  url: string
  title: string
  tables: Array<{ id: string; rows: string[][] }>
  selects: Record<string, string>
  text: string
}

// Passed as a string so the Node-side tsconfig does not need the DOM lib.
const SNAPSHOT_SCRIPT = `(() => {
  const clean = (value) => (value || '').replace(/\\u00a0/g, ' ').replace(/\\r/g, '')
  const tables = Array.from(document.querySelectorAll('table')).slice(0, 20).map((table) => {
    // Expand rowspan/colspan so a merged cell never shifts the weekday columns.
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

/** 强智's 周次 is a server-side filter; pick an option and let the page re-query. */
function setWeekScript(target: string) {
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

async function snapshotFrames() {
  const page = currentPage()
  if (!page) throw new Error('教务窗口没有打开，先点「打开教务登录窗口」。')
  const snapshots: FrameSnapshot[] = []
  for (const frame of page.frames()) {
    try {
      const data = (await frame.evaluate(SNAPSHOT_SCRIPT)) as unknown as FrameSnapshot
      snapshots.push(data)
    } catch {
      // Cross-origin or detached frame: skip it, keep the rest.
    }
  }
  return { pageUrl: page.url(), frames: snapshots }
}

const DAY_CELL_RE = /^\s*(?:星期|礼拜)?\s*([一二三四五六日天])\s*$/
const DAY_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }
const WEEK_ANCHOR_RE = /[（(]周[)）]/
const PERIOD_BRACKET_RE = /\[(\d{1,2}(?:\s*-\s*\d{1,2})+)\s*节\]/
const DASH_LINE_RE = /^-{3,}$/
const TIME_RANGE_RE = /\d{1,2}[:：]\d{2}\s*[-~－—]\s*\d{1,2}[:：]\d{2}/g
const PLACE_RE = /(楼|室|馆|中心|校区|栋|机房|实验|@)/

export interface ParsedClass {
  course: string
  teacher: string
  room: string
  day: number
  startSection: number
  endSection: number
  weeks: string
  startTime: string
  endTime: string
  raw: string
}

function linesOf(cell: string) {
  return cell
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** Strip clock ranges first, or "20:35-21:20" becomes sections 20-9. */
function sectionsOf(label: string) {
  const clean = label.replace(TIME_RANGE_RE, ' ')
  const explicit = /第?\s*(\d{1,2})\s*[-–~至]\s*(\d{1,2})\s*节/.exec(clean)
  if (explicit) return { start: Number(explicit[1]), end: Number(explicit[2]) }
  const nums = [...clean.matchAll(/\d{1,2}/g)].map((match) => Number(match[0]))
  if (nums.length >= 2) return { start: nums[0], end: nums[1] }
  if (nums.length === 1) return { start: nums[0], end: nums[0] }
  return { start: 0, end: 0 }
}

function normalizePeriods(raw: string) {
  const nums = [...raw.matchAll(/\d{1,2}/g)].map((match) => Number(match[0]))
  if (nums.length === 0) return { start: 0, end: 0 }
  const ordered = [...new Set(nums)].sort((a, b) => a - b)
  return { start: ordered[0], end: ordered[ordered.length - 1] }
}

function bellOf(label: string) {
  const match = /(\d{1,2})[:：](\d{2})\s*[-~－—]\s*(\d{1,2})[:：](\d{2})/.exec(label)
  return match
    ? {
        start: `${match[1].padStart(2, '0')}:${match[2]}`,
        end: `${match[3].padStart(2, '0')}:${match[4]}`,
      }
    : { start: '', end: '' }
}

function weekdayHeader(rows: string[][]) {
  for (let index = 0; index < Math.min(rows.length, 4); index += 1) {
    const map = new Map<number, number>()
    rows[index].forEach((cell, column) => {
      const match = DAY_CELL_RE.exec((cell ?? '').trim())
      if (match && column > 0) map.set(column, DAY_NUM[match[1]])
    })
    if (map.size >= 5) return { map, headerRow: index }
  }
  return undefined
}

function parseCell(
  lines: string[],
  day: number,
  rowKey: { start: number; end: number },
  rowBell: { start: string; end: string },
  className: string,
): ParsedClass | undefined {
  if (lines.length === 0) return undefined
  const raw = lines.join(' / ')
  // Some 强智 tables put a footnote like "劳动教育 麦晓婷 1-5周;电子技术课程设计 曾霞 15周;"
  // inside a weekday cell. It has no period bracket or room, so reject it before it becomes a class.
  if ((raw.match(/周/g)?.length ?? 0) >= 2 && /[;；]/.test(raw) && !PLACE_RE.test(raw)) {
    return undefined
  }
  const anchor = lines.findIndex((line) => WEEK_ANCHOR_RE.test(line))
  const bracket = PERIOD_BRACKET_RE.exec(lines[anchor] ?? raw)
  const periods = bracket ? normalizePeriods(bracket[1]) : rowKey
  if (periods.start === 0) return undefined

  let name = ''
  let teacher = ''
  let room = ''
  let weeks = ''
  if (anchor >= 0) {
    name = lines.slice(0, Math.max(anchor - 1, 0)).join(' ').trim()
    teacher = anchor >= 2 ? lines[anchor - 1].trim() : ''
    weeks = lines[anchor]
      .replace(WEEK_ANCHOR_RE, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, '')
      .slice(0, 80)
    room = lines.slice(anchor + 1).find((line) => !WEEK_ANCHOR_RE.test(line)) ?? ''
    // A cell may be just 课名 + 周次 (+ 教室): nothing before the anchor, so take the first line.
    if (!name) name = lines.slice(0, anchor).join(' ').trim()
  } else {
    // Real-world 强智 cells often carry only 课程名 + @教室 (+ 周次 on its own line).
    const rest: string[] = []
    for (const line of lines) {
      if (PLACE_RE.test(line) && !room) room = line
      else if (WEEK_ANCHOR_RE.test(line) || /^\d+([-,]\d+)*\s*[（(]?周/.test(line)) weeks = line
      else rest.push(line)
    }
    name = rest.shift() ?? ''
    teacher = rest.find((line) => /^[\u4e00-\u9fa5·]{2,4}$/.test(line)) ?? ''
    if (!room) room = rest.find((line) => PLACE_RE.test(line)) ?? ''
  }
  name = name.replace(/^[（(]\d{2,4}[-\d]*[)）]/, '').trim()
  if (!name) return undefined
  return {
    course: name.slice(0, 60),
    teacher: teacher.replace(/^@/, '').slice(0, 40),
    room: room.replace(/^@/, '').slice(0, 60),
    day,
    startSection: periods.start,
    endSection: periods.end,
    weeks,
    startTime: rowBell.start,
    endTime: rowBell.end,
    raw,
  }
}

function parseTimetableFrame(frame: FrameSnapshot) {
  const entries: ParsedClass[] = []
  const notes: string[] = []
  for (const table of frame.tables) {
    const header = weekdayHeader(table.rows)
    if (!header) continue
    const body = table.rows.slice(header.headerRow + 1)
    body.forEach((row, rowIndex) => {
      const label = row[0] ?? ''
      const rowSections = sectionsOf(label)
      const fallback = rowSections.start > 0 ? rowSections : { start: rowIndex * 2 + 1, end: rowIndex * 2 + 2 }
      const rowBell = bellOf(label)
      for (const [column, day] of header.map) {
        const cell = row[column]
        if (!cell || !cell.trim()) continue
        const chunks: string[][] = []
        let current: string[] = []
        for (const line of linesOf(cell)) {
          if (DASH_LINE_RE.test(line)) {
            if (current.length > 0) chunks.push(current)
            current = []
          } else current.push(line)
        }
        if (current.length > 0) chunks.push(current)
        for (const chunk of chunks) {
          const entry = parseCell(chunk, day, fallback, rowBell, table.id)
          if (entry) entries.push(entry)
          else if (chunk.length > 0) notes.push(chunk.join(' / ').slice(0, 60))
        }
      }
    })
    if (entries.length > 0) break
  }
  // Same course repeats across consecutive big sections; keep the earliest row.
  const seen = new Map<string, ParsedClass>()
  for (const entry of entries) {
    const key = `${entry.course}|${entry.day}|${entry.weeks}`
    const previous = seen.get(key)
    if (!previous || entry.startSection < previous.startSection) seen.set(key, entry)
  }
  return { entries: [...seen.values()], notes: notes.slice(0, 6), selects: frame.selects, sourceUrl: frame.url }
}

export interface ParsedScore {
  course: string
  score: string
  credit: number | null
  semester: string
  kind: string
}

function scoreKey(row: ParsedScore) {
  return `${row.course}|${row.semester}|${row.score}|${row.credit ?? ''}`
}

/** 全部学期 may render one table per semester: collect every score table, not just the first. */
function parseScoreFrame(frame: FrameSnapshot) {
  const rows: ParsedScore[] = []
  let header: string[] = []
  for (const table of frame.tables) {
    const head = (table.rows[0] ?? []).map((cell) => cell.replace(/\s+/g, ' ').trim())
    const sampleRows = table.rows.slice(1, 9)

    // 课程编号 / 课程名称 常常挨着出现；不要因为“课程”二字先命中编号列。
    const nameCandidates = head
      .map((title, index) => ({ title, index }))
      .filter(({ title }) => /课程|课名|名称/.test(title))
      .filter(({ title }) => !/编号|代码|课程号|性质|类别|属性|学分/.test(title))
    let courseColumn = nameCandidates.find(({ title }) => /名称|课名/.test(title))?.index ?? -1
    if (courseColumn < 0) {
      // Header is ambiguous (or split across rows): trust the data — course names contain CJK.
      const pool = nameCandidates.length > 0
        ? nameCandidates
        : head.map((title, index) => ({ title, index })).filter(({ title }) => /课程/.test(title))
      let best = { index: -1, ratio: -1 }
      for (const candidate of pool) {
        const values = sampleRows
          .map((row) => (row[candidate.index] ?? '').trim())
          .filter(Boolean)
        if (values.length === 0) continue
        const ratio = values.filter((value) => /[\u4e00-\u9fa5]/.test(value)).length / values.length
        if (ratio > best.ratio) best = { index: candidate.index, ratio }
      }
      courseColumn = best.index
    }

    // 成绩 / 总评 / 分数，但排除“成绩标识”“成绩说明”这类不是分数的列。
    let scoreColumn = head.findIndex((title) => /^(成绩|总评|分数)$/.test(title))
    if (scoreColumn < 0) {
      scoreColumn = head.findIndex(
        (title) => /成绩|总评|分数/.test(title) && !/标识|说明|性质|备注|学分/.test(title),
      )
    }
    if (courseColumn < 0 || scoreColumn < 0 || courseColumn === scoreColumn) continue
    if (header.length === 0) header = head
    const creditColumn = head.findIndex((title) => /^学分$/.test(title))
    const semesterColumn =
      head.findIndex((title) => /学年学期|学期|学年/.test(title))
    const kindColumn =
      head.findIndex((title) => /考试性质|考核方式|考核|课程性质/.test(title))
    for (const row of table.rows.slice(1)) {
      const cells = row.map((cell) => cell.replace(/\s+/g, ' ').trim())
      const course = cells[courseColumn] ?? ''
      const score = cells[scoreColumn] ?? ''
      if (!course || !score) continue
      const credit = creditColumn >= 0 && cells[creditColumn] ? Number(cells[creditColumn]) : Number.NaN
      rows.push({
        course: course.slice(0, 60),
        score: score.slice(0, 20),
        credit: Number.isFinite(credit) && credit > 0 ? credit : null,
        semester: semesterColumn >= 0 ? cells[semesterColumn] ?? '' : '',
        kind: kindColumn >= 0 ? cells[kindColumn] ?? '' : '',
      })
    }
  }
  const seen = new Set<string>()
  const unique = rows.filter((row) => {
    const key = scoreKey(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { rows: unique, header, sourceUrl: frame.url }
}

function mergeScoreRows(target: ParsedScore[], rows: ParsedScore[]) {
  const seen = new Set(target.map(scoreKey))
  for (const row of rows) {
    const key = scoreKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    target.push(row)
  }
  return target
}

interface ScoresQueryResult {
  select: boolean
  all: boolean
  optionText: string
  clicked: boolean
  via: string
  options: Array<{ value: string; text: string }>
}

async function runScoresQuery(target: string) {
  const page = currentPage()
  if (!page) return undefined
  for (const frame of page.frames()) {
    try {
      const result = (await frame.evaluate(scoresQueryScript(target))) as ScoresQueryResult | undefined
      if (result?.select) return result
    } catch {
      // Frame without the 成绩查询 form.
    }
  }
  return undefined
}

/** Click the portal's 「成绩查询」 menu when we landed on the shell instead of the report. */
const SCORE_MENU_SCRIPT = `(() => {
  const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim()
  const candidates = [...document.querySelectorAll('a,button,li,span')]
    .filter((el) => {
      const text = clean(el.textContent)
      return text.length <= 30 && /成绩查询|学生成绩|考试成绩|成绩/.test(text)
    })
  const target = candidates.find((el) => el.tagName === 'A' || el.tagName === 'BUTTON') || candidates[0]
  if (!target) return { clicked: false }
  const anchor = target.closest('a')
  if (anchor && anchor.href && !/^javascript:/i.test(anchor.href)) {
    location.href = anchor.href
    return { clicked: true, href: anchor.href }
  }
  target.click()
  return { clicked: true }
})()`

async function openScoresMenu() {
  const page = currentPage()
  if (!page) return false
  for (const frame of page.frames()) {
    try {
      const result = (await frame.evaluate(SCORE_MENU_SCRIPT)) as { clicked?: boolean } | undefined
      if (result?.clicked) {
        await page.waitForTimeout(1500)
        const pages = context?.pages().filter((item) => !item.isClosed()) ?? []
        if (pages.length > 0) activePage = pages[pages.length - 1]
        return true
      }
    } catch {
      // Frame without a score menu.
    }
  }
  return false
}

async function snapshotScores() {
  const snapshot = await snapshotFrames()
  const rows: ParsedScore[] = []
  let header: string[] = []
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

/**
 * 强智 needs the semester picked + 查询 pressed; a bare page.goto often lands on an empty grid.
 * Prefer 全部学期. If that option is missing, walk every semester and merge the results.
 */
async function readScoresWithQuery(page: Page) {
  const first = await runScoresQuery('__all__')
  await page.waitForTimeout(1100)
  let result = await snapshotScores()
  const autoQuery = {
    allSemester: Boolean(first?.all),
    clicked: Boolean(first?.clicked),
    semesters: 0,
    optionText: first?.optionText ?? '',
  }
  if (result.rows.length > 0) return { ...result, autoQuery }

  // A second press is harmless, and fixes pages that queried before the select settled.
  if (first?.select) {
    await runScoresQuery('__all__')
    await page.waitForTimeout(1300)
    result = await snapshotScores()
    if (result.rows.length > 0) return { ...result, autoQuery }
  }

  const values = (first?.options ?? []).filter((option) => option.value !== '').slice(0, 12)
  if (first?.select && !first.all && values.length > 1) {
    autoQuery.semesters = values.length
    for (const option of values) {
      await runScoresQuery(option.value)
      await page.waitForTimeout(1000)
      const snap = await snapshotScores()
      mergeScoreRows(result.rows, snap.rows)
      result = { ...snap, rows: result.rows }
    }
  }
  return { ...result, autoQuery }
}

async function applyWeek(target: string) {
  const page = currentPage()
  if (!page) return undefined
  for (const frame of page.frames()) {
    try {
      const result = (await frame.evaluate(setWeekScript(target))) as
        | {
            found: boolean
            changed?: boolean
            options?: Array<{ value: string; text: string }>
            value?: string
            before?: string
          }
        | undefined
      if (result?.found) {
        if (result.changed) await page.waitForTimeout(1500)
        return result
      }
    } catch {
      // Frame without the 周次 select.
    }
  }
  return undefined
}

function readCandidates(kind: 'schedule' | 'scores') {
  const list: string[] = []
  const primary = targetUrl(kind)
  if (primary) list.push(primary)
  try {
    const origin = new URL(
      jwState.base || primary || jwState.timetableUrl || jwState.scoresUrl,
    ).origin
    const known =
      kind === 'schedule'
        ? ['/gzasc_jsxsd/xskb/xskb_list.do']
        : [
            '/gzasc_jsxsd/cjcx/cjkb_cjb1.do',
            '/gzasc_jsxsd/kscj/cjcx_list.do',
            '/gzasc_jsxsd/cjcx/cjcx_list.do',
          ]
    for (const path of known) list.push(`${origin}${path}`)
    // The portal shell carries the 「成绩查询」 / 「学期课表」 menus we can click.
    list.push(`${origin}/gzasc_jsxsd/framework/xsMain.jsp`)
  } catch {
    // No usable origin.
  }
  if (jwState.base) list.push(jwState.base)
  return [...new Set(list.filter(Boolean))].slice(0, 5)
}

async function readPage(kind: 'schedule' | 'scores', zc?: string, visible = false) {
  if (!visible) return readPageInner(kind, zc, true)
  await closeContext()
  try {
    return await readPageInner(kind, zc, false)
  } finally {
    await closeContext()
  }
}

async function readPageInner(kind: 'schedule' | 'scores', zc?: string, headless = true) {
  const targets = readCandidates(kind)
  if (targets.length === 0) throw new Error('还没有绑定教务账号，先点「登录教务」一次。')
  const browserContext = await ensureContext(headless)
  if (jwState.cookies && jwState.cookies.length > 0) {
    await browserContext.addCookies(jwState.cookies).catch(() => undefined)
  }
  const page = currentPage() ?? (await browserContext.newPage())
  activePage = page
  if (!headless) await page.bringToFront().catch(() => undefined)
  let sawLogin = false
  let sawExpired = false
  let sawRealPage = false
  let lastDiagnostics: Array<{ url: string; title: string; tables: number }> = []
  let lastUrl = ''
  let tableSample = ''
  const tried: string[] = []

  for (const target of targets) {
    tried.push(target)
    await page.goto(target, { waitUntil: 'domcontentloaded' }).catch(() => undefined)
    // Give the grid time to render (强智 is JS/iframe heavy).
    await page.waitForSelector('table', { timeout: 4000 }).catch(() => undefined)
    await page.waitForTimeout(900)
    if (await isLoginPage(page)) {
      sawLogin = true
      continue
    }
    sawRealPage = true
    const applied = zc ? await applyWeek(zc) : undefined
    const snapshot = await snapshotFrames()
    // 强智 drops you on 「错误提示页面」 instead of the login form when the session dies.
    const expiredPage = snapshot.frames.some(
      (frame) =>
        /错误提示/.test(frame.title) ||
        /请重新登录|登录超时|会话已过期|尚未登录|Session.*(?:timeout|expired)/i.test(frame.text),
    )
    if (expiredPage) {
      sawExpired = true
      continue
    }
    lastUrl = snapshot.pageUrl
    lastDiagnostics = snapshot.frames.map((frame) => ({
      url: frame.url,
      title: frame.title,
      tables: frame.tables.length,
    }))
    if (!tableSample) {
      const largest = snapshot.frames
        .flatMap((frame) => frame.tables)
        .sort((a, b) => b.rows.length - a.rows.length)[0]
      if (largest) {
        tableSample = largest.rows
          .slice(0, 5)
          .map((row) => row.slice(0, 6).map((cell) => cell.replace(/\s+/g, ' ').slice(0, 18)).join(' | '))
          .join('\n')
          .slice(0, 600)
      }
    }
    const weekOptions = applied?.options ?? []
    const selectedWeek = applied?.value ?? ''
    const currentWeekValue = applied?.before ?? applied?.value ?? ''
    if (kind === 'schedule') {
      for (const frame of snapshot.frames) {
        const parsed = parseTimetableFrame(frame)
        if (parsed.entries.length > 0) {
          await syncCookies(browserContext)
          return {
            entries: parsed.entries.map((entry, index) => ({ ...entry, id: `cls-${Date.now()}-${index}` })),
            sourceUrl: parsed.sourceUrl,
            selects: parsed.selects,
            unparsed: parsed.notes,
            diagnostics: lastDiagnostics,
            weekOptions,
            selectedWeek,
            currentWeekValue,
            weeksAvailable: parsed.entries.some((entry) => Boolean(entry.weeks)),
            tried,
          }
        }
      }
    } else {
      const hasScoreTable = snapshot.frames.some((frame) => parseScoreFrame(frame).rows.length > 0)
      if (!hasScoreTable) {
        // On the portal shell: open 「成绩查询」 first, then pick the semester and press 查询.
        await openScoresMenu()
      }
      const scores = await readScoresWithQuery(currentPage() ?? page)
      if (scores.sourceUrl) lastUrl = scores.sourceUrl
      if (scores.diagnostics.length > 0) lastDiagnostics = scores.diagnostics
      if (scores.rows.length > 0) {
        await syncCookies(browserContext)
        return {
          rows: scores.rows.map((row, index) => ({ ...row, id: `score-${Date.now()}-${index}` })),
          header: scores.header,
          sourceUrl: scores.sourceUrl,
          diagnostics: lastDiagnostics,
          tried,
          autoQuery: scores.autoQuery,
        }
      }
      continue
    }
  }

  // Only call it an expired login when every candidate was a login page. One login-page
  // candidate (e.g. the portal root) must not hide a timetable that did load.
  if (sawExpired && lastDiagnostics.length === 0) {
    await closeContext()
    throw new Error('教务登录已过期（教务返回「错误提示页面」）。请点「重新登录」再登一次，之后读取仍然不弹窗。')
  }
  if (sawLogin && !sawRealPage) {
    await closeContext()
    throw new Error('教务登录已过期。请点「重新登录」再登一次（只要一次，之后读取仍然不弹窗）。')
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

async function logout() {
  await closeContext()
  jwState = { base: '', timetableUrl: '', scoresUrl: '', ua: '', cookies: [] }
  await rm(STATE_FILE, { force: true }).catch(() => undefined)
  // Edge may still be releasing files on Windows; retry briefly so cookies really go away.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await rm(PROFILE_DIR, { recursive: true, force: true }).catch(() => undefined)
    if (!existsSync(PROFILE_DIR)) break
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
}

export function jwProxyPlugin(): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    if (!req.url?.startsWith(ROUTE)) {
      next()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: '只支持 POST 请求。' })
      return
    }
    let payload: Record<string, unknown> = {}
    try {
      const raw = await readBody(req)
      payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    } catch {
      sendJson(res, 413, { error: '请求体过大或不是合法 JSON。' })
      return
    }
    const route = req.url.slice(ROUTE.length).split('?')[0]

    try {
      if (route === 'login') {
        const baseUrl = typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : ''
        if (!/^https?:\/\//i.test(baseUrl)) {
          sendJson(res, 400, { error: '教务地址需要以 http(s) 开头。' })
          return
        }
        sendJson(res, 200, await openLogin(baseUrl))
        return
      }
      if (route === 'finish') {
        sendJson(res, 200, await finishLogin())
        return
      }
      if (route === 'status') {
        sendJson(res, 200, {
          connected:
            Boolean(jwState.base) &&
            existsSync(PROFILE_DIR) &&
            (jwState.cookies?.length ?? 0) > 0,
          loginOpen: loginWindowOpen,
          base: jwState.base,
          timetableUrl: jwState.timetableUrl,
          scoresUrl: jwState.scoresUrl,
        })
        return
      }
      if (route === 'read') {
        const kind = payload.kind === 'scores' ? 'scores' : 'schedule'
        const zc = typeof payload.zc === 'string' && payload.zc ? payload.zc : undefined
        const visible = Boolean(payload.visible)
        sendJson(res, 200, await readPage(kind, zc, visible))
        return
      }
      if (route === 'logout') {
        await logout()
        sendJson(res, 200, { ok: true })
        return
      }
      sendJson(res, 404, { error: '没有这个教务接口。' })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      sendJson(res, 502, {
        error: message || '读取教务页面失败，请确认已经登录，或重新登录一次。',
      })
    }
  }

  return {
    name: 'shishuo-jw-proxy',
    configureServer(server) {
      server.middlewares.use(handler)
      server.httpServer?.on('close', () => {
        // Keep the profile (login state) for the next headless read.
        void closeContext()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
