import type { Faq, KnowledgeGap } from '../../types'
import { ArrowRight, BookOpen, CheckCheck, ChevronRight, CircleAlert, Layers3 } from 'lucide-react'
import { MiniBars } from '../../components/charts'
import { Badge } from '../../components/ui'

export interface TeacherRailProps {
  gapsAll: KnowledgeGap[]
  openGap: (gap: KnowledgeGap) => void
  weekly: { date: string; ai: number; human: number }[]
  savedHours: number
  rate7: number
  ai7: number
  human7: number
  teacherFaqs: Faq[]
  totalCitations: number
  reviewFaqs: Faq[]
  openFaq: (faqId: string) => void
}

/** 教师端侧栏：知识缺口 / 试点节省 / 知识库状态。纯展示，数据由视图注入。 */
export function TeacherRail({
  gapsAll,
  openGap,
  weekly,
  savedHours,
  rate7,
  ai7,
  human7,
  teacherFaqs,
  totalCitations,
  reviewFaqs,
  openFaq,
}: TeacherRailProps) {
  return (
    <>

  <div className="rail-card gap-card">
    <div className="rail-card-head">
      <div>
        <div className="eyebrow">AI 观察</div>
        <h3>知识缺口</h3>
      </div>
      <span className="rail-count">{gapsAll.length}</span>
    </div>
    {gapsAll.length === 0 ? (
      <div className="gap-empty">
        <CheckCheck size={18} />
        <p>当前没有新的知识缺口。</p>
      </div>
    ) : (
      <div className="gap-list">
        {gapsAll.map((gap) => (
          <button className="gap-row" key={gap.id} onClick={() => openGap(gap)}>
            <span className={`gap-icon ${gap.reason}`}>
              {gap.reason === 'low' ? <CircleAlert size={15} /> : <Layers3 size={15} />}
            </span>
            <span className="gap-copy">
              <strong>{gap.topic}</strong>
              <span>
                {gap.reason === 'low'
                  ? `AI 找不到可靠依据 · ${gap.count} 人等待`
                  : gap.count > 0
                    ? `答案被反馈不够清楚 · ${gap.count} 人同问`
                    : '答案被反馈不够清楚 · 等待完善'}
              </span>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
    )}
    <p className="rail-footnote">来源：低置信问题与负反馈。处理并沉淀后，缺口会自动消失。</p>
  </div>

  <div className="rail-card saving-card">
    <div className="rail-card-head">
      <div>
        <div className="eyebrow">试点 · 本周省下</div>
        <h3>老师的时间</h3>
      </div>
      <MiniBars values={weekly.map((entry) => entry.ai)} />
    </div>
    <div className="saving-number">
      <strong>{savedHours.toFixed(1)}</strong>
      <span>小时</span>
    </div>
    <p className="saving-caption">按每个问题平均 4 分钟人工回复估算</p>
    <div className="saving-bar">
      <span className="saving-ai" style={{ width: `${rate7 * 100}%` }} />
      <span className="saving-human" style={{ width: `${(1 - rate7) * 100}%` }} />
    </div>
    <div className="saving-legend">
      <span>
        <i className="dot-ai" /> AI 接住 {ai7}
      </span>
      <span>
        <i className="dot-human" /> 转人工 {human7}
      </span>
    </div>
    <div className="demo-note">试点全域 · 演示数据</div>
  </div>

  <div className="rail-card knowledge-health">
    <div className="rail-card-head">
      <div>
        <div className="eyebrow">知识库状态</div>
        <h3>答案正在变厚</h3>
      </div>
      <BookOpen size={17} className="rail-head-icon" />
    </div>
    <div className="health-grid">
      <div>
        <strong>{teacherFaqs.length}</strong>
        <span>条课程 FAQ</span>
      </div>
      <div>
        <strong>{totalCitations}</strong>
        <span>次被 AI 引用</span>
      </div>
      <div>
        <strong>{reviewFaqs.length}</strong>
        <span>条待完善</span>
      </div>
    </div>
    {reviewFaqs.length > 0 && (
      <button className="health-alert" onClick={() => openFaq(reviewFaqs[0].id)}>
        <CircleAlert size={14} />
        有 {reviewFaqs.length} 条答案被反馈讲得不够清楚
        <ArrowRight size={14} />
      </button>
    )}
    <p className="rail-footnote">每条沉淀的回复，都是下一次 AI 的第一反应。</p>
  </div>    </>
  )
}
