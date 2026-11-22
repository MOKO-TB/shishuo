import { apiGet, apiPost } from './api'

export type FeedbackCategory =
  | 'bug'
  | 'suggestion'
  | 'ai'
  | 'schedule'
  | 'report'
  | 'account'

export type FeedbackStatus = 'pending' | 'reviewing' | 'resolved' | 'closed'

export interface FeedbackItem {
  id: string
  userId: string
  userName: string
  userEmail: string
  userRole: string
  category: FeedbackCategory
  content: string
  contact: string
  screenshotUrl: string
  clientMeta: {
    platform?: string
    appVersion?: string
    view?: string
    viewport?: string
  }
  status: FeedbackStatus
  adminReply: string
  repliedBy: string
  repliedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface FeedbackCategoryMeta {
  key: FeedbackCategory
  label: string
  hint: string
  placeholder: string
}

export const FEEDBACK_CATEGORIES: FeedbackCategoryMeta[] = [
  {
    key: 'bug',
    label: '功能异常',
    hint: '这一类最常需要核对的信息：在哪个页面、点击了什么按钮后报错或显示异常。',
    placeholder: '请描述异常出现的位置（如学生提问 / 教师回复 / 桌面小组件）以及操作步骤，方便我们快速复现排查',
  },
  {
    key: 'suggestion',
    label: '体验建议',
    hint: '这一类最常需要核对的信息：希望改进的界面细节或最想新增的功能场景。',
    placeholder: '说说你觉得哪里不够顺手，或者希望师说新增什么功能（如某块排版、快捷入口、提醒方式）',
  },
  {
    key: 'ai',
    label: 'AI 与答疑',
    hint: '这一类最常需要核对的信息：所属课程、提问内容以及 AI 回答或转交老师哪里不对。',
    placeholder: '请说明课程名称、AI 回答卡住或公式显示异常的情况，或老师回复/知识库引用的问题',
  },
  {
    key: 'schedule',
    label: '课表与学习通',
    hint: '这一类最常需要核对的信息：教务导入提示、课表节次/教室偏差，或学习通同步与小组件显示。',
    placeholder: '请描述课表导入失败提示、小组件显示问题，或学习通课程消息/作业同步遇到的情况',
  },
  {
    key: 'report',
    label: '违规举报',
    hint: '这一类最常需要核对的信息：请写清所在课程或校园板块、对方昵称与大致时间。',
    placeholder: '请提供违规内容的位置（课程 / 问答 / 校园 / 用户昵称）与具体情形，我们会尽快核查',
  },
  {
    key: 'account',
    label: '账号与其它',
    hint: '这一类最常需要核对的信息：登录账号邮箱、设备型号、权限提示或版本更新问题。',
    placeholder: '请描述账号登录、权限授权、安装包更新或其它需要管理员协助核实的问题',
  },
]

export const FEEDBACK_STATUS_META: Record<
  FeedbackStatus,
  { label: string; tone: 'neutral' | 'gold' | 'jade' }
> = {
  pending: { label: '待处理', tone: 'gold' },
  reviewing: { label: '处理中', tone: 'neutral' },
  resolved: { label: '已回复', tone: 'jade' },
  closed: { label: '已关闭', tone: 'neutral' },
}

export function feedbackCategoryLabel(key: string) {
  return FEEDBACK_CATEGORIES.find((item) => item.key === key)?.label ?? '其他'
}

const DRAFT_KEY_PREFIX = 'shishuo.feedback.draft.v1.'

export interface FeedbackDraft {
  category: FeedbackCategory
  content: string
  contact: string
}

export function readFeedbackDraft(userId: string): FeedbackDraft | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY_PREFIX}${userId || 'anon'}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FeedbackDraft>
    const validCat = FEEDBACK_CATEGORIES.some((c) => c.key === parsed.category)
      ? (parsed.category as FeedbackCategory)
      : 'bug'
    const content = typeof parsed.content === 'string' ? parsed.content : ''
    const contact = typeof parsed.contact === 'string' ? parsed.contact : ''
    if (!content.trim() && !contact.trim()) return null
    return { category: validCat, content, contact }
  } catch {
    return null
  }
}

export function writeFeedbackDraft(userId: string, draft: FeedbackDraft) {
  try {
    const key = `${DRAFT_KEY_PREFIX}${userId || 'anon'}`
    if (!draft.content.trim() && !draft.contact.trim()) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // ignore
  }
}

export function clearFeedbackDraft(userId: string) {
  try {
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${userId || 'anon'}`)
  } catch {
    // ignore
  }
}

export function submitFeedback(input: {
  category: FeedbackCategory
  content: string
  contact?: string
  screenshotUrl?: string
  clientMeta?: Record<string, string>
}) {
  return apiPost<{ feedback: FeedbackItem }>('/api/feedback', input)
}

export function fetchMyFeedbacks() {
  return apiGet<{ items: FeedbackItem[] }>('/api/feedback/mine')
}
