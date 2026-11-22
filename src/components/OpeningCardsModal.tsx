import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Copy,
  Loader2,
  Megaphone,
  Presentation,
  Sparkles,
} from 'lucide-react'
import { errorMessage, fetchAIStatus, polishOpeningCardsWithAI } from '../lib/ai'
import {
  buildOpeningCards,
  formatOpeningCardsAnnouncement,
  type OpeningCard,
} from '../lib/teacherTools'
import { copyText } from '../lib/utils'
import type { Course, Faq, KnowledgeGap, Thread } from '../types'
import { Badge, EmptyState, Modal } from './ui'

interface OpeningCardsModalProps {
  open: boolean
  onClose: () => void
  courses: Course[]
  gaps: KnowledgeGap[]
  threads: Thread[]
  faqs: Faq[]
  initialCourseId?: string
  openFaq: (faqId: string) => void
  onFillAnnouncement: (courseId: string, text: string) => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

export function OpeningCardsModal({
  open,
  onClose,
  courses,
  gaps,
  threads,
  faqs,
  initialCourseId,
  openFaq,
  onFillAnnouncement,
  notify,
}: OpeningCardsModalProps) {
  const [courseId, setCourseId] = useState<string>('')
  const [customLines, setCustomLines] = useState<Record<string, string>>({})
  const [aiReady, setAiReady] = useState(false)
  const [polishing, setPolishing] = useState(false)

  useEffect(() => {
    if (!open || courses.length === 0) return
    const preferred =
      initialCourseId && courses.some((item) => item.id === initialCourseId)
        ? initialCourseId
        : courses[0].id
    setCourseId(preferred)
    setCustomLines({})
  }, [open, initialCourseId, courses])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void fetchAIStatus()
      .then((status) => {
        if (!cancelled) setAiReady(status.configured)
      })
      .catch(() => {
        if (!cancelled) setAiReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const activeCourse = courses.find((item) => item.id === courseId) ?? courses[0]
  const baseCards = useMemo(() => {
    if (!activeCourse) return []
    return buildOpeningCards(gaps, threads, faqs, [activeCourse.id])
  }, [activeCourse, gaps, threads, faqs])

  const cards: OpeningCard[] = useMemo(
    () =>
      baseCards.map((card) => ({
        ...card,
        oneLiner: customLines[card.id] ?? card.oneLiner,
      })),
    [baseCards, customLines],
  )

  const announcementText = useMemo(
    () => (cards.length > 0 ? formatOpeningCardsAnnouncement(cards, activeCourse?.shortName) : ''),
    [cards, activeCourse?.shortName],
  )

  const handleCopyAll = async () => {
    if (!announcementText) return
    const ok = await copyText(announcementText)
    notify(
      ok ? '已复制 3 条开场提示，可直接粘贴到课程公告或班级群' : '复制失败，请检查浏览器权限',
      ok ? 'success' : 'info',
    )
  }

  const handleFillAnnouncement = () => {
    if (!activeCourse || !announcementText) return
    onClose()
    onFillAnnouncement(activeCourse.id, announcementText)
  }

  const handlePolishWithAI = async () => {
    if (!activeCourse || cards.length === 0 || polishing) return
    setPolishing(true)
    try {
      const nextLines = await polishOpeningCardsWithAI({
        courseName: activeCourse.name,
        cards: cards.map((card) => ({
          topic: card.topic,
          gapDescription: card.gapDescription,
          oneLiner: card.oneLiner,
          relatedFaqQuestion: card.relatedFaq?.question,
        })),
      })
      const updates: Record<string, string> = {}
      cards.forEach((card, index) => {
        if (nextLines[index]) updates[card.id] = nextLines[index]
      })
      setCustomLines((prev) => ({ ...prev, ...updates }))
      notify('已用服务端 AI 润色 3 条课堂开场讲法', 'success')
    } catch (error) {
      notify(errorMessage(error), 'danger')
    } finally {
      setPolishing(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="基于知识缺口 · 课前 3 分钟"
      title="下节课开场卡"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            每条均包含「缺口描述 + 一句话讲法 + 关联 FAQ」，可直接复制到课程公告作为课前预告。
          </span>
          <div className="modal-actions-right">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void handleCopyAll()}
              disabled={cards.length === 0}
            >
              <Copy size={14} />
              复制文本
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleFillAnnouncement}
              disabled={cards.length === 0}
            >
              <Megaphone size={14} />
              一键复制到课程公告
            </button>
          </div>
        </div>
      }
    >
      <div className="opening-cards-modal">
        <div className="opening-cards-toolbar">
          <div className="course-filters">
            {courses.map((course) => (
              <button
                key={course.id}
                type="button"
                className={activeCourse?.id === course.id ? 'is-active' : ''}
                onClick={() => setCourseId(course.id)}
              >
                <span className={`course-dot accent-${course.accent}`} />
                {course.shortName}
              </button>
            ))}
          </div>
          {aiReady && cards.length > 0 && (
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void handlePolishWithAI()}
              disabled={polishing}
            >
              {polishing ? <Loader2 size={14} className="spin-icon" /> : <Sparkles size={14} />}
              {polishing ? 'AI 润色中…' : 'AI 润色讲法'}
            </button>
          )}
        </div>

        {cards.length === 0 ? (
          <EmptyState
            icon={<Presentation size={20} />}
            title="当前课程还没有足够数据生成开场卡"
            description="等待学生提问或补充课程知识库后，系统会基于知识缺口自动提炼 3 条下节课开场提示。"
          />
        ) : (
          <div className="opening-card-list">
            {cards.map((card, index) => (
              <article className="opening-card" key={card.id}>
                <div className="opening-card-head">
                  <span className="opening-card-index">开场提示 0{index + 1}</span>
                  <Badge
                    tone={
                      card.sourceKind === 'gap-low'
                        ? 'low'
                        : card.sourceKind === 'gap-review'
                          ? 'gold'
                          : 'jade'
                    }
                    dot
                  >
                    {card.sourceKind === 'gap-low'
                      ? '知识缺口 · AI 没把握'
                      : card.sourceKind === 'gap-review'
                        ? '知识缺口 · 答案待完善'
                        : '高频易错补充'}
                  </Badge>
                </div>

                <div className="opening-card-field">
                  <span className="opening-card-label">缺口描述</span>
                  <p>{card.gapDescription}</p>
                </div>

                <label className="opening-card-field">
                  <span className="opening-card-label">一句话讲法（可直接微调）</span>
                  <textarea
                    className="input opening-card-input"
                    rows={2}
                    value={card.oneLiner}
                    onChange={(event) =>
                      setCustomLines((prev) => ({ ...prev, [card.id]: event.target.value }))
                    }
                  />
                </label>

                <div className="opening-card-faq">
                  <span className="opening-card-label">关联 FAQ</span>
                  {card.relatedFaq ? (
                    <button
                      type="button"
                      className="opening-faq-link"
                      onClick={() => openFaq(card.relatedFaq!.id)}
                    >
                      <BookOpen size={14} />
                      <span>《{card.relatedFaq.question}》</span>
                      {card.relatedFaq.chapter && <em>{card.relatedFaq.chapter}</em>}
                    </button>
                  ) : (
                    <span className="opening-faq-empty">暂无对应 FAQ，建议课后将讲解沉淀入库</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
