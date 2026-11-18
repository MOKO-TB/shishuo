import type {
  AppData,
  AppNotification,
  Course,
  CourseNote,
  DailyMetric,
  Faq,
  FaqVersion,
  NotificationKind,
  Thread,
} from '../types'
import {
  DEFAULT_PROFILE,
  normalizeProfile,
  type ScheduleEntry,
  type ScoreRow,
  type StudentProfile,
} from './profile'
import {
  createSeedData,
  LATEX_FAQ_IDS,
  LINALG_FAQ_IDS,
  PROB_FAQ_IDS,
  DIGITAL_FAQ_IDS,
  ANALOG_FAQ_IDS,
  PHYSICS_FAQ_IDS,
  CS_FAQ_IDS,
  HOT_FAQ_IDS,
  ENG_FAQ_IDS,
  ARTS_FAQ_IDS,
  ENG2_FAQ_IDS,
} from '../data/seed'

export const BACKUP_SCHEMA = 1
export const MAX_BACKUP_BYTES = 12 * 1024 * 1024

const NOTIFICATION_KINDS = new Set<NotificationKind>([
  'teacher-reply',
  'question-escalated',
  'same-question-joined',
  'teacher-new-question',
  'teacher-same-question',
  'teacher-follow-up',
  'teacher-faq-review',
  'teacher-question-resolved',
  'teacher-question-withdrawn',
])

export interface ParsedBackup {
  data: AppData
  profile: StudentProfile
  exportedAt: string
  summary: {
    threads: number
    faqs: number
    schedule: number
    scores: number
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function nullableNum(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function strList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function sanitizeFaqVersion(value: unknown): FaqVersion | null {
  if (!isRecord(value)) return null
  const question = str(value.question)
  const answer = str(value.answer)
  if (!question || !answer) return null
  return {
    question,
    answer,
    tags: strList(value.tags),
    aliases: strList(value.aliases),
    chapter: optionalString(value.chapter),
    author: str(value.author, '老师'),
    updatedAt: num(value.updatedAt),
  }
}

function sanitizeFaqHistory(value: unknown): FaqVersion[] | undefined {
  if (!Array.isArray(value)) return undefined
  const history = value
    .map(sanitizeFaqVersion)
    .filter((item): item is FaqVersion => Boolean(item))
    .slice(0, 5)
  return history.length > 0 ? history : undefined
}

function sanitizeFaq(value: unknown): Faq | null {
  if (!isRecord(value)) return null
  const id = str(value.id)
  const courseId = str(value.courseId)
  const question = str(value.question)
  const answer = str(value.answer)
  if (!id || !courseId || !question || !answer) return null
  return {
    id,
    courseId,
    question,
    answer,
    aliases: strList(value.aliases),
    tags: strList(value.tags),
    author: str(value.author, '老师'),
    source: value.source === 'sediment' ? 'sediment' : 'teacher',
    createdAt: num(value.createdAt),
    updatedAt: num(value.updatedAt),
    citations: num(value.citations),
    helpful: num(value.helpful),
    unhelpful: num(value.unhelpful),
    recentUnhelpful:
      typeof value.recentUnhelpful === 'number' ? value.recentUnhelpful : undefined,
    chapter: optionalString(value.chapter),
    reviewNeeded: Boolean(value.reviewNeeded),
    reviewNote: optionalString(value.reviewNote),
    history: sanitizeFaqHistory(value.history),
  }
}

function sanitizeThread(value: unknown): Thread | null {
  if (!isRecord(value)) return null
  const student = isRecord(value.student) ? value.student : null
  const id = str(value.id)
  const courseId = str(value.courseId)
  const question = str(value.question)
  const status =
    value.status === 'pending' ||
    value.status === 'answered' ||
    value.status === 'ai' ||
    value.status === 'needs-info'
      ? value.status
      : null
  if (!id || !courseId || !student || !status) return null
  const studentId = str(student.id)
  const studentName = str(student.name)
  if (!studentId || !studentName) return null
  const thread: Thread = {
    id,
    courseId,
    question,
    createdAt: num(value.createdAt),
    status,
    student: {
      id: studentId,
      name: studentName,
      anonymous: Boolean(student.anonymous),
    },
  }
  if (value.kind === 'ask' || value.kind === 'same' || value.kind === 'follow-up') {
    thread.kind = value.kind
  }
  const parentThreadId = optionalString(value.parentThreadId)
  if (parentThreadId) thread.parentThreadId = parentThreadId
  const attachment = isRecord(value.attachment) ? value.attachment : null
  if (attachment) {
    const dataUrl =
      typeof attachment.dataUrl === 'string' && attachment.dataUrl.startsWith('data:image/')
        ? attachment.dataUrl
        : undefined
    const url =
      typeof attachment.url === 'string' && /^\/uploads\/img_[a-f0-9]+\.(jpg|jpeg|png|webp)$/i.test(attachment.url)
        ? attachment.url
        : undefined
    if (dataUrl || url) {
      thread.attachment = {
        ...(dataUrl ? { dataUrl } : {}),
        ...(url ? { url } : {}),
        name: str(attachment.name, '题目图片'),
        type: str(attachment.type, 'image/png'),
      }
    }
  }
  const external = isRecord(value.externalAnswer) ? value.externalAnswer : null
  if (external && typeof external.text === 'string') {
    thread.externalAnswer = {
      text: external.text,
      model: str(external.model),
      at: num(external.at),
    }
  }
  const aiAnswer = optionalString(value.aiAnswer)
  if (aiAnswer) thread.aiAnswer = aiAnswer
  if (value.confidence === 'high' || value.confidence === 'medium' || value.confidence === 'low') {
    thread.confidence = value.confidence
  }
  if (typeof value.confidenceScore === 'number') thread.confidenceScore = value.confidenceScore
  if (Array.isArray(value.sources)) thread.sources = strList(value.sources)
  const closestSource = optionalString(value.closestSource)
  if (closestSource) thread.closestSource = closestSource
  if (value.feedback === 'helpful' || value.feedback === 'unhelpful' || value.feedback === null) {
    thread.feedback = value.feedback
  }
  const escalation = isRecord(value.escalation) ? value.escalation : null
  if (escalation) {
    thread.escalation = {
      title: str(escalation.title),
      note: str(escalation.note),
      anonymous: Boolean(escalation.anonymous),
      urgency:
        escalation.urgency === 'today' || escalation.urgency === 'later'
          ? escalation.urgency
          : 'week',
      at: num(escalation.at),
      auto: Boolean(escalation.auto),
    }
  }
  const reply = isRecord(value.teacherReply) ? value.teacherReply : null
  if (reply && typeof reply.text === 'string' && typeof reply.by === 'string') {
    thread.teacherReply = {
      text: reply.text,
      by: reply.by,
      at: num(reply.at),
      faqId: optionalString(reply.faqId),
      recipientCount:
        typeof reply.recipientCount === 'number' ? reply.recipientCount : undefined,
    }
    const replyAttachment = isRecord(reply.attachment) ? reply.attachment : null
    if (
      replyAttachment &&
      typeof replyAttachment.url === 'string' &&
      /^\/uploads\/img_[a-f0-9]+\.(jpg|jpeg|png|webp)$/i.test(replyAttachment.url)
    ) {
      thread.teacherReply.attachment = {
        url: replyAttachment.url,
        name: str(replyAttachment.name, '老师附图'),
        type: str(replyAttachment.type, 'image/png'),
      }
    }
    if (reply.sedimentPrevious === null) {
      thread.teacherReply.sedimentPrevious = null
    } else if (isRecord(reply.sedimentPrevious)) {
      const previous = sanitizeFaq(reply.sedimentPrevious)
      if (previous) thread.teacherReply.sedimentPrevious = previous
    }
  }
  const resolvedAt = nullableNum(value.resolvedAt)
  if (resolvedAt !== null) thread.resolvedAt = resolvedAt
  const withdrawnAt = nullableNum(value.withdrawnAt)
  if (withdrawnAt !== null) thread.withdrawnAt = withdrawnAt
  if (typeof value.favorite === 'boolean') thread.favorite = value.favorite
  const clusterId = optionalString(value.clusterId)
  if (clusterId) thread.clusterId = clusterId
  if (typeof value.groupLocked === 'boolean') thread.groupLocked = value.groupLocked
  const teacherRequest = isRecord(value.teacherRequest) ? value.teacherRequest : null
  if (teacherRequest && typeof teacherRequest.text === 'string') {
    thread.teacherRequest = {
      text: teacherRequest.text,
      by: str(teacherRequest.by),
      at: num(teacherRequest.at),
    }
  }
  const studentSupplement = isRecord(value.studentSupplement) ? value.studentSupplement : null
  if (studentSupplement && typeof studentSupplement.text === 'string') {
    thread.studentSupplement = {
      text: studentSupplement.text,
      at: num(studentSupplement.at),
    }
  }
  return thread
}

function sanitizeCourse(value: unknown): Course | null {
  if (!isRecord(value)) return null
  const id = str(value.id)
  const name = str(value.name)
  if (!id || !name) return null
  const accent =
    value.accent === 'jade' ||
    value.accent === 'clay' ||
    value.accent === 'blue' ||
    value.accent === 'gold'
      ? value.accent
      : 'gold'
  return {
    id,
    name,
    shortName: str(value.shortName, name.slice(0, 10)),
    code: str(value.code),
    teacher: str(value.teacher, '未指定'),
    teacherTitle: str(value.teacherTitle, '任课教师'),
    accent,
    students: num(value.students),
    chapter: str(value.chapter),
  }
}

function sanitizeSchedule(value: unknown): ScheduleEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const course = str(item.course)
    const day = Math.round(num(item.day))
    const startSection = Math.round(num(item.startSection))
    const endSection = Math.round(num(item.endSection))
    if (!course || day < 1 || day > 7 || startSection < 1 || endSection < startSection) {
      return []
    }
    const entry: ScheduleEntry = {
      id: str(item.id, `restored-class-${index}`),
      course,
      teacher: str(item.teacher),
      room: str(item.room),
      day,
      startSection,
      endSection,
    }
    const weeks = optionalString(item.weeks)
    if (weeks) entry.weeks = weeks
    const startTime = optionalString(item.startTime)
    if (startTime) entry.startTime = startTime
    const endTime = optionalString(item.endTime)
    if (endTime) entry.endTime = endTime
    const matchedCourseId = optionalString(item.matchedCourseId)
    if (matchedCourseId) entry.matchedCourseId = matchedCourseId
    return [entry]
  })
}

function sanitizeScores(value: unknown): ScoreRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const course = str(item.course)
    const score = str(item.score)
    if (!course) return []
    return [
      {
        id: str(item.id, `restored-score-${index}`),
        course,
        score,
        credit: typeof item.credit === 'number' ? item.credit : null,
        semester: str(item.semester),
        kind: str(item.kind),
      },
    ]
  })
}

function sanitizeNotification(value: unknown): AppNotification | null {
  if (!isRecord(value)) return null
  const kind = str(value.kind) as NotificationKind
  const audience = value.audience === 'teacher' ? 'teacher' : 'student'
  const id = str(value.id)
  const recipientId = str(value.recipientId)
  const courseId = str(value.courseId)
  const threadId = str(value.threadId)
  const title = str(value.title)
  const body = str(value.body)
  if (!id || !recipientId || !courseId || !threadId || !title || !NOTIFICATION_KINDS.has(kind)) {
    return null
  }
  return {
    id,
    audience,
    recipientId,
    courseId,
    threadId,
    kind,
    title,
    body,
    createdAt: num(value.createdAt),
    read: Boolean(value.read),
  }
}

function sanitizeCourseNote(value: unknown): CourseNote | null {
  if (!isRecord(value)) return null
  const courseId = str(value.courseId)
  if (!courseId) return null
  return {
    courseId,
    teacher: str(value.teacher, '任课教师'),
    announcement: str(value.announcement),
    officeHours: str(value.officeHours),
    updatedAt: num(value.updatedAt),
  }
}

function sanitizeCourseNotes(value: unknown): CourseNote[] {
  if (!Array.isArray(value)) return []
  return value
    .map(sanitizeCourseNote)
    .filter((note): note is CourseNote => Boolean(note))
}

function sanitizeDaily(value: unknown): DailyMetric[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const date = str(item.date)
    if (!date) return []
    return [{ date, ai: num(item.ai), human: num(item.human) }]
  })
}

export function createBackup(data: AppData, profile: StudentProfile) {
  return JSON.stringify(
    {
      app: 'shishuo',
      schema: BACKUP_SCHEMA,
      exportedAt: new Date().toISOString(),
      data,
      profile,
    },
    null,
    2,
  )
}

export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) {
    throw new Error('备份文件超过 12MB，无法导入。')
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('备份文件不是合法的 JSON。')
  }
  if (!isRecord(raw) || raw.app !== 'shishuo') {
    throw new Error('这不是师说导出的完整备份。')
  }
  if (raw.schema !== BACKUP_SCHEMA) {
    throw new Error('备份格式版本不兼容，请生成新的备份。')
  }
  const rawData = isRecord(raw.data) ? raw.data : null
  if (!rawData) throw new Error('备份里没有问答数据。')
  if (
    rawData.version !== 4 &&
    rawData.version !== 5 &&
    rawData.version !== 6 &&
    rawData.version !== 7 &&
    rawData.version !== 8 &&
    rawData.version !== 9 &&
    rawData.version !== 10 &&
    rawData.version !== 11 &&
    rawData.version !== 12 &&
    rawData.version !== 13 &&
    rawData.version !== 14 &&
    rawData.version !== 15 &&
    rawData.version !== 16 &&
    rawData.version !== 17 &&
    rawData.version !== 18
  ) {
    throw new Error('备份的数据版本不兼容，需要师说当前版本导出的备份。')
  }
  if (!Array.isArray(rawData.threads) || !Array.isArray(rawData.faqs)) {
    throw new Error('备份里的问答或知识库结构不完整。')
  }
  const faqs = Array.from(
    new Map(
      rawData.faqs
        .map(sanitizeFaq)
        .filter((faq): faq is Faq => Boolean(faq))
        .map((faq) => [faq.id, faq]),
    ).values(),
  )
  const threads = rawData.threads
    .map(sanitizeThread)
    .filter((thread): thread is Thread => Boolean(thread))
  const notifications = Array.isArray(rawData.notifications)
    ? rawData.notifications
        .map(sanitizeNotification)
        .filter((item): item is AppNotification => Boolean(item))
    : []
  const daily = sanitizeDaily(rawData.daily)
  const seeded = rawData.version < 18 ? createSeedData() : null
  if (rawData.version < 17 && seeded) {
    if (rawData.version === 4 && !faqs.some((faq) => faq.id === 'faq-variable-upper')) {
      const v5Faq = seeded.faqs.find((faq) => faq.id === 'faq-variable-upper')
      if (v5Faq) faqs.push(v5Faq)
    }
    if (rawData.version < 6) {
      for (let index = 0; index < faqs.length; index += 1) {
        const faq = faqs[index]
        if (!LATEX_FAQ_IDS.includes(faq.id) || !/\^\{|_\{/.test(faq.answer)) continue
        const fresh = seeded.faqs.find((item) => item.id === faq.id)
        if (fresh) faqs[index] = { ...faq, answer: fresh.answer }
      }
    }
    if (rawData.version < 7) {
      for (const faq of seeded.faqs.filter((item) => LINALG_FAQ_IDS.includes(item.id))) {
        if (!faqs.some((item) => item.id === faq.id)) faqs.push(faq)
      }
    }
    for (const faq of seeded.faqs.filter((item) => PROB_FAQ_IDS.includes(item.id))) {
      if (!faqs.some((item) => item.id === faq.id)) faqs.push(faq)
    }
    for (let index = 0; index < faqs.length; index += 1) {
      const faq = faqs[index]
      if (!PROB_FAQ_IDS.includes(faq.id) || !/~N|~B/.test(faq.answer)) continue
      const fresh = seeded.faqs.find((item) => item.id === faq.id)
      if (fresh) faqs[index] = { ...faq, answer: fresh.answer }
    }
    for (const faq of seeded.faqs.filter((item) => DIGITAL_FAQ_IDS.includes(item.id))) {
      if (!faqs.some((item) => item.id === faq.id)) faqs.push(faq)
    }
    for (const faq of seeded.faqs.filter((item) => ANALOG_FAQ_IDS.includes(item.id))) {
      if (!faqs.some((item) => item.id === faq.id)) faqs.push(faq)
    }
    for (const faq of seeded.faqs.filter((item) => PHYSICS_FAQ_IDS.includes(item.id))) {
      if (!faqs.some((item) => item.id === faq.id)) faqs.push(faq)
    }
    for (const faq of seeded.faqs.filter((item) => CS_FAQ_IDS.includes(item.id))) {
      if (!faqs.some((item) => item.id === faq.id)) faqs.push(faq)
    }
    for (const faq of seeded.faqs.filter((item) => HOT_FAQ_IDS.includes(item.id))) {
      if (!faqs.some((item) => item.id === faq.id)) faqs.push(faq)
    }
    for (const faq of seeded.faqs.filter((item) => ENG_FAQ_IDS.includes(item.id))) {
      if (!faqs.some((item) => item.id === faq.id)) faqs.push(faq)
    }
    for (const faq of seeded.faqs.filter((item) => ARTS_FAQ_IDS.includes(item.id))) {
      if (!faqs.some((item) => item.id === faq.id)) faqs.push(faq)
    }
    for (const faq of seeded.faqs.filter((item) => ENG2_FAQ_IDS.includes(item.id))) {
      if (!faqs.some((item) => item.id === faq.id)) faqs.push(faq)
    }
  }
  if (rawData.version < 18 && seeded) {
    for (const faq of seeded.faqs.filter((item) => item.id.startsWith('faq-pilot-'))) {
      if (!faqs.some((item) => item.id === faq.id)) faqs.push(faq)
    }
  }
  const data: AppData = {
    version: 18,
    seededAt: num(rawData.seededAt, Date.now()),
    threads,
    faqs,
    daily,
    notifications,
    courseNotes: sanitizeCourseNotes(rawData.courseNotes),
    duplicatesMerged: num(rawData.duplicatesMerged),
    guideSeen: Boolean(rawData.guideSeen),
  }

  const rawProfile = isRecord(raw.profile) ? raw.profile : {}
  const profile = normalizeProfile({
    ...DEFAULT_PROFILE,
    name: str(rawProfile.name, DEFAULT_PROFILE.name),
    college: str(rawProfile.college, DEFAULT_PROFILE.college),
    major: str(rawProfile.major, DEFAULT_PROFILE.major),
    studentNo: str(rawProfile.studentNo),
    defaultCourseId: str(rawProfile.defaultCourseId, DEFAULT_PROFILE.defaultCourseId),
    schedule: sanitizeSchedule(rawProfile.schedule),
    scheduleSource:
      rawProfile.scheduleSource === 'jw' || rawProfile.scheduleSource === 'manual'
        ? rawProfile.scheduleSource
        : null,
    scheduleSyncedAt: nullableNum(rawProfile.scheduleSyncedAt),
    termStart: nullableNum(rawProfile.termStart),
    scores: sanitizeScores(rawProfile.scores),
    scoresSyncedAt: nullableNum(rawProfile.scoresSyncedAt),
    customCourses: Array.isArray(rawProfile.customCourses)
      ? rawProfile.customCourses
          .map(sanitizeCourse)
          .filter((course): course is Course => Boolean(course))
      : [],
    hiddenTeacherNames: strList(rawProfile.hiddenTeacherNames),
  })

  return {
    data,
    profile,
    exportedAt: str(raw.exportedAt),
    summary: {
      threads: threads.length,
      faqs: faqs.length,
      schedule: profile.schedule.length,
      scores: profile.scores.length,
    },
  }
}