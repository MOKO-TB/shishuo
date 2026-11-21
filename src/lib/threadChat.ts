/**
 * 「继续对话 / 继续追问」的本机记录：按问题 id 存在 localStorage，
 * 关掉弹窗或刷新页面后还能接着上一轮聊，AI 也能带上完整上下文。
 */

export interface ThreadChatMessage {
  role: 'user' | 'assistant'
  text: string
}

const STORAGE_KEY = 'shishuo.thread-chat.v1'
const MAX_MESSAGES = 40
const MAX_THREADS = 40

type ChatStore = Record<string, ThreadChatMessage[]>

function readStore(): ChatStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as ChatStore) : {}
  } catch {
    return {}
  }
}

export function loadThreadChat(threadId: string): ThreadChatMessage[] {
  if (!threadId) return []
  const messages = readStore()[threadId]
  if (!Array.isArray(messages)) return []
  return messages.filter(
    (message) =>
      message &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.text === 'string',
  )
}

export function saveThreadChat(threadId: string, messages: ThreadChatMessage[]) {
  if (!threadId) return
  try {
    const store = readStore()
    store[threadId] = messages.slice(-MAX_MESSAGES)
    const entries = Object.entries(store).slice(-MAX_THREADS)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // 隐私模式或存储空间不足时静默失败，不影响当前会话继续聊。
  }
}
