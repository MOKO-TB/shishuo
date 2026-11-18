export type Role = 'student' | 'teacher'
export type ViewKey =
  | 'student'
  | 'teacher'
  | 'knowledge'
  | 'campus'
  | 'insights'
  | 'about'
  | 'schedule'
export type Confidence = 'high' | 'medium' | 'low'
export type ThreadStatus = 'ai' | 'pending' | 'needs-info' | 'answered'
export type ThreadKind = 'ask' | 'same' | 'follow-up'
export type Urgency = 'today' | 'week' | 'later'
export type CourseAccent = 'jade' | 'clay' | 'blue' | 'gold'

export interface Course {
  id: string
  name: string
  shortName: string
  code: string
  teacher: string
  teacherTitle: string
  accent: CourseAccent
  students: number
  chapter: string
}

export interface FaqPrefill {
  courseId: string
  question: string
  answer: string
  tags: string[]
  chapter?: string
}

export interface FaqVersion {
  question: string
  answer: string
  tags: string[]
  aliases: string[]
  chapter?: string
  author: string
  updatedAt: number
}

export interface Faq {
  id: string
  courseId: string
  question: string
  aliases: string[]
  answer: string
  tags: string[]
  author: string
  source: 'teacher' | 'sediment'
  createdAt: number
  updatedAt: number
  citations: number
  helpful: number
  unhelpful: number
  /** Negative votes collected since the teacher last edited this answer. */
  recentUnhelpful?: number
  chapter?: string
  reviewNeeded?: boolean
  reviewNote?: string
  /** 校园知识卡来源可信度（引路学长 A/B/C/D），课程 FAQ 不填。 */
  credibility?: string
  /** 校园知识卡原文链接；课程 FAQ 不填。 */
  sourceUrl?: string
  /** 校园知识卡来源渠道，例如「学校官网-考研喜报」。 */
  sourceChannel?: string
  /** 校园知识卡采集日期，YYYY-MM-DD。 */
  collectedAt?: string
  /** Last few snapshots before teacher edits; newest first. */
  history?: FaqVersion[]
}

export interface StudentRef {
  id: string
  name: string
  anonymous: boolean
}

export interface ThreadAttachment {
  /** Local preview while composing; not stored once uploaded. */
  dataUrl?: string
  /** Object-storage URL stored with the thread. */
  url?: string
  name: string
  type: string
}

export interface ExternalAnswer {
  text: string
  model: string
  at: number
}

export type NotificationAudience = 'student' | 'teacher'
export type NotificationKind =
  | 'teacher-reply'
  | 'question-escalated'
  | 'same-question-joined'
  | 'teacher-new-question'
  | 'teacher-same-question'
  | 'teacher-follow-up'
  | 'teacher-faq-review'
  | 'teacher-question-resolved'
  | 'teacher-question-withdrawn'
  | 'teacher-needs-info'
  | 'teacher-supplement'

export interface AppNotification {
  id: string
  audience: NotificationAudience
  recipientId: string
  courseId: string
  threadId: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: number
  read: boolean
}

export interface Escalation {
  title: string
  note: string
  anonymous: boolean
  urgency: Urgency
  at: number
  auto?: boolean
}

export interface TeacherReply {
  text: string
  at: number
  by: string
  faqId?: string
  recipientCount?: number
  /** Stored image URL, uploaded through the same object store as question images. */
  attachment?: ThreadAttachment
  /** Snapshot of the FAQ this reply sedimented: null when the FAQ was newly created. */
  sedimentPrevious?: Faq | null
}

export interface TeacherInfoRequest {
  text: string
  at: number
  by: string
}

export interface StudentSupplement {
  text: string
  at: number
}

export interface Thread {
  id: string
  courseId: string
  student: StudentRef
  question: string
  createdAt: number
  status: ThreadStatus
  kind?: ThreadKind
  parentThreadId?: string
  attachment?: ThreadAttachment
  externalAnswer?: ExternalAnswer
  aiAnswer?: string
  confidence?: Confidence
  confidenceScore?: number
  sources?: string[]
  closestSource?: string
  feedback?: 'helpful' | 'unhelpful' | null
  escalation?: Escalation
  teacherReply?: TeacherReply
  /** Teacher asked the student for more context before answering. */
  teacherRequest?: TeacherInfoRequest
  /** Student's answer to a teacher info request. */
  studentSupplement?: StudentSupplement
  /** True when a teacher manually locked the thread into its own group. */
  groupLocked?: boolean
  /** When the student confirmed the answer actually solved the problem. */
  resolvedAt?: number
  /** When the student pulled their own question out of the teacher queue. */
  withdrawnAt?: number
  /** Pinned in the student's question archive. */
  favorite?: boolean
  clusterId?: string
}

export interface DailyMetric {
  date: string
  ai: number
  human: number
}

export interface CourseNote {
  courseId: string
  teacher: string
  announcement: string
  officeHours: string
  updatedAt: number
}

export interface AppData {
  version: number
  seededAt: number
  threads: Thread[]
  faqs: Faq[]
  daily: DailyMetric[]
  notifications: AppNotification[]
  courseNotes: CourseNote[]
  duplicatesMerged: number
  guideSeen: boolean
}

export interface ScoredFaq {
  faq: Faq
  score: number
}

export interface AnswerResult {
  confidence: Confidence
  score: number
  matches: ScoredFaq[]
  top?: ScoredFaq
  answer?: string
  closestSource?: string
  sourceIds: string[]
  reason: string
  reviewNote?: string
  missingTerms?: string[]
}

export interface ThreadGroup {
  key: string
  threads: Thread[]
  primary: Thread
  count: number
  urgency: Urgency
  confidence?: Confidence
  courseId: string
  title: string
  studentNames: string[]
  anonymousCount: number
  sourceFaqIds: string[]
  latestAt: number
  oldestAt: number
  /** A teacher manually merged or split this group; ignore heuristic auto-merge. */
  locked: boolean
}

export interface KnowledgeGap {
  id: string
  groupKey: string
  courseId: string
  topic: string
  count: number
  reason: 'low' | 'review'
  sourceFaqId?: string
  note?: string
}
