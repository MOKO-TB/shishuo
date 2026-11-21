import { useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  CircleAlert,
  Copy,
  Database,
  Inbox,
  Megaphone,
  Sparkles,
  Timer,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { allCourses, courseById, isSeededCourse, teacherByName } from '../data/seed'
import { isPilotCourse } from '../data/pilot'
import { computeGaps, groupPendingThreads } from '../lib/engine'
import { courseMetrics } from '../lib/metrics'
import { isDocumentAttachment } from '../lib/attachment'
import { useProfile } from '../lib/profile'
import { downloadText } from '../lib/export'
import type { KnowledgeGap, Thread, ThreadGroup } from '../types'
import {
  confidenceLabel,
  copyText,
  displayStudentName,
  feedbackReasonLabel,
  formatDateTime,
  percent,
  statusLabel,
  truncate,
} from '../lib/utils'
import { TeacherReplyDrawer } from '../components/TeacherReplyDrawer'
import { AIAnswerReviewDrawer } from '../components/AIAnswerReviewDrawer'
import { CourseNoteModal } from '../components/CourseNoteModal'
import { ThreadDetailModal } from '../components/ThreadDetailModal'
import { MiniBars } from '../components/charts'
import { TeacherQueue } from './teacher/TeacherQueue'
import { TeacherRail } from './teacher/TeacherRail'
import type {
  AiAnsweredFilter,
  AnsweredFilter,
  ExportRange,
  NeedsInfoFilter,
  QueueFilter,
  WorkTab,
} from './teacher/types'
import { AiMark } from '../components/ui'

interface TeacherViewProps {
  teacherName: string
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  openFaq: (faqId: string) => void
  openFaqEditor: (faqId?: string) => void
  onOpenBackup: () => void
  focusThreadId?: string | null
  onFocusHandled?: () => void
}


export function TeacherView({
  teacherName,
  notify,
  openFaq,
  openFaqEditor,
  onOpenBackup,
  focusThreadId,
  onFocusHandled,
}: TeacherViewProps) {
  const { data, dispatch } = useStore()
  const profile = useProfile()
  const [tab, setTab] = useState<WorkTab>('pending')
  const [courseFilter, setCourseFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all')
  const [answeredFilter, setAnsweredFilter] = useState<AnsweredFilter>('all')
  const [needsInfoFilter, setNeedsInfoFilter] = useState<NeedsInfoFilter>('all')
  const [aiFilter, setAiFilter] = useState<AiAnsweredFilter>('all')
  const [exportRange, setExportRange] = useState<ExportRange>(7)
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [answeredThreadId, setAnsweredThreadId] = useState<string | null>(null)
  const [needsInfoThreadId, setNeedsInfoThreadId] = useState<string | null>(null)
  const [selectedAiThreadId, setSelectedAiThreadId] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [followUpDismissed, setFollowUpDismissed] = useState(false)
  const [reviewedAiIds, setReviewedAiIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`shishuo.ai-reviewed.v1.${teacherName}`)
      const parsed = raw ? JSON.parse(raw) : []
      return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [])
    } catch {
      return new Set()
    }
  })

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
  const answered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return answeredAll.filter((thread) => {
      if (courseFilter !== 'all' && thread.courseId !== courseFilter) return false
      if (answeredFilter === 'no-feedback') {
        if (thread.feedback || thread.resolvedAt) return false
      } else if (answeredFilter === 'unhelpful') {
        if (thread.feedback !== 'unhelpful') return false
      } else if (answeredFilter === 'unsealed') {
        if (thread.teacherReply?.faqId) return false
      } else if (answeredFilter === 'resolved') {
        if (!thread.resolvedAt) return false
      }
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
  }, [answeredAll, answeredFilter, courseFilter, query])
  const needsInfoAll = useMemo(
    () =>
      teacherThreads
        .filter((thread) => thread.status === 'needs-info' && !thread.withdrawnAt)
        .sort((a, b) => (b.teacherRequest?.at ?? b.createdAt) - (a.teacherRequest?.at ?? a.createdAt)),
    [teacherThreads],
  )
  const needsInfo = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const now = Date.now()
    return needsInfoAll.filter((thread) => {
      if (courseFilter !== 'all' && thread.courseId !== courseFilter) return false
      const askedAt = thread.teacherRequest?.at ?? thread.createdAt
      const waited = now - askedAt
      if (needsInfoFilter === 'aged24' && waited < 24 * 3_600_000) return false
      if (needsInfoFilter === 'aged48' && waited < 48 * 3_600_000) return false
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
  }, [needsInfoAll, courseFilter, needsInfoFilter, query])
  const aiAnsweredAll = useMemo(
    () =>
      teacherThreads
        .filter(
          (thread) =>
            thread.status === 'ai' &&
            !thread.withdrawnAt &&
            (!reviewedAiIds.has(thread.id) || thread.feedback === 'unhelpful'),
        )
        .sort((a, b) => b.createdAt - a.createdAt),
    [reviewedAiIds, teacherThreads],
  )
  const aiAnswered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const weekAgo = Date.now() - 7 * 24 * 3_600_000
    const faqById = new Map(data.faqs.map((faq) => [faq.id, faq]))
    return aiAnsweredAll.filter((thread) => {
      if (courseFilter !== 'all' && thread.courseId !== courseFilter) return false
      if (aiFilter === 'medium' && thread.confidence !== 'medium') return false
      if (aiFilter === 'low' && thread.confidence !== 'low') return false
      if (aiFilter === 'unhelpful' && thread.feedback !== 'unhelpful') return false
      if (aiFilter === 'image') {
        if (!thread.attachment || isDocumentAttachment(thread.attachment)) return false
      }
      if (aiFilter === 'week' && thread.createdAt < weekAgo) return false
      if (!needle) return true
      const course = courseById(thread.courseId)
      const source = thread.sources?.[0] ? faqById.get(thread.sources[0]) : undefined
      return [
        thread.question,
        thread.aiAnswer ?? '',
        thread.student.name,
        course.name,
        course.shortName,
        source?.question ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [aiAnsweredAll, aiFilter, courseFilter, data.faqs, query])
  const selectedGroup = groupsAll.find((group) => group.key === selectedGroupKey) ?? null
  const selectedAiThread =
    aiAnsweredAll.find((thread) => thread.id === selectedAiThreadId) ?? null

  const metrics = useMemo(() => courseMetrics(teacherThreads), [teacherThreads])
  const { weekly, todayAi, aiSolved: ai7, humanHandled: human7, aiRate: rate7, savedHours } = metrics
  const pendingQuestions = groupsAll.reduce((sum, group) => sum + group.count, 0)
  const teacherFaqs = data.faqs.filter((faq) => teacherCourseIds.includes(faq.courseId))
  const reviewFaqs = teacherFaqs.filter((faq) => faq.reviewNeeded)
  const totalCitations = teacherFaqs.reduce((sum, faq) => sum + faq.citations, 0)
  const stalePendingCount = groupsAll.filter(
    (group) => Date.now() - group.oldestAt >= 24 * 3_600_000,
  ).length
  const staleInfoCount = needsInfoAll.filter(
    (thread) => Date.now() - (thread.teacherRequest?.at ?? thread.createdAt) >= 48 * 3_600_000,
  ).length

  const acknowledgeAiThread = (threadId: string) => {
    const next = new Set(reviewedAiIds).add(threadId)
    setReviewedAiIds(next)
    try {
      localStorage.setItem(
        `shishuo.ai-reviewed.v1.${teacherName}`,
        JSON.stringify(Array.from(next)),
      )
    } catch {
      // 本机标记失败不影响抽查本身。
    }
    setSelectedAiThreadId(null)
    notify('已标记为核对无误，本机不再显示这条 AI 回答', 'success')
  }

  const copyFollowUpSummary = async () => {
    const lines = [
      `师说 · ${teacherName}老师跟进摘要`,
      `生成时间：${formatDateTime(Date.now())}`,
      '',
      `待处理：${groupsAll.length} 组 / ${pendingQuestions} 个问题，其中超 24h ${stalePendingCount} 组`,
      `等补充：${needsInfoAll.length} 个，其中超 48h ${staleInfoCount} 个`,
      `AI 已答待抽查：${aiAnsweredAll.length} 个`,
      `今天 AI 自动解决：${todayAi} 个`,
      `待完善 FAQ：${reviewFaqs.length} 条`,
      `知识缺口：${gapsAll.length} 个`,
    ]
    if (gapsAll.length > 0) {
      lines.push('', '优先处理的缺口：')
      gapsAll.slice(0, 5).forEach((gap, index) => {
        lines.push(`${index + 1}. ${truncate(gap.topic, 40)}（${gap.count} 人等待）`)
      })
    }
    const copied = await copyText(lines.join('\n'))
    notify(
      copied ? '跟进摘要已复制，可直接发到群里或贴进周报' : '复制失败，请检查浏览器权限',
      copied ? 'success' : 'info',
    )
  }

  const changeTab = (next: WorkTab) => {
    setTab(next)
    setSelectedGroupKey(null)
    setNeedsInfoThreadId(null)
    setAnsweredThreadId(null)
    setSelectedAiThreadId(null)
  }

  const changeCourse = (next: string) => {
    setCourseFilter(next)
    setSelectedGroupKey(null)
    setNeedsInfoThreadId(null)
  }

  const exportWeeklyReport = () => {
    const cutoff = Date.now() - exportRange * 24 * 3_600_000
    const needle = query.trim().toLowerCase()
    const rowsInRange = teacherThreads
      .filter((thread) => {
        if (courseFilter !== 'all' && thread.courseId !== courseFilter) return false
        if (
          thread.createdAt < cutoff &&
          (thread.teacherReply?.at ?? 0) < cutoff &&
          (thread.resolvedAt ?? 0) < cutoff
        ) {
          return false
        }
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
      .sort((a, b) => (b.teacherReply?.at ?? b.createdAt) - (a.teacherReply?.at ?? a.createdAt))
    if (rowsInRange.length === 0) {
      notify(`近 ${exportRange} 天没有可导出的答疑记录`, 'info')
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
      '反馈原因',
      '老师回复',
    ]
    const rows = rowsInRange.map((thread) => {
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
        thread.feedbackReason ? feedbackReasonLabel(thread.feedbackReason) : '',
        thread.teacherReply?.text ?? '',
      ]
    })
    const content = `\uFEFF${[header, ...rows]
      .map((row) => row.map(cell).join(','))
      .join('\r\n')}\r\n`
    const date = new Date().toISOString().slice(0, 10)
    downloadText(`师说-教师答疑-近${exportRange}天-${date}.csv`, content, 'text/csv;charset=utf-8')
    notify(`已导出近 ${exportRange} 天 ${rowsInRange.length} 条答疑记录`, 'success')
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
          <button
            className="button button-ghost teacher-guide-button"
            onClick={() => void copyFollowUpSummary()}
          >
            <Copy size={16} />
            复制跟进摘要
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

      {!followUpDismissed && (stalePendingCount > 0 || staleInfoCount > 0) && (
        <div className="teacher-followup-banner">
          <span className="teacher-followup-icon">
            <BellRing size={16} />
          </span>
          <div className="teacher-followup-copy">
            <strong>有需要跟进的问题</strong>
            <span>
              {stalePendingCount > 0 && `待处理超 24h ${stalePendingCount} 组`}
              {stalePendingCount > 0 && staleInfoCount > 0 && ' · '}
              {staleInfoCount > 0 && `等补充超 48h ${staleInfoCount} 个`}
            </span>
          </div>
          <div className="teacher-followup-actions">
            {stalePendingCount > 0 && (
              <button
                className="text-button"
                onClick={() => {
                  changeTab('pending')
                  setQueueFilter('aged')
                }}
              >
                看待处理
              </button>
            )}
            {staleInfoCount > 0 && (
              <button
                className="text-button"
                onClick={() => {
                  changeTab('needs-info')
                  setNeedsInfoFilter('aged48')
                }}
              >
                看待补充
              </button>
            )}
            <button
              className="icon-button"
              onClick={() => setFollowUpDismissed(true)}
              aria-label="收起跟进提醒"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

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
            <span className="stat-label">我的课程 AI 自动解决</span>
            <strong>
              {todayAi}
              <em>个</em>
            </strong>
            <p>今天 · 我的课程</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon gold">
            <Timer size={19} />
          </div>
          <div className="stat-copy">
            <span className="stat-label">我的课程 AI 解决率</span>
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
          aiAnsweredAll={aiAnsweredAll}
          teacherCourses={teacherCourses}
          courseFilter={courseFilter}
          changeCourse={changeCourse}
          query={query}
          setQuery={setQuery}
          queueFilter={queueFilter}
          setQueueFilter={setQueueFilter}
          answeredFilter={answeredFilter}
          setAnsweredFilter={setAnsweredFilter}
          needsInfoFilter={needsInfoFilter}
          setNeedsInfoFilter={setNeedsInfoFilter}
          aiFilter={aiFilter}
          setAiFilter={setAiFilter}
          exportRange={exportRange}
          setExportRange={setExportRange}
          filteredGroups={filteredGroups}
          needsInfo={needsInfo}
          answered={answered}
          aiAnswered={aiAnswered}
          followUpParentIds={followUpParentIds}
          exportWeeklyReport={exportWeeklyReport}
          setSelectedGroupKey={setSelectedGroupKey}
          setNeedsInfoThreadId={setNeedsInfoThreadId}
          setAnsweredThreadId={setAnsweredThreadId}
          setSelectedAiThreadId={setSelectedAiThreadId}
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
      <AIAnswerReviewDrawer
        thread={selectedAiThread}
        onClose={() => setSelectedAiThreadId(null)}
        onAcknowledge={acknowledgeAiThread}
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
