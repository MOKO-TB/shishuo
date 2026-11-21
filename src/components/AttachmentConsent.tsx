import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { FileText, Image as ImageIcon, Lock, ShieldCheck } from 'lucide-react'
import { Modal } from './ui'
import { formatFileSize } from '../lib/attachment'
import {
  readRememberedTeacherVisible,
  rememberAttachmentConsent,
  shouldAskAttachmentConsent,
  type AttachmentConsentOptions,
  type AttachmentConsentResult,
} from '../lib/attachmentConsent'

interface PendingConsent extends AttachmentConsentOptions {
  resolve: (result: AttachmentConsentResult | null) => void
}

interface ConsentContextValue {
  requestConsent: (options: AttachmentConsentOptions) => Promise<AttachmentConsentResult | null>
}

const ConsentContext = createContext<ConsentContextValue | null>(null)

export function useAttachmentConsent() {
  const value = useContext(ConsentContext)
  if (!value) throw new Error('useAttachmentConsent 必须在 AttachmentConsentProvider 内使用')
  return value
}

/** 全局附件授权门：三个上传入口都走这里，保证“先确认、再读取/上传”。 */
export function AttachmentConsentProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConsent | null>(null)
  const [remember, setRemember] = useState(false)
  const [teacherVisible, setTeacherVisible] = useState(true)
  const pendingRef = useRef<PendingConsent | null>(null)

  const requestConsent = useCallback(
    (options: AttachmentConsentOptions) => {
      if (!shouldAskAttachmentConsent()) {
        const rememberedVisibility = readRememberedTeacherVisible()
        return Promise.resolve({
          teacherVisible:
            options.allowTeacherVisibleToggle && rememberedVisibility !== undefined
              ? rememberedVisibility
              : (options.defaultTeacherVisible ?? true),
        })
      }
      return new Promise<AttachmentConsentResult | null>((resolve) => {
        // 极端情况下连续触发两次：先取消上一次，避免 promise 悬空。
        pendingRef.current?.resolve(null)
        const entry: PendingConsent = { ...options, resolve }
        pendingRef.current = entry
        setRemember(false)
        setTeacherVisible(options.defaultTeacherVisible ?? true)
        setPending(entry)
      })
    },
    [],
  )

  const finish = useCallback(
    (result: AttachmentConsentResult | null) => {
      const entry = pendingRef.current
      pendingRef.current = null
      setPending(null)
      if (result && remember) rememberAttachmentConsent(result.teacherVisible)
      entry?.resolve(result)
    },
    [remember],
  )

  const scene = pending?.scene
  const isStudentAsk = scene === 'student-ask'
  const isFaq = scene === 'teacher-faq'
  const fileNames = pending?.fileNames ?? []
  const fileCount = fileNames.length
  const isImage = pending?.kind === 'image'
  const teacherToggle = Boolean(pending?.allowTeacherVisibleToggle)

  const title = isStudentAsk
    ? isImage
      ? '发送图片前的隐私确认'
      : '发送文件前的隐私确认'
    : isFaq
      ? '添加课程 FAQ 附件'
      : '发送回复附图'

  const scopeTitle = isStudentAsk
    ? '仅本次在系统选择器里勾选的内容'
    : isFaq
      ? '仅本次选中的附件'
      : '仅这张回复附图'

  const scopeCopy = isStudentAsk
    ? isImage
      ? '网页无法读取你相册里的其他内容；系统选择器只会交出你勾选的照片。'
      : '文件由系统选择器逐次授权，师说只能读取你本次选中的文件。'
    : isFaq
      ? '系统选择器只会把本次勾选的附件交给师说，不会读取其他文件。'
      : '系统选择器只会把这张图片交给师说，不会读取其他照片。'

  const sceneCopy = isStudentAsk
    ? isImage
      ? '图片会上传到师说服务器，用于 AI 识别和答疑；是否允许任课老师查看原图由你决定。'
      : '文档只在本机解析成文字摘要，原文件不会上传；问答记录只保存摘要。'
    : isFaq
      ? '附件会保存到课程 FAQ，本课程学生可查看和下载；文档正文会被提取，作为 AI 作答依据。'
      : '附图会随本次回复发送给已勾选的学生，发送后不能单张撤回。'

  return (
    <ConsentContext.Provider value={{ requestConsent }}>
      {children}

      <Modal
        open={Boolean(pending)}
        onClose={() => finish(null)}
        layerClassName="consent-layer"
        className="consent-panel"
        eyebrow={
          <>
            <ShieldCheck size={13} /> 隐私授权
          </>
        }
        title={title}
        size="sm"
        footer={
          <div className="modal-actions">
            <button className="button button-ghost" type="button" onClick={() => finish(null)}>
              取消
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => finish({ teacherVisible })}
            >
              同意并继续
            </button>
          </div>
        }
      >
        <div className="consent-body">
          <div className="consent-scope">
            <span className="consent-scope-icon" aria-hidden="true">
              <ShieldCheck size={20} />
            </span>
            <div>
              <strong>{scopeTitle}</strong>
              <p>{scopeCopy}</p>
            </div>
          </div>

          <div className="consent-fact">
            <Lock size={15} aria-hidden="true" />
            <span>
              {isImage
                ? '师说不会扫描你的相册；只会处理你在系统选择器里选中的照片。'
                : '文件由系统选择器逐次授权；安卓没有普通应用的“访问全部文件”权限。'}
            </span>
          </div>

          {fileCount > 0 && (
            <div className="consent-files">
              <div className="consent-files-head">
                {isImage ? <ImageIcon size={15} /> : <FileText size={15} />}
                <strong>{fileCount === 1 ? '本次内容' : `本次 ${fileCount} 个文件`}</strong>
                {pending?.totalBytes ? <small>{formatFileSize(pending.totalBytes)}</small> : null}
              </div>
              <ul>
                {fileNames.slice(0, 4).map((name) => (
                  <li key={name}>{name}</li>
                ))}
                {fileCount > 4 && <li>…另有 {fileCount - 4} 个文件</li>}
              </ul>
            </div>
          )}

          <p className="consent-scene-copy">{sceneCopy}</p>

          {teacherToggle && (
            <label className="settings-row consent-toggle">
              <span className="settings-row-copy">
                <strong>允许任课老师查看原图</strong>
                <small>
                  {teacherVisible
                    ? '老师能看到原图，便于讲清题目；匿名提问只隐藏姓名，不隐藏图片内容。'
                    : '只用于 AI 识别；任课老师和同班同学都看不到原图。'}
                </small>
              </span>
              <input
                className="settings-switch"
                type="checkbox"
                checked={teacherVisible}
                onChange={(event) => setTeacherVisible(event.target.checked)}
              />
            </label>
          )}

          <label className="consent-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>
              <strong>记住我的选择</strong>
              <small>以后上传不再询问；可在「账号 · 隐私与附件」里重新开启。</small>
            </span>
          </label>

          <p className="consent-audit">
            为内容安全，管理员可能在审核时查看附件。请先裁剪或遮挡身份证号、学号、联系方式等敏感信息。
          </p>
        </div>
      </Modal>
    </ConsentContext.Provider>
  )
}
