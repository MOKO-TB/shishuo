export type Theme = 'light' | 'dark'
export type ThemePreference = Theme

const THEME_KEY = 'shishuo.theme.v2'

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === 'dark' ? 'dark' : 'light'
}

export function loadThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // 存储不可用时默认使用浅色。
  }
  return 'light'
}

/** 兼容旧调用：返回解析后的 light/dark。 */
export function loadTheme(): Theme {
  return resolveTheme(loadThemePreference())
}

function paint(preference: ThemePreference) {
  const resolved = resolveTheme(preference)
  document.documentElement.dataset.theme = resolved
  document.documentElement.dataset.themePreference = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0f1714' : '#f4f0e6')
}

export function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference)
  try {
    localStorage.setItem(THEME_KEY, resolved)
  } catch {
    // 忽略存储失败；当前会话仍然生效。
  }
  paint(resolved)
}

export function toggleTheme(): ThemePreference {
  const next: ThemePreference = loadThemePreference() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

/** 启动时调用一次：应用已保存的浅色或深色主题。 */
export function initTheme() {
  applyTheme(loadThemePreference())
}
