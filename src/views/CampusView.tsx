import { useMemo, useState } from 'react'
import { ArrowUpRight, BookOpen, Download, Search, ShieldCheck, X } from 'lucide-react'
import {
  CAMPUS_CARDS,
  CAMPUS_CATEGORIES,
  CAMPUS_CATEGORY_COUNTS,
  CAMPUS_KB_COLLECTED_AT,
  type CampusCard,
} from '../data/campusKb'
import { Badge, EmptyState, type BadgeTone } from '../components/ui'
import type { Role } from '../types'

type CredFilter = 'all' | 'official' | 'unverified' | 'no-source'
type SortMode = 'official' | 'review'

interface CampusViewProps {
  role: Role
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
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
  if (credibility.startsWith('D')) {
    return { label: '待核实', tone: 'medium', hint: '学长经验整理，尚未核实来源' }
  }
  return { label: '未标注', tone: 'neutral', hint: '未标注可信度' }
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

export function CampusView({ role, notify }: CampusViewProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [credFilter, setCredFilter] = useState<CredFilter>('all')
  const [sort, setSort] = useState<SortMode>(role === 'teacher' ? 'review' : 'official')

  const total = CAMPUS_CARDS.length
  const officialCount = CAMPUS_CARDS.filter((card) => card.credibility.startsWith('A')).length
  const unverifiedCount = CAMPUS_CARDS.filter((card) => card.credibility.startsWith('D')).length
  const noSourceCount = CAMPUS_CARDS.filter((card) => !card.sourceUrl).length

  const reviewByCategory = useMemo(() => {
    const counts = CAMPUS_CATEGORIES.map((item) => ({
      category: item,
      count: CAMPUS_CARDS.filter(
        (card) => card.category === item && card.credibility.startsWith('D'),
      ).length,
    }))
    return counts
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
  }, [])

  const tokens = useMemo(
    () => query.trim().split(/\s+/).filter(Boolean),
    [query],
  )

  const visibleCards = useMemo(() => {
    return CAMPUS_CARDS.filter((card) => category === 'all' || card.category === category)
      .filter((card) => {
        if (credFilter === 'official') return card.credibility.startsWith('A')
        if (credFilter === 'unverified') return card.credibility.startsWith('D')
        if (credFilter === 'no-source') return !card.sourceUrl
        return true
      })
      .filter((card) => matches(card, tokens))
      .sort((a, b) => {
        const scoreDiff = searchScore(b, tokens) - searchScore(a, tokens)
        if (scoreDiff !== 0) return scoreDiff
        if (sort === 'review') {
          const reviewDiff =
            Number(b.credibility.startsWith('D')) - Number(a.credibility.startsWith('D'))
          if (reviewDiff !== 0) return reviewDiff
          const sourceDiff = Number(!b.sourceUrl) - Number(!a.sourceUrl)
          if (sourceDiff !== 0) return sourceDiff
        } else {
          const officialDiff =
            Number(b.credibility.startsWith('A')) - Number(a.credibility.startsWith('A'))
          if (officialDiff !== 0) return officialDiff
          const sourceDiff = Number(Boolean(b.sourceUrl)) - Number(Boolean(a.sourceUrl))
          if (sourceDiff !== 0) return sourceDiff
        }
        return a.id.localeCompare(b.id)
      })
  }, [category, credFilter, sort, tokens])

  const filterLabel =
    credFilter === 'official'
      ? '官方来源'
      : credFilter === 'unverified'
        ? '待核实'
        : credFilter === 'no-source'
          ? '无原文链接'
          : '全部'

  return (
    <div className="page campus-page">
      <header className="campus-head">
        <div className="campus-head-main">
          <div className="eyebrow">
            <span className="eyebrow-mark gold" />
            校园生活
            <span className="eyebrow-sep">/</span>
            引路学长知识库
          </div>
          <h1 className="display-title">
            课上的问题问老师，
            <br />
            <span>课下的事问学长。</span>
          </h1>
          <p className="page-lede">
            {total} 条校园经验卡，覆盖考研、就业、竞赛、证书、学业规划、心理与校园生活。
            每条都标注来源与可信度；标为「待核实」的内容仅供参考。
          </p>
        </div>

        <aside className="campus-head-card card">
          <div className="campus-card-head">
            <span>知识卡概览</span>
            <span className="demo-tag">只读</span>
          </div>
          <div className="campus-stats">
            <div>
              <strong>{total}</strong>
              <span>条知识卡</span>
            </div>
            <div>
              <strong>{CAMPUS_CATEGORIES.length}</strong>
              <span>个分类</span>
            </div>
            <div>
              <strong>{officialCount}</strong>
              <span>条官方来源</span>
            </div>
            <div className="is-warn">
              <strong>{unverifiedCount}</strong>
              <span>条待核实</span>
            </div>
          </div>
          <div className="campus-card-foot">
            <ShieldCheck size={14} />
            采集于 {CAMPUS_KB_COLLECTED_AT} · 来自引路学长（MIT）
          </div>
        </aside>
      </header>

      <div className="campus-notice">
        <div className="campus-notice-icon">
          <ShieldCheck size={18} />
        </div>
        <div className="campus-notice-copy">
          <strong>先看可信度，再看结论。</strong>
          <span>
            「官方来源」可直接引用；「待核实」是学长经验整理，涉及政策、金额、截止日期时，
            请以学校官方通知为准。
          </span>
        </div>
      </div>

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
            <button className="search-clear" onClick={() => setQuery('')} aria-label="清空搜索">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="knowledge-actions">
          <div className="sort-switch">
            <button
              className={sort === 'official' ? 'is-active' : ''}
              onClick={() => setSort('official')}
            >
              官方优先
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
                downloadCsv(visibleCards, filterLabel)
                notify(`已导出 ${visibleCards.length} 条知识卡（${filterLabel}）。`)
              }}
              disabled={visibleCards.length === 0}
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
          {CAMPUS_CATEGORIES.map((item) => (
            <button
              key={item}
              className={`filter-pill ${category === item ? 'is-active' : ''}`}
              onClick={() => setCategory(item)}
            >
              {item}
              <span>{CAMPUS_CATEGORY_COUNTS[item] ?? 0}</span>
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
            className={`filter-pill ${credFilter === 'official' ? 'is-active' : ''}`}
            onClick={() => setCredFilter('official')}
          >
            官方来源
            <span>{officialCount}</span>
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
        <span className="knowledge-result">{visibleCards.length} 条结果</span>
      </div>

      {visibleCards.length === 0 ? (
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
        <div className="campus-grid">
          {visibleCards.map((card) => {
            const meta = credibilityMeta(card.credibility)
            return (
              <article
                className={`campus-card ${card.credibility.startsWith('D') ? 'is-review' : ''}`}
                key={card.id}
              >
                <div className="campus-card-top">
                  <Badge tone="gold">{card.category}</Badge>
                  <Badge tone={meta.tone} dot>
                    {meta.label}
                  </Badge>
                </div>
                <h3>{card.title}</h3>
                <p>{card.content}</p>
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
                  {card.sourceUrl ? (
                    <a href={card.sourceUrl} target="_blank" rel="noreferrer">
                      原文
                      <ArrowUpRight size={12} />
                    </a>
                  ) : (
                    <span className="campus-no-source">无原文链接</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="knowledge-footnote campus-footnote">
        <BookOpen size={15} />
        <span>
          知识卡来自{' '}
          <a href="https://github.com/MOKO-TB/yinlu-xuezhang" target="_blank" rel="noreferrer">
            引路学长
          </a>
          （MIT License），采集于 {CAMPUS_KB_COLLECTED_AT}。内容会过期，请以学校官方通知为准。
        </span>
      </div>
    </div>
  )
}
