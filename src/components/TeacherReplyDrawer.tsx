import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  CornerDownRight,
  ImagePlus,
  Loader2,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { answerWithExternalAI, errorMessage, fetchAIStatus, rewriteTeacherReply } from '../lib/ai'
import { imageUrlToDataUrl, prepareImage, uploadThreadImage } from '../lib/image'
import { mentorBriefForCourse } from '../data/mentor'
import { courseById } from '../data/seed'
import type { Faq, ThreadAttachment, ThreadGroup } from '../types'
import {
  groupPendingThreads,
  makeDraft,
  questionSimilarity,
  retrieve,
} from '../lib/engine'
import {
  confidenceLabel,
  displayStudentName,
  excerpt,
  formatRelative,
  makeId,
  statusLabel,
  urgencyLabel,
} from '../lib/utils'
import {
  AiMark,
  Avatar,
  Badge,
  ConfidenceMeter,
  Drawer,
  Seal,
} from './ui'

interface TeacherReplyDrawerProps {
  group: ThreadGroup | null
  onClose: () => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  openFaq: (faqId: string) => void
}

function cleanReplyForFaq(text: string) {
  const cleaned = text
    .replace(/\n+——\s*[^\n]{1,20}\s*$/u, '')
    .replace(/^(几位同学好|同学你好)[\s\S]*?[：:]\s*\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const paragraphs = cleaned.split(/\n{2,}/)
  if (paragraphs.length > 1 && /^如果还卡住/.test(paragraphs[paragraphs.length - 1])) {
    paragraphs.pop()
  }
  return paragraphs.join('\n\n').trim()
}

const INFO_PRESETS = [
  '请上传题目原图或完整题面',
  '请写一下你已经试过的步骤',
  '请说明具体卡在哪一步',
  '请补充题号、课程或相关条件',
]

export function TeacherReplyDrawer({
  group,
  onClose,
  notify,
  openFaq,
}: TeacherReplyDrawerProps) {
  const { data, dispatch } = useStore()
  const [draft, setDraft] = useState('')
  const [sediment, setSediment] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [infoMode, setInfoMode] = useState(false)
  const [infoText, setInfoText] = useState('')
  const [splitArmId, setSplitArmId] = useState<string | null>(null)
  const [replyAttachment, setReplyAttachment] = useState<ThreadAttachment | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [aiReady, setAiReady] = useState(false)
  const [aiVision, setAiVision] = useState(false)
  const [rewriting, setRewriting] = useState<'shorter' | 'clearer' | null>(null)
  const [readingImage, setReadingImage] = useState(false)
  const replyFileRef = useRef<HTMLInputElement>(null)
  const previousAutoDraft = useRef('')

  const course = group ? courseById(group.courseId) : null
  const isFollowUp = group?.primary.kind === 'follow-up'
  const selectedThreads = useMemo(
    () => group?.threads.filter((thread) => selectedIds.includes(thread.id)) ?? [],
    [group, selectedIds],
  )
  const selectedAttachment = useMemo(
    () =>
      selectedThreads.find((thread) => thread.attachment?.url || thread.attachment?.dataUrl)
        ?.attachment ?? null,
    [selectedThreads],
  )
  const parentThread = useMemo(
    () =>
      group?.primary.parentThreadId
        ? data.threads.find((thread) => thread.id === group.primary.parentThreadId)
        : undefined,
    [group, data.threads],
  )
  const result = useMemo(
    () => (group ? retrieve(data.faqs, group.primary.question, group.courseId) : null),
    [group, data.faqs],
  )
  const aiDraft = useMemo(() => {
    if (!group || !course) return ''
    if (isFollowUp) {
      const previous = parentThread?.teacherReply?.text
        ? cleanReplyForFaq(parentThread.teacherReply.text)
        : ''
      return previous
        ? `同学你好，我看到了你的追问。上次我讲到：\n\n${excerpt(previous, 90)}\n\n这次你卡在「${group.primary.question.slice(0, 60)}」，我再用一个更具体的例子说明：\n\n（在这里补充你的解释）\n\n—— ${course.teacher}`
        : `同学你好，我看到了你的追问。这次你卡在「${group.primary.question.slice(0, 60)}」，我再解释一下：\n\n（在这里补充你的解释）\n\n—— ${course.teacher}`
    }
    return result
      ? makeDraft(
          group.primary.question,
          result,
          course.teacher,
          Math.max(1, selectedThreads.length),
        )
      : ''
  }, [group, result, course, isFollowUp, parentThread, selectedThreads.length])

  useEffect(() => {
    if (!group) return
    setDraft(aiDraft)
    setSediment(!isFollowUp)
    setSelectedIds(group.threads.map((thread) => thread.id))
    setInfoMode(false)
    setInfoText('')
    setSplitArmId(null)
    setReplyAttachment(null)
    setUploadingAttachment(false)
    previousAutoDraft.current = aiDraft
  }, [group?.key])

  useEffect(() => {
    if (!group) return
    let cancelled = false
    void fetchAIStatus()
      .then((status) => {
        if (!cancelled) {
          setAiReady(status.configured)
          setAiVision(Boolean(status.vision))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAiReady(false)
          setAiVision(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [group?.key])

  useEffect(() => {
    if (!group) return
    const previous = previousAutoDraft.current
    setDraft((current) => (current === previous || !current ? aiDraft : current))
    previousAutoDraft.current = aiDraft
  }, [aiDraft, group?.key])

  const qualityWarnings = useMemo(() => {
    const text = draft.trim()
    if (!text) return []
    const warnings: string[] = []
    if (text.length < 40) warnings.push('回复偏短，确认关键步骤讲清楚了')
    const missing = (result?.missingTerms ?? []).filter((term) => !text.includes(term))
    if (missing.length > 0) {
      warnings.push(`未覆盖学生问题里的：${missing.slice(0, 3).join('、')}`)
    }
    if (!/(例如|比如|举例|例：|例题|以.{1,12}为例|图|画)/.test(text)) {
      warnings.push('没有例子、图示或具体题面，必要时补一个')
    }
    if (!/(注意|前提|条件|边界|误区|不要|容易)/.test(text)) {
      warnings.push('没有提醒适用条件或易错点')
    }
    if (text.length > 700) warnings.push('回复较长，可以拆成关键步骤')
    return warnings.slice(0, 4)
  }, [draft, result])

  const mergeSuggestions = useMemo(() => {
    if (!group) return []
    return groupPendingThreads(data.threads)
      .filter(
        (item) =>
          item.courseId === group.courseId &&
          item.key !== group.key &&
          item.primary.kind !== 'follow-up',
      )
      .map((item) => ({
        group: item,
        similarity: questionSimilarity(group.primary.question, item.primary.question, group.courseId),
      }))
      .filter((item) => item.similarity >= 0.16)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
  }, [data.threads, group])

  if (!group || !course || !result) return null

  const isLow = group.primary.confidence === 'low'
  const closestFaq = group.primary.closestSource
    ? data.faqs.find((faq) => faq.id === group.primary.closestSource)
    : undefined
  const sourceFaq = isLow ? closestFaq : result.top?.faq
  const sourceForDisplay = sourceFaq
  const faqQuestion = /[？?]$/.test(group.title) ? group.title : `${group.title}？`
  const faqTags = Array.from(
    new Set([
      ...(sourceFaq?.tags.slice(0, 3) ?? []),
      course.shortName,
      '答疑沉淀',
    ]),
  ).slice(0, 5)
  const reviewFaq = group.sourceFaqIds
    .map((id) => data.faqs.find((faq) => faq.id === id))
    .find((faq): faq is Faq => Boolean(faq?.reviewNeeded))

  const send = () => {
    const text = draft.trim()
    if (selectedThreads.length === 0) {
      notify('先选择本次要回复的同学', 'danger')
      return
    }
    if (!text) {
      notify('回复内容不能为空', 'danger')
      return
    }
    if (isFollowUp && text.includes('（在这里补充你的解释）')) {
      notify('先把追问的补充讲解写完整，再发送', 'danger')
      return
    }
    const now = Date.now()
    // Anonymous students' wording must not leak through FAQ aliases.
    const questionAliases = Array.from(
      new Set(
        selectedThreads
          .filter((thread) => !thread.student.anonymous && !thread.escalation?.anonymous)
          .map((thread) => thread.question),
      ),
    )
    let faq: Faq | undefined
    let sedimentPrevious: Faq | null | undefined

    if (sediment) {
      if (reviewFaq) {
        sedimentPrevious = reviewFaq
        faq = {
          ...reviewFaq,
          aliases: Array.from(new Set([...reviewFaq.aliases, ...questionAliases])),
          answer: cleanReplyForFaq(text),
          tags: Array.from(new Set([...reviewFaq.tags, ...faqTags])).slice(0, 6),
          author: course.teacher,
          source: 'sediment',
          updatedAt: now,
          reviewNeeded: false,
          reviewNote: undefined,
          chapter: reviewFaq.chapter ?? sourceFaq?.chapter,
        }
      } else {
        sedimentPrevious = null
        faq = {
          id: makeId('faq'),
          courseId: group.courseId,
          question: faqQuestion,
          aliases: questionAliases,
          answer: cleanReplyForFaq(text),
          tags: faqTags,
          author: course.teacher,
          source: 'sediment',
          createdAt: now,
          updatedAt: now,
          citations: 0,
          helpful: 0,
          unhelpful: 0,
          recentUnhelpful: 0,
          chapter: sourceFaq?.chapter,
        }
      }
    }

    dispatch({
      type: 'teacher-reply',
      threadIds: selectedThreads.map((thread) => thread.id),
      reply: {
        text,
        at: now,
        by: course.teacher,
        faqId: faq?.id,
        recipientCount: selectedThreads.length,
        sedimentPrevious,
        attachment: replyAttachment ?? undefined,
      },
      faq,
    })
    notify(
      sediment
        ? reviewFaq
          ? `已回复 ${selectedThreads.length} 位同学，并更新了课程 FAQ`
          : `已回复 ${selectedThreads.length} 位同学，答案已沉淀为 FAQ`
        : `已回复 ${selectedThreads.length} 位同学`,
    )
    onClose()
  }

  const handleReplyImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploadingAttachment(true)
    try {
      const prepared = await prepareImage(file)
      const uploaded = await uploadThreadImage(prepared)
      setReplyAttachment({
        url: uploaded.url,
        name: uploaded.name,
        type: uploaded.type,
      })
      notify('回复图片已上传，会随回复一起发给学生', 'success')
    } catch (error) {
      notify(errorMessage(error), 'danger')
    } finally {
      setUploadingAttachment(false)
    }
  }

  const rewriteDraft = async (style: 'shorter' | 'clearer') => {
    const text = draft.trim()
    if (!text || rewriting) return
    if (!aiReady) {
      notify('服务端 AI 未配置，暂时不能生成草稿版本', 'info')
      return
    }
    setRewriting(style)
    try {
      const next = await rewriteTeacherReply({ text, style })
      setDraft(next)
      notify(style === 'shorter' ? '已生成更短版本' : '已生成更清楚的版本', 'success')
    } catch (error) {
      notify(errorMessage(error), 'danger')
    } finally {
      setRewriting(null)
    }
  }

  const draftFromAttachment = async () => {
    if (!group || !course || !selectedAttachment || readingImage) return
    if (!aiReady || !aiVision) {
      notify('当前模型未开启图片识别，请管理员在管理端打开', 'info')
      return
    }
    setReadingImage(true)
    try {
      const imageDataUrl = await imageUrlToDataUrl(
        selectedAttachment.url ?? selectedAttachment.dataUrl,
      )
      const ai = await answerWithExternalAI({
        question: group.primary.question || '请根据学生上传的题图解答',
        courseName: course.name,
        localContext: '',
        mentorBrief: mentorBriefForCourse(course.id),
        imageDataUrl,
      })
      if (ai.text) setDraft(ai.text)
      notify('已根据学生题图生成 AI 草稿，请核对后发送', 'success')
    } catch (error) {
      notify(errorMessage(error), 'danger')
    } finally {
      setReadingImage(false)
    }
  }

  const requestInfo = () => {    const text = infoText.trim()
    if (selectedThreads.length === 0) {
      notify('先选择要请谁补充信息', 'danger')
      return
    }
    if (!text) {
      notify('写清楚需要学生补充什么', 'danger')
      return
    }
    dispatch({
      type: 'teacher-info-request',
      threadIds: selectedThreads.map((thread) => thread.id),
      request: {
        text,
        at: Date.now(),
        by: course.teacher,
      },
    })
    notify(`已请 ${selectedThreads.length} 位同学补充信息`)
    onClose()
  }

  const splitThread = (threadId: string) => {
    if (splitArmId !== threadId) {
      setSplitArmId(threadId)
      return
    }
    dispatch({
      type: 'thread-group-set',
      threadIds: [threadId],
      clusterId: `manual-${threadId}`,
      groupLocked: true,
    })
    notify('已把这个问题移出同题组，回复范围也会跟着更新')
    onClose()
  }

  const mergeGroup = (other: ThreadGroup) => {
    const ids = [...new Set([...group.threads, ...other.threads].map((thread) => thread.id))]
    dispatch({
      type: 'thread-group-set',
      threadIds: ids,
      clusterId: `manual-${group.primary.id}`,
      groupLocked: true,
    })
    notify(`已合并 ${ids.length} 位同学到同一组`)
    onClose()
  }

  const unlockGroup = () => {
    dispatch({
      type: 'thread-group-set',
      threadIds: group.threads.map((thread) => thread.id),
      clusterId: null,
      groupLocked: false,
    })
    notify('已恢复自动合并，相似问题会重新聚类', 'info')
    onClose()
  }

  return (
    <Drawer open onClose={onClose} ariaLabel={`处理 ${group.title}`}>
      <header className="drawer-head">
        <div className="drawer-head-main">
          <div className="eyebrow">
            {course.name} · {course.code}
          </div>
          <h2>
            {isFollowUp
              ? '接着上一次，讲清楚这次追问'
              : group.count > 1
                ? `${group.count} 位同学，同一个卡点`
                : '把这一个问题讲透'}
          </h2>
          <div className="drawer-head-tags">
            <Badge tone={group.urgency === 'today' ? 'danger' : 'neutral'} dot>
              {urgencyLabel(group.urgency)}
            </Badge>
            {isFollowUp ? (
              <Badge tone="blue">追问 · 人工跟进</Badge>
            ) : (
              <Badge
                tone={
                  group.primary.confidence === 'high'
                    ? 'high'
                    : group.primary.confidence === 'medium'
                      ? 'medium'
                      : 'low'
                }
                dot
              >
                AI {confidenceLabel(group.primary.confidence)}
              </Badge>
            )}
            {group.count > 1 && (
              <Badge tone="gold">
                <Users size={12} />
                同题合并 {group.count} 人
              </Badge>
            )}
            {group.locked && <Badge tone="blue">手动分组</Badge>}
          </div>
        </div>
        <button className="icon-button drawer-close" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
      </header>

      <div className="drawer-body">
        <section className="drawer-section">
          <div className="drawer-section-head">
            <span>同学们的问题</span>
            <span className="drawer-section-note">
              {group.count} 人 · {group.anonymousCount > 0 ? `含 ${group.anonymousCount} 位匿名` : '全部实名'}
            </span>
          </div>
          {group.threads.length > 1 && (
            <div className="reply-scope-bar">
              <span>
                本次处理 <strong>{selectedThreads.length}</strong> / {group.threads.length} 人
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setSelectedIds(
                    selectedThreads.length === group.threads.length
                      ? []
                      : group.threads.map((thread) => thread.id),
                  )
                }
              >
                {selectedThreads.length === group.threads.length ? '取消全选' : '全选'}
              </button>
            </div>
          )}
          <div className="teacher-question-list">
            {group.threads.map((thread) => {
              const anonymous = thread.escalation?.anonymous || thread.student.anonymous
              const history = anonymous
                ? []
                : data.threads
                    .filter(
                      (item) =>
                        item.courseId === group.courseId &&
                        item.student.id === thread.student.id &&
                        !group.threads.some((member) => member.id === item.id),
                    )
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .slice(0, 3)
              return (
                <div className="teacher-question" key={thread.id}>
                  <Avatar
                    name={thread.student.name}
                    anonymous={anonymous}
                    tone="jade"
                    size="sm"
                  />
                  <div className="teacher-question-copy">
                    <div className="teacher-question-head">
                      <strong>{displayStudentName(thread, true)}</strong>
                      <span>{formatRelative(thread.createdAt)}</span>
                      {thread.kind === 'same' && <Badge tone="gold">同问</Badge>}
                      {thread.kind === 'follow-up' && <Badge tone="blue">追问</Badge>}
                      {thread.attachment && <Badge tone="outline">图片</Badge>}
                      {thread.externalAnswer && <Badge tone="blue">AI 补充</Badge>}
                      {thread.escalation?.auto && <Badge tone="clay">AI 自动转交</Badge>}
                      {thread.escalation?.urgency === 'today' && (
                        <Badge tone="danger">今天要用</Badge>
                      )}
                      <label className="reply-scope-check">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(thread.id)}
                          onChange={() =>
                            setSelectedIds((current) =>
                              current.includes(thread.id)
                                ? current.filter((id) => id !== thread.id)
                                : [...current, thread.id],
                            )
                          }
                        />
                        本次处理
                      </label>
                      {group.threads.length > 1 && (
                        <button
                          type="button"
                          className={`text-button reply-split-button ${splitArmId === thread.id ? 'is-armed' : ''}`}
                          onClick={() => splitThread(thread.id)}
                          title="把这个问题从当前同题组移出"
                        >
                          {splitArmId === thread.id ? '确认移出' : '移出本组'}
                        </button>
                      )}
                    </div>
                    <p>{thread.question}</p>
                    {thread.attachment && (
                      <a
                        className="teacher-question-image-link"
                        href={thread.attachment.url ?? thread.attachment.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="查看原图"
                      >
                        <img
                          className="teacher-question-image"
                          src={thread.attachment.url ?? thread.attachment.dataUrl}
                          alt="学生上传的题目图片"
                        />
                      </a>
                    )}
                    {thread.externalAnswer && (
                      <details className="teacher-question-external">
                        <summary>已用服务端 AI 补充（非课程依据）</summary>
                        <p>{thread.externalAnswer.text}</p>
                      </details>
                    )}
                    {thread.escalation?.note && (
                      <span className="teacher-question-note">
                        <CornerDownRight size={12} />
                        {thread.escalation.note}
                      </span>
                    )}
                    {thread.teacherRequest && (
                      <span className="teacher-question-request">
                        你曾请学生补充：{thread.teacherRequest.text}
                      </span>
                    )}
                    {thread.studentSupplement && (
                      <div className="teacher-question-supplement">
                        <span>
                          学生补充 · {formatRelative(thread.studentSupplement.at)}
                        </span>
                        <p>{thread.studentSupplement.text}</p>
                      </div>
                    )}
                    {history.length > 0 && (
                      <details className="student-history">
                        <summary>该生本课程历史 {history.length} 条</summary>
                        <div className="student-history-list">
                          {history.map((item) => (
                            <div className="student-history-row" key={item.id}>
                              <span>{excerpt(item.question, 54)}</span>
                              <em>
                                {statusLabel(item)} · {formatRelative(item.createdAt)}
                              </em>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <details className="group-tools">
          <summary>
            <span>调整同题组</span>
            <em>{group.locked ? '手动分组中' : '自动合并中'}</em>
          </summary>
          <div className="group-tools-body">
            <p>
              自动合并可能把不同卡点并在一起。移出后，这位同学会单独成组；合并后，一次回复会发给两组同学。
            </p>
            {group.locked && (
              <button type="button" className="button button-ghost group-unlock" onClick={unlockGroup}>
                恢复自动合并
              </button>
            )}
            {mergeSuggestions.length > 0 ? (
              <div className="group-suggest-list">
                <span className="group-suggest-label">可能同题的其他组</span>
                {mergeSuggestions.map(({ group: other, similarity }) => (
                  <div className="group-suggest-row" key={other.key}>
                    <span>
                      <strong>{other.title}</strong>
                      <em>
                        {other.count} 人 · 相关度 {Math.round(similarity * 100)}%
                      </em>
                    </span>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => mergeGroup(other)}
                    >
                      合并到本组
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="group-tools-empty">同课程暂时没有其他相似待办组。</p>
            )}
          </div>
        </details>

        {isFollowUp ? (
          <section className="followup-context">
            <div className="followup-context-head">
              <CornerDownRight size={15} />
              <strong>上一次的答疑</strong>
              <span>追问会带着这段上下文</span>
            </div>
            {parentThread ? (
              <>
                <p className="followup-context-question">{parentThread.question}</p>
                <div className="followup-context-reply">
                  <Avatar
                    name={parentThread.teacherReply?.by ?? course.teacher}
                    tone="gold"
                    size="xs"
                  />
                  <div>
                    <strong>
                      {parentThread.teacherReply?.by ?? course.teacher}老师上次回复
                    </strong>
                    <p>{parentThread.teacherReply?.text ?? '上一次没有文字回复。'}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="followup-context-question">没有找到上一次的记录，但这是一次追问。</p>
            )}
            <div className="inline-note warning">
              AI 没有重复作答。请接着上一次的讲解，把这次卡点补清楚。
            </div>
          </section>
        ) : (
          <section className={`ai-reference ${isLow ? 'is-low' : ''}`}>
            <div className="ai-reference-head">
              <div className="ai-reference-title">
                <AiMark size={16} />
                <strong>AI 检索与判断</strong>
              </div>
              <ConfidenceMeter confidence={group.primary.confidence} />
            </div>
            <p className="ai-reference-reason">
              {isLow && <CircleAlert size={14} />}
              {isLow
                ? result.reason
                : group.primary.confidence === 'medium'
                  ? '课程知识库有相关内容，但当时的置信度不足，建议核对后再发送。'
                  : '找到高度相关的课程知识，草稿基本沿用了老师原来的讲法。'}
            </p>

            {sourceForDisplay && (
              <button className="ai-source-card" onClick={() => openFaq(sourceForDisplay.id)}>
                <span className="ai-source-icon">
                  <BookOpen size={15} />
                </span>
                <span className="ai-source-copy">
                  <strong>{sourceForDisplay.question}</strong>
                  <span>
                    {isLow
                      ? '相关度不足，只作为线索'
                      : `${sourceForDisplay.author}维护 · 被引用 ${sourceForDisplay.citations} 次`}
                  </span>
                </span>
                <ArrowRight size={14} />
              </button>
            )}

            {result.reviewNote && (
              <div className="inline-note warning">
                {result.reviewNote}
              </div>
            )}

            {group.primary.confidence === 'high' && (
              <div className="ai-safe-note">
                <Check size={14} />
                知识库有充分依据，可以直接参考。
              </div>
            )}
          </section>
        )}

        {infoMode ? (
          <section className="drawer-section info-request-panel">
            <div className="drawer-section-head">
              <span className="draft-heading">
                <CircleAlert size={15} />
                请学生补充信息
              </span>
              <span className="drawer-section-note">学生补充后自动回到待办</span>
            </div>
            <div className="info-preset-row">
              {INFO_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`info-preset ${infoText === preset ? 'is-active' : ''}`}
                  onClick={() => setInfoText(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              className="input textarea info-request-text"
              value={infoText}
              onChange={(event) => setInfoText(event.target.value)}
              rows={6}
              placeholder="写清楚需要学生补什么，例如：请上传第 3 题的完整题面，并写出你已经试到哪一步。"
              aria-label="请学生补充的信息"
            />
            <p className="draft-meta">
              <span>只发送给本次勾选的同学；匿名同学只会看到“匿名同学”。</span>
              <span>{infoText.length} 字</span>
            </p>
          </section>
        ) : (
          <>
            <button
              className={`sediment-toggle ${sediment ? 'is-on' : ''}`}
              onClick={() => setSediment(!sediment)}
              aria-pressed={sediment}
              type="button"
            >
              <span className="sediment-checkbox">{sediment && <Check size={14} />}</span>
              <span className="sediment-copy">
                <strong>回复后沉淀为课程 FAQ</strong>
                <span>
                  同步给 {selectedThreads.length} 位同学，AI 下次直接命中；
                  {reviewFaq ? `更新「${reviewFaq.question}」` : `自动生成「${faqQuestion}」`}。
                </span>
              </span>
              {sediment && <Seal className="seal-small">AI 会学会</Seal>}
            </button>

            {reviewFaq && sediment && (
              <div className="inline-note success">
                会用你改后的答案更新《{reviewFaq.question}》，并解除“待完善”标记。
              </div>
            )}

            <section className="drawer-section">
              <div className="drawer-section-head">
                <span className="draft-heading">
                  {isFollowUp ? <CornerDownRight size={15} /> : <Sparkles size={15} />}
                  {isFollowUp ? '回复追问' : 'AI 建议回复'}
                </span>
                <div className="draft-head-actions">
                  <button className="text-button" onClick={() => setDraft(aiDraft)}>
                    {isFollowUp ? '恢复追问框架' : '恢复 AI 草稿'}
                  </button>
                  {aiVision && selectedAttachment && (
                    <button
                      className="text-button draft-variant"
                      onClick={() => void draftFromAttachment()}
                      disabled={readingImage || rewriting !== null}
                      title="读取学生题图并生成 AI 草稿"
                    >
                      {readingImage ? <Loader2 size={12} className="spin-icon" /> : <ImagePlus size={12} />}
                      看图起草
                    </button>
                  )}
                  <button
                    className="text-button draft-variant"
                    onClick={() => void rewriteDraft('shorter')}
                    disabled={!aiReady || !draft.trim() || rewriting !== null}
                    title={aiReady ? '生成更短的回复' : '服务端 AI 未配置'}
                  >
                    {rewriting === 'shorter' ? <Loader2 size={12} className="spin-icon" /> : null}
                    更短
                  </button>
                  <button
                    className="text-button draft-variant"
                    onClick={() => void rewriteDraft('clearer')}
                    disabled={!aiReady || !draft.trim() || rewriting !== null}
                    title={aiReady ? '生成结构更清楚的回复' : '服务端 AI 未配置'}
                  >
                    {rewriting === 'clearer' ? <Loader2 size={12} className="spin-icon" /> : null}
                    更清楚
                  </button>
                </div>
              </div>
              <textarea
                className="input textarea reply-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={9}
                aria-label="回复内容"
              />
              {draft.trim() && (
                <div className={`reply-quality ${qualityWarnings.length > 0 ? 'has-warning' : 'is-clear'}`}>
                  <div className="reply-quality-head">
                    {qualityWarnings.length > 0 ? <CircleAlert size={13} /> : <Check size={13} />}
                    <strong>发送前自检</strong>
                  </div>
                  {qualityWarnings.length > 0 ? (
                    <ul>
                      {qualityWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : (
                    <span>关键点基本覆盖，可以发送。</span>
                  )}
                </div>
              )}
              {replyAttachment && (
                <div className="reply-attachment">
                  <img src={replyAttachment.url} alt="老师回复附图" />
                  <span>{replyAttachment.name}</span>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setReplyAttachment(null)}
                    aria-label="移除回复图片"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="draft-meta">
                <span>可以直接修改，学生最终看到的是这段文字。</span>
                <div className="draft-meta-actions">
                  <input
                    ref={replyFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleReplyImage}
                    hidden
                  />
                  <button
                    type="button"
                    className="text-button reply-image-button"
                    onClick={() => replyFileRef.current?.click()}
                    disabled={uploadingAttachment}
                  >
                    <ImagePlus size={13} />
                    {uploadingAttachment ? '上传中…' : '附图'}
                  </button>
                  <span>{draft.length} 字</span>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <footer className="drawer-foot">
        <div className="drawer-foot-copy">
          <strong>
            {infoMode
              ? `将请 ${selectedThreads.length} 位同学补充`
              : `将回复 ${selectedThreads.length} 位同学`}
          </strong>
          <span>
            {infoMode
              ? '学生补充后自动回到待办'
              : sediment
                ? reviewFaq
                  ? '并更新 1 条课程 FAQ'
                  : '并新增 1 条课程 FAQ'
                : '本次不更新知识库'}
          </span>
        </div>
        <div className="drawer-foot-actions">
          {infoMode ? (
            <>
              <button className="button button-ghost" onClick={() => setInfoMode(false)}>
                返回回复
              </button>
              <button
                className="button button-primary drawer-send"
                onClick={requestInfo}
                disabled={!infoText.trim() || selectedThreads.length === 0}
              >
                <CircleAlert size={16} />
                发送补充要求
              </button>
            </>
          ) : (
            <>
              <button
                className="text-button info-request-entry"
                onClick={() => setInfoMode(true)}
                disabled={selectedThreads.length === 0}
              >
                <CircleAlert size={14} />
                请学生补充
              </button>
              <button
                className="button button-primary drawer-send"
                onClick={send}
                disabled={selectedThreads.length === 0 || uploadingAttachment}
              >
                <Send size={16} />
                {sediment ? '发送并沉淀' : '发送回复'}
              </button>
            </>
          )}
        </div>
      </footer>
    </Drawer>
  )
}
