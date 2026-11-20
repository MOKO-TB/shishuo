import { chromium } from 'playwright-core'
import { HttpError } from './http-error.mjs'
import { resolveBrowserPath } from './jw.mjs'

const BASE = 'https://mfindgzyykj.libsp.cn'
const GROUP = '200542'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
const BASE_HEADERS = {
  'Content-Type': 'application/json;charset=utf-8',
  Accept: 'application/json, text/plain, */*',
  groupCode: GROUP,
  mappingPath: '',
  Origin: BASE,
  Referer: `${BASE}/`,
  'User-Agent': UA,
}

function searchBody(query, rows = 12) {
  return {
    docCode: [null],
    litCode: [],
    searchFieldContent: query,
    searchField: 'keyWord',
    matchMode: '2',
    resourceType: [],
    subject: [],
    discode1: [],
    publisher: [],
    locationId: [],
    collectionName: [],
    author: [],
    langCode: [],
    countryCode: [],
    publishBegin: null,
    publishEnd: null,
    coreInclude: [],
    ddType: [],
    verifyStatus: [],
    group: [],
    sortField: 'relevance',
    sortClause: 'desc',
    page: 1,
    rows,
    onlyOnShelf: null,
    campusId: [],
    curLocationId: [],
    eCollectionIds: [],
    kindNo: [],
    libCode: [],
    neweCollectionIds: [],
    searchItems: null,
    newCoreInclude: [],
    customSub: [],
    customSub0: [],
    indexSearch: 1,
  }
}

export function createLibraryService() {
  let browserPromise = null
  let routeCookie = ''
  let routeCookieAt = 0
  const pending = new Map()
  const sessions = new Map()
  const searchCache = new Map()

  async function getBrowser() {
    if (!browserPromise) {
      const executablePath = resolveBrowserPath()
      browserPromise = chromium.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=zh-CN'],
      })
      browserPromise
        .then((browser) => {
          browser.on('disconnected', () => {
            browserPromise = null
          })
        })
        .catch(() => {
          browserPromise = null
        })
    }
    return browserPromise
  }

  async function getRouteCookie(force = false) {
    if (!force && routeCookie && Date.now() - routeCookieAt < 20 * 60_000) return routeCookie
    const res = await fetch(`${BASE}/find/webSite/getWebSiteList`, {
      method: 'POST',
      headers: BASE_HEADERS,
      body: '{}',
    })
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
    const route = cookies.map((item) => item.split(';')[0]).find((item) => item.startsWith('route='))
    routeCookie = route || ''
    routeCookieAt = Date.now()
    return routeCookie
  }

  async function postOpac(path, body, { cookie = '', retry = true } = {}) {
    const headers = { ...BASE_HEADERS }
    if (cookie) headers.Cookie = cookie
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (json?.errCode === 9999 && retry) {
      const fresh = await getRouteCookie(true)
      return postOpac(path, body, { cookie: fresh, retry: false })
    }
    if (!json || json.success === false) {
      throw new HttpError(502, json?.message || '图书馆接口暂时不可用。')
    }
    return json.data
  }

  async function search(rawQuery) {
    const query = String(rawQuery || '').trim().slice(0, 80)
    if (!query) return { query: '', items: [] }
    const cached = searchCache.get(query)
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value
    const cookie = await getRouteCookie()
    const data = await postOpac('/find/unify/search', searchBody(query), { cookie })
    const results = (data?.searchResult || []).slice(0, 6)
    const items = []
    for (const record of results) {
      let physical = []
      try {
        const list = await postOpac(
          '/find/physical/groupitems',
          { recordId: record.recordId, docType: 1 },
          { cookie },
        )
        physical = Array.isArray(list) ? list : []
      } catch {
        physical = []
      }
      const locations = []
      for (const item of physical) {
        const location = String(item.realLocationName || item.locationName || '').trim()
        if (location && !locations.includes(location)) locations.push(location)
      }
      const borrowed = physical.filter((item) => String(item.processTypeCode || '') === '412').length
      const total = physical.length || Number(record.physicalCount || 0)
      items.push({
        recordId: record.recordId,
        title: String(record.title || '').trim(),
        author: String(record.author || '').trim(),
        publisher: String(record.publisher || '').trim(),
        year: String(record.publishYear || '').trim(),
        isbn: String(record.isbn || '').trim(),
        callNo: String(physical[0]?.callNo || '').trim(),
        locations,
        total,
        available: Math.max(0, total - borrowed),
        statuses: [...new Set(physical.map((item) => String(item.processType || '').trim()).filter(Boolean))].slice(0, 3),
      })
    }
    const value = { query, items }
    searchCache.set(query, { at: Date.now(), value })
    return value
  }

  async function startLogin(userId, account, password) {
    const loginId = `lib-${userId}-${Date.now().toString(36)}`
    const browser = await getBrowser()
    const context = await browser.newContext({ locale: 'zh-CN' })
    const page = await context.newPage()
    try {
      await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(900)
      const captcha = await page.evaluate(async ({ group }) => {
        const res = await fetch(`/oga/verifycode/img?t=${Date.now()}`, {
          credentials: 'include',
          headers: { groupCode: group, mappingPath: '' },
        })
        return res.json()
      }, { group: GROUP })
      if (!captcha?.success || !captcha.data?.verifyCode) {
        throw new HttpError(502, '图书馆验证码加载失败。')
      }
      pending.set(loginId, {
        context,
        page,
        userId,
        account: String(account || '').trim(),
        password: String(password || ''),
        createdAt: Date.now(),
      })
      return { loginId, image: String(captcha.data.verifyCode).replace(/\s+/g, '') }
    } catch (error) {
      await context.close().catch(() => undefined)
      throw error instanceof HttpError ? error : new HttpError(502, '图书馆登录页加载失败。')
    }
  }

  async function completeLogin(userId, loginId, captchaCode) {
    const item = pending.get(String(loginId || ''))
    if (!item || item.userId !== userId) throw new HttpError(400, '图书馆登录已过期，请重新获取验证码。')
    if (Date.now() - item.createdAt > 3 * 60_000) {
      pending.delete(loginId)
      await item.context.close().catch(() => undefined)
      throw new HttpError(400, '图书馆登录已过期，请重新获取验证码。')
    }
    if (!item.account || !item.password) throw new HttpError(400, '请填写图书馆账号和密码。')
    const { page, context } = item
    try {
      await page.getByRole('textbox', { name: '请输入账户' }).fill(item.account)
      await page.getByRole('textbox', { name: '请输入密码' }).fill(item.password)
      await page.getByRole('textbox', { name: '请输入验证码' }).fill(String(captchaCode || '').trim())
      await page.evaluate(() => {
        const checkbox = document.querySelector('input[type=checkbox]')
        if (checkbox && !checkbox.checked) checkbox.click()
      })
      await page.waitForTimeout(350)
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('div,button,span')].filter(
          (element) => element.textContent.trim() === '登录',
        )
        buttons[buttons.length - 1]?.click()
      })
      await page.waitForTimeout(2600)
      const failed = await page
        .getByText('请输入正确验证码', { exact: false })
        .count()
        .catch(() => 0)
      if (failed > 0 || page.url().includes('/login')) {
        throw new HttpError(400, '验证码或账号密码不正确，请重试。')
      }
      pending.delete(loginId)
      sessions.set(userId, { context, page, at: Date.now() })
      return { ok: true }
    } catch (error) {
      pending.delete(loginId)
      await context.close().catch(() => undefined)
      throw error instanceof HttpError ? error : new HttpError(502, '图书馆登录失败。')
    }
  }

  async function loans(userId) {
    const session = sessions.get(userId)
    if (!session) throw new HttpError(401, '请先登录图书馆账号。')
    if (Date.now() - session.at > 30 * 60_000) {
      sessions.delete(userId)
      await session.context.close().catch(() => undefined)
      throw new HttpError(401, '图书馆登录已过期，请重新登录。')
    }
    const result = await session.page.evaluate(async ({ group }) => {
      const jwToken = sessionStorage.getItem('jwt') || ''
      const jwtHeader = sessionStorage.getItem('jwtHeader') || ''
      const headers = {
        'Content-Type': 'application/json;charset=utf-8',
        groupCode: group,
        mappingPath: '',
      }
      if (jwToken && jwtHeader) headers[jwtHeader] = jwToken
      const call = async (path) => {
        const res = await fetch(path, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ page: 1, rows: 50 }),
        })
        const json = await res.json().catch(() => null)
        return json?.success ? json.data : null
      }
      const current = await call('/find/loanInfo/loanList')
      const history = await call('/find/loanInfo/loanHistoryList')
      if (current || history) return { current, history, raw: '' }
      return { current: null, history: null, raw: document.body.innerText.slice(0, 5000) }
    }, { group: GROUP })
    const current = result.current || {}
    const history = result.history || {}
    const currentList = Array.isArray(current.searchResult)
      ? current.searchResult
      : Array.isArray(current.list)
        ? current.list
        : []
    const historyList = Array.isArray(history.searchResult)
      ? history.searchResult
      : Array.isArray(history.list)
        ? history.list
        : []
    const mapRow = (row, kind) => ({
      title: String(row.title ?? row.bookName ?? row.name ?? '').trim(),
      author: String(row.author ?? '').trim(),
      due: String(row.dueDate ?? row.endDate ?? row.returnDate ?? '').trim(),
      status:
        String(row.status ?? row.processType ?? '').trim() ||
        (kind === 'history' ? '已归还' : ''),
      location: String(row.locationName ?? row.realLocationName ?? '').trim(),
      kind,
    })
    const items = [
      ...currentList.map((row) => mapRow(row, 'current')),
      ...historyList.map((row) => mapRow(row, 'history')),
    ].filter((row) => row.title)
    return {
      total: Number(current.numFound ?? currentList.length) || currentList.length,
      historyTotal: Number(history.numFound ?? historyList.length) || historyList.length,
      items,
      raw: result.raw || '',
    }
  }

  async function logout(userId) {
    const session = sessions.get(userId)
    sessions.delete(userId)
    if (session) await session.context.close().catch(() => undefined)
  }

  return { search, startLogin, completeLogin, loans, logout }
}
