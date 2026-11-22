import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CameraOff, ImageOff } from 'lucide-react'
import { Modal } from './ui'
import { isNativeApp } from '../lib/nativeShell'
import {
  checkNativeCameraAccess,
  checkNativePhotoAccess,
  openNativePhotoSettings,
  pickNativeImages,
  takeNativePhoto,
} from '../lib/photoAccess'

export type PhotoPickResult = File[] | 'fallback' | null
export type PhotoCaptureResult = File | 'unavailable' | null

interface PhotoAccessContextValue {
  pickImages: (options?: { multiple?: boolean }) => Promise<PhotoPickResult>
  takePhoto: () => Promise<PhotoCaptureResult>
}

const PhotoAccessContext = createContext<PhotoAccessContextValue | null>(null)

export function usePhotoAccess() {
  const value = useContext(PhotoAccessContext)
  if (!value) throw new Error('usePhotoAccess 必须在 PhotoAccessProvider 内使用')
  return value
}

type PendingRequest =
  | { kind: 'gallery'; multiple: boolean; resolve: (result: PhotoPickResult) => void }
  | { kind: 'camera'; resolve: (result: PhotoCaptureResult) => void }

/**
 * 原生相册与相机授权门。
 * - 相册：允许后打开系统相册全库选图；拒绝后引导系统设置授权，或改用系统选择器；
 * - 拍照：允许后直接调起系统相机拍题/拍板书并压缩回传；拒绝后引导系统设置开启相机权限；
 * - 网页：pickImages 返回 fallback，takePhoto 返回 unavailable。
 */
export function PhotoAccessProvider({ children }: { children: ReactNode }) {
  const [deniedKind, setDeniedKind] = useState<'gallery' | 'camera' | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const pendingRef = useRef<PendingRequest | null>(null)

  const finishGallery = useCallback((result: PhotoPickResult) => {
    const pending = pendingRef.current
    pendingRef.current = null
    setDeniedKind(null)
    setChecking(false)
    setError(null)
    setHint(null)
    if (pending?.kind === 'gallery') pending.resolve(result)
  }, [])

  const finishCamera = useCallback((result: PhotoCaptureResult) => {
    const pending = pendingRef.current
    pendingRef.current = null
    setDeniedKind(null)
    setChecking(false)
    setError(null)
    setHint(null)
    if (pending?.kind === 'camera') pending.resolve(result)
  }, [])

  const cancelPending = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return
    if (pending.kind === 'gallery') finishGallery(null)
    else finishCamera(null)
  }, [finishCamera, finishGallery])

  const pickImages = useCallback((options: { multiple?: boolean } = {}) => {
    const multiple = Boolean(options.multiple)
    if (!isNativeApp()) return Promise.resolve<PhotoPickResult>('fallback')
    return new Promise<PhotoPickResult>((resolve) => {
      cancelPending()
      void (async () => {
        try {
          const result = await pickNativeImages(multiple)
          if (result === 'denied') {
            pendingRef.current = { kind: 'gallery', multiple, resolve }
            setError(null)
            setHint(null)
            setDeniedKind('gallery')
            return
          }
          if (result === 'unavailable') {
            resolve('fallback')
            return
          }
          if (result === 'cancelled') {
            resolve(null)
            return
          }
          resolve(result)
        } catch {
          resolve('fallback')
        }
      })()
    })
  }, [cancelPending])

  const takePhoto = useCallback(() => {
    if (!isNativeApp()) return Promise.resolve<PhotoCaptureResult>('unavailable')
    return new Promise<PhotoCaptureResult>((resolve) => {
      cancelPending()
      void (async () => {
        try {
          const result = await takeNativePhoto()
          if (result === 'denied') {
            pendingRef.current = { kind: 'camera', resolve }
            setError(null)
            setHint(null)
            setDeniedKind('camera')
            return
          }
          if (result === 'unavailable') {
            resolve('unavailable')
            return
          }
          if (result === 'cancelled') {
            resolve(null)
            return
          }
          resolve(result)
        } catch {
          resolve('unavailable')
        }
      })()
    })
  }, [cancelPending])

  const retry = useCallback(
    async (silent = false) => {
      const pending = pendingRef.current
      if (!pending) return
      setChecking(true)
      if (!silent) setError(null)
      try {
        if (pending.kind === 'camera') {
          const granted = await checkNativeCameraAccess()
          if (!granted) {
            if (!silent) setError('仍未获得相机权限，请到系统设置里允许“师说”使用相机。')
            return
          }
          const result = await takeNativePhoto()
          if (result === 'denied') {
            if (!silent) setError('仍未获得相机权限，请到系统设置里允许“师说”使用相机。')
            return
          }
          if (result === 'unavailable') {
            finishCamera('unavailable')
            return
          }
          if (result === 'cancelled') {
            finishCamera(null)
            return
          }
          finishCamera(result)
          return
        }

        const granted = await checkNativePhotoAccess()
        if (!granted) {
          if (!silent) setError('仍未获得照片权限，请到系统设置里允许“师说”访问照片。')
          return
        }
        const result = await pickNativeImages(pending.multiple)
        if (result === 'denied') {
          if (!silent) setError('仍未获得照片权限，请到系统设置里允许“师说”访问照片。')
          return
        }
        if (result === 'unavailable') {
          finishGallery('fallback')
          return
        }
        if (result === 'cancelled') {
          finishGallery(null)
          return
        }
        finishGallery(result)
      } catch {
        if (!silent) {
          setError(pending.kind === 'camera' ? '无法打开相机，请稍后重试。' : '无法打开系统相册，请稍后重试。')
        }
      } finally {
        setChecking(false)
      }
    },
    [finishCamera, finishGallery],
  )

  useEffect(() => {
    if (!deniedKind) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void retry(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [deniedKind, retry])

  const openSettings = async () => {
    try {
      await openNativePhotoSettings()
      setHint(
        deniedKind === 'camera'
          ? '已打开系统设置。允许“师说”使用相机后返回，会自动重新打开拍照。'
          : '已打开系统设置。允许“师说”访问照片后返回，会自动检查。',
      )
    } catch {
      setError('无法打开系统设置，请到手机的「设置 → 应用 → 师说 → 权限」里手动开启。')
    }
  }

  const isCamera = deniedKind === 'camera'

  return (
    <PhotoAccessContext.Provider value={{ pickImages, takePhoto }}>
      {children}

      <Modal
        open={deniedKind !== null}
        onClose={cancelPending}
        layerClassName="photo-access-layer"
        className="photo-access-panel"
        eyebrow="系统权限"
        title={isCamera ? '相机权限未开启' : '照片权限未开启'}
        size="sm"
      >
        <div className="photo-access-body">
          <span className="photo-access-icon" aria-hidden="true">
            {isCamera ? <CameraOff size={26} /> : <ImageOff size={26} />}
          </span>
          <p className="photo-access-lead">
            {isCamera
              ? '未允许师说使用相机，暂时无法直接拍照拍题。'
              : '未允许师说获取照片权限，无法访问相册中的图片。'}
          </p>
          <p className="photo-access-note">
            {isCamera
              ? '你可以在系统设置里允许“师说”使用相机；也可以先用系统相机拍好再从相册选图。'
              : '你可以在系统设置里允许“师说”访问照片；也可以改用系统选择器，只发送本次选中的照片。'}
          </p>
          {hint && <p className="photo-access-hint">{hint}</p>}
          {error && <p className="photo-access-error">{error}</p>}
          <div className="photo-access-actions">
            <button className="button button-primary" type="button" onClick={() => void openSettings()}>
              去系统设置授权
            </button>
            {!isCamera && (
              <button
                className="button button-ghost"
                type="button"
                onClick={() => finishGallery('fallback')}
              >
                改用系统选择器
              </button>
            )}
            <button
              className="text-button"
              type="button"
              onClick={() => void retry(false)}
              disabled={checking}
            >
              {checking ? '检查中…' : '我已授权，重新检查'}
            </button>
          </div>
          {!isCamera && (
            <p className="photo-access-fact">
              文件不走这个权限：系统文件选择器只会授权你本次选中的文件，安卓没有普通应用的“访问全部文件”权限。
            </p>
          )}
        </div>
      </Modal>
    </PhotoAccessContext.Provider>
  )
}
