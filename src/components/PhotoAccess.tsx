import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ImageOff } from 'lucide-react'
import { Modal } from './ui'
import { isNativeApp } from '../lib/nativeShell'
import {
  checkNativePhotoAccess,
  openNativePhotoSettings,
  pickNativeImages,
} from '../lib/photoAccess'

export type PhotoPickResult = File[] | 'fallback' | null

interface PhotoAccessContextValue {
  pickImages: (options?: { multiple?: boolean }) => Promise<PhotoPickResult>
}

const PhotoAccessContext = createContext<PhotoAccessContextValue | null>(null)

export function usePhotoAccess() {
  const value = useContext(PhotoAccessContext)
  if (!value) throw new Error('usePhotoAccess 必须在 PhotoAccessProvider 内使用')
  return value
}

interface PendingPick {
  multiple: boolean
  resolve: (result: PhotoPickResult) => void
}

/**
 * 原生相册授权门。
 * - 允许：打开系统相册全库选图；
 * - 拒绝：显示“去授权”，可跳系统设置、重新检查，或改用系统选择器；
 * - 网页：直接返回 fallback，由调用方打开原来的文件选择器。
 */
export function PhotoAccessProvider({ children }: { children: ReactNode }) {
  const [deniedOpen, setDeniedOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const pendingRef = useRef<PendingPick | null>(null)

  const finish = useCallback((result: PhotoPickResult) => {
    const pending = pendingRef.current
    pendingRef.current = null
    setDeniedOpen(false)
    setChecking(false)
    setError(null)
    setHint(null)
    pending?.resolve(result)
  }, [])

  const pickImages = useCallback(
    (options: { multiple?: boolean } = {}) => {
      const multiple = Boolean(options.multiple)
      if (!isNativeApp()) return Promise.resolve<PhotoPickResult>('fallback')
      return new Promise<PhotoPickResult>((resolve) => {
        // 连续触发时先取消上一次，避免 promise 悬空。
        pendingRef.current?.resolve(null)
        void (async () => {
          try {
            const result = await pickNativeImages(multiple)
            if (result === 'denied') {
              pendingRef.current = { multiple, resolve }
              setError(null)
              setHint(null)
              setDeniedOpen(true)
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
            // 原生插件不可用时退回系统选择器，不阻断提问。
            resolve('fallback')
          }
        })()
      })
    },
    [],
  )

  const retry = useCallback(
    async (silent = false) => {
      const pending = pendingRef.current
      if (!pending) return
      setChecking(true)
      if (!silent) setError(null)
      try {
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
          finish('fallback')
          return
        }
        if (result === 'cancelled') {
          finish(null)
          return
        }
        finish(result)
      } catch {
        if (!silent) setError('无法打开系统相册，请稍后重试。')
      } finally {
        setChecking(false)
      }
    },
    [finish],
  )

  // 从系统设置返回时自动复查一次；已授权就直接打开相册。
  useEffect(() => {
    if (!deniedOpen) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void retry(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [deniedOpen, retry])

  const openSettings = async () => {
    try {
      await openNativePhotoSettings()
      setHint('已打开系统设置。允许“师说”访问照片后返回，会自动检查。')
    } catch {
      setError('无法打开系统设置，请到手机的「设置 → 应用 → 师说 → 权限」里手动开启。')
    }
  }

  return (
    <PhotoAccessContext.Provider value={{ pickImages }}>
      {children}

      <Modal
        open={deniedOpen}
        onClose={() => finish(null)}
        layerClassName="photo-access-layer"
        className="photo-access-panel"
        eyebrow="系统权限"
        title="照片权限未开启"
        size="sm"
      >
        <div className="photo-access-body">
          <span className="photo-access-icon" aria-hidden="true">
            <ImageOff size={26} />
          </span>
          <p className="photo-access-lead">未允许师说获取照片权限，无法访问相册中的图片。</p>
          <p className="photo-access-note">
            你可以在系统设置里允许“师说”访问照片；也可以改用系统选择器，只发送本次选中的照片。
          </p>
          {hint && <p className="photo-access-hint">{hint}</p>}
          {error && <p className="photo-access-error">{error}</p>}
          <div className="photo-access-actions">
            <button className="button button-primary" type="button" onClick={() => void openSettings()}>
              去系统设置授权
            </button>
            <button
              className="button button-ghost"
              type="button"
              onClick={() => finish('fallback')}
            >
              改用系统选择器
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => void retry(false)}
              disabled={checking}
            >
              {checking ? '检查中…' : '我已授权，重新检查'}
            </button>
          </div>
          <p className="photo-access-fact">
            文件不走这个权限：系统文件选择器只会授权你本次选中的文件，安卓没有普通应用的“访问全部文件”权限。
          </p>
        </div>
      </Modal>
    </PhotoAccessContext.Provider>
  )
}
