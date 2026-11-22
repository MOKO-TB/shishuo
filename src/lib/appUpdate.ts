import { getNativeAppInfo, isNativeApp, type NativeAppInfo } from './nativeShell'

export interface RemoteAppRelease {
  platform: string
  versionCode: number
  versionName: string
  minSupportedCode: number
  releaseSha256?: string
  downloadUrl: string
  fallbackUrl?: string
  notes: string
  updatedAt?: string
}

export interface AppUpdateCheckResult {
  current: NativeAppInfo
  latest: RemoteAppRelease
  hasUpdate: boolean
  required: boolean
  signatureMismatch: boolean
}

const DISMISSED_KEY = 'shishuo.appUpdate.dismissedCode.v1'

export function isUpdateDismissed(versionCode: number) {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY) || 0) >= versionCode
  } catch {
    return false
  }
}

export function dismissUpdateVersion(versionCode: number) {
  try {
    localStorage.setItem(DISMISSED_KEY, String(versionCode))
  } catch {
    // ignore
  }
}

export async function checkAndroidAppUpdate(): Promise<AppUpdateCheckResult | null> {
  if (!isNativeApp()) return null
  const current = await getNativeAppInfo()
  if (!current) return null
  const response = await fetch('/api/app/version', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!response.ok) return null
  const latest = (await response.json()) as RemoteAppRelease
  if (!latest || typeof latest.versionCode !== 'number') return null
  const currentSig = (current.signingSha256 || '').trim().toLowerCase()
  const targetSig = (latest.releaseSha256 || '').trim().toLowerCase()
  // v0.1.0 (1) 与 v0.2.0 (2) 为早期 debug 签名，v0.2.1 (3) 起统一采用正式签名。
  const signatureMismatch =
    currentSig && targetSig
      ? currentSig !== targetSig
      : Boolean(current.debuggable) || current.versionCode <= 2

  return {
    current,
    latest,
    hasUpdate: latest.versionCode > current.versionCode,
    required: current.versionCode < (latest.minSupportedCode || 1),
    signatureMismatch,
  }
}
