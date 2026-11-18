import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  Copy,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
} from 'lucide-react'
import { apiGet } from '../../lib/api'
import { copyText } from '../../lib/utils'
import type { HealthInfo } from '../../data/adminTypes'

interface AdminSystemPanelProps {
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

const API_ROWS = [
  ['GET', '/api/health', '服务健康、AI 配置、演示账号、工作区 revision'],
  ['GET', '/api/admin/users', '账号列表'],
  ['POST', '/api/admin/users', '创建学生 / 教师账号'],
  ['PATCH', '/api/admin/users/:id', '修改姓名 / 课程分配'],
  ['POST', '/api/admin/users/:id/password', '重置密码并注销旧会话'],
  ['GET', '/api/admin/audit?limit=200', '操作审计'],
  ['GET', '/api/admin/workspace-summary', '全量内容统计（FAQ / 校园 / 待处理）'],
  ['GET', '/api/admin/ai-usage', 'AI 调用与 Token 用量'],
  ['GET', '/api/admin/archived-threads', '归档问答'],
  ['GET', '/api/state', '当前账号可见的工作区'],
  ['GET', '/api/state/revision', '轻量 revision 探测'],
]

export function AdminSystemPanel({ notify }: AdminSystemPanelProps) {
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      setHealth(await apiGet<HealthInfo>('/api/health'))
    } catch (err) {
      setError(err instanceof Error ? err.message : '健康检查失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadHealth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const copy = async (text: string, label: string) => {
    try {
      await copyText(text)
      notify(`${label}已复制。`)
    } catch {
      notify('复制失败，请手动选择文本。', 'danger')
    }
  }

  return (
    <div className="admin-panel admin-panel-system">
      <div className="admin-panel-toolbar">
        <div>
          <strong>系统与开发</strong>
          <span>健康状态、接口索引、备份与部署速查；给后续开发和运维用</span>
        </div>
        <div className="admin-panel-actions">
          <button className="button button-ghost" onClick={() => void loadHealth()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-icon' : undefined} />
            刷新健康
          </button>
        </div>
      </div>

      {error && (
        <div className="inline-note danger admin-error">
          <CircleAlert size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <span>服务状态</span>
          <strong>{health?.ok ? '正常' : '未知'}</strong>
          <em>{health?.service ?? 'shishuo'}</em>
        </div>
        <div className="admin-stat-card">
          <span>工作区 revision</span>
          <strong>{health?.workspaceRevision ?? '—'}</strong>
          <em>乐观锁版本</em>
        </div>
        <div className={`admin-stat-card ${health?.aiConfigured ? '' : 'is-warn'}`}>
          <span>AI 网关</span>
          <strong>{health?.aiConfigured ? '已配置' : '未配置'}</strong>
          <em>Key 只保存在服务端</em>
        </div>
        <div className="admin-stat-card">
          <span>演示账号</span>
          <strong>{health?.demoAccounts ? '开启' : '关闭'}</strong>
          <em>{health?.teacherRegistration ? '教师自助注册开启' : '教师注册关闭'}</em>
        </div>
      </div>

      <div className="admin-system-grid">
        <section className="admin-content-card">
          <div className="admin-content-head">
            <div>
              <strong>管理端接口索引</strong>
              <span>新增管理功能时，优先复用这些服务端路由</span>
            </div>
            <Server size={16} />
          </div>
          <div className="admin-api-table">
            {API_ROWS.map(([method, path, note]) => (
              <div className="admin-api-row" key={`${method}-${path}`}>
                <span className={`admin-method is-${method.toLowerCase()}`}>{method}</span>
                <code>{path}</code>
                <em>{note}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-content-card">
          <div className="admin-content-head">
            <div>
              <strong>部署与备份速查</strong>
              <span>生产环境命令；执行前先确认备份路径</span>
            </div>
            <Terminal size={16} />
          </div>
          <div className="admin-command-list">
            <div className="admin-command-row">
              <div>
                <strong>构建</strong>
                <code>cd /opt/shishuo && npm run build</code>
              </div>
              <button
                className="icon-button"
                aria-label="复制构建命令"
                onClick={() => void copy('cd /opt/shishuo && npm run build', '构建命令')}
              >
                <Copy size={14} />
              </button>
            </div>
            <div className="admin-command-row">
              <div>
                <strong>重启服务</strong>
                <code>systemctl restart shishuo</code>
              </div>
              <button
                className="icon-button"
                aria-label="复制重启命令"
                onClick={() => void copy('systemctl restart shishuo', '重启命令')}
              >
                <Copy size={14} />
              </button>
            </div>
            <div className="admin-command-row">
              <div>
                <strong>数据库快照</strong>
                <code>sqlite3 data/shishuo.db ".backup backups/shishuo.db"</code>
              </div>
              <button
                className="icon-button"
                aria-label="复制备份命令"
                onClick={() =>
                  void copy(
                    'sqlite3 /opt/shishuo/data/shishuo.db ".backup /opt/shishuo/backups/shishuo-$(date +%Y%m%d-%H%M%S).db"',
                    '备份命令',
                  )
                }
              >
                <Copy size={14} />
              </button>
            </div>
            <div className="admin-command-row">
              <div>
                <strong>导入校园 FAQ</strong>
                <code>node dev/import-campus-faqs.mjs --db … --apply</code>
              </div>
              <button
                className="icon-button"
                aria-label="复制导入命令"
                onClick={() =>
                  void copy(
                    'node dev/import-campus-faqs.mjs --db /opt/shishuo/data/shishuo.db --apply --backup-dir /opt/shishuo/backups',
                    '导入命令',
                  )
                }
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="admin-content-card">
        <div className="admin-content-head">
          <div>
            <strong>安全与上线检查</strong>
            <span>管理端代码改动前后都建议过一遍</span>
          </div>
          <ShieldCheck size={16} />
        </div>
        <ul className="admin-check-list">
          <li>
            <CheckCircle2 size={14} />
            `.env` 权限保持 600，管理接口只允许 `is_admin` 账号访问。
          </li>
          <li>
            <CheckCircle2 size={14} />
            纯 HTTP 环境不要设置 `NODE_ENV=production`；否则 Secure Cookie 会导致登录态失效。
          </li>
          <li>
            <CheckCircle2 size={14} />
            生产 AI 默认 OpenAI 端点不可达，需同时配 `AI_BASE_URL` + `AI_MODEL`。
          </li>
          <li>
            <CheckCircle2 size={14} />
            改管理端代码后至少跑 `npm run build`、`npm run test:api`、`npm run eval:retrieval`。
          </li>
          <li>
            <CheckCircle2 size={14} />
            新增管理动作时，在 `server/permissions.mjs` / `server/api.mjs` 补权限与审计，不要只做前端隐藏。
          </li>
        </ul>
        <p className="admin-panel-note-inline">
          开发说明见仓库 `docs/admin-console.md`；管理端代码在 `src/views/admin/`，接口类型在
          `src/data/adminTypes.ts`。
        </p>
      </section>
    </div>
  )
}
