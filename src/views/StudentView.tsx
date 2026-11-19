import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Eye,
  EyeOff,
  ImagePlus,
  Layers,
  MessagesSquare,
  Mic,
  Server,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { courseById, dateKey, teacherByName } from '../data/seed'
import { mentorBriefForCourse } from '../data/mentor'
import {
  runsInWeek,
  studentCourses,
  teachingWeek,
  todayClasses,
  useProfile,
} from '../lib/profile'
import { findSimilarPendingGroup, groupPendingThreads, retrieve } from '../lib/engine'
import {
  answerWithExternalAI,
  errorMessage,
  extractQuestionFromImage,
  fetchAIStatus,
  isAIConfigReady,
  loadAIConfig,
  saveAIConfig,
  type AIConfig,
  type AIStatus,
} from '../lib/ai'
import { prepareImage, uploadThreadImage } from '../lib/image'
import { createDictation, speechSupported } from '../lib/speech'
import type {
  AnswerResult,
  Faq,
  Thread,
  ThreadAttachment,
  ThreadGroup,
  ViewKey,
} from '../types'
import {
  averageFirstResponseMinutes,
  durationLabel,
  excerpt,
  formatRelative,
  formatWeekday,
  makeEscalationTitle,
  makeId,
  statusLabel,
  statusTone,
  truncate,
} from '../lib/utils'
import { AIConfigModal } from '../components/AIConfigModal'
import { AnswerCard } from '../components/AnswerCard'
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
import {
  AiMark,
  Avatar,
  Badge,
  BrandMark,
  EmptyState,
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
  focusThreadId?: string | null
  onFocusHandled?: () => void
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

const placeholders: Record<string, string> = {
  ds: '例如：动态规划的状态转移方程怎么找？',
  math: '例如：洛必达法则什么时候不能用？',
  net: '例如：TCP 三次握手为什么不是两次？',
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
  focusThreadId,
  onFocusHandled,
}: StudentViewProps) {
  const { data, dispatch } = useStore()
  const { user } = useAuth()
  const studentId = user?.id ?? ''
  const profile = useProfile()
  const courses = useMemo(() => studentCourses(profile), [profile])
  const visibleCourseIds = new Set(courses.map((item) => item.id))
  const currentTeachingWeek = teachingWeek(profile.termStart)
  const classesOnToday = todayClasses(profile)
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
  const [thinking, setThinking] = useState<{
    question: string
    step: number
    topTitle?: string
    mode?: 'local' | 'image' | 'external'
  } | null>(null)
  const [streamPreview, setStreamPreview] = useState('')
  const [dictating, setDictating] = useState(false)
  const [dictationHint, setDictationHint] = useState('')
  const dictationRef = useRef<{ stop: () => void } | null>(null)
  const speechOk = useMemo(() => speechSupported(), [])
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => loadAIConfig())
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [attachment, setAttachment] = useState<ThreadAttachment | null>(null)
  const [askPreview, setAskPreview] = useState<{
    faq?: Faq
    group?: ThreadGroup
  } | null>(null)
  const courseStripRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [activeResult, setActiveResult] = useState<AnswerResult | null>(null)
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
  const aiReady = isAIConfigReady(aiConfig) && Boolean(aiStatus?.configured)
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
  const [threadFilter, setThreadFilter] = useState<
    'all' | 'waiting' | 'needs-info' | 'replied' | 'resolved' | 'withdrawn'
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
  const threadCourseCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const thread of threadsInFilter) {
      counts[thread.courseId] = (counts[thread.courseId] ?? 0) + 1
    }
    return counts
  }, [threadsInFilter])
  const threadFilterCounts = useMemo(
    () => ({
      all: myThreads.length,
      waiting: myThreads.filter((thread) => thread.status === 'pending' && !thread.withdrawnAt)
        .length,
      'needs-info': myThreads.filter(
        (thread) => thread.status === 'needs-info' && !thread.withdrawnAt,
      ).length,
      replied: myThreads.filter(
        (thread) => thread.status === 'answered' && !thread.resolvedAt && !thread.withdrawnAt,
      ).length,
      resolved: myThreads.filter((thread) => thread.resolvedAt).length,
      withdrawn: myThreads.filter((thread) => thread.withdrawnAt).length,
    }),
    [myThreads],
  )
  const recentThreads = useMemo(
    () =>
      threadsInFilter
        .filter((thread) => threadCourse === 'all' || thread.courseId === threadCourse)
        .slice(0, 5),
    [threadsInFilter, threadCourse],
  )
  const today = data.daily.find((entry) => entry.date === dateKey(Date.now()))
  const todayAi = today?.ai ?? 0
  const todayHuman = today?.human ?? 0
  const todayRate = todayAi + todayHuman > 0 ? todayAi / (todayAi + todayHuman) : 0
  const firstResponse = durationLabel(averageFirstResponseMinutes(data.threads))
  const hotFaqs = useMemo(() => {
    const ids = new Set(courses.map((item) => item.id))
    return [...data.faqs]
      .filter((faq) => ids.has(faq.courseId))
      .sort((a, b) => b.citations - a.citations)
      .slice(0, 4)
  }, [data.faqs, courses])
  const waitingGroups = useMemo(
    () =>
      groupPendingThreads(data.threads, courseId)
        .filter((group) => group.primary.kind !== 'follow-up')
        .slice(0, 3),
    [data.threads, courseId],
  )
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
    const strip = courseStripRef.current
    const chip = strip?.querySelector<HTMLElement>('.course-chip.is-active')
    if (!strip || !chip) return
    const stripRect = strip.getBoundingClientRect()
    const chipRect = chip.getBoundingClientRect()
    const target =
      strip.scrollLeft + chipRect.left - stripRect.left - (stripRect.width - chipRect.width) / 2
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [courseId, courses.length])

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
      const result = retrieve(data.faqs, text, courseId)
      const faq = result.matches.find((match) => match.score >= 0.26)?.faq
      const similar = findSimilarPendingGroup(data.threads, text, courseId)
      const group = similar?.primary.kind === 'follow-up' ? undefined : similar
      setAskPreview(faq || group ? { faq, group } : null)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [question, thinking, courseId, data.faqs, data.threads])

  const changeCourse = (nextId: string) => {
    if (thinking) {
      notify('等 AI 把这道题处理完再切换课程', 'info')
      return
    }
    setCourseId(nextId)
    setQuestion('')
    setActiveThreadId(null)
    setActiveResult(null)
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

  const chooseImage = () => {
    if (thinking) return
    fileInputRef.current?.click()
  }

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const prepared = await prepareImage(file)
      const uploaded = await uploadThreadImage(prepared)
      setAttachment({ ...prepared, url: uploaded.url })
      notify('图片已上传，会随问题一起给老师看')
    } catch (error) {
      notify(errorMessage(error), 'danger')
    }
  }

  const localContextFor = (result: AnswerResult) =>
    result.matches
      .slice(0, 2)
      .map((match) => `Q: ${match.faq.question}\nA: ${match.faq.answer.slice(0, 600)}`)
      .join('\n\n')

  const ask = async () => {
    if (thinking) return
    const text = question.trim()

    // Image-only input: let the server vision model extract the question first.
    if (!text && attachment) {
      if (!aiReady) {
        notify('请先输入题目；服务端 AI 就绪后可以直接识别图片', 'info')
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

    if (!text) return

    // AI 就绪时跳过自检，让低置信问题直接走服务端 AI 补充，而不是被自检弹窗拦住。
    if (!questionCheck.ok && !selfCheckBypass.current && !aiReady) {
      setSelfCheckOpen(true)
      return
    }
    selfCheckBypass.current = false

    let storedAttachment: ThreadAttachment | undefined
    if (attachment) {
      try {
        storedAttachment = await uploadThreadImage(attachment)
      } catch (error) {
        notify(`图片上传失败：${errorMessage(error)}`, 'danger')
        return
      }
    }

    const result = retrieve(data.faqs, text, courseId)
    const thread: Thread = {
      id: makeId('t'),
      courseId,
      student: { id: studentId, name: profile.name, anonymous },
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
    }

    pendingPayload.current = { thread, result }
    setThinking({
      question: text,
      step: 0,
      topTitle: result.confidence === 'low' ? undefined : result.top?.faq.question,
      mode: 'local',
    })
    setQuestion('')
    setAttachment(null)
    setActiveThreadId(null)
    setActiveResult(null)
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
              onUpdate: (partial) => setStreamPreview(partial),
            })
            thread.externalAnswer = {
              text: external.text,
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

  const feedbackThread = (thread: Thread, feedback: 'helpful' | 'unhelpful') => {
    dispatch({ type: 'feedback', threadId: thread.id, feedback })
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

  const resolveThread = (thread: Thread, resolved: boolean) => {
    dispatch({ type: 'thread-resolved', threadId: thread.id, resolved })
    notify(
      resolved ? '已确认解决，这条记录会计入答疑洞察' : '已撤销「已解决」确认',
      resolved ? 'success' : 'info',
    )
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
      : thinking?.mode === 'external'
        ? '课程知识库没把握，正在用服务端 AI 补充。'
        : '先查知识库，再决定要不要麻烦老师。'
  const askSubmitLabel = thinking
    ? thinking.mode === 'image'
      ? '识别中'
      : thinking.mode === 'external'
        ? 'AI 补充中'
        : 'AI 正在查'
    : !question.trim() && attachment && aiReady
      ? '识别题目'
      : '交给 AI'

  const handleAiSave = (next: AIConfig) => {
    saveAIConfig(next)
    setAiConfig(next)
    void fetchAIStatus()
      .then(setAiStatus)
      .catch(() => setAiStatus(null))
  }

  useEffect(
    () => () => {
      dictationRef.current?.stop()
    },
    [],
  )

  const toggleDictation = () => {
    if (dictating) {
      dictationRef.current?.stop()
      return
    }
    const handle = createDictation({
      lang: 'zh-CN',
      onText: (text, isFinal) => {
        if (isFinal) {
          const chunk = text.trim()
          if (chunk) {
            setQuestion((current) => (current.trim() ? `${current.trimEnd()} ${chunk}` : chunk))
          }
          setDictationHint('')
        } else {
          setDictationHint(text)
        }
      },
      onEnd: (reason) => {
        dictationRef.current = null
        setDictating(false)
        setDictationHint('')
        if (reason === 'error') {
          notify('语音识别不可用，请检查麦克风权限，或改用键盘输入', 'info')
        }
      },
    })
    if (!handle) {
      notify('当前浏览器不支持语音输入，请使用 Chrome / Edge', 'info')
      return
    }
    dictationRef.current = handle
    setDictating(true)
  }

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
        <div className="course-switch" role="tablist" aria-label="选择课程" ref={courseStripRef}>
          {courses.map((item) => (
            <button
              key={item.id}
              className={`course-chip ${courseId === item.id ? 'is-active' : ''}`}
              onClick={() => changeCourse(item.id)}
              role="tab"
              aria-selected={courseId === item.id}
            >
              <span className={`course-dot accent-${item.accent}`} />
              <span className="course-chip-copy">
                <strong title={item.name}>{item.shortName}</strong>
                <em>{item.teacher}老师</em>
              </span>
            </button>
          ))}
        </div>
        <div className="course-switch-side">
          <div className="course-switch-actions">
            <button
              className="course-timetable-button"
              onClick={() => onOpenAccount?.('schedule')}
              aria-label={profile.schedule.length > 0 ? '查看课程表' : '添加课程表'}
            >
              <CalendarDays size={15} />
              <span className="course-timetable-label">
                {profile.schedule.length > 0 ? '课程表' : '添加课程表'}
              </span>
            </button>
            {profile.customCourses.length > 0 && (
              <button
                className="course-manage-button"
                onClick={() => onOpenAccount?.('teachers')}
                aria-label="管理任课老师"
              >
                <Users size={14} />
                管理老师
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="student-layout">
        <section className="student-main">
          <div className="mentor-mobile-entry">
            <MajorMentorStrip
              profile={profile}
              data={data}
              onOpen={onOpenMentor}
              onEditMajor={() => onOpenAccount?.('identity')}
            />
          </div>
          <div ref={askCardRef} className="ask-card">
            <div className="ask-card-glow" aria-hidden="true" />
            <div className="ask-head">
              <div className="ask-identity">
                <AiMark size={18} />
                <div>
                  <strong>问 AI 助教</strong>
                </div>
              </div>
            </div>

            <textarea
              ref={askInputRef}
              className="ask-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  ask()
                }
              }}
              placeholder={placeholders[courseId] ?? `问一个「${course.shortName}」的问题…`}
              rows={3}
              disabled={Boolean(thinking)}
              aria-label="输入你的问题"
            />
            {dictationHint && (
              <p className="ask-dictation-hint" aria-live="polite">
                正在听：{dictationHint}
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageChange}
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
              <div className="ask-attachment">
                <img
                  src={attachment.url ?? attachment.dataUrl ?? ''}
                  alt="题目图片预览"
                />
                <div className="ask-attachment-copy">
                  <strong>{attachment.name}</strong>
                  <span>
                    {aiReady
                      ? '可以直接识别题面；图片也会随问题给老师看'
                      : '图片会随问题给老师看；服务端 AI 就绪后可自动识别'}
                  </span>
                </div>
                <button
                  className="ask-attachment-remove"
                  onClick={() => setAttachment(null)}
                  aria-label="移除图片"
                  type="button"
                >
                  <X size={15} />
                </button>
              </div>
            )}

            {question.trim().length >= 3 && (
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
                <button
                  className="ask-tool-button"
                  onClick={chooseImage}
                  disabled={Boolean(thinking)}
                  type="button"
                >
                  <ImagePlus size={15} />
                  图片
                </button>
                {speechOk && (
                  <button
                    className={`ask-tool-button mic-tool ${dictating ? 'is-dictating' : ''}`}
                    onClick={toggleDictation}
                    disabled={Boolean(thinking)}
                    type="button"
                    aria-pressed={dictating}
                    title={dictating ? '停止语音输入' : '语音说出你的问题'}
                  >
                    <Mic size={15} />
                    {dictating ? '停止听写' : '语音'}
                  </button>
                )}
                <button
                  className={`ask-tool-button ai-tool ${aiReady ? 'is-ready' : ''}`}
                  onClick={() => setAiSettingsOpen(true)}
                  type="button"
                >
                  <Server size={15} />
                  <span>
                    {aiReady
                      ? '服务端 AI 已开'
                      : !aiConfig.enabled
                        ? 'AI 增强已关'
                        : aiStatus?.configured
                          ? 'AI 增强已关'
                          : 'AI 未配置'}
                  </span>
                  {aiReady && <i className="ask-tool-dot" />}
                </button>
                <button
                  className={`anon-toggle ${anonymous ? 'is-active' : ''}`}
                  onClick={() => setAnonymous(!anonymous)}
                  type="button"
                  aria-pressed={anonymous}
                >
                  {anonymous ? <EyeOff size={15} /> : <Eye size={15} />}
                  <span>{anonymous ? '匿名提问' : '实名提问'}</span>
                  <span className="switch-track">
                    <span />
                  </span>
                </button>
              </div>
              <div className="ask-foot-right">
                <button
                  className="button button-primary ask-submit"
                  onClick={ask}
                  disabled={(!question.trim() && !attachment) || Boolean(thinking)}
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
                <BrandMark size={46} />
              </div>
              <div className="thinking-main">
                <div className="eyebrow">AI 正在工作</div>
                <h3>{thinkingTitle}</h3>
                <p className="thinking-question">
                  {thinking.mode === 'image' ? `图片：${thinking.question}` : `“${thinking.question}”`}
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

          {activeThread && activeResult && !thinking && (
            <div ref={resultRef} className="answer-wrap">
              <AnswerCard
                thread={activeThread}
                result={activeResult}
                onEscalate={() => setEscalateOpen(true)}
                onSupplement={() => setEscalateOpen(true)}
                onFeedback={giveFeedback}
                onResolve={(resolved) => resolveThread(activeThread, resolved)}
                onOpenFaq={openFaq}
                onTeach={() => setTeachOpen(true)}
                onOpenDetail={() => setDetailThreadId(activeThread.id)}
              />
            </div>
          )}

          <section className="recent-card card">
            <header className="section-head">
              <div>
                <div className="eyebrow">你的问题</div>
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
            </header>

            <div className="recent-filter-row">
              <div className="recent-filters" role="tablist" aria-label="我的提问筛选">
              {(
                [
                  ['all', '全部'],
                  ['waiting', '等待中'],
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
                  onClick={() => setThreadFilter(key)}
                >
                  {label}
                  <span>{threadFilterCounts[key]}</span>
                </button>
              ))}
              </div>
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
            </div>

            {recentThreads.length === 0 ? (
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
                          {thread.attachment && (
                            <span className="recent-kind is-image">图片</span>
                          )}
                          {thread.externalAnswer && (
                            <span className="recent-kind is-external">AI补充</span>
                          )}
                        </div>
                        <strong className="recent-question">{thread.question}</strong>
                        {thread.withdrawnAt ? (
                          <p className="recent-sub is-withdrawn">
                            你已撤下这条 · 打开记录可以重新发起
                          </p>
                        ) : thread.teacherReply ? (
                          <p className="recent-sub is-reply">
                            {thread.teacherReply.by}老师：{excerpt(thread.teacherReply.text, 54)}
                          </p>
                        ) : thread.status === 'needs-info' ? (
                          <p className="recent-sub is-pending">
                            老师请你补充信息 · 点开继续
                          </p>
                        ) : thread.status === 'pending' ? (
                          <p className="recent-sub is-pending">
                            {thread.kind === 'same'
                              ? '已同问 · 老师回复后会同步给你'
                              : thread.kind === 'follow-up'
                                ? '追问已发给老师 · 带上上次回复'
                                : thread.externalAnswer
                                  ? '已转交 · 服务端 AI 补充过，建议老师核对'
                                  : thread.escalation?.auto
                                    ? 'AI 没把握，已自动转交 · 老师会看到摘要'
                                    : '已转交 · AI 已附上问题摘要与依据'}
                          </p>
                        ) : thread.externalAnswer ? (
                          <p className="recent-sub is-external">
                            服务端 AI 补充 · 建议老师确认
                          </p>
                        ) : thread.confidence === 'low' ? (
                          <p className="recent-sub">AI 没有把握，可以转交老师</p>
                        ) : (
                          <p className="recent-sub">AI 依据课程知识库作答</p>
                        )}
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
          </section>
        </section>

        <StudentRail
          todayAi={todayAi}
          todayHuman={todayHuman}
          todayRate={todayRate}
          firstResponse={firstResponse}
          todaysClasses={todaysClasses}
          waitingGroups={waitingGroups}
          hotFaqs={hotFaqs}
          course={course}
          courseId={courseId}
          courseTeacher={courseTeacher}
          courseFaqCount={courseFaqCount}
          courseNote={courseNote}
          studentId={studentId}
          onChangeCourse={setCourseId}
          onOpenAccount={onOpenAccount}
          onOpenJoinGroup={setJoinGroup}
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
        onWithdraw={(thread, withdrawn) => withdrawThread(thread, withdrawn)}
        onSupplement={supplementThread}
        onFollowUp={(thread) => {
          setDetailThreadId(null)
          setFollowUpThread(thread)
        }}
        notify={notify}
      />
      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        notify={notify}
      />
      <AIConfigModal
        open={aiSettingsOpen}
        config={aiConfig}
        onClose={() => setAiSettingsOpen(false)}
        onSave={handleAiSave}
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
