import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CircleAlert,
  Database,
  Inbox,
  MessageCircleQuestion,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { apiGet } from '../../lib/api'
import { PILOT_COURSE_IDS } from '../../data/pilot'
import { courseById } from '../../data/seed'
import type { WorkspaceSummary } from '../../data/adminTypes'
import type { ViewKey } from '../../types'
import { courseLabel, formatNumber } from './helpers'

interface AdminContentPanelProps {
  onNavigate: (view: ViewKey) => void
  onOpenBackup: () => void
  onOpenCampusInbox: () => void
  onOpenVerification: () => void
}

const PILOT_SET = new Set<string>(PILOT_COURSE_IDS)

export function AdminContentPanel({
  onNavigate,
  onOpenBackup,
  onOpenCampusInbox,
  onOpenVerification,
}: AdminContentPanelProps) {
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSummary(await apiGet<WorkspaceSummary>('/api/admin/workspace-summary'))
    } catch (err) {
      setError(err instanceof Error ? err.message : '内容统计加载失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const campus = summary?.faqs.campus
  const totalFaqs = summary?.faqs.total ?? 0
  const campusTotal = campus?.total ?? 0
  const courseTotal = Math.max(0, totalFaqs - campusTotal)
  const pendingAll = summary?.threads.pending ?? 0
  const pendingCampus = summary?.threads.campusPending ?? 0

  const campusCategories = useMemo(() => {
    return Object.entries(campus?.categories ?? {})
      .map(([category, item]) => ({ category, ...item }))
      .sort((a, b) => b.unverified - a.unverified || b.total - a.total)
  }, [campus?.categories])

  const courseDistribution = useMemo(() => {
    return Object.entries(summary?.faqs.byCourse ?? {})
      .filter(([courseId]) => courseId !== 'campus')
      .map(([courseId, count]) => ({ courseId, count }))
      .sort((a, b) => b.count - a.count)
  }, [summary?.faqs.byCourse])
  const pilotRows = useMemo(() => {
    const order = new Map<string, number>(
      PILOT_COURSE_IDS.map((id, index) => [id, index]),
    )
    return courseDistribution
      .filter((item) => order.has(item.courseId))
      .sort((a, b) => (order.get(a.courseId) ?? 0) - (order.get(b.courseId) ?? 0))
  }, [courseDistribution])
  const otherCourses = useMemo(
    () => courseDistribution.filter((item) => !PILOT_SET.has(item.courseId)),
    [courseDistribution],
  )
  const otherTotal = otherCourses.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="admin-panel admin-panel-content">
      <div className="admin-panel-toolbar">
        <div>
          <strong>内容运营</strong>
          <span>课程知识库与校园知识域的运行状态；数据由服务端汇总，不受管理员本人课程范围限制</span>
        </div>
        <div className="admin-panel-actions">
          <button className="button button-ghost" onClick={() => void loadSummary()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-icon' : undefined} />
            刷新
          </button>
          <button className="button button-ghost" onClick={onOpenBackup}>
            <Database size={14} />
            数据备份
          </button>
          <button className="button button-primary" onClick={onOpenCampusInbox}>
            <Inbox size={14} />
            处理学生问答
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
          <span>FAQ 总数</span>
          <strong>{summary ? formatNumber(totalFaqs) : '—'}</strong>
          <em>
            课程 {courseTotal} · 校园 {campusTotal}
          </em>
        </div>
        <div className="admin-stat-card">
          <span>校园可引用</span>
          <strong>{campus ? campus.verified : '—'}</strong>
          <em>官方来源 + 教师回复</em>
        </div>
        <div className="admin-stat-card is-warn">
          <span>校园待核实</span>
          <strong>{campus ? campus.unverified : '—'}</strong>
          <em>{campus ? `${campus.noSource} 条没有原文链接` : '加载中'}</em>
        </div>
        <div className="admin-stat-card">
          <span>待处理问答</span>
          <strong>{summary ? pendingAll : '—'}</strong>
          <em>其中校园 {pendingCampus} 条</em>
        </div>
      </div>

      <div className="admin-content-grid">
        <section className="admin-content-card">
          <div className="admin-content-head">
            <div>
              <strong>校园内容健康度</strong>
              <span>按分类统计总量与待核实数量</span>
            </div>
            <ShieldCheck size={16} />
          </div>
          {campusCategories.length === 0 ? (
            <p className="admin-empty">{loading ? '加载中…' : '还没有校园 FAQ。'}</p>
          ) : (
            <div className="admin-content-bars">
              {campusCategories.map((item) => {
                const ratio = item.total === 0 ? 0 : item.unverified / item.total
                return (
                  <div className="admin-content-bar-row" key={item.category}>
                    <span>{item.category}</span>
                    <div className="admin-content-bar">
                      <span style={{ width: `${Math.max(4, (1 - ratio) * 100)}%` }} />
                    </div>
                    <em>
                      {item.total} 条 · 待核实 {item.unverified}
                    </em>
                  </div>
                )
              })}
            </div>
          )}
          <div className="admin-content-actions">
            <button className="text-button" onClick={onOpenVerification}>
              去内容核实
              <ArrowRight size={13} />
            </button>
            <span>校园域负责人：管理员（校园主理人）</span>
          </div>
        </section>

        <section className="admin-content-card">
          <div className="admin-content-head">
            <div>
              <strong>课程 FAQ 分布</strong>
              <span>按课程统计 FAQ 数量</span>
            </div>
            <BookOpen size={16} />
          </div>
          {courseDistribution.length === 0 ? (
            <p className="admin-empty">{loading ? '加载中…' : '还没有课程 FAQ。'}</p>
          ) : (
            <div className="admin-course-list">
              {pilotRows.map((item) => (
                <div className="admin-course-row" key={item.courseId}>
                  <span className="admin-course-name">
                    {courseLabel(item.courseId)}
                    <em>{courseById(item.courseId).code || item.courseId}</em>
                  </span>
                  <strong>{item.count}</strong>
                </div>
              ))}
              {otherCourses.length > 0 && (
                <div className="admin-course-row is-other">
                  <span className="admin-course-name">
                    其他演示课程
                    <em>{otherCourses.length} 门</em>
                  </span>
                  <strong>{otherTotal}</strong>
                </div>
              )}
            </div>
          )}
          <div className="admin-content-actions">
            <button className="text-button" onClick={() => onNavigate('knowledge')}>
              打开课程知识库
              <ArrowRight size={13} />
            </button>
            <button className="text-button" onClick={() => onNavigate('teacher')}>
              打开教师待办
              <ArrowRight size={13} />
            </button>
          </div>
        </section>
      </div>

      <section className="admin-content-card admin-import-card">
        <div className="admin-content-head">
          <div>
            <strong>校园知识卡导入</strong>
            <span>幂等脚本只补缺失 ID；已有教师编辑不会被覆盖</span>
          </div>
          <MessageCircleQuestion size={16} />
        </div>
        <pre className="admin-code-block">
{`node dev/import-campus-faqs.mjs \\
  --db /opt/shishuo/data/shishuo.db \\
  --apply --backup-dir /opt/shishuo/backups`}
        </pre>
        <p className="admin-panel-note-inline">
          数据源：`server/data/campus-faqs.json`（由 `dev/import-campus-kb.mjs` 从引路学长知识库生成）。
          线上当前共有 {campus ? formatNumber(campus.total) : '—'} 条校园 FAQ。
        </p>
      </section>
    </div>
  )
}
