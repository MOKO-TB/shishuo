import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-serif-sc/600.css'
import '@fontsource/noto-serif-sc/700.css'
import 'katex/dist/katex.min.css'
import { AuthProvider } from './auth'
import { AdminApp } from './views/admin/AdminApp'
import { applyTheme, loadTheme } from './lib/theme'
import './styles.css'

applyTheme(loadTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AdminApp />
    </AuthProvider>
  </StrictMode>,
)
