import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, apiGet, apiPost, type SessionUser } from './lib/api'
import {
  clearProfileMemory,
  hydrateProfile,
  setCurrentUserId,
  type StudentProfile,
} from './lib/profile'
import {
  readRememberToken,
  writeRememberToken,
  writeRememberedEmail,
} from './lib/authStorage'

interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (input: {
    name: string
    email: string
    password: string
    code: string
    role?: 'student' | 'teacher'
    inviteCode?: string
    courses?: string[]
    college?: string
    grade?: string
    major?: string
    studentNo?: string
  }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function applyUser(user: SessionUser) {
  setCurrentUserId(user.id)
  if (user.role === 'student') {
    hydrateProfile((user.profile ?? null) as Partial<StudentProfile> | null, user.name)
  } else {
    clearProfileMemory()
  }
}

function clearSessionState() {
  setCurrentUserId('')
  clearProfileMemory()
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/** 冷启动时 WebView 的网络常常还没就绪，/me 先重试两次再判定未登录。 */
async function fetchSession() {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await apiGet<{ user: SessionUser | null }>('/api/auth/me')
    } catch (error) {
      lastError = error
      const retryable = error instanceof ApiError && error.status === 0
      if (!retryable || attempt === 2) throw error
      await sleep(500 + attempt * 700)
    }
  }
  throw lastError
}

/** Cookie 被清掉时，用本机保存的“保持登录”令牌换一个新会话。 */
async function restoreSession() {
  const token = readRememberToken()
  if (!token) return null
  try {
    const result = await apiPost<{ user: SessionUser }>(
      '/api/auth/remember',
      { token },
      { suppressAuthEvent: true },
    )
    return result.user
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      writeRememberToken('')
    }
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await fetchSession()
      if (result.user) {
        applyUser(result.user)
        setUser(result.user)
        setError(null)
        return
      }
      const restored = await restoreSession()
      if (restored) {
        applyUser(restored)
        setUser(restored)
        setError(null)
        return
      }
      setUser(null)
      clearSessionState()
      setError(null)
    } catch (err) {
      setUser(null)
      clearSessionState()
      if (err instanceof ApiError && err.status !== 401) {
        setError(err.message)
      } else {
        setError(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onExpired = () => {
      setUser(null)
      clearSessionState()
    }
    window.addEventListener('shishuo:auth-expired', onExpired)
    return () => window.removeEventListener('shishuo:auth-expired', onExpired)
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiPost<{ user: SessionUser; rememberToken?: string }>(
      '/api/auth/login',
      { email, password },
      { suppressAuthEvent: true },
    )
    if (result.rememberToken) writeRememberToken(result.rememberToken)
    writeRememberedEmail(email)
    applyUser(result.user)
    setUser(result.user)
    setError(null)
  }, [])

  const register = useCallback<AuthContextValue['register']>(async (input) => {
    const result = await apiPost<{ user: SessionUser; rememberToken?: string }>(
      '/api/auth/register',
      input,
      { suppressAuthEvent: true },
    )
    if (result.rememberToken) writeRememberToken(result.rememberToken)
    writeRememberedEmail(input.email)
    applyUser(result.user)
    setUser(result.user)
    setError(null)
  }, [])

  const logout = useCallback(async () => {
    const rememberToken = readRememberToken()
    try {
      await apiPost('/api/auth/logout', { rememberToken })
    } catch {
      // The local session is still cleared even if the server is unreachable.
    }
    writeRememberToken('')
    setUser(null)
    clearSessionState()
  }, [])

  const value = useMemo(
    () => ({ user, loading, error, login, register, logout }),
    [user, loading, error, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
