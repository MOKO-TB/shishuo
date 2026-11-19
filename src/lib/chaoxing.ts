import { apiGet, apiPost } from './api'

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
