import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-serif-sc/600.css'
import '@fontsource/noto-serif-sc/700.css'
import 'katex/dist/katex.min.css'
import { Loader2 } from 'lucide-react'
import App from './App'
import { AuthProvider, useAuth } from './auth'
import { AuthScreen } from './components/AuthScreen'
import { BrandMark } from './components/ui'
import { applyTheme, loadTheme } from './lib/theme'
import { StoreProvider } from './store'
import './styles.css'

applyTheme(loadTheme())

function Root() {
  const { user, loading } = useAuth()

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

  return (
    <StoreProvider key={user.id}>
      <App />
    </StoreProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
)
