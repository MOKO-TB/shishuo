import { courseById } from '../data/seed'
import type { Faq, KnowledgeGap, Thread } from '../types'
import { clusterClassroomThreads, retrieve } from './engine'
import { excerpt, formatDateTime, truncate } from './utils'

export type ReviewSortMode = 'composite' | 'frequency' | 'low-confidence' | 'unresolved'

export interface ReviewPackItem {
  id: string
  courseId: string
  courseName: string
  courseShortName: string
  chapter: string
  topic: string
  /** 提问总人次 */
  frequency: number
  /** 低置信度提问次数 */
  lowConfidenceCount: number
  /** 未解决条数（待回复 / 待补充 / 未确认低置信 / 负反馈未改） */
  unresolvedCount: number
  /** 当前待教师回复条数 */
  pendingCount: number
  /** AI 已先行应答条数 */
  aiSolvedCount: number
  priorityScore: number
  linkedFaq?: Faq
  teacherReplySummary?: string
  sampleQuestions: string[]
  pendingGroupKey: string | null
  latestAt: number
}

function isThreadUnresolved(thread: Thread) {
  if (thread.withdrawnAt || thread.resolvedAt) return false
  if (thread.status === 'pending' || thread.status === 'needs-info') return true
  if (thread.feedback === 'unhelpful') return true
  if (thread.status === 'ai' && thread.confidence === 'low' && !thread.externalAnswer) return true
  return false
}

/**
 * 期末复习包：汇总所选课程全学期全部有效提问，按主题合并并按
 * 「提问频次、低置信度、未解决状态」排序。
 */
export function buildFinalReviewPack(
  threads: Thread[],
  faqs: Faq[],
  courseIds: string[],
  sortBy: ReviewSortMode = 'composite',
): ReviewPackItem[] {
  const faqById = new Map(faqs.map((faq) => [faq.id, faq]))
  const items: ReviewPackItem[] = []

  for (const courseId of courseIds) {
    const course = courseById(courseId)
    const courseFaqs = faqs.filter((faq) => faq.courseId === courseId)
    const clusters = clusterClassroomThreads(threads, courseId)

    for (const cluster of clusters) {
      const unresolvedCount = cluster.threads.filter(isThreadUnresolved).length
      const linkedFaqId =
        cluster.primary.sources?.[0] ??
        cluster.primary.closestSource ??
        cluster.threads.find((thread) => thread.sources?.[0])?.sources?.[0]
      const linkedFaq =
        (linkedFaqId ? faqById.get(linkedFaqId) : undefined) ??
        retrieve(courseFaqs, cluster.topic, courseId).matches[0]?.faq

      const latestTeacherReply = [...cluster.threads]
        .filter((thread) => thread.teacherReply?.text)
        .sort((a, b) => (b.teacherReply?.at ?? 0) - (a.teacherReply?.at ?? 0))[0]?.teacherReply?.text

      const frequency = cluster.totalCount
      const lowConfidenceCount = cluster.lowConfidenceCount
      const priorityScore = frequency * 10 + lowConfidenceCount * 14 + unresolvedCount * 18

      items.push({
        id: `rp-${courseId}-${cluster.key}`,
        courseId,
        courseName: course.name,
        courseShortName: course.shortName,
        chapter: linkedFaq?.chapter?.trim() || '未分章节',
        topic: cluster.topic,
        frequency,
        lowConfidenceCount,
        unresolvedCount,
        pendingCount: cluster.pendingCount,
        aiSolvedCount: cluster.aiSolvedCount,
        priorityScore,
        linkedFaq,
        teacherReplySummary: latestTeacherReply ? excerpt(latestTeacherReply, 140) : undefined,
        sampleQuestions: cluster.sampleQuestions,
        pendingGroupKey: cluster.pendingGroupKey,
        latestAt: cluster.latestAt,
      })
    }
  }

  return items.sort((a, b) => {
    if (sortBy === 'frequency') {
      return (
        b.frequency - a.frequency ||
        b.lowConfidenceCount - a.lowConfidenceCount ||
        b.unresolvedCount - a.unresolvedCount
      )
    }
    if (sortBy === 'low-confidence') {
      return (
        b.lowConfidenceCount - a.lowConfidenceCount ||
        b.unresolvedCount - a.unresolvedCount ||
        b.frequency - a.frequency
      )
    }
    if (sortBy === 'unresolved') {
      return (
        b.unresolvedCount - a.unresolvedCount ||
        b.lowConfidenceCount - a.lowConfidenceCount ||
        b.frequency - a.frequency
      )
    }
    return (
      b.priorityScore - a.priorityScore ||
      b.unresolvedCount - a.unresolvedCount ||
      b.lowConfidenceCount - a.lowConfidenceCount ||
      b.frequency - a.frequency
    )
  })
}

export function exportReviewPackMarkdown(
  items: ReviewPackItem[],
  {
    teacherName,
    courseLabel,
    includeAnswers = true,
  }: { teacherName: string; courseLabel: string; includeAnswers?: boolean },
) {
  const lines = [
    `# 师说 · 期末复习清单（${courseLabel}）`,
    '',
    `> 整理教师：${teacherName} · 生成时间：${formatDateTime(Date.now())} · 收录高频专题：${items.length} 项`,
    '',
  ]

  items.forEach((item, index) => {
    const tags = [
      `提问 ${item.frequency} 次`,
      item.lowConfidenceCount > 0 ? `低置信 ${item.lowConfidenceCount} 次` : '',
      item.unresolvedCount > 0 ? `待攻克/未解决 ${item.unresolvedCount} 条` : '已闭环',
    ]
      .filter(Boolean)
      .join(' · ')

    lines.push(`## ${index + 1}. [${item.courseShortName} · ${item.chapter}] ${item.topic}`)
    lines.push(`- [ ] 掌握要点（${tags}）`)
    if (item.sampleQuestions.length > 1) {
      lines.push(`- 常见问法：${item.sampleQuestions.slice(0, 3).map((q) => `「${truncate(q, 38)}」`).join('、')}`)
    }
    if (item.linkedFaq) {
      lines.push(`- 关联 FAQ：《${item.linkedFaq.question}》`)
    }
    if (includeAnswers) {
      const answerText = item.teacherReplySummary || (item.linkedFaq ? excerpt(item.linkedFaq.answer, 180) : '')
      if (answerText) {
        lines.push(`- 参考要点：${answerText}`)
      }
    }
    lines.push('')
  })

  return lines.join('\n')
}

export function exportReviewPackCsv(
  items: ReviewPackItem[],
  { includeAnswers = true }: { includeAnswers?: boolean } = {},
) {
  const cell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const header = [
    '优先级排名',
    '课程',
    '章节',
    '高频疑问专题',
    '提问频次',
    '低置信次数',
    '未解决条数',
    'AI先行解决数',
    '关联FAQ',
    ...(includeAnswers ? ['参考要点'] : []),
  ]
  const rows = items.map((item, index) => {
    const answer = item.teacherReplySummary || (item.linkedFaq ? excerpt(item.linkedFaq.answer, 200) : '')
    return [
      index + 1,
      item.courseName,
      item.chapter,
      item.topic,
      item.frequency,
      item.lowConfidenceCount,
      item.unresolvedCount,
      item.aiSolvedCount,
      item.linkedFaq?.question ?? '',
      ...(includeAnswers ? [answer] : []),
    ]
  })
  return `\uFEFF${[header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`
}

export function formatReviewPackText(items: ReviewPackItem[], courseLabel: string) {
  const lines = [`【期末重点复习清单 · ${courseLabel}】`]
  items.slice(0, 12).forEach((item, index) => {
    const flags = [
      `提问${item.frequency}次`,
      item.lowConfidenceCount > 0 ? `低置信${item.lowConfidenceCount}次` : '',
      item.unresolvedCount > 0 ? `未解决${item.unresolvedCount}条` : '',
    ]
      .filter(Boolean)
      .join(' / ')
    lines.push(`${index + 1}. ${item.topic}（${flags}）${item.linkedFaq ? ` → 参考《${truncate(item.linkedFaq.question, 24)}》` : ''}`)
  })
  return lines.join('\n')
}

export interface OpeningCard {
  id: string
  courseId: string
  courseName: string
  courseShortName: string
  sourceKind: 'gap-low' | 'gap-review' | 'supplement'
  topic: string
  waitingCount: number
  /** 缺口描述 */
  gapDescription: string
  /** 一句话讲法 */
  oneLiner: string
  /** 关联 FAQ */
  relatedFaq: {
    id: string
    question: string
    chapter?: string
  } | null
}

function cleanPlainSentence(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\*\*|__|`/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function distillOneLiner(topic: string, faq?: Faq, closestFaq?: Faq) {
  const shortTopic = truncate(topic.replace(/[？?]$/, ''), 24)
  const targetFaq = faq ?? closestFaq
  if (targetFaq) {
    const plain = cleanPlainSentence(targetFaq.answer)
    const sentences = plain
      .split(/[。！？\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 10)
    const core = truncate(sentences[0] ?? plain, 66)
    if (faq && !faq.reviewNeeded) {
      return `关于「${shortTopic}」，课堂上直接抓这句核心：${core}。`
    }
    return `先对比澄清「${shortTopic}」：记住「${core}」，重点把前提和反例放在一起讲。`
  }
  return `今天开场先用 2 分钟拆「${shortTopic}」：先确认前提条件是否满足，再用一个反例标出最容易掉坑的一步。`
}

/**
 * 下节课开场卡：基于教师端知识缺口自动生成 3 条开场提示，
 * 每条包含「缺口描述 + 一句话讲法 + 关联 FAQ」。
 */
export function buildOpeningCards(
  gaps: KnowledgeGap[],
  threads: Thread[],
  faqs: Faq[],
  courseIds: string[],
): OpeningCard[] {
  const scopedSet = new Set(courseIds)
  const faqById = new Map(faqs.map((faq) => [faq.id, faq]))
  const scopedFaqs = faqs.filter((faq) => scopedSet.has(faq.courseId))
  const cards: OpeningCard[] = []
  const usedKeys = new Set<string>()

  const findRelatedFaq = (courseId: string, topic: string, preferredId?: string) => {
    if (preferredId) {
      const exact = faqById.get(preferredId)
      if (exact && exact.courseId === courseId) return exact
    }
    const coursePool = scopedFaqs.filter((faq) => faq.courseId === courseId)
    const retrieved = retrieve(coursePool, topic, courseId)
    return retrieved.top?.faq ?? retrieved.matches[0]?.faq ?? coursePool[0]
  }

  const orderedGaps = [...gaps]
    .filter((gap) => scopedSet.has(gap.courseId))
    .sort((a, b) => {
      const countDiff = b.count - a.count
      if (countDiff !== 0) return countDiff
      return Number(b.reason === 'low') - Number(a.reason === 'low')
    })

  for (const gap of orderedGaps) {
    if (cards.length >= 3) break
    const course = courseById(gap.courseId)
    const related = findRelatedFaq(gap.courseId, gap.topic, gap.sourceFaqId)
    const dedupKey = `${gap.courseId}:${related?.id ?? gap.topic}`
    if (usedKeys.has(dedupKey)) continue
    usedKeys.add(dedupKey)

    const gapDescription =
      gap.reason === 'low'
        ? `「${gap.topic}」已有 ${Math.max(1, gap.count)} 位同学提问，AI 知识库置信度不足（${gap.note || '尚无直接覆盖'}）。`
        : `「${gap.topic}」近期被反馈不够清楚${gap.count > 0 ? `（${gap.count} 人同问）` : ''}，${gap.note || '建议课前重点澄清'}。`

    cards.push({
      id: `open-${gap.id}`,
      courseId: gap.courseId,
      courseName: course.name,
      courseShortName: course.shortName,
      sourceKind: gap.reason === 'low' ? 'gap-low' : 'gap-review',
      topic: gap.topic,
      waitingCount: gap.count,
      gapDescription,
      oneLiner: distillOneLiner(gap.topic, gap.reason === 'review' ? related : undefined, related),
      relatedFaq: related
        ? { id: related.id, question: related.question, chapter: related.chapter }
        : null,
    })
  }

  // 若知识缺口不足 3 条，从本课程高频待办或高引用 FAQ 中补足至 3 条，保证课前开场不空窗。
  if (cards.length < 3) {
    const clusters = clusterClassroomThreads(
      threads.filter((thread) => scopedSet.has(thread.courseId)),
    )
    for (const cluster of clusters) {
      if (cards.length >= 3) break
      const related = findRelatedFaq(
        cluster.courseId,
        cluster.topic,
        cluster.primary.sources?.[0] ?? cluster.primary.closestSource,
      )
      const dedupKey = `${cluster.courseId}:${related?.id ?? cluster.topic}`
      if (usedKeys.has(dedupKey)) continue
      usedKeys.add(dedupKey)

      const course = courseById(cluster.courseId)
      const gapDescription =
        cluster.lowConfidenceCount > 0 || cluster.pendingCount > 0
          ? `「${cluster.topic}」累计 ${cluster.totalCount} 人次提问，其中 ${Math.max(cluster.lowConfidenceCount, cluster.pendingCount)} 人次需要老师点拨。`
          : `「${cluster.topic}」是近期高频讨论点（${cluster.totalCount} 人次提问），适合开场用 1 分钟顺带巩固。`

      cards.push({
        id: `open-cluster-${cluster.key}`,
        courseId: cluster.courseId,
        courseName: course.name,
        courseShortName: course.shortName,
        sourceKind: 'supplement',
        topic: cluster.topic,
        waitingCount: cluster.totalCount,
        gapDescription,
        oneLiner: distillOneLiner(cluster.topic, related, related),
        relatedFaq: related
          ? { id: related.id, question: related.question, chapter: related.chapter }
          : null,
      })
    }
  }

  if (cards.length < 3) {
    const fallbackFaqs = [...scopedFaqs].sort(
      (a, b) =>
        Number(Boolean(b.reviewNeeded)) - Number(Boolean(a.reviewNeeded)) ||
        b.unhelpful - a.unhelpful ||
        b.citations - a.citations,
    )
    for (const faq of fallbackFaqs) {
      if (cards.length >= 3) break
      const dedupKey = `${faq.courseId}:${faq.id}`
      if (usedKeys.has(dedupKey)) continue
      usedKeys.add(dedupKey)
      const course = courseById(faq.courseId)
      cards.push({
        id: `open-faq-${faq.id}`,
        courseId: faq.courseId,
        courseName: course.name,
        courseShortName: course.shortName,
        sourceKind: faq.reviewNeeded ? 'gap-review' : 'supplement',
        topic: faq.question,
        waitingCount: faq.citations,
        gapDescription: faq.reviewNeeded
          ? `《${faq.question}》被标记为待完善，学生容易在此卡住。`
          : `《${faq.question}》累计被 AI 引用 ${faq.citations} 次，属于本课程高频核心考点。`,
        oneLiner: distillOneLiner(faq.question, faq, faq),
        relatedFaq: { id: faq.id, question: faq.question, chapter: faq.chapter },
      })
    }
  }

  return cards.slice(0, 3)
}

export function formatOpeningCardsAnnouncement(cards: OpeningCard[], courseLabel?: string) {
  const header = courseLabel
    ? `【下节课开场预告 · ${courseLabel}】`
    : '【下节课开场预告 · 课前 3 分钟速览】'
  const blocks = cards.map((card, index) => {
    const faqLine = card.relatedFaq
      ? `关联 FAQ：《${card.relatedFaq.question}》${card.relatedFaq.chapter ? `（${card.relatedFaq.chapter}）` : ''}`
      : '关联 FAQ：待课堂补充后沉淀入库'
    return [
      `${index + 1}. 缺口描述：${card.gapDescription}`,
      `   一句话讲法：${card.oneLiner}`,
      `   ${faqLine}`,
    ].join('\n')
  })
  return `${header}\n\n${blocks.join('\n\n')}`
}
