import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from './nativeShell'

/**
 * 原生相册权限桥。
 *
 * 第一次点“图片”会触发 Android 运行时权限：允许后打开系统相册全库选图；
 * 拒绝后由 PhotoAccessProvider 显示“去授权”页。文件不走这个权限，
 * 继续使用系统文件选择器（SAF）逐次授权。
 */

interface NativePhotoFile {
  name: string
  mime: string
  dataUrl: string
}

interface PhotoAccessPlugin {
  checkAccess(): Promise<{ status: 'granted' | 'denied' }>
  requestAccess(): Promise<{ status: 'granted' | 'denied' }>
  openGallery(options: { multiple?: boolean }): Promise<{
    files?: NativePhotoFile[]
    errors?: string[]
    cancelled?: boolean
    status?: 'denied' | 'unavailable'
  }>
  openSettings(): Promise<void>
}

const PhotoAccess = registerPlugin<PhotoAccessPlugin>('PhotoAccess')

export type NativeImagePick = File[] | 'denied' | 'cancelled' | 'unavailable'

async function dataUrlToFile(file: NativePhotoFile) {
  const response = await fetch(file.dataUrl)
  const blob = await response.blob()
  return new File([blob], file.name, { type: file.mime })
}

export async function pickNativeImages(multiple: boolean): Promise<NativeImagePick> {
  if (!isNativeApp()) return 'unavailable'
  const access = await PhotoAccess.requestAccess()
  if (access.status !== 'granted') return 'denied'
  const result = await PhotoAccess.openGallery({ multiple })
  if (result.status === 'denied') return 'denied'
  if (result.status === 'unavailable') return 'unavailable'
  if (result.cancelled) return 'cancelled'
  return Promise.all((result.files ?? []).map(dataUrlToFile))
}

export async function checkNativePhotoAccess() {
  if (!isNativeApp()) return false
  const result = await PhotoAccess.checkAccess()
  return result.status === 'granted'
}

export async function openNativePhotoSettings() {
  if (!isNativeApp()) return
  await PhotoAccess.openSettings()
}
