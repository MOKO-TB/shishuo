import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Download, Search, Star } from 'lucide-react'
import { useStore } from '../store'
import { courseById } from '../data/seed'
import { downloadText } from '../lib/export'
import { studentCourses, useProfile } from '../lib/profile'
import { useAuth } from '../auth'
import { excerpt, formatRelative, statusLabel, statusTone } from '../lib/utils'
import type { Thread } from '../types'
import { Badge, EmptyState, Modal } from './ui'

type ArchiveStatus = 'all' | 'waiting' | 'needs-info' | 'replied' | 'resolved' | 'withdrawn'
type ArchiveRange = 'all' | '7' | '30' | '90'

const PAGE_SIZE = 20
const DAY = 86_400_000

const STATUS_OPTIONS = [
  ['all', '全部'],
  ['waiting', '等待中'],
  ['needs-info', '待补充'],
  ['replied', '老师已回复'],
  ['resolved', '已解决'],
  ['withdrawn', '已撤下'],
] as const

const RANGE_OPTIONS = [
  ['all', '全部时间'],
  ['7', '近 7 天'],
  ['30', '近 30 天'],
  ['90', '近 90 天'],
] as const

function matchesStatus(thread: Thread, status: ArchiveStatus) {
  if (status === 'waiting') return thread.status === 'pending' && !thread.withdrawnAt
  if (status === 'needs-info') return thread.status === 'needs-info' && !thread.withdrawnAt
  if (status === 'replied')
    return thread.status === 'answered' && !thread.resolvedAt && !thread.withdrawnAt
  if (status === 'resolved') return Boolean(thread.resolvedAt)
  if (status === 'withdrawn') return Boolean(thread.withdrawnAt)
  return true
}

function threadSubline(thread: Thread) {
  if (thread.withdrawnAt) return '你已撤下这条记录，可以在详情里重新发起'
  if (thread.teacherReply) {
    return `${thread.teacherReply.by}老师：${excerpt(thread.teacherReply.text, 88)}`
  }
  if (thread.status === 'needs-info') {
    return `老师请你补充：${excerpt(thread.teacherRequest?.text ?? '请补充题目或解题步骤', 88)}`
  }
  if (thread.status === 'pending') {
    if (thread.kind === 'same') return '已同问 · 老师回复后会同步给你'
    if (thread.kind === 'follow-up') return '追问已发给老师 · 带上上次回复'
    return '已进入老师待办，回复后会通知你'
  }
  if (thread.externalAnswer) return `服务端 AI 补充：${excerpt(thread.externalAnswer.text, 88)}`
  if (thread.aiAnswer) return `AI：${excerpt(thread.aiAnswer, 88)}`
  return '这条记录暂时没有文字内容'
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

interface QuestionArchiveProps {
  open: boolean
  onClose: () => void
  onOpenThread: (threadId: string) => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

export function QuestionArchive({
  open,
  onClose,
  onOpenThread,
  notify,
}: QuestionArchiveProps) {
  const { data, dispatch } = useStore()
  const { user } = useAuth()
  const profile = useProfile()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ArchiveStatus>('all')
  const [course, setCourse] = useState('all')
  const [range, setRange] = useState<ArchiveRange>('all')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const myThreads = useMemo(() => {
    const scoped = new Set(studentCourses(profile).map((course) => course.id))
    return data.threads
      .filter(
        (thread) =>
          thread.student.id === (user?.id ?? '') && scoped.has(thread.courseId),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [data.threads, profile, user?.id])
  const courseOptions = useMemo(() => {
    const seen = new Set<string>()
    return myThreads.flatMap((thread) => {
      if (seen.has(thread.courseId)) return []
      seen.add(thread.courseId)
      return [courseById(thread.courseId)]
    })
  }, [myThreads])
  const favoriteCount = myThreads.filter((thread) => thread.favorite).length

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, status, course, range, onlyFavorites])

  useEffect(() => {
    if (!open) return
    setVisibleCount(PAGE_SIZE)
  }, [open])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const cutoff = range === 'all' ? 0 : Date.now() - Number(range) * DAY
    return myThreads.filter((thread) => {
      if (!matchesStatus(thread, status)) return false
      if (course !== 'all' && thread.courseId !== course) return false
      if (onlyFavorites && !thread.favorite) return false
      if (cutoff && thread.createdAt < cutoff) return false
      if (!needle) return true
      const haystack = [
        thread.question,
        thread.aiAnswer ?? '',
        thread.externalAnswer?.text ?? '',
        thread.teacherReply?.text ?? '',
        thread.escalation?.title ?? '',
        courseById(thread.courseId).name,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [myThreads, status, course, range, onlyFavorites, query])

  const visible = filtered.slice(0, visibleCount)

  const toggleFavorite = (thread: Thread) => {
    dispatch({ type: 'thread-favorite', threadId: thread.id, favorite: !thread.favorite })
    notify(thread.favorite ? '已取消收藏' : '已收藏这条答疑', 'info')
  }

  const exportCsv = () => {
    if (filtered.length === 0) return
    const header = ['提问时间', '课程', '问题', '状态', '收藏', '老师回复']
    const rows = filtered.map((thread) => [
      new Date(thread.createdAt).toLocaleString('zh-CN'),
      courseById(thread.courseId).name,
      thread.question,
      statusLabel(thread),
      thread.favorite ? '是' : '',
      thread.teacherReply?.text ?? '',
    ])
    const content = `\uFEFF${[header, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n')}\r\n`
    const date = new Date().toISOString().slice(0, 10)
    downloadText(`师说-问答档案-${date}.csv`, content, 'text/csv;charset=utf-8')
    notify(`已导出 ${filtered.length} 条问答记录`, 'success')
  }

  const resetFilters = () => {
    setQuery('')
    setStatus('all')
    setCourse('all')
    setRange('all')
    setOnlyFavorites(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={`学生端 · ${profile.name} · 已同步`}
      title="我的问答档案"
      size="lg"
      className="archive-modal"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            搜索、筛选和收藏只作用于当前账号的问答记录，不会改变老师待办和知识库。
          </span>
          <div className="modal-actions-right">
            <button
              className="button button-ghost"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              <Download size={15} />
              导出当前结果 CSV
            </button>
            <button className="button button-primary" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      }
    >
      <div className="archive">
        <div className="archive-toolbar">
          <label className="archive-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索问题、老师回复或课程"
              aria-label="搜索问答档案"
            />
          </label>
          <select
            className="archive-select"
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            aria-label="按课程筛选问答档案"
          >
            <option value="all">全部课程</option>
            {courseOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.shortName}
              </option>
            ))}
          </select>
          <select
            className="archive-select"
            value={range}
            onChange={(event) => setRange(event.target.value as ArchiveRange)}
            aria-label="按时间筛选问答档案"
          >
            {RANGE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            className={`archive-favorite-filter ${onlyFavorites ? 'is-active' : ''}`}
            aria-pressed={onlyFavorites}
            onClick={() => setOnlyFavorites((current) => !current)}
          >
            <Star size={14} fill={onlyFavorites ? 'currentColor' : 'none'} />
            只看收藏
            {favoriteCount > 0 && <span>{favoriteCount}</span>}
          </button>
        </div>

        <div className="archive-tabs" role="tablist" aria-label="问答状态筛选">
          {STATUS_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={status === value}
              className={status === value ? 'is-active' : ''}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="archive-summary">
          <span>
            共 {filtered.length} 条
            {filtered.length !== myThreads.length && ` · 全部 ${myThreads.length} 条`}
          </span>
          {(query || status !== 'all' || course !== 'all' || range !== 'all' || onlyFavorites) && (
            <button className="text-button" onClick={resetFilters}>
              清空筛选
            </button>
          )}
        </div>

        {myThreads.length === 0 ? (
          <EmptyState
            icon={<Search size={20} />}
            title="还没有提过问题"
            description="去首页问第一个问题，AI 和老师的回复都会保留在这里。"
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={20} />}
            title="没有匹配的记录"
            description="换个关键词或清空筛选，再找找看。"
            action={
              <button className="text-button" onClick={resetFilters}>
                清空筛选
              </button>
            }
          />
        ) : (
          <div className="archive-list">
            {visible.map((thread) => {
              const itemCourse = courseById(thread.courseId)
              return (
                <div
                  key={thread.id}
                  className={`archive-row ${thread.favorite ? 'is-favorite' : ''}`}
                >
                  <button
                    className="archive-main"
                    onClick={() => onOpenThread(thread.id)}
                  >
                    <span className="archive-row-top">
                      <span className="archive-course">
                        <span className={`course-dot accent-${itemCourse.accent}`} />
                        {itemCourse.shortName}
                      </span>
                      <span className="archive-time">{formatRelative(thread.createdAt)}</span>
                      {thread.kind === 'same' && <span className="recent-kind">同问</span>}
                      {thread.kind === 'follow-up' && (
                        <span className="recent-kind is-followup">追问</span>
                      )}
                      {thread.attachment && <span className="recent-kind is-image">图片</span>}
                      {thread.externalAnswer && (
                        <span className="recent-kind is-external">AI补充</span>
                      )}
                      <Badge tone={statusTone(thread)}>{statusLabel(thread)}</Badge>
                    </span>
                    <strong className="archive-question">{thread.question}</strong>
                    <span className="archive-sub">{threadSubline(thread)}</span>
                  </button>
                  <button
                    className={`archive-star ${thread.favorite ? 'is-on' : ''}`}
                    aria-label={thread.favorite ? '取消收藏' : '收藏这条答疑'}
                    aria-pressed={Boolean(thread.favorite)}
                    title={thread.favorite ? '取消收藏' : '收藏'}
                    onClick={() => toggleFavorite(thread)}
                  >
                    <Star size={16} fill={thread.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <ChevronRight size={16} className="archive-chevron" aria-hidden="true" />
                </div>
              )
            })}
          </div>
        )}

        {visible.length < filtered.length && (
          <button
            className="button button-ghost archive-more"
            onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
          >
            加载更多 · 还有 {filtered.length - visible.length} 条
          </button>
        )}
      </div>
    </Modal>
  )
}