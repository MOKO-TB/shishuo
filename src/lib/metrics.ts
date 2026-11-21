import { dateKey } from '../data/seed'
import type { Thread } from '../types'

export interface MetricPoint {
  date: string
  ai: number
  human: number
}

export interface CourseMetrics {
  /** 最近 N 天按天拆分的 AI / 转人工数量。 */
  weekly: MetricPoint[]
  todayAi: number
  aiSolved: number
  humanHandled: number
  aiRate: number
  savedHours: number
  duplicatesMerged: number
}

const DAY = 24 * 3_600_000

/** A thread the AI answered without ever handing it to a teacher. */
export function isAiSolvedThread(thread: Thread) {
  return (
    Boolean(thread.aiAnswer || thread.externalAnswer) &&
    !thread.escalation &&
    !thread.teacherReply
  )
}

/** A thread a student explicitly handed to a teacher. */
export function isHumanHandledThread(thread: Thread) {
  return Boolean(thread.escalation)
}

/**
 * Teacher-side metrics scoped to a set of courses.
 *
 * `daily` in the shared workspace is a global counter and cannot be split back
 * per teacher, so the teacher dashboard derives its numbers from the threads it
 * can actually see. AI solved threads are counted on their creation day; a
 * hand-off is counted on the day the student escalated it.
 */
export function courseMetrics(
  threads: Thread[],
  days = 7,
  now = Date.now(),
): CourseMetrics {
  const windowDays = Math.max(1, Math.min(90, Math.round(days)))
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const start = startOfToday.getTime() - (windowDays - 1) * DAY
  const weekly: MetricPoint[] = []
  const byDate = new Map<string, MetricPoint>()
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const key = dateKey(now - offset * DAY)
    const point = { date: key, ai: 0, human: 0 }
    weekly.push(point)
    byDate.set(key, point)
  }

  let aiSolved = 0
  let humanHandled = 0
  let todayAi = 0
  let duplicatesMerged = 0
  const today = dateKey(now)

  for (const thread of threads) {
    if (thread.kind === 'same' || thread.clusterId) duplicatesMerged += 1

    if (isAiSolvedThread(thread) && thread.createdAt >= start) {
      aiSolved += 1
      const point = byDate.get(dateKey(thread.createdAt))
      if (point) point.ai += 1
      if (dateKey(thread.createdAt) === today) todayAi += 1
    }

    if (isHumanHandledThread(thread) && thread.escalation) {
      const at = thread.escalation.at
      if (at >= start) {
        humanHandled += 1
        const point = byDate.get(dateKey(at))
        if (point) point.human += 1
      }
    }
  }

  const total = aiSolved + humanHandled
  return {
    weekly,
    todayAi,
    aiSolved,
    humanHandled,
    aiRate: total > 0 ? aiSolved / total : 0,
    // 演示口径：按每次人工回复 4 分钟估算。
    savedHours: (aiSolved * 4) / 60,
    duplicatesMerged,
  }
}
