import type { Course, Thread, ThreadGroup } from '../../types'

/** 工作台视图的 tab：待处理 / 等补充 / 已处理 / AI 已答。 */
export type WorkTab = 'pending' | 'needs-info' | 'answered' | 'ai-answered'

/** 待办筛选条件。 */
export type QueueFilter = 'all' | 'today' | 'follow-up' | 'image' | 'low' | 'aged'

/** 已处理列表筛选：未反馈、负反馈、未沉淀、已解决。 */
export type AnsweredFilter = 'all' | 'no-feedback' | 'unhelpful' | 'unsealed' | 'resolved'

/** 等补充列表筛选。 */
export type NeedsInfoFilter = 'all' | 'aged24' | 'aged48'

/** AI 已答抽查筛选。 */
export type AiAnsweredFilter = 'all' | 'medium' | 'low' | 'unhelpful' | 'image' | 'week'

/** 周报导出范围。 */
export type ExportRange = 7 | 30 | 90

/**
 * 教师待办台需要的所有视图状态（由 TeacherView 持有、以 props 传入 TeacherQueue）。
 * 把这部分状态类型化，方便后续维护者看清待办台的输入契约。
 */
export interface TeacherQueueViewState {
  tab: WorkTab
  changeTab: (next: WorkTab) => void
  groupsAll: ThreadGroup[]
  needsInfoAll: Thread[]
  answeredAll: Thread[]
  aiAnsweredAll: Thread[]
  teacherCourses: Course[]
  courseFilter: string
  changeCourse: (courseId: string) => void
  query: string
  setQuery: (value: string) => void
  queueFilter: QueueFilter
  setQueueFilter: (value: QueueFilter) => void
  answeredFilter: AnsweredFilter
  setAnsweredFilter: (value: AnsweredFilter) => void
  needsInfoFilter: NeedsInfoFilter
  setNeedsInfoFilter: (value: NeedsInfoFilter) => void
  aiFilter: AiAnsweredFilter
  setAiFilter: (value: AiAnsweredFilter) => void
  exportRange: ExportRange
  setExportRange: (value: ExportRange) => void
  filteredGroups: ThreadGroup[]
  needsInfo: Thread[]
  answered: Thread[]
  aiAnswered: Thread[]
  followUpParentIds: Set<string>
}
