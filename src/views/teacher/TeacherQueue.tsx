import type { AppData, Course, Thread, ThreadGroup } from '../../types'
import {
  AiMark,
  AvatarStack,
  Badge,
  ConfidenceMeter,
  EmptyState,
  Seal,
} from '../../components/ui'
import {
  CheckCheck,
  ChevronRight,
  CircleAlert,
  CornerDownRight,
  Download,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import {
  confidenceLabel,
  displayStudentName,
  excerpt,
  feedbackReasonLabel,
  formatRelative,
  urgencyLabel,
  truncate,
} from '../../lib/utils'
import { courseById } from '../../data/seed'
import { isDocumentAttachment } from '../../lib/attachment'
import type { TeacherQueueViewState } from './types'

function groupNames(group: ThreadGroup) {
  if (group.count === 1) return group.studentNames[0] ?? '匿名同学'
  const names = group.studentNames.slice(0, 2).join('、')
  return `${names}${group.studentNames.length > 2 ? ' 等' : ''}`
}

export interface TeacherQueueProps extends TeacherQueueViewState {
  data: AppData
  exportWeeklyReport: () => void
  setSelectedGroupKey: (key: string | null) => void
  setNeedsInfoThreadId: (id: string | null) => void
  setAnsweredThreadId: (id: string | null) => void
  setSelectedAiThreadId: (id: string | null) => void
}

function FilterChips<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: ReadonlyArray<readonly [T, string]>
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div className="queue-filter-chips" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          className={value === key ? 'is-active' : ''}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** 教师端待办台主区域：筛选工具栏 + 待处理/等补充/已处理列表。纯展示 + 回调，状态由视图注入。 */
export function TeacherQueue({
  data,
  exportWeeklyReport,
  setSelectedGroupKey,
  setNeedsInfoThreadId,
  setAnsweredThreadId,
  setSelectedAiThreadId,
  ...queue
}: TeacherQueueProps) {
  const {
    tab,
    changeTab,
    groupsAll,
    needsInfoAll,
    answeredAll,
    aiAnsweredAll,
    teacherCourses,
    courseFilter,
    changeCourse,
    query,
    setQuery,
    queueFilter,
    setQueueFilter,
    answeredFilter,
    setAnsweredFilter,
    needsInfoFilter,
    setNeedsInfoFilter,
    aiFilter,
    setAiFilter,
    exportRange,
    setExportRange,
    filteredGroups,
    needsInfo,
    answered,
    aiAnswered,
    followUpParentIds,
  } = queue
  return (
    <section className="workbench-main">
  <div className="workbench-controls">
  <div className="workbench-toolbar">
    <div className="work-tabs" role="tablist" aria-label="工作台列表">
      <button
        className={tab === 'pending' ? 'is-active' : ''}
        onClick={() => changeTab('pending')}
        role="tab"
        aria-selected={tab === 'pending'}
      >
        待处理
        <span>{groupsAll.length}</span>
      </button>
      <button
        className={tab === 'needs-info' ? 'is-active' : ''}
        onClick={() => changeTab('needs-info')}
        role="tab"
        aria-selected={tab === 'needs-info'}
      >
        等补充
        <span>{needsInfoAll.length}</span>
      </button>
      <button
        className={tab === 'answered' ? 'is-active' : ''}
        onClick={() => changeTab('answered')}
        role="tab"
        aria-selected={tab === 'answered'}
      >
        已处理
        <span>{answeredAll.length}</span>
      </button>
      <button
        className={tab === 'ai-answered' ? 'is-active' : ''}
        onClick={() => changeTab('ai-answered')}
        role="tab"
        aria-selected={tab === 'ai-answered'}
      >
        AI 已答
        <span>{aiAnsweredAll.length}</span>
      </button>
    </div>

    <div className="course-filters">
      <button
        className={courseFilter === 'all' ? 'is-active' : ''}
        onClick={() => changeCourse('all')}
      >
        全部
      </button>
      {teacherCourses.map((course) => (
        <button
          key={course.id}
          className={courseFilter === course.id ? 'is-active' : ''}
          onClick={() => changeCourse(course.id)}
        >
          <span className={`course-dot accent-${course.accent}`} />
          {course.shortName}
        </button>
      ))}
    </div>
  </div>

  <div className="teacher-queue-tools">
    <label className="teacher-search">
      <Search size={15} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜问题、学生或课程"
        aria-label="搜索教师待办"
      />
      {query && (
        <button
          type="button"
          className="teacher-search-clear"
          onClick={() => setQuery('')}
          aria-label="清空搜索"
        >
          <X size={13} />
        </button>
      )}
    </label>
    {tab === 'pending' && (
      <FilterChips
        value={queueFilter}
        onChange={setQueueFilter}
        label="待办筛选"
        options={[
          ['all', '全部'],
          ['today', '今天要用'],
          ['follow-up', '追问'],
          ['image', '含图片'],
          ['low', '低置信'],
          ['aged', '超 24h'],
        ] as const}
      />
    )}
    {tab === 'needs-info' && (
      <FilterChips
        value={needsInfoFilter}
        onChange={setNeedsInfoFilter}
        label="等补充筛选"
        options={[
          ['all', '全部'],
          ['aged24', '超 24h'],
          ['aged48', '超 48h'],
        ] as const}
      />
    )}
    {tab === 'answered' && (
      <FilterChips
        value={answeredFilter}
        onChange={setAnsweredFilter}
        label="已处理筛选"
        options={[
          ['all', '全部'],
          ['no-feedback', '未反馈'],
          ['unhelpful', '负反馈'],
          ['unsealed', '未沉淀'],
          ['resolved', '已解决'],
        ] as const}
      />
    )}
    {tab === 'ai-answered' && (
      <FilterChips
        value={aiFilter}
        onChange={setAiFilter}
        label="AI 已答筛选"
        options={[
          ['all', '全部'],
          ['medium', '中置信'],
          ['low', '低置信'],
          ['unhelpful', '有负反馈'],
          ['image', '含图片'],
          ['week', '近 7 天'],
        ] as const}
      />
    )}
    <label className="teacher-export-range">
      <span>导出</span>
      <select
        value={exportRange}
        onChange={(event) =>
          setExportRange(Number(event.target.value) as typeof exportRange)
        }
        aria-label="导出时间范围"
      >
        <option value={7}>近 7 天</option>
        <option value={30}>近 30 天</option>
        <option value={90}>近 90 天</option>
      </select>
    </label>
    <button
      type="button"
      className="button button-ghost teacher-export"
      onClick={exportWeeklyReport}
    >
      <Download size={14} />
      导出记录
    </button>
  </div>
  </div>

  {tab === 'pending' ? (
    filteredGroups.length === 0 ? (
      <div className="card">
        <EmptyState
          icon={<CheckCheck size={20} />}
          title={query || queueFilter !== 'all' ? '没有匹配的待办' : '这组待办清空了'}
          description={
            query || queueFilter !== 'all'
              ? '换个关键词或筛选条件；清空搜索可以回到全部待办。'
              : 'AI 暂时没有新的问题需要你确认。可以去知识库补一条仍待完善的内容。'
          }
          action={
            query || queueFilter !== 'all' ? (
              <button
                className="text-button"
                onClick={() => {
                  setQuery('')
                  setQueueFilter('all')
                }}
              >
                清空筛选
              </button>
            ) : undefined
          }
        />
      </div>
    ) : (
      <div className="case-list">
        {filteredGroups.map((group) => {
          const course = courseById(group.courseId)
          const source = group.sourceFaqIds[0]
            ? data.faqs.find((faq) => faq.id === group.sourceFaqIds[0])
            : undefined
          const closest = group.primary.closestSource
            ? data.faqs.find((faq) => faq.id === group.primary.closestSource)
            : undefined
          const evidence = source ?? closest
          const isLow = group.primary.confidence === 'low'
          const isFollowUp = group.primary.kind === 'follow-up'
          const hasSame = group.threads.some((thread) => thread.kind === 'same')
          const hasImageAttachment = group.threads.some(
            (thread) => thread.attachment && !isDocumentAttachment(thread.attachment),
          )
          const hasDocAttachment = group.threads.some(
            (thread) => thread.attachment && isDocumentAttachment(thread.attachment),
          )
          const score = group.primary.confidenceScore ?? 0
          return (
            <button
              className={`case-card ${group.urgency === 'today' ? 'is-urgent' : ''}`}
              key={group.key}
              onClick={() => setSelectedGroupKey(group.key)}
            >
              <div className="case-top">
                <div className="case-tags">
                  <span className="case-course">
                    <span className={`course-dot accent-${course.accent}`} />
                    {course.shortName}
                  </span>
                  <Badge tone={group.urgency === 'today' ? 'danger' : 'neutral'} dot>
                    {urgencyLabel(group.urgency)}
                  </Badge>
                  {isFollowUp && <Badge tone="blue">追问</Badge>}
                  {hasSame && <Badge tone="gold">含同问</Badge>}
                  {hasImageAttachment && <Badge tone="outline">含图片</Badge>}
                  {hasDocAttachment && <Badge tone="outline">含文件</Badge>}
                  {group.count > 1 && (
                    <Badge tone="gold">
                      <Users size={12} />
                      同题 {group.count} 人
                    </Badge>
                  )}
                  {isLow && (
                    <Badge tone="low" dot>
                      知识缺口
                    </Badge>
                  )}
                </div>
                <span className="case-time">{formatRelative(group.latestAt)}</span>
              </div>

              <h3 className="case-title">{group.title}</h3>
              <p className="case-question">{truncate(group.primary.question, 96)}</p>

              {isFollowUp ? (
                <div className="case-evidence is-followup">
                  <CornerDownRight size={15} />
                  <span className="case-evidence-label">追问上下文</span>
                  <span className="case-evidence-text">
                    已带上一次老师回复，直接人工处理
                  </span>
                </div>
              ) : (
                <div className="case-evidence">
                  <AiMark size={15} />
                  <span className={`case-evidence-label ${isLow ? 'is-low' : ''}`}>
                    {isLow ? 'AI 没把握，已拒答' : 'AI 依据'}
                  </span>
                  <span className="case-evidence-text">
                    {evidence
                      ? `《${truncate(evidence.question, 34)}》`
                      : '知识库里没有可靠依据'}
                  </span>
                </div>
              )}

              <div className="case-foot">
                <div className="case-students">
                  <AvatarStack
                    people={group.threads.map((thread) => ({
                      name: thread.student.name,
                      anonymous:
                        thread.escalation?.anonymous || thread.student.anonymous,
                    }))}
                  />
                  <span>{groupNames(group)}</span>
                  {group.anonymousCount > 0 && (
                    <em>含 {group.anonymousCount} 位匿名</em>
                  )}
                </div>
                {isFollowUp ? (
                  <div className="case-ai">
                    <Badge tone="blue">人工跟进</Badge>
                  </div>
                ) : (
                  <div className="case-ai">
                    <ConfidenceMeter confidence={group.primary.confidence} compact />
                    <span>
                      {confidenceLabel(group.primary.confidence)}
                      {score > 0 && <em>{Math.round(score * 100)}%</em>}
                    </span>
                  </div>
                )}
                <span className="case-open">
                  打开处理
                  <ChevronRight size={16} />
                </span>
              </div>
            </button>
          )
        })}
      </div>
    )
  ) : tab === 'needs-info' ? (
    needsInfo.length === 0 ? (
      <div className="card">
        <EmptyState
          icon={<CheckCheck size={20} />}
          title={query ? '没有匹配的补充记录' : '没有等补充的问题'}
          description={
            query
              ? '换个关键词试试，或者清空搜索。'
              : '你发出补充要求后，问题会出现在这里；学生补充后会回到“待处理”。'
          }
          action={
            query ? (
              <button className="text-button" onClick={() => setQuery('')}>
                清空搜索
              </button>
            ) : undefined
          }
        />
      </div>
    ) : (
      <div className="answered-list">
        {needsInfo.map((thread) => {
          const course = courseById(thread.courseId)
          return (
            <button
              className="answered-row needs-info-row"
              key={thread.id}
              onClick={() => setNeedsInfoThreadId(thread.id)}
            >
              <span className="answered-check is-info">
                <CircleAlert size={17} />
              </span>
              <div className="answered-main">
                <div className="answered-meta">
                  <span className={`course-dot accent-${course.accent}`} />
                  {course.shortName}
                  <span>·</span>
                  {formatRelative(thread.teacherRequest?.at ?? thread.createdAt)}
                  <span>·</span>
                  {displayStudentName(thread, true)}
                </div>
                <strong>{thread.question}</strong>
                <p>{thread.teacherRequest?.text ?? '已请学生补充信息'}</p>
              </div>
              <div className="answered-right">
                {Date.now() - (thread.teacherRequest?.at ?? thread.createdAt) >=
                  48 * 3_600_000 && <Badge tone="danger">超 48h</Badge>}
                <Badge tone="blue" dot>
                  等补充
                </Badge>
                <ChevronRight size={16} />
              </div>
            </button>
          )
        })}
      </div>
    )
  ) : tab === 'ai-answered' ? (
    aiAnswered.length === 0 ? (
      <div className="card">
        <EmptyState
          icon={<Sparkles size={20} />}
          title={query || aiFilter !== 'all' ? '没有匹配的 AI 回答' : '没有待抽查的 AI 回答'}
          description={
            query || aiFilter !== 'all'
              ? '换个关键词或筛选条件；清空后可以看到全部 AI 直接回答的问题。'
              : 'AI 直接答掉、没有转给老师的问题会出现在这里。抽查中低置信答案，发现错误就一次更正给所有同题同学。'
          }
          action={
            query || aiFilter !== 'all' ? (
              <button
                className="text-button"
                onClick={() => {
                  setQuery('')
                  setAiFilter('all')
                }}
              >
                清空筛选
              </button>
            ) : undefined
          }
        />
      </div>
    ) : (
      <div className="answered-list ai-answer-list">
        {aiAnswered.map((thread) => {
          const course = courseById(thread.courseId)
          const source = thread.sources?.[0]
            ? data.faqs.find((faq) => faq.id === thread.sources?.[0])
            : undefined
          return (
            <button
              className="answered-row ai-answer-row"
              key={thread.id}
              onClick={() => setSelectedAiThreadId(thread.id)}
            >
              <span className={`answered-check is-ai ${thread.confidence === 'low' ? 'is-low' : ''}`}>
                <Sparkles size={17} />
              </span>
              <div className="answered-main">
                <div className="answered-meta">
                  <span className={`course-dot accent-${course.accent}`} />
                  {course.shortName}
                  <span>·</span>
                  {formatRelative(thread.createdAt)}
                  <span>·</span>
                  {displayStudentName(thread, true)}
                </div>
                <strong>{thread.question}</strong>
                <p>{excerpt(thread.aiAnswer ?? thread.externalAnswer?.text ?? '', 92)}</p>
                {source && (
                  <em className="ai-answer-source">AI 依据《{truncate(source.question, 34)}》</em>
                )}
              </div>
              <div className="answered-right">
                {thread.attachment && !isDocumentAttachment(thread.attachment) && (
                  <Badge tone="outline">含图片</Badge>
                )}
                {thread.feedback === 'unhelpful' && <Badge tone="danger">不够清楚</Badge>}
                <Badge tone={thread.confidence === 'low' ? 'low' : thread.confidence === 'medium' ? 'medium' : 'high'} dot>
                  {confidenceLabel(thread.confidence)}
                </Badge>
                <ChevronRight size={16} />
              </div>
            </button>
          )
        })}
      </div>
    )
  ) : answered.length === 0 ? (
    <div className="card">
      <EmptyState
        icon={<CheckCheck size={20} />}
        title={query ? '没有匹配的处理记录' : '还没有处理记录'}
        description={
          query
            ? '换个关键词试试，或者清空搜索。'
            : '回复过的同学会出现在这里，沉淀的 FAQ 也会留下标记。'
        }
        action={
          query ? (
            <button className="text-button" onClick={() => setQuery('')}>
              清空搜索
            </button>
          ) : undefined
        }
      />
    </div>
  ) : (
    <div className="answered-list">
      {answered.map((thread) => {
        const course = courseById(thread.courseId)
        const faq = thread.teacherReply?.faqId
          ? data.faqs.find((item) => item.id === thread.teacherReply?.faqId)
          : undefined
        return (
          <button
            className="answered-row"
            key={thread.id}
            onClick={() => setAnsweredThreadId(thread.id)}
          >
            <span className="answered-check">
              <CheckCheck size={17} />
            </span>
            <div className="answered-main">
              <div className="answered-meta">
                <span className={`course-dot accent-${course.accent}`} />
                {course.shortName}
                <span>·</span>
                {formatRelative(thread.teacherReply?.at ?? thread.createdAt)}
                <span>·</span>
                {thread.teacherReply?.recipientCount && thread.teacherReply.recipientCount > 1
                  ? `合并回复 ${thread.teacherReply.recipientCount} 人`
                  : '单条回复'}
              </div>
              <strong>{thread.question}</strong>
              <p>{excerpt(thread.teacherReply?.text ?? '', 76)}</p>
            </div>
            <div className="answered-right">
              {faq && <Seal className="seal-small">已沉淀</Seal>}
              <div className="answered-effect">
                {thread.resolvedAt && <Badge tone="high">已解决</Badge>}
                {thread.feedback === 'helpful' && <Badge tone="jade">有帮助</Badge>}
                {thread.feedback === 'unhelpful' && (
                  <Badge tone="danger">不够清楚</Badge>
                )}
                {thread.feedback === 'unhelpful' && thread.feedbackReason && (
                  <Badge tone="outline">{feedbackReasonLabel(thread.feedbackReason)}</Badge>
                )}
                {followUpParentIds.has(thread.id) && (
                  <Badge tone="blue">学生追问</Badge>
                )}
                {!thread.resolvedAt &&
                  !thread.feedback &&
                  !followUpParentIds.has(thread.id) && (
                    <Badge tone="neutral">未反馈</Badge>
                  )}
              </div>
              <ChevronRight size={16} />
            </div>
          </button>
        )
      })}
    </div>
  )}
    </section>
  )
}
