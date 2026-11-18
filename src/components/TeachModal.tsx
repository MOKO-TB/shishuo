import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  CircleAlert,
  GraduationCap,
  Lightbulb,
  ListChecks,
} from 'lucide-react'
import type { AnswerResult, Thread } from '../types'
import { useStore } from '../store'
import { buildTeachLesson } from '../lib/teach'
import { confidenceLabel } from '../lib/utils'
import { Badge, MathText, Modal } from './ui'

interface TeachModalProps {
  thread: Thread | null
  result: AnswerResult | null
  onClose: () => void
  onOpenFaq: (faqId: string) => void
  onEscalate: () => void
}

export function TeachModal({
  thread,
  result,
  onClose,
  onOpenFaq,
  onEscalate,
}: TeachModalProps) {
  const { data } = useStore()
  const [revealed, setRevealed] = useState(false)
  const [diagnosis, setDiagnosis] = useState<number | null>(null)
  const lesson = thread ? buildTeachLesson(thread, result, data.faqs) : null

  useEffect(() => {
    setRevealed(false)
    setDiagnosis(null)
  }, [thread?.id])

  if (!thread || !lesson) return null

  const mentor = lesson.mentor

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={mentor ? '高数导师 · 讲一讲' : 'AI 老师 · 讲一讲'}
      title={lesson.title}
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <div className="modal-actions-right">
            <button className="text-button" onClick={() => onOpenFaq(lesson.sourceFaq.id)}>
              <BookOpen size={14} />
              看原文 FAQ
            </button>
            <button className="text-button" onClick={onEscalate}>
              还有疑问，转交老师
              <ArrowRight size={14} />
            </button>
          </div>
          <button className="button button-ghost" onClick={onClose}>
            先看到这
          </button>
        </div>
      }
    >
      <div className="teach-modal">
        <div className="teach-meta">
          <Badge tone={lesson.confidence === 'high' ? 'high' : 'medium'} dot>
            {confidenceLabel(lesson.confidence)}
          </Badge>
          <span>{lesson.courseName} · 基于课程知识库</span>
          {mentor && <Badge tone="gold">{mentor.topic}</Badge>}
          {mentor && <span>教学法：{mentor.source}</span>}
          {lesson.confidence === 'medium' && (
            <Badge tone="neutral">讲解只覆盖已检索到的内容</Badge>
          )}
        </div>

        {result?.reviewNote && (
          <div className="inline-note warning">
            <span>这条知识正在被老师完善：{result.reviewNote}</span>
          </div>
        )}

        {mentor && (
          <section className="teach-diagnose">
            <div className="teach-section-head">
              <GraduationCap size={16} />
              <h3>先定位卡点</h3>
            </div>
            <p className="teach-diagnose-lead">先别急着看讲解。你更接近哪一种？</p>
            <div className="teach-diagnose-chips">
              {mentor.diagnose.map((item, index) => (
                <button
                  key={item}
                  className={`teach-diagnose-chip ${diagnosis === index ? 'is-active' : ''}`}
                  onClick={() => setDiagnosis(index)}
                >
                  <MathText text={item} />
                </button>
              ))}
            </div>
            {diagnosis !== null && (
              <p className="teach-diagnose-note">
                带着这个判断往下看：先盯住「{mentor.topic}」的关键一步，别急着套公式。
              </p>
            )}
            <div className="teach-prereq">
              <span>先修检查</span>
              <p><MathText text={mentor.prerequisite} /></p>
            </div>
          </section>
        )}

        <section className="teach-hero">
          <span className="teach-eyebrow">{mentor ? '导师先给结论' : '先记住一句话'}</span>
          <p><MathText text={lesson.core} /></p>
        </section>

        <section className="teach-section">
          <div className="teach-section-head">
            <ListChecks size={16} />
            <h3>拆开看</h3>
          </div>
          <ul className="teach-points">
            {lesson.points.map((point) => (
              <li key={point}><MathText text={point} /></li>
            ))}
          </ul>
        </section>

        <div className="teach-two">
          <section className="teach-note is-example">
            <div className="teach-section-head">
              <Lightbulb size={15} />
              <h3>一个例子</h3>
            </div>
            <p><MathText text={lesson.example} /></p>
          </section>
          <section className="teach-note is-pitfall">
            <div className="teach-section-head">
              <CircleAlert size={15} />
              <h3>容易错在哪</h3>
            </div>
            <p><MathText text={lesson.pitfall} /></p>
          </section>
        </div>

        <section className="teach-check">
          <div className="teach-section-head">
            <GraduationCap size={16} />
            <h3>{mentor ? '换你练一道迁移题' : '轮到你了'}</h3>
            {mentor && <span className="teach-transfer-note">不是原题</span>}
          </div>
          <p className="teach-check-question"><MathText text={lesson.check.question} /></p>
          {revealed ? (
            <div className="teach-check-answer">
              <span>参考</span>
              <p><MathText text={lesson.check.answer} /></p>
              <em><MathText text={lesson.check.hint} /></em>
            </div>
          ) : (
            <button className="button button-secondary" onClick={() => setRevealed(true)}>
              {mentor ? '先自己做一遍，再看参考' : '先自己讲一遍，再看参考'}
            </button>
          )}
        </section>

        <button className="teach-source" onClick={() => onOpenFaq(lesson.sourceFaq.id)}>
          <BookOpen size={14} />
          <span>原文 · {lesson.sourceFaq.question}</span>
          <ArrowRight size={14} />
        </button>

        {mentor ? (
          <div className="teach-attribution">
            <p>{mentor.attribution}</p>
            <p>导师拆解基于课程 FAQ 与公开课教学法；需要老师定调的，仍然转交任课老师。</p>
          </div>
        ) : (
          <p className="teach-footnote">
            讲解只重组课程知识库里的内容；需要老师定调的，仍然转交任课老师。
          </p>
        )}
      </div>
    </Modal>
  )
}