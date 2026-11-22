import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Copy,
  Download,
  FileText,
  ListChecks,
} from 'lucide-react'
import {
  buildFinalReviewPack,
  exportReviewPackCsv,
  exportReviewPackMarkdown,
  formatReviewPackText,
  type ReviewPackItem,
  type ReviewSortMode,
} from '../lib/teacherTools'
import { downloadText } from '../lib/export'
import { copyText, excerpt, truncate } from '../lib/utils'
import type { Course, Faq, Thread } from '../types'
import { Badge, EmptyState, Modal } from './ui'

interface ReviewPackModalProps {
  open: boolean
  onClose: () => void
  teacherName: string
  courses: Course[]
  threads: Thread[]
  faqs: Faq[]
  initialCourseId?: string
  openFaq: (faqId: string) => void
  onOpenPendingGroup: (groupKey: string) => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

const SORT_OPTIONS: Array<{ value: ReviewSortMode; label: string }> = [
  { value: 'composite', label: '综合优先' },
  { value: 'frequency', label: '按提问频次' },
  { value: 'low-confidence', label: '按低置信度' },
  { value: 'unresolved', label: '按未解决状态' },
]

export function ReviewPackModal({
  open,
  onClose,
  teacherName,
  courses,
  threads,
  faqs,
  initialCourseId,
  openFaq,
  onOpenPendingGroup,
  notify,
}: ReviewPackModalProps) {
  const [courseFilter, setCourseFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<ReviewSortMode>('composite')
  const [includeAnswers, setIncludeAnswers] = useState(true)

  useEffect(() => {
    if (!open) return
    setCourseFilter(
      initialCourseId && courses.some((item) => item.id === initialCourseId)
        ? initialCourseId
        : 'all',
    )
  }, [open, initialCourseId, courses])

  const scopedCourseIds = useMemo(
    () =>
      courseFilter === 'all'
        ? courses.map((course) => course.id)
        : [courseFilter],
    [courseFilter, courses],
  )

  const items = useMemo(
    () => buildFinalReviewPack(threads, faqs, scopedCourseIds, sortBy),
    [threads, faqs, scopedCourseIds, sortBy],
  )

  const courseLabel =
    courseFilter === 'all'
      ? '全部授课课程'
      : courses.find((item) => item.id === courseFilter)?.shortName ?? '课程'

  const totalMentions = items.reduce((sum, item) => sum + item.frequency, 0)
  const lowTopics = items.filter((item) => item.lowConfidenceCount > 0).length
  const unresolvedTopics = items.filter((item) => item.unresolvedCount > 0).length

  const handleExportMarkdown = () => {
    if (items.length === 0) {
      notify('当前没有可导出的复习专题', 'info')
      return
    }
    const content = exportReviewPackMarkdown(items, {
      teacherName,
      courseLabel,
      includeAnswers,
    })
    const date = new Date().toISOString().slice(0, 10)
    downloadText(`师说-期末复习包-${courseLabel}-${date}.md`, content, 'text/markdown;charset=utf-8')
    notify(`已导出 ${items.length} 项高频复习清单（Markdown）`, 'success')
  }

  const handleExportCsv = () => {
    if (items.length === 0) {
      notify('当前没有可导出的复习专题', 'info')
      return
    }
    const content = exportReviewPackCsv(items, { includeAnswers })
    const date = new Date().toISOString().slice(0, 10)
    downloadText(`师说-期末复习包-${courseLabel}-${date}.csv`, content, 'text/csv;charset=utf-8')
    notify(`已导出 ${items.length} 项高频复习清单（CSV）`, 'success')
  }

  const handleCopyList = async () => {
    if (items.length === 0) {
      notify('当前没有可复制的复习专题', 'info')
      return
    }
    const ok = await copyText(formatReviewPackText(items, courseLabel))
    notify(ok ? '已复制期末复习清单，可直接发给学生' : '复制失败，请检查浏览器权限', ok ? 'success' : 'info')
  }

  const renderItem = (item: ReviewPackItem, index: number) => (
    <div className="review-pack-row" key={item.id}>
      <div className="review-pack-rank">#{index + 1}</div>
      <div className="review-pack-body">
        <div className="review-pack-meta">
          <Badge tone="neutral">{item.courseShortName}</Badge>
          <span className="review-pack-chapter">{item.chapter}</span>
          <Badge tone="gold">提问 {item.frequency} 次</Badge>
          {item.lowConfidenceCount > 0 && (
            <Badge tone="low">低置信 {item.lowConfidenceCount} 次</Badge>
          )}
          {item.unresolvedCount > 0 ? (
            <Badge tone="danger" dot>
              未解决 {item.unresolvedCount} 条
            </Badge>
          ) : (
            <Badge tone="high">
              <CheckCircle2 size={11} />
              已闭环
            </Badge>
          )}
        </div>
        <h4>{item.topic}</h4>
        {(item.teacherReplySummary || item.linkedFaq) && (
          <p className="review-pack-answer">
            {item.teacherReplySummary
              ? `老师讲解：${item.teacherReplySummary}`
              : `关联解答：${excerpt(item.linkedFaq!.answer, 110)}`}
          </p>
        )}
        <div className="review-pack-actions">
          {item.linkedFaq && (
            <button
              type="button"
              className="text-button"
              onClick={() => openFaq(item.linkedFaq!.id)}
            >
              <BookOpen size={13} />
              查看 FAQ《{truncate(item.linkedFaq.question, 22)}》
            </button>
          )}
          {item.pendingGroupKey && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onClose()
                onOpenPendingGroup(item.pendingGroupKey!)
              }}
            >
              <CircleAlert size={13} />
              去处理待办（{item.pendingCount}）
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="全学期高频疑问汇总"
      title="期末复习包"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <label className="review-pack-toggle">
            <input
              type="checkbox"
              checked={includeAnswers}
              onChange={(event) => setIncludeAnswers(event.target.checked)}
            />
            <span>导出时附带参考答案 / 老师讲解</span>
          </label>
          <div className="modal-actions-right">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void handleCopyList()}
            >
              <Copy size={14} />
              复制清单
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={handleExportCsv}
            >
              <Download size={14} />
              导出 CSV
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleExportMarkdown}
            >
              <FileText size={14} />
              一键导出复习清单
            </button>
          </div>
        </div>
      }
    >
      <div className="review-pack-modal">
        <div className="review-pack-toolbar">
          <div className="course-filters">
            <button
              type="button"
              className={courseFilter === 'all' ? 'is-active' : ''}
              onClick={() => setCourseFilter('all')}
            >
              全部课程
            </button>
            {courses.map((course) => (
              <button
                key={course.id}
                type="button"
                className={courseFilter === course.id ? 'is-active' : ''}
                onClick={() => setCourseFilter(course.id)}
              >
                <span className={`course-dot accent-${course.accent}`} />
                {course.shortName}
              </button>
            ))}
          </div>
          <div className="sort-switch" role="group" aria-label="复习包排序方式">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={sortBy === option.value ? 'is-active' : ''}
                onClick={() => setSortBy(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="review-pack-summary">
          <div>
            <strong>{totalMentions}</strong>
            <span>全学期累计提问</span>
          </div>
          <div>
            <strong>{items.length}</strong>
            <span>归并高频专题</span>
          </div>
          <div>
            <strong>{lowTopics}</strong>
            <span>含低置信难点</span>
          </div>
          <div>
            <strong>{unresolvedTopics}</strong>
            <span>含未解决状态</span>
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={<ListChecks size={20} />}
            title="当前课程暂无提问记录"
            description="有学生提问后，这里会自动汇总全学期高频疑问并按频次、低置信度、未解决状态排序。"
          />
        ) : (
          <div className="review-pack-list">{items.map(renderItem)}</div>
        )}
      </div>
    </Modal>
  )
}
