import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Loader2,
  Maximize2,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { isSeededCourse } from '../../data/seed'
import {
  courseToneMap,
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
}: {
  onOpenAccount: (tab?: 'identity' | 'schedule' | 'scores' | 'teachers') => void
}) {
  const profile = useProfile()
  const currentWeek = teachingWeek(profile.termStart)
  const maxWeek = Math.max(MAX_WEEK, currentWeek ?? 0)
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek ?? 1)
  const [emptyOpen, setEmptyOpen] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [detail, setDetail] = useState<ScheduleEntry | null>(null)
  const hasCalendar = currentWeek != null

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
          {currentWeek != null && <> · 现在是第 {currentWeek} 周</>}
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
                onClick={() => setSelectedWeek((week) => Math.max(1, week - 1))}
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
                onClick={() => setSelectedWeek((week) => Math.min(maxWeek, week + 1))}
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
                onClick={() => setSelectedWeek(currentWeek)}
              >
                回到本周
              </button>
            )}
          </div>

          <span className="week-count">{weekEntries.length} 节课</span>

          <div className="schedule-toolbar-actions">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setEmptyOpen(true)}
            >
              <DoorOpen size={15} />
              空教室
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

        <p className="schedule-mobile-hint">点课程块可看老师、教室</p>

        <WeekTimetable
          entries={weekEntries}
          week={selectedWeek}
          termStart={profile.termStart}
          tones={tones}
          onSelect={setDetail}
        />

        <div className="schedule-board-foot">
          <p>左栏是学校标准作息；课程块里的时间来自教务课表，教务没写时按节次推算。</p>
          <button
            type="button"
            className="text-button"
            onClick={() => onOpenAccount('schedule')}
          >
            <SlidersHorizontal size={13} />
            课程表不对？去「账号与课表」调整
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
                    onClick={() => setSelectedWeek((week) => Math.max(1, week - 1))}
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
                    onClick={() => setSelectedWeek((week) => Math.min(maxWeek, week + 1))}
                    disabled={selectedWeek >= maxWeek}
                    aria-label="下一周"
                  >
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>
              <span className="week-count">{weekEntries.length} 节课</span>
              <button
                type="button"
                className="icon-button"
                onClick={() => setZoom(false)}
                aria-label="关闭放大查看"
              >
                <X size={18} />
              </button>
            </div>
            <WeekTimetable
              entries={weekEntries}
              week={selectedWeek}
              termStart={profile.termStart}
              tones={tones}
              zoomed
              onSelect={setDetail}
            />
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
  zoomed,
  onSelect,
}: {
  entries: ScheduleEntry[]
  week: number
  termStart: number | null
  tones: Map<string, CourseTone>
  zoomed?: boolean
  onSelect: (entry: ScheduleEntry) => void
}) {
  const today = weekdayNumber()
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
          className={cn('week-grid-day', day === today && 'is-today')}
          key={day}
          style={{ gridColumn: day + 1, gridRow: 1 }}
        >
          <strong>{weekdayLabel(day)}</strong>
          {showDates && <span>{monthDayOf(monday + (day - 1) * 86_400_000)}</span>}
        </div>
      ))}
      {sections.map((section) => (
        <Fragment key={section}>
          <div className="week-grid-period" style={{ gridColumn: 1, gridRow: section + 1 }}>
            <strong>{section}</strong>
            <em>
              {sectionBell(section).split('-').map((part, index) =>
                index === 0 ? part : <Fragment key={part}><br />{part}</Fragment>,
              )}
            </em>
          </div>
          {DAYS.map((day) => (
            <div
              className={cn('week-grid-cell', day === today && 'is-today')}
              key={day}
              style={{ gridColumn: day + 1, gridRow: section + 1 }}
            />
          ))}
        </Fragment>
      ))}
      {entries.map((entry) => {
        // 脏数据（第 0 节、星期越界）不能撑破网格。
        const start = Math.min(16, Math.max(1, entry.startSection))
        const end = Math.min(16, Math.max(start, entry.endSection))
        const day = Math.min(7, Math.max(1, entry.day))
        return (
          <button
            type="button"
            className={cn('week-class', `tone-${tones.get(entry.course) ?? 'jade'}`)}
            key={entry.id}
            data-span={end - start + 1}
            style={{
              gridColumn: day + 1,
              gridRow: `${start + 1} / ${end + 2}`,
            }}
            title={`${entry.course}${entry.teacher ? ` · ${entry.teacher}` : ''}${entry.room ? ` · ${entry.room}` : ''}${entry.weeks ? ` · ${entry.weeks}` : ''}`}
            onClick={() => onSelect(entry)}
          >
            <strong>{entry.course}</strong>
            {periodTime(entry) && <span className="week-class-time">{periodTime(entry)}</span>}
            {entry.teacher && <span>{entry.teacher}</span>}
            {entry.room && <span>{entry.room}</span>}
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
  { key: 'm1', label: '上午 1-2', index: 0 },
  { key: 'm2', label: '上午 3-4', index: 1 },
  { key: 'a1', label: '下午 5-6', index: 2 },
  { key: 'a2', label: '下午 7-8', index: 3 },
  { key: 'e1', label: '晚上', index: 4 },
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
                {EMPTY_STATUS_COLUMNS.map((item) => {
                  const busyRoom = room.status[item.index] === 1
                  return (
                    <span
                      className={`empty-room-status is-${busyRoom ? 'busy' : 'free'}`}
                      key={item.key}
                    >
                      {busyRoom ? '占用' : '空闲'}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        <p className="empty-room-note">
          数据来自「广应科课表」小程序，校区：{data?.campus || '肇庆校区'}；共 {buildings.length} 栋教学楼。
          {data?.fetchedAt ? ` 同步于 ${new Date(data.fetchedAt).toLocaleString('zh-CN')}。` : ''}
        </p>
      </div>
    </Modal>
  )
}
