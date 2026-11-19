import { useMemo, useState } from 'react'
import {
  ArrowRight,
  ArrowUpDown,
  BookOpen,
  CircleAlert,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { allCourses, courseById, isSeededCourse, teacherByName } from '../data/seed'
import { CAMPUS_COURSE_ID } from '../data/campus'
import { isPilotCourse } from '../data/pilot'
import { computeGaps } from '../lib/engine'
import { useProfile } from '../lib/profile'
import type { FaqPrefill, KnowledgeGap, Role } from '../types'
import { excerpt, formatRelative, percent } from '../lib/utils'
import { Donut } from '../components/charts'
import { ImportExportModal } from '../components/ImportExportModal'
import { Badge, EmptyState, Seal } from '../components/ui'

interface KnowledgeViewProps {
  role: Role
  teacherName: string
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  openFaq: (faqId: string) => void
  openFaqEditor: (faqId?: string) => void
  openFaqDraft: (prefill: FaqPrefill) => void
  onGoTeacher: () => void
}

type SortMode = 'recent' | 'citations'

function courseTone(courseId: string) {
  if (courseId === 'ds') return 'jade' as const
  if (courseId === 'math') return 'clay' as const
  if (courseId === 'net') return 'blue' as const
  return 'gold' as const
}

export function KnowledgeView({
  role,
  teacherName,
  notify,
  openFaq,
  openFaqEditor,
  openFaqDraft,
  onGoTeacher,
}: KnowledgeViewProps) {
  const { data } = useStore()
  const profile = useProfile()
  const [query, setQuery] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [chapterFilter, setChapterFilter] = useState('all')
  const [sort, setSort] = useState<SortMode>('recent')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const allGaps = useMemo(() => computeGaps(data.threads, data.faqs), [data.threads, data.faqs])
  const teacherCourseIds = useMemo(
    () =>
      role === 'teacher'
        ? teacherByName(teacherName).courses.filter(
            (id) => isPilotCourse(id) || !isSeededCourse(id),
          )
        : null,
    [role, teacherName, profile.customCourses],
  )
  const courseOptions = useMemo(
    () =>
      allCourses().filter(
        (course) =>
          (isPilotCourse(course.id) || !isSeededCourse(course.id)) &&
          (!teacherCourseIds || teacherCourseIds.includes(course.id)),
      ),
    [teacherCourseIds, profile.customCourses],
  )
  const scopedGaps = useMemo(() => {
    if (!teacherCourseIds) return allGaps
    return allGaps.filter((gap) => teacherCourseIds.includes(gap.courseId))
  }, [allGaps, teacherCourseIds])
  const baseFaqs = useMemo(
    () =>
      (teacherCourseIds
        ? data.faqs.filter((faq) => teacherCourseIds.includes(faq.courseId))
        : data.faqs
      ).filter((faq) => faq.courseId !== CAMPUS_COURSE_ID),
    [data.faqs, teacherCourseIds],
  )
  const totalCitations = baseFaqs.reduce((sum, faq) => sum + faq.citations, 0)
  const totalHelpful = baseFaqs.reduce((sum, faq) => sum + faq.helpful, 0)
  const totalVotes = baseFaqs.reduce((sum, faq) => sum + faq.helpful + faq.unhelpful, 0)
  const helpfulRate = totalVotes > 0 ? totalHelpful / totalVotes : 0
  const courseCount = new Set(baseFaqs.map((faq) => faq.courseId)).size
  const reviewCount = baseFaqs.filter((faq) => faq.reviewNeeded).length
  const chapterCoverage = useMemo(() => {
    const map = new Map<
      string,
      { chapter: string; count: number; citations: number; review: number }
    >()
    for (const faq of baseFaqs) {
      const chapter = faq.chapter?.trim() || '未标章节'
      const item = map.get(chapter) ?? { chapter, count: 0, citations: 0, review: 0 }
      item.count += 1
      item.citations += faq.citations
      if (faq.reviewNeeded) item.review += 1
      map.set(chapter, item)
    }
    return [...map.values()].sort(
      (a, b) =>
        b.count - a.count ||
        b.citations - a.citations ||
        a.chapter.localeCompare(b.chapter, 'zh-Hans-CN'),
    )
  }, [baseFaqs])
  const maxChapterFaqs = Math.max(1, ...chapterCoverage.map((item) => item.count))

  const visibleFaqs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return baseFaqs
      .filter((faq) => courseFilter === 'all' || faq.courseId === courseFilter)
      .filter((faq) => !reviewOnly || faq.reviewNeeded)
      .filter((faq) => {
        if (chapterFilter === 'all') return true
        if (chapterFilter === 'none') return !faq.chapter
        return faq.chapter === chapterFilter
      })
      .filter((faq) => {
        if (!normalizedQuery) return true
        const haystack = [faq.question, faq.answer, ...faq.tags, ...faq.aliases]
          .join(' ')
          .toLowerCase()
        return haystack.includes(normalizedQuery)
      })
      .sort((a, b) =>
        sort === 'recent' ? b.updatedAt - a.updatedAt : b.citations - a.citations,
      )
  }, [baseFaqs, courseFilter, chapterFilter, query, sort, reviewOnly])

  const chapterOptions = useMemo(() => {
    const scoped = baseFaqs.filter(
      (faq) => courseFilter === 'all' || faq.courseId === courseFilter,
    )
    const chapters = Array.from(
      new Set(scoped.map((faq) => faq.chapter).filter((chapter): chapter is string => Boolean(chapter))),
    )
    return chapters.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }, [baseFaqs, courseFilter])

  const bannerGaps = [...scopedGaps]
    .sort((a, b) => {
      const reviewDiff = Number(b.reason === 'review') - Number(a.reason === 'review')
      return reviewDiff !== 0 ? reviewDiff : b.count - a.count
    })
    .slice(0, 3)

  const handleGapDraft = (gap: KnowledgeGap) => {
    if (gap.reason === 'review' && gap.sourceFaqId) {
      openFaqEditor(gap.sourceFaqId)
      return
    }
    const base = gap.sourceFaqId
      ? data.faqs.find((faq) => faq.id === gap.sourceFaqId)
      : undefined
    const answer = [
      '【AI 草稿 · 请补完后再保存】',
      '',
      `这个问题来自最近的待办：${gap.topic}。`,
      base
        ? `知识库里最接近的是《${base.question}》，可以先从这条出发：\n\n${base.answer}`
        : '知识库里目前没有直接覆盖这个问题的内容。',
      '',
      '还需要补充：',
      `• 直接回答「${gap.topic}」的关键点`,
      '• 一个具体例子',
      '• 常见误区',
    ].join('\n')
    openFaqDraft({
      courseId: gap.courseId,
      question: `${gap.topic.replace(/[？?]$/, '')}？`,
      answer,
      tags: Array.from(new Set([...(base?.tags.slice(0, 3) ?? []), '知识缺口'])),
      chapter: base?.chapter,
    })
  }

  return (
    <div className="page knowledge-page">
      <header className="knowledge-head">
        <div className="knowledge-head-main">
          <div className="eyebrow">
            <span className="eyebrow-mark gold" />
            课程知识库
            <span className="eyebrow-sep">/</span>
            {baseFaqs.length} 条答案 · {courseCount} 门课
          </div>
          <h1 className="display-title">
            老师写下的答案，
            <br />
            <span>成为 AI 的第一反应。</span>
          </h1>
        </div>

        <aside className="knowledge-head-card">
          <div className="knowledge-card-head">
            <span>知识库健康度</span>
          </div>
          <div className="knowledge-health-main">
            <Donut value={helpfulRate} label="有帮助" size={84} stroke={8} />
            <div className="knowledge-health-copy">
              <strong>{totalCitations}</strong>
              <span>次被 AI 引用</span>
              <em className={baseFaqs.some((faq) => faq.reviewNeeded) ? '' : 'is-clear'}>
                {baseFaqs.some((faq) => faq.reviewNeeded)
                  ? `${baseFaqs.filter((faq) => faq.reviewNeeded).length} 条待完善`
                  : '暂无待完善'}
              </em>
            </div>
          </div>
        </aside>
      </header>

      {role === 'teacher' && scopedGaps.length > 0 && (
        <div className="gap-banner">
          <div className="gap-banner-icon">
            <CircleAlert size={18} />
          </div>
          <div className="gap-banner-content">
            <div className="gap-banner-copy">
              <strong>AI 在你的课程里发现了 {scopedGaps.length} 个知识缺口</strong>
              
            </div>
            <div className="gap-draft-list">
              {bannerGaps.map((gap) => (
                <div className="gap-draft-row" key={gap.id}>
                  <span className="gap-draft-topic">{gap.topic}</span>
                  <button className="gap-draft-action" onClick={() => handleGapDraft(gap)}>
                    {gap.reason === 'review' ? '完善这条答案' : '生成 FAQ 草稿'}
                    <ArrowRight size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button className="button button-ghost gap-banner-action" onClick={onGoTeacher}>
            去待办台处理
            <ArrowRight size={15} />
          </button>
        </div>
      )}

      {role === 'teacher' && chapterCoverage.length > 0 && (
        <details className="chapter-coverage card" open>
          <summary>
            <span>章节覆盖热力图</span>
            <em>{chapterCoverage.length} 个章节 · {baseFaqs.length} 条 FAQ</em>
          </summary>
          <div className="chapter-heatmap" role="list" aria-label="章节 FAQ 覆盖">
            {chapterCoverage.slice(0, 16).map((item) => {
              const ratio = item.count / maxChapterFaqs
              const level =
                ratio >= 0.75
                  ? 'is-hot'
                  : ratio >= 0.45
                    ? 'is-warm'
                    : ratio >= 0.2
                      ? 'is-cool'
                      : 'is-low'
              return (
                <div className={`chapter-heat-cell ${level}`} key={item.chapter} role="listitem">
                  <strong>{item.chapter}</strong>
                  <span>{item.count} 条 FAQ · {item.citations} 次引用</span>
                  {item.review > 0 && <em>{item.review} 条待完善</em>}
                </div>
              )
            })}
          </div>
        </details>
      )}

      <section className="knowledge-toolbar card">
        <div className="knowledge-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜问题、答案或标签…"
            aria-label="搜索知识库"
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery('')} aria-label="清空搜索">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="knowledge-actions">
          <div className="sort-switch">
            <button className={sort === 'recent' ? 'is-active' : ''} onClick={() => setSort('recent')}>
              最近更新
            </button>
            <button
              className={sort === 'citations' ? 'is-active' : ''}
              onClick={() => setSort('citations')}
            >
              引用最多
            </button>
          </div>
          {role === 'teacher' && (
            <>
              <button
                className="button button-ghost"
                onClick={() => setTransferOpen(true)}
              >
                <ArrowUpDown size={15} />
                导入 / 导出
              </button>
              <button className="button button-primary" onClick={() => openFaqEditor()}>
                <Plus size={16} />
                新增 FAQ
              </button>
            </>
          )}
        </div>
      </section>

      <div className="knowledge-filter-row">
        <button
          className={`filter-pill ${courseFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => {
            setCourseFilter('all')
            setChapterFilter('all')
          }}
        >
          全部课程
          <span>{baseFaqs.length}</span>
        </button>
        {role === 'teacher' && reviewCount > 0 && (
          <button
            className={`filter-pill review-filter-pill ${reviewOnly ? 'is-active' : ''}`}
            onClick={() => setReviewOnly((current) => !current)}
            aria-pressed={reviewOnly}
          >
            待完善
            <span>{reviewCount}</span>
          </button>
        )}
        {courseOptions.map((course) => {
          const count = baseFaqs.filter((faq) => faq.courseId === course.id).length
          return (
            <button
              key={course.id}
              className={`filter-pill ${courseFilter === course.id ? 'is-active' : ''}`}
              onClick={() => {
                setCourseFilter(course.id)
                setChapterFilter('all')
              }}
            >
              <span className={`course-dot accent-${course.accent}`} />
              {course.shortName}
              <span>{count}</span>
            </button>
          )
        })}
        {chapterOptions.length > 1 && (
          <label className="chapter-filter">
            <span>章节</span>
            <select
              value={chapterFilter}
              onChange={(event) => setChapterFilter(event.target.value)}
              aria-label="按章节筛选"
            >
              <option value="all">全部章节</option>
              {chapterOptions.map((chapter) => (
                <option key={chapter} value={chapter}>
                  {chapter}
                </option>
              ))}
              <option value="none">未标章节</option>
            </select>
          </label>
        )}
        <span className="knowledge-result">{visibleFaqs.length} 条结果</span>
      </div>

      {visibleFaqs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BookOpen size={20} />}
            title={reviewOnly ? '没有待完善的答案' : '没有匹配的知识'}
            description={
              reviewOnly
                ? '当前筛选下没有待完善 FAQ；取消「待完善」筛选可以看全部知识。'
                : role === 'teacher'
                  ? '点右上角「新增 FAQ」补一条，或调整课程和关键词筛选。'
                  : '换一个关键词，或让老师补一条新的 FAQ。'
            }
            action={
              reviewOnly ? (
                <button className="text-button" onClick={() => setReviewOnly(false)}>
                  查看全部知识
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="faq-grid">
          {visibleFaqs.map((faq) => {
            const course = courseById(faq.courseId)
            const votes = faq.helpful + faq.unhelpful
            return (
              <button className="faq-card" key={faq.id} onClick={() => openFaq(faq.id)}>
                <div className="faq-card-top">
                  <Badge tone={courseTone(faq.courseId)}>
                    <span className={`course-dot accent-${course.accent}`} />
                    {course.shortName}
                  </Badge>
                  <div className="faq-card-badges">
                    {faq.reviewNeeded && (
                      <Badge tone="medium" dot>
                        待完善
                      </Badge>
                    )}
                    {faq.source === 'sediment' && <Seal className="seal-tiny">已沉淀</Seal>}
                    <span className="faq-card-time">{formatRelative(faq.updatedAt)}</span>
                  </div>
                </div>
                <h3>{faq.question}</h3>
                <p className="faq-card-answer">{excerpt(faq.answer, 112)}</p>
                <div className="tag-row">
                  {faq.tags.slice(0, 3).map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="faq-card-foot">
                  <span className="faq-author">
                    <span className="author-avatar">{faq.author.slice(0, 1)}</span>
                                      </span>
                  <span className="faq-stat">
                    <em>{faq.citations}</em> 次引用
                    <span>·</span>
                    <em>{votes === 0 ? '—' : percent(faq.helpful / votes)}</em> 有帮助
                  </span>
                  <ArrowRight size={15} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="knowledge-footnote">
        <BookOpen size={15} />
        <span>
          当前知识库共 {baseFaqs.length} 条，覆盖 {courseCount} 门课程。新沉淀的答案会自动进入这里。
        </span>
      </div>

      <ImportExportModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        role={role}
        teacherName={teacherName}
        currentCourseId={courseFilter}
        notify={notify}
        onImported={(courseId) => {
          setCourseFilter(courseId)
          setQuery('')
          setSort('recent')
        }}
      />
    </div>
  )
}
