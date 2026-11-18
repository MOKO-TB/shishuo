import type { Faq } from '../types'
import { CAMPUS_CARDS } from './campusKb'
import { CAMPUS_COURSE_ID } from './campus'

/** 引路学长知识卡的统一采集时间（2026-10-31）。 */
export const CAMPUS_KB_TIME = Date.parse('2026-10-31T08:00:00+08:00')

export const CAMPUS_FAQ_PREFIX = 'campus-'

function unique(values: string[], limit: number) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit)
}

/**
 * 把引路学长的展示卡转成师说 FAQ。
 * 标题直接作为问题；正文作为答案；标签/分类补齐检索别名。
 */
export function createCampusFaqs(baseTime = CAMPUS_KB_TIME): Faq[] {
  return CAMPUS_CARDS.map((card, index) => {
    const tags = unique([card.category, ...card.tags], 8)
    const aliases = unique([card.title, card.category, ...card.tags], 12)
    const unverified = card.credibility.startsWith('D')
    const lastVerifiedAt = unverified ? undefined : baseTime + index
    const reviewIntervalDays = unverified ? 30 : 180
    return {
      id: `${CAMPUS_FAQ_PREFIX}${card.id}`,
      courseId: CAMPUS_COURSE_ID,
      question: card.title,
      aliases,
      answer: card.content,
      tags,
      author: card.sourceChannel || '引路学长知识库',
      source: 'sediment',
      createdAt: baseTime + index,
      updatedAt: baseTime + index,
      citations: 0,
      helpful: 0,
      unhelpful: 0,
      chapter: card.category,
      reviewNeeded: unverified,
      credibility: card.credibility,
      sourceUrl: card.sourceUrl,
      sourceChannel: card.sourceChannel,
      collectedAt: card.collectedAt,
      ...(lastVerifiedAt ? { lastVerifiedAt } : {}),
      reviewIntervalDays,
      nextReviewAt: unverified
        ? baseTime + index
        : (lastVerifiedAt ?? baseTime) + reviewIntervalDays * 86_400_000,
    }
  })
}

export function isCampusFaq(faq: Pick<Faq, 'courseId'>) {
  return faq.courseId === CAMPUS_COURSE_ID
}
