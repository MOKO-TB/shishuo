import { useEffect, useMemo, useState } from 'react'
import { Check, Layers, RotateCcw, X } from 'lucide-react'
import { useStore } from '../store'
import { currentStudentId, setProfile, useProfile } from '../lib/profile'
import { courseById } from '../data/seed'
import { CAMPUS_COURSE_ID } from '../data/campus'
import type { Thread } from '../types'
import { formatRelative, truncate } from '../lib/utils'
import { Badge, EmptyState, Modal, RichText } from './ui'

interface ReviewItem {
  thread: Thread
  score: number
}

const MAX_CARDS = 12

function answerOf(thread: Thread): { text: string; source: string } {
  if (thread.teacherReply?.text) {
    return { text: thread.teacherReply.text, source: `${thread.teacherReply.by}老师的回复` }
  }
  if (thread.externalAnswer?.text) {
    return {
      text: thread.externalAnswer.text,
      source: `服务端 AI 补充 · ${thread.externalAnswer.model}`,
    }
  }
  if (thread.aiAnswer) {
    return { text: thread.aiAnswer, source: '课程知识库作答' }
  }
  return { text: '这个问题当时转交了老师，还没有沉淀出答案。', source: '等待老师补充' }
}

/**
 * 错题本复习卡：把收藏、负反馈、已解决和「还没会」过的问题组成一轮自测。
 * 「还没会」会记进学生资料（按账号同步），下次排在前面。
 */
export function ReviewModal({
  open,
  onClose,
  notify,
}: {
  open: boolean
  onClose: () => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}) {
  const { data } = useStore()
  const profile = useProfile()
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [shakyIds, setShakyIds] = useState<string[]>([])
  const [done, setDone] = useState(false)

  const cards = useMemo<ReviewItem[]>(() => {
    if (!open) return []
    const me = currentStudentId()
    return data.threads
      .filter(
        (thread) =>
          thread.student.id === me &&
          !thread.withdrawnAt &&
          // 复习卡只收课程学习问题；校园生活不属于课程错题本。
          thread.courseId !== CAMPUS_COURSE_ID,
      )
      .map((thread) => {
        const hasAnswer = Boolean(
          thread.teacherReply?.text ||
            thread.externalAnswer?.text ||
            thread.aiAnswer ||
            (thread.sources?.length ?? 0) > 0,
        )
        let score = 0
        if (thread.favorite) score += 3
        if (thread.feedback === 'unhelpful') score += 2
        if (thread.teacherReply?.text) score += 1
        if (thread.resolvedAt) score += 1
        score += Math.min(4, profile.reviewLapses[thread.id]?.lapses ?? 0)
        return { thread, score, hasAnswer }
      })
      .filter((item) => item.hasAnswer && item.score > 0)
      .sort((a, b) => b.score - a.score || b.thread.createdAt - a.thread.createdAt)
      .slice(0, MAX_CARDS)
      .map(({ thread, score }) => ({ thread, score }))
  }, [open, data.threads, profile.reviewLapses])

  useEffect(() => {
    if (!open) return
    setIndex(0)
    setFlipped(false)
    setShakyIds([])
    setDone(false)
  }, [open])

  const total = cards.length
  const current = cards[Math.min(index, Math.max(0, total - 1))]
  const answer = current ? answerOf(current.thread) : null
  const course = current ? courseById(current.thread.courseId) : null

  const grade = (remembered: boolean) => {
    if (!current) return
    if (!remembered) {
      const id = current.thread.id
      const prev = profile.reviewLapses[id] ?? { lapses: 0, lastReviewAt: 0 }
      setProfile({
        ...profile,
        reviewLapses: {
          ...profile.reviewLapses,
          [id]: { lapses: Math.min(99, prev.lapses + 1), lastReviewAt: Date.now() },
        },
      })
      setShakyIds((list) => (list.includes(id) ? list : [...list, id]))
    }
    if (index + 1 >= total) {
      setDone(true)
      const shakyCount = shakyIds.length + (remembered ? 0 : 1)
      notify(
        shakyCount > 0
          ? `复习完成：${total} 张卡片，${shakyCount} 张已记入「还没会」`
          : `复习完成：${total} 张卡片全部记住了`,
        shakyCount > 0 ? 'info' : 'success',
      )
      return
    }
    setIndex((value) => value + 1)
    setFlipped(false)
  }

  const restart = () => {
    setIndex(0)
    setFlipped(false)
    setShakyIds([])
    setDone(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="错题本 · 自测一轮"
      title="复习卡"
      size="md"
      footer={
        done ? (
          <div className="modal-actions">
            <button className="button button-ghost" onClick={restart}>
              <RotateCcw size={15} />
              再来一轮
            </button>
            <button className="button button-primary" onClick={onClose}>
              完成
            </button>
          </div>
        ) : (
          <div className="modal-actions">
            <button
              className="button button-ghost"
              onClick={() => setFlipped((value) => !value)}
              disabled={!current}
            >
              {flipped ? '收起答案' : '先自己想，再看答案'}
            </button>
            <button
              className="button button-secondary"
              onClick={() => grade(false)}
              disabled={!current}
            >
              <X size={15} />
              还没会
            </button>
            <button
              className="button button-primary"
              onClick={() => grade(true)}
              disabled={!current}
            >
              <Check size={15} />
              记住了
            </button>
          </div>
        )
      }
    >
      {total === 0 ? (
        <EmptyState
          icon={<Layers size={20} />}
          title="错题本还是空的"
          description="把重要的提问点「收藏」，或者等老师回复后在这里复习。收藏、没答好和「还没会」过的问题都会排到前面。"
        />
      ) : done ? (
        <div className="review-summary">
          <h3>这一轮复习完了</h3>
          <p>
            共 {total} 张卡片：<strong>{total - shakyIds.length}</strong> 张记住了，
            <strong>{shakyIds.length}</strong> 张还没会。「还没会」的下次会排在前面。
          </p>
          {shakyIds.length > 0 && (
            <ul className="review-summary-list">
              {shakyIds.map((id) => {
                const thread = data.threads.find((item) => item.id === id)
                return thread ? <li key={id}>{truncate(thread.question, 40)}</li> : null
              })}
            </ul>
          )}
        </div>
      ) : (
        current &&
        answer && (
          <div className="review-card">
            <div className="review-progress">
              <span>
                第 {index + 1} / {total} 张
              </span>
              <span className="review-progress-track">
                <span
                  className="review-progress-fill"
                  style={{ width: `${((index + (flipped ? 0.5 : 0)) / total) * 100}%` }}
                />
              </span>
            </div>
            <div className="review-question">
              <div className="review-tags">
                {course && <Badge tone="neutral">{course.shortName}</Badge>}
                {current.thread.favorite && <Badge tone="gold">已收藏</Badge>}
                {current.thread.feedback === 'unhelpful' && <Badge tone="clay">反馈过没讲清</Badge>}
                {current.thread.resolvedAt && <Badge tone="jade">已解决</Badge>}
                <span className="review-date">{formatRelative(current.thread.createdAt)}</span>
              </div>
              <p>{current.thread.question}</p>
            </div>
            {flipped ? (
              <div className="review-answer">
                <span className="review-answer-source">{answer.source}</span>
                <RichText text={answer.text} />
              </div>
            ) : (
              <button className="review-flip" onClick={() => setFlipped(true)}>
                先自己想，想好再点开答案
              </button>
            )}
          </div>
        )
      )}
    </Modal>
  )
}
