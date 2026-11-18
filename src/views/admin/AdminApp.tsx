import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth'
import { BrandMark, Toast, type ToastState } from '../../components/ui'
import { AdminConsoleView } from './AdminConsoleView'

export function AdminApp() {
  const { user, loading, error, login, logout } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [attemptedLogin, setAttemptedLogin] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const notify = (message: string, tone: ToastState['tone'] = 'success') => {
    setToast({ id: Date.now(), message, tone })
    window.setTimeout(() => setToast(null), 4200)
  }

  useEffect(() => {
    if (attemptedLogin && user && !user.isAdmin) {
      setFormError(
        `${user.name}（${user.email}）不是管理员。请换一个管理员账号登录。`,
      )
    }
  }, [attemptedLogin, user])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFormError(null)
    try {
      await login(email.trim(), password)
      setEmail('')
      setPassword('')
      setAttemptedLogin(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '登录失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="app-gate admin-standalone-gate">
        <div className="app-gate-card">
          <BrandMark size={46} />
          <Loader2 size={24} className="spin-icon app-gate-spinner" />
          <h2>正在连接管理台</h2>
          <p>检查管理员登录状态。</p>
        </div>
      </div>
    )
  }

  /*
   * 关键：即使当前浏览器里已经登录了学生/教师账号，也展示管理员登录页，
   * 而不是“需要管理员账号”的死路。登录成功后会直接换成新账号的 Cookie。
   */
  if (!user || !user.isAdmin) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-brand">
          <BrandMark size={44} />
          <div>
            <strong>师说 · 管理台</strong>
            <span>服务器后台 · 账号 / 风控 / 内容 / 系统</span>
          </div>
        </div>

        {user && !user.isAdmin && (
          <div className="admin-login-current">
            <div>
              <strong>当前登录：{user.name}</strong>
              <span>
                {user.email} · {user.role === 'teacher' ? '教师' : '学生'}账号，没有管理权限
              </span>
            </div>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                setFormError(null)
                setAttemptedLogin(false)
                void logout()
              }}
            >
              退出当前账号
            </button>
          </div>
        )}

        <form className="admin-login-card" onSubmit={(event) => void submit(event)}>
          <div className="admin-login-head">
            <ShieldCheck size={20} />
            <div>
              <h1>管理员登录</h1>
              <p>管理台是独立入口，只接受管理员账号；登录后会替换当前浏览器会话。</p>
            </div>
          </div>
          {(formError || error) && (
            <div className="admin-login-error">{formError || error}</div>
          )}
          <label className="field">
            <span className="field-label">管理员邮箱</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@shishuo.local"
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">密码</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入密码"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="button button-primary admin-login-submit" type="submit" disabled={busy}>
            {busy ? <Loader2 size={15} className="spin-icon" /> : <ShieldCheck size={15} />}
            进入管理台
          </button>
          <a className="admin-login-back" href="/">
            <ArrowLeft size={13} />
            返回主站
          </a>
        </form>
        <p className="admin-login-foot">
          管理员账号由数据库 `is_admin=1` 控制；所有管理操作都会写入审计日志。
        </p>
      </div>
    )
  }

  return (
    <div className="admin-standalone">
      <header className="admin-standalone-bar">
        <a className="admin-standalone-brand" href="/">
          <BrandMark size={34} />
          <span>
            <strong>师说 · 管理台</strong>
            <em>服务器后台</em>
          </span>
        </a>
        <div className="admin-standalone-user">
          <span>{user.name}</span>
          <em>{user.email}</em>
          <a className="admin-standalone-home" href="/">
            返回主站
          </a>
          <button className="admin-standalone-logout" onClick={() => void logout()}>
            <LogOut size={14} />
            退出
          </button>
        </div>
      </header>
      <main className="admin-standalone-main">
        <AdminConsoleView
          notify={notify}
          onNavigate={(view) =>
            window.location.assign(view === 'student' ? '/' : `/?view=${view}`)
          }
          onOpenBackup={() =>
            notify('数据备份请在主站教师端「数据备份」里操作。', 'info')
          }
        />
      </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
