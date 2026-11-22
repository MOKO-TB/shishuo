import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  Clock3,
  CornerDownRight,
  GraduationCap,
  KeyRound,
  MessageCircle,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { useStore } from '../store'
import { courseById } from '../data/seed'
import { findMentorTopic, mentorForCourse } from '../data/mentor'
import { loadThreadChat, saveThreadChat, type ThreadChatMessage } from '../lib/threadChat'
import type { AnswerResult, FeedbackReason, Thread } from '../types'
import {
  Badge,
  FeedbackButtons,
  RichText,
} from './ui'
import { DigitalAvatarBadge } from './DigitalAvatar'
import { FaqAttachments } from './FaqAttachments'
import { CollapsibleRichText } from './CollapsibleRichText'

interface AnswerCardProps {
  thread: Thread
  result?: AnswerResult
  onEscalate: () => void
  onSupplement?: () => void
  onFeedback: (feedback: 'helpful' | 'unhelpful') => void
  onFeedbackReason?: (reason: FeedbackReason | null) => void
  onResolve?: (resolved: boolean) => void
  onOpenFaq: (faqId: string) => void
  onTeach?: () => void
  onOpenDetail?: () => void
  /** 接着这条回答继续和 AI 聊；带原问题与已给出的回答作为上下文。 */
  onFollowUpChat?: (
    thread: Thread,
    question: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) => Promise<{ text: string; model: string }>
}

export function AnswerCard({
  thread,
  result,
  onEscalate,
  onSupplement,
  onFeedback,
  onFeedbackReason,
  onResolve,
  onOpenFaq,
  onTeach,
  onOpenDetail,
  onFollowUpChat,
}: AnswerCardProps) {
  const { data } = useStore()
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState('')
  const [chatMessages, setChatMessages] = useState<ThreadChatMessage[]>([])
  const chatInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = loadThreadChat(thread.id)
    setChatOpen(saved.length > 0)
    setChatDraft('')
    setChatBusy(false)
    setChatError('')
    setChatMessages(saved)
  }, [thread.id])

  const openChat = () => {
    setChatOpen(true)
    window.setTimeout(() => chatInputRef.current?.focus(), 40)
  }

  const submitChat = async (event: FormEvent) => {
    event.preventDefault()
    const question = chatDraft.trim()
    if (!question || chatBusy || !onFollowUpChat) return
    const initialAnswer =
      thread.externalAnswer?.text || thread.aiAnswer || thread.teacherReply?.text || ''
    const history = [
      { role: 'user' as const, content: thread.question },
      ...(initialAnswer ? [{ role: 'assistant' as const, content: initialAnswer }] : []),
      ...chatMessages.map((message) => ({
        role: message.role,
        content: message.text,
      })),
    ]
    const prevMessages = chatMessages
    const nextMessages = [...prevMessages, { role: 'user' as const, text: question }]
    setChatDraft('')
    setChatError('')
    setChatMessages(nextMessages)
    setChatBusy(true)
    try {
      const answer = await onFollowUpChat(thread, question, history)
      const finished = [...nextMessages, { role: 'assistant' as const, text: answer.text }]
      setChatMessages(finished)
      saveThreadChat(thread.id, finished)
    } catch (error) {
      setChatMessages(prevMessages)
      setChatError(error instanceof Error ? error.message : '继续对话失败，请稍后再试。')
    } finally {
      setChatBusy(false)
    }
  }
  const course = courseById(thread.courseId)
  const mentor = mentorForCourse(thread.courseId)
  const sourceFaqs = (thread.sources ?? [])
    .map((id) => data.faqs.find((faq) => faq.id === id))
    .filter((faq): faq is NonNullable<typeof faq> => Boolean(faq))
  const closest = thread.closestSource
    ? data.faqs.find((faq) => faq.id === thread.closestSource)
    : undefined
  const mentorTopic =
    mentor && sourceFaqs[0]
      ? findMentorTopic(mentor, sourceFaqs[0], thread.question)
      : undefined
  const displayAnswer =
    mentor &&
    sourceFaqs[0] &&
    thread.aiAnswer &&
    !thread.aiAnswer.includes('$') &&
    /\^\{|_\{/.test(thread.aiAnswer)
      ? sourceFaqs[0].answer
      : thread.aiAnswer
  const confidence = thread.confidence ?? 'low'
  const isLow = confidence === 'low'
  const isPending = thread.status === 'pending'
  const isNeedsInfo = thread.status === 'needs-info'
  const isAnswered = thread.status === 'answered'
  const hasExternal = Boolean(thread.externalAnswer)

  return (
    <article className={`answer-card answer-${confidence}`}>
      <header className="answer-head">
        <div className="answer-identity">
          <DigitalAvatarBadge mood="happy" size={34} />
          <div className="answer-name">
            <strong>AI 助教</strong>
          </div>
        </div>
      </header>

      {isLow ? (
        hasExternal ? (
          <div className="external-answer">
            <div className="external-answer-head">
              <span className="external-answer-icon">
                <KeyRound size={16} />
              </span>
              <div>
                <strong>服务端 AI 补充</strong>
              </div>
              <Badge tone="blue">外部模型</Badge>
            </div>
            {thread.externalAnswer && (
              <CollapsibleRichText text={thread.externalAnswer.text} />
            )}
          </div>
        ) : (
          <div className="ai-no-answer">
            <div className="ai-no-answer-copy">
              <span className="ai-no-answer-eyebrow">AI 判断：证据不足</span>
              <h3>这次不给你编一个“看起来像答案”的东西。</h3>
              <p>
                知识库里暂时没有能直接回答这个问题的内容。AI 已经把问题交给{course.teacher}老师，并附上你的问题、课程上下文和检索记录，老师不用再问一遍。
              </p>
            </div>
            <div className="ai-no-answer-mark" aria-hidden="true">
              ?
            </div>
          </div>
        )
      ) : (
        <div className="answer-body">
          {result?.reviewNote && (
            <div className="inline-note warning">
              <span>这条知识正在被老师完善：{result.reviewNote}</span>
            </div>
          )}
          {displayAnswer && <CollapsibleRichText text={displayAnswer} />}
          <FaqAttachments
            attachments={sourceFaqs[0]?.attachments}
            caption="这条知识附带的图片与资料"
          />
        </div>
      )}

      {!isLow && thread.aiAnswer && sourceFaqs.length > 0 && onTeach && (
        <div className="teach-entry">
          <span className="teach-entry-mark">
            <GraduationCap size={16} />
          </span>
          <div className="teach-entry-copy">
            <strong>{mentorTopic ? '还没完全懂？让导师先诊断' : '还没完全懂？'}</strong>
            <span>
              {mentorTopic
                ? '先定位卡点，再讲关键一步、误区和一道迁移题。'
                : '让 AI 把这答案讲成一节课：结论 → 拆解 → 例子 → 自测。'}
            </span>
          </div>
          <button className="button button-secondary" onClick={onTeach}>
            {mentorTopic ? '导师讲一讲' : '讲一讲'}
          </button>
        </div>
      )}

      {sourceFaqs.length > 0 && (
        <div className="source-block">
          <div className="source-caption">
            <BookOpen size={14} />
            本次引用
          </div>
          <div className="source-list">
            {sourceFaqs.map((faq) => (
              <button className="source-card" key={faq.id} onClick={() => onOpenFaq(faq.id)}>
                <span className="source-card-icon">
                  <BookOpen size={15} />
                </span>
                <span className="source-card-copy">
                  <strong>{faq.question}</strong>
                  <span>
                    {course.shortName} · {faq.author}维护
                  </span>
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </div>
      )}

      {isLow && closest && !hasExternal && (
        <div className="closest-block">
          <div className="closest-caption">它查到的相近内容 · 相关度不足，只作为线索</div>
          <button className="closest-card" onClick={() => onOpenFaq(closest.id)}>
            <span className="closest-icon">
              <CornerDownRight size={15} />
            </span>
            <span>
              <strong>{closest.question}</strong>
              <span>不能直接当答案，需要老师确认</span>
            </span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      <footer className="answer-foot">
        {isNeedsInfo ? (
          <div className="answer-state-note is-info">
            <CircleAlert size={15} />
            <span>
              {course.teacher}老师请你补充信息
              <em>{thread.teacherRequest?.text ?? '点开记录查看老师的要求。'}</em>
            </span>
            {onOpenDetail && (
              <button className="text-button answer-supplement-button" onClick={onOpenDetail}>
                去补充
              </button>
            )}
          </div>
        ) : isPending ? (
          <div className="answer-state-note">
            <Clock3 size={15} />
            <span>
              {thread.escalation?.auto
                ? `AI 没把握，已自动转交${course.teacher}老师`
                : `已转交${course.teacher}老师`}
              {thread.escalation && ` · 优先级：${thread.escalation.urgency === 'today' ? '今天要用' : thread.escalation.urgency === 'week' ? '本周内' : '不着急'}`}
              <em>
                {hasExternal ? '服务端 AI 补充、问题摘要与依据已附上' : 'AI 已附上问题摘要与依据'}
              </em>
            </span>
            {onSupplement && (
              <button className="text-button answer-supplement-button" onClick={onSupplement}>
                补充说明
              </button>
            )}
          </div>
        ) : isAnswered ? (
          <div className="answer-state-note is-answered">
            <ShieldCheck size={15} />
            <span>
              {course.teacher}老师已经回复，请查看下方对话。
              <em>
                {thread.resolvedAt
                  ? '你已确认这次答疑解决了问题，记录会进入答疑洞察。'
                  : '看完回复后确认一下，AI 才知道这条答案真的有用。'}
              </em>
            </span>
            {onResolve && (
              <button
                className={`answer-resolve-button ${thread.resolvedAt ? 'is-done' : ''}`}
                onClick={() => onResolve(!thread.resolvedAt)}
              >
                <Check size={14} />
                {thread.resolvedAt ? '撤销确认' : '已解决'}
              </button>
            )}
          </div>
        ) : isLow ? (
          <div className="answer-actions answer-actions-fill">
            <button className="button button-escalate" onClick={onEscalate}>
              {hasExternal ? '转交老师确认' : `转交${course.teacher}老师`}
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <FeedbackButtons
              value={thread.feedback}
              onChange={onFeedback}
              reason={thread.feedbackReason}
              onReasonChange={onFeedbackReason}
            />
            <div className="answer-actions">
              {confidence === 'medium' ? (
                <button className="button button-secondary" onClick={onEscalate}>
                  转交{course.teacher}老师确认
                  <ArrowRight size={15} />
                </button>
              ) : (
                <button className="text-button" onClick={onEscalate}>
                  仍有疑问，转交老师
                  <ArrowRight size={14} />
                </button>
              )}
              {onResolve && !thread.resolvedAt && (
                <button className="answer-resolve-button" onClick={() => onResolve(true)}>
                  <Check size={14} />
                  解决了
                </button>
              )}
              {onResolve && thread.resolvedAt && (
                <span className="answer-resolved-flag">
                  <Check size={14} />
                  已确认解决
                  <button className="text-button" onClick={() => onResolve(false)}>
                    撤销
                  </button>
                </span>
              )}
            </div>
          </>
        )}
      </footer>

      {onFollowUpChat && !thread.withdrawnAt && (
        <section className={`answer-chat ${chatOpen ? 'is-open' : ''}`}>
          {chatOpen && (
            <div className="answer-chat-head">
              <strong>继续对话</strong>
              <span>会带着这条回答和上下文</span>
            </div>
          )}
          {chatMessages.length > 0 && (
            <div className="answer-chat-messages">
              {chatMessages.map((message, index) => (
                <div
                  className={`answer-chat-row is-${message.role}`}
                  key={`${message.role}-${index}`}
                >
                  <strong>{message.role === 'user' ? '你' : 'AI 助教'}</strong>
                  {message.role === 'assistant' ? (
                    <CollapsibleRichText text={message.text} variant="chat" />
                  ) : (
                    <RichText text={message.text} />
                  )}
                </div>
              ))}
              {chatBusy && <p className="answer-chat-typing">AI 正在接着想…</p>}
            </div>
          )}
          {chatError && <p className="answer-chat-error">{chatError}</p>}
          {chatOpen ? (
            <form className="answer-chat-form" onSubmit={submitChat}>
              <input
                ref={chatInputRef}
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                placeholder="接着问，比如：这一步为什么要先检查先修？"
                aria-label="继续对话"
                disabled={chatBusy}
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
          ) : (
            <button type="button" className="answer-chat-entry" onClick={openChat}>
              <span className="answer-chat-mark">
                <MessageCircle size={16} />
              </span>
              <span className="answer-chat-copy">
                <strong>继续对话</strong>
              </span>
              <ArrowRight size={15} />
            </button>
          )}
        </section>
      )}
    </article>
  )
}
