export type Theme = 'light' | 'dark'
export type ThemePreference = Theme | 'system'

/** v2：默认跟随系统；旧的 v1 手动值不再沿用。 */
const THEME_KEY = 'shishuo.theme.v2'
const systemMedia = window.matchMedia('(prefers-color-scheme: dark)')

export function systemTheme(): Theme {
  return systemMedia.matches ? 'dark' : 'light'
}

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === 'system' ? systemTheme() : preference
}

export function loadThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    // 存储不可用时跟随系统。
  }
  return 'system'
}

/** 兼容旧调用：返回解析后的 light/dark。 */
export function loadTheme(): Theme {
  return resolveTheme(loadThemePreference())
}

function paint(preference: ThemePreference) {
  const resolved = resolveTheme(preference)
  document.documentElement.dataset.theme = resolved
  document.documentElement.dataset.themePreference = preference
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0f1714' : '#f4f0e6')
}

export function applyTheme(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_KEY, preference)
  } catch {
    // 忽略存储失败；当前会话仍然生效。
  }
  paint(preference)
}

export function toggleTheme(): ThemePreference {
  const current = loadThemePreference()
  const next: ThemePreference =
    current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'
  applyTheme(next)
  return next
}

let installed = false

/** 启动时调用一次：应用偏好，并在系统主题变化时自动重绘。 */
export function initTheme() {
  applyTheme(loadThemePreference())
  if (installed) return
  installed = true
  const repaint = () => {
    if (loadThemePreference() === 'system') paint('system')
  }
  systemMedia.addEventListener('change', repaint)
  // Android WebView 从后台恢复时，change 事件不保证补发。
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) repaint()
  })
}
