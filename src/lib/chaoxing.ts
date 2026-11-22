import { apiGet, apiPost } from './api'
import { openChaoxingAppNative } from './chaoxingApp'
import { isNativeApp, openExternalUrl } from './nativeShell'

export type ChaoxingKind = 'assignment' | 'material' | 'message'

export interface ChaoxingCourse {
  id: string
  course_id: string
  class_id: string
  cpi: string
  name: string
  teacher: string
  url: string
  selected: number
  updated_at: number
}

export interface ChaoxingItem {
  id: string
  kind: ChaoxingKind
  title: string
  body: string
  url: string
  due_at: number | null
  published_at: number | null
  read_at: number | null
  created_at: number
  course_id: string
  class_id: string
  course_name: string
}

export interface ChaoxingChapter {
  id: string
  chapterNo: string
  chapterTitle: string
  sectionNo: string
  sectionTitle: string
  taskCount: number
  done: boolean
  url: string
}

export interface ChaoxingCourseChapters {
  course_id: string
  course_name: string
  total: number
  unfinished: number
  items: ChaoxingChapter[]
}

export interface ChaoxingOverview {
  connected: boolean
  lastSyncAt: number | null
  lastError: string
  courses: ChaoxingCourse[]
  counts: Record<ChaoxingKind, number>
  unread: number
  chapterUnfinished: number
  chapterTotal: number
  chapters: ChaoxingCourseChapters[]
  items: ChaoxingItem[]
}

export interface ChaoxingLoginStart {
  loginId: string
  qr: string
  expiresAt: number
}

export interface ChaoxingStatus {
  connected: boolean
  loginOpen: boolean
  lastSyncAt: number | null
  lastError: string
  courseCount: number
}

export function startChaoxingLogin() {
  return apiPost<ChaoxingLoginStart>('/api/chaoxing/login/start', {})
}

export function pollChaoxingLogin(loginId: string) {
  return apiPost<{ status: 'waiting' | 'scanned' | 'connected' | 'expired' | 'refreshed'; courses?: number; nickname?: string; qr?: string }>(
    '/api/chaoxing/login/poll',
    { loginId },
  )
}

export function chaoxingStatus() {
  return apiPost<ChaoxingStatus>('/api/chaoxing/status', {})
}

export function chaoxingOverview() {
  return apiGet<ChaoxingOverview>('/api/chaoxing/overview')
}

export function syncChaoxing() {
  return apiPost<{
    courses: number
    assignments: number
    materials: number
    messages: number
    chapters?: number
    errors: Array<{ course: string; kind: string; message: string }>
  }>('/api/chaoxing/sync', {})
}

export function autoSyncChaoxing() {
  return apiPost<{
    started: boolean
    mode?: 'quick'
    reason?: 'not-connected' | 'running' | 'fresh'
    lastSyncAt?: number | null
  }>('/api/chaoxing/sync/auto', {})
}

export function logoutChaoxing() {
  return apiPost<{ ok: boolean }>('/api/chaoxing/logout', {})
}

export function markChaoxingRead(id: string) {
  return apiPost<ChaoxingOverview>(`/api/chaoxing/items/${encodeURIComponent(id)}/read`, {})
}

export function selectChaoxingCourse(id: string, selected: boolean) {
  return apiPost<ChaoxingOverview>(`/api/chaoxing/courses/${encodeURIComponent(id)}/select`, {
    selected,
  })
}

export function loginChaoxingPassword(account: string, password: string) {
  return apiPost<{ connected: boolean; courses: number }>('/api/chaoxing/login/password', {
    account,
    password,
  })
}

/**
 * 学习通的资源/作业详情没有对应的移动版路径，强换 m.chaoxing.com 会 404；
 * 这里保持教务同步下来的原始 PC 链接，优先交给学习通 App，失败再走浏览器。
 */
export function chaoxingExternalUrl(url: string) {
  return url
}

function notifyChaoxingFallback() {
  window.dispatchEvent(
    new CustomEvent('shishuo:sync-notice', {
      detail: { message: '未检测到学习通 App，已用浏览器打开' },
    }),
  )
}

/** 打开一条学习通内容：App 优先，未安装/未处理则浏览器兜底。 */
export async function openChaoxingUrl(url: string) {
  const target = chaoxingExternalUrl(url)
  if (await openChaoxingAppNative(target)) return
  if (isNativeApp()) {
    notifyChaoxingFallback()
    await openExternalUrl(target)
    return
  }
  window.open(target, '_blank', 'noopener,noreferrer')
}

/** 打开学习通 App 首页；未安装则浏览器兜底。 */
export async function openChaoxingAppHome() {
  if (await openChaoxingAppNative('')) return
  if (isNativeApp()) {
    notifyChaoxingFallback()
    await openExternalUrl('https://i.chaoxing.com/')
    return
  }
  window.open('https://i.chaoxing.com/', '_blank', 'noopener,noreferrer')
}

