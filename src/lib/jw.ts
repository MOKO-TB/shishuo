import type { ScheduleEntry, ScoreRow } from './profile'

export const DEFAULT_JW_BASE = 'https://jw.educationgroup.cn/gzasc/'

export interface JwDiagnostic {
  url: string
  title: string
  tables: number
}

export interface JwAutoQuery {
  allSemester: boolean
  clicked: boolean
  semesters: number
  optionText: string
}

interface JwReply {
  error?: string
  connected?: boolean
  loginOpen?: boolean
  base?: string
  timetableUrl?: string
  scoresUrl?: string
  url?: string
  entries?: ScheduleEntry[]
  rows?: ScoreRow[]
  sourceUrl?: string
  selects?: Record<string, string>
  unparsed?: string[]
  diagnostics?: JwDiagnostic[]
  header?: string[]
  autoQuery?: JwAutoQuery
  weekOptions?: Array<{ value: string; text: string }>
  selectedWeek?: string
  currentWeekValue?: string
  weeksAvailable?: boolean
  tried?: string[]
  tableSample?: string
}

async function callJw(route: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(`/api/jw/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    throw new Error('无法连接本机教务代理。请通过 npm run dev 或 npm run preview 启动师说。')
  })
  if (!response.headers.get('x-shishuo-jw-proxy')) {
    throw new Error('本机教务代理未启用。请通过 npm run dev 或 npm run preview 启动师说，不要直接打开静态文件。')
  }
  const data = (await response.json().catch(() => ({}))) as JwReply
  if (!response.ok) throw new Error(data.error ?? '教务读取失败。')
  return data
}

export async function startJwLogin(baseUrl: string) {
  const data = await callJw('login', { baseUrl })
  return { url: data.url ?? '' }
}

export async function finishJwLogin() {
  const data = await callJw('finish')
  return { url: data.url ?? '', connected: Boolean(data.connected) }
}

export async function jwStatus() {
  const data = await callJw('status')
  return {
    connected: Boolean(data.connected),
    loginOpen: Boolean(data.loginOpen),
    base: data.base ?? '',
    timetableUrl: data.timetableUrl ?? '',
    scoresUrl: data.scoresUrl ?? '',
  }
}

export async function logoutJw() {
  await callJw('logout').catch(() => undefined)
}

export async function readJwTimetable(zc?: string, visible = false) {
  const data = await callJw('read', { kind: 'schedule', zc: zc ?? '', visible })
  return {
    entries: data.entries ?? [],
    sourceUrl: data.sourceUrl ?? '',
    selects: data.selects ?? {},
    unparsed: data.unparsed ?? [],
    diagnostics: data.diagnostics ?? [],
    weekOptions: data.weekOptions ?? [],
    selectedWeek: data.selectedWeek ?? '',
    currentWeekValue: data.currentWeekValue ?? '',
    weeksAvailable: Boolean(data.weeksAvailable),
    tried: data.tried ?? [],
    tableSample: data.tableSample ?? '',
  }
}

export async function readJwScores(visible = false) {
  const data = await callJw('read', { kind: 'scores', visible })
  return {
    rows: data.rows ?? [],
    header: data.header ?? [],
    sourceUrl: data.sourceUrl ?? '',
    diagnostics: data.diagnostics ?? [],
    tried: data.tried ?? [],
    tableSample: data.tableSample ?? '',
    autoQuery: data.autoQuery,
  }
}

export const JW_BROWSER_HELP =
  '首次使用点「登录教务」会弹出一次浏览器窗口：请在里面自己登录，并打开「学期课表」或「成绩查询」页。之后点「完成登录」，师说会记住登录状态，以后读取课表/成绩都在后台完成，不再弹窗。账号密码和验证码不经过师说。'
