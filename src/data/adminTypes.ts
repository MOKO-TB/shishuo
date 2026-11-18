/** 管理台共享类型。接口字段与 server/api.mjs 的 /api/admin/* 返回保持一致。 */

export interface AdminUser {
  id: string
  email: string
  name: string
  role: 'student' | 'teacher'
  courses: string[]
  isAdmin: boolean
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

export type AdminTab =
  | 'overview'
  | 'users'
  | 'audit'
  | 'usage'
  | 'content'
  | 'system'
