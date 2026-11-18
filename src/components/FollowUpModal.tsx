import { useEffect, useState } from 'react'
import { CornerDownRight, Eye, EyeOff, Send } from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { courseById } from '../data/seed'
import { useProfile } from '../lib/profile'
import type { Thread } from '../types'
import { excerpt, formatRelative, makeEscalationTitle, makeId, truncate } from '../lib/utils'
import { Avatar, Modal } from './ui'

export function FollowUpModal({
  thread,
  onClose,
  notify,
}: {
  thread: Thread | null
  onClose: () => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}) {
  const { dispatch } = useStore()
  const { user } = useAuth()
  const profile = useProfile()
  const [text, setText] = useState('')
  const [anonymous, setAnonymous] = useState(false)

  useEffect(() => {
    if (!thread) return
    setText('')
    setAnonymous(Boolean(thread.escalation?.anonymous || thread.student.anonymous))
  }, [thread?.id])

  if (!thread) return null

  const course = courseById(thread.courseId)
  const previousReply = thread.teacherReply?.text ?? ''

  const submit = () => {
    const question = text.trim()
    if (!question) {
      notify('先说说哪里还没解决', 'danger')
      return
    }
    const now = Date.now()
    const topic = question
      .replace(/^(老师[，,、\s]*)+/, '')
      .split(/[，,。！？!?\n]/)[0]
      .trim()
    const followUp: Thread = {
      id: makeId('t'),
      courseId: thread.courseId,
      student: {
        id: user?.id ?? '',
        name: profile.name,
        anonymous,
      },
      question,
      createdAt: now,
      status: 'pending',
      kind: 'follow-up',
      parentThreadId: thread.id,
      feedback: null,
      escalation: {
        title: (topic || makeEscalationTitle(question)).slice(0, 30),
        note: `追问自：${truncate(thread.question, 36)}`,
        anonymous,
        urgency: 'week',
        at: now,
      },
    }
    dispatch({ type: 'follow-up-created', thread: followUp })
    notify(`追问已发给${course.teacher}老师，会带上上次回复`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={`${course.name} · ${course.teacher}老师`}
      title="继续追问"
      size="md"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">追问会带着上一次的回复一起交给老师。</span>
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={onClose}>
              取消
            </button>
            <button className="button button-primary" onClick={submit}>
              <Send size={15} />
              发给{course.teacher}老师
            </button>
          </div>
        </div>
      }
    >
      <div className="followup-modal-context">
        <div className="followup-modal-head">
          <span>上一次的答疑</span>
          <span>{formatRelative(thread.teacherReply?.at ?? thread.createdAt)}</span>
        </div>
        <div className="followup-modal-question">
          <CornerDownRight size={14} />
          <span>{thread.question}</span>
        </div>
        <div className="followup-modal-reply">
          <Avatar name={thread.teacherReply?.by ?? course.teacher} tone="gold" size="xs" />
          <div>
            <strong>{thread.teacherReply?.by ?? course.teacher}老师上次回复</strong>
            <p>{excerpt(previousReply, 160)}</p>
          </div>
        </div>
      </div>

      <label className="field followup-field">
        <span className="field-label">哪里还没解决？</span>
        <textarea
          className="input textarea followup-textarea"
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="例如：老师，我还是没分清状态定义和转移方程，能不能用一道新题演示一下？"
        />
      </label>

      <button
        className={`anonymous-toggle ${anonymous ? 'is-active' : ''}`}
        onClick={() => setAnonymous(!anonymous)}
        aria-pressed={anonymous}
        type="button"
      >
        <span className="anonymous-icon">{anonymous ? <EyeOff size={16} /> : <Eye size={16} />}</span>
        <span>
          <strong>{anonymous ? '匿名追问' : '实名追问'}</strong>
          <em>{anonymous ? '老师只会看到“匿名同学”' : '沿用你在班级里的名字'}</em>
        </span>
        <span className="switch-track">
          <span />
        </span>
      </button>
    </Modal>
  )
}
