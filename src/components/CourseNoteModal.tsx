import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  CalendarClock,
  FileText,
  ImagePlus,
  Loader2,
  Megaphone,
  Save,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import type { Course, CourseNote, FaqAttachment } from '../types'
import {
  ASK_IMAGE_ACCEPT,
  FAQ_FILE_ACCEPT,
  formatFileSize,
  prepareFaqAttachment,
} from '../lib/attachment'
import { dateInputValue, parseDateInput } from '../lib/profile'
import { errorMessage } from '../lib/ai'
import { Modal } from './ui'
import { useAttachmentConsent } from './AttachmentConsent'

const MAX_NOTE_ATTACHMENTS = 6

export function CourseNoteModal({
  open,
  onClose,
  courses,
  notes,
  initialCourseId,
  prefillAnnouncement,
  notify,
}: {
  open: boolean
  onClose: () => void
  courses: Course[]
  notes: CourseNote[]
  initialCourseId?: string
  prefillAnnouncement?: { courseId: string; text: string; key: number } | null
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}) {
  const { dispatch } = useStore()
  const { requestConsent } = useAttachmentConsent()
  const [courseId, setCourseId] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [officeHours, setOfficeHours] = useState('')
  const [currentChapter, setCurrentChapter] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [attachments, setAttachments] = useState<FaqAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || courses.length === 0) return
    const targetCourse = prefillAnnouncement?.courseId || initialCourseId
    const preferred = courses.some((course) => course.id === targetCourse)
      ? (targetCourse as string)
      : courses[0].id
    setCourseId(preferred)
    const note = notes.find((item) => item.courseId === preferred)
    const existing = note?.announcement ?? ''
    if (prefillAnnouncement && prefillAnnouncement.courseId === preferred) {
      setAnnouncement(
        existing.trim()
          ? `${prefillAnnouncement.text}\n\n---\n${existing.trim()}`
          : prefillAnnouncement.text,
      )
    } else {
      setAnnouncement(existing)
    }
    setOfficeHours(note?.officeHours ?? '')
    setCurrentChapter(note?.currentChapter ?? '')
    setExpiresAt(note?.expiresAt ? dateInputValue(note.expiresAt) : '')
    setAttachments(note?.attachments ?? [])
    setUploadError(null)
    // Reset only when the dialog opens or the default course changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCourseId, prefillAnnouncement?.key])

  const changeCourse = (nextId: string) => {
    setCourseId(nextId)
    const note = notes.find((item) => item.courseId === nextId)
    setAnnouncement(note?.announcement ?? '')
    setOfficeHours(note?.officeHours ?? '')
    setCurrentChapter(note?.currentChapter ?? '')
    setExpiresAt(note?.expiresAt ? dateInputValue(note.expiresAt) : '')
    setAttachments(note?.attachments ?? [])
    setUploadError(null)
  }

  const addAttachments = async (files: File[]) => {
    if (uploading || files.length === 0) return
    const room = MAX_NOTE_ATTACHMENTS - attachments.length
    if (room <= 0) {
      setUploadError(`最多附 ${MAX_NOTE_ATTACHMENTS} 个文件，先删掉一个再加。`)
      return
    }
    const selected = files.slice(0, room)
    const consent = await requestConsent({
      scene: 'teacher-announcement',
      kind: selected.every((file) => file.type.startsWith('image/')) ? 'image' : 'file',
      fileNames: selected.map((file) => file.name),
      totalBytes: selected.reduce((sum, file) => sum + file.size, 0),
    })
    if (!consent) return
    setUploading(true)
    setUploadError(files.length > room ? `最多 ${MAX_NOTE_ATTACHMENTS} 个，这次只处理前 ${room} 个。` : null)
    const accepted: FaqAttachment[] = []
    const failed: string[] = []
    try {
      for (const file of selected) {
        try {
          accepted.push(await prepareFaqAttachment(file))
        } catch (error) {
          failed.push(`${file.name}：${errorMessage(error)}`)
        }
      }
    } finally {
      setUploading(false)
    }
    if (accepted.length > 0) {
      setAttachments((current) => [...current, ...accepted].slice(0, MAX_NOTE_ATTACHMENTS))
    }
    if (failed.length > 0) setUploadError(failed.join('；'))
  }

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length > 0) void addAttachments(files)
  }

  const save = () => {
    const course = courses.find((item) => item.id === courseId)
    if (!course) return
    if (uploading) {
      notify('附件还在上传，请稍候再保存', 'info')
      return
    }
    const previous = notes.find((item) => item.courseId === course.id)
    const expires = parseDateInput(expiresAt)
    // 日期选择只到天，按当天 23:59 过期，避免公告在当天中午消失。
    const expiresTimestamp = expires
      ? new Date(expires).setHours(23, 59, 59, 999)
      : undefined
    const announcementChanged =
      announcement.trim() !== (previous?.announcement ?? '').trim()
    dispatch({
      type: 'course-note-saved',
      note: {
        courseId: course.id,
        teacher: course.teacher,
        announcement: announcement.trim(),
        officeHours: officeHours.trim(),
        updatedAt: Date.now(),
        // 公告附件只用于学生下载，不进入 AI 检索，避免把整份讲义塞进工作区。
        attachments:
          attachments.length > 0
            ? attachments.map(({ text: _text, ...attachment }) => attachment)
            : undefined,
        expiresAt: expiresTimestamp,
        currentChapter: currentChapter.trim() || undefined,
        publishedAt:
          announcement.trim()
            ? announcementChanged || !previous?.publishedAt
              ? Date.now()
              : previous.publishedAt
            : undefined,
        wallSession: previous?.wallSession,
      },
    })
    notify(
      announcement.trim() || officeHours.trim() || currentChapter.trim()
        ? '课程公告、答疑时段与教学进度已更新'
        : '已清空课程公告与答疑时段',
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="教师工具 · 学生可见"
      title="课程公告、附件与教学进度"
      size="md"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            公告和附件会同步给选这门课的学生；教学进度只用于提示与检索加权，不会伪造老师发言。
          </span>
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={onClose}>
              取消
            </button>
            <button className="button button-primary" onClick={save}>
              <Save size={15} />
              保存公告
            </button>
          </div>
        </div>
      }
    >
      <div className="course-note-form">
        <label className="field">
          <span className="field-label">课程</span>
          <select
            className="input"
            value={courseId}
            onChange={(event) => changeCourse(event.target.value)}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} · {course.teacher}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">
            <Megaphone size={13} />
            课程公告
          </span>
          <textarea
            className="input textarea"
            value={announcement}
            onChange={(event) => setAnnouncement(event.target.value)}
            rows={4}
            placeholder="例如：本周四 19:00 在博学楼 A302 加一次习题课，重点讲动态规划。"
          />
          <span className="field-hint">留空则学生端不显示公告；发布后学生端会显示「新」标记。</span>
        </label>

        <div className="field">
          <span className="field-label">
            <ImagePlus size={13} />
            公告附件（可选）
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept={`${ASK_IMAGE_ACCEPT},${FAQ_FILE_ACCEPT}`}
            multiple
            hidden
            onChange={handleFiles}
          />
          <div className="course-note-attachment-actions">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={14} className="spin-icon" /> : <ImagePlus size={14} />}
              {uploading ? '上传中…' : '添加图片或讲义'}
            </button>
            <span className="field-hint">最多 {MAX_NOTE_ATTACHMENTS} 个，图片直接展示，PDF/Word 可下载。</span>
          </div>
          {attachments.length > 0 && (
            <div className="course-note-attachment-list">
              {attachments.map((attachment, index) => (
                <div className="course-note-attachment" key={`${attachment.url}-${index}`}>
                  {attachment.kind === 'image' ? (
                    <img src={attachment.url} alt={attachment.name} />
                  ) : (
                    <span className="course-note-attachment-icon">
                      <FileText size={16} />
                    </span>
                  )}
                  <span>
                    <strong>{attachment.name}</strong>
                    <em>{formatFileSize(attachment.size)}</em>
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() =>
                      setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                    aria-label={`移除 ${attachment.name}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploadError && <span className="field-hint course-note-error">{uploadError}</span>}
        </div>

        <div className="course-note-grid">
          <label className="field">
            <span className="field-label">教学进度（当前章节）</span>
            <input
              className="input"
              value={currentChapter}
              onChange={(event) => setCurrentChapter(event.target.value)}
              placeholder="例如：第 6 章 · 树与二叉树"
            />
            <span className="field-hint">学生提问时提示「本周重点」；AI 检索会轻微优先本章答案。</span>
          </label>
          <label className="field">
            <span className="field-label">
              <CalendarClock size={13} />
              公告有效期
            </span>
            <input
              className="input"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            <span className="field-hint">留空表示长期有效。</span>
          </label>
        </div>

        <label className="field">
          <span className="field-label">
            <CalendarClock size={13} />
            答疑时段
          </span>
          <input
            className="input"
            value={officeHours}
            onChange={(event) => setOfficeHours(event.target.value)}
            placeholder="例如：周四 19:00–20:30 · 博学楼 A302"
          />
          <span className="field-hint">会显示在当前课程的学生端教师卡片里。</span>
        </label>
      </div>
    </Modal>
  )
}
