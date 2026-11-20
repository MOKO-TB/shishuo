import { useMemo, useState } from 'react'
import {
  BookOpen,
  CalendarDays,
  Calculator,
  ExternalLink,
  Library,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { Badge } from '../../components/ui'
import { useProfile, scoreStats } from '../../lib/profile'
import { excerpt } from '../../lib/utils'
import {
  libraryLoginComplete,
  libraryLoginStart,
  libraryLoans,
  libraryLogout,
  librarySearch,
  type LibraryBook,
  type LibraryLoansResult,
} from '../../lib/library'
import {
  CAMPUS_BUILDINGS,
  CAMPUS_CALENDAR_EVENTS,
  CAMPUS_LIBRARY_ITEMS,
  CAMPUS_MAP,
  type CampusCalendarEvent,
} from '../../data/campusTools'
import { CAMPUS_BOOKS, type CampusBook } from '../../data/campusBooks'

type ToolTab = 'gpa' | 'calendar' | 'library' | 'map'

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

function LiveBookCard({ book }: { book: LibraryBook }) {
  return (
    <article className="campus-book-card">
      <div className="campus-book-top">
        <Badge tone={book.available > 0 ? 'jade' : 'neutral'}>
          {book.total > 0
            ? `在架 ${book.available}/${book.total}`
            : `馆藏 ${book.total}`}
        </Badge>
        <em>{book.callNo || '索书号待查'}</em>
      </div>
      <strong>{book.title}</strong>
      <span className="campus-book-author">{book.author || '作者待查'}</span>
      <p>
        {book.publisher || '出版社待查'}
        {book.year ? ` · ${book.year}` : ''}
      </p>
      <div className="campus-book-location">
        <MapPin size={12} />
        {book.locations.length > 0 ? book.locations.join('、') : '馆藏地待查'}
      </div>
      {book.statuses.length > 0 && (
        <span className="campus-book-status">{book.statuses.join(' · ')}</span>
      )}
    </article>
  )
}


export function CampusTools() {
  const [tab, setTab] = useState<ToolTab>('gpa')
  const [mapQuery, setMapQuery] = useState('')
  const [bookQuery, setBookQuery] = useState('')
  const [liveQuery, setLiveQuery] = useState('')
  const [liveBooks, setLiveBooks] = useState<LibraryBook[] | null>(null)
  const [liveBusy, setLiveBusy] = useState(false)
  const [liveError, setLiveError] = useState('')
  const [libraryAccount, setLibraryAccount] = useState('')
  const [libraryPassword, setLibraryPassword] = useState('')
  const [captchaCode, setCaptchaCode] = useState('')
  const [captchaImage, setCaptchaImage] = useState('')
  const [libraryLoginId, setLibraryLoginId] = useState('')
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [loans, setLoans] = useState<LibraryLoansResult | null>(null)
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null)
  const profile = useProfile()

  const autoStats = useMemo(
    () => (profile.scores.length > 0 ? scoreStats(profile.scores) : null),
    [profile.scores],
  )

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

  const requestLibraryCaptcha = async () => {
    if (!libraryAccount.trim() || !libraryPassword) {
      setLibraryError('请填写图书馆账号和密码。')
      return
    }
    setLibraryBusy(true)
    setLibraryError('')
    try {
      const result = await libraryLoginStart(libraryAccount.trim(), libraryPassword)
      setLibraryLoginId(result.loginId)
      setCaptchaImage(result.image)
      setCaptchaCode('')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '图书馆登录失败。')
    } finally {
      setLibraryBusy(false)
    }
  }

  const confirmLibraryLogin = async () => {
    if (!libraryLoginId || !captchaCode.trim()) {
      setLibraryError('请输入验证码。')
      return
    }
    setLibraryBusy(true)
    setLibraryError('')
    try {
      await libraryLoginComplete(libraryLoginId, captchaCode.trim())
      setCaptchaImage('')
      setLibraryLoginId('')
      setLibraryPassword('')
      const data = await libraryLoans()
      setLoans(data)
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '图书馆登录失败。')
      setCaptchaImage('')
      setLibraryLoginId('')
    } finally {
      setLibraryBusy(false)
    }
  }

  const reloadLibraryLoans = async () => {
    setLibraryBusy(true)
    setLibraryError('')
    try {
      setLoans(await libraryLoans())
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '借阅记录加载失败。')
    } finally {
      setLibraryBusy(false)
    }
  }

  const logoutLibraryAccount = async () => {
    setLibraryBusy(true)
    try {
      await libraryLogout()
    } catch {
      // 退出失败也清空本地展示，避免继续显示旧借阅。
    } finally {
      setLoans(null)
      setLibraryError('')
      setLibraryBusy(false)
    }
  }

  const runLibrarySearch = async (rawQuery: string) => {
    const query = rawQuery.trim()
    if (!query) {
      setLiveQuery('')
      setLiveBooks(null)
      setLiveError('')
      return
    }
    setLiveQuery(query)
    setLiveBusy(true)
    setLiveError('')
    try {
      const result = await librarySearch(query)
      setLiveBooks(result.items)
    } catch (error) {
      setLiveBooks([])
      setLiveError(error instanceof Error ? error.message : '馆藏检索失败。')
    } finally {
      setLiveBusy(false)
    }
  }

  const selected = CAMPUS_BUILDINGS.find((building) => building.no === selectedBuilding) ?? null

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
          <section className="campus-library-personal">
            <div className="campus-library-personal-head">
              <span className="campus-library-personal-icon">
                <UserRound size={18} />
              </span>
              <span className="campus-library-personal-copy">
                <strong>个人借阅</strong>
                <em>
                  {loans
                    ? `已登录 · 在借 ${loans.total} 本${
                        loans.historyTotal ? ` · 历史 ${loans.historyTotal} 本` : ''
                      }`
                    : '登录图书馆账号后直接查看在借书目和到期时间'}
                </em>
              </span>
              <a
                href="https://mfindgzyykj.libsp.cn/#/personalCenter"
                target="_blank"
                rel="noreferrer"
              >
                新窗口
                <ExternalLink size={12} />
              </a>
            </div>

            {loans ? (
              <div className="library-loan-panel">
                <div className="library-loan-toolbar">
                  <strong>我的借阅</strong>
                  <span>
                    在借 {loans.total} 本
                    {loans.historyTotal ? ` · 历史 ${loans.historyTotal} 本` : ''}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void reloadLibraryLoans()}
                    disabled={libraryBusy}
                  >
                    <RefreshCw size={12} />
                    刷新
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void logoutLibraryAccount()}
                    disabled={libraryBusy}
                  >
                    退出图书馆
                  </button>
                </div>
                {loans.items.length > 0 ? (
                  <div className="library-loan-list">
                    {loans.items.map((loan, index) => (
                      <div className="library-loan-row" key={`${loan.title}-${index}`}>
                        <span>
                          <strong>{loan.title}</strong>
                          {loan.author && <em>{loan.author}</em>}
                        </span>
                        <span className="library-loan-due">
                          {loan.status && <small>{loan.status}</small>}
                          {loan.due && <b>应还 {loan.due}</b>}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : loans.raw ? (
                  <pre className="library-loan-raw">{loans.raw}</pre>
                ) : (
                  <p className="campus-tool-empty">当前没有在借书目。</p>
                )}
              </div>
            ) : captchaImage ? (
              <div className="library-login-captcha">
                <p>输入验证码完成登录</p>
                <div className="library-captcha-row">
                  <img src={captchaImage} alt="图书馆登录验证码" />
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void requestLibraryCaptcha()}
                    disabled={libraryBusy}
                  >
                    换一张
                  </button>
                </div>
                <div className="library-login-row">
                  <input
                    className="input"
                    value={captchaCode}
                    onChange={(event) => setCaptchaCode(event.target.value)}
                    placeholder="验证码"
                    aria-label="图书馆登录验证码"
                  />
                  <button
                    className="button button-primary"
                    onClick={() => void confirmLibraryLogin()}
                    disabled={libraryBusy || !captchaCode.trim()}
                  >
                    {libraryBusy ? <Loader2 size={14} className="spin-icon" /> : <LogIn size={14} />}
                    确认登录
                  </button>
                  <button
                    className="button button-ghost"
                    onClick={() => {
                      setCaptchaImage('')
                      setLibraryLoginId('')
                      setCaptchaCode('')
                    }}
                    disabled={libraryBusy}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="library-login-form">
                <div className="library-login-row">
                  <input
                    className="input"
                    value={libraryAccount}
                    onChange={(event) => setLibraryAccount(event.target.value)}
                    placeholder="图书馆账号 / 学号"
                    autoComplete="username"
                    aria-label="图书馆账号"
                  />
                  <input
                    className="input"
                    type="password"
                    value={libraryPassword}
                    onChange={(event) => setLibraryPassword(event.target.value)}
                    placeholder="图书馆密码"
                    autoComplete="current-password"
                    aria-label="图书馆密码"
                  />
                  <button
                    className="button button-primary"
                    onClick={() => void requestLibraryCaptcha()}
                    disabled={libraryBusy}
                  >
                    {libraryBusy ? <Loader2 size={14} className="spin-icon" /> : <LogIn size={14} />}
                    登录图书馆
                  </button>
                </div>
              </div>
            )}

            {libraryError && <p className="library-login-error">{libraryError}</p>}
            <p className="campus-library-personal-note">
              账号密码只提交给学校图书馆 OPAC 换取登录态；师说不保存密码，借阅信息仅用于本页展示。
            </p>
          </section>

          <div className="campus-library-search">
            <Search size={16} />
            <input
              value={bookQuery}
              onChange={(event) => {
                setBookQuery(event.target.value)
                setLiveQuery('')
                setLiveBooks(null)
                setLiveError('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runLibrarySearch(bookQuery)
              }}
              placeholder="搜书名、作者、索书号或关键词…"
              aria-label="搜索图书馆藏书"
            />
            {bookQuery && (
              <button
                type="button"
                className="campus-library-clear"
                onClick={() => {
                  setBookQuery('')
                  setLiveQuery('')
                  setLiveBooks(null)
                  setLiveError('')
                }}
                aria-label="清空书目搜索"
              >
                <X size={14} />
              </button>
            )}
            <button
              type="button"
              className="button button-primary campus-library-search-btn"
              onClick={() => void runLibrarySearch(bookQuery)}
              disabled={!bookQuery.trim() || liveBusy}
            >
              {liveBusy ? <Loader2 size={14} className="spin-icon" /> : <Search size={14} />}
              检索馆藏
            </button>
          </div>

          {!bookQuery && liveBooks === null && (
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

          {liveQuery ? (
            <section className="campus-book-section">
              <div className="campus-book-head">
                <BookOpen size={15} />
                <strong>“{liveQuery}”的馆藏检索</strong>
                <span>{liveBusy ? '检索中…' : `${liveBooks?.length ?? 0} 条`}</span>
              </div>
              {liveError ? (
                <p className="campus-tool-empty">{liveError}</p>
              ) : liveBusy ? (
                <p className="campus-tool-empty">正在查询图书馆 OPAC…</p>
              ) : (liveBooks?.length ?? 0) === 0 ? (
                <p className="campus-tool-empty">
                  OPAC 里没有查到匹配的书目，换个书名或作者试试。
                </p>
              ) : (
                <div className="campus-book-grid">
                  {liveBooks?.map((book) => (
                    <LiveBookCard key={book.recordId} book={book} />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="campus-book-section">
              <div className="campus-book-head">
                <BookOpen size={15} />
                <strong>{bookQuery.trim() ? '书目速览' : '全部书目'}</strong>
                <span>
                  {bookQuery.trim() && bookResults.length === 0
                    ? '待检索'
                    : `${bookResults.length} 本`}
                </span>
              </div>
              {bookResults.length === 0 ? (
                <p className="campus-tool-empty">
                  本地书目里没有直接命中。点右侧「检索馆藏」到学校 OPAC 查全馆，能看到是否在馆、索书号和馆藏地。
                </p>
              ) : (
                <div className="campus-book-grid">
                  {bookResults.map((book) => (
                    <BookCard key={book.id} book={book} />
                  ))}
                </div>
              )}
            </section>
          )}

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
              <div
                className="campus-map-canvas"
                data-zoomed={selected ? 'true' : undefined}
                style={
                  selected
                    ? {
                        transformOrigin: `${
                          (((selected.bbox[0] + selected.bbox[2]) / 2) / CAMPUS_MAP.width) * 100
                        }% ${
                          (((selected.bbox[1] + selected.bbox[3]) / 2) / CAMPUS_MAP.height) * 100
                        }%`,
                      }
                    : undefined
                }
              >
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
              {selected && (
                <button
                  type="button"
                  className="campus-map-reset"
                  onClick={() => setSelectedBuilding(null)}
                >
                  还原全图
                </button>
              )}
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
