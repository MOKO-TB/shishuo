import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type TouchEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  LayoutGrid,
  Loader2,
  Maximize2,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { isSeededCourse } from '../../data/seed'
import {
  activeBellSection,
  courseToneMap,
  isClassOngoing,
  monthDayOf,
  periodTime,
  runsInWeek,
  sectionBell,
  sectionLabel,
  teachingWeek,
  useProfile,
  weekLabel,
  weekMonday,
  weekdayLabel,
  weekdayNumber,
  type CourseTone,
  type ScheduleEntry,
} from '../../lib/profile'
import { EmptyState, Modal } from '../../components/ui'
import { fetchEmptyRooms, type EmptyRoomDay } from '../../lib/emptyRooms'
import {
  isNativeApp,
  requestPinScheduleWidget,
  syncNativeSchedule,
  triggerHaptic,
} from '../../lib/nativeShell'
import {
  readClassReminderPrefs,
  syncClassReminders,
  writeClassReminderPrefs,
} from '../../lib/classReminders'
import { cn } from '../../lib/utils'

const DAYS = [1, 2, 3, 4, 5, 6, 7]
const MAX_WEEK = 24
const MIN_SECTIONS = 11

/**
 * 学生端「课程表」：按整周铺开的课表网格，横向看一周、纵向看节次。
 * 左栏是学校标准作息，课程块按上课节次跨行；点块可看老师、教室与周次。
 */
export function ScheduleView({
  onOpenAccount,
  notify,
}: {
  onOpenAccount: (tab?: 'identity' | 'schedule' | 'scores' | 'teachers') => void
  notify?: (message: string, tone?: 'success' | 'info' | 'danger') => void
}) {
  const profile = useProfile()
  const currentWeek = teachingWeek(profile.termStart)
  const maxWeek = Math.max(MAX_WEEK, currentWeek ?? 0)
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek ?? 1)
  const [emptyOpen, setEmptyOpen] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [detail, setDetail] = useState<ScheduleEntry | null>(null)
  const [nowTs, setNowTs] = useState(() => Date.now())
  const [reminderEnabled, setReminderEnabled] = useState(() => readClassReminderPrefs().enabled)
  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [slideState, setSlideState] = useState<{ dir: 'next' | 'prev' | null; seq: number }>({
    dir: null,
    seq: 0,
  })
  const touchStartRef = useRef<{ x: number; y: number; locked?: 'x' | 'y' } | null>(null)
  const swipedRef = useRef(false)
  const hasCalendar = currentWeek != null

  const jumpToWeek = (target: number) => {
    if (!hasCalendar) return
    const clamped = Math.min(maxWeek, Math.max(1, target))
    if (clamped === selectedWeek) return
    const dir = clamped > selectedWeek ? 'next' : 'prev'
    triggerHaptic('light')
    setSelectedWeek(clamped)
    setSlideState((prev) => ({ dir, seq: prev.seq + 1 }))
  }

  const stepWeek = (delta: -1 | 1) => {
    jumpToWeek(selectedWeek + delta)
  }

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!hasCalendar || event.touches.length !== 1) return
    const touch = event.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    swipedRef.current = false
  }

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current
    if (!start || event.touches.length !== 1) return
    const touch = event.touches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (!start.locked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      start.locked = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y'
    }
    if (start.locked === 'x') {
      const clamped = Math.max(-72, Math.min(72, dx * 0.45))
      setSwipeOffset(clamped)
    }
  }

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    setSwipeOffset(0)
    if (!start || start.locked !== 'x') return
    const touch = event.changedTouches[0]
    if (!touch) return
    const dx = touch.clientX - start.x
    if (Math.abs(dx) >= 44) {
      swipedRef.current = true
      stepWeek(dx < 0 ? 1 : -1)
    }
  }

  const handleTouchCancel = () => {
    touchStartRef.current = null
    setSwipeOffset(0)
  }

  const handleSelectEntry = (entry: ScheduleEntry) => {
    if (swipedRef.current) {
      swipedRef.current = false
      return
    }
    setDetail(entry)
  }

  const handleBoardClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (swipedRef.current) {
      event.preventDefault()
      event.stopPropagation()
      swipedRef.current = false
    }
  }

  const toggleClassReminder = async () => {
    const prefs = readClassReminderPrefs()
    const next = { ...prefs, enabled: !prefs.enabled }
    writeClassReminderPrefs(next)
    setReminderEnabled(next.enabled)
    triggerHaptic('light')
    const result = await syncClassReminders({
      schedule: profile.schedule,
      termStart: profile.termStart,
      requestPermission: next.enabled,
    })
    if (next.enabled && result.permissionDenied) {
      writeClassReminderPrefs({ ...next, enabled: false })
      setReminderEnabled(false)
      notify?.('未开启系统通知权限，无法设置上课前提醒', 'info')
      return
    }
    if (next.enabled) {
      notify?.(
        result.scheduled > 0
          ? `已开启课前 ${next.leadMinutes} 分钟提醒（已排期未来 7 天 ${result.scheduled} 节课）`
          : `已开启课前 ${next.leadMinutes} 分钟提醒`,
      )
    } else {
      notify?.('已关闭上课前本地提醒', 'info')
    }
  }

  const pinDesktopWidget = async () => {
    triggerHaptic('light')
    await syncNativeSchedule({
      schedule: profile.schedule,
      termStart: profile.termStart,
      studentName: profile.name,
    })
    const status = await requestPinScheduleWidget()
    if (status === 'requested') {
      notify?.('已发起添加；若桌面没有弹窗，请长按桌面空白处 → 小组件 → 搜索「师说」')
    } else {
      notify?.('请长按桌面空白处 → 小组件 → 搜索「师说」；OPPO 若找不到，请选「师说 · 今日课表（兼容版）」', 'info')
    }
  }

  useEffect(() => {
    if (!zoom) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoom(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [zoom])

  const weekEntries = useMemo(() => {
    if (!hasCalendar) return profile.schedule
    return profile.schedule.filter((entry) => runsInWeek(entry.weeks, selectedWeek))
  }, [hasCalendar, profile.schedule, selectedWeek])

  const tones = useMemo(() => courseToneMap(profile.schedule), [profile.schedule])

  /** 课表里真正接入答疑的自建课程数（教务同步的课程会绑定到种子课程）。 */
  const ownCourseCount = useMemo(
    () =>
      new Set(
        profile.schedule
          .map((entry) => entry.matchedCourseId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0 && !isSeededCourse(id)),
      ).size,
    [profile.schedule],
  )

  if (profile.schedule.length === 0) {
    return (
      <div className="page schedule-page">
        <header className="schedule-head">
          <div className="eyebrow">
            <span className="eyebrow-mark jade" />
            我的课程表
          </div>
          <h1 className="display-title">
            什么时候上什么课
            <br />
            <span>这里看得清清楚楚</span>
          </h1>
        </header>
        <div className="card">
          <EmptyState
            icon={<CalendarDays size={20} />}
            title="还没有课程表"
            description="绑定教务或手动添加课程后，就能在这里按周查看上课时间、教室和任课老师。"
            action={
              <button
                className="button button-primary"
                onClick={() => onOpenAccount('schedule')}
              >
                添加课程表
              </button>
            }
          />
        </div>
      </div>
    )
  }

  const weekLabelText = hasCalendar ? `第 ${selectedWeek} 周` : '全部课程'

  return (
    <div className="page schedule-page">
      <header className="schedule-head">
        <h1 className="eyebrow schedule-title">
          <span className="eyebrow-mark jade" />
          我的课程表
        </h1>
        {ownCourseCount > 0 && (
          <p className="schedule-note">
            <span className="schedule-note-full">
              其中 {ownCourseCount} 门课表课程会接入首页答疑；任课老师也会自动加入教师端切换列表。
            </span>
            <span className="schedule-note-short">
              {ownCourseCount} 门课表课程已接入首页答疑
            </span>
          </p>
        )}
      </header>

      <section className="schedule-board" aria-label="周课程表">
        <div className="week-toolbar schedule-toolbar">
          <div className="week-nav">
            {hasCalendar && (
              <button
                type="button"
                className="week-nav-button"
                onClick={() => stepWeek(-1)}
                disabled={selectedWeek <= 1}
                aria-label="上一周"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <strong>{weekLabelText}</strong>
            {hasCalendar && (
              <button
                type="button"
                className="week-nav-button"
                onClick={() => stepWeek(1)}
                disabled={selectedWeek >= maxWeek}
                aria-label="下一周"
              >
                <ChevronRight size={16} />
              </button>
            )}
            {hasCalendar && currentWeek != null && currentWeek !== selectedWeek && (
              <button
                type="button"
                className="text-button"
                onClick={() => jumpToWeek(currentWeek)}
              >
                回到本周
              </button>
            )}
          </div>

          <div className="schedule-toolbar-actions">
            {isNativeApp() && (
              <>
                <button
                  type="button"
                  className={cn('button', reminderEnabled ? 'button-secondary' : 'button-ghost')}
                  onClick={() => void toggleClassReminder()}
                >
                  {reminderEnabled ? <Bell size={15} /> : <BellOff size={15} />}
                  {reminderEnabled ? '课前提醒已开' : '课前提醒'}
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => void pinDesktopWidget()}
                >
                  <LayoutGrid size={15} />
                  桌面小组件
                </button>
              </>
            )}
            <button
              type="button"
              className="schedule-empty-room-btn"
              onClick={() => setEmptyOpen(true)}
            >
              <DoorOpen size={17} />
              <span>空教室</span>
            </button>
            <button
              type="button"
              className="text-button schedule-zoom-trigger"
              onClick={() => setZoom(true)}
            >
              <Maximize2 size={13} />
              放大查看
            </button>
          </div>
        </div>

        {weekEntries.length === 0 && (
          <p className="schedule-board-empty">
            这一周没有课（周次范围之外的课程不会显示）。
          </p>
        )}

        <p className="schedule-mobile-hint">
          {hasCalendar ? '左右滑动切换周次 · 点课程块看详情' : '点课程块可看老师、教室'}
        </p>

        <div className="schedule-swipe-viewport">
          <div
            className="schedule-swipe-zone"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            onClickCapture={handleBoardClickCapture}
            style={
              swipeOffset !== 0
                ? {
                    transform: `translate3d(${swipeOffset}px, 0, 0)`,
                    transition: 'none',
                  }
                : undefined
            }
          >
            <div
              key={`${selectedWeek}-${slideState.seq}`}
              className={cn(
                'schedule-slide-pane',
                slideState.dir === 'next' && 'is-slide-next',
                slideState.dir === 'prev' && 'is-slide-prev',
              )}
            >
              <WeekTimetable
                entries={weekEntries}
                week={selectedWeek}
                termStart={profile.termStart}
                tones={tones}
                isCurrentWeek={!hasCalendar || selectedWeek === currentWeek}
                nowTs={nowTs}
                onSelect={handleSelectEntry}
              />
            </div>
          </div>
        </div>

        <div className="schedule-board-foot">
          <p>左栏是学校标准作息；课程块里的时间来自教务课表，教务没写时按节次推算。</p>
          <button
            type="button"
            className="text-button"
            onClick={() => onOpenAccount('schedule')}
          >
            <SlidersHorizontal size={13} />
            课程表不对？点我去调整
          </button>
        </div>
      </section>

      {zoom &&
        createPortal(
          <div
            className="schedule-zoom"
            role="dialog"
            aria-modal="true"
            aria-label="放大查看课程表"
          >
            <div className="schedule-zoom-head">
              <div className="week-nav">
                {hasCalendar && (
                  <button
                    type="button"
                    className="week-nav-button"
                    onClick={() => stepWeek(-1)}
                    disabled={selectedWeek <= 1}
                    aria-label="上一周"
                  >
                    <ChevronLeft size={18} />
                  </button>
                )}
                <strong>{weekLabelText}</strong>
                {hasCalendar && (
                  <button
                    type="button"
                    className="week-nav-button"
                    onClick={() => stepWeek(1)}
                    disabled={selectedWeek >= maxWeek}
                    aria-label="下一周"
                  >
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setZoom(false)}
                aria-label="关闭放大查看"
              >
                <X size={18} />
              </button>
            </div>
            <div className="schedule-swipe-viewport">
              <div
                className="schedule-swipe-zone"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
                style={
                  swipeOffset !== 0
                    ? {
                        transform: `translate3d(${swipeOffset}px, 0, 0)`,
                        transition: 'none',
                      }
                    : undefined
                }
              >
                <div
                  key={`zoom-${selectedWeek}-${slideState.seq}`}
                  className={cn(
                    'schedule-slide-pane',
                    slideState.dir === 'next' && 'is-slide-next',
                    slideState.dir === 'prev' && 'is-slide-prev',
                  )}
                >
                  <WeekTimetable
                    entries={weekEntries}
                    week={selectedWeek}
                    termStart={profile.termStart}
                    tones={tones}
                    isCurrentWeek={!hasCalendar || selectedWeek === currentWeek}
                    nowTs={nowTs}
                    zoomed
                    onSelect={handleSelectEntry}
                  />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <CourseDetailModal entry={detail} onClose={() => setDetail(null)} />

      <EmptyClassroomModal open={emptyOpen} onClose={() => setEmptyOpen(false)} />
    </div>
  )
}

function WeekTimetable({
  entries,
  week,
  termStart,
  tones,
  isCurrentWeek = true,
  nowTs,
  zoomed,
  onSelect,
}: {
  entries: ScheduleEntry[]
  week: number
  termStart: number | null
  tones: Map<string, CourseTone>
  isCurrentWeek?: boolean
  nowTs: number
  zoomed?: boolean
  onSelect: (entry: ScheduleEntry) => void
}) {
  const today = weekdayNumber(nowTs)
  const liveSection = isCurrentWeek ? activeBellSection(nowTs) : null
  const monday = weekMonday(termStart, week)
  const showDates = termStart != null
  const sectionCount = Math.max(
    MIN_SECTIONS,
    ...entries.map((entry) => Math.min(16, Math.max(1, entry.endSection))),
  )
  const sections = Array.from({ length: sectionCount }, (_, index) => index + 1)

  return (
    <div
      className={cn('week-grid', zoomed && 'is-zoomed')}
      role="table"
      aria-label="周课表"
    >
      <div className="week-grid-corner" style={{ gridColumn: 1, gridRow: 1 }} />
      {DAYS.map((day) => (
        <div
          className={cn('week-grid-day', isCurrentWeek && day === today && 'is-today')}
          key={day}
          style={{ gridColumn: day + 1, gridRow: 1 }}
        >
          <strong>{weekdayLabel(day)}</strong>
          {showDates && <span>{monthDayOf(monday + (day - 1) * 86_400_000)}</span>}
        </div>
      ))}
      {sections.map((section) => {
        const isLiveSection = liveSection === section
        return (
          <Fragment key={section}>
            <div
              className={cn('week-grid-period', isLiveSection && 'is-live')}
              style={{ gridColumn: 1, gridRow: section + 1 }}
            >
              <strong>{section}</strong>
              <em>
                {sectionBell(section).split('-').map((part, index) =>
                  index === 0 ? part : <Fragment key={part}><br />{part}</Fragment>,
                )}
              </em>
            </div>
            {DAYS.map((day) => (
              <div
                className={cn(
                  'week-grid-cell',
                  isCurrentWeek && day === today && 'is-today',
                  isCurrentWeek && day === today && isLiveSection && 'is-live',
                )}
                key={day}
                style={{ gridColumn: day + 1, gridRow: section + 1 }}
              />
            ))}
          </Fragment>
        )
      })}
      {entries.map((entry) => {
        // 脏数据（第 0 节、星期越界）不能撑破网格。
        const start = Math.min(16, Math.max(1, entry.startSection))
        const end = Math.min(16, Math.max(start, entry.endSection))
        const day = Math.min(7, Math.max(1, entry.day))
        const ongoing = isCurrentWeek && isClassOngoing(entry, nowTs)
        return (
          <button
            type="button"
            className={cn(
              'week-class',
              `tone-${tones.get(entry.course) ?? 'jade'}`,
              ongoing && 'is-live',
            )}
            key={entry.id}
            data-span={end - start + 1}
            style={{
              gridColumn: day + 1,
              gridRow: `${start + 1} / ${end + 2}`,
            }}
            title={`${ongoing ? '[上课中] ' : ''}${entry.course}${entry.teacher ? ` · ${entry.teacher}` : ''}${entry.room ? ` · ${entry.room}` : ''}${entry.weeks ? ` · ${entry.weeks}` : ''}`}
            onClick={() => onSelect(entry)}
          >
            {ongoing && <span className="week-class-live">上课中</span>}
            <strong>{entry.course}</strong>
            {periodTime(entry) && <span className="week-class-time">{periodTime(entry)}</span>}
            {entry.teacher && <span className="week-class-teacher">{entry.teacher}</span>}
            {entry.room && <span className="week-class-room">{entry.room}</span>}
            {entry.weeks && <span className="week-class-weeks">{weekLabel(entry.weeks)}</span>}
          </button>
        )
      })}
    </div>
  )
}

function CourseDetailModal({
  entry,
  onClose,
}: {
  entry: ScheduleEntry | null
  onClose: () => void
}) {
  const time = entry ? periodTime(entry) || sectionLabel(entry) : ''
  return (
    <Modal
      open={Boolean(entry)}
      onClose={onClose}
      eyebrow="课程详情"
      title={entry?.course ?? '课程'}
      size="sm"
    >
      {entry && (
        <dl className="schedule-detail">
          <div>
            <dt>上课时间</dt>
            <dd>
              {weekdayLabel(entry.day)} · {time}
              {time !== sectionLabel(entry) ? `（${sectionLabel(entry)}）` : ''}
            </dd>
          </div>
          {entry.teacher && (
            <div>
              <dt>任课老师</dt>
              <dd>{entry.teacher}</dd>
            </div>
          )}
          {entry.room && (
            <div>
              <dt>上课教室</dt>
              <dd>{entry.room}</dd>
            </div>
          )}
          <div>
            <dt>上课周次</dt>
            <dd>{weekLabel(entry.weeks)}</dd>
          </div>
        </dl>
      )}
    </Modal>
  )
}

const EMPTY_STATUS_COLUMNS = [
  { key: 'morning', label: '上午', indexes: [0, 1] },
  { key: 'afternoon', label: '下午', indexes: [2, 3] },
  { key: 'evening', label: '晚上', indexes: [4] },
] as const

function todayIso() {
  const date = new Date()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function emptyRoomDateLabel(date: string) {
  if (date === todayIso()) return '今天'
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date)
  return match ? `${Number(match[1])}/${Number(match[2])}` : date
}

function EmptyClassroomModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [selectedDate, setSelectedDate] = useState('')
  const [building, setBuilding] = useState('J1')
  const [data, setData] = useState<EmptyRoomDay | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const date = selectedDate || todayIso()
    setBusy(true)
    setError('')
    fetchEmptyRooms(date)
      .then((result) => {
        if (cancelled) return
        setData(result)
        if (!selectedDate || !result.matched) setSelectedDate(result.date)
      })
      .catch((reason) => {
        if (cancelled) return
        setData(null)
        setError(reason instanceof Error ? reason.message : '空教室数据加载失败。')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, selectedDate])

  const buildings = data?.buildings ?? []
  const activeBuilding = buildings.find((item) => item.code === building) ?? buildings[0]
  const rooms = activeBuilding?.rooms ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="课程表 · 找自习室"
      title="空教室"
      size="lg"
    >
      <div className="empty-room-modal">
        <div className="empty-room-buildings">
          {buildings.map((item) => (
            <button
              key={item.code}
              type="button"
              className={item.code === activeBuilding?.code ? 'is-active' : ''}
              onClick={() => setBuilding(item.code)}
            >
              {item.code}
            </button>
          ))}
        </div>

        <div className="empty-room-days">
          {(data?.dates ?? [todayIso()]).map((date) => (
            <button
              key={date}
              type="button"
              className={date === selectedDate ? 'is-active' : ''}
              onClick={() => setSelectedDate(date)}
            >
              {emptyRoomDateLabel(date)}
            </button>
          ))}
        </div>

        <div className="empty-room-legend">
          <span><i className="is-free" />空闲</span>
          <span><i className="is-busy" />占用</span>
          <em>{rooms.length} 间教室</em>
        </div>

        {busy ? (
          <p className="campus-tool-empty">
            <Loader2 size={16} className="spin-icon" /> 正在同步全校空教室…
          </p>
        ) : error ? (
          <EmptyState
            icon={<DoorOpen size={20} />}
            title="空教室数据暂时没拉到"
            description={error}
          />
        ) : rooms.length === 0 ? (
          <EmptyState
            icon={<DoorOpen size={20} />}
            title="这一天还没有教室数据"
            description="换一个日期或教学楼看看。"
          />
        ) : (
          <div className="empty-room-table">
            <div className="empty-room-head">
              <span>教室</span>
              {EMPTY_STATUS_COLUMNS.map((item) => (
                <span key={item.key}>{item.label}</span>
              ))}
            </div>
            {rooms.map((room) => (
              <div className="empty-room-row" key={room.name}>
                <span className="empty-room-name">
                  <strong>{room.name}</strong>
                  <small>{room.size ? `${room.size} 座` : ''}</small>
                </span>
                {EMPTY_STATUS_COLUMNS.map((column) => (
                  <span className="empty-room-dots" key={column.key}>
                    {column.indexes.map((index) => {
                      const busyRoom = room.status[index] === 1
                      return (
                        <i
                          key={index}
                          className={`empty-room-dot is-${busyRoom ? 'busy' : 'free'}`}
                          title={busyRoom ? '占用' : '空闲'}
                          aria-label={busyRoom ? '占用' : '空闲'}
                        />
                      )
                    })}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
