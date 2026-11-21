import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react'
import { Loader2, ServerOff } from 'lucide-react'
import { createSeedData, courseById, dateKey } from './data/seed'
import { ApiError, apiGet, apiPut } from './lib/api'
import { makeId, truncate } from './lib/utils'
import type {
  AppData,
  AppNotification,
  CourseNote,
  DailyMetric,
  Escalation,
  Faq,
  NotificationAudience,
  StudentSupplement,
  TeacherInfoRequest,
  TeacherReply,
  Thread,
} from './types'

type Action =
  | {
      type: 'thread-created'
      thread: Thread
      aiSolved: boolean
      citedFaqIds: string[]
    }
  | {
      type: 'escalated'
      threadId: string
      escalation: Escalation
      clusterId?: string
      joinedExistingGroup: boolean
    }
  | { type: 'group-joined'; thread: Thread }
  | { type: 'follow-up-created'; thread: Thread }
  | { type: 'feedback'; threadId: string; feedback: 'helpful' | 'unhelpful' }
  | { type: 'thread-resolved'; threadId: string; resolved: boolean }
  | { type: 'thread-withdrawn'; threadId: string; withdrawn: boolean }
  | {
      type: 'teacher-info-request'
      threadIds: string[]
      request: TeacherInfoRequest
    }
  | { type: 'thread-supplemented'; threadId: string; supplement: StudentSupplement }
  | { type: 'thread-group-set'; threadIds: string[]; clusterId: string | null; groupLocked: boolean }
  | { type: 'course-note-saved'; note: CourseNote }
  | { type: 'thread-favorite'; threadId: string; favorite: boolean }
  | { type: 'reply-undone'; threadId: string }
  | { type: 'faq-removed'; faqId: string }
  | {
      type: 'teacher-reply'
      threadIds: string[]
      reply: TeacherReply
      faq?: Faq
    }
  | { type: 'faq-added'; faq: Faq }
  | { type: 'faqs-imported'; faqs: Faq[] }
  | { type: 'faq-updated'; faqId: string; patch: Partial<Faq> }
  | { type: 'faq-helpful'; faqId: string; helpful: boolean }
  | { type: 'notifications-read'; ids: string[] }
  | {
      type: 'notifications-read-all'
      audience: NotificationAudience
      recipientId: string
    }
  | { type: 'guide-seen' }
  | { type: 'restore'; data: AppData }
  | { type: 'reset' }

function bumpDaily(daily: DailyMetric[], now: number, field: 'ai' | 'human') {
  const key = dateKey(now)
  const existing = daily.find((entry) => entry.date === key)
  if (existing) {
    return daily.map((entry) => (entry.date === key ? { ...entry, [field]: entry[field] + 1 } : entry))
  }
  return [...daily, { date: key, ai: field === 'ai' ? 1 : 0, human: field === 'human' ? 1 : 0 }].slice(-14)
}

function adjustFeedbackCounts(
  faqs: Faq[],
  sourceIds: string[],
  previous: 'helpful' | 'unhelpful' | null | undefined,
  next: 'helpful' | 'unhelpful',
) {
  const topId = sourceIds[0]
  if (!topId) return faqs
  return faqs.map((faq) => {
    if (faq.id !== topId) return faq
    let helpful = faq.helpful
    let unhelpful = faq.unhelpful
    if (previous === 'helpful') helpful = Math.max(0, helpful - 1)
    if (previous === 'unhelpful') unhelpful = Math.max(0, unhelpful - 1)
    if (next === 'helpful') helpful += 1
    if (next === 'unhelpful') unhelpful += 1
    return { ...faq, helpful, unhelpful }
  })
}

function faqSnapshot(faq: Faq) {
  return {
    question: faq.question,
    answer: faq.answer,
    tags: faq.tags,
    aliases: faq.aliases,
    chapter: faq.chapter,
    author: faq.author,
    updatedAt: faq.updatedAt,
  }
}

function withFaqHistory(previous: Faq, next: Faq): Faq {
  return {
    ...next,
    history: [faqSnapshot(previous), ...(previous.history ?? [])].slice(0, 5),
  }
}

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'thread-created': {
      const now = Date.now()
      const cited = new Set(action.citedFaqIds)
      return {
        ...state,
        threads: [action.thread, ...state.threads],
        faqs: state.faqs.map((faq) =>
          cited.has(faq.id) ? { ...faq, citations: faq.citations + 1 } : faq,
        ),
        daily: action.aiSolved ? bumpDaily(state.daily, now, 'ai') : state.daily,
      }
    }
    case 'escalated': {
      const target = state.threads.find((thread) => thread.id === action.threadId)
      if (!target) return state
      const wasPending = target.status === 'pending'
      const now = Date.now()
      const course = courseById(target.courseId)
      const anonymous = Boolean(
        action.escalation.anonymous || target.student.anonymous,
      )
      const studentName = anonymous ? '匿名同学' : target.student.name
      const extras = [
        action.joinedExistingGroup ? '已并入同题组' : '',
        target.attachment ? '含附件' : '',
        target.externalAnswer ? '已用服务端 AI 补充' : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const newNotifications: AppNotification[] = wasPending
        ? []
        : [
            {
              id: makeId('n'),
              audience: 'teacher',
              recipientId: course.teacher,
              courseId: target.courseId,
              threadId: target.id,
              kind: 'teacher-new-question',
              title: `新问题：${action.escalation.title}`,
              body: `${studentName} · ${course.name}${extras ? ` · ${extras}` : ''}`,
              createdAt: now,
              read: false,
            },
            {
              id: makeId('n'),
              audience: 'student',
              recipientId: target.student.id,
              courseId: target.courseId,
              threadId: target.id,
              kind: 'question-escalated',
              title: `已转交${course.teacher}老师`,
              body: action.joinedExistingGroup
                ? '问题已并入同题组，老师回复后会通知你。'
                : '问题已进入老师待办，回复后会通知你。',
              createdAt: now,
              read: false,
            },
          ]
      return {
        ...state,
        threads: state.threads.map((thread) =>
          thread.id === action.threadId
            ? {
                ...thread,
                status: 'pending',
                escalation: {
                  ...action.escalation,
                  auto: action.escalation.auto ?? thread.escalation?.auto,
                },
                clusterId: action.clusterId ?? thread.clusterId,
              }
            : thread,
        ),
        notifications: [...newNotifications, ...state.notifications],
        daily: wasPending ? state.daily : bumpDaily(state.daily, now, 'human'),
        duplicatesMerged: wasPending
          ? state.duplicatesMerged
          : state.duplicatesMerged + (action.joinedExistingGroup ? 1 : 0),
      }
    }
    case 'group-joined': {
      const duplicate = state.threads.some(
        (thread) =>
          thread.student.id === action.thread.student.id &&
          thread.status === 'pending' &&
          Boolean(action.thread.clusterId) &&
          thread.clusterId === action.thread.clusterId,
      )
      if (duplicate) return state
      const course = courseById(action.thread.courseId)
      const studentName = action.thread.student.anonymous
        ? '匿名同学'
        : action.thread.student.name
      const teacherNotification: AppNotification = {
        id: makeId('n'),
        audience: 'teacher',
        recipientId: course.teacher,
        courseId: action.thread.courseId,
        threadId: action.thread.id,
        kind: 'teacher-same-question',
        title: `有人同问：${action.thread.question.slice(0, 26)}`,
        body: `${studentName} 加入了同题组，回复会同步给所有同学。`,
        createdAt: Date.now(),
        read: false,
      }
      // Classmates already waiting in the same group deserve to know one more person joined.
      const peerNotifications: AppNotification[] = action.thread.clusterId
        ? state.threads
            .filter(
              (thread) =>
                thread.clusterId === action.thread.clusterId &&
                thread.courseId === action.thread.courseId &&
                thread.status === 'pending' &&
                !thread.withdrawnAt &&
                thread.student.id !== action.thread.student.id,
            )
            .map((thread) => ({
              id: makeId('n'),
              audience: 'student' as const,
              recipientId: thread.student.id,
              courseId: thread.courseId,
              threadId: thread.id,
              kind: 'same-question-joined' as const,
              title: `${studentName} 和你同问了同一个问题`,
              body: '老师一次回复会同步给组里所有同学。',
              createdAt: Date.now(),
              read: false,
            }))
        : []
      return {
        ...state,
        threads: [action.thread, ...state.threads],
        notifications: [
          teacherNotification,
          ...peerNotifications,
          ...state.notifications,
        ],
        daily: bumpDaily(state.daily, Date.now(), 'human'),
        duplicatesMerged: state.duplicatesMerged + 1,
      }
    }
    case 'follow-up-created': {
      const course = courseById(action.thread.courseId)
      const studentName = action.thread.student.anonymous
        ? '匿名同学'
        : action.thread.student.name
      const notification: AppNotification = {
        id: makeId('n'),
        audience: 'teacher',
        recipientId: course.teacher,
        courseId: action.thread.courseId,
        threadId: action.thread.id,
        kind: 'teacher-follow-up',
        title: `追问：${action.thread.escalation?.title ?? action.thread.question.slice(0, 24)}`,
        body: `${studentName} 追问了上次的问题，已带上当时回复。`,
        createdAt: Date.now(),
        read: false,
      }
      return {
        ...state,
        threads: [action.thread, ...state.threads],
        notifications: [notification, ...state.notifications],
        daily: bumpDaily(state.daily, Date.now(), 'human'),
      }
    }
    case 'feedback': {
      const thread = state.threads.find((item) => item.id === action.threadId)
      if (!thread) return state
      if (thread.feedback === action.feedback) return state
      const adjustedFaqs = adjustFeedbackCounts(
        state.faqs,
        thread.sources ?? [],
        thread.feedback,
        action.feedback,
      )
      const topSourceId = thread.sources?.[0]
      const sourceFaq = topSourceId
        ? adjustedFaqs.find((faq) => faq.id === topSourceId)
        : undefined
      let faqs = adjustedFaqs
      let notification: AppNotification | undefined

      if (sourceFaq) {
        const recentDelta =
          action.feedback === 'unhelpful'
            ? 1
            : thread.feedback === 'unhelpful'
              ? -1
              : 0
        const recent = Math.max(0, (sourceFaq.recentUnhelpful ?? 0) + recentDelta)
        faqs = adjustedFaqs.map((faq) =>
          faq.id === sourceFaq.id ? { ...faq, recentUnhelpful: recent } : faq,
        )

        if (action.feedback === 'unhelpful' && !sourceFaq.reviewNeeded && recent >= 2) {
          const course = courseById(thread.courseId)
          faqs = faqs.map((faq) =>
            faq.id === sourceFaq.id
              ? {
                  ...faq,
                  reviewNeeded: true,
                  reviewNote: `近期已有 ${recent} 位同学反馈这条答案不够清楚，AI 已自动降低它的置信度。`,
                }
              : faq,
          )
          notification = {
            id: makeId('n'),
            audience: 'teacher',
            recipientId: course.teacher,
            courseId: thread.courseId,
            threadId: thread.id,
            kind: 'teacher-faq-review',
            title: `答案被反馈不够清楚：${sourceFaq.question.slice(0, 24)}`,
            body: 'AI 已自动降低这条 FAQ 的置信度，去知识库完善它。',
            createdAt: Date.now(),
            read: false,
          }
        }
      }

      return {
        ...state,
        threads: state.threads.map((item) =>
          item.id === action.threadId ? { ...item, feedback: action.feedback } : item,
        ),
        faqs,
        notifications: notification
          ? [notification, ...state.notifications]
          : state.notifications,
      }
    }
    case 'thread-resolved': {
      const thread = state.threads.find((item) => item.id === action.threadId)
      if (!thread) return state
      const now = Date.now()
      const course = courseById(thread.courseId)
      const alreadyResolved = Boolean(thread.resolvedAt)
      const notification: AppNotification | undefined =
        action.resolved && !alreadyResolved
          ? {
              id: makeId('n'),
              audience: 'teacher',
              recipientId: course.teacher,
              courseId: thread.courseId,
              threadId: thread.id,
              kind: 'teacher-question-resolved',
              title: `学生确认已解决：${truncate(thread.question, 24)}`,
              body: thread.teacherReply
                ? `${thread.teacherReply.by}老师的回复被确认解决了。`
                : 'AI 的回答被学生确认解决了。',
              createdAt: now,
              read: false,
            }
          : undefined
      return {
        ...state,
        threads: state.threads.map((item) =>
          item.id === action.threadId
            ? { ...item, resolvedAt: action.resolved ? now : undefined }
            : item,
        ),
        notifications: notification
          ? [notification, ...state.notifications]
          : state.notifications,
      }
    }
    case 'teacher-info-request': {
      const targets = state.threads.filter((thread) => action.threadIds.includes(thread.id))
      if (targets.length === 0) return state
      const targetIds = new Set(targets.map((thread) => thread.id))
      const notifications: AppNotification[] = targets.map((thread) => {
        const course = courseById(thread.courseId)
        return {
          id: makeId('n'),
          audience: 'student',
          recipientId: thread.student.id,
          courseId: thread.courseId,
          threadId: thread.id,
          kind: 'teacher-needs-info',
          title: `${course.teacher}老师请你补充信息`,
          body: action.request.text.replace(/\s+/g, ' ').slice(0, 90),
          createdAt: action.request.at,
          read: false,
        }
      })
      return {
        ...state,
        threads: state.threads.map((thread) =>
          targetIds.has(thread.id)
            ? { ...thread, status: 'needs-info', teacherRequest: action.request }
            : thread,
        ),
        notifications: [
          ...notifications,
          ...state.notifications.map((notification) =>
            notification.audience === 'teacher' && targetIds.has(notification.threadId)
              ? { ...notification, read: true }
              : notification,
          ),
        ],
      }
    }
    case 'thread-supplemented': {
      const thread = state.threads.find((item) => item.id === action.threadId)
      if (!thread) return state
      const course = courseById(thread.courseId)
      const studentName = thread.student.anonymous ? '匿名同学' : thread.student.name
      return {
        ...state,
        threads: state.threads.map((item) =>
          item.id === thread.id
            ? { ...item, status: 'pending', studentSupplement: action.supplement }
            : item,
        ),
        notifications: [
          {
            id: makeId('n'),
            audience: 'teacher',
            recipientId: course.teacher,
            courseId: thread.courseId,
            threadId: thread.id,
            kind: 'teacher-supplement',
            title: `学生补充了信息：${truncate(thread.question, 24)}`,
            body: `${studentName}：${action.supplement.text.replace(/\s+/g, ' ').slice(0, 90)}`,
            createdAt: action.supplement.at,
            read: false,
          },
          ...state.notifications.map((notification) =>
            notification.audience === 'student' &&
            notification.recipientId === thread.student.id &&
            notification.threadId === thread.id &&
            notification.kind === 'teacher-needs-info'
              ? { ...notification, read: true }
              : notification,
          ),
        ],
      }
    }
    case 'thread-group-set':
      return {
        ...state,
        threads: state.threads.map((thread) =>
          action.threadIds.includes(thread.id)
            ? {
                ...thread,
                clusterId: action.clusterId ?? undefined,
                groupLocked: action.groupLocked,
              }
            : thread,
        ),
      }
    case 'course-note-saved':
      return {
        ...state,
        courseNotes: [
          action.note,
          ...state.courseNotes.filter((note) => note.courseId !== action.note.courseId),
        ],
      }
    case 'thread-favorite':
      return {
        ...state,
        threads: state.threads.map((thread) =>
          thread.id === action.threadId ? { ...thread, favorite: action.favorite } : thread,
        ),
      }
    case 'thread-withdrawn': {
      const thread = state.threads.find((item) => item.id === action.threadId)
      if (!thread) return state
      const now = Date.now()
      const course = courseById(thread.courseId)
      if (action.withdrawn) {
        if (thread.withdrawnAt) return state
        const wasAwaiting = thread.status === 'pending' || thread.status === 'needs-info'
        const notification: AppNotification | undefined = wasAwaiting
          ? {
              id: makeId('n'),
              audience: 'teacher',
              recipientId: course.teacher,
              courseId: thread.courseId,
              threadId: thread.id,
              kind: 'teacher-question-withdrawn',
              title: `学生撤下了问题：${truncate(thread.question, 24)}`,
              body: thread.clusterId
                ? '这条已从同题组里移出，不用再为它组织回复。'
                : '问题已从你的待办里撤下，学生可以重新发起来。',
              createdAt: now,
              read: false,
            }
          : undefined
        return {
          ...state,
          threads: state.threads.map((item) =>
            item.id === thread.id ? { ...item, withdrawnAt: now } : item,
          ),
          notifications: notification
            ? [notification, ...state.notifications]
            : state.notifications,
        }
      }
      return {
        ...state,
        threads: state.threads.map((item) =>
          item.id === thread.id ? { ...item, withdrawnAt: undefined } : item,
        ),
        notifications: state.notifications.filter(
          (notification) =>
            !(notification.kind === 'teacher-question-withdrawn' && notification.threadId === thread.id),
        ),
      }
    }
    case 'reply-undone': {
      const target = state.threads.find((item) => item.id === action.threadId)
      const reply = target?.teacherReply
      if (!target || !reply) return state
      // One merged reply is shared by the whole same-question group.
      const groupIds = new Set(
        state.threads
          .filter(
            (thread) =>
              thread.teacherReply &&
              thread.teacherReply.at === reply.at &&
              thread.teacherReply.by === reply.by &&
              thread.teacherReply.text === reply.text,
          )
          .map((thread) => thread.id),
      )
      groupIds.add(target.id)

      let faqs = state.faqs
      if (reply.faqId) {
        if (reply.sedimentPrevious === null) {
          faqs = state.faqs.filter((faq) => faq.id !== reply.faqId)
        } else if (reply.sedimentPrevious) {
          const previous = reply.sedimentPrevious
          faqs = state.faqs.map((faq) => (faq.id === previous.id ? previous : faq))
        }
      }

      return {
        ...state,
        threads: state.threads.map((thread) =>
          groupIds.has(thread.id)
            ? {
                ...thread,
                status: 'pending',
                teacherReply: undefined,
                resolvedAt: undefined,
              }
            : thread,
        ),
        faqs,
        notifications: state.notifications.filter(
          (notification) =>
            !(
              (notification.kind === 'teacher-reply' ||
                notification.kind === 'teacher-question-resolved') &&
              groupIds.has(notification.threadId)
            ),
        ),
      }
    }
    case 'faq-removed':
      return {
        ...state,
        faqs: state.faqs.filter((faq) => faq.id !== action.faqId),
      }
    case 'teacher-reply': {
      const updatedFaq = action.faq
      const nextFaq = updatedFaq
        ? (() => {
            const previous = state.faqs.find((faq) => faq.id === updatedFaq.id)
            return previous ? withFaqHistory(previous, updatedFaq) : updatedFaq
          })()
        : undefined
      const repliedThreads = state.threads.filter((thread) =>
        action.threadIds.includes(thread.id),
      )
      const replyBody = action.reply.text.replace(/\s+/g, ' ').slice(0, 90)
      const studentNotifications: AppNotification[] = repliedThreads.map((thread) => ({
        id: makeId('n'),
        audience: 'student',
        recipientId: thread.student.id,
        courseId: thread.courseId,
        threadId: thread.id,
        kind: 'teacher-reply',
        title:
          thread.courseId === 'campus'
            ? `${action.reply.by}（校园主理人）回复了你的问题`
            : `${action.reply.by}老师回复了你的问题`,
        body: replyBody,
        createdAt: action.reply.at,
        read: false,
      }))
      const repliedIds = new Set(action.threadIds)
      return {
        ...state,
        threads: state.threads.map((thread) =>
          action.threadIds.includes(thread.id)
            ? {
                ...thread,
                status: 'answered',
                teacherReply: action.reply,
              }
            : thread,
        ),
        notifications: [
          ...studentNotifications,
          ...state.notifications.map((notification) =>
            notification.audience === 'teacher' && repliedIds.has(notification.threadId)
              ? { ...notification, read: true }
              : notification,
          ),
        ],
        // Upsert by id so a repeated dispatch can never leave two versions of one answer.
        faqs: nextFaq
          ? [nextFaq, ...state.faqs.filter((faq) => faq.id !== nextFaq.id)]
          : state.faqs,
      }
    }
    case 'faq-added':
      return {
        ...state,
        faqs: [action.faq, ...state.faqs],
      }
    case 'faqs-imported':
      return {
        ...state,
        faqs: [...action.faqs, ...state.faqs],
      }
    case 'faq-updated':
      return {
        ...state,
        // A teacher edit clears the pending negative-feedback counter.
        faqs: state.faqs.map((faq) => {
          if (faq.id !== action.faqId) return faq
          const next = {
            ...faq,
            ...action.patch,
            history: faq.history,
            recentUnhelpful: 0,
            updatedAt: Date.now(),
          }
          return withFaqHistory(faq, next)
        }),
      }
    case 'notifications-read': {
      const ids = new Set(action.ids)
      return {
        ...state,
        notifications: state.notifications.map((notification) =>
          ids.has(notification.id) ? { ...notification, read: true } : notification,
        ),
      }
    }
    case 'notifications-read-all':
      return {
        ...state,
        notifications: state.notifications.map((notification) =>
          notification.audience === action.audience &&
          notification.recipientId === action.recipientId
            ? { ...notification, read: true }
            : notification,
        ),
      }
    case 'faq-helpful':
      return {
        ...state,
        faqs: state.faqs.map((faq) =>
          faq.id === action.faqId
            ? {
                ...faq,
                helpful: faq.helpful + (action.helpful ? 1 : 0),
                unhelpful: faq.unhelpful + (action.helpful ? 0 : 1),
              }
            : faq,
        ),
      }
    case 'guide-seen':
      return { ...state, guideSeen: true }
    case 'restore':
      return action.data
    case 'reset': {
      const next = createSeedData()
      return { ...next, guideSeen: true }
    }
    default:
      return state
  }
}

interface StateEnvelope {
  data: AppData | null
  revision: number
}

interface StoreValue {
  data: AppData
  dispatch: Dispatch<Action>
  resetDemo: () => void
  restoreData: (data: AppData) => void
  markGuideSeen: () => void
  syncState: 'loading' | 'saving' | 'saved' | 'error'
}

const StoreContext = createContext<StoreValue | null>(null)

function incomingData(data: AppData): AppData {
  return {
    ...data,
    notifications: Array.isArray(data.notifications) ? data.notifications : [],
    daily: Array.isArray(data.daily) ? data.daily : [],
    courseNotes: Array.isArray(data.courseNotes) ? data.courseNotes : [],
  }
}

function loadErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '登录状态已失效，请重新登录。'
    return error.message
  }
  return '无法连接服务端，请确认师说服务已经启动。'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [initialSeed] = useState<AppData>(() => createSeedData())
  const [data, dispatch] = useReducer(reducer, initialSeed)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<StoreValue['syncState']>('loading')
  const revisionRef = useRef(0)
  const hydratedRef = useRef(false)
  const remoteSnapshotRef = useRef<AppData | null>(null)
  const savingRef = useRef(false)
  const queuedRef = useRef<{ snapshot: AppData; mode: 'reset' | 'restore' | null } | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const writeModeRef = useRef<'reset' | 'restore' | null>(null)

  const applyRemote = useCallback((next: AppData, revision: number) => {
    const snapshot = incomingData(next)
    remoteSnapshotRef.current = snapshot
    revisionRef.current = revision
    hydratedRef.current = true
    dispatch({ type: 'restore', data: snapshot })
  }, [])

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      try {
        const remote = await apiGet<StateEnvelope>('/api/state')
        if (cancelled) return
        if (remote.data) {
          applyRemote(remote.data, remote.revision)
        } else {
          const seed = initialSeed
          try {
            const saved = await apiPut<{ revision: number; data?: AppData }>('/api/state', {
              data: seed,
              baseRevision: remote.revision,
            })
            if (cancelled) return
            applyRemote(saved.data ?? seed, saved.revision)
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              const payload = error.payload as Partial<StateEnvelope> | null
              if (payload?.data) {
                applyRemote(payload.data, Number(payload.revision ?? 0))
              } else {
                throw error
              }
            } else {
              throw error
            }
          }
        }
        if (!cancelled) {
          setLoading(false)
          setSyncState('saved')
        }
      } catch (error) {
        if (!cancelled) {
          setLoading(false)
          setLoadError(loadErrorMessage(error))
        }
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [applyRemote])

  const reportSyncError = useCallback((message: string) => {
    window.dispatchEvent(
      new CustomEvent('shishuo:sync-error', { detail: { message } }),
    )
  }, [])

  const persist = useCallback(
    async (snapshot: AppData, mode: 'reset' | 'restore' | null) => {
      if (savingRef.current) {
        queuedRef.current = { snapshot, mode }
        return
      }
      savingRef.current = true
      setSyncState('saving')
      try {
        const result = await apiPut<{ revision: number; data?: AppData }>('/api/state', {
          data: snapshot,
          baseRevision: revisionRef.current,
          mode: mode ?? undefined,
        })
        revisionRef.current = result.revision
        if (queuedRef.current) {
          const next = queuedRef.current
          queuedRef.current = null
          savingRef.current = false
          await persist(next.snapshot, next.mode)
          return
        }
        if (result.data) {
          applyRemote(result.data, result.revision)
        }
        setSyncState('saved')
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const payload = error.payload as Partial<StateEnvelope> | null
          if (payload?.data) {
            applyRemote(payload.data, Number(payload.revision ?? 0))
            queuedRef.current = null
            setSyncState('saved')
            window.dispatchEvent(
              new CustomEvent('shishuo:sync-notice', {
                detail: { message: '共享空间已有更新，已载入最新版本' },
              }),
            )
          } else {
            setSyncState('error')
            reportSyncError('共享空间已有更新，但最新版本读取失败。')
          }
        } else if (error instanceof ApiError && error.status === 401) {
          setSyncState('error')
        } else {
          setSyncState('error')
          if (error instanceof ApiError && error.status === 403) {
            try {
              const remote = await apiGet<StateEnvelope>('/api/state')
              if (remote.data) {
                applyRemote(remote.data, remote.revision)
                setSyncState('saved')
              }
            } catch {
              // Keep the error visible; the next poll can retry.
            }
          }
          reportSyncError(
            error instanceof ApiError
              ? error.message
              : '保存失败，无法连接师说服务端。',
          )
        }
      } finally {
        if (writeModeRef.current === mode) writeModeRef.current = null
        savingRef.current = false
      }
    },
    [applyRemote, reportSyncError],
  )

  useEffect(() => {
    if (!hydratedRef.current) return
    // Skip exactly the object returned by the server; if the app changed it in
    // the same commit (for example marking the guide seen), that object differs
    // and must be saved.
    if (remoteSnapshotRef.current === data) {
      remoteSnapshotRef.current = null
      return
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    setSyncState('saving')
    const snapshot = data
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void persist(snapshot, writeModeRef.current)
    }, 600)
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [data, persist])

  const refreshFromServer = useCallback(async () => {
    if (!hydratedRef.current || savingRef.current || saveTimerRef.current) return
    try {
      // 先探 revision：没变化就不拉全量工作区，多标签页轮询几乎零流量。
      const probe = await apiGet<{ revision: number }>('/api/state/revision')
      if (probe.revision <= revisionRef.current) return
      const remote = await apiGet<StateEnvelope>('/api/state')
      if (remote.revision > revisionRef.current) {
        if (remote.data) applyRemote(remote.data, remote.revision)
      }
    } catch {
      // The next poll retries; a transient network failure should not wipe local state.
    }
  }, [applyRemote])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshFromServer()
    }, 3500)
    const onVisible = () => {
      if (!document.hidden) void refreshFromServer()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshFromServer])

  const resetDemo = useCallback(() => {
    writeModeRef.current = 'reset'
    remoteSnapshotRef.current = null
    dispatch({ type: 'reset' })
  }, [])
  const restoreData = useCallback((next: AppData) => {
    writeModeRef.current = 'restore'
    remoteSnapshotRef.current = null
    dispatch({ type: 'restore', data: incomingData(next) })
  }, [])
  const markGuideSeen = useCallback(() => dispatch({ type: 'guide-seen' }), [])

  const value = useMemo(
    () => ({ data, dispatch, resetDemo, restoreData, markGuideSeen, syncState }),
    [data, resetDemo, restoreData, markGuideSeen, syncState],
  )

  if (loading) {
    return (
      <div className="app-gate">
        <div className="app-gate-card">
          <Loader2 size={28} className="spin-icon app-gate-spinner" />
          <h2>正在打开共享课程空间</h2>
          <p>从服务端读取问答、FAQ 和待办，请稍候。</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="app-gate">
        <div className="app-gate-card">
          <ServerOff size={28} className="app-gate-spinner" />
          <h2>暂时连不上课程空间</h2>
          <p>{loadError}</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            重新连接
          </button>
        </div>
      </div>
    )
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside StoreProvider')
  return value
}
