import { useMemo } from 'react'
import { ArrowRight, BookOpen, CircleAlert, Copy, Layers3, Timer, Unlink2 } from 'lucide-react'
import type { Course, Faq } from '../types'
import { questionSimilarity } from '../lib/engine'
import { courseById } from '../data/seed'
import { formatRelative, truncate } from '../lib/utils'
import { Badge, EmptyState, Modal } from './ui'

interface KnowledgeHealthModalProps {
  open: boolean
  onClose: () => void
  faqs: Faq[]
  courses: Course[]
  openFaq: (faqId: string) => void
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

const STALE_MS = 30 * 24 * 3_600_000
const SHORT_ANSWER = 30

/**
 * 知识库体检：不依赖服务端，直接从当前老师课程范围内的 FAQ 里找
 * 重复、别名冲突、冷答案、缺章节和过短答案。
 */
export function KnowledgeHealthModal({
  open,
  onClose,
  faqs,
  courses,
  openFaq,
}: KnowledgeHealthModalProps) {
  const report = useMemo(() => {
    const courseIds = new Set(courses.map((course) => course.id))
    const scoped = faqs.filter((faq) => courseIds.has(faq.courseId))
    const now = Date.now()

    const duplicates: Array<{ a: Faq; b: Faq; score: number }> = []
    // 相似度是 O(n²)，课程 FAQ 很多时只体检最近更新的 300 条，避免打开弹窗卡死。
    const duplicatePool =
      scoped.length > 300
        ? [...scoped].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 300)
        : scoped
    for (let i = 0; i < duplicatePool.length; i += 1) {
      for (let j = i + 1; j < duplicatePool.length; j += 1) {
        const a = duplicatePool[i]
        const b = duplicatePool[j]
        if (a.courseId !== b.courseId) continue
        const score = questionSimilarity(a.question, b.question, a.courseId)
        if (score >= 0.72) duplicates.push({ a, b, score })
      }
    }
    duplicates.sort((left, right) => right.score - left.score)

    const aliasMap = new Map<string, Map<string, Faq>>()
    for (const faq of scoped) {
      for (const text of [faq.question, ...faq.aliases]) {
        const key = normalizeKey(text)
        if (!key) continue
        const byCourse = aliasMap.get(`${faq.courseId}::${key}`) ?? new Map<string, Faq>()
        byCourse.set(faq.id, faq)
        aliasMap.set(`${faq.courseId}::${key}`, byCourse)
      }
    }
    const aliasConflicts = Array.from(aliasMap.values())
      .filter((byFaq) => byFaq.size > 1)
      .map((byFaq) => Array.from(byFaq.values()))
      .slice(0, 12)

    const stale = scoped
      .filter((faq) => faq.citations === 0 && now - faq.updatedAt >= STALE_MS)
      .sort((a, b) => a.updatedAt - b.updatedAt)
    const noChapter = scoped.filter((faq) => !faq.chapter?.trim())
    const shortAnswer = scoped.filter((faq) => faq.answer.trim().length < SHORT_ANSWER)
    const needsReview = scoped.filter((faq) => faq.reviewNeeded)

    return {
      scoped,
      duplicates: duplicates.slice(0, 12),
      aliasConflicts,
      stale: stale.slice(0, 12),
      noChapter: noChapter.slice(0, 12),
      shortAnswer: shortAnswer.slice(0, 12),
      needsReview: needsReview.slice(0, 12),
      counts: {
        duplicates: duplicates.length,
        aliasConflicts: aliasConflicts.length,
        stale: stale.length,
        noChapter: noChapter.length,
        shortAnswer: shortAnswer.length,
        needsReview: needsReview.length,
      },
    }
  }, [courses, faqs])

  const totalIssues =
    report.counts.duplicates +
    report.counts.aliasConflicts +
    report.counts.stale +
    report.counts.noChapter +
    report.counts.shortAnswer +
    report.counts.needsReview

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="教师工具 · 知识库体检"
      title="答案有没有变旧、变重、互相打架"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            共检查 {report.scoped.length} 条课程 FAQ，发现 {totalIssues} 个可处理项。
          </span>
          <div className="modal-actions-right">
            <button className="button button-primary" onClick={onClose}>
              知道了
            </button>
          </div>
        </div>
      }
    >
      {totalIssues === 0 ? (
        <EmptyState
          icon={<BookOpen size={20} />}
          title="知识库状态很干净"
          description="没有发现重复、别名冲突、冷答案、缺章节或过短答案。"
        />
      ) : (
        <div className="knowledge-health-report">
          {report.needsReview.length > 0 && (
            <section className="health-section">
              <header>
                <CircleAlert size={16} />
                <strong>待完善答案</strong>
                <Badge tone="medium">{report.counts.needsReview}</Badge>
              </header>
              {report.needsReview.map((faq) => (
                <button className="health-row" key={faq.id} onClick={() => openFaq(faq.id)}>
                  <span>
                    <strong>{faq.question}</strong>
                    <em>{faq.reviewNote ?? '近期被反馈不够清楚'}</em>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </section>
          )}

          {report.duplicates.length > 0 && (
            <section className="health-section">
              <header>
                <Copy size={16} />
                <strong>可能重复的答案</strong>
                <Badge tone="gold">{report.counts.duplicates}</Badge>
              </header>
              {report.duplicates.map((item) => (
                <div className="health-duplicate" key={`${item.a.id}:${item.b.id}`}>
                  <span className="health-sim">{Math.round(item.score * 100)}%</span>
                  <button className="health-row is-compact" onClick={() => openFaq(item.a.id)}>
                    <span>
                      <strong>{item.a.question}</strong>
                      <em>{courseById(item.a.courseId).shortName}</em>
                    </span>
                  </button>
                  <button className="health-row is-compact" onClick={() => openFaq(item.b.id)}>
                    <span>
                      <strong>{item.b.question}</strong>
                      <em>{courseById(item.b.courseId).shortName}</em>
                    </span>
                  </button>
                </div>
              ))}
            </section>
          )}

          {report.aliasConflicts.length > 0 && (
            <section className="health-section">
              <header>
                <Layers3 size={16} />
                <strong>别名指向多条答案</strong>
                <Badge tone="blue">{report.counts.aliasConflicts}</Badge>
              </header>
              {report.aliasConflicts.map((group, groupIndex) => (
                <div className="health-alias" key={`${groupIndex}:${group.map((faq) => faq.id).join(':')}`}>
                  <p>
                    同一个问法同时命中：
                    {group.map((faq, index) => (
                      <button key={faq.id} className="text-button" onClick={() => openFaq(faq.id)}>
                        {index > 0 ? '、' : ''}
                        {truncate(faq.question, 28)}
                      </button>
                    ))}
                  </p>
                </div>
              ))}
            </section>
          )}

          {report.stale.length > 0 && (
            <section className="health-section">
              <header>
                <Timer size={16} />
                <strong>30 天没有被引用的冷答案</strong>
                <Badge tone="neutral">{report.counts.stale}</Badge>
              </header>
              {report.stale.map((faq) => (
                <button className="health-row" key={faq.id} onClick={() => openFaq(faq.id)}>
                  <span>
                    <strong>{faq.question}</strong>
                    <em>最后更新 {formatRelative(faq.updatedAt)} · 引用 0 次</em>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </section>
          )}

          {report.noChapter.length > 0 && (
            <section className="health-section">
              <header>
                <Unlink2 size={16} />
                <strong>没有标章节</strong>
                <Badge tone="outline">{report.counts.noChapter}</Badge>
              </header>
              {report.noChapter.map((faq) => (
                <button className="health-row" key={faq.id} onClick={() => openFaq(faq.id)}>
                  <span>
                    <strong>{faq.question}</strong>
                    <em>补上章节后，答疑洞察才能按章节统计卡点</em>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </section>
          )}

          {report.shortAnswer.length > 0 && (
            <section className="health-section">
              <header>
                <CircleAlert size={16} />
                <strong>答案过短</strong>
                <Badge tone="outline">{report.counts.shortAnswer}</Badge>
              </header>
              {report.shortAnswer.map((faq) => (
                <button className="health-row" key={faq.id} onClick={() => openFaq(faq.id)}>
                  <span>
                    <strong>{faq.question}</strong>
                    <em>答案只有 {faq.answer.trim().length} 字，建议补步骤或例子</em>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}
