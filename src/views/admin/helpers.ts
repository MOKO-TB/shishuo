import { PILOT_COURSE_LABELS } from '../../data/pilot'
import { CAMPUS_COURSE_ID } from '../../data/campus'

export const ACTION_LABELS: Record<string, string> = {
  'thread-create': '新建提问',
  'thread-escalate': '转交',
  'thread-join': '同问',
  'thread-follow-up': '追问',
  'thread-resolve': '已解决',
  'thread-unresolve': '撤销解决',
  'thread-withdraw': '撤下',
  'thread-reopen': '重新发起',
  'thread-feedback': '反馈',
  'thread-delete': '删除提问',
  'teacher-reply': '老师回复',
  'reply-undone': '撤回回复',
  'thread-info-request': '请学生补充',
  'thread-supplement': '学生补充',
  'thread-group': '调整同题组',
  'faq-add': '新增 FAQ',
  'faq-update': '编辑 FAQ',
  'faq-delete': '删除 FAQ',
  'course-note-update': '更新课程公告',
  'password-reset': '重置密码',
  'user-create': '创建账号',
  'user-update': '修改账号',
  'permission-denied': '越权拒绝',
  'moderation-term-add': '新增敏感词',
  'moderation-term-delete': '删除敏感词',
  'moderation-user-status': '账号风控',
  'moderation-thread-review': '内容审核',
  'moderation-image-review': '图片审核',
  'moderation-blocked': '敏感词拦截',
  'campus-faq-verify': '核实校园 FAQ',
  'campus-review-due': '复核到期提醒',
  'ai-settings-update': 'AI 网关配置',
  reset: '重置空间',
  restore: '恢复备份',
  'state-save': '同步状态',
}

export function roleLabel(role: string) {
  if (role === 'teacher') return '教师'
  if (role === 'admin') return '管理员'
  if (role === 'system') return '系统'
  return '学生'
}

export function courseLabel(courseId: string) {
  if (courseId === CAMPUS_COURSE_ID) return '校园生活'
  return PILOT_COURSE_LABELS[courseId] ?? courseId
}

export function timeLabel(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function shortTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatNumber(value: number) {
  return value.toLocaleString('zh-CN')
}
