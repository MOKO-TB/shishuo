/** 管理台共享类型。接口字段与 server/api.mjs 的 /api/admin/* 返回保持一致。 */

export type UserStatus = 'active' | 'muted' | 'banned'

export interface AdminUser {
  id: string
  email: string
  name: string
  role: 'student' | 'teacher'
  courses: string[]
  isAdmin: boolean
  status: UserStatus
  statusReason: string
  statusUntil: number | null
  statusUpdatedAt: number | null
  createdAt: number
}

export interface AuditEntry {
  id: number
  revision: number
  userId: string
  userName: string
  role: string
  actions: string[]
  courseIds: string[]
  summary: string
  mode: string | null
  createdAt: number
}

export interface AiUsageDay {
  date: string
  calls: number
  tokens: number
  errors: number
}

export interface AiUsageUser {
  userId: string
  name: string
  role: string
  calls: number
  tokens: number
}

export interface AiUsageSummary {
  configured: boolean
  model: string
  dailyLimit: number
  totals: { calls: number; tokens: number; errors: number; callsToday: number }
  days: AiUsageDay[]
  topUsers: AiUsageUser[]
}

export interface HealthInfo {
  ok: boolean
  service: string
  aiConfigured: boolean
  demoAccounts: boolean
  teacherRegistration: boolean
  workspaceRevision: number
}

export interface WorkspaceSummary {
  revision: number
  updatedAt: number
  faqs: {
    total: number
    byCourse: Record<string, number>
    campus: {
      total: number
      verified: number
      unverified: number
      noSource: number
      categories: Record<string, { total: number; unverified: number }>
    }
  }
  threads: {
    total: number
    pending: number
    campusTotal: number
    campusPending: number
  }
  courseNotes: number
}

export interface ModerationTerm {
  id: number
  term: string
  category: string
  enabled: boolean
  createdBy: string
  createdAt: number
}

export interface ModerationOverview {
  terms: { total: number; enabled: number }
  users: { muted: number; banned: number }
  images: { total: number; pending: number; approved: number; rejected: number }
  threads: { total: number; withImages: number; flagged: number; withdrawn: number }
}

export interface ModerationThread {
  id: string
  courseId: string
  student: { id: string; name: string; anonymous: boolean }
  question: string
  createdAt: number
  status: string
  withdrawn: boolean
  attachment: {
    url: string
    name: string
    type: string
    review: ReviewStatus
    reason: string
  } | null
  matchedTerm: string | null
  review: ReviewStatus
  reviewReason: string
}

export interface ModerationImage {
  url: string
  name: string
  type: string
  threadId: string
  courseId: string
  question: string
  createdAt: number
  student: { id: string; name: string; anonymous: boolean }
  review: ReviewStatus
  reason: string
  reviewedBy: string
  reviewedAt: number | null
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export type AdminTab =
  | 'overview'
  | 'users'
  | 'moderation'
  | 'audit'
  | 'usage'
  | 'content'
  | 'system'
