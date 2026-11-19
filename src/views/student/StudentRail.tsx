import { ArrowRight, BookOpen, CalendarDays } from "lucide-react"
import type { Course, CourseNote, ThreadGroup } from '../../types'
import type { TeacherProfile } from '../../data/seed'
import type { ScheduleEntry } from '../../lib/profile'
import { formatRelative, truncate } from "../../lib/utils"
import { sectionLabel, weekdayLabel } from '../../lib/profile'
import { courseById } from '../../data/seed'
import { Avatar, Badge } from '../../components/ui'
import { Donut } from '../../components/charts'

export interface StudentRailProps {
  todayAi: number
  todayHuman: number
  todayRate: number
  firstResponse: { value: string; unit: string }
  todaysClasses: ScheduleEntry[]
  waitingGroups: ThreadGroup[]
  hotFaqs: { id: string; courseId: string; question: string; citations: number }[]
  course: Course
  courseId: string
  courseTeacher: TeacherProfile
  courseFaqCount: number
  courseNote?: CourseNote
  studentId: string
  onChangeCourse: (courseId: string) => void
  onOpenAccount?: (tab: 'identity' | 'schedule' | 'scores' | 'teachers') => void
  onOpenJoinGroup: (group: ThreadGroup) => void
  onOpenFaq: (faqId: string) => void
  onNavigate: (view: 'student' | 'knowledge' | 'teacher' | 'insights' | 'about') => void
}

/** 学生端右侧栏：今日答疑 / 课程表 / 等老师 / 知识库热度 / 教师信息。纯展示，数据由视图注入。 */
export function StudentRail({
  todayAi,
  todayHuman,
  todayRate,
  firstResponse,
  todaysClasses,
  waitingGroups,
  hotFaqs,
  course,
  courseId,
  courseTeacher,
  courseFaqCount,
  courseNote,
  studentId,
  onChangeCourse,
  onOpenAccount,
  onOpenJoinGroup,
  onOpenFaq,
  onNavigate,
}: StudentRailProps) {
  return (
    <aside className="student-rail">
      <div className="rail-card daily-card">
        <div className="rail-card-head">
          <div>
            <div className="eyebrow">今日答疑</div>
            <h3>AI 先接住了多少</h3>
          </div>
        </div>
        <div className="daily-main">
          <div className="daily-number">
            <strong>{todayAi}</strong>
            <span>个问题被 AI 直接答完</span>
          </div>
          <Donut value={todayRate} label="AI 解决" size={92} />
        </div>
        <div className="daily-foot">
          <span>
            <i className="dot-human" />
            转人工 {todayHuman}
          </span>
          <span>
            老师首响 {firstResponse.value}
            {firstResponse.unit}
          </span>
        </div>
      </div>

      {todaysClasses.length > 0 && (
        <div className="rail-card class-card">
          <div className="rail-card-head">
            <div>
              <div className="eyebrow">今天你要上</div>
              <h3>{weekdayLabel(todaysClasses[0].day)}的课</h3>
            </div>
            <CalendarDays size={17} className="rail-head-icon" />
          </div>
          <div className="class-list">
            {todaysClasses.map((entry) => {
              const active = entry.matchedCourseId === courseId
              return (
                <button
                  key={entry.id}
                  className={`class-row ${active ? 'is-active' : ''}`}
                  disabled={!entry.matchedCourseId}
                  onClick={() => entry.matchedCourseId && onChangeCourse(entry.matchedCourseId)}
                >
                  <span className="class-row-main">
                    <strong>{entry.course}</strong>
                    <span>
                      {sectionLabel(entry)}
                      {entry.room ? ` · ${entry.room}` : ''}
                    </span>
                  </span>
                  <span className="class-row-side">
                    {active
                      ? <span className="class-row-active-dot" aria-label="当前课程" />
                      : entry.matchedCourseId
                        ? <span className="class-row-hint">切换</span>
                        : <Badge tone="neutral">未对齐</Badge>}
                  </span>
                </button>
              )
            })}
          </div>
          <button className="text-button class-card-link" onClick={() => onOpenAccount?.('schedule')}>
            查看整周课程表
            <ArrowRight size={13} />
          </button>
        </div>
      )}
      {todaysClasses.length === 0 && (
        <div className="rail-card class-card">
          <div className="rail-card-head">
            <div>
              <div className="eyebrow">课程表</div>
              <h3>还没有课程表</h3>
            </div>
            <CalendarDays size={17} className="rail-head-icon" />
          </div>
          <p className="rail-footnote">绑定教务或手动添加后，提问会默认选中今天的课。</p>
          <button
            className="button button-secondary class-card-cta"
            onClick={() => onOpenAccount?.('schedule')}
          >
            添加课程
          </button>
        </div>
      )}

      <div className="rail-card waiting-card">
        <div className="rail-card-head">
          <div>
            <div className="eyebrow">正在等老师</div>
            <h3>同问，少排一次队</h3>
          </div>
          <span className="waiting-live">
            <i />
            {waitingGroups.length}
          </span>
        </div>
        {waitingGroups.length === 0 ? (
          <p className="waiting-empty">这门课暂时没有待答问题。</p>
        ) : (
          <div className="waiting-list">
            {waitingGroups.map((group) => {
              const joined = group.threads.some((item) => item.student.id === studentId)
              const teacher = courseById(group.courseId).teacher
              return (
                <div className="waiting-row" key={group.key}>
                  <div className="waiting-copy">
                    <strong>{truncate(group.title, 22)}</strong>
                    <span>
                      {group.count} 人等 · {teacher}老师
                    </span>
                  </div>
                  <button
                    className={`same-button ${joined ? 'is-joined' : ''}`}
                    disabled={joined}
                    onClick={() => onOpenJoinGroup(group)}
                  >
                    {joined ? '已在等' : '同问'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="rail-card hot-card">
        <div className="rail-card-head">
          <div>
            <div className="eyebrow">知识库热度</div>
            <h3>大家最近在问</h3>
          </div>
          <BookOpen size={17} className="rail-head-icon" />
        </div>
        <div className="hot-list">
          {hotFaqs.map((faq, index) => (
            <button key={faq.id} className="hot-row" onClick={() => onOpenFaq(faq.id)}>
              <span className="hot-rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="hot-copy">
                <strong>{faq.question}</strong>
                <span>{courseById(faq.courseId).shortName}</span>
              </span>
              <span className="hot-count">{faq.citations}</span>
            </button>
          ))}
        </div>
        <button className="rail-link" onClick={() => onNavigate('knowledge')}>
          浏览全部课程知识
          <ArrowRight size={14} />
        </button>
      </div>

      <div className="rail-card teacher-intro-card">
        <div className="teacher-intro-head">
          <Avatar name={courseTeacher.name} tone={courseTeacher.accent} size="md" />
          <div>
            <strong>{courseTeacher.name}</strong>
            <span>{courseTeacher.title} · {courseTeacher.meta}</span>
          </div>
          <Badge tone="gold">{course.shortName}</Badge>
        </div>
        <div className="teacher-slots">
          <span>课程知识库 · {courseFaqCount} 条 FAQ</span>
          <span>
            {courseNote?.officeHours
              ? `答疑：${courseNote.officeHours}`
              : `由 ${course.teacher} 老师维护`}
          </span>
        </div>
        {courseNote?.announcement && (
          <div className="course-announcement">
            <div className="course-announcement-head">
              <span>课程公告</span>
              <span>{formatRelative(courseNote.updatedAt)}</span>
            </div>
            <p>{courseNote.announcement}</p>
          </div>
        )}
        <button className="rail-link" onClick={() => onNavigate('knowledge')}>
          看看{course.teacher}老师写下的答案
          <ArrowRight size={14} />
        </button>
      </div>
    </aside>
  )
}
