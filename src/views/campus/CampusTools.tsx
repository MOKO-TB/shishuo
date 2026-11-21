import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  CalendarDays,
  Calculator,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Library,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { Badge, Modal } from '../../components/ui'
import { FandianView } from '../FandianView'
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
import { resolveCalendarDetail } from '../../data/campusCalendarDetails'
import { CAMPUS_BOOKS, type CampusBook } from '../../data/campusBooks'

type ToolTab = 'gpa' | 'calendar' | 'library' | 'map' | 'canteen' | 'kb' | 'ask'

type MonthCell = {
  date: Date
  key: string
  inMonth: boolean
  isToday: boolean
  /** 格子里展示的标签：长学期/长假期只在首尾两天出现 */
  events: CampusCalendarEvent[]
  /** 覆盖当天的全部事件：点开当天详情时用，包含长假期的中间日期 */
  allEvents: CampusCalendarEvent[]
  /** 所在学期周次（不在学期内为 null） */
  week: number | null
  /** 当天是否被长假期覆盖（用于格子底色提示） */
  hasSpan: boolean
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map((part) => Number(part))
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function dateKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function weekdayLabel(date: Date) {
  return WEEKDAY_LABELS[date.getDay()]
}

function eventSpanDays(event: CampusCalendarEvent) {
  const start = parseDate(event.start)
  if (!start) return 0
  const end = parseDate(event.end) ?? start
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
}

/** 长学期（超过两周）用来给日期格标「第 N 周」。 */
function semesterWeekOf(date: Date) {
  for (const event of CAMPUS_CALENDAR_EVENTS) {
    if (event.kind !== 'term' || !event.start || !event.end) continue
    const start = parseDate(event.start)
    const end = parseDate(event.end)
    if (!start || !end || eventSpanDays(event) <= 14) continue
    if (date.getTime() < start.getTime() || date.getTime() > end.getTime()) continue
    return {
      event,
      week: Math.floor((date.getTime() - start.getTime()) / 86_400_000 / 7) + 1,
    }
  }
  return null
}

function shortSemesterName(name: string) {
  return name.replace(/^20\d{2}-20\d{2}学年/, '')
}

/** 日期格的读屏标签：长假期中间日期也要报出「进行中」的事件，而不是「暂无安排」。 */
function calendarDayLabel(cell: MonthCell) {
  const names = cell.allEvents
    .filter((event) => event.kind !== 'term' || eventSpanDays(event) <= 14)
    .map((event) => event.name)
  return `${cell.date.getMonth() + 1} 月 ${cell.date.getDate()} 日 ${weekdayLabel(
    cell.date,
  )}${names.length > 0 ? `，${names.join('、')}` : '，暂无收录安排'}`
}

/** 来源里已经带了完整 URL 时，正文只展示来源名称，链接交给「查看原文」按钮。 */
function calendarSourceLabel(source: string) {
  return source
    .replace(/https?:\/\/[^\s)）]+/g, '')
    .replace(/[\s,;，。；]+$/, '')
    .trim()
}

/** 事件日期区间；每年重复的事件按当前查看的年份投影。 */
function formatEventRange(event: CampusCalendarEvent, projectionYear: number) {
  const rawStart = parseDate(event.start)
  if (!rawStart) return '日期待定'
  const start =
    event.repeat === 'yearly'
      ? new Date(projectionYear, rawStart.getMonth(), rawStart.getDate())
      : rawStart
  const rawEnd = parseDate(event.end)
  const end = rawEnd
    ? event.repeat === 'yearly'
      ? new Date(projectionYear, rawEnd.getMonth(), rawEnd.getDate())
      : rawEnd
    : start
  const startLabel = `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日`
  if (end.getTime() <= start.getTime()) return `${startLabel} · 1 天`
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  const endLabel =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()
      ? `${end.getDate()}日`
      : start.getFullYear() === end.getFullYear()
        ? `${end.getMonth() + 1}月${end.getDate()}日`
        : `${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`
  return `${startLabel} - ${endLabel} · ${days} 天`
}

function semesterLabel(value: string) {
  const match = /^(\d{4})-(\d{4})-([12])$/.exec(value.trim())
  if (!match) return value || '未标注学期'
  return `${match[1]}-${match[2]} 第${match[3] === '1' ? '一' : '二'}学期`
}

/** 成绩色阶：90+ 用主色，60 以下用警示色，其余保持中性。 */
function scoreTone(score: string) {
  const value = Number.parseFloat(score)
  if (!Number.isFinite(value)) return ''
  if (value >= 90) return 'is-high'
  if (value < 60) return 'is-low'
  return ''
}

/** 成绩学期选择：自定义下拉，避免原生 select 的样式和层级与页面违和。 */
function SemesterPicker({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const items = [
    { value: 'all', label: '全部学期' },
    ...options.map((semester) => ({ value: semester, label: semesterLabel(semester) })),
  ]

  return (
    <div className="campus-gpa-picker" ref={rootRef}>
      <button
        type="button"
        className="campus-gpa-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="选择成绩学期"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays size={14} />
        <span>{value === 'all' ? '全部学期' : semesterLabel(value)}</span>
        <ChevronDown size={14} className={open ? 'is-open' : ''} />
      </button>
      {open && (
        <div className="campus-gpa-menu" role="listbox" aria-label="选择成绩学期">
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={item.value === value}
              className={item.value === value ? 'is-active' : ''}
              onClick={() => {
                onChange(item.value)
                setOpen(false)
              }}
            >
              <span>{item.label}</span>
              {item.value === value && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function shortEventName(name: string) {
  return name
    .replace(/[（(].*?[)）]/g, '')
    .replace(/^20\d{2}-20\d{2}学年/, '')
    .trim()
}

function eventKindLabel(kind: string) {
  if (kind === 'holiday') return '放假'
  if (kind === 'exam') return '考试'
  if (kind === 'term') return '学期'
  if (kind === 'deadline') return '截止'
  return '活动'
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


export function CampusTools({
  askCount = 0,
  kbCategories = [],
  activeCategory = 'all',
  onPickCategory,
  askSlot,
  children,
}: {
  /** 「我的提问」条数，用于 tab 角标 */
  askCount?: number
  /** 知识分类与条数，用于 tab 内分类入口 */
  kbCategories?: { name: string; count: number }[]
  /** 当前生效的分类（与下方知识卡列表联动） */
  activeCategory?: string
  /** 点分类时回调：由父组件切换筛选并滚到列表 */
  onPickCategory?: (category: string) => void
  /** 我的提问面板（由父组件注入，避免把提问逻辑搬进工具组件） */
  askSlot?: React.ReactNode
  /** 工具下方内容（知识卡列表等），放进吸顶作用域内 */
  children?: React.ReactNode
} = {}) {
  const [tab, setTab] = useState<ToolTab>('gpa')
  const stickyHostRef = useRef<HTMLElement>(null)
  const toolsBarRef = useRef<HTMLElement>(null)
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
  const [libraryRestoring, setLibraryRestoring] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [loans, setLoans] = useState<LibraryLoansResult | null>(null)
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [scoreSemester, setScoreSemester] = useState('all')
  const libraryCheckedRef = useRef(false)
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const profile = useProfile()

  const scoreSemesters = useMemo(
    () =>
      Array.from(new Set(profile.scores.map((row) => row.semester).filter(Boolean))).sort(
        (a, b) => b.localeCompare(a),
      ),
    [profile.scores],
  )
  const scoringRows = useMemo(
    () =>
      scoreSemester === 'all'
        ? profile.scores
        : profile.scores.filter((row) => row.semester === scoreSemester),
    [profile.scores, scoreSemester],
  )
  const scoreSummary = useMemo(
    () => (scoringRows.length > 0 ? scoreStats(scoringRows) : null),
    [scoringRows],
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
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const [calendarDay, setCalendarDay] = useState<string | null>(null)
  const closeCalendarDay = () => setCalendarDay(null)

  const monthCalendar = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const first = new Date(year, month, 1)
    const offset = (first.getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    // 按实际周数渲染（28/35/42 格），不再固定 42 格留一整行空白。
    const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7
    const gridStart = new Date(year, month, 1 - offset)
    const todayKey = dateKey(today)
    const cells: MonthCell[] = Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + index)
      return {
        date,
        key: dateKey(date),
        inMonth: date.getMonth() === month,
        isToday: dateKey(date) === todayKey,
        events: [],
        allEvents: [],
        week: semesterWeekOf(date)?.week ?? null,
        hasSpan: false,
      }
    })
    const byKey = new Map(cells.map((cell) => [cell.key, cell]))
    const kindOrder: Record<string, number> = {
      holiday: 0,
      exam: 1,
      term: 2,
      deadline: 3,
      event: 4,
    }

    for (const event of CAMPUS_CALENDAR_EVENTS) {
      const rawStart = parseDate(event.start)
      if (!rawStart) continue
      const start =
        event.repeat === 'yearly'
          ? new Date(year, rawStart.getMonth(), rawStart.getDate())
          : rawStart
      const rawEnd = parseDate(event.end)
      const end =
        event.repeat === 'yearly'
          ? rawEnd
            ? new Date(year, rawEnd.getMonth(), rawEnd.getDate())
            : start
          : (rawEnd ?? start)
      if (end.getTime() < start.getTime()) continue
      const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
      for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const cell = byKey.get(dateKey(cursor))
        if (!cell) continue
        if (!cell.allEvents.some((item) => item.id === event.id)) {
          cell.allEvents.push(event)
        }
        // 长学期/长假期只在首尾两天标注，避免日历每格都被同一标签占满；
        // 但中间日期仍会进入 allEvents，点开当天详情时能看到「进行中」。
        if (
          spanDays > 14 &&
          cursor.getTime() !== start.getTime() &&
          cursor.getTime() !== end.getTime()
        ) {
          continue
        }
        if (!cell.events.some((item) => item.id === event.id)) {
          cell.events.push(event)
        }
      }
    }
    for (const cell of cells) {
      const byKind = (a: CampusCalendarEvent, b: CampusCalendarEvent) =>
        (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9)
      cell.events.sort(byKind)
      cell.allEvents.sort(byKind)
      cell.hasSpan = cell.allEvents.some(
        (event) => event.kind !== 'term' && eventSpanDays(event) > 14,
      )
    }
    return {
      label: `${year} 年 ${month + 1} 月`,
      cells,
    }
  }, [calendarMonth, today])

  const selectedCalendarDay = useMemo(() => {
    if (!calendarDay) return null
    const cell = monthCalendar.cells.find((item) => item.key === calendarDay)
    if (!cell) return null
    const term = semesterWeekOf(cell.date)
    return {
      ...cell,
      term,
      // 学期本身放进副标题，不占事件卡；长假期等仍作为事件展示。
      detailEvents: cell.allEvents.filter((event) => {
        if (event.kind !== 'term') return true
        return eventSpanDays(event) <= 14
      }),
    }
  }, [calendarDay, monthCalendar])

  const filteredBuildings = useMemo(() => {
    const normalized = mapQuery.trim().toLowerCase()
    if (!normalized) return CAMPUS_BUILDINGS
    /*
     * 只匹配「名称 + 别名」。
     * 不要把 area / category 放进来：area 是给地图看的方位描述，几乎每条都带
     * 「地图」二字，会让搜索「图」命中全部 36 个地点；「图书馆东侧」这类描述
     * 也会把无关建筑带进候选。别名已覆盖「A座 / A栋宿舍 / S2 / 博雅楼」等叫法。
     */
    return CAMPUS_BUILDINGS.filter((building) =>
      [building.name, ...building.aliases].join(' ').toLowerCase().includes(normalized),
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

  /** 选中建筑：地图和列表共用 */
  const selectBuilding = (no: number) => {
    setSelectedBuilding(no)
    setSuggestOpen(false)
  }

  /** 从搜索下拉里选楼：选中后回填名称，列表仍可继续点 */
  const pickBuilding = (no: number) => {
    selectBuilding(no)
    const building = CAMPUS_BUILDINGS.find((item) => item.no === no)
    if (building) setMapQuery(building.name)
  }

  /** 切换工具后滚到内容区，避免用户停在知识卡列表、看不到新面板 */
  const selectTab = (next: ToolTab) => {
    setTab(next)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        stickyHostRef.current
          ?.querySelector<HTMLElement>('.campus-tools-body')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }

  // 点搜索框外部时收起候选
  useEffect(() => {
    if (!suggestOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!searchWrapRef.current?.contains(event.target as Node)) setSuggestOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [suggestOpen])

  // 重新进入网站/刷新后，先尝试恢复服务端保存的图书馆登录态。
  useEffect(() => {
    if (tab !== 'library' || loans || libraryCheckedRef.current) return
    libraryCheckedRef.current = true
    let alive = true
    setLibraryRestoring(true)
    libraryLoans()
      .then((data) => {
        if (alive) setLoans(data)
      })
      .catch(() => {
        // 没有可恢复的登录态时保持登录表单，不额外弹错。
      })
      .finally(() => {
        if (alive) setLibraryRestoring(false)
      })
    return () => {
      alive = false
    }
  }, [tab, loans])

  /*
   * 选项栏吸顶后会浮在内容区上方，内容区必须让出与选项栏等高的空间，
   * 否则首屏内容会被压住。这里把选项栏高度同步成内容区的 scroll-padding-top。
   */
  useEffect(() => {
    const host = stickyHostRef.current
    const bar = toolsBarRef.current
    if (!host || !bar) return

    const sync = () => {
      // 只同步选项栏高度，供知识列表的 scroll-margin-top 避开吸顶栏。
      // 吸顶范围由包裹层内的真实内容撑开，不再人为设置 minHeight。
      host.style.setProperty(
        '--tools-bar-h',
        `${Math.round(bar.getBoundingClientRect().height)}px`,
      )
    }

    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(bar)
    window.addEventListener('resize', sync)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
      host.style.removeProperty('--tools-bar-h')
    }
  }, [tab])


  return (
    <section className="campus-tools-sticky" ref={stickyHostRef}>
      {/* 吸顶区：标题 + 选项栏，只有这部分 sticky */}
      <section className="campus-tools card" ref={toolsBarRef}>
        <div className="campus-tools-bar">
          <div className="campus-tools-head">
            <div>
              <strong>校园工具</strong>
            </div>
            <Badge tone="gold">引路学长</Badge>
          </div>


          <div className="campus-tool-tabs" role="tablist" aria-label="校园工具">
            <button
              role="tab"
              aria-selected={tab === 'gpa'}
              className={tab === 'gpa' ? 'is-active' : ''}
              onClick={() => selectTab('gpa')}
            >
              <Calculator size={15} />
              GPA 计算
            </button>
            <button
              role="tab"
              aria-selected={tab === 'calendar'}
              className={tab === 'calendar' ? 'is-active' : ''}
              onClick={() => selectTab('calendar')}
            >
              <CalendarDays size={15} />
              校历
            </button>
            <button
              role="tab"
              aria-selected={tab === 'library'}
              className={tab === 'library' ? 'is-active' : ''}
              onClick={() => selectTab('library')}
            >
              <Library size={15} />
              图书馆
            </button>
            <button
              role="tab"
              aria-selected={tab === 'map'}
              className={tab === 'map' ? 'is-active' : ''}
              onClick={() => selectTab('map')}
            >
              <MapPin size={15} />
              校园地图
            </button>
            <button
              role="tab"
              aria-selected={tab === 'canteen'}
              className={tab === 'canteen' ? 'is-active' : ''}
              onClick={() => selectTab('canteen')}
            >
              <UtensilsCrossed size={15} />
              食堂决策
            </button>
            <button
              role="tab"
              aria-selected={tab === 'kb'}
              className={tab === 'kb' ? 'is-active' : ''}
              onClick={() => selectTab('kb')}
            >
              <BookOpen size={15} />
              知识分类
            </button>
            {askCount > 0 && (
              <button
                role="tab"
                aria-selected={tab === 'ask'}
                className={tab === 'ask' ? 'is-active' : ''}
                onClick={() => selectTab('ask')}
              >
                <MessageCircle size={15} />
                我的提问
                <span className="campus-tool-tab-badge">{askCount}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 内容区：跟随页面滚动，不吸顶 */}
      <section className="campus-tools-body card">


  {tab === 'gpa' && (
    <div className="campus-tool-panel campus-gpa">
      <div className="campus-gpa-top">
        {scoreSemesters.length > 0 ? (
          <SemesterPicker
            value={scoreSemester}
            options={scoreSemesters}
            onChange={setScoreSemester}
          />
        ) : (
          <span className="campus-gpa-fixed">
            <CalendarDays size={14} />
            全部学期
          </span>
        )}
        <span className="campus-gpa-count">
          {scoringRows.length > 0 ? `${scoringRows.length} 门课程` : '暂无成绩'}
        </span>
      </div>

      <div className="campus-gpa-summary">
        <div className="is-primary">
          <span>GPA（5.0 制）</span>
          <strong>{scoreSummary?.gpaFive != null ? scoreSummary.gpaFive.toFixed(2) : '—'}</strong>
          <em>{scoreSummary ? '本校按 5.0 制计算' : '同步成绩后自动计算'}</em>
        </div>
        <div>
          <span>加权平均</span>
          <strong>
            {scoreSummary?.weightedAverage != null
              ? scoreSummary.weightedAverage.toFixed(2)
              : '—'}
          </strong>
          <em>按学分加权</em>
        </div>
        <div>
          <span>已计入学分</span>
          <strong>{scoreSummary ? scoreSummary.credits : '—'}</strong>
          <em>
            {scoreSummary
              ? `${scoreSummary.counted} 门课程计入`
              : '在「账号与课表 → 成绩」同步'}
          </em>
        </div>
      </div>
      {scoringRows.length > 0 ? (
        <div className="campus-score-list">
          <div className="campus-score-head">
            <span>课程</span>
            <span>学分</span>
            <span>成绩</span>
          </div>
          {scoringRows.map((row) => (
            <div className="campus-score-row" key={row.id}>
              <div>
                <strong>{row.course}</strong>
                <em>
                  {semesterLabel(row.semester)}
                  {row.kind ? ` · ${row.kind}` : ''}
                </em>
              </div>
              <span>{row.credit != null ? `${row.credit}` : '—'}</span>
              <strong className={`campus-score-value ${scoreTone(row.score)}`}>
                {row.score || '—'}
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="campus-tool-empty">
          还没有成绩记录；在「账号与课表 → 成绩」同步后，这里会按学期列出每门课成绩。
        </p>
      )}
    </div>
  )}

  {tab === 'kb' && (
    <div className="campus-tool-panel">
      <p className="campus-tool-hint">按学校官网的数据类型整理，点分类筛选对应知识卡。</p>
      <div className="campus-kb-cats">
        {/* 「全部」始终排第一位，与各分类并列，方便随时回到全量视图 */}
        <button
          type="button"
          className={`campus-kb-cat is-all ${activeCategory === 'all' ? 'is-active' : ''}`}
          onClick={() => onPickCategory?.('all')}
          aria-pressed={activeCategory === 'all'}
        >
          <strong>全部</strong>
          <span>{kbCategories.reduce((sum, item) => sum + item.count, 0)} 条</span>
        </button>
        {kbCategories.map((item) => {
          const active = activeCategory === item.name
          return (
            <button
              type="button"
              className={`campus-kb-cat ${active ? 'is-active' : ''}`}
              key={item.name}
              onClick={() => onPickCategory?.(active ? 'all' : item.name)}
              aria-pressed={active}
            >
              <strong>{item.name}</strong>
              <span>{item.count} 条</span>
            </button>
          )
        })}
      </div>
      {activeCategory !== 'all' && (
        <p className="campus-kb-current">
          正在查看「{activeCategory}」分类
        </p>
      )}
    </div>
  )}

  {tab === 'ask' && <div className="campus-tool-panel">{askSlot}</div>}

  {tab === 'calendar' && (
    <div className="campus-tool-panel">
      <div className="campus-month-calendar">
        <div className="campus-month-head">
          <div className="campus-month-nav">
            <button
              type="button"
              className="campus-month-arrow"
              aria-label="上个月"
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeft size={16} />
            </button>
            <strong>{monthCalendar.label}</strong>
            <button
              type="button"
              className="campus-month-arrow"
              aria-label="下个月"
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                )
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            type="button"
            className="text-button campus-month-today"
            onClick={() => setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            回到本月
          </button>
        </div>
        <div className="campus-month-weekdays">
          {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="campus-month-grid">
          {monthCalendar.cells.map((cell) => (
            <button
              type="button"
              className={`campus-month-day ${cell.inMonth ? '' : 'is-outside'} ${
                cell.isToday ? 'is-today' : ''
              } ${cell.events.length > 0 ? 'is-has-events' : ''} ${
                cell.hasSpan ? 'is-span' : ''
              }`}
              key={cell.key}
              onClick={() => setCalendarDay(cell.key)}
              aria-haspopup="dialog"
              aria-label={calendarDayLabel(cell)}
            >
              <span className="campus-month-day-num">{cell.date.getDate()}</span>
              <span className="campus-month-events">
                {cell.events.slice(0, 2).map((event) => (
                  <span
                    className={`campus-month-event is-${event.kind}`}
                    key={event.id}
                    title={`${event.name} · ${eventKindLabel(event.kind)}`}
                  >
                    {shortEventName(event.name)}
                  </span>
                ))}
                {cell.events.length > 2 && (
                  <span className="campus-month-more">还有 {cell.events.length - 2} 项</span>
                )}
              </span>
              {cell.inMonth && cell.week && (
                <span className="campus-month-week">第{cell.week}周</span>
              )}
            </button>
          ))}
        </div>
        <div className="campus-month-legend">
          {[
            ['holiday', '放假'],
            ['exam', '考试'],
            ['term', '学期'],
            ['event', '活动'],
            ['deadline', '截止'],
          ].map(([kind, label]) => (
            <span key={kind}>
              <i className={`is-${kind}`} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <p className="campus-tool-note">
        点击日期可查看当天安排、来源与官网链接；长学期和长假期只在首尾两天标注，具体以当学期教务处通知为准。
      </p>

      {selectedCalendarDay && (
        <Modal
          open
          onClose={closeCalendarDay}
          eyebrow="校历详情"
          title={`${selectedCalendarDay.date.getMonth() + 1} 月 ${selectedCalendarDay.date.getDate()} 日 · ${weekdayLabel(
            selectedCalendarDay.date,
          )}`}
        >
          <div className="campus-cal-meta">
            <span>{selectedCalendarDay.date.getFullYear()} 年</span>
            {selectedCalendarDay.term && (
              <span>
                {shortSemesterName(selectedCalendarDay.term.event.name)} · 第{' '}
                {selectedCalendarDay.term.week} 周
              </span>
            )}
            <span>
              {selectedCalendarDay.detailEvents.length > 0
                ? `${selectedCalendarDay.detailEvents.length} 项安排`
                : '暂无收录安排'}
            </span>
          </div>

          {selectedCalendarDay.detailEvents.length > 0 ? (
            <div className="campus-cal-event-list">
              {selectedCalendarDay.detailEvents.map((event) => {
                const detail = resolveCalendarDetail(event)
                return (
                  <article className="campus-cal-event" key={event.id}>
                    <div className="campus-cal-event-top">
                      <span className="campus-cal-tags">
                        <span className={`campus-cal-kind is-${event.kind}`}>
                          {eventKindLabel(event.kind)}
                        </span>
                        {event.credibility === 'A' ? (
                          <Badge tone="jade">官方来源</Badge>
                        ) : (
                          event.credibility && <Badge tone="outline">待核实</Badge>
                        )}
                        {event.repeat === 'yearly' && <Badge tone="outline">每年</Badge>}
                      </span>
                      <span className="campus-cal-range">
                        {formatEventRange(event, selectedCalendarDay.date.getFullYear())}
                      </span>
                    </div>
                    <strong>{event.name}</strong>
                    <p>{detail.summary ?? event.note}</p>
                    <div className="campus-cal-event-foot">
                      <span className="campus-cal-source">
                        {calendarSourceLabel(event.source)}
                      </span>
                      {detail.url && (
                        <a
                          className="campus-cal-link"
                          href={detail.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {detail.linkLabel ?? (event.kind === 'exam' ? '查看官网' : '查看原文')}
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="campus-cal-empty">
              <strong>当天暂无收录安排</strong>
              <p>校历只收录开学、考试、放假等关键节点，课程与调课以教务处通知为准。</p>
            </div>
          )}

          <p className="campus-cal-note">
            校历数据来自学校官方/公开来源，可能滞后；具体安排以教务处通知为准。
          </p>
        </Modal>
      )}
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
        ) : libraryRestoring ? (
          <p className="campus-tool-empty">正在恢复图书馆登录…</p>
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
      {/* 搜索框：输入关键词后从下拉候选里直接选楼，不再有独立的地点列表 */}
      <div className="campus-map-search" ref={searchWrapRef}>
        <Search size={15} />
        <input
          value={mapQuery}
          onChange={(event) => {
            setMapQuery(event.target.value)
            setSuggestOpen(true)
          }}
          onFocus={() => setSuggestOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && filteredBuildings.length > 0) {
              event.preventDefault()
              pickBuilding(filteredBuildings[0].no)
            }
            if (event.key === 'Escape') setSuggestOpen(false)
          }}
          placeholder="搜建筑名或别名，例如：图书馆、S2、A栋…"
          aria-label="搜索校园建筑"
          aria-expanded={suggestOpen}
          aria-controls="campus-map-suggest"
          role="combobox"
          aria-autocomplete="list"
        />
        {mapQuery ? (
          <button
            type="button"
            className="campus-map-clear"
            onClick={() => {
              setMapQuery('')
              setSelectedBuilding(null)
              setSuggestOpen(false)
            }}
            aria-label="清空搜索"
          >
            <X size={14} />
          </button>
        ) : (
          <span>{CAMPUS_BUILDINGS.length} 个地点</span>
        )}

        {/* 只有输入了关键词才出候选：点开空输入框不列出全部建筑 */}
        {suggestOpen && mapQuery.trim() && filteredBuildings.length > 0 && (
          <ul className="campus-map-suggest" id="campus-map-suggest" role="listbox">
            {filteredBuildings.slice(0, 8).map((building) => (
              <li key={building.no} role="option" aria-selected={building.no === selectedBuilding}>
                <button type="button" onClick={() => pickBuilding(building.no)}>
                  <span>{building.no.toString().padStart(2, '0')}</span>
                  <strong>{building.name}</strong>
                  <em>{building.category}</em>
                </button>
              </li>
            ))}
            {filteredBuildings.length > 8 && (
              <li className="campus-map-suggest-more">
                还有 {filteredBuildings.length - 8} 个，继续输入可缩小范围
              </li>
            )}
          </ul>
        )}

        {suggestOpen && mapQuery.trim() && filteredBuildings.length === 0 && (
          <div className="campus-map-suggest is-empty">没有匹配的地点，换个关键词试试</div>
        )}
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
                  aria-label={`选择${building.name}`}
                  title={building.name}
                  onClick={() => selectBuilding(building.no)}
                />
              )
            })}
          </div>
          {selected && (
            <>
              <button
                type="button"
                className="campus-map-reset"
                onClick={() => setSelectedBuilding(null)}
              >
                还原全图
              </button>
              {/* 详情浮在地图左下角，不再占用右侧栏 */}
              <div className="campus-map-info is-floating">
                <span className="eyebrow">{selected.category}</span>
                <h3>{selected.name}</h3>
                <p>{selected.area}</p>
                {selected.nearby.length > 0 && (
                  <span className="campus-map-nearby">附近：{selected.nearby.join('、')}</span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="campus-map-side">
          <div className="campus-map-list-head">
            <strong>{mapQuery.trim() ? '搜索结果' : '全部地点'}</strong>
            <span>{filteredBuildings.length} 个</span>
          </div>
          <p className="campus-map-hint">点地图上的框，或从列表选一个地点</p>
          <div className="campus-map-list" role="listbox" aria-label="校园建筑">
            {filteredBuildings.length === 0 ? (
              <p className="campus-tool-empty">没有匹配的地点，换个关键词试试</p>
            ) : (
              filteredBuildings.map((building) => (
                <button
                  key={building.no}
                  type="button"
                  role="option"
                  aria-selected={building.no === selectedBuilding}
                  className={building.no === selectedBuilding ? 'is-active' : ''}
                  onClick={() => selectBuilding(building.no)}
                >
                  <span>{building.no.toString().padStart(2, '0')}</span>
                  <strong>{building.name}</strong>
                  <em>{building.category}</em>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )}

  {tab === 'canteen' && (
    <div className="campus-tool-panel campus-canteen">
      <FandianView embedded />
    </div>
  )}
      </section>

      {/* 工具下方内容也放进吸顶作用域，选项栏才能一直吸到列表底部 */}
      {children}
    </section>
  )
}
