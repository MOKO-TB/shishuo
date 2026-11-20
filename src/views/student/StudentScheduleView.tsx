import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, DoorOpen, Plus, SlidersHorizontal } from 'lucide-react'
import {
  courseToneMap,
  periodTime,
  runsInWeek,
  sectionLabel,
  teachingWeek,
  useProfile,
  weekdayLabel,
  weekdayNumber,
  type ScheduleEntry,
} from '../../lib/profile'
import { EmptyState, Modal } from '../../components/ui'
import { cn } from '../../lib/utils'

const DAYS = [1, 2, 3, 4, 5, 6, 7]
const MAX_WEEK = 24

/**
 * 学生端「课程表」：按天查看本周上什么课、几点上、在哪间教室。
 * 手机优先设计：默认选中今天，上方可切天、翻周；桌面下同样可用。
 */
export function ScheduleView({
  onOpenAccount,
}: {
  onOpenAccount: (tab?: 'identity' | 'schedule' | 'scores' | 'teachers') => void
}) {
  const profile = useProfile()
  const currentWeek = teachingWeek(profile.termStart)
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek ?? 1)
  const [selectedDay, setSelectedDay] = useState<number>(() => weekdayNumber())
  const [emptyOpen, setEmptyOpen] = useState(false)
  const weekFilterable = currentWeek != null

  const weekEntries = useMemo(() => {
    if (!weekFilterable) return profile.schedule
    return profile.schedule.filter((entry) => runsInWeek(entry.weeks, selectedWeek))
  }, [profile.schedule, selectedWeek, weekFilterable])

  const byDay = useMemo(() => {
    const map = new Map<number, ScheduleEntry[]>()
    for (const entry of weekEntries) {
      const list = map.get(entry.day) ?? []
      list.push(entry)
      map.set(entry.day, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startSection - b.startSection)
    }
    return map
  }, [weekEntries])

  const tones = useMemo(() => courseToneMap(profile.schedule), [profile.schedule])
  const today = weekdayNumber()
  const dayEntries = byDay.get(selectedDay) ?? []
  const total = weekEntries.length

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
            description="绑定教务或手动添加课程后，就能在这里按天查看上课时间、教室和任课老师。"
            action={
              <button
                className="button button-primary"
                onClick={() => onOpenAccount('schedule')}
              >
                <Plus size={15} />
                添加课程表
              </button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="page schedule-page">
      <header className="schedule-head">
        <div className="eyebrow">
          <span className="eyebrow-mark jade" />
          我的课程表
          {currentWeek != null && <> · 现在是第 {currentWeek} 周</>}
        </div>
        <h1 className="display-title">
          什么时候上什么课
          <br />
          <span>打开就能看</span>
        </h1>
      </header>

      <section className="schedule-controls card">
        {weekFilterable && (
          <div className="schedule-weeknav">
            <button
              type="button"
              className="schedule-weekarrow"
              onClick={() => setSelectedWeek((week) => Math.max(1, week - 1))}
              disabled={selectedWeek <= 1}
              aria-label="上一周"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="schedule-weeklabel">
              <strong>第 {selectedWeek} 周</strong>
              <span>
                {currentWeek === selectedWeek ? '本周' : `共 ${total} 节课`}
              </span>
            </div>
            <button
              type="button"
              className="schedule-weekarrow"
              onClick={() => setSelectedWeek((week) => Math.min(MAX_WEEK, week + 1))}
              disabled={selectedWeek >= MAX_WEEK}
              aria-label="下一周"
            >
              <ChevronRight size={16} />
            </button>
            {currentWeek != null && currentWeek !== selectedWeek && (
              <button
                type="button"
                className="text-button"
                onClick={() => setSelectedWeek(currentWeek)}
              >
                回到本周
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          className="button button-ghost schedule-empty-button"
          onClick={() => setEmptyOpen(true)}
        >
          <DoorOpen size={15} />
          空教室
        </button>

        <div className="schedule-days" role="tablist" aria-label="按天查看课程">
          {DAYS.map((day) => {
            const count = (byDay.get(day) ?? []).length
            const isToday = day === today
            return (
              <button
                key={day}
                type="button"
                role="tab"
                aria-selected={selectedDay === day}
                className={cn(
                  'schedule-day',
                  selectedDay === day && 'is-active',
                  isToday && 'is-today',
                  count === 0 && 'is-empty',
                )}
                onClick={() => setSelectedDay(day)}
              >
                <span>{weekdayLabel(day)}</span>
                <em>{isToday ? '今天' : count > 0 ? `${count} 节` : '没课'}</em>
              </button>
            )
          })}
        </div>
      </section>

      <section className="schedule-list">
        {dayEntries.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<CalendarDays size={20} />}
              title={selectedDay === today ? '今天没有课' : `${weekdayLabel(selectedDay)}没有课`}
              description="换一天看看，或者去「账号与课表」补录临时课程。"
            />
          </div>
        ) : (
          dayEntries.map((entry) => {
            const tone = tones.get(entry.course) ?? 'jade'
            return (
              <article key={entry.id} className={`schedule-card tone-${tone}`}>
                <div className="schedule-time">
                  <strong>{periodTime(entry) || sectionLabel(entry)}</strong>
                  <span>{sectionLabel(entry)}</span>
                </div>
                <div className="schedule-body">
                  <h3>{entry.course}</h3>
                  <p>
                    {entry.teacher || '老师待补充'}
                    {entry.room ? ` · ${entry.room}` : ''}
                  </p>
                  {entry.weeks && <span className="schedule-weeks">{entry.weeks}</span>}
                </div>
              </article>
            )
          })
        )}
      </section>

      <div className="schedule-foot">
        <button
          className="button button-ghost"
          onClick={() => onOpenAccount('schedule')}
        >
          <SlidersHorizontal size={14} />
          课程表不对？去「账号与课表」调整
        </button>
      </div>

      <EmptyClassroomModal
        open={emptyOpen}
        onClose={() => setEmptyOpen(false)}
        entries={weekEntries}
        initialDay={selectedDay}
      />
    </div>
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
  const [blockKey, setBlockKey] = useState<(typeof EMPTY_BLOCKS)[number]['key']>('morning')
  const block = EMPTY_BLOCKS.find((item) => item.key === blockKey) ?? EMPTY_BLOCKS[0]

  const rooms = useMemo(
    () =>
      Array.from(
        new Set(entries.map((entry) => entry.room?.trim()).filter((room): room is string => Boolean(room))),
      ).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    [entries],
  )

  const occupied = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.day === day &&
          entry.room &&
          block.sections.some(
            (section) => section >= entry.startSection && section <= entry.endSection,
          ),
      ),
    [block, day, entries],
  )

  const occupiedRooms = new Set(occupied.map((entry) => entry.room?.trim()))
  const freeRooms = rooms.filter((room) => !occupiedRooms.has(room))

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="课程表 · 找自习室"
      title="空教室"
      size="md"
    >
      <div className="empty-room-modal">
        <div className="empty-room-filters">
          <label>
            <span>星期</span>
            <select value={day} onChange={(event) => setDay(Number(event.target.value))}>
              {DAYS.map((item) => (
                <option key={item} value={item}>
                  {weekdayLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>时段</span>
            <select
              value={blockKey}
              onChange={(event) =>
                setBlockKey(event.target.value as (typeof EMPTY_BLOCKS)[number]['key'])
              }
            >
              {EMPTY_BLOCKS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="empty-room-summary">
          本周共 {rooms.length} 间教室进入过课表 · 当前时段有课 {occupied.length} 间 · 空闲{' '}
          {freeRooms.length} 间
        </p>

        {freeRooms.length === 0 ? (
          <EmptyState
            icon={<DoorOpen size={20} />}
            title="当前时段没有可判断的空教室"
            description="这门课的课表里没有更多教室记录，换一天或换个时段看看。"
          />
        ) : (
          <div className="empty-room-grid">
            {freeRooms.map((room) => (
              <span className="empty-room-chip" key={room}>
                <DoorOpen size={13} />
                {room}
              </span>
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
