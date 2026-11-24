import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Layout } from './components/Layout'
import { AccountModal } from './components/AccountModal'
import { FaqModal, type FaqModalState } from './components/FaqModal'
import { FeedbackModal } from './components/FeedbackModal'
import { GuideModal } from './components/GuideModal'
import { MajorMentorDrawer } from './components/MajorMentor'
import { StudentAvatarWidget } from './components/DigitalAvatar'
import { NotificationCenter } from './components/NotificationCenter'
import { WorkspaceBackupModal } from './components/WorkspaceBackupModal'
import { Modal, Toast, type ToastState } from './components/ui'
import { StudentView } from './views/StudentView'
import { ScheduleView } from './views/student/StudentScheduleView'
import { ChaoxingView } from './views/student/ChaoxingView'
import { TeacherView } from './views/TeacherView'
import { KnowledgeView } from './views/KnowledgeView'
import { CampusView } from './views/CampusView'
import { InsightsView } from './views/InsightsView'
import { FandianView } from './views/FandianView'
import { AboutView } from './views/AboutView'
import { useStore } from './store'
import { groupPendingThreads } from './lib/engine'
import { TEACHERS, allCourses, courseById, isSeededCourse } from './data/seed'
import { isPilotCourse } from './data/pilot'
import {
  isClassOngoing,
  periodTime,
  runsInWeek,
  studentCourses,
  teachingWeek,
  upcomingTodayClasses,
  useProfile,
  visibleTeachers,
} from './lib/profile'
import { useMentorSelection } from './lib/mentorSelection'
import { useAuth } from './auth'
import { usePlaceholderTab } from './lib/placeholderTab'
import { closeTopOverlay } from './lib/overlayStack'
import { syncLocalNotifications } from './lib/localNotifications'
import { syncClassReminders } from './lib/classReminders'
import {
  downloadNativeUpdate,
  installPendingNativeUpdate,
  isNativeApp,
  openExternalUrl,
  openNativeInstallPermissionSettings,
  subscribeUpdateDownload,
  syncNativeSchedule,
  triggerHaptic,
  type UpdateDownloadProgress,
} from './lib/nativeShell'
import {
  checkAndroidAppUpdate,
  dismissUpdateVersion,
  isUpdateDismissed,
  type AppUpdateCheckResult,
} from './lib/appUpdate'
import type { NativePhotoFile } from './lib/photoAccess'
import type { FaqPrefill, Role, ViewKey } from './types'

export default function App() {
  usePlaceholderTab()
  const { data, dispatch, resetDemo, markGuideSeen } = useStore()
  const { user } = useAuth()
  const profile = useProfile()
  const { mentor } = useMentorSelection()
  const [clockTick, setClockTick] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const nextClassHint = useMemo(() => {
    const weekNow = teachingWeek(profile.termStart) ?? 1
    const nextClass = upcomingTodayClasses(profile, clockTick).find((entry) =>
      runsInWeek(entry.weeks, weekNow),
    )
    if (!nextClass) return undefined
    const ongoing = isClassOngoing(nextClass, clockTick)
    return `${ongoing ? '上课中' : '下一节'} ${nextClass.course} · ${periodTime(nextClass)}`
  }, [clockTick, profile])
  const accountRole: Role = user?.role === 'teacher' ? 'teacher' : 'student'
  const [role, setRole] = useState<Role>(accountRole)
  const [view, setView] = useState<ViewKey>(accountRole === 'teacher' ? 'teacher' : 'student')
  const [teacherName, setTeacherName] = useState(
    () => TEACHERS.find((teacher) => teacher.name === user?.name)?.name ?? TEACHERS[0].name,
  )
  const [guideOpen, setGuideOpen] = useState(false)
  const [feedbackModal, setFeedbackModal] = useState<{ open: boolean; tab: 'compose' | 'mine' }>({
    open: false,
    tab: 'compose',
  })
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
  const [courseRequest, setCourseRequest] = useState<{ id: number; courseId: string } | null>(null)
  const [wallRequest, setWallRequest] = useState<{
    id: number
    courseId: string
    sessionId: string
  } | null>(null)
  const [nativeCameraRequest, setNativeCameraRequest] = useState<number | null>(null)
  const [incomingShare, setIncomingShare] = useState<{
    id: number
    text?: string
    image?: NativePhotoFile
  } | null>(null)
  const [appUpdate, setAppUpdate] = useState<AppUpdateCheckResult | null>(null)
  const [updateProgress, setUpdateProgress] = useState<UpdateDownloadProgress | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimer = useRef<number | null>(null)

  const notify = useCallback((
    message: string,
    tone: ToastState['tone'] = 'success',
    action?: { label: string; onAction: () => void },
  ) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast(action ? { id: Date.now(), message, tone, actionLabel: action.label, onAction: action.onAction } : { id: Date.now(), message, tone })
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 6000 : 4200)
  }, [])

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    },
    [],
  )

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [view, accountOpen, role, teacherName])

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
    // 导航即离开设置页：否则 accountOpen 仍为 true，内容区继续被设置页独占
    setAccountOpen(false)
    setView(next)
    if (next === 'student' || next === 'schedule') setRole('student')
    if (next === 'teacher' || next === 'insights') setRole('teacher')
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requested = params.get('view')
    const allowed: ViewKey[] = ['student', 'teacher', 'knowledge', 'chaoxing', 'campus', 'insights', 'about', 'schedule']
    if (requested && (allowed as string[]).includes(requested)) {
      navigate(requested as ViewKey)
    }
    const wallFlag = params.get('wall')
    const wallCourse = params.get('course')
    const wallSession = params.get('session')
    if (wallFlag === '1' && wallCourse && wallSession) {
      navigate('student')
      setWallRequest({ id: Date.now(), courseId: wallCourse, sessionId: wallSession })
    }
    // Only apply the deep link once on entry; normal navigation uses state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const openFeedback = useCallback((tab: 'compose' | 'mine' = 'compose') => {
    setFeedbackModal({ open: true, tab })
  }, [])

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
  const courseRequestHandled = useCallback(() => setCourseRequest(null), [])
  const wallRequestHandled = useCallback(() => setWallRequest(null), [])
  const nativeCameraHandled = useCallback(() => setNativeCameraRequest(null), [])
  const incomingShareHandled = useCallback(() => setIncomingShare(null), [])

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

  // 新通知 → 手机系统通知；后台/被杀由原生 WorkManager 兜底。
  useEffect(() => {
    if (!user) return
    const courseIds = new Set(scopedCourseIds)
    courseIds.add('campus')
    void syncLocalNotifications({
      userId: user.id,
      audience: role,
      recipientId: notificationRecipient,
      courseIds,
      notifications: data.notifications,
    })
  }, [data.notifications, user, role, notificationRecipient, scopedCourseIds])

  // 点击系统通知 / 原生通知：标记已读并打开对应问答。
  useEffect(() => {
    const onOpenThread = (event: Event) => {
      const shellWindow = window as typeof window & {
        __shishuoPendingOpen?: { threadId?: string; notificationId?: string }
      }
      const detail =
        (event as CustomEvent<{ threadId?: string; notificationId?: string }>).detail ??
        shellWindow.__shishuoPendingOpen
      if (!detail) return
      delete shellWindow.__shishuoPendingOpen
      if (detail.notificationId) {
        dispatch({ type: 'notifications-read', ids: [detail.notificationId] })
      }
      if (detail.threadId) {
        openThreadFromNotification(detail.threadId)
      } else {
        setNotificationsOpen(true)
      }
    }
    window.addEventListener('shishuo:open-thread', onOpenThread)
    return () => window.removeEventListener('shishuo:open-thread', onOpenThread)
  }, [dispatch, openThreadFromNotification])

  // 冷启动时原生可能已经派发过事件；挂载后再补一次。
  useEffect(() => {
    const shellWindow = window as typeof window & {
      __shishuoPendingOpen?: { threadId?: string; notificationId?: string }
    }
    const pending = shellWindow.__shishuoPendingOpen
    if (!pending) return
    delete shellWindow.__shishuoPendingOpen
    window.dispatchEvent(new CustomEvent('shishuo:open-thread', { detail: pending }))
  }, [])

  // 学生课表变化时同步给 Android 原生缓存（桌面课表小组件 + 离线兜底页）和课前提醒。
  useEffect(() => {
    if (!isNativeApp() || accountRole !== 'student') return
    void syncNativeSchedule({
      schedule: profile.schedule,
      termStart: profile.termStart,
      studentName: profile.name,
    })
    void syncClassReminders({
      schedule: profile.schedule,
      termStart: profile.termStart,
      requestPermission: false,
    })
  }, [accountRole, profile.schedule, profile.termStart, profile.name])

  // 接管原生小组件跳转、桌面长按快捷入口、系统“分享到师说”。
  useEffect(() => {
    type NativeAction =
      | { type: 'navigate'; view?: string }
      | { type: 'shortcut'; target?: string }
      | { type: 'share'; text?: string; image?: NativePhotoFile }

    const handleNativeAction = (action: NativeAction | undefined) => {
      if (!action) return
      if (action.type === 'navigate' && action.view) {
        const allowed: ViewKey[] = [
          'student',
          'teacher',
          'knowledge',
          'chaoxing',
          'campus',
          'insights',
          'fandian',
          'about',
          'schedule',
        ]
        if ((allowed as string[]).includes(action.view)) {
          navigate(action.view as ViewKey)
        }
        return
      }
      if (action.type === 'shortcut' && action.target) {
        if (action.target === 'camera') {
          if (accountRole === 'student') {
            navigate('student')
            setNativeCameraRequest(Date.now())
          } else {
            notify('当前是教师账号，拍题提问需登录学生账号', 'info')
          }
          return
        }
        if (
          action.target === 'schedule' ||
          action.target === 'chaoxing' ||
          action.target === 'fandian'
        ) {
          navigate(action.target)
        }
        return
      }
      if (action.type === 'share') {
        if (accountRole !== 'student') {
          notify('分享提问仅支持学生账号，请先切换学生账号', 'info')
          return
        }
        navigate('student')
        setIncomingShare({
          id: Date.now(),
          text: action.text,
          image: action.image,
        })
      }
    }

    const onAction = (event: Event) => {
      const shellWindow = window as typeof window & { __shishuoPendingAction?: NativeAction }
      const detail = (event as CustomEvent<NativeAction>).detail ?? shellWindow.__shishuoPendingAction
      delete shellWindow.__shishuoPendingAction
      handleNativeAction(detail)
    }

    window.addEventListener('shishuo:native-action', onAction)
    const shellWindow = window as typeof window & { __shishuoPendingAction?: NativeAction }
    if (shellWindow.__shishuoPendingAction) {
      const pending = shellWindow.__shishuoPendingAction
      delete shellWindow.__shishuoPendingAction
      handleNativeAction(pending)
    }
    return () => window.removeEventListener('shishuo:native-action', onAction)
  }, [accountRole, navigate, notify])

  // 进入主界面 800ms 后及每次回到前台时检查 APK 更新（60s 节流，不影响首屏加载）。
  useEffect(() => {
    if (!isNativeApp()) return
    let lastCheckedAt = 0
    const checkNow = () => {
      const now = Date.now()
      if (now - lastCheckedAt < 60_000) return
      lastCheckedAt = now
      void checkAndroidAppUpdate()
        .then((result) => {
          if (!result || !result.hasUpdate) return
          if (!result.required && isUpdateDismissed(result.latest.versionCode)) return
          setAppUpdate(result)
        })
        .catch(() => {
          // 网络抖动时允许下次切回前台再试。
          lastCheckedAt = 0
        })
    }
    const timer = window.setTimeout(checkNow, 800)
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // 订阅应用内更新下载进度，并在用户允许“安装未知应用”返回后自动续装。
  useEffect(() => {
    if (!isNativeApp()) return
    const unsubscribe = subscribeUpdateDownload((progress) => {
      setUpdateProgress(progress)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (updateProgress?.status !== 'permission_required') return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void installPendingNativeUpdate().then((status) => {
        if (status === 'installing') {
          setUpdateProgress((prev) =>
            prev
              ? { ...prev, status: 'installing', message: '已调起系统安装界面，请确认安装' }
              : null,
          )
        }
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [updateProgress?.status])

  // 安卓返回键：先关最上层弹窗/抽屉，再回首页，最后才让原生退出。
  const nativeBackRef = useRef<() => boolean>(() => false)
  useEffect(() => {
    nativeBackRef.current = () => {
      if (closeTopOverlay()) return true
      if (accountOpen) {
        setAccountOpen(false)
        return true
      }
      if (faqModal) {
        setFaqModal(null)
        return true
      }
      if (backupOpen) {
        setBackupOpen(false)
        return true
      }
      if (notificationsOpen) {
        setNotificationsOpen(false)
        return true
      }
      if (guideOpen) {
        setGuideOpen(false)
        return true
      }
      if (feedbackModal.open) {
        setFeedbackModal((prev) => ({ ...prev, open: false }))
        return true
      }
      if (resetOpen) {
        setResetOpen(false)
        return true
      }
      if (appUpdate && !appUpdate.required) {
        setAppUpdate(null)
        return true
      }
      if (mentorOpen) {
        closeMentor()
        return true
      }
      if (focusThread) {
        setFocusThread(null)
        return true
      }
      const home: ViewKey = accountRole === 'teacher' ? 'teacher' : 'student'
      if (view !== home) {
        navigate(home)
        return true
      }
      return false
    }
  })

  useEffect(() => {
    const shellWindow = window as typeof window & { __shishuoNativeBack?: () => boolean }
    shellWindow.__shishuoNativeBack = () => nativeBackRef.current()
    return () => {
      delete shellWindow.__shishuoNativeBack
    }
  }, [])

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
        accountOpen={accountOpen}
        onOpenAdmin={() => window.location.assign('/admin/')}
        onOpenMentor={openMentor}
        onNavigate={navigate}
        onOpenGuide={openGuide}
        onOpenFeedback={openFeedback}
        onRequestReset={() => setResetOpen(true)}
      >
        {accountOpen ? (
          <div className="page page-sheet-page">
            <AccountModal
              open={accountOpen}
              initialTab={accountTab}
              onClose={() => setAccountOpen(false)}
              onOpenFeedback={openFeedback}
              notify={notify}
            />
          </div>
        ) : null}
        {!accountOpen && view === 'student' && (
          <StudentView
            notify={notify}
            openFaq={openFaq}
            onNavigate={navigate}
            onOpenAccount={openAccount}
            onOpenMentor={openMentor}
            mentorRequest={mentorRequest}
            onMentorRequestHandled={mentorRequestHandled}
            courseRequest={courseRequest}
            onCourseRequestHandled={courseRequestHandled}
            wallRequest={wallRequest}
            onWallRequestHandled={wallRequestHandled}
            focusThreadId={focusThread}
            onFocusHandled={focusHandled}
            nativeCameraRequest={nativeCameraRequest}
            onNativeCameraHandled={nativeCameraHandled}
            incomingShare={incomingShare}
            onIncomingShareHandled={incomingShareHandled}
          />
        )}
        {!accountOpen && view === 'teacher' && (
          <TeacherView
            key={selectedTeacher.name}
            teacherName={selectedTeacher.name}
            notify={notify}
            openFaq={openFaq}
            openFaqEditor={openFaqEditor}
            onOpenBackup={() => setBackupOpen(true)}
            focusThreadId={focusThread}
            onFocusHandled={focusHandled}
          />
        )}
        {!accountOpen && view === 'schedule' && (
          <ScheduleView onOpenAccount={openAccount} notify={notify} />
        )}
        {!accountOpen && view === 'chaoxing' && <ChaoxingView />}
        {!accountOpen && view === 'knowledge' && (
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
        {!accountOpen && view === 'campus' && <CampusView role={role} notify={notify} />}
        {!accountOpen && view === 'insights' && (
          <InsightsView
            openFaq={openFaq}
            onGoTeacher={() => navigate('teacher')}
            teacherName={accountRole === 'teacher' ? selectedTeacher.name : undefined}
          />
        )}
        {!accountOpen && view === 'fandian' && <FandianView notify={notify} />}
        {!accountOpen && view === 'about' && (
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
        onSelectCourse={(courseId) => setCourseRequest({ id: Date.now(), courseId })}
        onEditMajor={() => {
          setMentorOpen(false)
          openAccount('identity')
        }}
      />

      {role === 'student' && !accountOpen && view !== 'about' && (
        <StudentAvatarWidget
          mood={mentorOpen ? 'happy' : 'idle'}
          mentorName={mentor.name}
          hint={nextClassHint}
          hidden={mentorOpen}
          onOpenMentor={() => openMentor()}
        />
      )}

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

      <FeedbackModal
        open={feedbackModal.open}
        initialTab={feedbackModal.tab}
        currentView={accountOpen ? 'account' : view}
        onClose={() => setFeedbackModal((prev) => ({ ...prev, open: false }))}
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

      <Modal
        open={Boolean(appUpdate)}
        onClose={() => {
          if (appUpdate && !appUpdate.required && updateProgress?.status !== 'downloading') {
            setAppUpdate(null)
          }
        }}
        eyebrow="客户端更新"
        title={appUpdate ? `发现新版本 v${appUpdate.latest.versionName}` : '发现新版本'}
        size="sm"
        footer={
          appUpdate && (
            <div className="modal-actions">
              {!appUpdate.required && updateProgress?.status !== 'downloading' && (
                <button
                  className="button button-ghost"
                  onClick={() => {
                    dismissUpdateVersion(appUpdate.latest.versionCode)
                    setAppUpdate(null)
                    setUpdateProgress(null)
                  }}
                >
                  本次忽略
                </button>
              )}
              {updateProgress?.status === 'permission_required' ? (
                <button
                  className="button button-primary"
                  onClick={() => void openNativeInstallPermissionSettings()}
                >
                  去开启安装权限
                </button>
              ) : appUpdate.signatureMismatch ? (
                <button
                  className="button button-primary"
                  onClick={async () => {
                    triggerHaptic('medium')
                    const url = new URL(
                      appUpdate.latest.downloadUrl,
                      window.location.origin,
                    ).href
                    await openExternalUrl(url)
                    notify('安装包下载完成后，请先卸载当前旧版再点击新安装包安装')
                  }}
                >
                  下载正式版安装包
                </button>
              ) : (
                <button
                  className="button button-primary"
                  disabled={
                    updateProgress?.status === 'downloading' ||
                    updateProgress?.status === 'verifying'
                  }
                  onClick={async () => {
                    triggerHaptic('medium')
                    setUpdateProgress({
                      status: 'downloading',
                      progress: 0,
                      downloadedBytes: 0,
                      totalBytes: 0,
                      message: '正在准备下载…',
                    })
                    const res = await downloadNativeUpdate(
                      appUpdate.latest.downloadUrl,
                      appUpdate.latest.versionName,
                      appUpdate.latest.fallbackUrl,
                    )
                    if (res.mode === 'browser') {
                      setUpdateProgress(null)
                      notify('当前旧版壳层需通过系统浏览器安装本次更新，升级后支持应用内直接更新', 'info')
                      if (!appUpdate.required) setAppUpdate(null)
                    } else if (res.mode === 'downloadManager') {
                      setUpdateProgress(null)
                      notify('已开始在系统通知栏下载安装包，完成后点击通知安装')
                      if (!appUpdate.required) setAppUpdate(null)
                    } else if (res.status === 'error') {
                      notify(res.message || '应用内下载失败，请重试', 'danger')
                    }
                  }}
                >
                  {updateProgress?.status === 'downloading'
                    ? updateProgress.progress >= 0
                      ? `下载中 ${updateProgress.progress}%`
                      : '下载中…'
                    : updateProgress?.status === 'verifying'
                      ? '校验中…'
                      : updateProgress?.status === 'installing'
                        ? '再次调起安装'
                        : '应用内立即更新'}
                </button>
              )}
            </div>
          )
        }
      >
        {appUpdate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="modal-copy">
              当前版本：v{appUpdate.current.versionName} ({appUpdate.current.versionCode}) →
              最新版：v{appUpdate.latest.versionName} ({appUpdate.latest.versionCode})
            </p>
            {appUpdate.signatureMismatch && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid var(--gold)',
                  background: 'var(--gold-soft)',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <strong>检测到签名变更（避免出现“安装失败 -7”）</strong>
                <br />
                你当前安装的是早期测试签名版（v{appUpdate.current.versionName}），与正式签名版不兼容，直接覆盖会被系统拦截。
                <br />
                请先点击下方按钮把正式版 APK 下载到手机，再<strong>卸载旧版师说</strong>并点击下载好的安装包完成安装；之后所有新版均可直接在 App 内一键覆盖升级。
              </div>
            )}
            <p className="modal-copy" style={{ whiteSpace: 'pre-line' }}>
              {appUpdate.latest.notes}
            </p>
            {updateProgress && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--line)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(4, updateProgress.progress >= 0 ? updateProgress.progress : 35)}%`,
                      background: 'var(--jade)',
                      transition: 'width 0.15s ease',
                    }}
                  />
                </div>
                <p className="modal-copy" style={{ fontSize: 12 }}>
                  {updateProgress.message}
                  {updateProgress.totalBytes > 0
                    ? `（${(updateProgress.downloadedBytes / 1048576).toFixed(2)} / ${(updateProgress.totalBytes / 1048576).toFixed(2)} MB）`
                    : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  )
}
