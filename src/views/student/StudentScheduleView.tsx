import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
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

      <EmptyClassroomModal
        open={emptyOpen}
        onClose={() => setEmptyOpen(false)}
        entries={weekEntries}
        initialDay={weekdayNumber()}
      />
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

const EMPTY_BLOCKS = [
  { key: 'morning', label: '上午 · 1-4 节', sections: [1, 2, 3, 4] },
  { key: 'afternoon', label: '下午 · 5-8 节', sections: [5, 6, 7, 8] },
  { key: 'evening', label: '晚上 · 9-11 节', sections: [9, 10, 11] },
] as const

function EmptyClassroomModal({
  open,
  onClose,
  entries,
  initialDay,
}: {
  open: boolean
  onClose: () => void
  entries: ScheduleEntry[]
  initialDay: number
}) {
  const [day, setDay] = useState(initialDay)
  const [building, setBuilding] = useState('')

  const rooms = useMemo(
    () =>
      Array.from(
        new Set(entries.map((entry) => entry.room?.trim()).filter((room): room is string => Boolean(room))),
      ).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    [entries],
  )

  const buildings = useMemo(
    () =>
      Array.from(new Set(rooms.map(roomBuilding))).sort((a, b) => {
        if (a === '其他') return 1
        if (b === '其他') return -1
        return a.localeCompare(b, 'zh-Hans-CN')
      }),
    [rooms],
  )
  const activeBuilding = buildings.includes(building) ? building : buildings[0] ?? ''
  const dayRooms = rooms.filter((room) => roomBuilding(room) === activeBuilding)

  const statusFor = (room: string, block: (typeof EMPTY_BLOCKS)[number]) =>
    block.sections.some((section) =>
      entries.some(
        (entry) =>
          entry.day === day &&
          entry.room?.trim() === room &&
          section >= entry.startSection &&
          section <= entry.endSection,
      ),
    )
      ? 'busy'
      : 'free'

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="课程表 · 找自习室"
      title="空教室"
      size="md"
    >
      <div className="empty-room-modal">
        <div className="empty-room-buildings">
          {buildings.map((item) => (
            <button
              key={item}
              type="button"
              className={item === activeBuilding ? 'is-active' : ''}
              onClick={() => setBuilding(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="empty-room-days">
          {DAYS.map((item) => (
            <button
              key={item}
              type="button"
              className={item === day ? 'is-active' : ''}
              onClick={() => setDay(item)}
            >
              {weekdayLabel(item)}
            </button>
          ))}
        </div>

        <div className="empty-room-legend">
          <span><i className="is-free" />空闲</span>
          <span><i className="is-busy" />占用</span>
          <em>{dayRooms.length} 间教室</em>
        </div>

        {dayRooms.length === 0 ? (
          <EmptyState
            icon={<DoorOpen size={20} />}
            title="这个教学楼还没有教室记录"
            description="换一个教学楼看看，或先在账号设置里补全课表教室。"
          />
        ) : (
          <div className="empty-room-table">
            <div className="empty-room-head">
              <span>教室</span>
              {EMPTY_BLOCKS.map((item) => (
                <span key={item.key}>{item.label.split(' · ')[0]}</span>
              ))}
            </div>
            {dayRooms.map((room) => (
              <div className="empty-room-row" key={room}>
                <strong>{room}</strong>
                {EMPTY_BLOCKS.map((block) => {
                  const status = statusFor(room, block)
                  return (
                    <span className={`empty-room-status is-${status}`} key={block.key}>
                      {status === 'free' ? '空闲' : '占用'}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        <p className="empty-room-note">
          目前只根据你导入课表里出现过的教室判断；全校空教室需要接入教务处教室课表后才会完整。
        </p>
      </div>
    </Modal>
  )
}

function roomBuilding(room: string) {
  const match = room.match(/^([A-Za-z]+\d)/)
  return match ? match[1].toUpperCase() : '其他'
}
