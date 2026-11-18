export type Theme = 'light' | 'dark'

const THEME_KEY = 'shishuo.theme.v1'

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // 存储不可用时回退浅色。
  }
  return 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // 忽略存储失败；当前会话仍然生效。
  }
}

export function toggleTheme(): Theme {
  const next: Theme = loadTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}
