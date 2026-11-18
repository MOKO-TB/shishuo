import type { Course, Thread, ThreadGroup } from '../../types'

/** 工作台视图的 tab：待处理 / 等补充 / 已处理。 */
export type WorkTab = 'pending' | 'needs-info' | 'answered'

/** 待办筛选条件。 */
export type QueueFilter = 'all' | 'today' | 'follow-up' | 'image' | 'low' | 'aged'

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
  teacherCourses: Course[]
  courseFilter: string
  changeCourse: (courseId: string) => void
  query: string
  setQuery: (value: string) => void
  queueFilter: QueueFilter
  setQueueFilter: (value: QueueFilter) => void
  filteredGroups: ThreadGroup[]
  needsInfo: Thread[]
  answered: Thread[]
  followUpParentIds: Set<string>
}
