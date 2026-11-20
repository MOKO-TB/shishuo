import { apiGet } from './api'
import { CAMPUS_ANSWER_SKILL, CAMPUS_OFFICIAL_LINKS } from './campusAnswerSkill'

export interface AIConfig {
  enabled: boolean
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  enabled: true,
}

export interface AIStatus {
  configured: boolean
  model: string | null
  usedToday: number
  dailyLimit: number
}

const META_KEY = 'shishuo.ai.meta.v1'

export function loadAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(META_KEY)
    const meta = raw ? (JSON.parse(raw) as Partial<AIConfig>) : {}
    return { enabled: meta.enabled ?? true }
  } catch {
    return { ...DEFAULT_AI_CONFIG }
  }
}

export function saveAIConfig(config: AIConfig) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ enabled: config.enabled }))
  } catch {
    // The in-memory preference still works when storage is unavailable.
  }
}

export function clearAIConfig() {
  try {
    localStorage.removeItem(META_KEY)
  } catch {
    // Ignore storage errors.
  }
}

export function isAIConfigReady(config: AIConfig) {
  return Boolean(config.enabled)
}

export function fetchAIStatus() {
  return apiGet<AIStatus>('/api/ai/status')
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'high' | 'low' } }

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

function pickErrorMessage(status: number, raw: string) {
  let providerMessage = ''
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string }
    providerMessage =
      typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? ''
  } catch {
    providerMessage = raw.slice(0, 160)
  }

  if (status === 401) return providerMessage || '登录状态已失效，请重新登录。'
  if (status === 403) return providerMessage || '当前账号没有调用 AI 的权限。'
  if (status === 404) return 'AI 网关接口不存在，请确认服务端已启动。'
  if (status === 429) return providerMessage || 'AI 调用额度已用完或上游限流，请稍后再试。'
  if (status === 503) return providerMessage || '服务端 AI 网关尚未配置，请联系管理员。'
  if (status === 400) return providerMessage || '模型拒绝了请求，请检查输入内容。'
  return providerMessage || `模型调用失败（HTTP ${status}）。`
}

function isQwenModel(model: string) {
  return /qwen/i.test(model)
}

function readText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '')
        }
        return ''
      })
      .join('')
      .trim()
  }
  if (value && typeof value === 'object' && 'text' in value) {
    return String((value as { text?: unknown }).text ?? '').trim()
  }
  return ''
}

interface ChatResult {
  content: string
  model: string
  reasoning: string
  finishReason: string
  reasoningTokens: number
}

async function requestChat(
  messages: ChatMessage[],
  maxTokens: number,
  disableThinking: boolean,
  signal: AbortSignal,
) {
  const body: Record<string, unknown> = {
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    stream: false,
  }
  // Qwen reasoning models may return only reasoning_content without visible text;
  // the retry asks the gateway to disable thinking.
  if (disableThinking) body.enable_thinking = false

  const response = await fetch('/api/ai/chat/completions', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) {
    throw new Error('AI 网关未启用。请通过 npm run dev 或 npm start 启动师说服务端。')
  }
  const raw = await response.text()
  if (!response.ok) throw new Error(pickErrorMessage(response.status, raw))

  let json: {
    model?: string
    choices?: Array<{
      message?: {
        content?: unknown
        reasoning_content?: unknown
        reasoning?: unknown
      }
      text?: unknown
      finish_reason?: string
    }>
    usage?: { completion_tokens_details?: { reasoning_tokens?: number } }
  }
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error('模型返回了无法解析的内容。')
  }

  const choice = json.choices?.[0]
  const content = readText(choice?.message?.content) || readText(choice?.text)
  const reasoning = readText(choice?.message?.reasoning_content) || readText(choice?.message?.reasoning)
  return {
    content,
    model: typeof json.model === 'string' ? json.model : '',
    reasoning,
    finishReason: choice?.finish_reason ?? '',
    reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
  } satisfies ChatResult
}

async function requestChatStream(
  messages: ChatMessage[],
  maxTokens: number,
  disableThinking: boolean,
  signal: AbortSignal,
  onUpdate?: (partial: string) => void,
) {
  const body: Record<string, unknown> = {
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    stream: true,
  }
  if (disableThinking) body.enable_thinking = false

  const response = await fetch('/api/ai/chat/completions', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) {
    throw new Error('AI 网关未启用。请通过 npm run dev 或 npm start 启动师说服务端。')
  }
  if (!response.ok) throw new Error(pickErrorMessage(response.status, await response.text()))

  const result = { content: '', model: '' }
  const consumeLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const json = JSON.parse(payload) as {
        model?: string
        choices?: Array<{ delta?: { content?: unknown } }>
      }
      if (typeof json.model === 'string' && json.model) result.model = json.model
      const delta = readText(json.choices?.[0]?.delta?.content)
      if (delta) {
        result.content += delta
        onUpdate?.(result.content)
      }
    } catch {
      // Ignore malformed SSE chunks.
    }
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('模型调用失败。')
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      consumeLine(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
  }
  buffer += decoder.decode()
  if (buffer.trim()) consumeLine(buffer)
  return result
}

async function callChat(messages: ChatMessage[], maxTokens = 1_200) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 100_000)
  try {
    let result = await requestChat(messages, maxTokens, false, controller.signal)
    if (!result.content && isQwenModel(result.model)) {
      result = await requestChat(messages, maxTokens, true, controller.signal)
    }
    if (result.content) return { content: result.content, model: result.model }

    const detail = [
      result.finishReason ? `finish_reason=${result.finishReason}` : '',
      result.reasoningTokens ? `推理 token=${result.reasoningTokens}` : '',
    ]
      .filter(Boolean)
      .join('，')
    if (result.reasoning) {
      throw new Error(
        `模型只返回了推理过程，没有生成正文${detail ? `（${detail}）` : ''}。已尝试关闭思考模式；请联系管理员更换模型。`,
      )
    }
    throw new Error(
      `模型没有返回文字内容${detail ? `（${detail}）` : ''}。请联系管理员检查网关模型配置。`,
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('请求超时，请检查服务端网络或稍后重试。')
    }
    if (error instanceof TypeError) {
      throw new Error('无法连接 AI 网关，请确认师说服务端正在运行。')
    }
    throw error instanceof Error ? error : new Error('模型调用失败。')
  } finally {
    window.clearTimeout(timeout)
  }
}

async function callChatStream(
  messages: ChatMessage[],
  maxTokens: number,
  onUpdate?: (partial: string) => void,
) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 100_000)
  try {
    let result = await requestChatStream(messages, maxTokens, false, controller.signal, onUpdate)
    if (!result.content && isQwenModel(result.model)) {
      result = await requestChatStream(messages, maxTokens, true, controller.signal, onUpdate)
    }
    if (result.content) return result
    throw new Error('模型没有返回文字内容。请联系管理员检查网关模型配置。')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('请求超时，请检查服务端网络或稍后重试。')
    }
    if (error instanceof TypeError) {
      throw new Error('无法连接 AI 网关，请确认师说服务端正在运行。')
    }
    throw error instanceof Error ? error : new Error('模型调用失败。')
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function testAIConnection() {
  const result = await callChat(
    [
      { role: 'system', content: '你是连通性测试助手。' },
      { role: 'user', content: '只回复 OK，不要输出思考过程、解释或标点。' },
    ],
    256,
  )
  return result.content
}

function cleanQuestion(raw: string) {
  const withoutFence = raw
    .trim()
    .replace(/^```[a-zA-Z]*\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  const withoutLabel = withoutFence.replace(/^(题目|题干)[:：]\s*/i, '').trim()
  return withoutLabel.slice(0, 1_200)
}

export async function extractQuestionFromImage(imageDataUrl: string) {
  const result = await callChat(
    [
      {
        role: 'system',
        content:
          '你是严谨的题目识别助手。只提取图片中的题目文字，保留公式、编号和选项，不要解答。若图片中没有清晰可识别的题目，只输出【无法识别】。',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请提取这张图片中的题目，只输出题目文字。' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    520,
  )
  const question = cleanQuestion(result.content)
  if (!question || question.includes('无法识别')) {
    throw new Error('图片里没有识别出清晰题目，请手动输入题面后再发送。')
  }
  return question
}

export async function answerWithExternalAI({
  question,
  courseName,
  localContext,
  mentorBrief,
  onUpdate,
}: {
  question: string
  courseName: string
  localContext: string
  mentorBrief?: string
  onUpdate?: (partial: string) => void
}) {
  const contextBlock = localContext.trim()
    ? `课程知识库中最接近的内容（可能不足以回答）：\n${localContext.slice(0, 2_400)}`
    : '课程知识库没有检索到可用内容。'
  const mentorBlock = mentorBrief?.trim()
    ? `\n\n课程导师要求：\n${mentorBrief.trim()}`
    : ''

  const result = await callChatStream(
    [
      {
        role: 'system',
        content: `你是高校课程「${courseName}」的答疑辅助。课程知识库没有足够可靠的答案，请用中文补充回答：
1. 先给简短结论或解题思路；
2. 再给必要步骤或一个具体例子；
3. 明确区分通用知识与课程要求，不得编造“老师说过”或课程引用；
4. 最后单独一行以“需要老师确认：”开头，列出仍需核对的地方；
5. 控制在 500 字以内，不使用 Markdown 表格。${mentorBlock}`,
      },
      {
        role: 'user',
        content: `学生的问题：${question}\n\n${contextBlock}`,
      },
    ],
    900,
    onUpdate ? (partial) => onUpdate(partial.slice(0, 4_000)) : undefined,
  )
  return { text: result.content.slice(0, 4_000), model: result.model }
}

function normalizeCampusAnswer(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]*#{2,3}[ \t]*/g, '\n\n## ')
    .replace(/(##[^\n]*?)[ \t]*-[ \t]*/g, '$1\n\n- ')
    .replace(/([。；：！？])[ \t]*-[ \t]*/g, '$1\n- ')
    .replace(/^([一二三四五六七八九十]+、[^\n]{2,50})$/gm, '## $1')
    .replace(/^([-•])(?=\S)/gm, '$1 ')
    .replace(/^(\d+\.)(?=\S)/gm, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function answerCampusWithAI({
  question,
  localContext,
  history,
  onUpdate,
}: {
  question: string
  localContext?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  onUpdate?: (partial: string) => void
}) {
  const contextBlock = localContext?.trim()
    ? `校园知识库检索片段（只作参考，可能不相关）：\n${localContext.slice(0, 3_200)}`
    : '这次没有检索到直接相关的校园知识库片段。'
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const officialLinkBlock = CAMPUS_OFFICIAL_LINKS.map(
    (item) => `- ${item.label}：${item.url}（${item.use}）`,
  ).join('\n')
  const result = await callChatStream(
    [
      {
        role: 'system',
        content: `${CAMPUS_ANSWER_SKILL}

今天是 ${today}。回答控制在 900 字以内；先判断检索片段与问题的关系，再组织答案。不要输出 Markdown 表格。
格式硬性要求：每个 ## 小标题、每个 - 列表项、每个数字步骤都必须独立成行；小标题前后各空一行；不要把 ## 或列表符号夹在句子中间。

可用官方入口（只在相关时选 2–4 个，不要全列；链接必须用完整 URL）：
${officialLinkBlock}`,
      },
      ...(history ?? []).slice(-8).map((item) => ({
        role: item.role,
        content: item.content.slice(0, 2_000),
      })),
      {
        role: 'user',
        content: `学生的问题：${question}\n\n${contextBlock}`,
      },
    ],
    1_600,
    onUpdate ? (partial) => onUpdate(partial.slice(0, 4_000)) : undefined,
  )
  return { text: normalizeCampusAnswer(result.content.slice(0, 4_000)), model: result.model }
}

export async function answerMentorWithAI({
  question,
  mentorPrompt,
  onUpdate,
}: {
  question: string
  mentorPrompt: string
  onUpdate?: (partial: string) => void
}) {
  const result = await callChatStream(
    [
      { role: 'system', content: mentorPrompt },
      { role: 'user', content: `学生的问题：${question}` },
    ],
    1_200,
    onUpdate ? (partial) => onUpdate(partial.slice(0, 4_000)) : undefined,
  )
  return { text: result.content.slice(0, 4_000), model: result.model }
}

export async function rewriteTeacherReply({
  text,
  style,
}: {
  text: string
  style: 'shorter' | 'clearer'
}) {
  const instruction =
    style === 'shorter'
      ? '压缩到原长度的一半以内，保留结论、关键步骤和一个提醒，不要丢掉课程口径。'
      : '按“先结论、再关键步骤、最后提醒”重写，句子更短，方便学生阅读。'
  const result = await callChat(
    [
      {
        role: 'system',
        content:
          '你是高校课程助教，帮任课老师改写一条即将发送的答疑回复。保留原文事实和课程口径，不新增没有依据的结论，不提“老师说”，不提自己是 AI。只输出改写后的正文。',
      },
      {
        role: 'user',
        content: `改写要求：${instruction}\n\n原回复：\n${text.slice(0, 6_000)}`,
      },
    ],
    1_000,
  )
  return result.content.slice(0, 4_000)
}

export interface FaqMetaSuggestion {
  aliases: string[]
  tags: string[]
}

function parseFaqMetaSuggestion(raw: string): FaqMetaSuggestion {
  const text = raw.replace(/```[a-zA-Z]*\s*/g, '').trim()
  const match = /\{[\s\S]*\}/.exec(text)
  if (!match) return { aliases: [], tags: [] }
  try {
    const parsed = JSON.parse(match[0]) as { aliases?: unknown; tags?: unknown }
    const clean = (value: unknown, max: number, size: number) =>
      Array.isArray(value)
        ? Array.from(
            new Set(
              value
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => item.length > 0 && item.length <= size),
            ),
          ).slice(0, max)
        : []
    return {
      aliases: clean(parsed.aliases, 6, 24),
      tags: clean(parsed.tags, 4, 8),
    }
  } catch {
    return { aliases: [], tags: [] }
  }
}

/** 给 FAQ 建议检索别名与标签，帮助学生用口语问法也能命中。 */
export async function suggestFaqMeta({
  question,
  answer,
  tags,
}: {
  question: string
  answer: string
  tags: string
}): Promise<FaqMetaSuggestion> {
  const result = await callChat(
    [
      {
        role: 'system',
        content:
          '你是课程知识库的检索助手。根据给出的 FAQ 问题与回答，补充学生可能使用的口语化问法（检索别名）和标签。只输出 JSON，格式：{"aliases":["..."],"tags":["..."]}。aliases 4 到 6 条、每条不超过 20 字；tags 2 到 4 个、每个 2 到 6 字。不要输出解释、代码块或多余文字。',
      },
      {
        role: 'user',
        content: `问题：${question.slice(0, 300)}\n\n回答：${answer.slice(0, 1_500)}\n\n已有标签：${tags.trim() || '（无）'}`,
      },
    ],
    600,
  )
  return parseFaqMetaSuggestion(result.content)
}

export function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return '调用失败，请检查服务端 AI 配置。'
}
