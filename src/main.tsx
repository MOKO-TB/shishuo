import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-serif-sc/600.css'
import '@fontsource/noto-serif-sc/700.css'
import 'katex/dist/katex.min.css'
import { Loader2 } from 'lucide-react'
import App from './App'
import { AuthProvider, useAuth } from './auth'
import { AttachmentConsentProvider } from './components/AttachmentConsent'
import { PhotoAccessProvider } from './components/PhotoAccess'
import { AuthScreen } from './components/AuthScreen'
import { BrandMark } from './components/ui'
import { initTheme } from './lib/theme'
import { installNativeChrome } from './lib/nativeShell'
import { initLocalNotifications } from './lib/localNotifications'
import { StoreProvider } from './store'
import './styles.css'

initTheme()
installNativeChrome()
void initLocalNotifications()

function Root() {
  const { user, loading, logout } = useAuth()

  if (loading) {
    return (
      <div className="app-gate">
        <div className="app-gate-card">
          <BrandMark size={46} />
          <Loader2 size={24} className="spin-icon app-gate-spinner" />
          <h2>正在连接师说</h2>
          <p>检查登录状态与服务端课程空间。</p>
        </div>
      </div>
    )
  }

  if (!user) return <AuthScreen />

  // 独立管理员账号不进入学生/教师主站，避免它被当成没有课程的教师账号。
  if (user.isAdmin && user.courses.length === 0) {
    return (
      <div className="app-gate">
        <div className="app-gate-card">
          <BrandMark size={46} />
          <h2>这是独立管理员账号</h2>
          <p>{user.name}（{user.email}）请从 /admin/ 进入管理台。</p>
          <div className="admin-gate-actions">
            <a className="button button-primary" href="/admin/">
              进入管理台
            </a>
            <button className="button button-ghost" onClick={() => void logout()}>
              退出登录
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <StoreProvider key={user.id}>
      <App />
    </StoreProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AttachmentConsentProvider>
        <PhotoAccessProvider>
          <Root />
        </PhotoAccessProvider>
      </AttachmentConsentProvider>
    </AuthProvider>
  </StrictMode>,
)
