import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CircleAlert,
  Compass,
  Inbox,
  LayoutDashboard,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { apiGet } from '../../lib/api'
import { useAuth } from '../../auth'
import { EmptyState, Badge } from '../../components/ui'
import type {
  AdminTab,
  AdminUser,
  AuditEntry,
  HealthInfo,
  WorkspaceSummary,
} from '../../data/adminTypes'
import type { ViewKey } from '../../types'
import { ACTION_LABELS, formatNumber, roleLabel, shortTime } from './helpers'
import { AdminUsersPanel } from './AdminUsersPanel'
import { AdminModerationPanel } from './AdminModerationPanel'
import { AdminCampusPanel } from './AdminCampusPanel'
import { AdminAuditPanel } from './AdminAuditPanel'
import { AdminUsagePanel } from './AdminUsagePanel'
import { AdminContentPanel } from './AdminContentPanel'
import { AdminVerificationPanel } from './AdminVerificationPanel'
import { AdminSystemPanel } from './AdminSystemPanel'

interface AdminConsoleViewProps {
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  onNavigate: (view: ViewKey) => void
  onOpenBackup: () => void
}

const TABS: Array<{ key: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'overview', label: '概览', icon: LayoutDashboard },
  { key: 'users', label: '账号管理', icon: Users },
  { key: 'moderation', label: '风控审核', icon: ShieldAlert },
  { key: 'campus', label: '学生问答', icon: Inbox },
  { key: 'audit', label: '操作审计', icon: ShieldCheck },
  { key: 'usage', label: 'AI 用量', icon: Activity },
  { key: 'content', label: '内容运营', icon: Compass },
  { key: 'verification', label: '内容核实', icon: CalendarClock },
  { key: 'system', label: '系统与开发', icon: Server },
]

export function AdminConsoleView({
  notify,
  onNavigate,
  onOpenBackup,
}: AdminConsoleViewProps) {
  const { user } = useAuth()
  const [tab, setTab] = useState<AdminTab>('overview')
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [recentAudit, setRecentAudit] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [healthResult, summaryResult, usersResult, auditResult] = await Promise.all([
        apiGet<HealthInfo>('/api/health'),
        apiGet<WorkspaceSummary>('/api/admin/workspace-summary'),
        apiGet<{ users: AdminUser[] }>('/api/admin/users'),
        apiGet<{ logs: AuditEntry[] }>('/api/admin/audit?limit=6'),
      ])
      setHealth(healthResult)
      setSummary(summaryResult)
      setUsers(usersResult.users)
      setRecentAudit(auditResult.logs)
    } catch (err) {
      setError(err instanceof Error ? err.message : '管理台数据加载失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user?.isAdmin) return
    void loadOverview()
  }, [loadOverview, user?.isAdmin])

  const stats = useMemo(() => {
    const admins = users.filter((item) => item.isAdmin).length
    const faqs = summary?.faqs.total ?? 0
    const campusFaqs = summary?.faqs.campus.total ?? 0
    return {
      users: users.length,
      teachers: users.filter((item) => item.role === 'teacher').length,
      students: users.filter((item) => item.role === 'student').length,
      admins,
      faqs,
      campusFaqs,
      courseFaqs: Math.max(0, faqs - campusFaqs),
      pending: summary?.threads.pending ?? 0,
      campusPending: summary?.threads.campusPending ?? 0,
    }
  }, [summary, users])

  if (!user?.isAdmin) {
    return (
      <div className="page admin-page">
        <div className="card">
          <EmptyState
            icon={<ShieldCheck size={20} />}
            title="需要管理员账号"
            description="管理台只对管理员开放。请用管理员账号登录，或回到学生 / 教师空间。"
            action={
              <button className="button button-primary" onClick={() => onNavigate('student')}>
                回到学生空间
              </button>
            }
          />
        </div>
      </div>
    )
  }

  const quickActions: Array<{
    tab: AdminTab
    label: string
    description: string
    icon: typeof LayoutDashboard
  }> = [
    {
      tab: 'users',
      label: '账号管理',
      description: '创建账号、分配课程、重置密码',
      icon: Users,
    },
    {
      tab: 'moderation',
      label: '风控审核',
      description: '敏感词、图片、禁言封禁与内容队列',
      icon: ShieldAlert,
    },
    {
      tab: 'campus',
      label: '学生问答',
      description: '查看学生问题，校园主理人回复',
      icon: Inbox,
    },
    {
      tab: 'audit',
      label: '操作审计',
      description: '查看谁在什么时候改了什么',
      icon: ShieldCheck,
    },
    {
      tab: 'usage',
      label: 'AI 用量',
      description: '调用量、Token、失败与配额',
      icon: Activity,
    },
    {
      tab: 'content',
      label: '内容运营',
      description: '课程与校园知识域的健康度',
      icon: Compass,
    },
    {
      tab: 'verification',
      label: '内容核实',
      description: '校园 FAQ 复核计划与到期提醒',
      icon: CalendarClock,
    },
    {
      tab: 'system',
      label: '系统与开发',
      description: '接口索引、备份命令、上线检查',
      icon: Server,
    },
  ]

  return (
    <div className="page admin-page">
      <header className="admin-console-head">
        <div className="admin-console-head-main">
          <div className="eyebrow">
            <span className="eyebrow-mark jade" />
            管理端
            <span className="eyebrow-sep">/</span>
            运营与安全
          </div>
          <h1 className="display-title">
            把账号、内容与系统，
            <br />
            <span>放在一个地方。</span>
          </h1>
          <p className="page-lede">
            管理台只对管理员开放：账号与课程分配、操作审计、AI 用量、内容运营和系统信息都在这里。
            学生端和教师端保持独立，管理端不改变它们的日常流程。
          </p>
        </div>

        <aside className="admin-console-head-card card">
          <div className="admin-console-user">
            <span className="admin-console-avatar">{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <Badge tone="gold">管理员</Badge>
          </div>
          <div className="admin-console-health">
            <div>
              <span>服务</span>
              <strong>{health?.ok ? '正常' : '加载中'}</strong>
            </div>
            <div>
              <span>revision</span>
              <strong>{health?.workspaceRevision ?? '—'}</strong>
            </div>
            <div>
              <span>AI</span>
              <strong className={health?.aiConfigured ? '' : 'is-warn'}>
                {health?.aiConfigured ? '已配置' : '未配置'}
              </strong>
            </div>
          </div>
          <button className="button button-ghost admin-refresh" onClick={() => void loadOverview()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-icon' : undefined} />
            刷新概览
          </button>
        </aside>
      </header>

      <nav className="admin-tabs admin-console-tabs" role="tablist" aria-label="管理台">
        {TABS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? 'is-active' : ''}
              onClick={() => setTab(item.key)}
            >
              <Icon size={15} />
              {item.label}
            </button>
          )
        })}
      </nav>

      {error && (
        <div className="inline-note danger admin-error">
          <CircleAlert size={14} />
          <span>{error}</span>
        </div>
      )}

      {tab === 'overview' && (
        <div className="admin-overview">
          <div className="admin-stat-grid">
            <div className="admin-stat-card">
              <span>账号</span>
              <strong>{stats.users}</strong>
              <em>
                {stats.teachers} 教师 · {stats.students} 学生 · {stats.admins} 管理员
              </em>
            </div>
            <div className="admin-stat-card">
              <span>FAQ 总数</span>
              <strong>{formatNumber(stats.faqs)}</strong>
              <em>课程 {stats.courseFaqs} · 校园 {stats.campusFaqs}</em>
            </div>
            <div className="admin-stat-card">
              <span>待处理问答</span>
              <strong>{stats.pending}</strong>
              <em>其中校园 {stats.campusPending} 条</em>
            </div>
            <div className={`admin-stat-card ${health?.aiConfigured ? '' : 'is-warn'}`}>
              <span>AI 网关</span>
              <strong>{health?.aiConfigured ? '已配置' : '未配置'}</strong>
              <em>{health?.aiConfigured ? `revision ${health.workspaceRevision}` : '需 AI_BASE_URL + Key'}</em>
            </div>
          </div>

          <div className="admin-quick-grid">
            {quickActions.map((item) => {
              const Icon = item.icon
              return (
                <button className="admin-quick-card" key={item.tab} onClick={() => setTab(item.tab)}>
                  <span className="admin-quick-icon">
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    <em>{item.description}</em>
                  </span>
                  <ArrowRight size={15} />
                </button>
              )
            })}
          </div>

          <div className="admin-overview-grid">
            <section className="admin-content-card">
              <div className="admin-content-head">
                <div>
                  <strong>最近操作</strong>
                  <span>最新 6 条审计记录</span>
                </div>
                <button className="text-button" onClick={() => setTab('audit')}>
                  查看全部
                  <ArrowRight size={13} />
                </button>
              </div>
              {recentAudit.length === 0 ? (
                <p className="admin-empty">还没有操作记录。</p>
              ) : (
                <div className="admin-recent-audit">
                  {recentAudit.map((entry) => (
                    <div className="admin-recent-row" key={entry.id}>
                      <span className="admin-recent-user">
                        {entry.userName}
                        <em>{roleLabel(entry.role)}</em>
                      </span>
                      <span className="admin-recent-summary">{entry.summary}</span>
                      <span className="admin-recent-time">{shortTime(entry.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="admin-content-card">
              <div className="admin-content-head">
                <div>
                  <strong>工作区概览</strong>
                  <span>当前管理台能看到的内容域</span>
                </div>
                <Sparkles size={16} />
              </div>
              <div className="admin-workspace-links">
                <button onClick={() => setTab('campus')}>
                  <Inbox size={16} />
                  <span>
                    <strong>学生问答</strong>
                    <em>{stats.campusPending} 条校园待回复 · 共 {stats.campusFaqs} 条校园 FAQ</em>
                  </span>
                  <ArrowRight size={14} />
                </button>
                <button onClick={() => onNavigate('knowledge')}>
                  <BookOpen size={16} />
                  <span>
                    <strong>课程知识库</strong>
                    <em>{stats.courseFaqs} 条课程 FAQ</em>
                  </span>
                  <ArrowRight size={14} />
                </button>
                <button onClick={onOpenBackup}>
                  <Server size={16} />
                  <span>
                    <strong>数据备份</strong>
                    <em>导出 / 恢复共享工作区</em>
                  </span>
                  <ArrowRight size={14} />
                </button>
              </div>
              <p className="admin-panel-note-inline">
                校园生活问题现在由管理员在「学生问答」里以校园主理人身份回复；课程问题仍由对应任课教师在教师端处理。
              </p>
            </section>
          </div>
        </div>
      )}

      {tab === 'users' && <AdminUsersPanel notify={notify} />}
      {tab === 'moderation' && <AdminModerationPanel notify={notify} />}
      {tab === 'campus' && <AdminCampusPanel notify={notify} />}
      {tab === 'audit' && <AdminAuditPanel />}
      {tab === 'usage' && <AdminUsagePanel notify={notify} />}
      {tab === 'content' && (
        <AdminContentPanel
          onNavigate={onNavigate}
          onOpenBackup={onOpenBackup}
          onOpenCampusInbox={() => setTab('campus')}
          onOpenVerification={() => setTab('verification')}
        />
      )}
      {tab === 'verification' && <AdminVerificationPanel notify={notify} />}
      {tab === 'system' && <AdminSystemPanel notify={notify} />}
    </div>
  )
}
