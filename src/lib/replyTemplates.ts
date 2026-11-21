export interface ReplyTemplate {
  id: string
  label: string
  text: string
  updatedAt: number
}

const MAX_TEMPLATES = 12
const MAX_TEXT = 2_000

function storageKey(teacherName: string) {
  return `shishuo.reply-templates.v1.${teacherName || 'default'}`
}

function safeParse(raw: string | null): ReplyTemplate[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is ReplyTemplate =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.label === 'string' &&
          typeof item.text === 'string',
      )
      .map((item) => ({
        id: item.id,
        label: item.label.slice(0, 30),
        text: item.text.slice(0, MAX_TEXT),
        updatedAt: Number(item.updatedAt) || Date.now(),
      }))
      .slice(0, MAX_TEMPLATES)
  } catch {
    return []
  }
}

export function loadReplyTemplates(teacherName: string): ReplyTemplate[] {
  if (typeof localStorage === 'undefined') return []
  try {
    return safeParse(localStorage.getItem(storageKey(teacherName)))
  } catch {
    return []
  }
}

export function saveReplyTemplates(teacherName: string, templates: ReplyTemplate[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      storageKey(teacherName),
      JSON.stringify(templates.slice(0, MAX_TEMPLATES)),
    )
  } catch {
    // 隐私模式 / 存储已满时静默失败，模板只是效率工具，不影响回复主流程。
  }
}

export function addReplyTemplate(
  teacherName: string,
  text: string,
  label?: string,
): ReplyTemplate[] {
  const body = text.trim().slice(0, MAX_TEXT)
  if (!body) return loadReplyTemplates(teacherName)
  const current = loadReplyTemplates(teacherName)
  if (current.some((item) => item.text.trim() === body)) return current
  const template: ReplyTemplate = {
    id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    label: (label?.trim() || body.replace(/\s+/g, ' ').slice(0, 12)).slice(0, 30),
    text: body,
    updatedAt: Date.now(),
  }
  const next = [template, ...current].slice(0, MAX_TEMPLATES)
  saveReplyTemplates(teacherName, next)
  return next
}

export function removeReplyTemplate(teacherName: string, id: string): ReplyTemplate[] {
  const next = loadReplyTemplates(teacherName).filter((item) => item.id !== id)
  saveReplyTemplates(teacherName, next)
  return next
}
