/**
 * 校园 FAQ 复核计划：根据 lastVerifiedAt / reviewIntervalDays 计算到期状态。
 * 只读计算，供管理台和每日提醒使用。
 */
const DAY = 86_400_000

export function reviewStateForFaq(faq, now = Date.now()) {
  const collected = Date.parse(faq.collectedAt || '') || Number(faq.createdAt) || now
  const unverifiedByCredibility = String(faq.credibility ?? '').startsWith('D')
  const lastVerifiedAt =
    faq.lastVerifiedAt == null ? (unverifiedByCredibility ? null : collected) : Number(faq.lastVerifiedAt)
  const reviewIntervalDays =
    Number(faq.reviewIntervalDays) > 0
      ? Number(faq.reviewIntervalDays)
      : unverifiedByCredibility
        ? 30
        : 180
  const nextReviewAt =
    faq.nextReviewAt == null
      ? lastVerifiedAt
        ? lastVerifiedAt + reviewIntervalDays * DAY
        : collected
      : Number(faq.nextReviewAt)
  const unverified = !lastVerifiedAt || faq.reviewNeeded === true
  let status = 'ok'
  if (unverified) status = 'unverified'
  else if (nextReviewAt < now) status = 'overdue'
  else if (nextReviewAt - now <= 14 * DAY) status = 'soon'

  return {
    id: faq.id,
    question: faq.question,
    category: faq.chapter || '未分类',
    credibility: faq.credibility || '',
    sourceChannel: faq.sourceChannel || '',
    sourceUrl: faq.sourceUrl || '',
    lastVerifiedAt,
    reviewIntervalDays,
    nextReviewAt,
    reviewNeeded: Boolean(faq.reviewNeeded),
    verifiedBy: faq.verifiedBy || '',
    status,
  }
}

export function campusReviewItems(data, now = Date.now()) {
  const rank = { unverified: 0, overdue: 1, soon: 2, ok: 3 }
  return (data?.faqs ?? [])
    .filter((faq) => faq.courseId === 'campus')
    .map((faq) => reviewStateForFaq(faq, now))
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        a.nextReviewAt - b.nextReviewAt ||
        a.question.localeCompare(b.question, 'zh-Hans-CN'),
    )
}

export function campusReviewSummary(data, now = Date.now()) {
  const items = campusReviewItems(data, now)
  const summary = { total: items.length, unverified: 0, overdue: 0, soon: 0, ok: 0 }
  for (const item of items) summary[item.status] += 1
  return { summary, items }
}
