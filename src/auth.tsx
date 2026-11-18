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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await apiGet<{ user: SessionUser | null }>('/api/auth/me')
      if (result.user) {
        applyUser(result.user)
        setUser(result.user)
      } else {
        setUser(null)
        clearSessionState()
      }
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
    const result = await apiPost<{ user: SessionUser }>(
      '/api/auth/login',
      { email, password },
      { suppressAuthEvent: true },
    )
    applyUser(result.user)
    setUser(result.user)
    setError(null)
  }, [])

  const register = useCallback<AuthContextValue['register']>(async (input) => {
    const result = await apiPost<{ user: SessionUser }>(
      '/api/auth/register',
      input,
      { suppressAuthEvent: true },
    )
    applyUser(result.user)
    setUser(result.user)
    setError(null)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout', {})
    } catch {
      // The local session is still cleared even if the server is unreachable.
    }
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
