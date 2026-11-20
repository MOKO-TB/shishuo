import { apiPost, apiRequest } from './api'

export interface LibraryBook {
  recordId: number
  title: string
  author: string
  publisher: string
  year: string
  isbn: string
  callNo: string
  locations: string[]
  total: number
  available: number
  statuses: string[]
}

export interface LibraryLoan {
  title: string
  author: string
  due: string
  status: string
  location: string
  kind?: 'current' | 'history'
}

export interface LibrarySearchResult {
  query: string
  items: LibraryBook[]
}

export interface LibraryLoansResult {
  total: number
  historyTotal?: number
  items: LibraryLoan[]
  raw?: string
}

export function librarySearch(query: string) {
  return apiPost<LibrarySearchResult>('/api/library/search', { query })
}

export function libraryLoginStart(account: string, password: string) {
  return apiPost<{ loginId: string; image: string }>('/api/library/login/start', {
    account,
    password,
  })
}

export function libraryLoginComplete(loginId: string, captcha: string) {
  return apiPost<{ ok: boolean }>('/api/library/login/complete', { loginId, captcha })
}

export function libraryLoans() {
  // 图书馆登录态独立于师说账号：这里 401 只表示图书馆需要重新登录，
  // 不能让全局 auth-expired 把学生从师说账号里登出。
  return apiRequest<LibraryLoansResult>('/api/library/loans', {
    suppressAuthEvent: true,
  })
}

export function libraryLogout() {
  return apiPost<{ ok: boolean }>('/api/library/logout', {})
}
