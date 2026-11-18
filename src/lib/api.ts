export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'student' | 'teacher'
  profile: Record<string, unknown> | null
  courses: string[]
  isAdmin: boolean
  createdAt: number
}

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, message: string, payload?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  suppressAuthEvent?: boolean
}

function errorMessage(payload: unknown) {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: unknown }).error
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message?: unknown }).message ?? '')
    }
    if ('message' in payload) return String((payload as { message?: unknown }).message ?? '')
  }
  return ''
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(0, '无法连接师说服务端，请确认服务已启动。')
  }

  const raw = await response.text()
  let payload: unknown = null
  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !options.suppressAuthEvent) {
      window.dispatchEvent(new Event('shishuo:auth-expired'))
    }
    throw new ApiError(
      response.status,
      errorMessage(payload) || `请求失败（HTTP ${response.status}）。`,
      payload,
    )
  }
  if (raw && payload === null) {
    throw new ApiError(
      response.status,
      '服务端返回了无法解析的内容，请确认 API 代理已启用。',
      payload,
    )
  }

  return (payload ?? null) as T
}

export function apiGet<T>(path: string) {
  return apiRequest<T>(path)
}

export function apiPost<T>(path: string, body: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
  return apiRequest<T>(path, { ...options, method: 'POST', body })
}

export function apiPut<T>(path: string, body: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
  return apiRequest<T>(path, { ...options, method: 'PUT', body })
}

export function apiPatch<T>(path: string, body: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
  return apiRequest<T>(path, { ...options, method: 'PATCH', body })
}

export function apiDelete<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
  return apiRequest<T>(path, { ...options, method: 'DELETE', body })
}
