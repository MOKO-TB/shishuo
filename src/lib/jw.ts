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
  loginId?: string
  captcha?: string
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

export interface JwLoginStart {
  loginId: string
  captcha: string
  base: string
}

export interface JwLoginCredentials {
  loginId: string
  account: string
  password: string
  captcha: string
}

async function callJw(route: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(`/api/jw/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    throw new Error('无法连接教务服务，请确认师说服务端正在运行。')
  })
  if (!response.headers.get('x-shishuo-jw-proxy')) {
    throw new Error('教务服务未启用，请确认服务器已部署最新版本并重启师说。')
  }
  const data = (await response.json().catch(() => ({}))) as JwReply
  if (!response.ok) throw new Error(data.error ?? '教务读取失败。')
  return data
}

export async function startJwLogin(baseUrl: string): Promise<JwLoginStart> {
  const data = await callJw('login/start', { baseUrl })
  return {
    loginId: data.loginId ?? '',
    captcha: data.captcha ?? '',
    base: data.base ?? '',
  }
}

export async function finishJwLogin(input: JwLoginCredentials) {
  const data = await callJw('login/finish', { ...input })
  return {
    connected: Boolean(data.connected),
    base: data.base ?? '',
    timetableUrl: data.timetableUrl ?? '',
    scoresUrl: data.scoresUrl ?? '',
  }
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
  '首次使用请输入教务账号、密码和验证码：验证码由教务系统生成，师说服务器代为登录并只保存登录态，不保存账号密码。登录成功后，读取课表/成绩都在后台完成。当前为演示环境，建议使用演示账号，不要在公共网络使用真实密码。'
