import { Capacitor, SystemBarType, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * 原生壳桥接层：只在 Capacitor 里生效，网页端全部安全降级。
 * - 系统栏图标随主题/登录页滚动切换；
 * - target=_blank / 外链交给系统浏览器（Custom Tab）；
 * - Blob 导出写到缓存后调系统分享，避免 WebView 里 a[download] 无响应。
 */

export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

let authStatusDark = false
let installed = false

function applyBars() {
  if (!isNativeApp()) return
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const statusStyle =
    authStatusDark || theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light
  const navStyle = theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light
  void SystemBars.setStyle({ bar: SystemBarType.StatusBar, style: statusStyle }).catch(() => {})
  void SystemBars.setStyle({ bar: SystemBarType.NavigationBar, style: navStyle }).catch(() => {})
}

/** 登录页顶部是深色 hero，状态栏要用浅色图标；滚到表单区后恢复主题色。 */
export function setAuthStatusDark(dark: boolean) {
  authStatusDark = dark
  applyBars()
}

function notify(message: string, tone: 'success' | 'danger' = 'success') {
  window.dispatchEvent(
    new CustomEvent(tone === 'danger' ? 'shishuo:sync-error' : 'shishuo:sync-notice', {
      detail: { message },
    }),
  )
}

export async function openExternalUrl(url: string) {
  if (!isNativeApp()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    await Browser.open({ url })
  } catch {
    window.location.href = url
  }
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.onload = () => {
      const value = String(reader.result ?? '')
      resolve(value.slice(value.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

function downloadViaAnchor(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Web：普通下载；原生：写入缓存并打开系统分享/保存面板。 */
export async function saveOrShareFile(blob: Blob, filename: string) {
  if (!isNativeApp()) {
    downloadViaAnchor(blob, filename)
    return
  }
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_') || 'shishuo-export'
  let uri = ''
  try {
    const written = await Filesystem.writeFile({
      path: safeName,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    })
    uri = written.uri
  } catch (error) {
    notify(`文件写入失败：${error instanceof Error ? error.message : String(error)}`, 'danger')
    return
  }
  try {
    await Share.share({
      title: safeName,
      files: [uri],
      dialogTitle: '保存或分享文件',
    })
    notify('已打开系统分享，可保存到文件或发送给同学')
  } catch {
    // 用户取消分享属于正常操作，不弹错误。
  }
}

function handleAnchorClick(event: MouseEvent) {
  if (!isNativeApp()) return
  const target = event.target as Element | null
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!anchor) return
  const raw = anchor.getAttribute('href') ?? ''
  if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return
  let url: URL
  try {
    url = new URL(raw, window.location.href)
  } catch {
    return
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  const blank = anchor.target === '_blank'
  if (!blank && url.origin === window.location.origin) return
  event.preventDefault()
  event.stopPropagation()
  void openExternalUrl(url.href)
}

/** 在 main/admin 入口各调用一次。 */
export function installNativeChrome() {
  if (!isNativeApp() || installed) return
  installed = true
  document.documentElement.dataset.nativeShell = 'true'
  document.addEventListener('click', handleAnchorClick, true)
  new MutationObserver(() => applyBars()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  applyBars()
}
