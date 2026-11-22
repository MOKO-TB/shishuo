import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clock3,
  FileText,
  Headphones,
  ImagePlus,
  Loader2,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { useAuth } from '../auth'
import { prepareImage, uploadThreadImage } from '../lib/image'
import { errorMessage } from '../lib/ai'
import {
  clearFeedbackDraft,
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUS_META,
  feedbackCategoryLabel,
  fetchMyFeedbacks,
  readFeedbackDraft,
  submitFeedback,
  writeFeedbackDraft,
  type FeedbackCategory,
  type FeedbackItem,
} from '../lib/feedback'
import { getNativeAppInfo, isNativeApp, triggerHaptic } from '../lib/nativeShell'
import { formatRelative } from '../lib/utils'
import { usePhotoAccess } from './PhotoAccess'
import { Badge, EmptyState, Modal } from './ui'

interface FeedbackModalProps {
  open: boolean
  initialTab?: 'compose' | 'mine'
  currentView?: string
  onClose: () => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

const CATEGORY_ICON: Record<FeedbackCategory, typeof AlertTriangle> = {
  bug: AlertTriangle,
  suggestion: Pencil,
  ai: Sparkles,
  schedule: CalendarDays,
  report: ShieldCheck,
  account: Headphones,
}

export function FeedbackModal({
  open,
  initialTab = 'compose',
  currentView = '',
  onClose,
  notify,
}: FeedbackModalProps) {
  const { user } = useAuth()
  const { pickImages } = usePhotoAccess()
  const userId = user?.id ?? ''

  const [tab, setTab] = useState<'compose' | 'mine'>(initialTab)
  const [mineFilter, setMineFilter] = useState<'all' | 'open' | 'replied'>('all')
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const [consentChecked, setConsentChecked] = useState(true)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [screenshot, setScreenshot] = useState<{ url: string; name: string } | null>(null)
  const [uploadingShot, setUploadingShot] = useState(false)
  const [includeMeta, setIncludeMeta] = useState(true)
  const [appVersionText, setAppVersionText] = useState('')
  const [myItems, setMyItems] = useState<FeedbackItem[]>([])
  const [loadingMine, setLoadingMine] = useState(false)
  const shotInputRef = useRef<HTMLInputElement>(null)

  const loadMine = useCallback(async () => {
    if (!user) return
    setLoadingMine(true)
    try {
      const res = await fetchMyFeedbacks()
      setMyItems(res.items)
    } catch {
      // 忽略静默拉取失败，点进列表时再显式刷新。
    } finally {
      setLoadingMine(false)
    }
  }, [user])

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    const draft = readFeedbackDraft(userId)
    if (draft) {
      setCategory(draft.category)
      setContent(draft.content)
      setContact(draft.contact)
      setDraftRestored(true)
    } else {
      setDraftRestored(false)
    }
    void loadMine()
    if (isNativeApp()) {
      void getNativeAppInfo().then((info) => {
        if (info) setAppVersionText(`Android v${info.versionName} (${info.versionCode})`)
      })
    } else {
      setAppVersionText('Web 网页版')
    }
  }, [open, initialTab, userId, loadMine])

  useEffect(() => {
    if (!open || tab !== 'compose') return
    writeFeedbackDraft(userId, { category, content, contact })
  }, [open, tab, userId, category, content, contact])

  const activeCategory = useMemo(
    () => FEEDBACK_CATEGORIES.find((item) => item.key === category) ?? FEEDBACK_CATEGORIES[0],
    [category],
  )

  const repliedCount = useMemo(
    () => myItems.filter((item) => Boolean(item.adminReply)).length,
    [myItems],
  )
  const openCount = useMemo(
    () => myItems.filter((item) => item.status === 'pending' || item.status === 'reviewing').length,
    [myItems],
  )
  const filteredItems = useMemo(
    () =>
      myItems.filter((item) => {
        if (mineFilter === 'open') return item.status === 'pending' || item.status === 'reviewing'
        if (mineFilter === 'replied') return Boolean(item.adminReply) || item.status === 'resolved'
        return true
      }),
    [mineFilter, myItems],
  )

  const handleClearDraft = () => {
    clearFeedbackDraft(userId)
    setContent('')
    setContact('')
    setScreenshot(null)
    setDraftRestored(false)
    notify('已清空本地未提交草稿', 'info')
  }

  const uploadShotFile = async (file: File) => {
    setUploadingShot(true)
    try {
      const prepared = await prepareImage(file)
      const uploaded = await uploadThreadImage(prepared)
      if (uploaded.url) {
        setScreenshot({ url: uploaded.url, name: uploaded.name || file.name })
      }
    } catch (error) {
      notify(errorMessage(error), 'danger')
    } finally {
      setUploadingShot(false)
    }
  }

  const chooseScreenshot = async () => {
    if (uploadingShot || submitting) return
    const result = await pickImages({ multiple: false })
    if (result === 'fallback') {
      shotInputRef.current?.click()
      return
    }
    if (result?.length) await uploadShotFile(result[0])
  }

  const handleShotInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await uploadShotFile(file)
  }

  const handleSubmit = async () => {
    const trimmed = content.trim()
    if (!trimmed) {
      notify('请先填写问题描述', 'info')
      return
    }
    if (!consentChecked) {
      notify('请先勾选确认提交说明', 'info')
      return
    }
    setSubmitting(true)
    triggerHaptic('medium')
    try {
      const clientMeta = includeMeta
        ? {
            platform: isNativeApp() ? 'android' : 'web',
            appVersion: appVersionText || (isNativeApp() ? 'Android' : 'Web'),
            view: currentView || 'unknown',
            viewport: `${window.innerWidth}x${window.innerHeight}`,
          }
        : undefined
      const res = await submitFeedback({
        category,
        content: trimmed,
        contact: contact.trim(),
        screenshotUrl: screenshot?.url,
        clientMeta,
      })
      clearFeedbackDraft(userId)
      setContent('')
      setContact('')
      setScreenshot(null)
      setDraftRestored(false)
      setMyItems((prev) => [res.feedback, ...prev])
      setTab('mine')
      notify('反馈已提交给平台管理员，你可以在「我的反馈」查看进度')
    } catch (error) {
      notify(errorMessage(error), 'danger')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="反馈"
      title={tab === 'mine' ? '我的反馈' : '意见反馈'}
      size="md"
    >
      <div className="fb-shell">
        {tab === 'compose' ? (
          <>
            {draftRestored && (
              <div className="fb-draft-banner">
                <div className="fb-draft-banner-copy">
                  <Clock3 size={15} />
                  <span>已恢复上次未提交的内容。</span>
                </div>
                <button type="button" className="fb-draft-clear" onClick={handleClearDraft}>
                  清空
                </button>
              </div>
            )}

            <div className="fb-compose-top">
              <button
                type="button"
                className="fb-mine-link"
                onClick={() => {
                  setTab('mine')
                  void loadMine()
                }}
              >
                <FileText size={14} />
                我的反馈
                {myItems.length > 0 && <span className="fb-count">{myItems.length}</span>}
              </button>
            </div>

            <section className="fb-card fb-compose-card">
              <div className="fb-type-grid" role="radiogroup" aria-label="反馈类型">
                {FEEDBACK_CATEGORIES.map((item) => {
                  const Icon = CATEGORY_ICON[item.key]
                  const active = category === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`fb-type-chip ${active ? 'is-active' : ''}`}
                      onClick={() => setCategory(item.key)}
                    >
                      <Icon size={14} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>

              <div className="fb-textarea-box">
                <textarea
                  className="fb-textarea"
                  maxLength={500}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder={activeCategory.placeholder}
                />
                <div className="fb-textarea-foot">
                  <span>{activeCategory.label}</span>
                  <span>{content.length} / 500</span>
                </div>
              </div>

              <div className="fb-extra-bar">
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => void chooseScreenshot()}
                  disabled={uploadingShot || submitting}
                >
                  {uploadingShot ? (
                    <Loader2 size={14} className="spin-icon" />
                  ) : (
                    <ImagePlus size={14} />
                  )}
                  {uploadingShot ? '上传中…' : screenshot ? '更换截图' : '附带截图'}
                </button>
                <label className="fb-meta-tag">
                  <input
                    type="checkbox"
                    checked={includeMeta}
                    onChange={(event) => setIncludeMeta(event.target.checked)}
                  />
                  附带环境
                </label>
                <input
                  ref={shotInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleShotInput}
                  hidden
                />
              </div>

              {screenshot && (
                <div className="fb-shot-preview">
                  <img src={screenshot.url} alt="反馈截图预览" />
                  <span>{screenshot.name}</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setScreenshot(null)}
                    aria-label="移除截图"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              <details className="fb-more">
                <summary>补充联系方式（选填）</summary>
                <div className="fb-contact-box">
                  <Headphones size={15} />
                  <input
                    className="fb-contact-input"
                    maxLength={100}
                    value={contact}
                    onChange={(event) => setContact(event.target.value)}
                    placeholder={
                      user?.email ? `留空默认使用 ${user.email}` : '微信号 / 手机号 / 邮箱'
                    }
                  />
                </div>
              </details>

              <label className="fb-consent">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(event) => setConsentChecked(event.target.checked)}
                />
                <span>
                  提交即表示同意为处理本次反馈使用上述信息，详见
                  <button
                    type="button"
                    className="fb-privacy-link"
                    onClick={(event) => {
                      event.preventDefault()
                      setPrivacyOpen((prev) => !prev)
                    }}
                  >
                    《隐私说明》
                  </button>
                </span>
              </label>

              {privacyOpen && (
                <div className="fb-privacy-box">
                  反馈正文、截图、可选联系方式及设备环境仅保存在师说平台服务端，仅限本人与管理员查看，用于定位问题和联系核实。
                </div>
              )}

              <button
                type="button"
                className="button button-primary fb-submit"
                disabled={!content.trim() || !consentChecked || submitting || uploadingShot}
                onClick={() => void handleSubmit()}
              >
                {submitting ? <Loader2 size={16} className="spin-icon" /> : <Send size={15} />}
                {submitting ? '正在提交…' : '提交反馈'}
              </button>
            </section>
          </>
        ) : (
          <>
            <div className="fb-mine-top">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setTab('compose')}
              >
                <ArrowLeft size={15} />
                返回填写反馈
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => void loadMine()}
                disabled={loadingMine}
              >
                {loadingMine ? '刷新中…' : '刷新进度'}
              </button>
            </div>

            {myItems.length > 0 && (
              <div className="fb-filter-row" role="group" aria-label="我的反馈筛选">
                {(
                  [
                    ['all', '全部', myItems.length],
                    ['open', '处理中', openCount],
                    ['replied', '已回复', repliedCount],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    className={mineFilter === key ? 'is-active' : ''}
                    onClick={() => setMineFilter(key)}
                  >
                    {label}
                    <span>{count}</span>
                  </button>
                ))}
              </div>
            )}

            {loadingMine && myItems.length === 0 ? (
              <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                正在读取我的反馈…
              </div>
            ) : myItems.length === 0 ? (
              <EmptyState
                icon={<FileText size={20} />}
                title="还没有提交过反馈"
                description="遇到任何问题或有改进建议，都可以随时写给我们。"
                action={
                  <button className="button button-primary" onClick={() => setTab('compose')}>
                    去写一条反馈
                  </button>
                }
              />
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon={<FileText size={20} />}
                title="当前筛选下没有反馈"
                description="切换到「全部」看看其他记录。"
                action={
                  <button className="text-button" onClick={() => setMineFilter('all')}>
                    查看全部
                  </button>
                }
              />
            ) : (
              <div className="fb-list">
                {filteredItems.map((item) => {
                  const statusMeta = FEEDBACK_STATUS_META[item.status] ?? FEEDBACK_STATUS_META.pending
                  const stage =
                    item.status === 'resolved'
                      ? 3
                      : item.status === 'pending'
                        ? 1
                        : 2
                  return (
                    <article className="fb-item" key={item.id}>
                      <div className="fb-item-head">
                        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                        <span className="fb-item-cat">{feedbackCategoryLabel(item.category)}</span>
                        <span className="fb-item-time">{formatRelative(item.createdAt)}</span>
                      </div>
                      <div className={`fb-progress is-stage-${stage}`} aria-label="处理进度">
                        <span>已提交</span>
                        <i />
                        <span>处理中</span>
                        <i />
                        <span>{item.status === 'closed' ? '已关闭' : '已回复'}</span>
                      </div>
                      <p className="fb-item-content">{item.content}</p>
                      {item.screenshotUrl && (
                        <a href={item.screenshotUrl} target="_blank" rel="noreferrer">
                          <img
                            className="fb-item-shot"
                            src={item.screenshotUrl}
                            alt="我上传的反馈截图"
                          />
                        </a>
                      )}
                      <div className="fb-item-meta">
                        {item.clientMeta?.appVersion && <span>环境：{item.clientMeta.appVersion}</span>}
                        {item.contact && <span>联系方式：{item.contact}</span>}
                      </div>
                      {item.adminReply && (
                        <div className="fb-reply-box">
                          <div className="fb-reply-head">
                            <span>管理员回复{item.repliedBy ? ` · ${item.repliedBy}` : ''}</span>
                            {item.repliedAt && <span>{formatRelative(item.repliedAt)}</span>}
                          </div>
                          <p>{item.adminReply}</p>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
