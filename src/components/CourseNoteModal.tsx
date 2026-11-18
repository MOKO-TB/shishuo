import { useEffect, useState } from 'react'
import { CalendarClock, Megaphone, Save } from 'lucide-react'
import { useStore } from '../store'
import type { Course, CourseNote } from '../types'
import { Modal } from './ui'

export function CourseNoteModal({
  open,
  onClose,
  courses,
  notes,
  initialCourseId,
  notify,
}: {
  open: boolean
  onClose: () => void
  courses: Course[]
  notes: CourseNote[]
  initialCourseId?: string
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}) {
  const { dispatch } = useStore()
  const [courseId, setCourseId] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [officeHours, setOfficeHours] = useState('')

  useEffect(() => {
    if (!open || courses.length === 0) return
    const preferred = courses.some((course) => course.id === initialCourseId)
      ? (initialCourseId as string)
      : courses[0].id
    setCourseId(preferred)
    const note = notes.find((item) => item.courseId === preferred)
    setAnnouncement(note?.announcement ?? '')
    setOfficeHours(note?.officeHours ?? '')
    // Reset only when the dialog opens or the default course changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCourseId])

  const changeCourse = (nextId: string) => {
    setCourseId(nextId)
    const note = notes.find((item) => item.courseId === nextId)
    setAnnouncement(note?.announcement ?? '')
    setOfficeHours(note?.officeHours ?? '')
  }

  const save = () => {
    const course = courses.find((item) => item.id === courseId)
    if (!course) return
    dispatch({
      type: 'course-note-saved',
      note: {
        courseId: course.id,
        teacher: course.teacher,
        announcement: announcement.trim(),
        officeHours: officeHours.trim(),
        updatedAt: Date.now(),
      },
    })
    notify(announcement.trim() || officeHours.trim() ? '课程公告与答疑时段已更新' : '已清空课程公告与答疑时段')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="教师工具 · 学生可见"
      title="课程公告与答疑时段"
      size="md"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            公告和答疑时段会同步给选这门课的学生，不会伪造老师发言。
          </span>
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={onClose}>
              取消
            </button>
            <button className="button button-primary" onClick={save}>
              <Save size={15} />
              保存公告
            </button>
          </div>
        </div>
      }
    >
      <div className="course-note-form">
        <label className="field">
          <span className="field-label">课程</span>
          <select
            className="input"
            value={courseId}
            onChange={(event) => changeCourse(event.target.value)}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} · {course.teacher}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">
            <Megaphone size={13} />
            课程公告
          </span>
          <textarea
            className="input textarea"
            value={announcement}
            onChange={(event) => setAnnouncement(event.target.value)}
            rows={5}
            placeholder="例如：本周四 19:00 在博学楼 A302 加一次习题课，重点讲动态规划。"
          />
          <span className="field-hint">留空则学生端不显示公告。</span>
        </label>
        <label className="field">
          <span className="field-label">
            <CalendarClock size={13} />
            答疑时段
          </span>
          <input
            className="input"
            value={officeHours}
            onChange={(event) => setOfficeHours(event.target.value)}
            placeholder="例如：周四 19:00–20:30 · 博学楼 A302"
          />
          <span className="field-hint">会显示在当前课程的学生端教师卡片里。</span>
        </label>
      </div>
    </Modal>
  )
}
