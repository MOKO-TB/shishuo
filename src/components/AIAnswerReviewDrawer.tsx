import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  CheckCheck,
  CircleAlert,
  Loader2,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { courseById } from '../data/seed'
import type { Thread } from '../types'
import {
  confidenceLabel,
  displayStudentName,
  feedbackReasonLabel,
  formatRelative,
  truncate,
} from '../lib/utils'
import { Avatar, Badge, ConfidenceMeter, Drawer, RichText } from './ui'

/** 服务端单次最多接受 40 条新通知，这里留出余量。 */
const MAX_SYNC_TARGETS = 20

interface AIAnswerReviewDrawerProps {
  thread: Thread | null
  onClose: () => void
  onAcknowledge?: (threadId: string) => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  openFaq: (faqId: string) => void
}

/**
 * AI 直接答掉的问题，老师之前完全看不到。这里给出原文、依据和反馈，
 * 老师可以纠正一次，并同步给同样引用了这条 FAQ 的其他同学。
 */
export function AIAnswerReviewDrawer({
  thread,
  onClose,
  onAcknowledge,
  notify,
  openFaq,
}: AIAnswerReviewDrawerProps) {
  const { data, dispatch } = useStore()
  const [text, setText] = useState('')
  const [syncAffected, setSyncAffected] = useState(true)
  const [sending, setSending] = useState(false)

  const course = thread ? courseById(thread.courseId) : null
  const sourceFaq = useMemo(() => {
    const sourceId = thread?.sources?.[0]
    return sourceId ? data.faqs.find((faq) => faq.id === sourceId) : undefined
  }, [data.faqs, thread?.sources])
  const affected = useMemo(() => {
    if (!thread || !sourceFaq) return []
    return data.threads.filter(
      (item) =>
        item.id !== thread.id &&
        item.status === 'ai' &&
        !item.withdrawnAt &&
        item.courseId === thread.courseId &&
        (item.sources ?? []).includes(sourceFaq.id),
    )
  }, [data.threads, sourceFaq, thread])

  useEffect(() => {
    setText('')
    setSyncAffected(true)
    setSending(false)
  }, [thread?.id])

  if (!thread || !course) return null

  const feedbackText =
    thread.feedback === 'unhelpful'
      ? `学生反馈：不够清楚${thread.feedbackReason ? `（${feedbackReasonLabel(thread.feedbackReason)}）` : ''}`
      : thread.feedback === 'helpful'
        ? '学生反馈：有帮助'
        : '学生还没有反馈'

  const send = () => {
    const body = text.trim()
    if (!body) {
      notify('先写一句更正或补充，再发送', 'info')
      return
    }
    setSending(true)
    const targets = syncAffected
      ? [thread, ...affected].slice(0, MAX_SYNC_TARGETS)
      : [thread]
    dispatch({
      type: 'teacher-reply',
      threadIds: targets.map((item) => item.id),
      reply: {
        text: body,
        at: Date.now(),
        by: course.teacher,
        recipientCount: targets.length,
      },
    })
    notify(
      targets.length > 1
        ? `已回复并同步给 ${targets.length} 位引用同一知识点的同学`
        : '已完成抽查并回复学生',
      'success',
    )
    setSending(false)
    onClose()
  }

  return (
    <Drawer open onClose={onClose} ariaLabel="AI 回答抽查">
      <div className="drawer-head ai-review-head">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-mark jade" />
            AI 已答抽查
            <span className="eyebrow-sep">/</span>
            {course.shortName}
          </div>
          <h2>AI 直接答掉的问题</h2>
        </div>
        <button className="icon-button drawer-close" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="drawer-body ai-review-body">
        <div className="ai-review-student">
          <Avatar
            name={thread.student.name}
            tone={course.accent}
            size="sm"
          />
          <div>
            <strong>{displayStudentName(thread, true)}</strong>
            <span>
              {formatRelative(thread.createdAt)} · {confidenceLabel(thread.confidence)}
            </span>
          </div>
          <Badge tone={thread.confidence === 'low' ? 'low' : thread.confidence === 'medium' ? 'medium' : 'high'} dot>
            {thread.confidence === 'low' ? '建议重点抽查' : 'AI 自动回答'}
          </Badge>
        </div>

        <div className="ai-review-question">
          <span className="ai-review-label">学生问题</span>
          <RichText text={thread.question} />
          {thread.attachment?.url && thread.attachment.kind !== 'document' && (
            <img
              className="ai-review-image"
              src={thread.attachment.url}
              alt="学生上传的题目图片"
            />
          )}
        </div>

        <div className="ai-review-answer">
          <div className="ai-review-answer-head">
            <span className="ai-review-label">
              <Sparkles size={14} />
              AI 的回答
            </span>
            <ConfidenceMeter confidence={thread.confidence} compact />
          </div>
          <RichText text={thread.aiAnswer ?? thread.externalAnswer?.text ?? '（没有保存 AI 回答正文）'} />
          {sourceFaq && (
            <button className="ai-source-card" onClick={() => openFaq(sourceFaq.id)}>
              <BookOpen size={15} />
              <span>
                <strong>AI 依据《{truncate(sourceFaq.question, 40)}》</strong>
                <em>点开检查这条知识是否需要一起更正</em>
              </span>
              <ArrowRight size={15} />
            </button>
          )}
          {!sourceFaq && thread.externalAnswer && (
            <div className="inline-note warning">
              这条回答来自服务端 AI 补充，没有课程 FAQ 依据。更正后建议把正确口径补进知识库。
            </div>
          )}
        </div>

        <div className={`ai-review-feedback ${thread.feedback === 'unhelpful' ? 'is-negative' : ''}`}>
          {thread.feedback === 'unhelpful' ? <CircleAlert size={15} /> : <CheckCheck size={15} />}
          <span>{feedbackText}</span>
          {thread.feedbackNote && <em>{thread.feedbackNote}</em>}
        </div>

        {affected.length > 0 && (
          <label className="ai-review-sync">
            <input
              type="checkbox"
              checked={syncAffected}
              onChange={(event) => setSyncAffected(event.target.checked)}
            />
            <span>
              <strong>
                <Users size={14} />
                同步给同样引用这条 FAQ 的 {affected.length} 位同学
              </strong>
              <em>
                他们收到的是同一条 AI 回答；一次最多同步 {MAX_SYNC_TARGETS - 1} 位，其余可下一轮处理。
              </em>
            </span>
          </label>
        )}

        <div className="ai-review-compose">
          <label className="field">
            <span className="field-label">老师的更正 / 补充</span>
            <textarea
              className="input textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              placeholder={
                thread.feedbackReason === 'skipped-steps'
                  ? '例如：这里补上中间一步——先求导再代入，注意链式法则。'
                  : '写清楚哪一步不对、正确口径是什么；会作为老师回复发给学生。'
              }
              aria-label="老师更正内容"
            />
            <span className="field-hint">
              发送后问题会进入「已处理」，学生收到老师回复通知；不会自动改写 FAQ，建议同时点开依据检查。
            </span>
          </label>
        </div>
      </div>

      <div className="drawer-foot ai-review-foot">
        <div className="ai-review-foot-left">
          {sourceFaq && (
            <button className="button button-ghost" onClick={() => openFaq(sourceFaq.id)}>
              <BookOpen size={15} />
              去完善这条 FAQ
            </button>
          )}
        </div>
        <div className="modal-actions-right">
          <button className="button button-ghost" onClick={onClose}>
            暂不处理
          </button>
          {onAcknowledge && (
            <button
              className="button button-ghost"
              onClick={() => onAcknowledge(thread.id)}
              title="标记后只在本机隐藏，不改变学生看到的内容"
            >
              <CheckCheck size={15} />
              这条没问题
            </button>
          )}
          <button className="button button-primary" onClick={send} disabled={sending}>
            {sending ? <Loader2 size={15} className="spin-icon" /> : <Send size={15} />}
            发送更正
          </button>
        </div>
      </div>
    </Drawer>
  )
}
