import { useMemo } from 'react'
import {
  ArrowRight,
  BookOpen,
  CircleAlert,
  Clock3,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useStore } from '../store'
import { allCourses, courseById, dateKey, isSeededCourse } from '../data/seed'
import { isPilotCourse } from '../data/pilot'
import { computeGaps, groupPendingThreads } from '../lib/engine'
import {
  averageFirstResponseMinutes,
  durationLabel,
  percent,
  truncate,
} from '../lib/utils'
import { Donut, MiniBars, StackedBars } from '../components/charts'
import { Badge, EmptyState } from '../components/ui'

interface InsightsViewProps {
  openFaq: (faqId: string) => void
  onGoTeacher: () => void
}

export function InsightsView({ openFaq, onGoTeacher }: InsightsViewProps) {
  const { data } = useStore()
  const weekly = data.daily.slice(-7)
  const ai7 = weekly.reduce((sum, entry) => sum + entry.ai, 0)
  const human7 = weekly.reduce((sum, entry) => sum + entry.human, 0)
  const rate7 = ai7 + human7 > 0 ? ai7 / (ai7 + human7) : 0
  const savedHours = (ai7 * 4) / 60
  const scopedCourseIds = useMemo(
    () =>
      new Set(
        allCourses()
          .filter((course) => isPilotCourse(course.id) || !isSeededCourse(course.id))
          .map((course) => course.id),
      ),
    [],
  )
  const threads = useMemo(
    () => data.threads.filter((thread) => scopedCourseIds.has(thread.courseId)),
    [data.threads, scopedCourseIds],
  )
  const faqs = useMemo(
    () => data.faqs.filter((faq) => scopedCourseIds.has(faq.courseId)),
    [data.faqs, scopedCourseIds],
  )
  const pendingGroups = groupPendingThreads(threads)
  const gaps = computeGaps(threads, faqs)
  const gapWaiting = gaps.reduce((sum, gap) => sum + gap.count, 0)
  const today = data.daily.find((entry) => entry.date === dateKey(Date.now()))
  const topFaqs = useMemo(
    () => [...faqs].sort((a, b) => b.citations - a.citations).slice(0, 5),
    [faqs],
  )
  const maxCitations = topFaqs[0]?.citations ?? 1
  const confidenceCounts = useMemo(() => {
    const high = threads.filter((thread) => thread.confidence === 'high').length
    const medium = threads.filter((thread) => thread.confidence === 'medium').length
    const low = threads.filter((thread) => thread.confidence === 'low').length
    return { high, medium, low, total: high + medium + low }
  }, [threads])
  const feedbacks = threads.filter((thread) => thread.feedback)
  const helpfulFeedbacks = feedbacks.filter((thread) => thread.feedback === 'helpful').length
  const helpfulRate = feedbacks.length > 0 ? helpfulFeedbacks / feedbacks.length : 0
  const resolvedCount = threads.filter((thread) => thread.resolvedAt).length
  const firstResponse = durationLabel(averageFirstResponseMinutes(threads))
  const courseRows = allCourses()
    .filter((course) => scopedCourseIds.has(course.id))
    .map((course) => {
      const courseFaqs = faqs.filter((faq) => faq.courseId === course.id)
      const citations = courseFaqs.reduce((sum, faq) => sum + faq.citations, 0)
      const helpful = courseFaqs.reduce((sum, faq) => sum + faq.helpful, 0)
      const votes = courseFaqs.reduce((sum, faq) => sum + faq.helpful + faq.unhelpful, 0)
      const review = courseFaqs.filter((faq) => faq.reviewNeeded).length
      return {
        ...course,
        faqCount: courseFaqs.length,
        citations,
        helpfulRate: votes > 0 ? helpful / votes : 0,
        review,
      }
    })
  const chapterRows = useMemo(() => {
    const faqById = new Map(faqs.map((faq) => [faq.id, faq]))
    const rows = new Map<
      string,
      { courseId: string; chapter: string; questions: number; stuck: number; review: number }
    >()
    const rowFor = (courseId: string, chapter: string) => {
      const key = `${courseId}::${chapter}`
      let row = rows.get(key)
      if (!row) {
        row = { courseId, chapter, questions: 0, stuck: 0, review: 0 }
        rows.set(key, row)
      }
      return row
    }
    for (const faq of faqs) {
      if (faq.reviewNeeded) rowFor(faq.courseId, faq.chapter ?? '未分章节').review += 1
    }
    for (const thread of threads) {
      const source = thread.sources?.[0] ? faqById.get(thread.sources[0]) : undefined
      const row = rowFor(thread.courseId, source?.chapter ?? '未归类章节')
      row.questions += 1
      const stuck =
        thread.confidence === 'low' ||
        Boolean(thread.escalation) ||
        thread.feedback === 'unhelpful' ||
        thread.status === 'needs-info' ||
        (thread.status === 'pending' && !thread.withdrawnAt)
      if (stuck) row.stuck += 1
    }
    return Array.from(rows.values())
      .filter((row) => row.questions > 0 || row.review > 0)
      .sort((a, b) => b.questions - a.questions || b.stuck - a.stuck)
      .slice(0, 8)
  }, [threads, faqs])
  const maxChapterQuestions = chapterRows[0]?.questions ?? 1
  return (
    <div className="page insights-page">
      <header className="insights-head">
        <div className="insights-head-main">
          <div className="eyebrow">
            <span className="eyebrow-mark jade" />
            答疑洞察
            <span className="eyebrow-sep">/</span>
            近 7 天 · 全域试点
          </div>
          <h1 className="display-title">
            每一个被接住的问题
            <br />
            <span>都在把老师的时间还回去</span>
          </h1>
        </div>

        <aside className="insights-head-card">
          <div className="insights-head-card-top">
            <span>本周 AI 独立解决率</span>
            <Badge tone="jade" dot>
              自动统计
            </Badge>
          </div>
          <div className="insights-head-main-row">
            <Donut value={rate7} label="AI 解决" size={104} stroke={10} />
            <div>
              <strong>
                {ai7}
                <em> / {ai7 + human7}</em>
              </strong>
              <span>个问题没有占用老师时间</span>
            </div>
          </div>
          <div className="insights-head-foot">
            <TrendingUp size={14} />
            今天已有 {today?.ai ?? 0} 个问题被 AI 接住
          </div>
        </aside>
      </header>

      <section className="metric-grid">
        <div className="metric-card">
          <span className="metric-icon jade">
            <Sparkles size={18} />
          </span>
          <div>
            <span className="metric-label">近 7 天 AI 自动解决</span>
            <strong>
              {ai7}
              <em>个</em>
            </strong>
            <p>
              其中 {data.duplicatesMerged} 个重复问题被合并 · {resolvedCount} 个被学生确认已解决
            </p>
          </div>
        </div>
        <div className="metric-card">
          <span className="metric-icon blue">
            <Clock3 size={18} />
          </span>
          <div>
            <span className="metric-label">老师平均首响</span>
            <strong>
              {firstResponse.value}
              <em>{firstResponse.unit}</em>
            </strong>
            <p>从转交老师到发出回复的真实间隔</p>
          </div>
        </div>
        <div className="metric-card">
          <span className="metric-icon gold">
            <Timer size={18} />
          </span>
          <div>
            <span className="metric-label">估算节省老师时间</span>
            <strong>
              {savedHours.toFixed(1)}
              <em>小时/周</em>
            </strong>
            <p>按每问 4 分钟人工回复估算</p>
          </div>
        </div>
        <div className="metric-card">
          <span className="metric-icon clay">
            <Users size={18} />
          </span>
          <div>
            <span className="metric-label">当前待办组</span>
            <strong>
              {pendingGroups.length}
              <em>组</em>
            </strong>
            <p>
              共 {pendingGroups.reduce((sum, group) => sum + group.count, 0)} 个问题等待老师
            </p>
          </div>
        </div>
      </section>

      <section className="chart-card">
        <div className="chart-card-head">
          <div>
            <div className="eyebrow">每日去向</div>
            <h2>AI 接住的和转给老师的</h2>
          </div>
          <div className="chart-insight">
            平均每天 <strong>{Math.round((ai7 + human7) / 7)}</strong> 个问题
            <span>AI 先处理 {percent(rate7)}</span>
          </div>
        </div>
        <StackedBars data={weekly} />
      </section>

      <div className="insights-grid">
        <section className="insights-card top-questions">
          <div className="insights-card-head">
            <div>
              <div className="eyebrow">学生真实卡点</div>
              <h2>被问得最多的问题</h2>
            </div>
            <BookOpen size={18} className="rail-head-icon" />
          </div>
          <div className="rank-list">
            {topFaqs.map((faq, index) => {
              const course = courseById(faq.courseId)
              return (
                <button className="rank-row" key={faq.id} onClick={() => openFaq(faq.id)}>
                  <span className="rank-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="rank-main">
                    <span className="rank-question">{truncate(faq.question, 26)}</span>
                    <span className="rank-bar">
                      <span
                        className={`rank-bar-fill accent-${course.accent}`}
                        style={{ width: `${Math.max(8, (faq.citations / maxCitations) * 100)}%` }}
                      />
                    </span>
                  </span>
                  <span className="rank-meta">
                    <em>{faq.citations}</em>
                    <span>{course.shortName}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="insights-card gap-insights">
          <div className="insights-card-head">
            <div>
              <div className="eyebrow">下一步该补什么</div>
              <h2>知识缺口</h2>
            </div>
            <span className="rail-count">{gaps.length}</span>
          </div>
          {gaps.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={19} />}
              title="暂时没有缺口"
              description="低置信问题和负反馈都被处理完了。"
            />
          ) : (
            <>
              <div className="insight-gap-list">
                {gaps.map((gap) => (
                  <button className="insight-gap-row" key={gap.id} onClick={onGoTeacher}>
                    <span className={`gap-icon ${gap.reason}`}>
                      <CircleAlert size={15} />
                    </span>
                    <span>
                      <strong>{gap.topic}</strong>
                      <em>
                        {gap.reason === 'low'
                          ? `AI 没有可靠依据 · ${gap.count} 人同问`
                          : gap.count > 0
                            ? `答案反馈不够清楚 · ${gap.count} 人同问`
                            : '答案反馈不够清楚 · 等待完善'}
                      </em>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
              <div className="gap-impact">
                <Sparkles size={14} />
                处理完这 {gaps.length} 个缺口，AI 约可多接住 {gapWaiting} 个同类问题。
              </div>
            </>
          )}
          <button className="rail-link" onClick={onGoTeacher}>
            去待办台处理
            <ArrowRight size={14} />
          </button>
        </section>
      </div>

      <div className="insights-grid insights-grid-lower">
        <section className="insights-card quality-card">
          <div className="insights-card-head">
            <div>
              <div className="eyebrow">AI 回答质量</div>
              <h2>它知道自己什么时候不会</h2>
            </div>
            <Sparkles size={18} className="rail-head-icon" />
          </div>
          <div className="quality-bars">
            <div className="quality-row">
              <span>高置信 · 可直接参考</span>
              <div className="quality-track">
                <span
                  className="quality-fill high"
                  style={{ width: `${percent(confidenceCounts.high / Math.max(1, confidenceCounts.total))}` }}
                />
              </div>
              <strong>{confidenceCounts.high}</strong>
            </div>
            <div className="quality-row">
              <span>中置信 · 建议确认</span>
              <div className="quality-track">
                <span
                  className="quality-fill medium"
                  style={{ width: `${percent(confidenceCounts.medium / Math.max(1, confidenceCounts.total))}` }}
                />
              </div>
              <strong>{confidenceCounts.medium}</strong>
            </div>
            <div className="quality-row">
              <span>低置信 · 拒答转人工</span>
              <div className="quality-track">
                <span
                  className="quality-fill low"
                  style={{ width: `${percent(confidenceCounts.low / Math.max(1, confidenceCounts.total))}` }}
                />
              </div>
              <strong>{confidenceCounts.low}</strong>
            </div>
          </div>
          <div className="quality-summary">
            <div>
              <strong>{percent(helpfulRate)}</strong>
              <span>已反馈回答里觉得有帮助</span>
            </div>
            <div>
              <strong>{confidenceCounts.low}</strong>
              <span>次明确拒答，不编答案</span>
            </div>
          </div>
        </section>

        <section className="insights-card course-card">
          <div className="insights-card-head">
            <div>
              <div className="eyebrow">课程覆盖</div>
              <h2>知识库长在每门课里</h2>
            </div>
            <Users size={18} className="rail-head-icon" />
          </div>
          <div className="course-table">
            <div className="course-table-head">
              <span>课程</span>
              <span>学生</span>
              <span>FAQ</span>
              <span>引用</span>
              <span>有帮助</span>
            </div>
            {courseRows.map((row) => (
              <div className="course-table-row" key={row.id}>
                <span className="course-cell">
                  <span className={`course-dot accent-${row.accent}`} />
                  <span>
                    <strong>{row.shortName}</strong>
                    <em>{row.code}</em>
                  </span>
                </span>
                <span>{row.students}</span>
                <span>{row.faqCount}</span>
                <span>{row.citations}</span>
                <span>
                  {percent(row.helpfulRate)}
                  {row.review > 0 && <i className="review-dot" title={`${row.review} 条待完善`} />}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="chart-card chapter-heat">
        <div className="chart-card-head">
          <div>
            <div className="eyebrow">章节卡点热力</div>
            <h2>这门课哪里最难</h2>
          </div>
          <div className="chart-insight">
            提问最集中在 <strong>{chapterRows[0]?.chapter ?? '—'}</strong>
            <span>按提问引用的知识章节归类</span>
          </div>
        </div>
        {chapterRows.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={19} />}
            title="还没有章节数据"
            description="学生提问并被知识库命中后，这里会按章节点亮。"
          />
        ) : (
          <div className="chapter-heat-list">
            {chapterRows.map((row) => {
              const rowCourse = courseById(row.courseId)
              return (
                <div className="chapter-heat-row" key={`${row.courseId}::${row.chapter}`}>
                  <span className="chapter-heat-label">
                    <strong>{rowCourse.shortName}</strong>
                    <span>{row.chapter}</span>
                  </span>
                  <span className="chapter-heat-track">
                    <span
                      className={`chapter-heat-fill accent-${rowCourse.accent}`}
                      style={{
                        width: `${Math.max(6, (row.questions / maxChapterQuestions) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="chapter-heat-meta">
                    <em>{row.questions}</em>
                    <span>次提问</span>
                    {row.stuck > 0 && <i>卡住 {row.stuck}</i>}
                    {row.review > 0 && <i className="is-review">{row.review} 条待完善</i>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="insights-footnote">
        <p>演示数据，仅用于验证产品逻辑；AI 首响与时间节省为估算值。</p>
      </div>
    </div>
  )
}
