import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import {
  BookOpen,
  FileText,
  ImagePlus,
  Link2,
  Loader2,
  Paperclip,
  Pencil,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { allCourses, courseById, isSeededCourse, teacherByName } from '../data/seed'
import { isPilotCourse } from '../data/pilot'
import type { Faq, FaqAttachment, FaqPrefill, Role } from '../types'
import {
  confidenceLabel,
  copyText,
  displayStudentName,
  feedbackReasonLabel,
  formatRelative,
  makeId,
  percent,
  shareLink,
  truncate,
} from '../lib/utils'
import { errorMessage, suggestFaqMeta, type FaqMetaSuggestion } from '../lib/ai'
import {
  ASK_IMAGE_ACCEPT,
  FAQ_FILE_ACCEPT,
  formatFileSize,
  prepareFaqAttachment,
} from '../lib/attachment'
import { Badge, Modal, RichText, Seal } from './ui'
import { FaqAttachments } from './FaqAttachments'
import { useAttachmentConsent } from './AttachmentConsent'
import { usePhotoAccess } from './PhotoAccess'
import { isNativeApp } from '../lib/nativeShell'

export interface FaqModalState {
  mode: 'view' | 'edit' | 'create'
  faqId?: string
  prefill?: FaqPrefill
}

interface FaqModalProps {
  state: FaqModalState | null
  role: Role
  teacherName: string
  onClose: () => void
  onEdit: (faqId: string) => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

interface FaqForm {
  courseId: string
  question: string
  answer: string
  tags: string
  aliases: string
  chapter: string
}

const emptyForm: FaqForm = {
  courseId: 'ds',
  question: '',
  answer: '',
  tags: '',
  aliases: '',
  chapter: '',
}

const MAX_FAQ_ATTACHMENTS = 6

function normalizeAliasText(value: string) {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

export function FaqModal({
  state,
  role,
  teacherName,
  onClose,
  onEdit,
  notify,
}: FaqModalProps) {
  const { data, dispatch } = useStore()
  const { requestConsent } = useAttachmentConsent()
  const { pickImages } = usePhotoAccess()
  const faq = state?.faqId ? data.faqs.find((item) => item.id === state.faqId) : undefined
  const [form, setForm] = useState<FaqForm>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [restoreArm, setRestoreArm] = useState<number | null>(null)
  const [aiSuggest, setAiSuggest] = useState<FaqMetaSuggestion | null>(null)
  const [aiSuggestBusy, setAiSuggestBusy] = useState(false)
  const [aiSuggestError, setAiSuggestError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<FaqAttachment[]>([])
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [attachmentDrag, setAttachmentDrag] = useState(false)
  const attachmentBusyRef = useRef(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const teacher = teacherByName(teacherName)
  const inPilot = (courseId: string) => isPilotCourse(courseId) || !isSeededCourse(courseId)
  const editableCourses =
    role === 'teacher'
      ? allCourses().filter((course) => teacher.courses.includes(course.id) && inPilot(course.id))
      : allCourses().filter((course) => inPilot(course.id))
  const defaultCreateCourseId = editableCourses[0]?.id ?? 'ds'

  useEffect(() => {
    if (!state) return
    setError(null)
    setConfirmDelete(false)
    setRestoreArm(null)
    setAiSuggest(null)
    setAiSuggestError(null)
    setAttachments([])
    setAttachmentBusy(false)
    setAttachmentError(null)
    setAttachmentDrag(false)
    if (state.mode === 'create') {
      setForm(
        state.prefill
          ? {
              courseId: state.prefill.courseId,
              question: state.prefill.question,
              answer: state.prefill.answer,
              tags: state.prefill.tags.join('，'),
              aliases: '',
              chapter: state.prefill.chapter ?? '',
            }
          : { ...emptyForm, courseId: defaultCreateCourseId },
      )
      return
    }
    if (faq) {
      setForm({
        courseId: faq.courseId,
        question: faq.question,
        answer: faq.answer,
        tags: faq.tags.join('，'),
        aliases: faq.aliases.join('，'),
        chapter: faq.chapter ?? '',
      })
      setAttachments(faq.attachments ?? [])
    }
  }, [state?.mode, state?.faqId, state?.prefill?.question, defaultCreateCourseId, faq?.id, faq?.updatedAt])

  if (!state) return null

  const isForm = state.mode === 'create' || state.mode === 'edit'
  const canEdit =
    role === 'teacher' && (!faq || teacher.courses.includes(faq.courseId))
  const course = faq ? courseById(faq.courseId) : courseById(form.courseId)
  const totalVotes = faq ? faq.helpful + faq.unhelpful : 0

  const parseTags = (value: string) =>
    Array.from(
      new Set(
        value
          .split(/[,，、\s]+/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ).slice(0, 8)

  // Aliases keep inner spaces: "dp 数组怎么定义" is one search phrase, not two tags.
  const parseAliases = (value: string) =>
    Array.from(
      new Set(
        value
          .split(/[,，、\n]+/)
          .map((alias) => alias.trim())
          .filter(Boolean),
      ),
    ).slice(0, 12)

  const aliasCandidates = faq
    ? (() => {
        const existing = new Set(
          [faq.question, ...faq.aliases, ...parseAliases(form.aliases)].map(normalizeAliasText),
        )
        const seen = new Set<string>()
        return data.threads
          .filter(
            (thread) =>
              thread.courseId === faq.courseId &&
              !thread.student.anonymous &&
              !thread.escalation?.anonymous &&
              ((thread.sources ?? []).includes(faq.id) || thread.closestSource === faq.id),
          )
          .map((thread) => thread.question.trim())
          .filter((question) => question.length >= 3 && question.length <= 80)
          .filter((question) => {
            const key = normalizeAliasText(question)
            if (!key || existing.has(key) || seen.has(key)) return false
            seen.add(key)
            return true
          })
          .slice(0, 6)
      })()
    : []

  const reviewSignals = faq
    ? data.threads
        .filter(
          (thread) =>
            thread.courseId === faq.courseId &&
            thread.feedback === 'unhelpful' &&
            (thread.sources ?? []).includes(faq.id),
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 4)
    : []
  const citationThreads = faq
    ? data.threads
        .filter(
          (thread) =>
            thread.courseId === faq.courseId &&
            (thread.sources ?? []).includes(faq.id),
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10)
    : []

  const addAlias = (text: string) => {
    const aliases = parseAliases(form.aliases)
    const key = normalizeAliasText(text)
    if (!key || aliases.some((alias) => normalizeAliasText(alias) === key)) return
    if (aliases.length >= 12) {
      notify('检索别名最多 12 条，先删掉一条再加', 'info')
      return
    }
    setForm({ ...form, aliases: [...aliases, text].join('，') })
  }

  const addTag = (tag: string) => {
    const tags = parseTags(form.tags)
    if (tags.includes(tag)) return
    if (tags.length >= 8) {
      notify('标签最多 8 个，先删掉一个再加', 'info')
      return
    }
    setForm({ ...form, tags: [...tags, tag].join('，') })
  }

  const addAttachments = async (files: File[], options?: { skipConsent?: boolean }) => {
    if (attachmentBusyRef.current || files.length === 0) return
    const room = MAX_FAQ_ATTACHMENTS - attachments.length
    if (room <= 0) {
      setAttachmentError(`最多附 ${MAX_FAQ_ATTACHMENTS} 个文件，先删掉一个再加。`)
      return
    }
    const selected = files.slice(0, room)
    if (!options?.skipConsent) {
      const consent = await requestConsent({
        scene: 'teacher-faq',
        kind: selected.every((file) => file.type.startsWith('image/')) ? 'image' : 'file',
        fileNames: selected.map((file) => file.name),
        totalBytes: selected.reduce((sum, file) => sum + file.size, 0),
      })
      if (!consent) return
    }
    attachmentBusyRef.current = true
    setAttachmentBusy(true)
    setAttachmentError(
      files.length > room ? `最多附 ${MAX_FAQ_ATTACHMENTS} 个文件，这次只处理前 ${room} 个。` : null,
    )
    const accepted: FaqAttachment[] = []
    const failed: string[] = []
    try {
      for (const file of selected) {
        try {
          accepted.push(await prepareFaqAttachment(file))
        } catch (err) {
          failed.push(`${file.name}：${errorMessage(err)}`)
        }
      }
    } finally {
      attachmentBusyRef.current = false
      setAttachmentBusy(false)
    }
    if (accepted.length > 0) {
      setAttachments((current) =>
        [...current, ...accepted].slice(0, MAX_FAQ_ATTACHMENTS),
      )
    }
    if (failed.length > 0) setAttachmentError(failed.join('；'))
  }

  const handleAttachmentInput = (
    event: ChangeEvent<HTMLInputElement>,
    options?: { skipConsent?: boolean },
  ) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length > 0) void addAttachments(files, options)
  }

  const chooseFaqImages = async () => {
    if (attachmentBusyRef.current || attachmentBusy) return
    const result = await pickImages({ multiple: true })
    if (result === 'fallback') {
      imageInputRef.current?.click()
      return
    }
    if (result?.length) await addAttachments(result, { skipConsent: true })
  }

  const handleAttachmentDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setAttachmentDrag(false)
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length > 0) void addAttachments(files)
  }

  const handleAnswerPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    )
    if (files.length === 0) return
    event.preventDefault()
    void addAttachments(files)
  }

  const removeAttachment = (index: number) => {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setAttachmentError(null)
  }

  const runAiSuggest = async () => {
    if (aiSuggestBusy) return
    setAiSuggestBusy(true)
    setAiSuggestError(null)
    try {
      const suggestion = await suggestFaqMeta({
        question: form.question.trim(),
        answer: form.answer.trim(),
        tags: form.tags,
      })
      setAiSuggest(suggestion)
      if (suggestion.aliases.length === 0 && suggestion.tags.length === 0) {
        setAiSuggestError('模型没有给出可用建议，可以补全问题和回答后再试。')
      }
    } catch (err) {
      setAiSuggestError(errorMessage(err))
    } finally {
      setAiSuggestBusy(false)
    }
  }

  const save = () => {
    const question = form.question.trim()
    const answer = form.answer.trim()
    if (attachmentBusy) {
      setError('图片或文件还在上传，请稍候再保存。')
      return
    }
    if (!question || !answer) {
      setError('问题和答案都不能为空。')
      return
    }
    if (answer.includes('【AI 草稿') || answer.includes('请补完后再保存')) {
      setError('先把 AI 草稿补完整，去掉草稿标记后再保存。')
      return
    }
    setError(null)
    const now = Date.now()
    if (state.mode === 'create') {
      const created: Faq = {
        id: makeId('faq'),
        courseId: form.courseId,
        question,
        aliases: parseAliases(form.aliases),
        answer,
        tags: parseTags(form.tags),
        author: courseById(form.courseId).teacher,
        source: 'teacher',
        createdAt: now,
        updatedAt: now,
        citations: 0,
        helpful: 0,
        unhelpful: 0,
        recentUnhelpful: 0,
        chapter: form.chapter.trim() || undefined,
        ...(attachments.length > 0 ? { attachments } : {}),
      }
      dispatch({ type: 'faq-added', faq: created })
      notify('已加入课程知识库，AI 下一次就能引用')
      onClose()
      return
    }
    if (state.mode === 'edit' && state.faqId) {
      dispatch({
        type: 'faq-updated',
        faqId: state.faqId,
        patch: {
          courseId: form.courseId,
          question,
          answer,
          tags: parseTags(form.tags),
          aliases: parseAliases(form.aliases),
          chapter: form.chapter.trim() || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
          reviewNeeded: false,
          reviewNote: undefined,
        },
      })
      notify('FAQ 已更新，AI 会使用新版本作答')
      onClose()
    }
  }

  const remove = () => {
    if (!faq) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    dispatch({ type: 'faq-removed', faqId: faq.id })
    setConfirmDelete(false)
    notify(`已删除这条知识，AI 不会再引用「${faq.question.slice(0, 14)}」`, 'info')
    onClose()
  }

  const restoreVersion = (versionIndex: number) => {
    if (!faq) return
    if (restoreArm !== versionIndex) {
      setRestoreArm(versionIndex)
      return
    }
    const version = faq.history?.[versionIndex]
    if (!version) return
    dispatch({
      type: 'faq-updated',
      faqId: faq.id,
      patch: {
        question: version.question,
        answer: version.answer,
        tags: version.tags,
        aliases: version.aliases,
        chapter: version.chapter,
        attachments: version.attachments,
        reviewNeeded: false,
        reviewNote: undefined,
      },
    })
    notify('已恢复到该历史版本；当前版本会留在历史里', 'success')
    onClose()
  }

  const title =
    state.mode === 'create' ? '新增课程 FAQ' : state.mode === 'edit' ? '编辑 FAQ' : '知识详情'

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      eyebrow={
        isForm
          ? state.prefill
            ? 'AI 生成草稿 · 教师确认'
            : '教师编写'
          : `${course.name} · ${course.code}`
      }
      size="lg"
      footer={
        isForm ? (
          <div className="modal-actions">
            <button className="button button-ghost" onClick={onClose}>
              取消
            </button>
            <button className="button button-primary" onClick={save}>
              <Save size={16} />
              保存到知识库
            </button>
          </div>
        ) : (
          <div className="modal-actions modal-actions-split">
            <span className="modal-foot-note">
              {confirmDelete
                ? '删除后 AI 不再引用这条知识，已有的提问记录保留。'
                : '答案会带着出处出现在 AI 回答下方。'}
            </span>
            <div className="modal-actions-right">
              {faq && (
                <button
                  className="button button-ghost"
                  onClick={async () => {
                    const copied = await copyText(shareLink('faq', faq.id))
                    notify(
                      copied ? '链接已复制，可以发给同学或老师' : '复制失败，请手动复制地址栏链接',
                      copied ? 'success' : 'info',
                    )
                  }}
                >
                  <Link2 size={15} />
                  复制链接
                </button>
              )}
              {canEdit && faq && (
                <button
                  className={`button ${confirmDelete ? 'button-danger' : 'button-ghost'}`}
                  onClick={remove}
                >
                  <Trash2 size={15} />
                  {confirmDelete ? '确认删除' : '删除'}
                </button>
              )}
              {canEdit && faq && (
                <button className="button button-ghost" onClick={() => onEdit(faq.id)}>
                  <Pencil size={15} />
                  编辑这条知识
                </button>
              )}
              <button className="button button-primary" onClick={onClose}>
                知道了
              </button>
            </div>
          </div>
        )
      }
    >
      {isForm ? (
        <div className="faq-form" onChange={() => error && setError(null)}>
          {state.prefill && (
            <div className="inline-note warning">
              AI 已根据知识缺口生成草稿。请补完「还需要补充」里的内容，并删除草稿标记后再保存。
            </div>
          )}
          {error && <div className="inline-note danger">{error}</div>}
          <label className="field">
            <span className="field-label">所属课程</span>
            <select
              className="input"
              value={form.courseId}
              onChange={(event) => setForm({ ...form, courseId: event.target.value })}
            >
              {editableCourses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.teacher}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">学生可能会怎么问</span>
            <input
              className="input"
              value={form.question}
              onChange={(event) => setForm({ ...form, question: event.target.value })}
              placeholder="例如：动态规划的状态转移方程怎么找？"
            />
          </label>
          <label className="field">
            <span className="field-label">老师的回答</span>
            <textarea
              className="input textarea faq-answer-input"
              value={form.answer}
              onChange={(event) => setForm({ ...form, answer: event.target.value })}
              onPaste={handleAnswerPaste}
              placeholder="写清楚适用条件、关键步骤和常见误区。支持换行、• 列表和 **加粗**；也可以直接粘贴截图。"
            />
            <span className="field-hint">{form.answer.length} 字 · 答案会直接作为 AI 的作答依据</span>
          </label>
          <div className="field faq-attachment-field">
            <span className="field-label">图片与文件（可选）</span>
            <div
              className={`faq-attachment-drop ${attachmentDrag ? 'is-over' : ''}`}
              onDragOver={(event) => {
                event.preventDefault()
                setAttachmentDrag(true)
              }}
              onDragLeave={() => setAttachmentDrag(false)}
              onDrop={handleAttachmentDrop}
            >
              <div className="faq-attachment-actions">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept={ASK_IMAGE_ACCEPT}
                  multiple
                  hidden
                  onChange={(event) =>
                    handleAttachmentInput(event, { skipConsent: isNativeApp() })
                  }
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FAQ_FILE_ACCEPT}
                  multiple
                  hidden
                  onChange={handleAttachmentInput}
                />
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => void chooseFaqImages()}
                  disabled={attachmentBusy}
                >
                  {attachmentBusy ? (
                    <Loader2 size={15} className="spin-icon" />
                  ) : (
                    <ImagePlus size={15} />
                  )}
                  添加图片
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachmentBusy}
                >
                  <Paperclip size={15} />
                  添加文件
                </button>
                <span className="field-hint">
                  {attachmentBusy
                    ? '正在解析并上传，请稍候…'
                    : `也可以拖拽到这里，最多 ${MAX_FAQ_ATTACHMENTS} 个`}
                </span>
              </div>
              {attachments.length > 0 && (
                <div className="faq-attachment-edit-list">
                  {attachments.map((attachment, index) => (
                    <div className="faq-attachment-edit-item" key={`${attachment.url}-${index}`}>
                      {attachment.kind === 'image' ? (
                        <img src={attachment.url} alt={attachment.name} />
                      ) : (
                        <span className="faq-attachment-edit-icon">
                          <FileText size={18} />
                        </span>
                      )}
                      <span className="faq-attachment-edit-copy">
                        <strong>{attachment.name}</strong>
                        <em>
                          {[
                            attachment.kind === 'image' ? '图片' : '文件',
                            formatFileSize(attachment.size),
                            attachment.text ? '已提取正文' : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </em>
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => removeAttachment(index)}
                        aria-label={`移除 ${attachment.name}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span className="field-hint faq-attachment-hint">
              图片会直接展示在答案下方；PDF、Word、PPT 等文件可下载，能读出的正文也会作为 AI
              的作答依据。
            </span>
            {attachmentError && (
              <span className="field-hint faq-attachment-error">{attachmentError}</span>
            )}
          </div>
          <label className="field">
            <span className="field-label">标签（用逗号分隔）</span>
            <input
              className="input"
              value={form.tags}
              onChange={(event) => setForm({ ...form, tags: event.target.value })}
              placeholder="动态规划，状态转移，DP"
            />
          </label>
          <label className="field">
            <span className="field-label">检索别名（学生可能的其他问法，用逗号分隔）</span>
            <input
              className="input"
              value={form.aliases}
              onChange={(event) => setForm({ ...form, aliases: event.target.value })}
              placeholder="dp 数组怎么定义，状态怎么设计，动态规划不会做"
            />
            <span className="field-hint">
              别名在 AI 检索里权重最高。答不准同一类问题时，把学生的原话补到这里。
            </span>
            {state.mode === 'edit' && faq && aliasCandidates.length > 0 && (
              <div className="faq-candidate-block">
                <span className="field-label">来自学生原话的候选别名</span>
                <div className="faq-candidate-list">
                  {aliasCandidates.map((question) => (
                    <button
                      key={question}
                      type="button"
                      className="faq-candidate-chip"
                      onClick={() => addAlias(question)}
                    >
                      + {truncate(question, 34)}
                    </button>
                  ))}
                </div>
                <span className="field-hint">
                  只从本课程实名同学的提问里提取；点一下加入，AI 下次更容易命中。
                </span>
              </div>
            )}
          </label>
          {isForm && (
            <div className="faq-ai-suggest">
              <button
                type="button"
                className="button button-ghost faq-ai-suggest-trigger"
                onClick={runAiSuggest}
                disabled={aiSuggestBusy || !form.question.trim()}
              >
                {aiSuggestBusy ? (
                  <Loader2 size={14} className="spin-icon" />
                ) : (
                  <Sparkles size={14} />
                )}
                {aiSuggestBusy ? 'AI 生成中…' : 'AI 建议别名与标签'}
              </button>
              {aiSuggestError && (
                <span className="field-hint faq-ai-suggest-error">{aiSuggestError}</span>
              )}
              {aiSuggest && !aiSuggestBusy && aiSuggest.aliases.length + aiSuggest.tags.length > 0 && (
                <div className="faq-candidate-block">
                  {aiSuggest.aliases.length > 0 && (
                    <>
                      <span className="field-label">AI 建议别名（点一下加入）</span>
                      <div className="faq-candidate-list">
                        {aiSuggest.aliases.map((alias) => (
                          <button
                            key={alias}
                            type="button"
                            className="faq-candidate-chip"
                            onClick={() => addAlias(alias)}
                          >
                            + {truncate(alias, 22)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {aiSuggest.tags.length > 0 && (
                    <>
                      <span className="field-label">AI 建议标签（点一下加入）</span>
                      <div className="faq-candidate-list">
                        {aiSuggest.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="faq-candidate-chip"
                            onClick={() => addTag(tag)}
                          >
                            + {tag}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {state.mode === 'edit' && faq && (reviewSignals.length > 0 || faq.reviewNeeded) && (
            <div className="inline-note warning faq-review-signals">
              <strong>近期触发这条 FAQ 的问题</strong>
              {reviewSignals.length > 0 ? (
                <ul>
                  {reviewSignals.map((thread) => (
                    <li key={thread.id}>
                      <span>{truncate(thread.question, 56)}</span>
                      <em>
                        {thread.student.anonymous || thread.escalation?.anonymous
                          ? '匿名同学'
                          : thread.student.name}
                        {' · '}
                        {formatRelative(thread.createdAt)}
                        {thread.feedbackReason
                          ? ` · ${feedbackReasonLabel(thread.feedbackReason)}`
                          : ''}
                      </em>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{faq.reviewNote ?? '近期有同学反馈这条答案不够清楚，建议补充例子或边界条件。'}</p>
              )}
            </div>
          )}
          <label className="field">
            <span className="field-label">章节（可选）</span>
            <input
              className="input"
              value={form.chapter}
              onChange={(event) => setForm({ ...form, chapter: event.target.value })}
              placeholder="第 6 章 · 动态规划"
            />
          </label>
          {state.mode === 'edit' && faq && faq.history && faq.history.length > 0 && (
            <div className="faq-history">
              <div className="faq-history-head">
                <strong>历史版本</strong>
                <span>保留最近 {faq.history.length} 次修改</span>
              </div>
              {faq.history.map((version, index) => (
                <div className="faq-history-row" key={`${version.updatedAt}-${index}`}>
                  <div>
                    <strong>{formatRelative(version.updatedAt)}</strong>
                    <em>{version.author} · {version.question}</em>
                  </div>
                  <p>{truncate(version.answer, 90)}</p>
                  <button
                    type="button"
                    className={`text-button faq-history-restore ${restoreArm === index ? 'is-armed' : ''}`}
                    onClick={() => restoreVersion(index)}
                  >
                    {restoreArm === index ? '再点一次确认恢复' : '恢复此版本'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {state.mode === 'edit' && faq?.reviewNeeded && (
            <div className="inline-note warning">
              保存后会清除“待完善”标记，并重新以高置信度参与 AI 回答。
            </div>
          )}
        </div>
      ) : faq ? (
        <article className="faq-detail">
          <div className="faq-detail-meta">
            <Badge tone={faq.courseId === 'ds' ? 'jade' : faq.courseId === 'math' ? 'clay' : faq.courseId === 'net' ? 'blue' : 'gold'}>
              {course.shortName}
            </Badge>
            <Badge tone={faq.source === 'sediment' ? 'clay' : 'neutral'} dot>
              {faq.source === 'sediment' ? '答疑沉淀' : '老师编写'}
            </Badge>
            {faq.reviewNeeded && <Badge tone="medium" dot>待完善</Badge>}
            {faq.source === 'sediment' && <Seal className="seal-small">已沉淀</Seal>}
            <span className="faq-detail-time">更新于 {formatRelative(faq.updatedAt)}</span>
          </div>

          <h3 className="faq-detail-question">{faq.question}</h3>
          {faq.reviewNeeded && (
            <div className="inline-note warning">
              {faq.reviewNote ?? '近期有同学反馈这条答案不够清楚，AI 已自动降低它的置信度。'}
            </div>
          )}
          <RichText text={faq.answer} className="faq-detail-answer" />
          <FaqAttachments attachments={faq.attachments} caption="老师附带的图片与资料" />

          <div className="tag-row">
            {faq.tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>

          {faq.chapter && (
            <div className="faq-detail-chapter">
              <BookOpen size={13} />
              <span>{faq.chapter}</span>
            </div>
          )}

          {faq.aliases.length > 0 && (
            <div className="faq-detail-aliases">
              <span className="faq-detail-aliases-label">
                AI 还会用这些问法匹配到它（检索权重最高）
              </span>
              <div className="tag-row">
                {faq.aliases.map((alias) => (
                  <span className="tag is-alias" key={alias}>
                    {alias}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="faq-detail-stats">
            <div>
              <strong>{faq.citations}</strong>
              <span>次被 AI 引用</span>
            </div>
            <div>
              <strong>{totalVotes === 0 ? '—' : percent(faq.helpful / totalVotes)}</strong>
              <span>同学觉得有帮助</span>
            </div>
            <div>
              <strong>{faq.author}</strong>
              <span>最后由老师维护</span>
            </div>
          </div>

          {role === 'teacher' && citationThreads.length > 0 && (
            <section className="faq-citation-trace">
              <div className="faq-citation-head">
                <strong>最近引用过这条答案的问题</strong>
                <span>共 {faq.citations} 次引用 · 显示最近 {citationThreads.length} 条</span>
              </div>
              <div className="faq-citation-list">
                {citationThreads.map((thread) => (
                  <div className="faq-citation-row" key={thread.id}>
                    <div>
                      <strong>{truncate(thread.question, 58)}</strong>
                      <span>
                        {displayStudentName(thread, true)} ·{' '}
                        {formatRelative(thread.createdAt)} ·{' '}
                        {confidenceLabel(thread.confidence)}
                      </span>
                    </div>
                    <div className="faq-citation-flags">
                      {thread.feedback === 'helpful' && <Badge tone="jade">有帮助</Badge>}
                      {thread.feedback === 'unhelpful' && (
                        <Badge tone="danger">
                          不够清楚
                          {thread.feedbackReason
                            ? ` · ${feedbackReasonLabel(thread.feedbackReason)}`
                            : ''}
                        </Badge>
                      )}
                      {thread.resolvedAt && <Badge tone="high">已解决</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </article>
      ) : (
        <div className="empty-state">
          <h3>这条知识已经不在了</h3>
          <p>演示数据可能刚刚被重置。</p>
        </div>
      )}
    </Modal>
  )
}
