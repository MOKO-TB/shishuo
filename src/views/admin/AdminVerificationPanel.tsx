import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { apiGet, apiPost } from '../../lib/api'
import { Badge, Modal } from '../../components/ui'
import type { CampusVerificationItem, CampusVerificationSummary } from '../../data/adminTypes'
import { shortTime } from './helpers'

interface AdminVerificationPanelProps {
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

type Filter = 'all' | 'unverified' | 'overdue' | 'soon'

function statusLabel(status: string) {
  if (status === 'unverified') return '待核实'
  if (status === 'overdue') return '已过期'
  if (status === 'soon') return '即将到期'
  return '正常'
}

function statusTone(status: string) {
  if (status === 'unverified') return 'medium' as const
  if (status === 'overdue') return 'danger' as const
  if (status === 'soon') return 'gold' as const
  return 'jade' as const
}

function dateOnly(ts: number | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function AdminVerificationPanel({ notify }: AdminVerificationPanelProps) {
  const [items, setItems] = useState<CampusVerificationItem[]>([])
  const [summary, setSummary] = useState<CampusVerificationSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('unverified')
  const [query, setQuery] = useState('')
  const [verifying, setVerifying] = useState<CampusVerificationItem | null>(null)
  const [intervalDays, setIntervalDays] = useState(90)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiGet<{
        summary: CampusVerificationSummary
        items: CampusVerificationItem[]
      }>('/api/admin/campus/verification')
      setSummary(result.summary)
      setItems(result.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : '复核数据加载失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return items.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false
      if (!normalized) return true
      return [item.question, item.category, item.credibility, item.sourceChannel]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    })
  }, [filter, items, query])

  const openVerify = (item: CampusVerificationItem) => {
    setVerifying(item)
    setIntervalDays(item.reviewIntervalDays || 90)
    setNote('')
  }

  const submitVerify = async () => {
    if (!verifying || saving) return
    setSaving(true)
    try {
      await apiPost(`/api/admin/campus/faqs/${encodeURIComponent(verifying.id)}/verify`, {
        intervalDays,
        note,
      })
      setVerifying(null)
      await load()
      notify(`已核实《${verifying.question}》，下次复核 ${dateOnly(Date.now() + intervalDays * 86_400_000)}。`)
    } catch (err) {
      notify(err instanceof Error ? err.message : '核实失败。', 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-panel admin-panel-verification">
      <div className="admin-panel-toolbar">
        <div>
          <strong>内容核实</strong>
          <span>校园 FAQ 的核实状态与下次复核时间；服务端每 6 小时检查一次，每天写一条到期提醒</span>
        </div>
        <div className="admin-panel-actions">
          <button className="button button-ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-icon' : undefined} />
            刷新
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
        <div className="admin-stat-card is-warn">
          <span>待核实</span>
          <strong>{summary?.unverified ?? '—'}</strong>
          <em>从未标记核实</em>
        </div>
        <div className="admin-stat-card">
          <span>已过期</span>
          <strong>{summary?.overdue ?? '—'}</strong>
          <em>超过复核周期</em>
        </div>
        <div className="admin-stat-card">
          <span>14 天内到期</span>
          <strong>{summary?.soon ?? '—'}</strong>
          <em>建议本周处理</em>
        </div>
        <div className="admin-stat-card">
          <span>正常</span>
          <strong>{summary?.ok ?? '—'}</strong>
          <em>共 {summary?.total ?? 0} 条校园 FAQ</em>
        </div>
      </div>

      <div className="admin-filter-bar">
        <label className="admin-search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜问题、分类、来源…"
            aria-label="搜索校园核实"
          />
        </label>
        <div className="admin-mod-tabs admin-verification-filters" role="tablist">
          {([
            ['all', '全部'],
            ['unverified', '待核实'],
            ['overdue', '已过期'],
            ['soon', '即将到期'],
          ] as Array<[Filter, string]>).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? 'is-active' : ''}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="knowledge-result">{visible.length} 条</span>
      </div>

      <div className="admin-verification-list">
        {visible.length === 0 ? (
          <p className="admin-empty">没有匹配的校园 FAQ。</p>
        ) : (
          visible.map((item) => (
            <article className="admin-verification-row" key={item.id}>
              <div className="admin-verification-main">
                <div className="admin-verification-top">
                  <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  <Badge tone="gold">{item.category}</Badge>
                  {item.credibility && <span className="admin-verification-cred">{item.credibility}</span>}
                  <em>{item.sourceChannel || '未标注来源'}</em>
                </div>
                <strong>{item.question}</strong>
                <div className="admin-verification-meta">
                  <span>上次核实：{dateOnly(item.lastVerifiedAt)}</span>
                  <span>下次复核：{dateOnly(item.nextReviewAt)}</span>
                  <span>周期：{item.reviewIntervalDays} 天</span>
                  {item.verifiedBy && <span>核实人：{item.verifiedBy}</span>}
                </div>
              </div>
              <div className="admin-verification-actions">
                <button className="button button-primary" onClick={() => openVerify(item)}>
                  <CheckCircle2 size={14} />
                  标记已核实
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="admin-panel-note">
        <CalendarClock size={14} />
        <span>
          手动报告可用 `npm run review:campus -- --db /opt/shishuo/data/shishuo.db`；服务端每天会把待核实/过期数量写进操作审计。
        </span>
      </div>

      <Modal
        open={Boolean(verifying)}
        onClose={() => setVerifying(null)}
        title="标记已核实"
        eyebrow="校园内容复核"
        footer={
          <div className="modal-actions">
            <button className="button button-ghost" onClick={() => setVerifying(null)}>
              取消
            </button>
            <button className="button button-primary" onClick={() => void submitVerify()} disabled={saving}>
              {saving ? '保存中…' : '确认核实'}
            </button>
          </div>
        }
      >
        <div className="admin-verify-form">
          <p className="admin-verify-question">{verifying?.question}</p>
          <label className="field">
            <span className="field-label">下次复核周期</span>
            <select
              className="input"
              value={intervalDays}
              onChange={(event) => setIntervalDays(Number(event.target.value))}
            >
              <option value={30}>30 天（政策/截止日期类）</option>
              <option value={90}>90 天（常规校园信息）</option>
              <option value={180}>180 天（稳定经验/流程）</option>
              <option value={365}>365 天（长期有效）</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">核实备注（可选）</span>
            <textarea
              className="input"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="例如：已对照学校官网 2026-11 通知；电话未核实…"
            />
          </label>
          <div className="admin-panel-note-inline">
            <ShieldCheck size={13} /> 核实会清除「待核实」标记、写入核实人和下次复核时间，并记录审计。
          </div>
        </div>
      </Modal>
    </div>
  )
}
