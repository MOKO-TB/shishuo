import { Capacitor, registerPlugin } from '@capacitor/core'
import { isNativeApp } from './nativeShell'

/**
 * 原生图片与相机桥：
 * - 系统相册授权（含 Android 14+ 有限访问兼容）+ 全库选图；
 * - 原生拍题/拍板书（调用系统相机 + 自动旋转压缩）；
 * - 保存图片到系统相册（MediaStore）。
 */

export interface NativePhotoFile {
  name: string
  mime: string
  dataUrl: string
}

interface PhotoAccessPlugin {
  checkAccess(): Promise<{ status: 'granted' | 'denied' }>
  requestAccess(): Promise<{ status: 'granted' | 'denied' }>
  checkCameraAccess(): Promise<{ status: 'granted' | 'denied' }>
  openGallery(options: { multiple?: boolean }): Promise<{
    files?: NativePhotoFile[]
    errors?: string[]
    cancelled?: boolean
    status?: 'denied' | 'unavailable'
  }>
  takePhoto(): Promise<{
    file?: NativePhotoFile
    cancelled?: boolean
    status?: 'denied' | 'unavailable' | 'error'
    message?: string
  }>
  saveImageToGallery(options: { source: string; name?: string }): Promise<{
    saved: boolean
    name?: string
  }>
  openSettings(): Promise<void>
}

const PhotoAccess = registerPlugin<PhotoAccessPlugin>('PhotoAccess')

export type NativeImagePick = File[] | 'denied' | 'cancelled' | 'unavailable'
export type NativePhotoCapture = File | 'denied' | 'cancelled' | 'unavailable'

export async function nativePhotoDataUrlToFile(file: NativePhotoFile) {
  const response = await fetch(file.dataUrl)
  const blob = await response.blob()
  return new File([blob], file.name, { type: file.mime || 'image/jpeg' })
}

export async function pickNativeImages(multiple: boolean): Promise<NativeImagePick> {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('PhotoAccess')) return 'unavailable'
  const access = await PhotoAccess.requestAccess()
  if (access.status !== 'granted') return 'denied'
  const result = await PhotoAccess.openGallery({ multiple })
  if (result.status === 'denied') return 'denied'
  if (result.status === 'unavailable') return 'unavailable'
  if (result.cancelled) return 'cancelled'
  return Promise.all((result.files ?? []).map(nativePhotoDataUrlToFile))
}

export async function takeNativePhoto(): Promise<NativePhotoCapture> {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('PhotoAccess')) return 'unavailable'
  try {
    const result = await PhotoAccess.takePhoto()
    if (result.status === 'denied') return 'denied'
    if (result.status === 'unavailable' || result.status === 'error') return 'unavailable'
    if (result.cancelled || !result.file) return 'cancelled'
    return nativePhotoDataUrlToFile(result.file)
  } catch {
    return 'unavailable'
  }
}

export async function checkNativePhotoAccess() {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('PhotoAccess')) return false
  const result = await PhotoAccess.checkAccess()
  return result.status === 'granted'
}

export async function checkNativeCameraAccess() {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('PhotoAccess')) return false
  try {
    const result = await PhotoAccess.checkCameraAccess()
    return result.status === 'granted'
  } catch {
    return false
  }
}

export async function saveNativeImageToGallery(source: string, name = 'shishuo-image.jpg') {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('PhotoAccess')) return false
  try {
    const result = await PhotoAccess.saveImageToGallery({ source, name })
    return result?.saved === true
  } catch {
    return false
  }
}

export async function openNativePhotoSettings() {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('PhotoAccess')) return
  await PhotoAccess.openSettings()
}
