import { useMemo, useState } from 'react'
import {
  BookOpen,
  CalendarDays,
  Calculator,
  ExternalLink,
  Library,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '../../components/ui'
import { useProfile, scoreStats, type ScoreRow } from '../../lib/profile'
import { excerpt, makeId } from '../../lib/utils'
import {
  CAMPUS_BOOKS,
  CAMPUS_BUILDINGS,
  CAMPUS_CALENDAR_EVENTS,
  CAMPUS_LIBRARY_ITEMS,
  CAMPUS_MAP,
  type CampusBook,
  type CampusCalendarEvent,
} from '../../data/campusTools'

type ToolTab = 'gpa' | 'calendar' | 'library' | 'map'

interface ManualRow {
  id: string
  course: string
  credit: string
  score: string
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map((part) => Number(part))
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function dateLabel(date: Date) {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

function daysBetween(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((end - start) / 86_400_000)
}

function nextOccurrence(event: CampusCalendarEvent, today: Date) {
  const start = parseDate(event.start)
  if (!start) return null
  if (event.repeat === 'yearly') {
    const candidate = new Date(today.getFullYear(), start.getMonth(), start.getDate())
    if (candidate.getTime() < today.getTime()) {
      candidate.setFullYear(today.getFullYear() + 1)
    }
    return candidate
  }
  return start
}

function eventKindLabel(kind: string) {
  if (kind === 'holiday') return '放假'
  if (kind === 'exam') return '考试'
  if (kind === 'term') return '学期'
  if (kind === 'deadline') return '截止'
  return '活动'
}

function eventKindTone(kind: string) {
  if (kind === 'holiday') return 'jade' as const
  if (kind === 'exam') return 'medium' as const
  if (kind === 'deadline') return 'danger' as const
  return 'gold' as const
}

function BookCard({ book, recommended }: { book: CampusBook; recommended?: boolean }) {
  return (
    <article className="campus-book-card">
      <div className="campus-book-top">
        <Badge tone={book.available > 0 ? 'jade' : 'neutral'}>
          {book.available > 0 ? `在架 ${book.available}/${book.total}` : '已借完'}
        </Badge>
        {recommended && (
          <span className="campus-book-ai">
            <Sparkles size={11} />
            AI 推荐
          </span>
        )}
        <em>{book.callNo}</em>
      </div>
      <strong>{book.title}</strong>
      <span className="campus-book-author">{book.author}</span>
      <p>{book.summary}</p>
      <div className="campus-book-location">
        <MapPin size={12} />
        {book.location}
      </div>
      <a href="https://mfindgzyykj.libsp.cn/" target="_blank" rel="noreferrer">
        在 OPAC 查馆藏
        <ExternalLink size={12} />
      </a>
    </article>
  )
}

export function CampusTools() {
  const [tab, setTab] = useState<ToolTab>('gpa')
  const [manualRows, setManualRows] = useState<ManualRow[]>([
    { id: makeId('gpa'), course: '', credit: '3', score: '' },
  ])
  const [mapQuery, setMapQuery] = useState('')
  const [bookQuery, setBookQuery] = useState('')
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null)
  const profile = useProfile()

  const manualScores: ScoreRow[] = useMemo(
    () =>
      manualRows.map((row, index) => ({
        id: `manual-${index}`,
        course: row.course.trim() || `课程 ${index + 1}`,
        score: row.score.trim(),
        credit: Number(row.credit) > 0 ? Number(row.credit) : null,
        semester: '手动试算',
        kind: '必修',
      })),
    [manualRows],
  )
  const autoStats = useMemo(
    () => (profile.scores.length > 0 ? scoreStats(profile.scores) : null),
    [profile.scores],
  )
  const manualStats = useMemo(() => scoreStats(manualScores), [manualScores])

  const myCourseIds = useMemo(() => {
    const ids = new Set<string>()
    if (profile.defaultCourseId) ids.add(profile.defaultCourseId)
    for (const entry of profile.schedule) {
      if (entry.matchedCourseId) ids.add(entry.matchedCourseId)
    }
    return ids
  }, [profile.defaultCourseId, profile.schedule])

  const recommendedBooks = useMemo(() => {
    const matched = CAMPUS_BOOKS.filter((book) =>
      book.courseIds.some((courseId) => myCourseIds.has(courseId)),
    )
    return (matched.length > 0 ? matched : CAMPUS_BOOKS).slice(0, 3)
  }, [myCourseIds])

  const bookResults = useMemo(() => {
    const keyword = bookQuery.trim().toLowerCase()
    if (!keyword) return CAMPUS_BOOKS.slice(0, 8)
    return CAMPUS_BOOKS.filter((book) =>
      [book.title, book.author, book.callNo, book.location, ...book.tags]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  }, [bookQuery])

  const today = useMemo(() => {
    const value = new Date()
    value.setHours(0, 0, 0, 0)
    return value
  }, [])

  const upcomingEvents = useMemo(() => {
    return CAMPUS_CALENDAR_EVENTS.map((event) => {
      const start = nextOccurrence(event, today)
      if (!start) return null
      const end = event.end ? parseDate(event.end) : null
      const sortDate = start.getTime()
      return {
        event,
        start,
        end,
        days: daysBetween(today, start),
        sortDate,
      }
    })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => item.days >= 0)
      .sort((a, b) => a.sortDate - b.sortDate)
      .slice(0, 8)
  }, [today])

  const filteredBuildings = useMemo(() => {
    const normalized = mapQuery.trim().toLowerCase()
    if (!normalized) return CAMPUS_BUILDINGS
    return CAMPUS_BUILDINGS.filter((building) =>
      [building.name, building.category, building.area, ...building.aliases]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    )
  }, [mapQuery])

  const selected = CAMPUS_BUILDINGS.find((building) => building.no === selectedBuilding) ?? null

  const updateRow = (id: string, patch: Partial<ManualRow>) => {
    setManualRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  return (
    <section className="campus-tools card">
      <div className="campus-tools-head">
        <div>
          <strong>校园工具</strong>
          <span>GPA 试算、校历、图书馆和校园地图；数据有来源，日期以学校通知为准。</span>
        </div>
        <Badge tone="gold">引路学长</Badge>
      </div>

      <div className="campus-tool-tabs" role="tablist" aria-label="校园工具">
        <button
          role="tab"
          aria-selected={tab === 'gpa'}
          className={tab === 'gpa' ? 'is-active' : ''}
          onClick={() => setTab('gpa')}
        >
          <Calculator size={15} />
          GPA 计算
        </button>
        <button
          role="tab"
          aria-selected={tab === 'calendar'}
          className={tab === 'calendar' ? 'is-active' : ''}
          onClick={() => setTab('calendar')}
        >
          <CalendarDays size={15} />
          校历
        </button>
        <button
          role="tab"
          aria-selected={tab === 'library'}
          className={tab === 'library' ? 'is-active' : ''}
          onClick={() => setTab('library')}
        >
          <Library size={15} />
          图书馆
        </button>
        <button
          role="tab"
          aria-selected={tab === 'map'}
          className={tab === 'map' ? 'is-active' : ''}
          onClick={() => setTab('map')}
        >
          <MapPin size={15} />
          校园地图
        </button>
      </div>

      {tab === 'gpa' && (
        <div className="campus-tool-panel">
          <div className="campus-gpa-summary">
            <div>
              <span>教务成绩</span>
              <strong>{autoStats ? `${autoStats.counted} 门` : '未同步'}</strong>
              <em>{autoStats ? `${autoStats.credits} 学分` : '在「账号与课表 → 成绩」同步'}</em>
            </div>
            <div>
              <span>加权平均</span>
              <strong>{autoStats?.weightedAverage != null ? autoStats.weightedAverage.toFixed(2) : '—'}</strong>
              <em>按学分加权</em>
            </div>
            <div>
              <span>GPA（5.0）</span>
              <strong>{autoStats?.gpaFive != null ? autoStats.gpaFive.toFixed(2) : '—'}</strong>
              <em>本校按 5.0 制计算</em>
            </div>
          </div>

          <div className="campus-gpa-head">
            <div>
              <strong>手动试算</strong>
              <span>没同步教务成绩时，按学分和百分制成绩估算；只在本机计算，不上传。</span>
            </div>
            <button
              className="button button-ghost"
              onClick={() =>
                setManualRows((rows) => [
                  ...rows,
                  { id: makeId('gpa'), course: '', credit: '3', score: '' },
                ])
              }
            >
              <Plus size={14} />
              加一门课
            </button>
          </div>

          <div className="campus-gpa-table">
            <div className="campus-gpa-row is-head">
              <span>课程</span>
              <span>学分</span>
              <span>百分制成绩</span>
              <span />
            </div>
            {manualRows.map((row) => (
              <div className="campus-gpa-row" key={row.id}>
                <input
                  value={row.course}
                  onChange={(event) => updateRow(row.id, { course: event.target.value })}
                  placeholder="例如：高等数学"
                  aria-label="课程名"
                />
                <input
                  value={row.credit}
                  onChange={(event) => updateRow(row.id, { credit: event.target.value })}
                  inputMode="decimal"
                  placeholder="学分"
                  aria-label="学分"
                />
                <input
                  value={row.score}
                  onChange={(event) => updateRow(row.id, { score: event.target.value })}
                  inputMode="decimal"
                  placeholder="成绩"
                  aria-label="成绩"
                />
                <button
                  className="icon-button"
                  aria-label="删除这门课"
                  onClick={() =>
                    setManualRows((rows) =>
                      rows.length > 1 ? rows.filter((item) => item.id !== row.id) : rows,
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="campus-gpa-result">
            <span>
              试算结果：加权平均 <strong>{manualStats.weightedAverage?.toFixed(2) ?? '—'}</strong>
            </span>
            <span>
              GPA 5.0 <strong>{manualStats.gpaFive?.toFixed(2) ?? '—'}</strong>
            </span>
            <em>
              已计入 {manualStats.counted} 门、{manualStats.credits} 学分；空成绩或 0 学分不计。
            </em>
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="campus-tool-panel">
          <div className="campus-calendar-list">
            {upcomingEvents.length === 0 ? (
              <p className="campus-tool-empty">近期没有已录入的校历事件，请以教务处通知为准。</p>
            ) : (
              upcomingEvents.map(({ event, start, end, days }) => (
                <article className="campus-calendar-row" key={event.id}>
                  <div className="campus-calendar-date">
                    <strong>{dateLabel(start)}</strong>
                    <span>{days === 0 ? '今天' : `${days} 天后`}</span>
                  </div>
                  <div className="campus-calendar-main">
                    <div className="campus-calendar-top">
                      <Badge tone={eventKindTone(event.kind)}>{eventKindLabel(event.kind)}</Badge>
                      {end && <em>{dateLabel(end)} 结束</em>}
                    </div>
                    <strong>{event.name}</strong>
                    {event.note && <p>{excerpt(event.note, 130)}</p>}
                  </div>
                </article>
              ))
            )}
          </div>
          <p className="campus-tool-note">
            校历来自学校官方/公开来源；「每年例行」条目是按往年日期投影，具体以当学期教务处通知为准。
          </p>
        </div>
      )}

      {tab === 'library' && (
        <div className="campus-tool-panel">
          <div className="campus-library-search">
            <Search size={16} />
            <input
              value={bookQuery}
              onChange={(event) => setBookQuery(event.target.value)}
              placeholder="搜书名、作者、索书号或关键词…"
              aria-label="搜索图书馆藏书"
            />
            {bookQuery && (
              <button
                type="button"
                className="campus-library-clear"
                onClick={() => setBookQuery('')}
                aria-label="清空书目搜索"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {!bookQuery && (
            <section className="campus-book-section">
              <div className="campus-book-head">
                <Sparkles size={15} />
                <strong>AI 推荐</strong>
                <span>根据你这学期的课程和常见入门需求</span>
              </div>
              <div className="campus-book-grid">
                {recommendedBooks.map((book) => (
                  <BookCard key={book.id} book={book} recommended />
                ))}
              </div>
            </section>
          )}

          <section className="campus-book-section">
            <div className="campus-book-head">
              <BookOpen size={15} />
              <strong>{bookQuery ? `“${bookQuery}”的检索结果` : '全部书目'}</strong>
              <span>{bookResults.length} 本</span>
            </div>
            {bookResults.length === 0 ? (
              <p className="campus-tool-empty">
                没有匹配的书目，换个书名或作者试试；也可以直接到 OPAC 检索全馆。
              </p>
            ) : (
              <div className="campus-book-grid">
                {bookResults.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            )}
          </section>

          <details className="campus-library-more">
            <summary>馆藏规模、分类与找书方法</summary>
            <div className="campus-library-grid">
              {CAMPUS_LIBRARY_ITEMS.map((item) => (
                <article className="campus-library-card" key={item.id}>
                  <div className="campus-library-top">
                    <Badge tone="jade">馆藏</Badge>
                    {item.publishAt && <span>{item.publishAt}</span>}
                  </div>
                  <strong>{item.title}</strong>
                  <p>{excerpt(item.content, 180)}</p>
                  <div className="tag-row">
                    {item.tags.slice(0, 4).map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="campus-library-foot">
                    <span>{item.source}</span>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer">
                        打开 OPAC
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <p className="campus-tool-note">
              书目与在架数量是馆藏检索演示数据，真实借阅状态以 OPAC 为准；索书号首字母对应中图法大类。
            </p>
          </details>
        </div>
      )}

      {tab === 'map' && (
        <div className="campus-tool-panel">
          <div className="campus-map-search">
            <Search size={15} />
            <input
              value={mapQuery}
              onChange={(event) => setMapQuery(event.target.value)}
              placeholder="搜建筑名或别名，例如：图书馆、S2、A栋…"
              aria-label="搜索校园建筑"
            />
            <span>{filteredBuildings.length} 个地点</span>
          </div>
          <div className="campus-map-layout">
            <div className="campus-map-stage">
              <img src={CAMPUS_MAP.image} alt="广州应用科技学院肇庆校区手绘地图" loading="lazy" />
              {CAMPUS_BUILDINGS.map((building) => {
                if (building.bbox.length !== 4) return null
                const [x1, y1, x2, y2] = building.bbox
                const active = building.no === selectedBuilding
                return (
                  <button
                    key={building.no}
                    type="button"
                    className={`campus-map-box ${active ? 'is-active' : ''}`}
                    style={{
                      left: `${(x1 / CAMPUS_MAP.width) * 100}%`,
                      top: `${(y1 / CAMPUS_MAP.height) * 100}%`,
                      width: `${((x2 - x1) / CAMPUS_MAP.width) * 100}%`,
                      height: `${((y2 - y1) / CAMPUS_MAP.height) * 100}%`,
                    }}
                    aria-label={building.name}
                    title={building.name}
                    onClick={() => setSelectedBuilding(building.no)}
                  />
                )
              })}
            </div>
            <div className="campus-map-side">
              <div className="campus-map-info">
                {selected ? (
                  <>
                    <span className="eyebrow">{selected.category}</span>
                    <h3>{selected.name}</h3>
                    <p>{selected.area}</p>
                    {selected.nearby.length > 0 && (
                      <span className="campus-map-nearby">附近：{selected.nearby.join('、')}</span>
                    )}
                  </>
                ) : (
                  <>
                    <h3>点地图上的框，或从列表选一个地点</h3>
                    <p>这是手绘位置图，没有路网导航；到校后结合现场指示。</p>
                  </>
                )}
              </div>
              <div className="campus-building-list">
                {filteredBuildings.map((building) => (
                  <button
                    key={building.no}
                    className={building.no === selectedBuilding ? 'is-active' : ''}
                    onClick={() => setSelectedBuilding(building.no)}
                  >
                    <span>{building.no.toString().padStart(2, '0')}</span>
                    <strong>{building.name}</strong>
                    <em>{building.category}</em>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
