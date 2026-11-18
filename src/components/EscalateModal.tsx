import { useEffect, useMemo, useState } from 'react'
import { Clock3, Eye, EyeOff, Send, Sparkles, Users } from 'lucide-react'
import { useStore } from '../store'
import { courseById } from '../data/seed'
import type { Thread, Urgency } from '../types'
import { findSimilarPending, groupPendingThreads } from '../lib/engine'
import { makeEscalationTitle } from '../lib/utils'
import { Badge, Modal } from './ui'

const urgencyOptions: Array<{ value: Urgency; label: string; hint: string }> = [
  { value: 'today', label: '今天要用', hint: '优先处理' },
  { value: 'week', label: '本周内', hint: '正常排队' },
  { value: 'later', label: '不着急', hint: '有空再看' },
]

export function EscalateModal({
  thread,
  onClose,
  notify,
  mode = 'escalate',
}: {
  thread: Thread | null
  onClose: () => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  mode?: 'escalate' | 'supplement'
}) {
  const { data, dispatch } = useStore()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('week')
  const [anonymous, setAnonymous] = useState(false)
  const isSupplement = mode === 'supplement' && Boolean(thread?.escalation)

  useEffect(() => {
    if (!thread) return
    if (isSupplement && thread.escalation) {
      setTitle(thread.escalation.title)
      setNote(thread.escalation.note)
      setUrgency(thread.escalation.urgency)
      setAnonymous(thread.escalation.anonymous)
      return
    }
    setTitle(makeEscalationTitle(thread.question))
    setNote('')
    setUrgency('week')
    setAnonymous(thread.student.anonymous)
  }, [thread?.id, mode])

  const context = useMemo(() => {
    if (!thread) return { similarCount: 0, groupKey: undefined as string | undefined, teacher: '' }
    const similar = findSimilarPending(data.threads, thread.question, thread.courseId, thread.id)
    const groups = groupPendingThreads(data.threads, thread.courseId)
    const matchGroup = groups.find((group) =>
      group.threads.some((item) => similar.some((similarThread) => similarThread.id === item.id)),
    )
    return {
      similarCount: matchGroup?.count ?? similar.length,
      groupKey: matchGroup?.key,
      teacher: courseById(thread.courseId).teacher,
    }
  }, [data.threads, thread])

  if (!thread) return null

  const course = courseById(thread.courseId)
  const source = thread.sources?.[0]
    ? data.faqs.find((faq) => faq.id === thread.sources?.[0])
    : undefined

  const submit = () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      notify('给老师留一个清楚的问题标题', 'danger')
      return
    }
    if (isSupplement) {
      dispatch({
        type: 'escalated',
        threadId: thread.id,
        escalation: {
          title: trimmedTitle,
          note: note.trim(),
          anonymous,
          urgency,
          at: Date.now(),
          auto: thread.escalation?.auto,
        },
        clusterId: thread.clusterId,
        joinedExistingGroup: false,
      })
      notify('补充信息已保存，老师会一起看到')
      onClose()
      return
    }
    dispatch({
      type: 'escalated',
      threadId: thread.id,
      escalation: {
        title: trimmedTitle,
        note: note.trim(),
        anonymous,
        urgency,
        at: Date.now(),
      },
      clusterId: context.groupKey,
      joinedExistingGroup: Boolean(context.groupKey),
    })
    notify(
      context.groupKey
        ? `已并入同一问题组，${course.teacher} 会合并回复`
        : `已转交 ${course.teacher}，AI 摘要已附上`,
    )
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={`${course.name} · ${course.teacher}老师`}
      title={isSupplement ? '补充给老师的说明' : '把问题交给老师'}
      size="md"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            {isSupplement
              ? '老师还没回复，补充还来得及。'
              : context.groupKey
                ? '合并后，老师只需要回复一次。'
                : '老师会收到 AI 整理好的上下文。'}
          </span>
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={onClose}>
              {isSupplement ? '取消' : '先不转交'}
            </button>
            <button className="button button-primary" onClick={submit}>
              <Send size={15} />
              {isSupplement ? '保存补充' : `转交 ${course.teacher}老师`}
            </button>
          </div>
        </div>
      }
    >
      {isSupplement && (
        <div className="inline-note warning escalate-supplement-note">
          AI 没把握，已经把问题自动交给{course.teacher}老师。补充内容会和原来的摘要一起出现。
        </div>
      )}
      <div className="escalate-context">
        <div className="escalate-context-head">
          <Badge tone="jade" dot>
            问题摘要
          </Badge>
          <span>AI 已把聊天上下文压缩成老师能直接看的版本</span>
        </div>
        <input
          className="input input-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={40}
          aria-label="问题摘要标题"
        />
        <div className="escalate-question">原始问题：{thread.question}</div>
      </div>

      {!isSupplement && context.similarCount > 0 && (
        <div className="duplicate-hint">
          <Users size={17} />
          <div>
            <strong>已有 {context.similarCount} 位同学在等同一类答案</strong>
            <p>你的问题会并入同一组，老师一次回复所有人，不用重复排队。</p>
          </div>
        </div>
      )}

      <div className="escalate-grid">
        <label className="field">
          <span className="field-label">补充说明（选填）</span>
          <textarea
            className="input textarea"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：明天小测、已经试过哪一步、具体卡在哪道题"
            rows={3}
          />
        </label>

        <div className="field">
          <span className="field-label">希望什么时候回复</span>
          <div className="urgency-options">
            {urgencyOptions.map((option) => (
              <button
                key={option.value}
                className={`urgency-option ${urgency === option.value ? 'is-active' : ''}`}
                onClick={() => setUrgency(option.value)}
                type="button"
              >
                <span>{option.label}</span>
                <em>{option.hint}</em>
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        className={`anonymous-toggle ${anonymous ? 'is-active' : ''}`}
        onClick={() => setAnonymous(!anonymous)}
        type="button"
        aria-pressed={anonymous}
      >
        <span className="anonymous-icon">{anonymous ? <EyeOff size={16} /> : <Eye size={16} />}</span>
        <span>
          <strong>{anonymous ? '匿名转交' : '实名转交'}</strong>
          <em>{anonymous ? '老师只会看到“匿名同学”' : '老师会看到你的名字，方便继续追问'}</em>
        </span>
        <span className="switch-track">
          <span />
        </span>
      </button>

      <div className="escalate-preview">
        <div className="escalate-preview-head">
          <Sparkles size={15} />
          老师将看到
        </div>
        <ul>
          <li>
            <Clock3 size={13} />
            你的原始问题 + 补充说明
          </li>
          <li>
            <Sparkles size={13} />
            {source ? `AI 查到的依据：《${source.question}》` : 'AI 的检索记录：未找到可靠依据'}
          </li>
          <li>
            <Users size={13} />
            {context.similarCount > 0 ? `同题合并：${context.similarCount} 位同学` : '未发现同题，单独排队'}
          </li>
        </ul>
      </div>
    </Modal>
  )
}
