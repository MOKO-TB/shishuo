import { useEffect, useState } from 'react'
import { Eye, EyeOff, Send, Users } from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { courseById } from '../data/seed'
import { useProfile } from '../lib/profile'
import type { Thread, ThreadGroup } from '../types'
import { formatRelative, makeId } from '../lib/utils'
import { Badge, Modal } from './ui'

export function JoinGroupModal({
  group,
  onClose,
  notify,
}: {
  group: ThreadGroup | null
  onClose: () => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}) {
  const { dispatch } = useStore()
  const { user } = useAuth()
  const profile = useProfile()
  const [anonymous, setAnonymous] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!group) return
    setAnonymous(false)
    setNote('')
  }, [group?.key])

  if (!group) return null

  const course = courseById(group.courseId)
  const base = group.primary

  const submit = () => {
    const now = Date.now()
    const thread: Thread = {
      id: makeId('t'),
      courseId: group.courseId,
      student: {
        id: user?.id ?? '',
        name: profile.name,
        anonymous,
      },
      question: base.question,
      createdAt: now,
      status: 'pending',
      kind: 'same',
      aiAnswer: base.aiAnswer,
      confidence: base.confidence,
      confidenceScore: base.confidenceScore,
      sources: base.sources,
      closestSource: base.closestSource,
      feedback: null,
      clusterId: group.key,
      groupLocked: group.locked ? true : undefined,
      escalation: {
        title: group.title,
        note: note.trim() || '同问：我也在等这个答案。',
        anonymous,
        urgency: group.urgency,
        at: now,
      },
    }
    dispatch({ type: 'group-joined', thread })
    notify(`已同问，${course.teacher}老师回复后会同步给你`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={`${course.name} · ${course.teacher}老师`}
      title="同问这个卡点"
      size="sm"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">老师只回复一次，同题组里的同学都会收到。</span>
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={onClose}>
              取消
            </button>
            <button className="button button-primary" onClick={submit}>
              <Send size={15} />
              同问，等老师回复
            </button>
          </div>
        </div>
      }
    >
      <div className="join-summary">
        <div className="join-summary-head">
          <Badge tone="gold">
            <Users size={12} />
            {group.count} 人等
          </Badge>
          <span>{formatRelative(group.latestAt)}更新</span>
        </div>
        <h3 className="join-title">{group.title}</h3>
        <p className="join-question">{group.primary.question}</p>
        <div className="join-meta">
          <span>{course.teacher}老师会在处理后合并回复</span>
          {group.urgency === 'today' && <Badge tone="danger">今天要用</Badge>}
        </div>
      </div>

      <label className="field join-note-field">
        <span className="field-label">想补充一句（选填）</span>
        <textarea
          className="input textarea"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="例如：我也是卡在“状态定义”这一步"
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
          <strong>{anonymous ? '匿名同问' : '实名同问'}</strong>
          <em>{anonymous ? '老师只会看到“匿名同学”' : '沿用你在班级里的名字'}</em>
        </span>
        <span className="switch-track">
          <span />
        </span>
      </button>

      <div className="inline-note warning join-inline-note">
        加入后，老师这次的回复会同步给你，也会保留在「我的提问」里。
      </div>
    </Modal>
  )
}
