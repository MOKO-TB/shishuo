import { useState, useEffect, type FormEvent } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  CornerDownRight,
  KeyRound,
  Link2,
  Send,
  Sparkles,
  Undo2,
} from 'lucide-react'
import { useStore } from '../store'
import { courseById } from '../data/seed'
import type { Thread } from '../types'
import {
  confidenceLabel,
  copyText,
  displayStudentName,
  formatDateTime,
  formatRelative,
  shareLink,
  urgencyLabel,
} from '../lib/utils'
import { loadThreadChat, saveThreadChat, type ThreadChatMessage } from '../lib/threadChat'
import {
  Avatar,
  Badge,
  FeedbackButtons,
  Modal,
  RichText,
  Seal,
} from './ui'

export function ThreadDetailModal({
  threadId,
  onClose,
  onOpenFaq,
  onFollowUp,
  onResolve,
  onFeedback,
  onUndoReply,
  onWithdraw,
  onSupplement,
  onCampusFollowUp,
  onThreadFollowUp,
  viewer = 'student',
  notify,
}: {
  threadId: string | null
  onClose: () => void
  onOpenFaq: (faqId: string) => void
  onFollowUp?: (thread: Thread) => void
  onResolve?: (thread: Thread, resolved: boolean) => void
  onFeedback?: (thread: Thread, feedback: 'helpful' | 'unhelpful') => void
  onUndoReply?: (thread: Thread) => void
  onWithdraw?: (thread: Thread, withdrawn: boolean) => void
  onSupplement?: (thread: Thread, text: string) => void
  onCampusFollowUp?: (
    thread: Thread,
    question: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) => Promise<{ text: string; model: string }>
  /** 课程问答的连续追问；带上下文调用同一门课的导师。 */
  onThreadFollowUp?: (
    thread: Thread,
    question: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) => Promise<{ text: string; model: string }>
  viewer?: 'student' | 'teacher'
  notify?: (message: string, tone?: 'success' | 'info' | 'danger') => void
}) {
  const { data } = useStore()
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const [supplementDraft, setSupplementDraft] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState('')
  const [chatMessages, setChatMessages] = useState<ThreadChatMessage[]>([])
  const thread = threadId ? data.threads.find((item) => item.id === threadId) : undefined

  useEffect(() => {
    setConfirmUndo(false)
    setConfirmWithdraw(false)
    setSupplementDraft('')
    setChatDraft('')
    setChatBusy(false)
    setChatError('')
    setChatMessages(threadId ? loadThreadChat(threadId) : [])
  }, [threadId])

  if (!thread) return null

  const course = courseById(thread.courseId)
  const replyRole = thread.courseId === 'campus' ? '校园主理人' : '老师'
  const hasAiAttempt = (thread.kind ?? 'ask') === 'ask'
  const canFeedback =
    viewer === 'student' && Boolean(onFeedback) && Boolean(thread.aiAnswer || thread.teacherReply)
  const canResolve = viewer === 'student' && Boolean(onResolve) && Boolean(thread.teacherReply)
  const canWithdraw =
    viewer === 'student' &&
    Boolean(onWithdraw) &&
    !thread.teacherReply &&
    (Boolean(thread.withdrawnAt) ||
      thread.status === 'pending' ||
      thread.status === 'needs-info' ||
      thread.status === 'ai')
  const canSupplement =
    viewer === 'student' &&
    Boolean(onSupplement) &&
    thread.status === 'needs-info' &&
    !thread.withdrawnAt &&
    !thread.teacherReply
  const showFollowUp =
    viewer === 'student' &&
    thread.status === 'answered' &&
    Boolean(thread.teacherReply) &&
    !thread.withdrawnAt &&
    Boolean(onFollowUp)
  const sources = (thread.sources ?? [])
    .map((id) => data.faqs.find((faq) => faq.id === id))
    .filter((faq): faq is NonNullable<typeof faq> => Boolean(faq))
  const closest = thread.closestSource
    ? data.faqs.find((faq) => faq.id === thread.closestSource)
    : undefined
  const sedimentFaq = thread.teacherReply?.faqId
    ? data.faqs.find((faq) => faq.id === thread.teacherReply?.faqId)
    : undefined
  const displayAiAnswer =
    thread.courseId === 'math' &&
    sources[0] &&
    thread.aiAnswer &&
    !thread.aiAnswer.includes('$') &&
    /\^\{|_\{/.test(thread.aiAnswer)
      ? sources[0].answer
      : thread.aiAnswer
  const chatHandler =
    thread.courseId === 'campus' ? onCampusFollowUp : onThreadFollowUp
  const canChat =
    viewer === 'student' && Boolean(chatHandler) && !thread.withdrawnAt
  const chatAssistantName =
    thread.courseId === 'campus' ? '学长' : `${course.shortName}导师`

  const submitChat = async (event: FormEvent) => {
    event.preventDefault()
    const question = chatDraft.trim()
    if (!question || chatBusy || !chatHandler) return
    const initialAnswer =
      thread.externalAnswer?.text || thread.aiAnswer || thread.teacherReply?.text || ''
    const history = [
      { role: 'user' as const, content: thread.question },
      ...(initialAnswer
        ? [{ role: 'assistant' as const, content: initialAnswer }]
        : []),
      ...chatMessages.map((message) => ({
        role: message.role,
        content: message.text,
      })),
    ]
    const nextMessages = [...chatMessages, { role: 'user' as const, text: question }]
    setChatDraft('')
    setChatError('')
    setChatMessages(nextMessages)
    saveThreadChat(thread.id, nextMessages)
    setChatBusy(true)
    try {
      const result = await chatHandler(thread, question, history)
      const finished = [...nextMessages, { role: 'assistant' as const, text: result.text }]
      setChatMessages(finished)
      saveThreadChat(thread.id, finished)
    } catch (error) {
      setChatError(error instanceof Error ? error.message : '继续追问失败，请稍后再试。')
    } finally {
      setChatBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={`${course.name} · ${formatDateTime(thread.createdAt)}`}
      title="这次答疑的完整记录"
      size="md"
      footer={
        <div className="modal-actions modal-actions-split">
          <div className="modal-actions-right">
            {canResolve && (
              <button
                className={`button ${thread.resolvedAt ? 'button-ghost' : 'button-secondary'}`}
                onClick={() => onResolve?.(thread, !thread.resolvedAt)}
              >
                <Check size={15} />
                {thread.resolvedAt ? '撤销「已解决」' : '已解决'}
              </button>
            )}
            {showFollowUp && (
              <button className="button button-secondary" onClick={() => onFollowUp?.(thread)}>
                还没解决，继续追问
                <ArrowRight size={15} />
              </button>
            )}
            {viewer === 'teacher' && thread.teacherReply && (
              <button
                className="button button-ghost"
                onClick={() => {
                  if (confirmUndo) {
                    onUndoReply?.(thread)
                    setConfirmUndo(false)
                  } else {
                    setConfirmUndo(true)
                  }
                }}
              >
                <Undo2 size={15} />
                {confirmUndo ? '确认撤回这条回复' : '撤回回复'}
              </button>
            )}
            {canWithdraw && (
              <button
                className="button button-ghost"
                onClick={() => {
                  if (thread.withdrawnAt) {
                    onWithdraw?.(thread, false)
                    return
                  }
                  if (confirmWithdraw) {
                    onWithdraw?.(thread, true)
                    setConfirmWithdraw(false)
                  } else {
                    setConfirmWithdraw(true)
                  }
                }}
              >
                <Undo2 size={15} />
                {thread.withdrawnAt
                  ? '重新发起'
                  : confirmWithdraw
                    ? '确认撤下'
                    : '撤下这个问题'}
              </button>
            )}
            <button
              className="button button-ghost"
              onClick={async () => {
                const copied = await copyText(shareLink('thread', thread.id))
                notify?.(
                  copied ? '链接已复制，可以发给同学或老师' : '复制失败，请手动复制地址栏链接',
                  copied ? 'success' : 'info',
                )
              }}
            >
              <Link2 size={15} />
              复制链接
            </button>
            <button className="button button-primary" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      }
    >
      <div className="thread-timeline">
        {confirmWithdraw && !thread.withdrawnAt && (
          <div className="inline-note danger">
            <CircleAlert size={14} />
            <span>
              {thread.status === 'pending'
                ? `撤下后这条会从${course.teacher}老师的待办里移出，同题组里的其他同学不受影响；你随时可以在这里「重新发起」。`
                : '撤下后这条记录会从「我的提问」里收起，AI 之前的回答仍然保留。'}
              再点一次「确认撤下」。
            </span>
          </div>
        )}
        {thread.withdrawnAt && (
          <div className="inline-note">
            <Undo2 size={14} />
            <span>
              你已撤下这条问题（{formatRelative(thread.withdrawnAt)}）
              {thread.status === 'pending' ? '，老师的待办里不再排它' : ''}。
            </span>
          </div>
        )}
        {confirmUndo && thread.teacherReply && (
          <div className="inline-note danger">
            <CircleAlert size={14} />
            <span>
              撤回后这条问题会回到你的待办；{thread.teacherReply.faqId && thread.teacherReply.sedimentPrevious === null
                ? '这次沉淀出来的 FAQ 会一并删除'
                : thread.teacherReply.faqId
                  ? '这次更新过的 FAQ 会回到撤回前的版本'
                  : '本次没有改动知识库'}
              。再点一次「撤回回复」并确认。
            </span>
          </div>
        )}
        <div className="thread-row thread-student">
          <Avatar
            name={thread.student.name}
            anonymous={
              viewer === 'teacher' &&
              Boolean(thread.escalation?.anonymous || thread.student.anonymous)
            }
            tone="jade"
            size="sm"
          />
          <div className="thread-bubble student-bubble">
            <div className="thread-bubble-head">
              <strong>{displayStudentName(thread, viewer === 'teacher')}</strong>
              <span>{formatRelative(thread.createdAt)}</span>
              {thread.kind === 'same' && <Badge tone="gold">同问</Badge>}
              {thread.kind === 'follow-up' && <Badge tone="blue">追问</Badge>}
            </div>
            <p className="student-question">{thread.question}</p>
            {thread.attachment && (
              <a
                className="thread-attachment-link"
                href={thread.attachment.url ?? thread.attachment.dataUrl}
                target="_blank"
                rel="noreferrer"
                title="查看原图"
              >
                <img
                  className="thread-attachment"
                  src={thread.attachment.url ?? thread.attachment.dataUrl}
                  alt="学生上传的题目图片"
                />
              </a>
            )}
          </div>
        </div>

        {hasAiAttempt && !(thread.courseId === 'campus' && thread.externalAnswer) && (
        <div className="thread-row thread-ai">
          <span className="thread-ai-mark">
            <Sparkles size={15} />
          </span>
          <div className="thread-bubble ai-bubble">
            <div className="thread-bubble-head">
              <strong>{thread.courseId === 'campus' ? '引路学长' : 'AI 助教'}</strong>
              {thread.confidence && (
                <Badge
                  tone={
                    thread.confidence === 'high'
                      ? 'high'
                      : thread.confidence === 'medium'
                        ? 'medium'
                        : 'low'
                  }
                  dot
                >
                  {confidenceLabel(thread.confidence)}
                </Badge>
              )}
            </div>
            {displayAiAnswer ? (
              <RichText text={displayAiAnswer} />
            ) : (
              <p className="thread-ai-empty">
                AI 没有找到足够可靠的依据，没有生成答案。
                {closest && ` 查到的相近内容：${closest.question}`}
              </p>
            )}
            {sources.length > 0 && (
              <div className="thread-source-row">
                {sources.map((faq) => (
                  <button key={faq.id} className="thread-source" onClick={() => onOpenFaq(faq.id)}>
                    <BookOpen size={13} />
                    {faq.question}
                    <ArrowRight size={12} />
                  </button>
                ))}
              </div>
            )}
            {!thread.aiAnswer && closest && (
              <button className="thread-source is-weak" onClick={() => onOpenFaq(closest.id)}>
                <CornerDownRight size={13} />
                查看相近知识（相关度不足）
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        </div>
        )}

        {thread.externalAnswer && (
          <div className="thread-row thread-external">
            <span className="thread-external-mark">
              <KeyRound size={14} />
            </span>
            <div className="thread-bubble external-bubble">
              <div className="thread-bubble-head">
                <strong>{thread.courseId === 'campus' ? '引路学长' : '服务端 AI 补充'}</strong>
                {thread.courseId !== 'campus' && <span>{thread.externalAnswer.model}</span>}
                {thread.courseId !== 'campus' && <Badge tone="blue">外部模型</Badge>}
              </div>
              {thread.courseId !== 'campus' && (
                <p className="thread-external-warning">
                  来自学生配置的外部模型，未经过课程知识库和老师确认。
                </p>
              )}
              <RichText text={thread.externalAnswer.text} />
            </div>
          </div>
        )}

        {thread.escalation && (
          <div className="thread-event">
            <Clock3 size={14} />
            <span>
              {thread.kind === 'same'
                ? '已加入同题组 · '
                : thread.kind === 'follow-up'
                  ? '追问已发给'
                  : thread.escalation.auto
                    ? 'AI 已自动转交'
                    : '已转交'}
              {course.teacher}老师 · {urgencyLabel(thread.escalation.urgency)}
              {thread.escalation.anonymous && ' · 匿名'}
            </span>
            <em>{formatRelative(thread.escalation.at)}</em>
          </div>
        )}

        {thread.teacherRequest && (
          <div className="thread-event is-info-request">
            <CircleAlert size={14} />
            <span>
              <strong>
                {viewer === 'teacher'
                  ? '你发出的补充要求：'
                  : `${thread.teacherRequest.by}老师请你补充：`}
              </strong>
              {thread.teacherRequest.text}
            </span>
            <em>{formatRelative(thread.teacherRequest.at)}</em>
          </div>
        )}

        {thread.studentSupplement && (
          <div className="thread-event is-supplement">
            <CornerDownRight size={14} />
            <span>
              <strong>{viewer === 'teacher' ? '学生补充：' : '你的补充：'}</strong>
              {thread.studentSupplement.text}
            </span>
            <em>{formatRelative(thread.studentSupplement.at)}</em>
          </div>
        )}

        {canSupplement && (
          <section className="thread-supplement-composer">
            <div className="thread-supplement-head">
              <CircleAlert size={15} />
              <div>
                <strong>补充后会自动回到老师待办</strong>
                <span>不要只写“不会”，把题目、已试过的步骤或卡住的那一步说清楚。</span>
              </div>
            </div>
            <textarea
              className="input textarea"
              rows={4}
              data-enter-submit
              value={supplementDraft}
              onChange={(event) => setSupplementDraft(event.target.value)}
              placeholder="例如：题目是第 3 题，我算到特征方程这一步就不会了；附上我的草稿……"
              aria-label="补充给老师的内容"
            />
            <div className="thread-supplement-actions">
              <button
                className="button button-primary"
                disabled={!supplementDraft.trim()}
                onClick={() => {
                  const text = supplementDraft.trim()
                  if (!text) return
                  onSupplement?.(thread, text)
                  setSupplementDraft('')
                }}
              >
                提交补充
              </button>
            </div>
          </section>
        )}

        {thread.teacherReply ? (
          <div className="thread-row thread-teacher">
            <Avatar name={thread.teacherReply.by} tone="gold" size="sm" />
            <div className="thread-bubble teacher-bubble">
              <div className="thread-bubble-head">
                <strong>{thread.teacherReply.by}{replyRole}</strong>
                <span>{formatRelative(thread.teacherReply.at)}</span>
                {thread.teacherReply.faqId && <Seal className="seal-tiny">已沉淀</Seal>}
              </div>
              <RichText text={thread.teacherReply.text} />
              {thread.teacherReply.attachment && (
                <a
                  className="thread-attachment-link teacher-reply-attachment"
                  href={thread.teacherReply.attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  title="查看老师附图"
                >
                  <img
                    className="thread-attachment"
                    src={thread.teacherReply.attachment.url}
                    alt="老师回复附图"
                  />
                </a>
              )}
              <div className="teacher-reply-foot">
                {thread.teacherReply.recipientCount && thread.teacherReply.recipientCount > 1
                  ? `已同步给 ${thread.teacherReply.recipientCount} 位同题同学`
                  : `${replyRole}已回复`}
                {sedimentFaq && (
                  <button className="text-button" onClick={() => onOpenFaq(sedimentFaq.id)}>
                    查看更新后的 FAQ
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : thread.status === 'pending' ? (
          <div className="thread-pending-note">
            <span className="pending-pulse" />
            <div>
              <strong>{course.teacher}{replyRole}还没有回复</strong>
              {thread.courseId !== 'campus' && (
                <p>
                  {thread.kind === 'same'
                    ? `已经并入同题组，${replyRole}一次回复会同步给你。`
                    : thread.kind === 'follow-up'
                      ? `追问已带上一次的${replyRole}回复，${replyRole}会接着上一段讲。`
                      : `AI 已附上问题摘要和检索依据。同类问题会合并在一起，${replyRole}回复后会同步给你。`}
                </p>
              )}
            </div>
          </div>
        ) : thread.status === 'needs-info' ? (
          <div className="thread-pending-note is-info">
            <CircleAlert size={15} />
            <div>
              <strong>
                {viewer === 'teacher' ? '已请学生补充信息' : `${replyRole}正在等你补充信息`}
              </strong>
              <p>
                {viewer === 'teacher'
                  ? '学生补充后，这条问题会自动回到待办。'
                  : `补充后问题会自动回到待办，${replyRole}会继续处理。`}
              </p>
            </div>
          </div>
        ) : null}

        {canChat && (
          <section className="campus-chat">
            <div className="campus-chat-head">
              <strong>继续追问</strong>
              <span>会带着这条问题和上面的回答继续聊</span>
            </div>
            {chatMessages.map((message, index) => (
              <div
                className={`campus-chat-row is-${message.role}`}
                key={`${message.role}-${index}`}
              >
                <strong>{message.role === 'user' ? '你' : chatAssistantName}</strong>
                <RichText text={message.text} />
              </div>
            ))}
            {chatError && <p className="campus-chat-error">{chatError}</p>}
            <form className="campus-chat-form" onSubmit={submitChat}>
              <input
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                placeholder={
                  thread.courseId === 'campus'
                    ? '接着问，比如：那计算机专业具体先考哪个证？'
                    : '接着问，比如：这一步为什么要先检查先修？'
                }
                aria-label={`继续追问${chatAssistantName}`}
              />
              <button
                className="button button-primary"
                type="submit"
                disabled={!chatDraft.trim() || chatBusy}
              >
                <Send size={14} />
                {chatBusy ? '回答中…' : '发送'}
              </button>
            </form>
          </section>
        )}

        {thread.resolvedAt && (
          <div className="thread-event is-resolved">
            <CircleCheck size={14} />
            <span>
              {viewer === 'teacher' ? '学生已确认这个问题解决了' : '你确认了这次答疑解决了问题'} ·{' '}
              {formatRelative(thread.resolvedAt)}
            </span>
          </div>
        )}

        {canFeedback && (
          <div className="thread-feedback-row">
            <span>这条回答会带着你的反馈进入知识库：不够清楚的答案，下一次的置信度会自动降低。</span>
            <FeedbackButtons
              value={thread.feedback ?? null}
              onChange={(feedback) => onFeedback?.(thread, feedback)}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
