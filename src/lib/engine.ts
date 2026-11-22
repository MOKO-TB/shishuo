import type {
  AnswerResult,
  Confidence,
  Faq,
  KnowledgeGap,
  ScoredFaq,
  Thread,
  ThreadGroup,
  Urgency,
} from '../types'
import { courseDomainTerms } from '../data/domainTerms'

const HIGH_THRESHOLD = 0.5
const MEDIUM_THRESHOLD = 0.26
const CLOSEST_THRESHOLD = 0.12

const STOP_TOKENS = new Set([
  '怎么',
  '什么',
  '为什',
  '么样',
  '如何',
  '可以',
  '到底',
  '一下',
  '这个',
  '那个',
  '应该',
  '还是',
  '就是',
  '请问',
  '老师',
  '同学',
  '每次',
  '总是',
  '不会',
  '需要',
  '有没有',
  '哪里',
  '为什么',
])

const PUNCTUATION = /[\p{P}\p{S}]/gu

const domainTermCache = new Map<string, string[]>()

function domainTermList(courseId?: string) {
  const key = courseId ?? '*'
  let terms = domainTermCache.get(key)
  if (!terms) {
    terms = courseDomainTerms(courseId)
    domainTermCache.set(key, terms)
  }
  return terms
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/dp\s*\[[^\]]*\]/g, ' 动态规划状态 ')
    .replace(/\bdp\b/g, ' 动态规划 ')
    .replace(/b\+\s*树/g, ' bplus bplus树 ')
    .replace(/\bb\s*[- ]?树/g, ' btree btree树 ')
    .replace(/快排/g, '快速排序')
    .replace(/迪杰斯特拉/g, 'dijkstra')
    .replace(/散列表/g, '散列表 哈希表 哈希')
    .replace(/哈希表/g, '哈希表 哈希')
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokensOf(text: string): string[] {
  const normalized = normalize(text)
  const tokens: string[] = []
  const latin = normalized.match(/[a-z0-9]+/g) ?? []
  tokens.push(...latin.filter((word) => word.length >= 2))

  const hanRuns = normalized.match(/[\u4e00-\u9fff]+/g) ?? []
  for (const run of hanRuns) {
    if (run.length === 1) {
      tokens.push(run)
      continue
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      const bigram = run.slice(i, i + 2)
      if (!STOP_TOKENS.has(bigram)) tokens.push(bigram)
    }
    for (let i = 0; i < run.length - 2; i += 1) {
      const trigram = run.slice(i, i + 3)
      if (!STOP_TOKENS.has(trigram)) tokens.push(trigram)
    }
    if (run.length <= 8) tokens.push(run)
  }
  return tokens
}

function addTerms(target: Map<string, number>, text: string, weight: number) {
  for (const token of tokensOf(text)) {
    target.set(token, (target.get(token) ?? 0) + weight)
  }
}

function buildDocument(faq: Faq) {
  const terms = new Map<string, number>()
  addTerms(terms, faq.question, 3)
  faq.aliases.forEach((alias) => addTerms(terms, alias, 1.6))
  faq.tags.forEach((tag) => addTerms(terms, tag, 1.4))
  if (faq.chapter) addTerms(terms, faq.chapter, 0.4)
  // 老师附的资料也参与检索：学生问课件里的名词时更容易命中这条知识。
  faq.attachments?.forEach((attachment) => {
    addTerms(terms, `${attachment.name} ${attachment.excerpt ?? ''}`, 0.5)
  })
  return terms
}

function cosine(query: Map<string, number>, doc: Map<string, number>, idf: Map<string, number>) {
  let dot = 0
  let queryNorm = 0
  let docNorm = 0

  for (const [term, weight] of query) {
    const q = weight * (idf.get(term) ?? 1)
    queryNorm += q * q
    const d = (doc.get(term) ?? 0) * (idf.get(term) ?? 1)
    dot += q * d
  }
  for (const [term, weight] of doc) {
    const d = weight * (idf.get(term) ?? 1)
    docNorm += d * d
  }

  if (queryNorm === 0 || docNorm === 0) return 0
  return dot / Math.sqrt(queryNorm * docNorm)
}

function uncoveredTerms(question: string, faq: Faq) {
  const asked = domainTerms(question, faq.courseId)
  const attachmentText = (faq.attachments ?? [])
    .map((attachment) => `${attachment.name} ${attachment.excerpt ?? ''}`)
    .join(' ')
  const covered = domainTerms(
    `${faq.question} ${faq.answer} ${faq.tags.join(' ')} ${attachmentText}`,
    faq.courseId,
  )
  return Array.from(asked).filter((term) => !covered.has(term))
}

function aliasMatch(query: string, faq: Faq): 'exact' | 'partial' | null {
  const normalizedQuery = normalize(query)
  if (normalizedQuery.length < 3) return null
  let partial = false
  for (const alias of faq.aliases) {
    const normalizedAlias = normalize(alias)
    if (normalizedAlias.length < 3) continue
    if (normalizedAlias === normalizedQuery) return 'exact'
    if (
      normalizedQuery.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedQuery)
    ) {
      partial = true
    }
  }
  return partial ? 'partial' : null
}

function chapterKey(value: string) {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

function chapterMatches(faqChapter: string | undefined, preferred: string | undefined) {
  const left = chapterKey(faqChapter ?? '')
  const right = chapterKey(preferred ?? '')
  if (!left || !right) return false
  if (left === right) return true
  return left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left))
}

export function retrieve(
  faqs: Faq[],
  question: string,
  courseId: string,
  preferredChapter?: string,
): AnswerResult {
  const pool = faqs.filter((faq) => faq.courseId === courseId)
  if (pool.length === 0) {
    return {
      confidence: 'low',
      score: 0,
      matches: [],
      sourceIds: [],
      reason: '这门课还没有知识库内容，AI 不生成没有依据的答案。',
    }
  }

  const docs = pool.map((faq) => ({ faq, terms: buildDocument(faq) }))
  const documentFrequency = new Map<string, number>()
  for (const doc of docs) {
    for (const term of doc.terms.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    }
  }
  const idf = new Map<string, number>()
  for (const [term, df] of documentFrequency) {
    idf.set(term, Math.log((docs.length + 1) / (df + 1)) + 1)
  }

  const queryTerms = new Map<string, number>()
  for (const token of tokensOf(question)) {
    queryTerms.set(token, (queryTerms.get(token) ?? 0) + 1)
  }

  const matches: ScoredFaq[] = docs
    .map(({ faq, terms }) => {
      let score = cosine(queryTerms, terms, idf)
      const alias = aliasMatch(question, faq)
      if (alias === 'exact') score = Math.min(1, score + 0.32)
      else if (alias === 'partial') score = Math.min(1, score + 0.2)
      // 老师标记的当前教学进度只做轻微加权，不能盖过问题本身的匹配度。
      if (preferredChapter && chapterMatches(faq.chapter, preferredChapter)) {
        score = Math.min(1, score + 0.05)
      }
      return { faq, score }
    })
    .filter((match) => match.score > 0.035)
    .sort((a, b) => b.score - a.score)

  const top = matches[0]
  if (!top || top.score < MEDIUM_THRESHOLD) {
    const closestToShow = top && top.score >= CLOSEST_THRESHOLD ? top : undefined
    const closest = closestToShow
      ? `最接近的是《${closestToShow.faq.question}》，相关度只有 ${Math.round(closestToShow.score * 100)}%。`
      : ''
    return {
      confidence: 'low',
      score: top?.score ?? 0,
      matches: matches.slice(0, 2),
      top,
      sourceIds: [],
      closestSource: closestToShow?.faq.id,
      reason: `课程知识库里没有足够可靠的内容。${closest} AI 不编造答案，建议转交老师确认。`,
    }
  }

  const missingTerms = uncoveredTerms(question, top.faq)
  const reviewCap = top.faq.reviewNeeded
  let confidence: Confidence = top.score >= HIGH_THRESHOLD ? 'high' : 'medium'
  if (reviewCap && confidence === 'high') confidence = 'medium'

  if (missingTerms.length > 0 && top.score < 0.65) {
    return {
      confidence: 'low',
      score: top.score,
      matches: matches.slice(0, 2),
      top,
      sourceIds: [],
      closestSource: top.faq.id,
      reason: `知识库里有相关内容，但没有覆盖你问的「${missingTerms.join('、')}」。AI 不把相近内容硬当答案，建议转交老师。`,
      missingTerms,
    }
  }

  if (missingTerms.length > 0 && confidence === 'high') confidence = 'medium'

  const related = matches.filter(
    (match) => match.faq.id !== top.faq.id && match.score >= MEDIUM_THRESHOLD * 0.9,
  )
  const sourceIds = [top.faq.id, ...related.slice(0, 1).map((match) => match.faq.id)]

  let reason: string
  if (reviewCap) {
    reason = `匹配到《${top.faq.question}》，但这条答案近期被反馈讲得不够具体，AI 已自动降低置信度。`
  } else if (missingTerms.length > 0) {
    reason = `找到了相关内容，但没有完全覆盖你问的「${missingTerms.join('、')}」，建议同时请老师确认。`
  } else if (confidence === 'high') {
    reason = `找到 ${sourceIds.length} 条课程知识，最高相关度 ${Math.round(top.score * 100)}%，可以直接参考。`
  } else {
    reason = `找到了相关内容，但依据还不够完整（相关度 ${Math.round(top.score * 100)}%），建议同时请老师确认。`
  }

  return {
    confidence,
    score: top.score,
    matches: matches.slice(0, 3),
    top,
    answer: top.faq.answer,
    sourceIds,
    reason,
    reviewNote: top.faq.reviewNote,
    missingTerms,
  }
}

function stripMarkdown(text: string) {
  return text.replace(/\*\*/g, '').replace(/^>\s?/gm, '').trim()
}

export function makeDraft(
  question: string,
  result: AnswerResult,
  teacherName: string,
  groupCount = 1,
) {
  if (!result.top || result.confidence === 'low') {
    const intro = groupCount > 1 ? '几位同学好，' : '同学你好，'
    const audience = groupCount > 1 ? '你们' : '你'
    return `${intro}这个问题课程知识库里还没有完整答案，我先确认一下${audience}的场景：\n\n1. 现在卡在哪一步？\n2. 已经尝试过哪些思路？\n3. 是哪道题或哪个例子？\n\n补充后我再给完整讲解，也会把这类问题补进课程 FAQ。`
  }

  const shortQuestion = question.replace(/[？?]$/, '').slice(0, 46)
  const greeting = groupCount > 1
    ? '几位同学好，你们问到的其实是同一个卡点，我一起回复：'
    : `同学你好，关于「${shortQuestion}」，可以这样理解：`
  const answer = stripMarkdown(result.top.faq.answer)
  const closing = '\n\n如果还卡住，把具体题目和你的思路发我，我帮你定位卡在哪一步。'

  return `${greeting}\n\n${answer}${closing}\n\n—— ${teacherName}`
}

function tokenSet(text: string) {
  return new Set(tokensOf(text))
}

function domainTerms(text: string, courseId?: string) {
  const normalized = normalize(text)
  return new Set(domainTermList(courseId).filter((term) => normalized.includes(term)))
}

export function questionSimilarity(a: string, b: string, courseId?: string) {
  const setA = tokenSet(a)
  const setB = tokenSet(b)
  if (setA.size === 0 || setB.size === 0) return 0

  let shared = 0
  for (const token of setA) {
    if (setB.has(token)) shared += 1
  }
  const overlap = shared / Math.min(setA.size, setB.size)

  const termsA = domainTerms(a, courseId)
  const termsB = domainTerms(b, courseId)
  if (termsA.size === 0 || termsB.size === 0) return overlap
  let sharedTerms = 0
  for (const term of termsA) {
    if (termsB.has(term)) sharedTerms += 1
  }
  const termScore = sharedTerms / Math.max(1, Math.min(termsA.size, termsB.size))

  return Math.min(1, overlap * 0.68 + termScore * 0.32)
}

const urgencyRank: Record<Urgency, number> = { today: 0, week: 1, later: 2 }

/** A question the teacher still has to answer: pending and not pulled back by the student. */
export function isAwaitingTeacher(thread: Thread) {
  return thread.status === 'pending' && !thread.withdrawnAt
}

export function groupPendingThreads(threads: Thread[], courseId?: string): ThreadGroup[] {
  const pending = threads.filter(
    (thread) =>
      isAwaitingTeacher(thread) && (!courseId || thread.courseId === courseId),
  )
  if (pending.length === 0) return []

  const parent = new Map<string, string>(pending.map((thread) => [thread.id, thread.id]))
  const find = (id: string): string => {
    const current = parent.get(id)!
    if (current === id) return id
    const root = find(current)
    parent.set(id, root)
    return root
  }
  const union = (a: string, b: string) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  const clusterOwners = new Map<string, string>()
  for (const thread of pending) {
    if (thread.clusterId) {
      const key = `${thread.courseId}:${thread.clusterId}`
      const owner = clusterOwners.get(key)
      if (owner) union(thread.id, owner)
      else clusterOwners.set(key, thread.id)
    }
  }
  // A joined thread stores the primary thread's id as its clusterId. Union that
  // primary thread too, otherwise the same group appears twice with one key.
  for (const thread of pending) {
    const owner = clusterOwners.get(`${thread.courseId}:${thread.id}`)
    if (owner && owner !== thread.id) union(thread.id, owner)
  }

  for (let i = 0; i < pending.length; i += 1) {
    for (let j = i + 1; j < pending.length; j += 1) {
      if (pending[i].courseId !== pending[j].courseId) continue
      if (pending[i].groupLocked || pending[j].groupLocked) continue
      if (pending[i].kind && pending[i].kind !== 'ask') continue
      if (pending[j].kind && pending[j].kind !== 'ask') continue
      if (questionSimilarity(pending[i].question, pending[j].question, pending[i].courseId) >= 0.34) {
        union(pending[i].id, pending[j].id)
      }
    }
  }

  const buckets = new Map<string, Thread[]>()
  for (const thread of pending) {
    const key = find(thread.id)
    const list = buckets.get(key) ?? []
    list.push(thread)
    buckets.set(key, list)
  }

  const groups: ThreadGroup[] = []
  for (const list of buckets.values()) {
    const sorted = [...list].sort((a, b) => a.createdAt - b.createdAt)
    let primary = sorted[0]
    let bestCentrality = -1
    for (const candidate of sorted) {
      let centrality = 0
      for (const other of sorted) {
        if (other.id !== candidate.id) {
          centrality += questionSimilarity(candidate.question, other.question, candidate.courseId)
        }
      }
      centrality += Math.min(candidate.question.length, 40) / 1000
      if (centrality > bestCentrality) {
        bestCentrality = centrality
        primary = candidate
      }
    }

    const urgency = sorted.reduce<Urgency>((current, thread) => {
      const next = thread.escalation?.urgency ?? 'week'
      return urgencyRank[next] < urgencyRank[current] ? next : current
    }, 'week')

    const studentNames = Array.from(new Set(sorted.map((thread) => thread.escalation?.anonymous || thread.student.anonymous ? '匿名同学' : thread.student.name)))
    const anonymousCount = sorted.filter((thread) => thread.escalation?.anonymous || thread.student.anonymous).length
    const sourceFaqIds = Array.from(new Set(sorted.flatMap((thread) => thread.sources ?? [])))
    const title =
      [...sorted]
        .map((thread) => thread.escalation?.title ?? '')
        .sort((a, b) => b.length - a.length)[0] ||
      primary.question.replace(/[？?]$/, '').slice(0, 30)

    groups.push({
      key: primary.clusterId ?? primary.id,
      threads: sorted,
      primary,
      count: sorted.length,
      urgency,
      confidence: primary.confidence,
      courseId: primary.courseId,
      title,
      studentNames,
      anonymousCount,
      sourceFaqIds,
      latestAt: Math.max(...sorted.map((thread) => thread.createdAt)),
      oldestAt: Math.min(...sorted.map((thread) => thread.createdAt)),
      locked: sorted.some((thread) => Boolean(thread.groupLocked)),
    })
  }

  return groups.sort((a, b) => {
    const urgencyDiff = urgencyRank[a.urgency] - urgencyRank[b.urgency]
    if (urgencyDiff !== 0) return urgencyDiff
    const aFollowUp = a.primary.kind === 'follow-up'
    const bFollowUp = b.primary.kind === 'follow-up'
    if (aFollowUp !== bFollowUp) return aFollowUp ? -1 : 1
    if (a.count !== b.count) return b.count - a.count
    return a.oldestAt - b.oldestAt
  })
}

export function findSimilarPending(
  threads: Thread[],
  question: string,
  courseId: string,
  excludeId?: string,
) {
  return threads
    .filter(
      (thread) =>
        isAwaitingTeacher(thread) &&
        thread.courseId === courseId &&
        thread.id !== excludeId &&
        questionSimilarity(question, thread.question, courseId) >= 0.34,
    )
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function findSimilarPendingGroup(
  threads: Thread[],
  question: string,
  courseId: string,
  excludeId?: string,
) {
  const similar = findSimilarPending(threads, question, courseId, excludeId)
  if (similar.length === 0) return undefined
  const groups = groupPendingThreads(threads, courseId)
  return groups.find((group) =>
    group.threads.some((thread) => similar.some((item) => item.id === thread.id)),
  )
}

export function computeGaps(threads: Thread[], faqs: Faq[]): KnowledgeGap[] {
  const faqMap = new Map(faqs.map((faq) => [faq.id, faq]))
  const groups = groupPendingThreads(threads)
  const gaps: KnowledgeGap[] = []

  for (const group of groups) {
    const covered = faqs.some(
      (faq) =>
        faq.courseId === group.courseId &&
        !faq.reviewNeeded &&
        questionSimilarity(faq.question, group.title, faq.courseId) >= 0.5,
    )
    if (covered) continue

    const low = group.threads.find((thread) => thread.confidence === 'low')
    if (low) {
      gaps.push({
        id: `gap-low-${group.key}`,
        groupKey: group.key,
        courseId: group.courseId,
        topic: group.title,
        count: group.count,
        reason: 'low',
        sourceFaqId: low.closestSource,
        note: low.closestSource
          ? `最接近的知识《${faqMap.get(low.closestSource)?.question ?? ''}》相关度不足。`
          : '知识库还没有覆盖这个主题。',
      })
      continue
    }

    const reviewFaq = group.sourceFaqIds
      .map((id) => faqMap.get(id))
      .find((faq): faq is Faq => Boolean(faq?.reviewNeeded))
    if (reviewFaq) {
      gaps.push({
        id: `gap-review-${group.key}`,
        groupKey: group.key,
        courseId: group.courseId,
        topic: group.title,
        count: group.count,
        reason: 'review',
        sourceFaqId: reviewFaq.id,
        note: reviewFaq.reviewNote ?? '近期反馈这条答案不够清楚。',
      })
    }
  }

  // Only review gaps represent an already-known review FAQ. A low-confidence
  // question may merely point at a review FAQ as its closest source; that FAQ
  // still needs its own "完善答案" entry.
  const representedFaqs = new Set(
    gaps
      .filter((gap) => gap.reason === 'review')
      .map((gap) => gap.sourceFaqId)
      .filter((id): id is string => Boolean(id)),
  )
  const courseIds = new Set(threads.map((thread) => thread.courseId))
  for (const faq of faqs) {
    if (
      !faq.reviewNeeded ||
      !courseIds.has(faq.courseId) ||
      representedFaqs.has(faq.id)
    ) {
      continue
    }
    gaps.push({
      id: `gap-faq-${faq.id}`,
      groupKey: '',
      courseId: faq.courseId,
      topic: faq.question,
      count: 0,
      reason: 'review',
      sourceFaqId: faq.id,
      note: faq.reviewNote ?? '这条答案需要完善。',
    })
  }

  return gaps.sort((a, b) => b.count - a.count)
}

export function confidenceText(confidence?: Confidence) {
  if (confidence === 'high') return '高置信'
  if (confidence === 'medium') return '中置信'
  if (confidence === 'low') return '低置信'
  return '待判断'
}

export function confidenceScore(confidence?: Confidence) {
  if (confidence === 'high') return 86
  if (confidence === 'medium') return 54
  if (confidence === 'low') return 22
  return 0
}

export interface WallCluster {
  key: string
  courseId: string
  topic: string
  primary: Thread
  threads: Thread[]
  /** 提问总人次（同一节课或作用域内合并后的总提问数）。 */
  totalCount: number
  /** AI 先行应答且未转人工的人次。 */
  aiSolvedCount: number
  /** 当前等待教师介入的人次。 */
  pendingCount: number
  /** 等待学生补充的人次。 */
  needsInfoCount: number
  /** 教师已回复的人次。 */
  answeredCount: number
  /** 低置信度人次。 */
  lowConfidenceCount: number
  /** 对应待办合集的 ThreadGroup.key，方便教师一键打开回复抽屉。 */
  pendingGroupKey: string | null
  latestAt: number
  sampleQuestions: string[]
}

function sharedDomainTermCount(a: string, b: string, courseId: string) {
  const termsA = domainTerms(a, courseId)
  const termsB = domainTerms(b, courseId)
  let shared = 0
  for (const term of termsA) {
    if (termsB.has(term)) shared += 1
  }
  return shared
}

function classroomPairSimilar(a: string, b: string, courseId: string) {
  const sim = questionSimilarity(a, b, courseId)
  if (sim >= 0.25) return true
  const setA = tokenSet(a)
  const setB = tokenSet(b)
  if (setA.size === 0 || setB.size === 0) return false
  let shared = 0
  let sharedLatin = 0
  for (const token of setA) {
    if (setB.has(token)) {
      shared += 1
      if (/^[a-z0-9]{2,}$/.test(token)) sharedLatin += 1
    }
  }
  const overlap = shared / Math.min(setA.size, setB.size)
  if (overlap >= 0.28) return true
  const sharedTerms = sharedDomainTermCount(a, b, courseId)
  if (sharedTerms >= 1 && overlap >= 0.22) return true
  if (sharedLatin >= 1 && overlap >= 0.14) return true
  return false
}

/**
 * 将同一课程（或同一节提问墙）内的全部提问按语义/引用自动合并归类，
 * 用于「本节提问墙」归并看板与「期末复习包」全学期高频汇总。
 */
export function clusterClassroomThreads(threads: Thread[], courseId?: string): WallCluster[] {
  const active = threads.filter(
    (thread) => !thread.withdrawnAt && (!courseId || thread.courseId === courseId),
  )
  if (active.length === 0) return []

  const parent = new Map<string, string>(active.map((thread) => [thread.id, thread.id]))
  const find = (id: string): string => {
    const current = parent.get(id)!
    if (current === id) return id
    const root = find(current)
    parent.set(id, root)
    return root
  }
  const union = (a: string, b: string) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  // 1. 已有同题组标记或追问父子关系的线程先合并。
  const clusterOwners = new Map<string, string>()
  for (const thread of active) {
    if (thread.clusterId) {
      const key = `${thread.courseId}:${thread.clusterId}`
      const owner = clusterOwners.get(key)
      if (owner) union(thread.id, owner)
      else clusterOwners.set(key, thread.id)
    }
    if (thread.parentThreadId && parent.has(thread.parentThreadId)) {
      union(thread.id, thread.parentThreadId)
    }
  }
  for (const thread of active) {
    const owner = clusterOwners.get(`${thread.courseId}:${thread.id}`)
    if (owner && owner !== thread.id) union(thread.id, owner)
  }

  // 2. 命中同一条可靠课程 FAQ 的问题合并为一类。
  const faqOwners = new Map<string, string>()
  for (const thread of active) {
    const primarySource = thread.sources?.[0]
    if (!primarySource || thread.confidence === 'low') continue
    const key = `${thread.courseId}:${primarySource}`
    const owner = faqOwners.get(key)
    if (owner) union(thread.id, owner)
    else faqOwners.set(key, thread.id)
  }

  // 3. 语义相似度 / 共同领域术语合并（同一节课内口语不同问法自动归类）。
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i]
      const right = active[j]
      if (left.courseId !== right.courseId) continue
      if (left.groupLocked || right.groupLocked) continue
      if (classroomPairSimilar(left.question, right.question, left.courseId)) {
        union(left.id, right.id)
      }
    }
  }

  const buckets = new Map<string, Thread[]>()
  for (const thread of active) {
    const root = find(thread.id)
    const list = buckets.get(root) ?? []
    list.push(thread)
    buckets.set(root, list)
  }

  const pendingGroups = groupPendingThreads(active, courseId)
  const pendingGroupByThreadId = new Map<string, string>()
  for (const group of pendingGroups) {
    for (const thread of group.threads) {
      pendingGroupByThreadId.set(thread.id, group.key)
    }
  }

  const clusters: WallCluster[] = []
  for (const list of buckets.values()) {
    const sorted = [...list].sort((a, b) => a.createdAt - b.createdAt)
    let primary = sorted[0]
    let bestCentrality = -1
    for (const candidate of sorted) {
      let centrality = 0
      for (const other of sorted) {
        if (other.id !== candidate.id) {
          centrality += questionSimilarity(candidate.question, other.question, candidate.courseId)
        }
      }
      centrality += Math.min(candidate.question.length, 40) / 1000
      if (centrality > bestCentrality) {
        bestCentrality = centrality
        primary = candidate
      }
    }

    const topic =
      [...sorted]
        .map((thread) => thread.escalation?.title ?? '')
        .sort((a, b) => b.length - a.length)[0] ||
      primary.question.replace(/[？?]$/, '').slice(0, 36)

    const aiSolvedCount = sorted.filter(
      (thread) =>
        Boolean(thread.aiAnswer || thread.externalAnswer) &&
        !thread.escalation &&
        thread.status === 'ai',
    ).length
    const pendingCount = sorted.filter((thread) => thread.status === 'pending').length
    const needsInfoCount = sorted.filter((thread) => thread.status === 'needs-info').length
    const answeredCount = sorted.filter((thread) => thread.status === 'answered').length
    const lowConfidenceCount = sorted.filter((thread) => thread.confidence === 'low').length
    const pendingThread = sorted.find((thread) => pendingGroupByThreadId.has(thread.id))
    const pendingGroupKey = pendingThread
      ? (pendingGroupByThreadId.get(pendingThread.id) ?? null)
      : null

    const sampleQuestions = Array.from(
      new Set(sorted.map((thread) => thread.question.trim()).filter(Boolean)),
    ).slice(0, 4)

    clusters.push({
      key: primary.clusterId ?? primary.id,
      courseId: primary.courseId,
      topic,
      primary,
      threads: sorted,
      totalCount: sorted.length,
      aiSolvedCount,
      pendingCount,
      needsInfoCount,
      answeredCount,
      lowConfidenceCount,
      pendingGroupKey,
      latestAt: Math.max(...sorted.map((thread) => thread.createdAt)),
      sampleQuestions,
    })
  }

  return clusters.sort((a, b) => {
    const aNeed = a.pendingCount > 0 ? 1 : 0
    const bNeed = b.pendingCount > 0 ? 1 : 0
    if (aNeed !== bNeed) return bNeed - aNeed
    if (a.totalCount !== b.totalCount) return b.totalCount - a.totalCount
    return b.latestAt - a.latestAt
  })
}
