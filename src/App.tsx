import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layout } from './components/Layout'
import { AccountModal } from './components/AccountModal'
import { FaqModal, type FaqModalState } from './components/FaqModal'
import { GuideModal } from './components/GuideModal'
import { MajorMentorDrawer } from './components/MajorMentor'
import { NotificationCenter } from './components/NotificationCenter'
import { WorkspaceBackupModal } from './components/WorkspaceBackupModal'
import { Modal, Toast, type ToastState } from './components/ui'
import { StudentView } from './views/StudentView'
import { ScheduleView } from './views/student/StudentScheduleView'
import { TeacherView } from './views/TeacherView'
import { KnowledgeView } from './views/KnowledgeView'
import { CampusView } from './views/CampusView'
import { InsightsView } from './views/InsightsView'
import { AboutView } from './views/AboutView'
import { AdminConsoleView } from './views/admin/AdminConsoleView'
import { useStore } from './store'
import { groupPendingThreads } from './lib/engine'
import { TEACHERS, allCourses, courseById, isSeededCourse } from './data/seed'
import { isPilotCourse } from './data/pilot'
import { studentCourses, useProfile, visibleTeachers } from './lib/profile'
import { useAuth } from './auth'
import type { FaqPrefill, Role, ViewKey } from './types'

export default function App() {
  const { data, dispatch, resetDemo, markGuideSeen } = useStore()
  const { user } = useAuth()
  const profile = useProfile()
  const accountRole: Role = user?.role === 'teacher' ? 'teacher' : 'student'
  const [role, setRole] = useState<Role>(accountRole)
  const [view, setView] = useState<ViewKey>(accountRole === 'teacher' ? 'teacher' : 'student')
  const [teacherName, setTeacherName] = useState(
    () => TEACHERS.find((teacher) => teacher.name === user?.name)?.name ?? TEACHERS[0].name,
  )
  const [guideOpen, setGuideOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [accountTab, setAccountTab] = useState<
    'identity' | 'schedule' | 'scores' | 'teachers'
  >('identity')
  const [resetOpen, setResetOpen] = useState(false)
  const [faqModal, setFaqModal] = useState<FaqModalState | null>(null)
  const [focusThread, setFocusThread] = useState<string | null>(null)
  const [mentorOpen, setMentorOpen] = useState(false)
  const [mentorSeed, setMentorSeed] = useState<{ id: number; text: string } | null>(null)
  const [mentorRequest, setMentorRequest] = useState<{
    id: number
    courseId: string
    question: string
  } | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimer = useRef<number | null>(null)

  const notify = useCallback((message: string, tone: ToastState['tone'] = 'success') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), message, tone })
    toastTimer.current = window.setTimeout(() => setToast(null), 4200)
  }, [])

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    },
    [],
  )

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [view, role, teacherName])

  useEffect(() => {
    const onError = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message
      if (message) notify(message, 'danger')
    }
    const onNotice = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message
      if (message) notify(message, 'info')
    }
    window.addEventListener('shishuo:sync-error', onError)
    window.addEventListener('shishuo:sync-notice', onNotice)
    return () => {
      window.removeEventListener('shishuo:sync-error', onError)
      window.removeEventListener('shishuo:sync-notice', onNotice)
    }
  }, [notify])

  useEffect(() => {
    if (data.guideSeen) return
    setGuideOpen(true)
    markGuideSeen()
  }, [data.guideSeen, markGuideSeen])

  const navigate = useCallback((next: ViewKey) => {
    setView(next)
    if (next === 'student' || next === 'schedule') setRole('student')
    if (next === 'teacher' || next === 'insights' || next === 'admin') setRole('teacher')
  }, [])

  const switchRole = useCallback(
    (next: Role) => {
      if (next !== accountRole) {
        notify(next === 'teacher' ? '当前是学生账号，教师工作台需要教师账号登录' : '当前是教师账号，提问请使用学生账号', 'info')
        return
      }
      setRole(next)
      setView(next === 'student' ? 'student' : 'teacher')
      if (next !== 'teacher') return
      // A real-course question is routed to its timetable teacher; surface that teacher
      // immediately instead of leaving the demo teacher's empty queue on screen.
      const latestPending = data.threads
        .filter((thread) => thread.status === 'pending' && !thread.withdrawnAt)
        .sort((a, b) => b.createdAt - a.createdAt)[0]
      const recipient = latestPending ? courseById(latestPending.courseId).teacher : ''
      if (
        recipient &&
        latestPending &&
        !isSeededCourse(latestPending.courseId) &&
        visibleTeachers(profile).some((teacher) => teacher.name === recipient)
      ) {
        setTeacherName(recipient)
      }
    },
    [accountRole, data.threads, notify, profile],
  )

  const changeTeacher = useCallback(
    (name: string) => {
      setTeacherName(name)
      setView('teacher')
      notify(`已切换到${name}老师的待办台`)
    },
    [notify],
  )

  const openFaq = useCallback((faqId: string) => {
    setFaqModal({ mode: 'view', faqId })
  }, [])

  const openFaqEditor = useCallback((faqId?: string) => {
    setFaqModal(faqId ? { mode: 'edit', faqId } : { mode: 'create' })
  }, [])

  const openFaqDraft = useCallback((prefill: FaqPrefill) => {
    setFaqModal({ mode: 'create', prefill })
  }, [])

  const openGuide = useCallback(() => {
    setGuideOpen(true)
    markGuideSeen()
  }, [markGuideSeen])

  const openThreadFromNotification = useCallback(
    (threadId: string) => {
      setFocusThread(threadId)
      setView(role === 'student' ? 'student' : 'teacher')
    },
    [role],
  )

  const focusHandled = useCallback(() => setFocusThread(null), [])

  // 分享深链：#/faq/:id 打开知识详情，#/thread/:id 定位到对应问答。
  const [hashTick, setHashTick] = useState(0)
  const handledHashRef = useRef('')

  useEffect(() => {
    const onHashChange = () => setHashTick((tick) => tick + 1)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const hash = window.location.hash
    const match = /^#\/(faq|thread)\/([\w%.-]+)$/.exec(hash)
    if (!match || hash === handledHashRef.current) return
    const kind = match[1]
    const id = decodeURIComponent(match[2])
    if (kind === 'faq') {
      if (data.faqs.some((faq) => faq.id === id)) {
        handledHashRef.current = hash
        openFaq(id)
        return
      }
    } else if (data.threads.some((thread) => thread.id === id)) {
      handledHashRef.current = hash
      navigate(accountRole === 'teacher' ? 'teacher' : 'student')
      setFocusThread(id)
      return
    }
    // 数据可能还没同步下来；等两个轮询周期还找不到，再提示不可见。
    const timer = window.setTimeout(() => {
      if (handledHashRef.current === hash) return
      handledHashRef.current = hash
      notify('链接对应的内容不在当前账号的可见范围。', 'info')
    }, 2_500)
    return () => window.clearTimeout(timer)
  }, [hashTick, data.faqs, data.threads, accountRole, openFaq, navigate, notify])

  const openAccount = useCallback(
    (tab: 'identity' | 'schedule' | 'scores' | 'teachers' = 'identity') => {
      setAccountTab(tab)
      setAccountOpen(true)
    },
    [],
  )

  const openMentor = useCallback((prompt?: string) => {
    setMentorSeed(prompt ? { id: Date.now(), text: prompt } : null)
    setMentorOpen(true)
  }, [])

  const closeMentor = useCallback(() => {
    setMentorOpen(false)
    setMentorSeed(null)
  }, [])

  const routeFromMentor = useCallback((courseId: string, question: string) => {
    setMentorOpen(false)
    setMentorSeed(null)
    setRole('student')
    setView('student')
    setMentorRequest({ id: Date.now(), courseId, question })
  }, [])

  const mentorRequestHandled = useCallback(() => setMentorRequest(null), [])

  const handleReset = useCallback(() => {
    resetDemo()
    setResetOpen(false)
    setGuideOpen(false)
    setFaqModal(null)
    notify('演示数据已恢复到初始状态')
  }, [notify, resetDemo])

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
  const selectedTeacher = teachers.find((teacher) => teacher.name === teacherName) ?? teachers[0]
  const scopedCourseIds = useMemo(() => {
    if (role === 'student') {
      return new Set(studentCourses(profile).map((course) => course.id))
    }
    return new Set(
      allCourses()
        .filter(
          (course) =>
            selectedTeacher.courses.includes(course.id) &&
            (isPilotCourse(course.id) || !isSeededCourse(course.id)),
        )
        .map((course) => course.id),
    )
  }, [role, profile, selectedTeacher])
  const pendingCount = groupPendingThreads(
    data.threads.filter((thread) => scopedCourseIds.has(thread.courseId)),
  ).length
  const notificationRecipient = role === 'student' ? user?.id ?? '' : selectedTeacher.name
  const unreadCount = data.notifications.filter(
    (notification) =>
      !notification.read &&
      notification.audience === role &&
      notification.recipientId === notificationRecipient &&
      scopedCourseIds.has(notification.courseId),
  ).length

  return (
    <>
      <Layout
        role={role}
        view={view}
        teacherName={selectedTeacher.name}
        pendingCount={pendingCount}
        unreadCount={unreadCount}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenAccount={openAccount}
        onOpenAdmin={() => navigate('admin')}
        onOpenMentor={openMentor}
        onNavigate={navigate}
        onOpenGuide={openGuide}
        onRequestReset={() => setResetOpen(true)}
      >
        {view === 'student' && (
          <StudentView
            notify={notify}
            openFaq={openFaq}
            onNavigate={navigate}
            onOpenAccount={openAccount}
            onOpenMentor={openMentor}
            mentorRequest={mentorRequest}
            onMentorRequestHandled={mentorRequestHandled}
            focusThreadId={focusThread}
            onFocusHandled={focusHandled}
          />
        )}
        {view === 'teacher' && (
          <TeacherView
            key={selectedTeacher.name}
            teacherName={selectedTeacher.name}
            onChangeTeacher={changeTeacher}
            onManageTeachers={() => openAccount('teachers')}
            notify={notify}
            openFaq={openFaq}
            openFaqEditor={openFaqEditor}
            onOpenGuide={openGuide}
            onOpenBackup={() => setBackupOpen(true)}
            focusThreadId={focusThread}
            onFocusHandled={focusHandled}
          />
        )}
        {view === 'schedule' && <ScheduleView onOpenAccount={openAccount} />}
        {view === 'knowledge' && (
          <KnowledgeView
            role={role}
            teacherName={selectedTeacher.name}
            notify={notify}
            openFaq={openFaq}
            openFaqEditor={openFaqEditor}
            openFaqDraft={openFaqDraft}
            onGoTeacher={() => navigate('teacher')}
          />
        )}
        {view === 'campus' && <CampusView role={role} notify={notify} />}
        {view === 'admin' && (
          <AdminConsoleView
            notify={notify}
            onNavigate={navigate}
            onOpenBackup={() => setBackupOpen(true)}
          />
        )}
        {view === 'insights' && (
          <InsightsView openFaq={openFaq} onGoTeacher={() => navigate('teacher')} />
        )}
        {view === 'about' && (
          <AboutView
            onEnterStudent={() => switchRole('student')}
            onEnterTeacher={() => switchRole('teacher')}
          />
        )}
      </Layout>

      <MajorMentorDrawer
        open={mentorOpen}
        onClose={closeMentor}
        profile={profile}
        data={data}
        seed={mentorSeed}
        onRoute={routeFromMentor}
        onOpenCourse={(courseId) => routeFromMentor(courseId, '')}
        onEditMajor={() => {
          setMentorOpen(false)
          openAccount('identity')
        }}
      />

      <FaqModal
        state={faqModal}
        role={role}
        teacherName={selectedTeacher.name}
        onClose={() => setFaqModal(null)}
        onEdit={(faqId) => setFaqModal({ mode: 'edit', faqId })}
        notify={notify}
      />

      <GuideModal
        open={guideOpen}
        canReset={role === 'teacher'}
        onClose={() => setGuideOpen(false)}
        onReset={() => {
          setGuideOpen(false)
          setResetOpen(true)
        }}
      />

      <AccountModal
        open={accountOpen}
        initialTab={accountTab}
        onClose={() => setAccountOpen(false)}
        notify={notify}
      />

      <WorkspaceBackupModal
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        notify={notify}
      />

      <NotificationCenter
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        role={role}
        teacherName={selectedTeacher.name}
        onNavigate={navigate}
        onOpenThread={openThreadFromNotification}
      />

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        eyebrow="演示控制"
        title="恢复初始演示数据？"
        size="sm"
        footer={
          <div className="modal-actions">
            <button className="button button-ghost" onClick={() => setResetOpen(false)}>
              取消
            </button>
            <button className="button button-danger" onClick={handleReset}>
              重置数据
            </button>
          </div>
        }
      >
        <p className="modal-copy">
          共享空间里的新增提问、教师回复、通知和新沉淀的 FAQ 都会被清除，回到 5
          门试点课程的初始演示状态。这个操作会影响所有已登录的学生和教师账号。
        </p>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  )
}
