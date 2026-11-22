import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  Download,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import {
  answerCampusWithAI,
  errorMessage,
  fetchAIStatus,
  type AIStatus,
} from '../lib/ai'
import {
  CAMPUS_CARDS,
  CAMPUS_CATEGORIES,
  CAMPUS_KB_COLLECTED_AT,
  type CampusCard,
} from '../data/campusKb'
import { CAMPUS_COURSE_ID, CAMPUS_OWNER_NAME } from '../data/campus'
import { retrieve } from '../lib/engine'
import {
  confidenceLabel,
  excerpt,
  formatRelative,
  makeEscalationTitle,
  makeId,
  statusLabel,
} from '../lib/utils'
import { Badge, EmptyState, Modal, RichText, type BadgeTone } from '../components/ui'
import { ThreadDetailModal } from '../components/ThreadDetailModal'
import type { AnswerResult, ExternalAnswer, Faq, Role, Thread } from '../types'
import { CampusTools, type CampusToolTab } from './campus/CampusTools'

type CredFilter = 'all' | 'verified' | 'unverified' | 'no-source'
type SortMode = 'verified' | 'review'

interface CampusViewProps {
  role: Role
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

interface CampusItem {
  card: CampusCard
  faq?: Faq
}

interface FaqDraft {
  question: string
  answer: string
  tags: string
  aliases: string
  credibility: string
  sourceChannel: string
  sourceUrl: string
  reviewNeeded: boolean
}

const CREDIBILITY_OPTIONS = ['A', 'A-官方公众号', 'B-教师回复', 'V-已核实', 'D-待核实']

function isVerifiedCredibility(credibility: string) {
  return /^[ABV]/.test(credibility)
}

/** 牌面排序：官方来源 > 教师回复 > 已核实 > 待核实。 */
function qualityRank(card: CampusCard) {
  if (card.sourceChannel.includes('AI种子草稿')) return 4
  if (card.credibility === 'A') return 0
  if (card.credibility.startsWith('A')) return 1
  if (card.credibility.startsWith('B')) return 2
  if (card.credibility.startsWith('V')) return 3
  if (card.credibility.startsWith('D')) return 4
  return 5
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function seededRank(id: string, seed: number) {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  hash ^= Math.floor(seed * 1_000_000_000)
  return hash >>> 0
}

function credibilityMeta(credibility: string): {
  label: string
  tone: BadgeTone
  hint: string
} {
  if (credibility === 'A') {
    return { label: '官方来源', tone: 'jade', hint: '学校官网等官方渠道' }
  }
  if (credibility.startsWith('A')) {
    return { label: '官方公众号', tone: 'jade', hint: '官方公众号渠道' }
  }
  if (credibility.startsWith('B')) {
    return { label: '教师回复', tone: 'blue', hint: '校园问答沉淀，由校园主理人回复' }
  }
  if (credibility.startsWith('V')) {
    return { label: '已核实', tone: 'jade', hint: '运营已对照来源核实，复核周期见管理台' }
  }
  if (credibility.startsWith('D')) {
    return { label: '待核实', tone: 'medium', hint: '学长经验整理，尚未核实来源' }
  }
  return { label: '未标注', tone: 'neutral', hint: '未标注可信度' }
}

function faqToCard(faq: Faq): CampusCard {
  const sourceChannel = faq.sourceChannel || faq.author
  const credibility =
    faq.credibility || (faq.source === 'teacher' ? 'B-教师回复' : '未标注')
  return {
    id: faq.id.startsWith('campus-') ? faq.id.slice('campus-'.length) : faq.id,
    category: faq.chapter || '校园问答',
    title: faq.question,
    content: faq.answer,
    tags: faq.tags,
    sourceChannel,
    sourceUrl: faq.sourceUrl || '',
    // AI 种子草稿即使被误标成 A，也不能出现在官方来源牌面。
    credibility: sourceChannel.includes('AI种子草稿')
      ? 'D-待核实'
      : credibility,
    collectedAt: faq.collectedAt || CAMPUS_KB_COLLECTED_AT,
  }
}

function matches(card: CampusCard, tokens: string[]) {
  if (tokens.length === 0) return true
  const haystack = normalize(
    [card.title, card.category, card.tags.join(' '), card.content].join(' '),
  )
  return tokens.every((token) => haystack.includes(normalize(token)))
}

function searchScore(card: CampusCard, tokens: string[]) {
  if (tokens.length === 0) return 0
  let score = 0
  const title = normalize(card.title)
  const tags = card.tags.map(normalize)
  const content = normalize(card.content)
  for (const token of tokens.map(normalize)) {
    if (title.includes(token)) score += 6
    if (tags.some((tag) => tag.includes(token))) score += 3
    if (content.includes(token)) score += 1
  }
  return score
}

function downloadCsv(cards: CampusCard[], suffix: string) {
  const header = [
    'id',
    'category',
    'title',
    'content',
    'tags',
    'credibility',
    'source_channel',
    'source_url',
    'collected_at',
  ]
  const rows = cards.map((card) => [
    card.id,
    card.category,
    card.title,
    card.content,
    card.tags.join('|'),
    card.credibility,
    card.sourceChannel,
    card.sourceUrl,
    card.collectedAt,
  ])
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const csv =
    '\uFEFF' +
    [header, ...rows].map((row) => row.map((cell) => escape(String(cell))).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `校园知识卡-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function splitTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,，、\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8)
}

function splitAliases(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,，、\n]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12)
}

function campusContext(matches: AnswerResult['matches']) {
  const picked: Faq[] = []
  const seen = new Set<string>()
  const add = (faq: Faq) => {
    if (seen.has(faq.id) || picked.length >= 5) return
    seen.add(faq.id)
    picked.push(faq)
  }
  for (const match of matches.slice(0, 3)) add(match.faq)
  for (const match of matches) {
    if (picked.length >= 5) break
    if (/gzasc\.edu\.cn/i.test(match.faq.sourceUrl || '')) add(match.faq)
  }
  return picked
    .map((faq) => {
      const source = [
        faq.sourceChannel ? `来源：${faq.sourceChannel}` : '',
        faq.credibility ? `可信度：${faq.credibility}` : '',
        faq.sourceUrl ? `链接：${faq.sourceUrl}` : '',
      ]
        .filter(Boolean)
        .join('；')
      return `Q: ${faq.question}\nA: ${faq.answer.slice(0, 600)}${source ? `\n${source}` : ''}`
    })
    .join('\n\n')
}

export function CampusView({ role, notify }: CampusViewProps) {
  const { data, dispatch } = useStore()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [shuffleSeed] = useState(() => Math.random())
  const [visibleLimit, setVisibleLimit] = useState(24)
  const [category, setCategory] = useState('all')
  const [toolTab, setToolTab] = useState<CampusToolTab>('gpa')
  const [credFilter, setCredFilter] = useState<CredFilter>('all')
  const [sort, setSort] = useState<SortMode>(role === 'teacher' ? 'review' : 'verified')
  const [expandedCards, setExpandedCards] = useState<Set<string>>(() => new Set())
  const [askResult, setAskResult] = useState<AnswerResult | null>(null)
  const [askThread, setAskThread] = useState<Thread | null>(null)
  const [detailThreadId, setDetailThreadId] = useState<string | null>(null)
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [aiAnswer, setAiAnswer] = useState<ExternalAnswer | null>(null)
  const [aiPreview, setAiPreview] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [editingFaq, setEditingFaq] = useState<Faq | null>(null)
  const [faqDraft, setFaqDraft] = useState<FaqDraft>({
    question: '',
    answer: '',
    tags: '',
    aliases: '',
    credibility: 'D-待核实',
    sourceChannel: '',
    sourceUrl: '',
    reviewNeeded: true,
  })

  const isCampusOps = role === 'teacher' && Boolean(user?.isAdmin)
  const aiReady = Boolean(aiStatus?.configured)

  function toggleCard(cardId: string) {
    setExpandedCards((current) => {
      const next = new Set(current)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  useEffect(() => {
    let alive = true
    fetchAIStatus()
      .then((status) => {
        if (alive) setAiStatus(status)
      })
      .catch(() => {
        if (alive) setAiStatus(null)
      })
    return () => {
      alive = false
    }
  }, [])
  const campusFaqs = useMemo(
    () => data.faqs.filter((faq) => faq.courseId === CAMPUS_COURSE_ID),
    [data.faqs],
  )
  const faqById = useMemo(
    () => new Map(campusFaqs.map((faq) => [faq.id, faq])),
    [campusFaqs],
  )
  const items: CampusItem[] = useMemo(
    () =>
      campusFaqs.length > 0
        ? campusFaqs.map((faq) => ({ card: faqToCard(faq), faq }))
        : CAMPUS_CARDS.map((card) => ({ card })),
    [campusFaqs],
  )

  const categories = useMemo(() => {
    const known = [...CAMPUS_CATEGORIES] as string[]
    const present = Array.from(new Set(items.map((item) => item.card.category)))
    return [
      ...known.filter((item) => present.includes(item)),
      ...present
        .filter((item) => !known.includes(item))
        .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    ]
  }, [items])
  const categoryCounts = useMemo(
    () =>
      Object.fromEntries(
        categories.map((item) => [
          item,
          items.filter((entry) => entry.card.category === item).length,
        ]),
      ),
    [categories, items],
  )

  const total = items.length
  const verifiedCount = items.filter((item) =>
    isVerifiedCredibility(item.card.credibility),
  ).length
  const unverifiedCount = items.filter((item) =>
    item.card.credibility.startsWith('D'),
  ).length
  const noSourceCount = items.filter((item) => !item.card.sourceUrl).length

  const reviewByCategory = useMemo(() => {
    return categories
      .map((item) => ({
        category: item,
        count: items.filter(
          (entry) =>
            entry.card.category === item && entry.card.credibility.startsWith('D'),
        ).length,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
  }, [categories, items])

  const tokens = useMemo(
    () => query.trim().split(/\s+/).filter(Boolean),
    [query],
  )

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => category === 'all' || item.card.category === category)
      .filter((item) => {
        if (credFilter === 'verified') {
          return isVerifiedCredibility(item.card.credibility)
        }
        if (credFilter === 'unverified') return item.card.credibility.startsWith('D')
        if (credFilter === 'no-source') return !item.card.sourceUrl
        return true
      })
      .filter((item) => matches(item.card, tokens))
      .sort((a, b) => {
        const scoreDiff =
          searchScore(b.card, tokens) - searchScore(a.card, tokens)
        if (scoreDiff !== 0) return scoreDiff
        if (sort === 'review') {
          const reviewDiff =
            Number(b.card.credibility.startsWith('D')) -
            Number(a.card.credibility.startsWith('D'))
          if (reviewDiff !== 0) return reviewDiff
          const sourceDiff =
            Number(!b.card.sourceUrl) - Number(!a.card.sourceUrl)
          if (sourceDiff !== 0) return sourceDiff
        } else {
          const qualityDiff = qualityRank(a.card) - qualityRank(b.card)
          if (qualityDiff !== 0) return qualityDiff
          const sourceDiff =
            Number(Boolean(b.card.sourceUrl)) - Number(Boolean(a.card.sourceUrl))
          if (sourceDiff !== 0) return sourceDiff
        }
        if (tokens.length === 0) {
          const randomDiff =
            seededRank(a.card.id, shuffleSeed) - seededRank(b.card.id, shuffleSeed)
          if (randomDiff !== 0) return randomDiff
        }
        return a.card.id.localeCompare(b.card.id)
      })
  }, [category, credFilter, items, shuffleSeed, sort, tokens])

  useEffect(() => {
    setVisibleLimit(24)
  }, [query, category, credFilter, sort])

  const shownItems = useMemo(
    () => visibleItems.slice(0, visibleLimit),
    [visibleItems, visibleLimit],
  )

  const pendingCampus = useMemo(
    () =>
      data.threads.filter(
        (thread) =>
          thread.courseId === CAMPUS_COURSE_ID &&
          thread.status === 'pending' &&
          !thread.withdrawnAt,
      ),
    [data.threads],
  )
  const myCampusThreads = useMemo(
    () =>
      user
        ? data.threads.filter(
            (thread) =>
              thread.courseId === CAMPUS_COURSE_ID &&
              thread.student.id === user.id,
          )
        : [],
    [data.threads, user],
  )
  const reviewFaqs = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.card.credibility.startsWith('D') || item.faq?.reviewNeeded,
        )
        .slice(0, 8),
    [items],
  )

  const filterLabel =
    credFilter === 'verified'
      ? '已验证'
      : credFilter === 'unverified'
        ? '待核实'
        : credFilter === 'no-source'
          ? '无原文链接'
          : '全部'

  const openEditor = (faq: Faq) => {
    setEditingFaq(faq)
    setFaqDraft({
      question: faq.question,
      answer: faq.answer,
      tags: faq.tags.join('，'),
      aliases: faq.aliases.join('，'),
      credibility: faq.credibility || 'D-待核实',
      sourceChannel: faq.sourceChannel || faq.author,
      sourceUrl: faq.sourceUrl || '',
      reviewNeeded: Boolean(faq.reviewNeeded),
    })
  }

  const saveFaq = () => {
    if (!editingFaq) return
    const question = faqDraft.question.trim()
    const answer = faqDraft.answer.trim()
    if (question.length < 4) {
      notify('问题至少写 4 个字。', 'info')
      return
    }
    if (answer.length < 40) {
      notify('答案至少写 40 个字，避免沉淀出无效 FAQ。', 'info')
      return
    }
    dispatch({
      type: 'faq-updated',
      faqId: editingFaq.id,
      patch: {
        question,
        answer,
        tags: splitTags(faqDraft.tags),
        aliases: splitAliases(faqDraft.aliases),
        credibility: faqDraft.credibility.trim(),
        sourceChannel: faqDraft.sourceChannel.trim(),
        sourceUrl: faqDraft.sourceUrl.trim(),
        reviewNeeded: faqDraft.reviewNeeded,
      },
    })
    setEditingFaq(null)
    notify('校园 FAQ 已保存。')
  }

  const handleAsk = async (raw?: string) => {
    if (askBusy) return
    const question = (raw ?? query).trim()
    if (!question) return

    const result = retrieve(campusFaqs, question, CAMPUS_COURSE_ID)
    setAskThread(null)
    setAiAnswer(null)
    setAiPreview('')

    // 只有高置信才直接把知识库原文当答案；中置信只说明“相近”，交给 AI 按问题重新整理。
    if (result.confidence === 'high' && result.top) {
      setAskResult(result)
      return
    }

    // 本地没有非常相关的答案：AI 给参考答复，同时自动转交校园主理人核实。
    if (!aiReady) {
      setAskResult(
        result.confidence === 'high'
          ? result
          : {
              ...result,
              confidence: 'low',
              top: undefined,
              answer: undefined,
              sourceIds: [],
              reason: '知识库没有非常相关的内容，AI 暂时不可用；建议转交校园主理人确认。',
            },
      )
      return
    }

    setAskResult(null)
    setAskBusy(true)
    try {
      const external = await answerCampusWithAI({
        question,
        localContext: campusContext(result.matches),
        onUpdate: (partial) => setAiPreview(partial),
      })
      const answer: ExternalAnswer = {
        text: external.text,
        model: external.model || aiStatus?.model || '服务端 AI',
        at: Date.now(),
      }
      setAiAnswer(answer)
      escalate({ question, result, externalAnswer: answer, silent: true })
      notify('知识库没有现成答案：引路学长已给出参考答复，并转交校园主理人核实。', 'info')
    } catch (error) {
      escalate({ question, result, silent: true })
      notify(
        `引路学长暂时没能回答（${errorMessage(error)}），已转交校园主理人。`,
        'danger',
      )
    } finally {
      setAskBusy(false)
      setAiPreview('')
    }
  }

  const escalate = (options?: {
    question?: string
    result?: AnswerResult | null
    externalAnswer?: ExternalAnswer | null
    silent?: boolean
  }) => {
    if (!user) return
    const question = (options?.question ?? query).trim()
    if (!question) return
    const result = options?.result ?? askResult
    const externalAnswer = options?.externalAnswer ?? null
    const thread: Thread = {
      id: makeId('t'),
      courseId: CAMPUS_COURSE_ID,
      student: { id: user.id, name: user.name, anonymous: false },
      question,
      createdAt: Date.now(),
      status: 'ai',
      sources: externalAnswer ? [] : (result?.sourceIds ?? []),
      externalAnswer: externalAnswer ?? undefined,
    }
    dispatch({
      type: 'thread-created',
      thread,
      aiSolved: Boolean(externalAnswer),
      citedFaqIds: thread.sources ?? [],
    })
    dispatch({
      type: 'escalated',
      threadId: thread.id,
      escalation: {
        title: makeEscalationTitle(question),
        note: externalAnswer
          ? '校园知识库没有可靠答案，引路学长已给出参考答复；请校园主理人核实后回复。'
          : '校园知识库没有足够可靠的答案，转交校园主理人。',
        anonymous: false,
        urgency: 'week',
        at: Date.now(),
        auto: true,
      },
      clusterId: undefined,
      joinedExistingGroup: false,
    })
    setAskThread(thread)
    setAskResult(null)
    if (!externalAnswer) {
      setAiAnswer(null)
    }
    if (!options?.silent) {
      notify('已转交校园主理人，回复后会通知你。')
    }
  }

  const replyThread = (thread: Thread) => {
    if (!user) return
    const text = (replyDrafts[thread.id] ?? '').trim()
    if (text.length < 8) {
      notify('回复至少写 8 个字。', 'info')
      return
    }
    const now = Date.now()
    const faq: Faq | undefined =
      text.length >= 40
        ? {
            id: `campus-reply-${thread.id}`,
            courseId: CAMPUS_COURSE_ID,
            question: thread.question,
            aliases: [thread.question],
            answer: text,
            tags: ['校园问答'],
            author: user.name || CAMPUS_OWNER_NAME,
            source: 'teacher',
            createdAt: now,
            updatedAt: now,
            citations: 0,
            helpful: 0,
            unhelpful: 0,
            chapter: '校园问答',
            credibility: 'B-教师回复',
            sourceChannel: '校园问答沉淀',
            sourceUrl: '',
            collectedAt: new Date(now).toISOString().slice(0, 10),
            reviewNeeded: false,
          }
        : undefined
    dispatch({
      type: 'teacher-reply',
      threadIds: [thread.id],
      reply: {
        text,
        at: now,
        by: user.name || CAMPUS_OWNER_NAME,
        faqId: faq?.id,
        recipientCount: 1,
      },
      faq,
    })
    setReplyDrafts((current) => ({ ...current, [thread.id]: '' }))
    notify(
      faq
        ? '已回复并沉淀为校园 FAQ。'
        : '已回复；内容不足 40 字，未沉淀 FAQ。',
    )
  }

  return (
    <div className="page campus-page">
      <header className="campus-head">
        <div className="campus-head-main">
          <div className="campus-brand">
            <strong>引路学长</strong>
            <span>整合了众多上岸学长，学姐真实经历的智能体</span>
          </div>
          <h1 className="display-title">
            课上的问题问老师
            <br />
            <span>课下的事问学长</span>
          </h1>
        </div>
      </header>

      {role === 'student' && (
        <section className="campus-ai-search card">
          <div className="campus-ai-search-head">
            <div>
              <strong>
                <Sparkles size={16} />
                引路学长
              </strong>
            </div>
          </div>
          <div className="campus-ai-search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleAsk(query)
              }}
              placeholder="问一句校园的事，或搜关键词…"
              aria-label="问引路学长"
              disabled={askBusy}
            />
            {query && (
              <button
                className="search-clear"
                onClick={() => setQuery('')}
                aria-label="清空搜索"
                type="button"
              >
                <X size={14} />
              </button>
            )}
            <button
              className="button button-primary"
              onClick={() => void handleAsk(query)}
              disabled={!query.trim() || askBusy}
            >
              {askBusy ? <Sparkles size={15} /> : <Send size={15} />}
              {askBusy ? '学长正在整理…' : '问引路学长'}
            </button>
          </div>
          <div className="campus-ai-search-foot">
            <span>{visibleItems.length} 条相关卡片</span>
          </div>
        </section>
      )}

      {askBusy && (
        <section className="campus-answer card is-ai">
          <div className="campus-answer-head">
            <Badge tone="blue" dot>
              引路学长
            </Badge>
          </div>
          {aiPreview ? (
            <div className="campus-answer-body">
              <RichText text={aiPreview} />
            </div>
          ) : (
            <p className="campus-answer-empty">正在整理答案…</p>
          )}
        </section>
      )}

      {!askBusy && aiAnswer && (
        <section className="campus-answer card is-ai">
          <div className="campus-answer-head">
            <Badge tone="blue" dot>
              引路学长
            </Badge>
          </div>
          <div className="campus-answer-body">
            <RichText text={aiAnswer.text} />
          </div>
          {askThread && (
            <div className="campus-answer-actions">
              <button
                className="button button-secondary"
                onClick={() => setDetailThreadId(askThread.id)}
              >
                继续追问
                <ArrowUpRight size={14} />
              </button>
            </div>
          )}
        </section>
      )}

      {askResult && (
        <section className="campus-answer card">
          <div className="campus-answer-head">
            <Badge
              tone={
                askResult.confidence === 'high'
                  ? 'jade'
                  : askResult.confidence === 'medium'
                    ? 'gold'
                    : 'medium'
              }
              dot
            >
              {confidenceLabel(askResult.confidence)}
            </Badge>
            <span>{askResult.reason}</span>
          </div>
          {askResult.top ? (
            <>
              <h3>{askResult.top.faq.question}</h3>
              <div className="campus-answer-body">
                <RichText text={askResult.top.faq.answer} />
              </div>
              <div className="campus-answer-sources">
                {askResult.sourceIds.map((id) => {
                  const faq = faqById.get(id)
                  if (!faq) return null
                  const meta = credibilityMeta(faq.credibility || '')
                  return (
                    <div className="campus-answer-source" key={id}>
                      <span>{faq.question}</span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {faq.sourceUrl ? (
                        <a href={faq.sourceUrl} target="_blank" rel="noreferrer">
                          原文
                          <ArrowUpRight size={11} />
                        </a>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="campus-answer-empty">
              知识库里没有找到直接相关的内容。
            </p>
          )}
          <div className="campus-answer-actions">
            <button
              className="button button-primary"
              onClick={() => escalate()}
            >
              转交校园主理人
            </button>
            <span>会附上你的问题和检索到的依据</span>
          </div>
        </section>
      )}

      {askThread && (
        <section className="campus-answer card is-escalated">
          <div className="campus-answer-head">
            <Badge tone="pending" dot>
              已转交
            </Badge>
          </div>
          <h3>{askThread.question}</h3>
        </section>
      )}

      <CampusTools
        tab={toolTab}
        onTabChange={setToolTab}
        askCount={role === 'student' ? myCampusThreads.length : 0}
        kbCategories={categories.map((name) => ({ name, count: categoryCounts[name] ?? 0 }))}
        activeCategory={category}
        onPickCategory={(next) => {
          setToolTab('kb')
          setCategory(next)
          setCredFilter('all')
          setQuery('')
          // 等筛选结果渲染后再滚到知识卡列表
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              document
                .querySelector('.campus-grid')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            })
          })
        }}
          askSlot={
            <div className="campus-thread-list">
              {myCampusThreads.slice(0, 4).map((thread) => (
                <article
                  className="campus-thread card"
                  key={thread.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`查看提问详情：${thread.question}`}
                  onClick={() => setDetailThreadId(thread.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setDetailThreadId(thread.id)
                    }
                  }}
                >
                  <div className="campus-thread-top">
                    <Badge tone={thread.status === 'answered' ? 'answered' : 'pending'}>
                      {thread.status === 'pending'
                        ? '待校园主理人回复'
                        : thread.status === 'answered'
                          ? '校园主理人已回复'
                          : statusLabel(thread)}
                    </Badge>
                    <span>{formatRelative(thread.createdAt)}</span>
                  </div>
                  <strong>{thread.question}</strong>
                  {thread.teacherReply ? (
                    <p>{thread.teacherReply.text}</p>
                  ) : thread.externalAnswer ? (
                    <>
                      <p>
                        {excerpt(
                          thread.externalAnswer.text
                            .replace(/^#{1,3}\s+/gm, '')
                            .replace(/^[•-]\s+/gm, ''),
                          160,
                        )}
                      </p>
                      <span className="campus-thread-ai-note">
                        <Sparkles size={11} />
                        引路学长参考答复 · 等校园主理人核实
                      </span>
                    </>
                  ) : (
                    <p className="campus-thread-waiting">等校园主理人回复…</p>
                  )}
                </article>
              ))}
            </div>
          }
        >

      {role === 'teacher' && (
        <div className="campus-ops card">
          <div className="campus-ops-copy">
            <strong>
              运营视角：{unverifiedCount} 条待核实，{noSourceCount} 条没有原文链接
            </strong>
            <span>
              待核实最多：{reviewByCategory.map((item) => `${item.category} ${item.count}`).join('、')}。
              建议先核实政策、金额、截止日期类内容，再把稳定内容接入问答闭环。
            </span>
          </div>
          <button
            className="button button-ghost"
            onClick={() => {
              setCredFilter('unverified')
              setCategory('all')
              setQuery('')
            }}
          >
            <ShieldCheck size={15} />
            只看待核实
          </button>
        </div>
      )}

      {isCampusOps && (
        <section className="campus-queue card">
          <div className="campus-section-head">
            <div>
              <strong>校园待处理</strong>
              <span>
                {pendingCampus.length} 个问题在等校园主理人
              </span>
            </div>
            <Badge tone={pendingCampus.length > 0 ? 'pending' : 'neutral'}>
              {pendingCampus.length}
            </Badge>
          </div>
          {pendingCampus.length === 0 ? (
            <p className="campus-empty-line">暂无待处理问题。</p>
          ) : (
            pendingCampus.slice(0, 5).map((thread) => (
              <div className="campus-queue-item" key={thread.id}>
                <div className="campus-queue-meta">
                  <Badge tone="gold">校园生活</Badge>
                  <span>
                    {thread.student.name} · {formatRelative(thread.createdAt)}
                  </span>
                </div>
                <strong>{thread.question}</strong>
                <textarea
                  rows={3}
                  data-enter-submit
                  value={replyDrafts[thread.id] ?? ''}
                  onChange={(event) =>
                    setReplyDrafts((current) => ({
                      ...current,
                      [thread.id]: event.target.value,
                    }))
                  }
                  placeholder="写下回复；超过 40 字会自动沉淀为校园 FAQ…"
                />
                <div className="campus-queue-actions">
                  <span>
                    {(replyDrafts[thread.id] ?? '').trim().length >= 40
                      ? '将沉淀为 FAQ'
                      : '不足 40 字只回复，不沉淀'}
                  </span>
                  <button
                    className="button button-primary"
                    onClick={() => replyThread(thread)}
                    disabled={(replyDrafts[thread.id] ?? '').trim().length < 8}
                  >
                    <Send size={14} />
                    回复
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {isCampusOps && (
        <section className="campus-review card">
          <div className="campus-section-head">
            <div>
              <strong>校园 FAQ 审阅</strong>
              <span>{reviewFaqs.length} 条待核实或待完善，可直接编辑</span>
            </div>
          </div>
          {reviewFaqs.length === 0 ? (
            <p className="campus-empty-line">当前没有待核实 FAQ。</p>
          ) : (
            <div className="campus-review-list">
              {reviewFaqs.map((item) =>
                item.faq ? (
                  <div className="campus-review-item" key={item.faq.id}>
                    <div>
                      <strong>{item.faq.question}</strong>
                      <span>
                        {item.faq.credibility || '未标注'} ·{' '}
                        {item.faq.sourceChannel || '无来源'}
                      </span>
                    </div>
                    <button
                      className="button button-ghost"
                      onClick={() => openEditor(item.faq as Faq)}
                    >
                      编辑
                    </button>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </section>
      )}

      {role === 'teacher' && (
        <>
          <section className="knowledge-toolbar card">
        <div className="knowledge-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜校园问题、标签或关键词…"
            aria-label="搜索校园知识卡"
          />
          {query && (
            <button
              className="search-clear"
              onClick={() => setQuery('')}
              aria-label="清空搜索"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="knowledge-actions">
          <div className="sort-switch">
            <button
              className={sort === 'verified' ? 'is-active' : ''}
              onClick={() => setSort('verified')}
            >
              优质优先
            </button>
            <button
              className={sort === 'review' ? 'is-active' : ''}
              onClick={() => setSort('review')}
            >
              待核实优先
            </button>
          </div>
          {role === 'teacher' && (
            <button
              className="button button-ghost"
              onClick={() => {
                downloadCsv(
                  visibleItems.map((item) => item.card),
                  filterLabel,
                )
                notify(
                  `已导出 ${visibleItems.length} 条知识卡（${filterLabel}）。`,
                )
              }}
              disabled={visibleItems.length === 0}
            >
              <Download size={15} />
              导出 CSV
            </button>
          )}
        </div>
      </section>

      <div className="campus-filter-row">
        <div className="campus-filter-group">
          <span className="campus-filter-label">分类</span>
          <button
            className={`filter-pill ${category === 'all' ? 'is-active' : ''}`}
            onClick={() => setCategory('all')}
          >
            全部
            <span>{total}</span>
          </button>
          {categories.map((item) => (
            <button
              key={item}
              className={`filter-pill ${category === item ? 'is-active' : ''}`}
              onClick={() => setCategory(item)}
            >
              {item}
              <span>{categoryCounts[item] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="campus-filter-group">
          <span className="campus-filter-label">可信度</span>
          <button
            className={`filter-pill ${credFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setCredFilter('all')}
          >
            全部
          </button>
          <button
            className={`filter-pill ${credFilter === 'verified' ? 'is-active' : ''}`}
            onClick={() => setCredFilter('verified')}
          >
            已验证
            <span>{verifiedCount}</span>
          </button>
          <button
            className={`filter-pill ${credFilter === 'unverified' ? 'is-active' : ''}`}
            onClick={() => setCredFilter('unverified')}
          >
            待核实
            <span>{unverifiedCount}</span>
          </button>
          <button
            className={`filter-pill ${credFilter === 'no-source' ? 'is-active' : ''}`}
            onClick={() => setCredFilter('no-source')}
          >
            无原文链接
            <span>{noSourceCount}</span>
          </button>
        </div>
        <span className="knowledge-result">{visibleItems.length} 条结果</span>
      </div>
        </>
      )}

      {(role === 'teacher' || toolTab === 'kb') && (visibleItems.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BookOpen size={20} />}
            title="没有匹配的校园知识"
            description="换一个关键词，或放宽分类和可信度筛选。"
            action={
              <button
                className="text-button"
                onClick={() => {
                  setQuery('')
                  setCategory('all')
                  setCredFilter('all')
                }}
              >
                查看全部知识卡
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="campus-grid">
            {shownItems.map(({ card, faq }) => {
            const meta = credibilityMeta(card.credibility)
            const expanded = expandedCards.has(card.id)
            const canExpand = card.content.length > 90
            return (
              <article
                className={`campus-card ${
                  card.credibility.startsWith('D') ? 'is-review' : ''
                } ${expanded ? 'is-expanded' : ''}`}
                key={card.id}
              >
                <div className="campus-card-top">
                  <Badge tone="gold">{card.category}</Badge>
                  <Badge tone={meta.tone} dot>
                    {meta.label}
                  </Badge>
                </div>
                <h3>{card.title}</h3>
                <p className={expanded ? 'is-expanded' : ''}>{card.content}</p>
                {canExpand ? (
                  <button
                    type="button"
                    className="campus-card-toggle"
                    aria-expanded={expanded}
                    onClick={() => toggleCard(card.id)}
                  >
                    {expanded ? '收起' : '展开全文'}
                  </button>
                ) : null}
                <div className="tag-row">
                  {card.tags.slice(0, 4).map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="campus-card-foot">
                  <span className="campus-source" title={meta.hint}>
                    {card.sourceChannel || '未标注来源'}
                  </span>
                  <div className="campus-card-links">
                    {isCampusOps && faq ? (
                      <button
                        className="text-button campus-edit-link"
                        onClick={() => openEditor(faq)}
                      >
                        编辑
                      </button>
                    ) : null}
                    {card.sourceUrl ? (
                      <a href={card.sourceUrl} target="_blank" rel="noreferrer">
                        原文
                        <ArrowUpRight size={12} />
                      </a>
                    ) : (
                      <span className="campus-no-source">无原文链接</span>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
          </div>
          {visibleItems.length > shownItems.length && (
            <div className="campus-load-more">
              <button
                className="button button-secondary"
                onClick={() => setVisibleLimit((limit) => limit + 24)}
              >
                加载更多（还剩 {visibleItems.length - shownItems.length} 条）
              </button>
            </div>
          )}
        </>
      ))}
      </CampusTools>

      <Modal
        open={Boolean(editingFaq)}
        onClose={() => setEditingFaq(null)}
        title="编辑校园 FAQ"
        eyebrow="校园运营"
        footer={
          <div className="modal-actions">
            <button
              className="button button-ghost"
              onClick={() => setEditingFaq(null)}
            >
              取消
            </button>
            <button className="button button-primary" onClick={saveFaq}>
              保存
            </button>
          </div>
        }
      >
        <div className="campus-editor">
          <label>
            <span>问题</span>
            <input
              value={faqDraft.question}
              onChange={(event) =>
                setFaqDraft((current) => ({
                  ...current,
                  question: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>答案</span>
            <textarea
              rows={8}
              value={faqDraft.answer}
              onChange={(event) =>
                setFaqDraft((current) => ({
                  ...current,
                  answer: event.target.value,
                }))
              }
            />
          </label>
          <div className="campus-editor-row">
            <label>
              <span>标签</span>
              <input
                value={faqDraft.tags}
                onChange={(event) =>
                  setFaqDraft((current) => ({
                    ...current,
                    tags: event.target.value,
                  }))
                }
                placeholder="用逗号分隔"
              />
            </label>
            <label>
              <span>别名</span>
              <input
                value={faqDraft.aliases}
                onChange={(event) =>
                  setFaqDraft((current) => ({
                    ...current,
                    aliases: event.target.value,
                  }))
                }
                placeholder="用逗号分隔"
              />
            </label>
          </div>
          <div className="campus-editor-row">
            <label>
              <span>可信度</span>
              <select
                value={faqDraft.credibility}
                onChange={(event) =>
                  setFaqDraft((current) => ({
                    ...current,
                    credibility: event.target.value,
                  }))
                }
              >
                {!CREDIBILITY_OPTIONS.includes(faqDraft.credibility) && (
                  <option value={faqDraft.credibility}>
                    {faqDraft.credibility || '未标注'}
                  </option>
                )}
                {CREDIBILITY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>来源渠道</span>
              <input
                value={faqDraft.sourceChannel}
                onChange={(event) =>
                  setFaqDraft((current) => ({
                    ...current,
                    sourceChannel: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label>
            <span>原文链接</span>
            <input
              value={faqDraft.sourceUrl}
              onChange={(event) =>
                setFaqDraft((current) => ({
                  ...current,
                  sourceUrl: event.target.value,
                }))
              }
              placeholder="https://…"
            />
          </label>
          <label className="campus-checkbox">
            <input
              type="checkbox"
              checked={faqDraft.reviewNeeded}
              onChange={(event) =>
                setFaqDraft((current) => ({
                  ...current,
                  reviewNeeded: event.target.checked,
                }))
              }
            />
            <span>仍待核实（会出现在待核实筛选里）</span>
          </label>
        </div>
      </Modal>

      <ThreadDetailModal
        threadId={detailThreadId}
        onClose={() => setDetailThreadId(null)}
        viewer="student"
        onCampusFollowUp={async (_thread, question, history) => {
          const result = retrieve(campusFaqs, question, CAMPUS_COURSE_ID)
          return answerCampusWithAI({
            question,
            localContext: campusContext(result.matches),
            history,
          })
        }}
        onOpenFaq={(faqId) => {
          const faq = data.faqs.find((item) => item.id === faqId)
          if (faq) setQuery(faq.question)
          setDetailThreadId(null)
        }}
      />
    </div>
  )
}
