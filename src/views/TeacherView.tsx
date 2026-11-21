import { useEffect, useMemo, useState } from 'react'
import {
  CircleAlert,
  Compass,
  Database,
  Inbox,
  Megaphone,
  Sparkles,
  Timer,
} from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { allCourses, courseById, dateKey, isSeededCourse, teacherByName } from '../data/seed'
import { isPilotCourse } from '../data/pilot'
import { computeGaps, groupPendingThreads } from '../lib/engine'
import { isDocumentAttachment } from '../lib/attachment'
import { useProfile, visibleTeachers } from '../lib/profile'
import { downloadText } from '../lib/export'
import type { KnowledgeGap, Thread, ThreadGroup } from '../types'
import {
  confidenceLabel,
  displayStudentName,
  formatDateTime,
  percent,
  statusLabel,
} from '../lib/utils'
import { TeacherReplyDrawer } from '../components/TeacherReplyDrawer'
import { CourseNoteModal } from '../components/CourseNoteModal'
import { ThreadDetailModal } from '../components/ThreadDetailModal'
import { MiniBars } from '../components/charts'
import { TeacherQueue } from './teacher/TeacherQueue'
import { TeacherRail } from './teacher/TeacherRail'
import type { WorkTab, QueueFilter } from './teacher/types'
import { AiMark } from '../components/ui'

interface TeacherViewProps {
  teacherName: string
  onChangeTeacher: (name: string) => void
  onManageTeachers: () => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  openFaq: (faqId: string) => void
  openFaqEditor: (faqId?: string) => void
  onOpenGuide: () => void
  onOpenBackup: () => void
  focusThreadId?: string | null
  onFocusHandled?: () => void
}


export function TeacherView({
  teacherName,
  onChangeTeacher,
  onManageTeachers,
  notify,
  openFaq,
  openFaqEditor,
  onOpenGuide,
  onOpenBackup,
  focusThreadId,
  onFocusHandled,
}: TeacherViewProps) {
  const { data, dispatch } = useStore()
  const { user } = useAuth()
  const profile = useProfile()
  const [tab, setTab] = useState<WorkTab>('pending')
  const [courseFilter, setCourseFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all')
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [answeredThreadId, setAnsweredThreadId] = useState<string | null>(null)
  const [needsInfoThreadId, setNeedsInfoThreadId] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)

  const teachers = useMemo(() => {
    const all = visibleTeachers(profile)
    if (user?.role !== 'teacher') return all
    const assigned = new Set(user.courses ?? [])
    const byCourse = all.filter((teacher) =>
      teacher.courses.some((courseId) => assigned.has(courseId)),
    )
    const byName = all.filter((teacher) => teacher.name === user.name)
    const own = byCourse.length > 0 ? byCourse : byName
    return own.length > 0 ? own : all
  }, [profile, user])
  const teacherCourses = useMemo(() => {
    const ids = new Set(teacherByName(teacherName).courses)
    return allCourses().filter(
      (course) =>
        ids.has(course.id) && (isPilotCourse(course.id) || !isSeededCourse(course.id)),
    )
  }, [teacherName, profile.customCourses])
  const teacherCourseIds = useMemo(() => teacherCourses.map((course) => course.id), [teacherCourses])
  const teacherThreads = useMemo(
    () => data.threads.filter((thread) => teacherCourseIds.includes(thread.courseId)),
    [data.threads, teacherCourseIds],
  )
  const groupsAll = useMemo(() => groupPendingThreads(teacherThreads), [teacherThreads])
  const gapsAll = useMemo(() => computeGaps(teacherThreads, data.faqs), [teacherThreads, data.faqs])
  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const now = Date.now()
    return groupsAll.filter((group) => {
      if (courseFilter !== 'all' && group.courseId !== courseFilter) return false
      const course = courseById(group.courseId)
      const haystack = [
        group.title,
        group.primary.question,
        course.name,
        course.shortName,
        ...group.studentNames,
      ]
        .join(' ')
        .toLowerCase()
      if (needle && !haystack.includes(needle)) return false
      if (queueFilter === 'today') return group.urgency === 'today'
      if (queueFilter === 'follow-up') return group.primary.kind === 'follow-up'
      if (queueFilter === 'image')
        return group.threads.some(
          (thread) => thread.attachment && !isDocumentAttachment(thread.attachment),
        )
      if (queueFilter === 'low') return group.primary.confidence === 'low'
      if (queueFilter === 'aged') return now - group.oldestAt >= 24 * 3_600_000
      return true
    })
  }, [groupsAll, courseFilter, query, queueFilter])
  const answeredAll = useMemo(
    () =>
      teacherThreads
        .filter((thread) => thread.status === 'answered')
        .sort((a, b) => (b.teacherReply?.at ?? 0) - (a.teacherReply?.at ?? 0)),
    [teacherThreads],
  )
  const followUpParentIds = useMemo(
    () =>
      new Set(
        teacherThreads
          .filter((thread) => thread.kind === 'follow-up' && thread.parentThreadId)
          .map((thread) => thread.parentThreadId as string),
      ),
    [teacherThreads],
  )
  const answered = useMemo(
    () => {
      const needle = query.trim().toLowerCase()
      return answeredAll.filter((thread) => {
        if (courseFilter !== 'all' && thread.courseId !== courseFilter) return false
        if (!needle) return true
        const course = courseById(thread.courseId)
        return [
          thread.question,
          thread.teacherReply?.text ?? '',
          thread.student.name,
          course.name,
          course.shortName,
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
    },
    [answeredAll, courseFilter, query],
  )
  const needsInfoAll = useMemo(
    () =>
      teacherThreads
        .filter((thread) => thread.status === 'needs-info' && !thread.withdrawnAt)
        .sort((a, b) => (b.teacherRequest?.at ?? b.createdAt) - (a.teacherRequest?.at ?? a.createdAt)),
    [teacherThreads],
  )
  const needsInfo = useMemo(
    () => {
      const needle = query.trim().toLowerCase()
      return needsInfoAll.filter((thread) => {
        if (courseFilter !== 'all' && thread.courseId !== courseFilter) return false
        if (!needle) return true
        const course = courseById(thread.courseId)
        return [
          thread.question,
          thread.teacherRequest?.text ?? '',
          thread.studentSupplement?.text ?? '',
          thread.student.name,
          course.name,
          course.shortName,
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
    },
    [needsInfoAll, courseFilter, query],
  )
  const selectedGroup = groupsAll.find((group) => group.key === selectedGroupKey) ?? null

  const weekly = data.daily.slice(-7)
  const today = data.daily.find((entry) => entry.date === dateKey(Date.now()))
  const todayAi = today?.ai ?? 0
  const ai7 = weekly.reduce((sum, entry) => sum + entry.ai, 0)
  const human7 = weekly.reduce((sum, entry) => sum + entry.human, 0)
  const rate7 = ai7 + human7 > 0 ? ai7 / (ai7 + human7) : 0
  const savedHours = (ai7 * 4) / 60
  const pendingQuestions = groupsAll.reduce((sum, group) => sum + group.count, 0)
  const teacherFaqs = data.faqs.filter((faq) => teacherCourseIds.includes(faq.courseId))
  const reviewFaqs = teacherFaqs.filter((faq) => faq.reviewNeeded)
  const totalCitations = teacherFaqs.reduce((sum, faq) => sum + faq.citations, 0)

  const changeTab = (next: WorkTab) => {
    setTab(next)
    setSelectedGroupKey(null)
    setNeedsInfoThreadId(null)
  }

  const changeCourse = (next: string) => {
    setCourseFilter(next)
    setSelectedGroupKey(null)
    setNeedsInfoThreadId(null)
  }

  const exportWeeklyReport = () => {
    const cutoff = Date.now() - 7 * 24 * 3_600_000
    const weekly = teacherThreads
      .filter(
        (thread) =>
          thread.createdAt >= cutoff ||
          (thread.teacherReply?.at ?? 0) >= cutoff ||
          (thread.resolvedAt ?? 0) >= cutoff,
      )
      .sort((a, b) => (b.teacherReply?.at ?? b.createdAt) - (a.teacherReply?.at ?? a.createdAt))
    if (weekly.length === 0) {
      notify('近 7 天没有可导出的答疑记录', 'info')
      return
    }
    const cell = (value: string) => `"${value.replace(/"/g, '""')}"`
    const header = [
      '课程',
      '提问时间',
      '学生',
      '问题',
      '状态',
      'AI置信度',
      '转交时间',
      '老师回复时间',
      '首响分钟',
      '是否确认解决',
      '学生反馈',
      '老师回复',
    ]
    const rows = weekly.map((thread) => {
      const course = courseById(thread.courseId)
      const firstResponse =
        thread.escalation?.at && thread.teacherReply?.at
          ? Math.max(
              0,
              Math.round((thread.teacherReply.at - thread.escalation.at) / 60_000),
            ).toString()
          : ''
      const feedback =
        thread.feedback === 'helpful'
          ? '有帮助'
          : thread.feedback === 'unhelpful'
            ? '不够清楚'
            : ''
      return [
        course.name,
        formatDateTime(thread.createdAt),
        displayStudentName(thread, true),
        thread.question,
        statusLabel(thread),
        confidenceLabel(thread.confidence),
        thread.escalation ? formatDateTime(thread.escalation.at) : '',
        thread.teacherReply ? formatDateTime(thread.teacherReply.at) : '',
        firstResponse,
        thread.resolvedAt ? '是' : '否',
        feedback,
        thread.teacherReply?.text ?? '',
      ]
    })
    const content = `\uFEFF${[header, ...rows]
      .map((row) => row.map(cell).join(','))
      .join('\r\n')}\r\n`
    const date = new Date().toISOString().slice(0, 10)
    downloadText(`师说-教师周报-${date}.csv`, content, 'text/csv;charset=utf-8')
    notify(`已导出近 7 天 ${weekly.length} 条答疑记录`, 'success')
  }

  const openGap = (gap: KnowledgeGap) => {
    const group = groupsAll.find((item) => item.key === gap.groupKey)
    if (group) {
      setTab('pending')
      setCourseFilter('all')
      setSelectedGroupKey(group.key)
      return
    }
    if (gap.sourceFaqId) openFaqEditor(gap.sourceFaqId)
  }

  const undoReply = (thread: Thread) => {
    const faqId = thread.teacherReply?.faqId
    dispatch({ type: 'reply-undone', threadId: thread.id })
    setAnsweredThreadId(null)
    notify(
      faqId
        ? '回复已撤回，问题回到待办；这次沉淀的知识也一并回滚'
        : '回复已撤回，问题回到待办',
      'info',
    )
  }

  useEffect(() => {
    if (!focusThreadId) return
    const thread = data.threads.find((item) => item.id === focusThreadId)
    if (thread && teacherCourseIds.includes(thread.courseId)) {
      if (thread.status === 'needs-info') {
        setTab('needs-info')
        setCourseFilter('all')
        setNeedsInfoThreadId(thread.id)
      } else {
        const group = groupsAll.find((item) =>
          item.threads.some((item2) => item2.id === thread.id),
        )
        if (group) {
          setTab('pending')
          setCourseFilter('all')
          setSelectedGroupKey(group.key)
        } else if (thread.teacherReply) {
          setTab('answered')
          setAnsweredThreadId(thread.id)
        }
      }
    }
    onFocusHandled?.()
  }, [focusThreadId, data.threads, groupsAll, teacherCourseIds, onFocusHandled])

  return (
    <div className="page teacher-page">
      <header className="teacher-head">
        <div className="teacher-head-main">
          <div className="eyebrow">
            <span className="eyebrow-mark clay" />
            教师工作台 · {teacherName}
          </div>
          <h1 className="display-title">
            把重复问题
            <br />
            <span>一次处理完</span>
          </h1>
        </div>

        <div className="teacher-head-side">
          <div className="teacher-switch-wrap">
            <label className="teacher-switch">
              <span className="teacher-switch-label">当前教师</span>
              <select
                value={teacherName}
                onChange={(event) => onChangeTeacher(event.target.value)}
                aria-label="切换教师身份"
              >
                {teachers.map((teacher) => {
                  const waiting = data.threads.filter(
                    (thread) =>
                      thread.status === 'pending' &&
                      !thread.withdrawnAt &&
                      teacher.courses.includes(thread.courseId),
                  ).length
                  return (
                    <option key={teacher.id} value={teacher.name}>
                      {teacher.name} · {teacher.title}
                      {waiting > 0 ? ` · ${waiting} 个待办` : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            {profile.customCourses.length > 0 && (
              <button className="text-button teacher-manage-link" onClick={onManageTeachers}>
                管理老师
                {profile.hiddenTeacherNames.length > 0
                  ? ` · 已隐藏 ${profile.hiddenTeacherNames.length} 位`
                  : ''}
              </button>
            )}
          </div>
          <button className="button button-ghost teacher-guide-button" onClick={onOpenGuide}>
            <Compass size={16} />
            看演示指引
          </button>
          <button
            className="button button-ghost teacher-guide-button"
            onClick={() => setNoteOpen(true)}
          >
            <Megaphone size={16} />
            课程公告
          </button>
          <button className="button button-ghost teacher-guide-button" onClick={onOpenBackup}>
            <Database size={16} />
            数据备份
          </button>
        </div>
      </header>

      <section className="teacher-stats">
        <div className="stat-card stat-card-primary">
          <div className="stat-icon">
            <Inbox size={19} />
          </div>
          <div className="stat-copy">
            <span className="stat-label">待我确认</span>
            <strong>
              {groupsAll.length}
              <em>组</em>
            </strong>
            <p>{pendingQuestions} 个问题</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon jade">
            <Sparkles size={19} />
          </div>
          <div className="stat-copy">
            <span className="stat-label">试点 AI 自动解决</span>
            <strong>
              {todayAi}
              <em>个</em>
            </strong>
            
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon gold">
            <Timer size={19} />
          </div>
          <div className="stat-copy">
            <span className="stat-label">试点 AI 解决率</span>
            <strong>
              {percent(rate7)}
              <em></em>
            </strong>
            <p>近 7 天</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon clay">
            <CircleAlert size={19} />
          </div>
          <div className="stat-copy">
            <span className="stat-label">知识缺口</span>
            <strong>
              {gapsAll.length}
              <em>个</em>
            </strong>
            
          </div>
        </div>
      </section>

      <div className="workbench-layout">
        <TeacherQueue
          data={data}
          tab={tab}
          changeTab={changeTab}
          groupsAll={groupsAll}
          needsInfoAll={needsInfoAll}
          answeredAll={answeredAll}
          teacherCourses={teacherCourses}
          courseFilter={courseFilter}
          changeCourse={changeCourse}
          query={query}
          setQuery={setQuery}
          queueFilter={queueFilter}
          setQueueFilter={setQueueFilter}
          filteredGroups={filteredGroups}
          needsInfo={needsInfo}
          answered={answered}
          followUpParentIds={followUpParentIds}
          exportWeeklyReport={exportWeeklyReport}
          setSelectedGroupKey={setSelectedGroupKey}
          setNeedsInfoThreadId={setNeedsInfoThreadId}
          setAnsweredThreadId={setAnsweredThreadId}
        />

        <TeacherRail
          gapsAll={gapsAll}
          openGap={openGap}
          weekly={weekly}
          savedHours={savedHours}
          rate7={rate7}
          ai7={ai7}
          human7={human7}
          teacherFaqs={teacherFaqs}
          totalCitations={totalCitations}
          reviewFaqs={reviewFaqs}
          openFaq={openFaq}
        />
      </div>

      <TeacherReplyDrawer
        group={selectedGroup}
        onClose={() => setSelectedGroupKey(null)}
        notify={notify}
        openFaq={openFaq}
      />
      <ThreadDetailModal
        threadId={answeredThreadId}
        onClose={() => setAnsweredThreadId(null)}
        onOpenFaq={openFaq}
        onUndoReply={undoReply}
        viewer="teacher"
        notify={notify}
      />
      <ThreadDetailModal
        threadId={needsInfoThreadId}
        onClose={() => setNeedsInfoThreadId(null)}
        onOpenFaq={openFaq}
        viewer="teacher"
        notify={notify}
      />
      <CourseNoteModal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        courses={teacherCourses}
        notes={data.courseNotes ?? []}
        initialCourseId={courseFilter === 'all' ? undefined : courseFilter}
        notify={notify}
      />
    </div>
  )
}
