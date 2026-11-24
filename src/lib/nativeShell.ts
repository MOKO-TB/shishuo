import { Capacitor, registerPlugin, SystemBarType, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { entryEndTime, entryStartTime, type ScheduleEntry } from './profile'

/**
 * 原生壳桥接层：只在 Capacitor 里生效，网页端与旧版 APK 全部安全降级。
 * - 系统栏图标随主题/登录页滚动切换；
 * - target=_blank / 外链交给系统浏览器（Custom Tab）；
 * - Blob 导出写到缓存后调系统分享，避免 WebView 里 a[download] 无响应；
 * - 系统文本分享、触感反馈、桌面课表小组件同步、版本信息与更新下载、省电设置跳转。
 */

interface ScheduleBridgePlugin {
  syncSchedule(options: { payload: string }): Promise<{ ok: boolean }>
  getCachedSchedule(): Promise<{ payload: string }>
  requestPinWidget(): Promise<{ supported: boolean; requested: boolean }>
}

interface AppSystemPlugin {
  getAppInfo(): Promise<{
    packageName: string
    serverUrl: string
    versionCode: number
    versionName: string
    inAppUpdater?: boolean
    debuggable?: boolean
    signingSha256?: string
  }>
  downloadUpdate(options: {
    url: string
    fallbackUrl?: string
    versionName: string
  }): Promise<{
    mode: 'inApp' | 'downloadManager' | 'browser'
    status?: 'downloading' | 'installing' | 'permission_required' | 'error'
    downloadId?: number
    message?: string
  }>
  installPendingUpdate(): Promise<{
    status: 'installing' | 'permission_required' | 'missing' | 'error'
  }>
  openInstallPermissionSettings(): Promise<void>
  openBatterySettings(): Promise<void>
  haptic(options: { style?: 'light' | 'medium' | 'success' }): Promise<void>
  addListener(
    eventName: 'updateDownload',
    listenerFunc: (data: UpdateDownloadProgress) => void,
  ): Promise<{ remove: () => Promise<void> }>
}

const ScheduleBridge = registerPlugin<ScheduleBridgePlugin>('ScheduleBridge')
const AppSystem = registerPlugin<AppSystemPlugin>('AppSystem')

export interface NativeAppInfo {
  packageName: string
  serverUrl: string
  versionCode: number
  versionName: string
  inAppUpdater?: boolean
  debuggable?: boolean
  signingSha256?: string
}

export interface UpdateDownloadProgress {
  status: 'downloading' | 'verifying' | 'permission_required' | 'installing' | 'error'
  progress: number
  downloadedBytes: number
  totalBytes: number
  message: string
}

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

/** 轻量原生触感反馈；非原生或旧版 APK 静默忽略。 */
export function triggerHaptic(style: 'light' | 'medium' | 'success' = 'light') {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('AppSystem')) return
  void AppSystem.haptic({ style }).catch(() => {})
}

/** 原生系统分享面板；用户取消或不可用返回 false。 */
export async function shareNativeLink(input: {
  title: string
  text?: string
  url: string
}): Promise<'shared' | 'cancelled' | 'unavailable'> {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('Share')) return 'unavailable'
  try {
    await Share.share({
      title: input.title,
      text: input.text,
      url: input.url,
      dialogTitle: '分享给同学或老师',
    })
    return 'shared'
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : ''
    if (msg.includes('cancel')) return 'cancelled'
    return 'unavailable'
  }
}

/** 同步课表到原生缓存并刷新 Android 桌面小组件。 */
export async function syncNativeSchedule(payload: {
  schedule: unknown[]
  termStart: number | null
  studentName?: string
}) {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('ScheduleBridge')) return false
  try {
    const normalized = payload.schedule.map((item) => {
      if (!item || typeof item !== 'object') return item
      const entry = item as ScheduleEntry
      return {
        ...entry,
        startTime: entryStartTime(entry) || entry.startTime,
        endTime: entryEndTime(entry) || entry.endTime,
      }
    })
    await ScheduleBridge.syncSchedule({
      payload: JSON.stringify({
        ...payload,
        schedule: normalized,
        updatedAt: Date.now(),
      }),
    })
    return true
  } catch {
    return false
  }
}

/** 一键申请把课表小组件钉到手机桌面（Android 8.0+ 支持）。 */
export async function requestPinScheduleWidget(): Promise<'requested' | 'unsupported'> {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('ScheduleBridge')) return 'unsupported'
  try {
    const res = await ScheduleBridge.requestPinWidget()
    return res?.supported && res?.requested ? 'requested' : 'unsupported'
  } catch {
    return 'unsupported'
  }
}

/** 读取当前 APK 的版本信息；旧版 APK 未含 AppSystem 插件时返回兜底版本 0.1.0(1)。 */
export async function getNativeAppInfo(): Promise<NativeAppInfo | null> {
  if (!isNativeApp()) return null
  if (!Capacitor.isPluginAvailable('AppSystem')) {
    return {
      packageName: 'com.shishuo.app',
      serverUrl: window.location.origin,
      versionCode: 1,
      versionName: '0.1.0',
    }
  }
  try {
    return await AppSystem.getAppInfo()
  } catch {
    return {
      packageName: 'com.shishuo.app',
      serverUrl: window.location.origin,
      versionCode: 1,
      versionName: '0.1.0',
    }
  }
}

/** 启动 APK 更新包下载（应用内流式下载并直接调起系统安装器）。 */
export async function downloadNativeUpdate(
  url: string,
  versionName: string,
  fallbackUrl?: string,
): Promise<{
  mode: 'inApp' | 'downloadManager' | 'browser'
  status?: 'downloading' | 'installing' | 'permission_required' | 'error'
  message?: string
}> {
  const absoluteUrl = new URL(url, window.location.origin).href
  const absoluteFallback = fallbackUrl
    ? new URL(fallbackUrl, window.location.origin).href
    : undefined
  if (!isNativeApp()) {
    window.open(absoluteUrl, '_blank', 'noopener,noreferrer')
    return { mode: 'browser' }
  }
  if (!Capacitor.isPluginAvailable('AppSystem')) {
    await openExternalUrl(absoluteUrl)
    return { mode: 'browser' }
  }
  try {
    const res = await AppSystem.downloadUpdate({
      url: absoluteUrl,
      fallbackUrl: absoluteFallback,
      versionName,
    })
    return {
      mode: res?.mode ?? 'inApp',
      status: res?.status,
      message: res?.message,
    }
  } catch {
    await openExternalUrl(absoluteUrl)
    return { mode: 'browser' }
  }
}

export function subscribeUpdateDownload(listener: (data: UpdateDownloadProgress) => void) {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('AppSystem')) {
    return () => {}
  }
  let removed = false
  let removeHandle: (() => Promise<void>) | null = null
  void AppSystem.addListener('updateDownload', (data) => {
    if (!removed) listener(data)
  })
    .then((handle) => {
      if (removed) void handle.remove()
      else removeHandle = handle.remove
    })
    .catch(() => {})
  return () => {
    removed = true
    if (removeHandle) void removeHandle().catch(() => {})
  }
}

export async function openNativeInstallPermissionSettings() {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('AppSystem')) return false
  try {
    await AppSystem.openInstallPermissionSettings()
    return true
  } catch {
    return false
  }
}

export async function installPendingNativeUpdate() {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('AppSystem')) return 'missing' as const
  try {
    const res = await AppSystem.installPendingUpdate()
    return res?.status ?? 'missing'
  } catch {
    return 'missing' as const
  }
}

/** 跳转系统电池优化/应用详情，帮国产 ROM 减少后台轮询被杀。 */
export async function openNativeBatterySettings() {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('AppSystem')) return false
  try {
    await AppSystem.openBatterySettings()
    return true
  } catch {
    return false
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
