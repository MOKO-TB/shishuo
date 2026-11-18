import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  Clock3,
  CornerDownRight,
  GraduationCap,
  KeyRound,
  ShieldCheck,
} from 'lucide-react'
import { useStore } from '../store'
import { courseById } from '../data/seed'
import { findMentorTopic, mentorForCourse } from '../data/mentor'
import type { AnswerResult, Thread } from '../types'
import {
  confidenceDescription,
  confidenceLabel,
  formatRelative,
} from '../lib/utils'
import {
  AiMark,
  Badge,
  ConfidenceMeter,
  FeedbackButtons,
  RichText,
} from './ui'

interface AnswerCardProps {
  thread: Thread
  result?: AnswerResult
  onEscalate: () => void
  onSupplement?: () => void
  onFeedback: (feedback: 'helpful' | 'unhelpful') => void
  onResolve?: (resolved: boolean) => void
  onOpenFaq: (faqId: string) => void
  onTeach?: () => void
  onOpenDetail?: () => void
}

export function AnswerCard({
  thread,
  result,
  onEscalate,
  onSupplement,
  onFeedback,
  onResolve,
  onOpenFaq,
  onTeach,
  onOpenDetail,
}: AnswerCardProps) {
  const { data } = useStore()
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
  const reason =
    result?.reason ??
    (isLow
      ? '课程知识库里没有足够可靠的依据，AI 没有生成答案。'
      : confidence === 'medium'
        ? '找到了相关内容，但依据还不够完整，建议请老师确认。'
        : '答案来自课程知识库中的老师维护内容，可以直接参考。')

  return (
    <article className={`answer-card answer-${confidence}`}>
      <header className="answer-head">
        <div className="answer-identity">
          <AiMark size={18} />
          <div>
            <div className="answer-name">
              <strong>AI 助教</strong>
              <span>课程知识库检索</span>
            </div>
            <div className="answer-sub">
              {course.shortName} · {formatRelative(thread.createdAt)}
              {thread.attachment ? ' · 含图片' : ''}
            </div>
          </div>
        </div>
        <div className="answer-confidence">
          <Badge
            tone={confidence === 'high' ? 'high' : confidence === 'medium' ? 'medium' : 'low'}
            dot
          >
            {confidenceLabel(confidence)}
          </Badge>
          <ConfidenceMeter confidence={confidence} compact />
        </div>
      </header>

      <div className={`answer-reason answer-reason-${confidence}`}>
        {isLow ? <CircleAlert size={15} /> : <ShieldCheck size={15} />}
        <span>{reason}</span>
      </div>

      {isLow ? (
        hasExternal ? (
          <div className="external-answer">
            <div className="external-answer-head">
              <span className="external-answer-icon">
                <KeyRound size={16} />
              </span>
              <div>
                <strong>服务端 AI 补充</strong>
                <span>{thread.externalAnswer?.model} · 非课程知识库</span>
              </div>
              <Badge tone="blue">外部模型</Badge>
            </div>
            <div className="inline-note warning">
              这条补充来自你配置的外部模型，未经过课程知识库和老师确认。需要权威结论时请转交老师。
            </div>
            {thread.externalAnswer && <RichText text={thread.externalAnswer.text} />}
            <div className="external-answer-foot">
              由服务端 AI 网关调用 · 建议核对后再使用
            </div>
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
          {displayAnswer && <RichText text={displayAnswer} />}
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
          <div className="answer-actions">
            <button className="button button-escalate" onClick={onEscalate}>
              {hasExternal ? '转交老师确认' : `转交${course.teacher}老师`}
              <ArrowRight size={16} />
            </button>
            <span className="answer-action-hint">
              {hasExternal ? '外部模型补充 · 建议老师核对' : confidenceDescription(confidence)}
            </span>
          </div>
        ) : (
          <>
            <FeedbackButtons value={thread.feedback} onChange={onFeedback} />
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
    </article>
  )
}
