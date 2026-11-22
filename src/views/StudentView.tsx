import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Camera,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  Layers,
  Loader2,
  MessagesSquare,
  Paperclip,
  Plus,
  QrCode,
  Users,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { courseById, teacherByName } from '../data/seed'
import { mentorBriefForCourse } from '../data/mentor'
import {
  runsInWeek,
  studentCourses,
  teachingWeek,
  upcomingTodayClasses,
  useProfile,
} from '../lib/profile'
import {
  clusterClassroomThreads,
  findSimilarPendingGroup,
  groupPendingThreads,
  retrieve,
} from '../lib/engine'
import {
  answerWithExternalAI,
  errorMessage,
  extractQuestionFromImage,
  fetchAIStatus,
  type AIStatus,
} from '../lib/ai'
import {
  checkLocalTeachingRelevance,
  parseStudyQaResponse,
  reportInvalidQa,
  stripInvalidQaMarker,
} from '../lib/studyQaSkill'
import {
  ASK_FILE_ACCEPT,
  ASK_IMAGE_ACCEPT,
  fileExtension,
  formatFileSize,
  isImageFile,
  prepareAttachment,
} from '../lib/attachment'
import { uploadThreadImage } from '../lib/image'
import { isNativeApp, triggerHaptic } from '../lib/nativeShell'
import { nativePhotoDataUrlToFile, type NativePhotoFile } from '../lib/photoAccess'
import { useAttachmentConsent } from '../components/AttachmentConsent'
import { usePhotoAccess } from '../components/PhotoAccess'
import type {
  AnswerResult,
  Faq,
  FeedbackReason,
  Thread,
  ThreadAttachment,
  ThreadGroup,
  ViewKey,
} from '../types'
import {
  excerpt,
  formatRelative,
  formatWeekday,
  makeEscalationTitle,
  makeId,
  statusLabel,
  statusTone,
  truncate,
} from '../lib/utils'
import { AnswerCard } from '../components/AnswerCard'
import { CourseSelect } from '../components/CourseSelect'
import { EscalateModal } from '../components/EscalateModal'
import { FollowUpModal } from '../components/FollowUpModal'
import { JoinGroupModal } from '../components/JoinGroupModal'
import { MajorMentorStrip } from '../components/MajorMentor'
import { QuestionArchive } from '../components/QuestionArchive'
import { ReviewModal } from '../components/ReviewModal'
import { QuestionSelfCheckBar, QuestionSelfCheckModal } from '../components/QuestionSelfCheck'
import { TeachModal } from '../components/TeachModal'
import { ThreadDetailModal } from '../components/ThreadDetailModal'
import { StudentRail } from './student/StudentRail'
import { checkQuestionClarity, selfCheckTemplate } from '../lib/questionCheck'
import { DigitalAvatarBadge, DigitalAvatarSprite } from '../components/DigitalAvatar'
import {
  Badge,
  EmptyState,
  MathText,
  RichText,
} from '../components/ui'

interface StudentViewProps {
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  openFaq: (faqId: string) => void
  onNavigate: (view: ViewKey) => void
  onOpenAccount?: (tab: 'identity' | 'schedule' | 'scores' | 'teachers') => void
  onOpenMentor: (prompt?: string) => void
  mentorRequest?: { id: number; courseId: string; question: string } | null
  onMentorRequestHandled?: () => void
  courseRequest?: { id: number; courseId: string } | null
  onCourseRequestHandled?: () => void
  wallRequest?: { id: number; courseId: string; sessionId: string } | null
  onWallRequestHandled?: () => void
  focusThreadId?: string | null
  onFocusHandled?: () => void
  nativeCameraRequest?: number | null
  onNativeCameraHandled?: () => void
  incomingShare?: { id: number; text?: string; image?: NativePhotoFile } | null
  onIncomingShareHandled?: () => void
}

const suggestions: Record<string, string[]> = {
  ds: [
    '动态规划的状态转移方程怎么找？',
    '哈希表冲突有哪些解决办法？',
    'SPFA 判负环的原理是什么？',
  ],
  math: [
    '洛必达法则什么时候不能用？',
    '变上限积分函数怎么求导？',
    '定积分换元后上下限怎么变？',
    '极值和最值有什么区别？',
  ],
  net: ['TCP 三次握手为什么不是两次？', 'HTTP 和 HTTPS 的本质区别是什么？'],
  linalg: ['矩阵可对角化的条件是什么？', '线性方程组什么时候有解？', '行列式按行展开怎么用？'],
  prob: ['全概率公式和贝叶斯公式怎么用？', '正态分布怎么标准化和查表？', '极大似然估计怎么求？'],
  digital: ['卡诺图化简的步骤是什么？', '组合逻辑电路怎么设计？', '时序逻辑电路怎么分析？'],
  analog: ['静态工作点怎么算？', '负反馈组态怎么判断？', '虚短虚断什么时候能用？'],
  physics: ['高斯定理怎么选高斯面？', '薄膜干涉光程差怎么算？', '薛定谔方程怎么理解？'],
  os: ['进程调度算法怎么选？', '信号量 PV 怎么用？', '页面置换算法怎么算缺页？'],
  co: ['IEEE 754 浮点数怎么表示？', 'Cache 命中率怎么算？', '流水线加速比怎么算？'],
  c: ['指针和数组怎么区分？', '函数参数是怎么传的？', '字符串和字符数组怎么区分？'],
  discrete: ['主析取范式怎么求？', '等价关系和偏序关系怎么判？', '哈斯图怎么画？'],
  db: ['关系代数和 SQL 怎么对应？', '函数依赖和范式怎么判？', '连接查询怎么写？'],
  micro: ['供求均衡怎么分析？', '需求弹性怎么算？', '税收由谁承担？'],
  psych: ['实验法的变量怎么分？', '注意和知觉怎么区分？', '知觉特性怎么记？'],
  signals: ['卷积怎么算？', '傅里叶变换怎么理解？', '采样定理怎么用？'],
  circuit: ['节点电压法怎么列？', '戴维南定理怎么用？', '最大功率怎么求？'],
  control: ['稳定性怎么判？', '稳态误差怎么算？', '根轨迹怎么画？'],
  comm: ['模拟调制和数字调制怎么区分？', '误码率怎么算？', '匹配滤波器为什么最优？'],
  mechanics: ['受力分析怎么画？', '动量矩定理怎么用？', '虚位移原理怎么理解？'],
  dsp: ['DFT 和 FFT 怎么用？', 'IIR 和 FIR 怎么选？', '频谱泄漏怎么判？'],
  literature: ['古代文学史怎么按朝代梳理？', '诗经和楚辞怎么比较？', '唐诗和宋词有什么区别？'],
  law: ['犯罪构成怎么判断？', '正当防卫怎么认定？', '未遂和中止怎么区分？'],
  organic: ['有机反应机理怎么推？', '芳香性怎么判？', '苯环定位基怎么分？'],
  biochem: ['蛋白质结构层次怎么记？', '酶动力学怎么算？', '竞争性抑制怎么判？'],
  art: ['艺术的本质怎么答？', '艺术起源有哪些学说？', '艺术创作和鉴赏怎么分？'],
  arthistory: ['中国美术史时间线怎么记？', '书画和雕塑怎么比较？', '文人画和院体画有什么区别？'],
  materials: ['拉压杆应力怎么算？', '弯曲正应力怎么算？', '中性轴在哪？'],
  mechdesign: ['齿轮传动比怎么算？', '模数和中心距怎么定？', '轴承寿命怎么算？'],
  mcu: ['中断怎么配置？', '定时器初值怎么算？', '串口波特率怎么设？'],
  thermo: ['第一定律怎么用？', '熵变怎么算？', '卡诺效率怎么求？'],
  fluids: ['伯努利方程怎么用？', '雷诺数怎么判流态？', '沿程损失怎么算？'],
}

const questionExamples: Record<string, string> = {
  ds: '动态规划的状态转移方程怎么找？',
  math: '洛必达法则什么时候不能用？',
  net: 'TCP 三次握手为什么不是两次？',
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '上午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function StudentView({
  notify,
  openFaq,
  onNavigate,
  onOpenAccount,
  onOpenMentor,
  mentorRequest,
  onMentorRequestHandled,
  courseRequest,
  onCourseRequestHandled,
  wallRequest,
  onWallRequestHandled,
  focusThreadId,
  onFocusHandled,
  nativeCameraRequest,
  onNativeCameraHandled,
  incomingShare,
  onIncomingShareHandled,
}: StudentViewProps) {
  const { data, dispatch } = useStore()
  const { user } = useAuth()
  const { requestConsent } = useAttachmentConsent()
  const { pickImages, takePhoto } = usePhotoAccess()
  const studentId = user?.id ?? ''
  const profile = useProfile()
  const courses = useMemo(() => studentCourses(profile), [profile])
  const visibleCourseIds = new Set(courses.map((item) => item.id))
  const currentTeachingWeek = teachingWeek(profile.termStart)
  const classesOnToday = upcomingTodayClasses(profile)
  const todaysClasses = (
    currentTeachingWeek
      ? classesOnToday.filter((entry) => runsInWeek(entry.weeks, currentTeachingWeek))
      : classesOnToday
  ).filter((entry) => entry.matchedCourseId && visibleCourseIds.has(entry.matchedCourseId))
  const [courseId, setCourseId] = useState(() => {
    const todayCourse = todaysClasses[0]?.matchedCourseId
    if (todayCourse) return todayCourse
    if (courses.some((item) => item.id === profile.defaultCourseId)) return profile.defaultCourseId
    return courses[0]?.id ?? 'ds'
  })
  const [question, setQuestion] = useState('')
  // 默认匿名：同班同学只看到「一位同学」，实名需要学生主动选择。
  const [anonymous, setAnonymous] = useState(true)
  const [wallSessionId, setWallSessionId] = useState<string | null>(null)
  const [thinking, setThinking] = useState<{
    question: string
    step: number
    topTitle?: string
    mode?: 'local' | 'image' | 'document' | 'external'
  } | null>(null)
  const [streamPreview, setStreamPreview] = useState('')
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [attachment, setAttachment] = useState<ThreadAttachment | null>(null)
  const [attachmentVisible, setAttachmentVisible] = useState(true)
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [askPreview, setAskPreview] = useState<{
    faq?: Faq
    group?: ThreadGroup
  } | null>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [activeResult, setActiveResult] = useState<AnswerResult | null>(null)
  const [invalidNotice, setInvalidNotice] = useState<{
    question: string
    message: string
  } | null>(null)
  const [escalateOpen, setEscalateOpen] = useState(false)
  const [teachOpen, setTeachOpen] = useState(false)
  const [detailThreadId, setDetailThreadId] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [joinGroup, setJoinGroup] = useState<ThreadGroup | null>(null)
  const [followUpThread, setFollowUpThread] = useState<Thread | null>(null)
  const [selfCheckOpen, setSelfCheckOpen] = useState(false)
  const timers = useRef<number[]>([])
  const pendingPayload = useRef<{ thread: Thread; result: AnswerResult } | null>(null)
  const selfCheckBypass = useRef(false)
  const resultRef = useRef<HTMLDivElement>(null)
  const askCardRef = useRef<HTMLDivElement>(null)
  const askInputRef = useRef<HTMLTextAreaElement>(null)
  const lastMentorRequest = useRef<number | null>(null)

  const course = courseById(courseId)
  const courseTeacher = teacherByName(course.teacher)
  const courseNote = data.courseNotes?.find((note) => note.courseId === courseId)
  const activeWallNote = courseNote?.wallSession
  const activeWallTopic =
    activeWallNote?.topic || courseNote?.currentChapter || course.chapter || '本节随堂答疑'
  const wallThreads = useMemo(
    () =>
      wallSessionId
        ? data.threads.filter(
            (thread) =>
              !thread.withdrawnAt &&
              thread.courseId === courseId &&
              thread.wallSessionId === wallSessionId,
          )
        : [],
    [wallSessionId, courseId, data.threads],
  )
  const wallClusters = useMemo(
    () => (wallSessionId ? clusterClassroomThreads(wallThreads, courseId) : []),
    [wallSessionId, wallThreads, courseId],
  )
  const pendingGroupsForCourse = useMemo(
    () => groupPendingThreads(data.threads, courseId),
    [data.threads, courseId],
  )
  const aiReady = Boolean(aiStatus?.configured)
  const aiVision = Boolean(aiStatus?.vision)
  const questionCheck = useMemo(
    () => checkQuestionClarity(question, Boolean(attachment)),
    [question, attachment],
  )
  const activeThread = activeThreadId
    ? data.threads.find((thread) => thread.id === activeThreadId)
    : undefined
  const myThreads = useMemo(() => {
    const scoped = new Set(courses.map((item) => item.id))
    return data.threads
      .filter((thread) => thread.student.id === studentId && scoped.has(thread.courseId))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [courses, data.threads, studentId])
  const allWaitingGroups = useMemo(() => {
    const scoped = new Set(courses.map((item) => item.id))
    return groupPendingThreads(data.threads).filter(
      (group) => scoped.has(group.courseId) && group.primary.kind !== 'follow-up',
    )
  }, [data.threads, courses])
  const [threadFilter, setThreadFilter] = useState<
    'all' | 'waiting' | 'course-waiting' | 'needs-info' | 'replied' | 'resolved' | 'withdrawn'
  >('all')
  const [threadCourse, setThreadCourse] = useState('all')
  const threadsInFilter = useMemo(
    () =>
      myThreads.filter((thread) => {
        if (threadFilter === 'waiting') return thread.status === 'pending' && !thread.withdrawnAt
        if (threadFilter === 'needs-info')
          return thread.status === 'needs-info' && !thread.withdrawnAt
        if (threadFilter === 'replied')
          return thread.status === 'answered' && !thread.resolvedAt && !thread.withdrawnAt
        if (threadFilter === 'resolved') return Boolean(thread.resolvedAt)
        if (threadFilter === 'withdrawn') return Boolean(thread.withdrawnAt)
        return true
      }),
    [myThreads, threadFilter],
  )
  const filteredWaitingGroups = useMemo(
    () =>
      allWaitingGroups.filter(
        (group) => threadCourse === 'all' || group.courseId === threadCourse,
      ),
    [allWaitingGroups, threadCourse],
  )
  const threadCourseCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    if (threadFilter === 'course-waiting') {
      for (const group of allWaitingGroups) {
        counts[group.courseId] = (counts[group.courseId] ?? 0) + 1
      }
      return counts
    }
    for (const thread of threadsInFilter) {
      counts[thread.courseId] = (counts[thread.courseId] ?? 0) + 1
    }
    return counts
  }, [allWaitingGroups, threadFilter, threadsInFilter])
  const threadFilterCounts = useMemo(
    () => ({
      all: myThreads.length,
      waiting: myThreads.filter((thread) => thread.status === 'pending' && !thread.withdrawnAt)
        .length,
      'course-waiting': allWaitingGroups.length,
      'needs-info': myThreads.filter(
        (thread) => thread.status === 'needs-info' && !thread.withdrawnAt,
      ).length,
      replied: myThreads.filter(
        (thread) => thread.status === 'answered' && !thread.resolvedAt && !thread.withdrawnAt,
      ).length,
      resolved: myThreads.filter((thread) => thread.resolvedAt).length,
      withdrawn: myThreads.filter((thread) => thread.withdrawnAt).length,
    }),
    [myThreads, allWaitingGroups.length],
  )
  const recentThreads = useMemo(
    () =>
      threadsInFilter
        .filter((thread) => threadCourse === 'all' || thread.courseId === threadCourse)
        .slice(0, 5),
    [threadsInFilter, threadCourse],
  )
  const hotFaqs = useMemo(() => {
    const ids = new Set(courses.map((item) => item.id))
    return [...data.faqs]
      .filter((faq) => ids.has(faq.courseId))
      .sort((a, b) => b.citations - a.citations)
      .slice(0, 4)
  }, [data.faqs, courses])
  const courseFaqCount = data.faqs.filter((faq) => faq.courseId === courseId).length

  useEffect(() => {
    const todayCourse = todaysClasses.find((entry) => entry.matchedCourseId)?.matchedCourseId
    if (todayCourse) setCourseId(todayCourse)
    // Switch to today's real class only after the timetable is saved, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.scheduleSyncedAt])

  useEffect(() => {
    if (courses.some((item) => item.id === courseId)) return
    const todayCourse = todaysClasses.find((entry) => entry.matchedCourseId)?.matchedCourseId
    setCourseId(todayCourse ?? courses[0]?.id ?? 'ds')
  }, [courseId, courses, todaysClasses])

  useEffect(() => {
    if (!attachMenuOpen) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!attachMenuRef.current?.contains(event.target as Node)) {
        setAttachMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAttachMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown, { passive: true })
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [attachMenuOpen])

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer))
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    void fetchAIStatus()
      .then((status) => {
        if (!cancelled) setAiStatus(status)
      })
      .catch(() => {
        if (!cancelled) setAiStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const clearTimers = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
  }

  useEffect(() => {
    if (!focusThreadId) return
    if (!data.threads.some((thread) => thread.id === focusThreadId)) return
    setDetailThreadId(focusThreadId)
    onFocusHandled?.()
  }, [focusThreadId, data.threads, onFocusHandled])

  useEffect(() => {
    const text = question.trim()
    if (thinking || text.length < 5) {
      setAskPreview(null)
      return
    }
    const timer = window.setTimeout(() => {
      const result = retrieve(data.faqs, text, courseId, courseNote?.currentChapter)
      const faq = result.matches.find((match) => match.score >= 0.26)?.faq
      const similar = findSimilarPendingGroup(data.threads, text, courseId)
      const group = similar?.primary.kind === 'follow-up' ? undefined : similar
      setAskPreview(faq || group ? { faq, group } : null)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [question, thinking, courseId, courseNote?.currentChapter, data.faqs, data.threads])

  const changeCourse = (nextId: string) => {
    if (thinking) {
      notify('等 AI 把这道题处理完再切换课程', 'info')
      return
    }
    setCourseId(nextId)
    setWallSessionId(null)
    setQuestion('')
    setActiveThreadId(null)
    setActiveResult(null)
    setInvalidNotice(null)
    setEscalateOpen(false)
    setTeachOpen(false)
    setSelfCheckOpen(false)
    selfCheckBypass.current = false
  }

  const focusAskCard = () => {
    window.setTimeout(() => {
      askCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      askInputRef.current?.focus()
    }, 120)
  }

  useEffect(() => {
    if (!mentorRequest || lastMentorRequest.current === mentorRequest.id) return
    lastMentorRequest.current = mentorRequest.id
    if (thinking) {
      notify('等 AI 把这道题处理完再切换课程', 'info')
      onMentorRequestHandled?.()
      return
    }
    const nextCourse = courseById(mentorRequest.courseId)
    setCourseId(mentorRequest.courseId)
    setQuestion(mentorRequest.question)
    setAttachment(null)
    setActiveThreadId(null)
    setActiveResult(null)
    setInvalidNotice(null)
    setEscalateOpen(false)
    setTeachOpen(false)
    notify(
      mentorRequest.question
        ? `已切到《${nextCourse.shortName}》，问题已放进输入框`
        : `已切到《${nextCourse.shortName}》`,
      'info',
    )
    focusAskCard()
    onMentorRequestHandled?.()
    // focusAskCard is recreated each render; the request id is the dedupe key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorRequest, thinking, notify, onMentorRequestHandled])

  useEffect(() => {
    if (!courseRequest) return
    changeCourse(courseRequest.courseId)
    onCourseRequestHandled?.()
    // courseRequest.id 是去重键；changeCourse 每次渲染都会重建，不放进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseRequest, onCourseRequestHandled])

  const lastWallReq = useRef<number | null>(null)
  useEffect(() => {
    if (!wallRequest || lastWallReq.current === wallRequest.id) return
    lastWallReq.current = wallRequest.id
    if (courses.some((item) => item.id === wallRequest.courseId)) {
      setCourseId(wallRequest.courseId)
    }
    setWallSessionId(wallRequest.sessionId)
    setAnonymous(true)
    setActiveThreadId(null)
    setActiveResult(null)
    notify('已进入「本节提问墙」，提交自动匿名并由 AI 先行应答', 'info')
    focusAskCard()
    onWallRequestHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallRequest, courses, onWallRequestHandled])

  const chooseImage = async () => {
    if (thinking || attachmentBusy) return
    const result = await pickImages({ multiple: false })
    if (result === 'fallback') {
      imageInputRef.current?.click()
      return
    }
    if (result?.length) {
      triggerHaptic('light')
      await attachFile(result[0], { skipConsent: true })
    }
  }

  const capturePhoto = async () => {
    if (thinking || attachmentBusy) return
    const result = await takePhoto()
    if (result === 'unavailable') {
      // 旧版 APK 或不支持原生相机桥的设备：自动回退到带 capture="environment" 的系统拍照选择器。
      cameraInputRef.current?.click()
      return
    }
    if (result) {
      triggerHaptic('light')
      await attachFile(result, { skipConsent: true })
      focusAskCard()
    }
  }

  const lastCameraReq = useRef<number | null>(null)
  useEffect(() => {
    if (!nativeCameraRequest || lastCameraReq.current === nativeCameraRequest) return
    lastCameraReq.current = nativeCameraRequest
    onNativeCameraHandled?.()
    focusAskCard()
    void capturePhoto()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeCameraRequest, onNativeCameraHandled])

  const lastShareId = useRef<number | null>(null)
  useEffect(() => {
    if (!incomingShare || lastShareId.current === incomingShare.id) return
    lastShareId.current = incomingShare.id
    onIncomingShareHandled?.()
    focusAskCard()
    if (incomingShare.text) {
      setQuestion((prev) => (prev.trim() ? `${prev.trim()}\n${incomingShare.text}` : incomingShare.text!))
    }
    if (incomingShare.image) {
      void nativePhotoDataUrlToFile(incomingShare.image)
        .then((file) => attachFile(file, { skipConsent: true }))
        .catch(() => notify('读取分享的图片失败，请重试', 'danger'))
    } else if (incomingShare.text) {
      notify('已把分享的文字放进提问框', 'info')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingShare, onIncomingShareHandled])

  const chooseFile = () => {
    if (thinking || attachmentBusy) return
    fileInputRef.current?.click()
  }

  /** 图片和资料共用：先过隐私授权门，再压缩上传或本地解析。 */
  const attachFile = async (file: File, options?: { skipConsent?: boolean }) => {
    if (thinking || attachmentBusy) return
    const image = isImageFile(file)
    let teacherVisible = attachmentVisible
    if (!options?.skipConsent) {
      const consent = await requestConsent({
        scene: 'student-ask',
        kind: image ? 'image' : 'file',
        fileNames: [file.name],
        totalBytes: file.size,
        allowTeacherVisibleToggle: image,
        defaultTeacherVisible: attachmentVisible,
      })
      if (!consent) return
      teacherVisible = image ? consent.teacherVisible : true
    }
    setAttachmentBusy(true)
    try {
      const prepared = await prepareAttachment(file)
      setAttachment(prepared)
      setAttachmentVisible(image ? teacherVisible : true)
      notify(
        prepared.kind === 'image'
          ? teacherVisible
            ? '图片已上传，任课老师可以看到原图'
            : '图片已上传，仅用于 AI 识别，老师看不到原图'
          : `已读取《${prepared.name}》，发送后会交给 AI 分析`,
      )
    } catch (error) {
      notify(errorMessage(error), 'danger')
    } finally {
      setAttachmentBusy(false)
    }
  }

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await attachFile(file, { skipConsent: isNativeApp() })
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await attachFile(file)
  }

  /** 支持把截图直接粘贴进问题框（Ctrl+V / 右键粘贴）。 */
  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (thinking || attachmentBusy) return
    const image = Array.from(event.clipboardData?.files ?? []).find((file) =>
      file.type.startsWith('image/'),
    )
    if (!image) return
    event.preventDefault()
    void attachFile(image)
  }

  const handleAskDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    if (!thinking && !attachmentBusy) setDragActive(true)
  }

  const handleAskDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    if (!thinking && !attachmentBusy) setDragActive(true)
  }

  const handleAskDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDragActive(false)
  }

  const handleAskDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void attachFile(file)
  }

  const localContextFor = (result: AnswerResult) =>
    result.matches
      .slice(0, 2)
      .map((match) => `Q: ${match.faq.question}\nA: ${match.faq.answer.slice(0, 600)}`)
      .join('\n\n')

  const ask = async () => {
    if (thinking || attachmentBusy) return
    const documentAttachment = attachment?.kind === 'document' ? attachment : undefined
    let text = question.trim()

    // Image-only input: let the server vision model extract the question first.
    if (!text && attachment && !documentAttachment) {
      if (!aiReady || !aiVision) {
        notify(
          !aiReady
            ? '请先输入题目；服务端 AI 就绪后可以直接识别图片'
            : '当前模型未开启图片识别，请管理员在管理端打开「模型支持图片识别」',
          'info',
        )
        return
      }
      setThinking({
        question: attachment.name,
        step: 1,
        topTitle: aiStatus?.model ?? '服务端 AI',
        mode: 'image',
      })
      try {
        if (!attachment.dataUrl) throw new Error('图片还没有准备好，请重新选择。')
        const extracted = await extractQuestionFromImage(attachment.dataUrl)
        setQuestion(extracted)
        setThinking(null)
        notify('已识别题目，请确认后发送')
      } catch (error) {
        setThinking(null)
        notify(errorMessage(error), 'danger')
      }
      return
    }

    // File-only input: ask the AI to analyse the document, or hand it to the teacher.
    if (!text && documentAttachment) {
      const extracted = documentAttachment.text?.trim()
      if (!extracted) {
        notify('没有读到文件内容，请换成 PDF / DOCX / TXT，或把关键页截图粘贴进来', 'danger')
        return
      }
      text = aiReady
        ? `请分析这份文件《${documentAttachment.name}》，提炼重点、考点和容易出错的地方。`
        : `请老师帮我看看这份文件《${documentAttachment.name}》。`
    }

    if (!text) return
    triggerHaptic('medium')

    // 第一道过滤：本地快速检测与教学无关的内容（乱码、纯数字、闲聊、生活琐事等）
    // 命中后直接提示无关，不进入问答记录与「我的提问」，并上报后台标记为无效问答。
    const localRelevance = checkLocalTeachingRelevance(text, {
      hasAttachment: Boolean(attachment),
      courseName: course.name,
    })
    if (localRelevance.invalid) {
      setQuestion('')
      setActiveThreadId(null)
      setActiveResult(null)
      setInvalidNotice({ question: text, message: localRelevance.notice })
      notify('检测到与课程教学无关的内容，未计入提问记录', 'info')
      void reportInvalidQa({
        source: 'ask',
        courseId,
        courseName: course.name,
        question: text,
        reason: localRelevance.reason,
        reply: localRelevance.notice,
      })
      return
    }
    setInvalidNotice(null)

    // AI 就绪时跳过自检，让低置信问题直接走服务端 AI 补充，而不是被自检弹窗拦住。
    if (!questionCheck.ok && !selfCheckBypass.current && !aiReady) {
      setSelfCheckOpen(true)
      return
    }
    selfCheckBypass.current = false

    let storedAttachment: ThreadAttachment | undefined
    if (documentAttachment) {
      // 文档正文只用于本轮 AI 分析，线程里只留摘要，避免状态库膨胀。
      storedAttachment = {
        name: documentAttachment.name,
        type: documentAttachment.type,
        kind: 'document',
        size: documentAttachment.size,
        excerpt: documentAttachment.excerpt ?? documentAttachment.text?.slice(0, 1_200),
      }
    } else if (attachment) {
      try {
        const uploaded = await uploadThreadImage(attachment)
        storedAttachment = {
          ...uploaded,
          kind: 'image',
          size: attachment.size,
          teacherVisible: attachmentVisible,
        }
      } catch (error) {
        notify(`图片上传失败：${errorMessage(error)}`, 'danger')
        return
      }
    }

    const result = retrieve(data.faqs, text, courseId, courseNote?.currentChapter)
    // 有文件时以文件内容为准，直接走服务端 AI 分析，避免课程库里的相近条目答非所问。
    if (documentAttachment && aiReady) {
      result.confidence = 'low'
      result.score = Math.min(result.score, 0.2)
      result.reason = '学生上传了文件，交给服务端 AI 结合文件内容分析。'
    }
    const submitAnonymous = wallSessionId ? true : anonymous
    const thread: Thread = {
      id: makeId('t'),
      courseId,
      student: { id: studentId, name: profile.name, anonymous: submitAnonymous },
      question: text,
      createdAt: Date.now(),
      status: 'ai',
      aiAnswer: result.answer,
      confidence: result.confidence,
      confidenceScore: result.score,
      sources: result.sourceIds,
      closestSource: result.closestSource,
      attachment: storedAttachment,
      feedback: null,
      ...(wallSessionId ? { wallSessionId, wallTopic: activeWallTopic } : {}),
    }

    pendingPayload.current = { thread, result }
    setThinking({
      question: text,
      step: 0,
      topTitle: documentAttachment
        ? '文件分析'
        : result.confidence === 'low'
          ? undefined
          : result.top?.faq.question,
      mode: documentAttachment ? 'document' : 'local',
    })
    setQuestion('')
    setAttachment(null)
    setAttachmentVisible(true)
    setActiveThreadId(null)
    setActiveResult(null)
    setInvalidNotice(null)
    setEscalateOpen(false)
    setTeachOpen(false)
    clearTimers()

    ;[1, 2, 3].forEach((step, index) => {
      timers.current.push(
        window.setTimeout(
          () =>
            setThinking((current) => (current ? { ...current, step } : current)),
          420 + index * 470,
        ),
      )
    })

    timers.current.push(
      window.setTimeout(async () => {
        const payload = pendingPayload.current
        if (!payload) return
        const { thread, result } = payload
        const threadCourse = courseById(thread.courseId)

        const finish = () => {
          setActiveThreadId(thread.id)
          setActiveResult(result)
          setThinking(null)
          pendingPayload.current = null
          window.setTimeout(() => {
            resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, 60)
        }

        const escalateToTeacher = () => {
          const similarGroup = findSimilarPendingGroup(
            data.threads,
            thread.question,
            thread.courseId,
            thread.id,
          )
          if (similarGroup) thread.clusterId = similarGroup.key
          dispatch({
            type: 'thread-created',
            thread,
            aiSolved: false,
            citedFaqIds: result.sourceIds,
          })
          dispatch({
            type: 'escalated',
            threadId: thread.id,
            escalation: {
              title: makeEscalationTitle(thread.question),
              note: 'AI 没有找到足够可靠的依据，自动转交。',
              anonymous: thread.student.anonymous,
              urgency: 'week',
              at: Date.now(),
              auto: true,
            },
            clusterId: similarGroup?.key,
            joinedExistingGroup: Boolean(similarGroup),
          })
          notify(
            similarGroup
              ? `AI 没把握，已自动并入同题组，${threadCourse.teacher}老师会一起回复`
              : `AI 没把握，已自动转交${threadCourse.teacher}老师`,
          )
        }

        if (result.confidence === 'low' && aiReady) {
          setThinking((current) =>
            current ? { ...current, step: 4, mode: 'external' } : current,
          )
          setStreamPreview('')
          try {
            const external = await answerWithExternalAI({
              question: thread.question,
              courseName: threadCourse.name,
              localContext: localContextFor(result),
              mentorBrief: mentorBriefForCourse(threadCourse.id),
              imageDataUrl:
                aiVision && attachment?.kind !== 'document' ? attachment?.dataUrl : undefined,
              documentText: documentAttachment?.text,
              documentName: documentAttachment?.name,
              knowledgeFiles: result.matches[0]?.faq.attachments,
              onUpdate: (partial) => setStreamPreview(stripInvalidQaMarker(partial)),
            })
            const parsed = parseStudyQaResponse(external.text)
            if (parsed.invalid) {
              setThinking(null)
              pendingPayload.current = null
              setActiveThreadId(null)
              setActiveResult(null)
              setInvalidNotice({
                question: thread.question,
                message: parsed.cleanText,
              })
              notify('检测到与课程教学无关的内容，未计入提问记录', 'info')
              void reportInvalidQa({
                source: 'ask',
                courseId: thread.courseId,
                courseName: threadCourse.name,
                question: thread.question,
                reason: parsed.reason,
                reply: parsed.cleanText,
              })
              return
            }
            thread.externalAnswer = {
              text: parsed.cleanText,
              model: external.model || aiStatus?.model || '服务端 AI',
              at: Date.now(),
            }
            dispatch({
              type: 'thread-created',
              thread,
              aiSolved: true,
              citedFaqIds: result.sourceIds,
            })
            notify('服务端 AI 已补充；需要权威结论时可转交老师', 'info')
          } catch (error) {
            escalateToTeacher()
            notify(
              `服务端 AI 未补充（${truncate(errorMessage(error), 52)}），已转交老师`,
              'danger',
            )
          } finally {
            setStreamPreview('')
          }
          finish()
          return
        }

        if (result.confidence === 'low') {
          escalateToTeacher()
          finish()
          return
        }

        dispatch({
          type: 'thread-created',
          thread,
          aiSolved: true,
          citedFaqIds: result.sourceIds,
        })
        finish()
      }, 1_950),
    )
  }

  const feedbackThread = (
    thread: Thread,
    feedback: 'helpful' | 'unhelpful',
    reason?: FeedbackReason | null,
  ) => {
    dispatch({ type: 'feedback', threadId: thread.id, feedback, reason })
    notify(
      feedback === 'helpful'
        ? '已记录，这条知识会更有信心被 AI 引用'
        : '已记录。同一答案再收到一次负反馈，AI 就会自动标记待完善并通知老师',
      'success',
    )
  }

  const giveFeedback = (feedback: 'helpful' | 'unhelpful') => {
    if (!activeThread) return
    feedbackThread(activeThread, feedback)
  }

  const giveFeedbackReason = (reason: FeedbackReason | null) => {
    if (!activeThread) return
    feedbackThread(activeThread, 'unhelpful', reason)
  }

  const resolveThread = (thread: Thread, resolved: boolean) => {
    dispatch({ type: 'thread-resolved', threadId: thread.id, resolved })
    notify(
      resolved ? '已确认解决，这条记录会计入答疑洞察' : '已撤销「已解决」确认',
      resolved ? 'success' : 'info',
    )
  }

  /** 课程问答的连续追问：带着原问题和已给出的回答，再检索一次知识库交给导师。 */
  const followUpChat = async (
    thread: Thread,
    followUp: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) => {
    if (!aiReady) throw new Error('服务端 AI 未配置，暂时不能继续对话。')
    const threadCourse = courseById(thread.courseId)
    const localCheck = checkLocalTeachingRelevance(followUp, {
      courseName: threadCourse.name,
    })
    if (localCheck.invalid) {
      void reportInvalidQa({
        source: 'follow-up',
        courseId: thread.courseId,
        courseName: threadCourse.name,
        question: followUp,
        reason: localCheck.reason,
        reply: localCheck.notice,
      })
      throw new Error(localCheck.notice)
    }
    const result = retrieve(
      data.faqs,
      followUp,
      thread.courseId,
      data.courseNotes?.find((note) => note.courseId === thread.courseId)?.currentChapter,
    )
    const sourceFaq = data.faqs.find((faq) => faq.id === thread.sources?.[0])
    const localContext = result.matches
      .slice(0, 2)
      .map((match) => `Q: ${match.faq.question}\nA: ${match.faq.answer.slice(0, 600)}`)
      .join('\n\n')
    const external = await answerWithExternalAI({
      question: followUp,
      courseName: threadCourse.name,
      localContext,
      mentorBrief: mentorBriefForCourse(thread.courseId),
      knowledgeFiles: sourceFaq?.attachments,
      history,
    })
    const parsed = parseStudyQaResponse(external.text)
    if (parsed.invalid) {
      void reportInvalidQa({
        source: 'follow-up',
        courseId: thread.courseId,
        courseName: threadCourse.name,
        question: followUp,
        reason: parsed.reason,
        reply: parsed.cleanText,
      })
      throw new Error(parsed.cleanText)
    }
    return { text: parsed.cleanText, model: external.model }
  }

  const withdrawThread = (thread: Thread, withdrawn: boolean) => {
    dispatch({ type: 'thread-withdrawn', threadId: thread.id, withdrawn })
    notify(
      withdrawn
        ? thread.status === 'pending'
          ? '已撤下，老师的待办里不再排这条；随时可以在记录里重新发起'
          : '已撤下这条记录'
        : '已重新发起，问题回到老师待办',
      withdrawn ? 'info' : 'success',
    )
  }

  const supplementThread = (thread: Thread, text: string) => {
    dispatch({
      type: 'thread-supplemented',
      threadId: thread.id,
      supplement: { text, at: Date.now() },
    })
    notify('已补充给老师，问题回到待办', 'success')
  }

  const now = new Date()
  const dateLabel = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${formatWeekday(now.getTime())}`
  const suggestionsForCourse = suggestions[courseId] ?? [
    `「${course.shortName}」最近讲的哪里没听懂？`,
    '能帮我梳理一下这节课的重点吗？',
    '这道题的思路应该从哪里下手？',
  ]
  const thinkingSteps = thinking
    ? thinking.mode === 'image'
      ? ['读取图片', '识别题干与公式（服务端 AI）', '写回问题框等你确认']
      : thinking.mode === 'document'
        ? ['读取文件内容', '整理结构、重点与考点（服务端 AI）', '结合课程要求生成分析']
        : [
            '理解问题，提取课程概念',
            `检索「${course.shortName}」知识库 · ${courseFaqCount} 条`,
            thinking.topTitle ? `比对知识：${truncate(thinking.topTitle, 20)}` : '比对同题与历史答疑',
            '校准置信度，决定是否打扰老师',
            ...(thinking.mode === 'external' ? ['课程库没把握，调用服务端 AI 补充'] : []),
          ]
    : []
  const thinkingTitle =
    thinking?.mode === 'image'
      ? '正在识别图片里的题目。'
      : thinking?.mode === 'document'
        ? '正在读你上传的文件，准备交给 AI 分析。'
        : thinking?.mode === 'external'
          ? '课程知识库没把握，正在用服务端 AI 补充。'
          : '先查知识库，再决定要不要麻烦老师。'
  const askSubmitLabel = thinking
    ? thinking.mode === 'image'
      ? '识别中'
      : thinking.mode === 'document'
        ? '分析中'
        : thinking.mode === 'external'
          ? 'AI 补充中'
          : 'AI 正在查'
    : !question.trim() && attachment
      ? attachment.kind === 'document'
        ? aiReady
          ? '分析文件'
          : '交给老师'
        : '识别题目'
      : '交给 AI'

  return (
    <div className="page student-page">
      <header className="student-head">
        <div className="student-head-main">
          <div className="eyebrow">
            <span className="eyebrow-mark" />
            {dateLabel}
            <span className="eyebrow-sep">/</span>
            {course.name}
            {course.code ? ` · ${course.code}` : ''}
          </div>
          <h1 className="display-title">
            {greeting()}，{profile.name} <span>卡住的地方，先丢过来</span>
          </h1>
        </div>

      </header>

      <div className="course-switch-row">
        <CourseSelect
          courses={courses}
          value={courseId}
          onChange={changeCourse}
          disabled={Boolean(thinking)}
        />
        <div className="course-switch-side">
          <div className="course-switch-actions">
            <button
              className="course-timetable-button"
              onClick={() => onNavigate('schedule')}
              aria-label={profile.schedule.length > 0 ? '查看课程表' : '添加课程表'}
            >
              <CalendarDays size={15} />
              <span className="course-timetable-label">
                {profile.schedule.length > 0 ? '课程表' : '添加课程表'}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="student-layout">
        <section className="student-main">
          <div className="mentor-mobile-entry">
            <MajorMentorStrip
              profile={profile}
              courseId={courseId}
              data={data}
              onOpen={onOpenMentor}
              onSelectCourse={changeCourse}
              onEditMajor={() => onOpenAccount?.('identity')}
            />
          </div>
          {wallSessionId ? (
            <div className="student-wall-banner is-active">
              <span className="student-wall-icon">
                <QrCode size={16} />
              </span>
              <div className="student-wall-copy">
                <strong>
                  本节提问墙 · {activeWallTopic}
                </strong>
                <span>
                  匿名保护已锁定 · AI 先行应答，拿不准的自动合并进老师待办合集（已收 {wallThreads.length} 人次 / {wallClusters.length} 类）
                </span>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => setWallSessionId(null)}
              >
                退出提问墙
              </button>
            </div>
          ) : (
            activeWallNote?.active && (
              <button
                type="button"
                className="student-wall-banner"
                onClick={() => {
                  setWallSessionId(activeWallNote.id)
                  setAnonymous(true)
                  focusAskCard()
                }}
              >
                <span className="student-wall-icon">
                  <QrCode size={16} />
                </span>
                <div className="student-wall-copy">
                  <strong>{course.teacher}老师开启了「本节提问墙」· {activeWallNote.topic}</strong>
                  <span>下课前 3 分钟匿名提交卡点，AI 先答，未解决的自动并入老师待办</span>
                </div>
                <span className="student-wall-enter">
                  进入提问墙
                  <ArrowRight size={14} />
                </span>
              </button>
            )
          )}
          <div
            ref={askCardRef}
            className={`ask-card${dragActive ? ' is-dragging' : ''}`}
            onDragEnter={handleAskDragEnter}
            onDragOver={handleAskDragOver}
            onDragLeave={handleAskDragLeave}
            onDrop={handleAskDrop}
          >
            <div className="ask-card-bg" aria-hidden="true">
              <div className="ask-card-glow" />
            </div>
            {dragActive && (
              <div className="ask-drop-hint" aria-hidden="true">
                <Paperclip size={22} />
                <strong>松手拖入照片或文件即可上传</strong>
                <span>支持图片、PDF、Word、PPT、Excel 和文本</span>
              </div>
            )}
            <div className="ask-head">
              <div className="ask-identity">
                <DigitalAvatarBadge mood={thinking ? 'thinking' : 'idle'} size={34} />
                <div>
                  <strong>问 AI 助教</strong>
                </div>
              </div>
              {courseNote?.currentChapter && (
                <span className="ask-progress-hint">
                  本周进度 · {courseNote.currentChapter}
                </span>
              )}
            </div>

            <textarea
              ref={askInputRef}
              className="ask-input"
              data-tab-fill={questionExamples[courseId] ?? `「${course.shortName}」哪里没听懂？`}
              data-enter-submit
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  ask()
                }
              }}
              placeholder={
                questionExamples[courseId]
                  ? `例如：${questionExamples[courseId]}`
                  : `问一个「${course.shortName}」的问题… 可直接粘贴截图，或上传课件 / 作业文件`
              }
              rows={3}
              disabled={Boolean(thinking) || attachmentBusy}
              aria-label="输入你的问题，可粘贴截图"
            />
            {question.trim() && /\\\(|\\\[|\$/.test(question) && (
              <div className="ask-math-preview">
                <span className="ask-math-preview-label">公式预览</span>
                <MathText text={question} />
              </div>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept={ASK_IMAGE_ACCEPT}
              onChange={handleImageChange}
              hidden
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageChange}
              hidden
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={ASK_FILE_ACCEPT}
              onChange={handleFileChange}
              hidden
            />

            {askPreview && (
              <div className="ask-preview">
                {askPreview.faq && (
                  <button
                    className="ask-preview-faq"
                    onClick={() => openFaq(askPreview.faq!.id)}
                  >
                    <BookOpen size={15} />
                    <span className="ask-preview-copy">
                      <strong>知识库已有相近答案</strong>
                      <em>{truncate(askPreview.faq.question, 32)}</em>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                )}
                {askPreview.group && (
                  <div className="ask-preview-pending">
                    <Users size={15} />
                    <span className="ask-preview-copy">
                      <strong>已有 {askPreview.group.count} 位同学在等</strong>
                      <em>{truncate(askPreview.group.title, 26)}</em>
                    </span>
                    {askPreview.group.threads.some(
                      (item) => item.student.id === studentId,
                    ) ? (
                      <span className="ask-preview-joined">已在等</span>
                    ) : (
                      <button
                        className="same-button"
                        onClick={() => setJoinGroup(askPreview.group ?? null)}
                      >
                        同问
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {attachment && (
              <div
                className={`ask-attachment${attachment.kind === 'document' ? ' is-document' : ''}`}
              >
                {attachment.kind === 'document' ? (
                  <span className="ask-attachment-file" aria-hidden="true">
                    <FileText size={20} />
                    <em>{fileExtension(attachment.name).toUpperCase().slice(0, 4) || 'FILE'}</em>
                  </span>
                ) : (
                  <img
                    src={attachment.url ?? attachment.dataUrl ?? ''}
                    alt="题目图片预览"
                  />
                )}
                <div className="ask-attachment-copy">
                  <strong>{attachment.name}</strong>
                  <span>
                    {attachment.kind === 'document'
                      ? `${formatFileSize(attachment.size)}${
                          attachment.text
                            ? ` · 已读取 ${attachment.text.length.toLocaleString()} 字`
                            : ''
                        }${aiReady ? '；发送后交给 AI 分析' : '；服务端 AI 就绪后可分析'}`
                      : !attachmentVisible
                        ? '仅用于 AI 识别，任课老师与同班同学看不到原图'
                        : aiReady && aiVision
                          ? '模型会识别题图和题面；图片也会随问题给老师看'
                          : aiReady
                            ? '图片会随问题给老师看；当前模型未开启图片识别'
                            : '图片会随问题给老师看；服务端 AI 就绪后可自动识别'}
                  </span>
                </div>
                <button
                  className="ask-attachment-remove"
                  onClick={() => setAttachment(null)}
                  aria-label={attachment.kind === 'document' ? '移除文件' : '移除图片'}
                  type="button"
                >
                  <X size={15} />
                </button>
                {attachment.kind === 'document' ? (
                  <p className="ask-attachment-excerpt">
                    {attachment.excerpt?.slice(0, 200) ?? ''}
                    {(attachment.excerpt?.length ?? 0) > 200 ? '…' : ''}
                  </p>
                ) : (
                  <label className="ask-attachment-privacy">
                    <input
                      type="checkbox"
                      checked={attachmentVisible}
                      onChange={(event) => setAttachmentVisible(event.target.checked)}
                    />
                    <span>
                      允许老师查看原图
                      <em>
                        {attachmentVisible
                          ? '老师可在本题里看到这张图'
                          : '只用于 AI 识别，老师看不到原图'}
                      </em>
                    </span>
                  </label>
                )}
              </div>
            )}

            {!aiReady && question.trim().length >= 3 && (
              <QuestionSelfCheckBar
                check={questionCheck}
                onOpen={() => setSelfCheckOpen(true)}
              />
            )}

            <div className="ask-suggestions">
              {suggestionsForCourse.map((suggestion) => (
                <button
                  key={suggestion}
                  className="suggestion-chip"
                  onClick={() => setQuestion(suggestion)}
                  disabled={Boolean(thinking)}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="ask-foot">
              <div className="ask-tools">
                <div className="ask-plus-wrap" ref={attachMenuRef}>
                  <button
                    className={`ask-plus-button${attachMenuOpen ? ' is-open' : ''}`}
                    onClick={() => setAttachMenuOpen((open) => !open)}
                    disabled={Boolean(thinking) || attachmentBusy}
                    type="button"
                    aria-label="添加照片或文件"
                    aria-expanded={attachMenuOpen}
                    aria-haspopup="menu"
                    title="上传照片或文件（也支持直接拖入输入框）"
                  >
                    {attachmentBusy ? (
                      <Loader2 size={16} className="spin-icon" />
                    ) : (
                      <Plus size={18} />
                    )}
                  </button>
                  {attachMenuOpen && (
                    <div className="ask-plus-menu" role="menu" aria-label="选择上传方式">
                      {isNativeApp() && (
                        <button
                          type="button"
                          role="menuitem"
                          className="ask-plus-option"
                          onClick={() => {
                            setAttachMenuOpen(false)
                            void capturePhoto()
                          }}
                        >
                          <Camera size={15} />
                          <span>拍照识题</span>
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        className="ask-plus-option"
                        onClick={() => {
                          setAttachMenuOpen(false)
                          void chooseImage()
                        }}
                      >
                        <ImagePlus size={15} />
                        <span>选择照片</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="ask-plus-option"
                        onClick={() => {
                          setAttachMenuOpen(false)
                          chooseFile()
                        }}
                      >
                        <Paperclip size={15} />
                        <span>选择文件</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="ask-foot-right">
                <button
                  className={`anon-toggle ${wallSessionId || anonymous ? 'is-active' : ''}`}
                  onClick={() => {
                    if (wallSessionId) {
                      notify('「本节提问墙」默认开启匿名保护', 'info')
                      return
                    }
                    setAnonymous(!anonymous)
                  }}
                  type="button"
                  aria-pressed={Boolean(wallSessionId) || anonymous}
                >
                  {wallSessionId || anonymous ? <EyeOff size={15} /> : <Eye size={15} />}
                  <span>
                    {wallSessionId ? '提问墙匿名保护' : anonymous ? '匿名提问' : '实名提问'}
                  </span>
                  <span className="switch-track">
                    <span />
                  </span>
                </button>
                <button
                  className="button button-primary ask-submit"
                  onClick={ask}
                  disabled={(!question.trim() && !attachment) || Boolean(thinking) || attachmentBusy}
                >
                  {askSubmitLabel}
                  <ArrowUpRight size={17} />
                </button>
              </div>
            </div>
          </div>

          {thinking && (
            <div className="thinking-card">
              <div className="thinking-art">
                <span className="thinking-ring" />
                <span className="thinking-ring second" />
                <DigitalAvatarSprite
                  mood={thinking.mode === 'external' && streamPreview ? 'answering' : 'thinking'}
                  variant="thinking"
                  interactive={false}
                />
              </div>
              <div className="thinking-main">
                <div className="eyebrow">AI 正在工作</div>
                <h3>{thinkingTitle}</h3>
                <p className="thinking-question">
                  {thinking.mode === 'image'
                    ? `图片：${thinking.question}`
                    : thinking.mode === 'document'
                      ? `文件：${thinking.question}`
                      : `“${thinking.question}”`}
                </p>
                <div className="thinking-steps">
                  {thinkingSteps.map((step, index) => (
                    <div
                      className={`thinking-step ${index < thinking.step ? 'is-done' : ''} ${index === thinking.step ? 'is-current' : ''}`}
                      key={step}
                    >
                      <span className="thinking-step-dot">{index < thinking.step ? '✓' : ''}</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
                {thinking.mode === 'external' && streamPreview && (
                  <div className="thinking-preview">
                    <RichText text={streamPreview} />
                    <span className="ai-streaming-caret" aria-label="正在生成" />
                  </div>
                )}
              </div>
            </div>
          )}

          {invalidNotice && !thinking && (
            <div className="invalid-qa-banner" role="status" aria-live="polite">
              <div className="invalid-qa-banner-head">
                <strong>与课程教学无关</strong>
                <button
                  type="button"
                  className="icon-button invalid-qa-banner-close"
                  onClick={() => setInvalidNotice(null)}
                  aria-label="关闭提示"
                >
                  <X size={14} />
                </button>
              </div>
              <p>{invalidNotice.message}</p>
            </div>
          )}

          {activeThread && activeResult && !thinking && (
            <div ref={resultRef} className="answer-wrap">
              <AnswerCard
                thread={activeThread}
                result={activeResult}
                onEscalate={() => setEscalateOpen(true)}
                onSupplement={() => setEscalateOpen(true)}
                onFeedback={giveFeedback}
                onFeedbackReason={giveFeedbackReason}
                onResolve={(resolved) => resolveThread(activeThread, resolved)}
                onOpenFaq={openFaq}
                onTeach={() => setTeachOpen(true)}
                onOpenDetail={() => setDetailThreadId(activeThread.id)}
                onFollowUpChat={followUpChat}
              />
            </div>
          )}

          {wallSessionId && wallClusters.length > 0 && (
            <section className="card student-wall-clusters">
              <header className="section-head">
                <div>
                  <div className="eyebrow">本节实时归并</div>
                  <h2>本节同学热问（{wallClusters.length} 类）</h2>
                </div>
                <Badge tone="jade">{wallThreads.length} 人次</Badge>
              </header>
              <div className="student-wall-cluster-list">
                {wallClusters.slice(0, 6).map((cluster) => {
                  const pendingGroup = cluster.pendingGroupKey
                    ? pendingGroupsForCourse.find((item) => item.key === cluster.pendingGroupKey)
                    : undefined
                  const alreadyJoined = pendingGroup
                    ? pendingGroup.threads.some((item) => item.student.id === studentId)
                    : false
                  return (
                    <div className="student-wall-cluster-row" key={cluster.key}>
                      <div className="student-wall-cluster-copy">
                        <strong>{cluster.topic}</strong>
                        <span>
                          {cluster.totalCount} 人次提问 · AI 已答 {cluster.aiSolvedCount} ·{' '}
                          {cluster.pendingCount > 0
                            ? `待老师确认 ${cluster.pendingCount}`
                            : '暂无需转人工'}
                        </span>
                      </div>
                      {pendingGroup && !alreadyJoined && (
                        <button
                          type="button"
                          className="same-button"
                          onClick={() => setJoinGroup(pendingGroup)}
                        >
                          同问 +1
                        </button>
                      )}
                      {alreadyJoined && <Badge tone="neutral">已在等</Badge>}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section className="recent-card card">
            <header className="section-head">
              <div>
                <h2>我的提问</h2>
              </div>
              <div className="recent-head-actions">
                {myThreads.length > 0 && (
                  <button
                    className="text-button recent-all-link"
                    onClick={() => setReviewOpen(true)}
                  >
                    复习卡
                    <Layers size={13} />
                  </button>
                )}
              </div>
            </header>

            <div className="recent-filter-row">
              <div className="recent-filters" role="tablist" aria-label="我的提问筛选">
                {(
                  [
                    ['all', '全部'],
                    ['waiting', '等待中'],
                    ['course-waiting', '正在等老师'],
                    ['needs-info', '待补充'],
                    ['replied', '老师已回复'],
                    ['resolved', '已解决'],
                    ['withdrawn', '已撤下'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={threadFilter === key}
                    className={threadFilter === key ? 'is-active' : ''}
                    onClick={() => {
                      triggerHaptic('light')
                      setThreadFilter(key)
                    }}
                  >
                    {label}
                    <span>{threadFilterCounts[key]}</span>
                  </button>
                ))}
              </div>
              <div className="recent-course-row">
                <select
                  className="recent-course-filter"
                  value={threadCourse}
                  onChange={(event) => setThreadCourse(event.target.value)}
                  aria-label="按课程筛选提问"
                >
                  <option value="all">全部课程</option>
                  {courses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.shortName}（{threadCourseCounts[item.id] ?? 0}）
                    </option>
                  ))}
                </select>
                {myThreads.length > 0 && (
                  <button
                    className="text-button recent-all-link"
                    onClick={() => setArchiveOpen(true)}
                  >
                    查看全部
                    <ChevronRight size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="recent-list-stage" key={`${threadFilter}-${threadCourse}`}>
              {threadFilter === 'course-waiting' ? (
                filteredWaitingGroups.length === 0 ? (
                  <EmptyState
                    icon={<Users size={20} />}
                    title="暂时没有正在等老师的提问"
                    description="同学向老师转交的问题会出现在这里，可以一键「同问」少排一次队。"
                  />
                ) : (
                  <div className="waiting-merged-wrap">
                    <p className="waiting-merged-tip">同问，少排一次队</p>
                    <div className="waiting-list">
                      {filteredWaitingGroups.map((group) => {
                        const joined = group.threads.some((item) => item.student.id === studentId)
                        const groupCourse = courseById(group.courseId)
                        return (
                          <div className="waiting-row" key={group.key}>
                            <div className="waiting-copy">
                              <strong>{truncate(group.title, 28)}</strong>
                              <span>
                                {groupCourse.shortName} · {group.count} 人等 · {groupCourse.teacher}老师
                              </span>
                            </div>
                            <button
                              className={`same-button ${joined ? 'is-joined' : ''}`}
                              disabled={joined}
                              onClick={() => setJoinGroup(group)}
                            >
                              {joined ? '已在等' : '同问'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              ) : recentThreads.length === 0 ? (
                <EmptyState
                  icon={<MessagesSquare size={20} />}
                  title={myThreads.length === 0 ? '还没有提过问题' : '这个筛选下暂时没有记录'}
                  description={
                    myThreads.length === 0
                      ? '从上面问第一个问题开始，AI 会先接住。'
                      : '换一个筛选条件，或者回到「全部」查看最近的答疑记录。'
                  }
                  action={
                    myThreads.length > 0 ? (
                      <button className="text-button" onClick={() => setThreadFilter('all')}>
                        回到全部
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="recent-list">
                  {recentThreads.map((thread) => {
                    const threadCourse = courseById(thread.courseId)
                    return (
                      <button
                        key={thread.id}
                        className={`recent-row ${activeThread?.id === thread.id ? 'is-active' : ''}`}
                        onClick={() => setDetailThreadId(thread.id)}
                      >
                        <span className={`recent-status-line status-${statusTone(thread)}`} />
                        <div className="recent-content">
                          <div className="recent-meta">
                            <span className={`course-dot accent-${threadCourse.accent}`} />
                            <span>{threadCourse.shortName}</span>
                            <span className="recent-sep">·</span>
                            <span>{formatRelative(thread.createdAt)}</span>
                            {thread.kind === 'same' && <span className="recent-kind">同问</span>}
                            {thread.kind === 'follow-up' && (
                              <span className="recent-kind is-followup">追问</span>
                            )}
                          </div>
                          <strong className="recent-question">{thread.question}</strong>
                          {thread.withdrawnAt ? (
                            <p className="recent-sub is-withdrawn">已撤下</p>
                          ) : thread.teacherReply ? (
                            <p className="recent-sub is-reply">
                              {thread.teacherReply.by}老师：{excerpt(thread.teacherReply.text, 54)}
                            </p>
                          ) : thread.status === 'needs-info' ? (
                            <p className="recent-sub is-pending">老师请你补充信息 · 点开继续</p>
                          ) : thread.status === 'pending' ? (
                            <p className="recent-sub is-pending">
                              {thread.kind === 'same'
                                ? '已同问 · 等待老师回复'
                                : thread.kind === 'follow-up'
                                  ? '追问已发给老师'
                                  : '已转交老师，等待回复'}
                            </p>
                          ) : null}
                        </div>
                        <div className="recent-right">
                          <Badge tone={statusTone(thread)} dot>
                            {statusLabel(thread)}
                          </Badge>
                          <ChevronRight size={16} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </section>

        <StudentRail
          todaysClasses={todaysClasses}
          hasSchedule={profile.schedule.length > 0}
          hotFaqs={hotFaqs}
          course={course}
          courseId={courseId}
          courseTeacher={courseTeacher}
          courseFaqCount={courseFaqCount}
          courseNote={courseNote}
          studentId={studentId}
          onChangeCourse={setCourseId}
          onOpenAccount={onOpenAccount}
          onOpenFaq={openFaq}
          onNavigate={onNavigate}
        />
      </div>

      <TeachModal
        thread={teachOpen ? activeThread ?? null : null}
        result={activeResult}
        onClose={() => setTeachOpen(false)}
        onOpenFaq={(faqId) => {
          setTeachOpen(false)
          openFaq(faqId)
        }}
        onEscalate={() => {
          setTeachOpen(false)
          setEscalateOpen(true)
        }}
      />
      <EscalateModal
        key={escalateOpen ? activeThread?.id ?? 'open' : 'closed'}
        thread={escalateOpen ? activeThread ?? null : null}
        onClose={() => setEscalateOpen(false)}
        notify={notify}
        mode={activeThread?.status === 'pending' ? 'supplement' : 'escalate'}
      />
      <JoinGroupModal
        key={joinGroup?.key ?? 'join-closed'}
        group={joinGroup}
        onClose={() => setJoinGroup(null)}
        notify={notify}
      />
      <FollowUpModal
        key={followUpThread?.id ?? 'followup-closed'}
        thread={followUpThread}
        onClose={() => setFollowUpThread(null)}
        notify={notify}
      />
      <QuestionArchive
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onOpenThread={(threadId) => {
          setArchiveOpen(false)
          setDetailThreadId(threadId)
        }}
        notify={notify}
      />
      <ThreadDetailModal
        threadId={detailThreadId}
        onClose={() => setDetailThreadId(null)}
        onOpenFaq={openFaq}
        onResolve={(thread, resolved) => resolveThread(thread, resolved)}
        onFeedback={(thread, feedback) => feedbackThread(thread, feedback)}
        onFeedbackReason={(thread, reason) => feedbackThread(thread, 'unhelpful', reason)}
        onWithdraw={(thread, withdrawn) => withdrawThread(thread, withdrawn)}
        onSupplement={supplementThread}
        onFollowUp={(thread) => {
          setDetailThreadId(null)
          setFollowUpThread(thread)
        }}
        onThreadFollowUp={followUpChat}
        notify={notify}
      />
      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        notify={notify}
      />
      {selfCheckOpen && (
        <QuestionSelfCheckModal
          check={questionCheck}
          onClose={() => setSelfCheckOpen(false)}
          onContinue={() => {
            setSelfCheckOpen(false)
            focusAskCard()
          }}
          onUseTemplate={() => {
            setQuestion(selfCheckTemplate(question))
            setSelfCheckOpen(false)
            focusAskCard()
          }}
          onSubmit={() => {
            selfCheckBypass.current = true
            setSelfCheckOpen(false)
            void ask()
          }}
        />
      )}
    </div>
  )
}
