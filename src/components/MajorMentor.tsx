import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  GraduationCap,
  ImagePlus,
  Lightbulb,
  Loader2,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import type { AppData, ThreadAttachment } from '../types'
import {
  ASK_FILE_ACCEPT,
  ASK_IMAGE_ACCEPT,
  formatFileSize,
  prepareAttachment,
} from '../lib/attachment'
import type { CourseMentor } from '../data/mentor'
import {
  buildMentorPrompt,
  findMentorTopicByQuestion,
  mentorForCourse,
} from '../data/mentor'
import { courseById } from '../data/seed'
import { isPilotCourse } from '../data/pilot'
import {
  answerMentorWithAI,
  errorMessage,
  fetchAIStatus,
  type AIStatus,
} from '../lib/ai'
import {
  checkLocalTeachingRelevance,
  parseStudyQaResponse,
  reportInvalidQa,
  stripInvalidQaMarker,
} from '../lib/studyQaSkill'
import type { StudentProfile } from '../lib/profile'
import { useMentorSelection } from '../lib/mentorSelection'
import { makeId } from '../lib/utils'
import { useStore } from '../store'
import { DigitalMentorTools } from './DigitalTools'
import { AnalogMentorTools } from './AnalogTools'
import {
  DigitalAvatarBadge,
  MentorAvatarStage,
  type AvatarMood,
} from './DigitalAvatar'
import { Badge, Drawer, MathText, Modal, RichText } from './ui'
import { scoreFuzzyCourseQuery } from './CourseSelect'

interface MentorAnswer {
  title: string
  text: string
  bullets?: string[]
  prereq?: string
  example?: string
  exampleLabel?: string
  pitfall?: string
  pitfallLabel?: string
  transfer?: {
    question: string
    hint: string
    answer: string
  }
  closing?: string
  routeQuestion?: string
  routeLabel?: string
  ai?: boolean
  model?: string
  note?: string
  /** True while the server AI stream is still arriving. */
  streaming?: boolean
}

interface MentorMessage {
  id: string
  role: 'user' | 'mentor'
  text: string
  attachment?: ThreadAttachment
  answer?: MentorAnswer
}

function MentorCourseSelect({
  mentor,
  options,
  onSelect,
  onManage,
}: {
  mentor: CourseMentor
  options: CourseMentor[]
  onSelect: (courseId: string) => void
  onManage: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return options
    return options
      .map((item) => ({
        item,
        score: scoreFuzzyCourseQuery(
          item.title,
          `${item.name} ${item.courseId} ${item.chapters.map((c) => c.label).join(' ')}`,
          query,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item)
  }, [options, query])

  useEffect(() => {
    setHighlightIndex(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus()
    }, 20)
    const close = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close, { passive: true })
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (courseId: string) => {
    onSelect(courseId)
    setOpen(false)
    setQuery('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightIndex((i) => (filtered.length > 0 ? (i + 1) % filtered.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightIndex((i) =>
        filtered.length > 0 ? (i - 1 + filtered.length) % filtered.length : 0,
      )
    } else if (event.key === 'Enter' && filtered[highlightIndex]) {
      event.preventDefault()
      pick(filtered[highlightIndex].courseId)
    }
  }

  return (
    <div className={`mentor-head-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="mentor-head-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="mentor-head-select-title">{mentor.title}</span>
        <ChevronDown size={16} className="mentor-head-select-chevron" />
      </button>

      {open && (
        <div className="mentor-head-select-menu" role="dialog" aria-label="切换导师课程">
          <div className="mentor-head-select-search">
            <Search size={14} className="mentor-head-select-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="mentor-head-select-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索课程名、简称或拼音…"
              aria-label="搜索导师课程"
            />
            {query && (
              <button
                type="button"
                className="mentor-head-select-clear"
                onClick={() => {
                  setQuery('')
                  searchInputRef.current?.focus()
                }}
                aria-label="清空搜索"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="mentor-head-select-list" role="listbox" aria-label="导师课程列表">
            {filtered.length > 0 ? (
              filtered.map((option, index) => {
                const selected = option.courseId === mentor.courseId
                return (
                  <button
                    key={option.courseId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`mentor-head-select-option${selected ? ' is-selected' : ''}${index === highlightIndex ? ' is-highlighted' : ''}`}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => pick(option.courseId)}
                  >
                    <span>{option.title}</span>
                    {selected && <Check size={14} className="mentor-head-select-check" />}
                  </button>
                )
              })
            ) : (
              <div className="mentor-head-select-empty">没有找到匹配「{query}」的课程</div>
            )}
          </div>

          <div className="mentor-head-select-foot">
            <button
              type="button"
              className="mentor-head-select-manage"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
            >
              <Settings2 size={13} />
              管理导师
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MentorSwitcher({
  mentor,
  options,
  onSelect,
  variant,
}: {
  mentor: CourseMentor
  options: CourseMentor[]
  onSelect: (courseId: string) => void
  variant: 'dark' | 'light'
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div className={`mentor-switcher is-${variant}`} ref={rootRef}>
      <button
        className="mentor-switcher-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="切换 AI 老师"
      >
        <span>{mentor.title}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="mentor-switcher-menu" role="listbox" aria-label="选择 AI 老师">
          {options.map((option) => (
            <button
              key={option.courseId}
              role="option"
              aria-selected={option.courseId === mentor.courseId}
              className={option.courseId === mentor.courseId ? 'is-active' : ''}
              onClick={() => {
                onSelect(option.courseId)
                setOpen(false)
              }}
            >
              <span>{option.title}</span>
              <small>{option.name}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MentorManager({
  open,
  onClose,
  allMentors,
  enabledIds,
  onAdd,
  onRemove,
  onReset,
}: {
  open: boolean
  onClose: () => void
  allMentors: CourseMentor[]
  enabledIds: string[]
  onAdd: (courseId: string) => void
  onRemove: (courseId: string) => void
  onReset: () => void
}) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery('')
  }, [open])

  const needle = query.trim().toLowerCase()
  const filtered = allMentors.filter((mentor) => {
    if (!needle) return true
    const course = courseById(mentor.courseId)
    return [mentor.title, mentor.name, mentor.tagline, course.name, course.shortName]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="AI 导师库"
      title="添加或移除导师"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            默认保留 5 门试点导师；扩展导师只提供导师答疑，不进入课程问答和教师待办。
          </span>
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={onReset}>
              <RotateCcw size={14} />
              恢复试点 5 位
            </button>
            <button className="button button-primary" onClick={onClose}>
              完成
            </button>
          </div>
        </div>
      }
    >
      <div className="mentor-manager-intro">
        <Settings2 size={17} />
        <p>
          已添加 {enabledIds.length} / {allMentors.length} 位导师。添加后会立即出现在 AI 老师切换器，
          并按当前账号记住；至少保留一位。
        </p>
      </div>

      <label className="mentor-manager-search">
        <Search size={15} />
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索课程、导师或主题，例如：线性代数"
          autoComplete="off"
        />
      </label>

      <div className="mentor-manager-list">
        {filtered.map((mentor) => {
          const course = courseById(mentor.courseId)
          const enabled = enabledIds.includes(mentor.courseId)
          return (
            <div className={`mentor-manager-row ${enabled ? 'is-enabled' : ''}`} key={mentor.courseId}>
              <DigitalAvatarBadge size={28} />
              <div className="mentor-manager-copy">
                <div>
                  <strong>{mentor.title}</strong>
                  {isPilotCourse(mentor.courseId) && (
                    <span className="mentor-manager-scope">试点</span>
                  )}
                  {enabled && <span className="mentor-manager-added">已添加</span>}
                </div>
                <em>
                  {course.name} · {mentor.name}
                </em>
                <p>{mentor.tagline}</p>
              </div>
              <button
                className={`mentor-manager-toggle ${enabled ? 'is-remove' : 'is-add'}`}
                onClick={() =>
                  enabled ? onRemove(mentor.courseId) : onAdd(mentor.courseId)
                }
                disabled={enabled && enabledIds.length <= 1}
                title={enabled && enabledIds.length <= 1 ? '至少保留一位 AI 导师' : undefined}
              >
                {enabled ? <Trash2 size={13} /> : <Plus size={13} />}
                {enabled ? '移除' : '添加'}
              </button>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="mentor-manager-empty">没有找到匹配的导师。</p>
        )}
      </div>
    </Modal>
  )
}

function pendingMentorThreads(data: AppData, mentor: CourseMentor) {
  return data.threads.filter(
    (thread) =>
      thread.courseId === mentor.courseId &&
      thread.status === 'pending' &&
      !thread.withdrawnAt,
  )
}

function mentorSummary(data: AppData, mentor: CourseMentor) {
  const pending = pendingMentorThreads(data, mentor)
  if (pending.length > 0) {
    const course = courseById(mentor.courseId)
    return `《${course.shortName}》有 ${pending.length} 个问题在等${course.teacher}老师`
  }
  return mentor.tagline
}

function answerMentor(question: string, mentor: CourseMentor): MentorAnswer {
  const text = question.trim()
  const course = courseById(mentor.courseId)
  const routeLabel = `去《${course.shortName}》问`

  if (/(全课|课程地图|学习路线|怎么排)/.test(text)) {
    return {
      title: '课程学习顺序',
      text: `按知识主题的顺序：先把基础主题打穿，再进后续主题；不要跳主题硬啃。`,
      bullets: mentor.chapters
        .filter((item) => item.label !== '黑板版补充')
        .map((item) => item.label),
      routeQuestion: `${mentor.title}应该按什么顺序学？`,
      routeLabel: `去《${course.shortName}》问学习顺序`,
    }
  }

  const asksChapter = /这一章|这一节|章节|这个主题/.test(text)
  const chapter = asksChapter
    ? mentor.chapters.find((item) => text.includes(item.label))
    : undefined

  if (chapter) {
    return {
      title: `主题：${chapter.label}`,
      text: chapter.advice,
      bullets: chapter.topics,
      routeQuestion: `请围绕「${chapter.label}」这个主题，讲清最关键的知识点和条件。`,
      routeLabel: `去《${course.shortName}》问这个主题`,
    }
  }

  const topic = findMentorTopicByQuestion(mentor, text)
  if (topic) {
    const voice = mentor.voice
    const styled = Boolean(voice && topic.voiceOpening)
    return {
      title: `先定位：${topic.name}`,
      text: styled
        ? topic.voiceOpening!
        : '先别急着套公式。你更接近哪一种卡点？',
      bullets: [topic.core, ...topic.diagnose],
      prereq: topic.prerequisite,
      example: topic.example,
      exampleLabel: styled ? voice?.exampleLead : '关键例子',
      pitfallLabel: styled ? voice?.warningLead : undefined,
      pitfall: `${topic.misconception.wrong} ${topic.misconception.why} 改法：${topic.misconception.fix}`,
      transfer: topic.transfer,
      closing: styled ? voice?.closing : undefined,
      routeQuestion: text,
      routeLabel,
    }
  }

  if (/(基础差|先补|怎么学|学习计划|顺序|规划|跟不上|从头学)/.test(text)) {
    return {
      title: '先补这三块，再谈刷题',
      text: `${mentor.title}不是从最难的部分才开始卡，很多问题在前面就已经埋下了。`,
      bullets: [
        ...mentor.foundation.map((item, index) => `先修 ${index + 1}：${item}`),
        '每周 2 次、每次 45 分钟；先做课本例题，再做 2 道变式，不要一次铺五个主题。',
      ],
      routeQuestion: `我${mentor.title}基础差，应该先补哪几块？`,
      routeLabel: `去《${course.shortName}》问基础补强`,
    }
  }

  return {
    title: '这题需要具体题面',
    text: `把题目、你的思路和卡住的那一步带去《${course.name}》里问；知识库没把握会自动转${course.teacher}老师，不会硬编一个答案。`,
    routeQuestion: text,
    routeLabel,
  }
}

export function MajorMentorStrip({
  courseId,
  data,
  onOpen,
  onSelectCourse,
}: {
  profile: StudentProfile
  courseId: string
  data: AppData
  onOpen: (prompt?: string) => void
  onSelectCourse: (courseId: string) => void
  onEditMajor: () => void
}) {
  const { mentor, selectMentor, options, enabledIds, addMentor } = useMentorSelection()

  const chooseMentor = (id: string) => {
    selectMentor(id)
    onSelectCourse(id)
  }

  useEffect(() => {
    if (!courseId || mentor.courseId === courseId) return
    if (!mentorForCourse(courseId)) return
    if (enabledIds.includes(courseId)) {
      selectMentor(courseId)
    } else {
      addMentor(courseId)
    }
  }, [courseId, mentor.courseId, enabledIds, selectMentor, addMentor])

  return (
    <section className="mentor-strip" aria-label={`${mentor.title} AI 导师`}>
      <div className="mentor-strip-main">
        <DigitalAvatarBadge size={36} />
        <div className="mentor-strip-copy">
          <div className="mentor-strip-title">
            <strong>{mentor.name}</strong>
            <span>{mentor.title}</span>
            <MentorSwitcher
              mentor={mentor}
              options={options}
              onSelect={chooseMentor}
              variant="light"
            />
          </div>
          <p>{mentorSummary(data, mentor)}</p>
        </div>
      </div>
      <div className="mentor-strip-actions">
        {/* 桌面端保留「先诊断 / 问导师」两个入口（预填问题 vs 空白输入框） */}
        <button
          className="button button-primary is-desktop-only"
          onClick={() => onOpen(mentor.quickPrompts[0])}
        >
          先诊断
        </button>
        <button
          className="button button-ghost is-desktop-only"
          onClick={() => onOpen()}
        >
          问导师
        </button>
        {/* 手机端两者跳同一个抽屉，合并为一个按钮 */}
        <button
          className="button button-primary is-mobile-only"
          onClick={() => onOpen()}
        >
          问导师
        </button>
        <button
          className="text-button mentor-edit"
          onClick={() => onOpen('课程怎么排？')}
        >
          看地图
        </button>
      </div>
    </section>
  )
}

export function MajorMentorDrawer({
  open,
  onClose,
  seed,
  onRoute,
  onOpenCourse,
  onSelectCourse,
}: {
  open: boolean
  onClose: () => void
  profile: StudentProfile
  data: AppData
  seed: { id: number; text: string } | null
  onRoute: (courseId: string, question: string) => void
  onOpenCourse: (courseId: string) => void
  onSelectCourse: (courseId: string) => void
  onEditMajor: () => void
}) {
  const {
    mentor,
    selectMentor,
    options,
    allMentors,
    enabledIds,
    addMentor,
    removeMentor,
    resetMentors,
  } = useMentorSelection()
  const [managerOpen, setManagerOpen] = useState(false)
  const [threads, setThreads] = useState<Record<string, MentorMessage[]>>({})
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [attachments, setAttachments] = useState<Record<string, ThreadAttachment | null>>({})
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [invalidNotice, setInvalidNotice] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [thinkingByMentor, setThinkingByMentor] = useState<Record<string, boolean>>({})
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastSeed = useRef<number | null>(null)
  const thinkingRef = useRef<Record<string, boolean>>({})
  const canRoute = isPilotCourse(mentor.courseId)

  const messages = threads[mentor.courseId] ?? []
  const input = inputs[mentor.courseId] ?? ''
  const attachment = attachments[mentor.courseId] ?? null
  const thinking = Boolean(thinkingByMentor[mentor.courseId])
  const lastMessage = messages[messages.length - 1]
  const avatarMood: AvatarMood = thinking
    ? lastMessage?.answer?.streaming && lastMessage.answer.text.length > 0
      ? 'answering'
      : 'thinking'
    : lastMessage?.role === 'mentor'
      ? lastMessage.answer?.note && !lastMessage.answer.ai
        ? 'notice'
        : 'happy'
      : 'idle'

  const updateThread = (
    mentorId: string,
    updater: (current: MentorMessage[]) => MentorMessage[],
  ) => {
    setThreads((current) => ({
      ...current,
      [mentorId]: updater(current[mentorId] ?? []),
    }))
  }

  const updateInput = (mentorId: string, value: string) => {
    setInputs((current) => ({ ...current, [mentorId]: value }))
  }

  const updateAttachment = (mentorId: string, value: ThreadAttachment | null) => {
    setAttachments((current) => ({ ...current, [mentorId]: value }))
  }

  const updateThinking = (mentorId: string, value: boolean) => {
    setThinkingByMentor((current) => ({ ...current, [mentorId]: value }))
  }

  const resizeInput = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = '42px'
    const next = Math.min(120, Math.max(42, el.scrollHeight))
    el.style.height = `${next}px`
  }

  const attachFile = async (file: File) => {
    if (thinking || attachmentBusy) return
    setAttachError(null)
    setAttachmentBusy(true)
    try {
      const prepared = await prepareAttachment(file)
      updateAttachment(mentor.courseId, prepared)
    } catch (error) {
      setAttachError(errorMessage(error))
    } finally {
      setAttachmentBusy(false)
    }
  }

  const handleFilePicked = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await attachFile(file)
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void attachFile(file)
  }

  useEffect(() => {
    if (!attachMenuOpen) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!attachMenuRef.current?.contains(event.target as Node)) {
        setAttachMenuOpen(false)
      }
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setAttachMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown, { passive: true })
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [attachMenuOpen])

  useEffect(() => {
    resizeInput(inputRef.current)
  }, [input, mentor.courseId, open])

  useEffect(() => {
    setInvalidNotice(null)
  }, [mentor.courseId, open])

  const send = async (raw: string) => {
    const mentorId = mentor.courseId
    const currentAttachment = attachments[mentorId] ?? null
    const text =
      raw.trim() ||
      (currentAttachment
        ? currentAttachment.kind === 'image'
          ? '请帮我看一下这张图片'
          : `请帮我分析这份文件《${currentAttachment.name}》`
        : '')
    if (!text || thinkingRef.current[mentorId]) return

    // 第一道过滤：本地快速预筛与课程教学无关的内容，不进入导师对话记录并上报后台标记无效。
    const localRelevance = checkLocalTeachingRelevance(text, {
      hasAttachment: Boolean(currentAttachment),
      courseName: mentor.title,
    })
    if (localRelevance.invalid) {
      updateInput(mentorId, '')
      setAttachMenuOpen(false)
      setInvalidNotice(localRelevance.notice)
      void reportInvalidQa({
        source: 'mentor',
        courseId: mentorId,
        courseName: mentor.title,
        question: text,
        reason: localRelevance.reason,
        reply: localRelevance.notice,
      })
      return
    }

    thinkingRef.current[mentorId] = true
    setAttachError(null)
    setInvalidNotice(null)
    setAttachMenuOpen(false)
    const userMessageId = makeId('mentor-q')
    updateThread(mentorId, (current) => [
      ...current,
      {
        id: userMessageId,
        role: 'user',
        text,
        attachment: currentAttachment ?? undefined,
      },
    ])
    updateInput(mentorId, '')
    updateAttachment(mentorId, null)
    updateThinking(mentorId, true)

    if (aiStatus?.configured) {
      const messageId = makeId('mentor-a')
      const patchAnswer = (mentorReply: MentorAnswer) => {
        updateThread(mentorId, (current) =>
          current.map((message) =>
            message.id === messageId
              ? { ...message, text: mentorReply.title, answer: mentorReply }
              : message,
          ),
        )
      }
      updateThread(mentorId, (current) => [
        ...current,
        {
          id: messageId,
          role: 'mentor',
          text: '导师回答',
          answer: {
            title: '导师回答',
            text: '',
            ai: true,
            model: aiStatus.model || '服务端 AI',
            streaming: true,
          },
        },
      ])
      try {
        const ai = await answerMentorWithAI({
          question: text,
          mentorPrompt: buildMentorPrompt(mentor, text),
          courseName: mentor.title,
          imageDataUrl:
            currentAttachment?.kind === 'image' ? currentAttachment.dataUrl : undefined,
          documentText:
            currentAttachment?.kind === 'document' ? currentAttachment.text : undefined,
          documentName:
            currentAttachment?.kind === 'document' ? currentAttachment.name : undefined,
          onUpdate: (partial) => {
            patchAnswer({
              title: '导师回答',
              text: stripInvalidQaMarker(partial),
              ai: true,
              model: aiStatus.model || '服务端 AI',
              streaming: true,
            })
          },
        })
        const parsed = parseStudyQaResponse(ai.text)
        if (parsed.invalid) {
          updateThread(mentorId, (current) =>
            current.filter(
              (message) => message.id !== userMessageId && message.id !== messageId,
            ),
          )
          setInvalidNotice(parsed.cleanText)
          void reportInvalidQa({
            source: 'mentor',
            courseId: mentorId,
            courseName: mentor.title,
            question: text,
            reason: parsed.reason,
            reply: parsed.cleanText,
          })
          return
        }
        patchAnswer({
          title: '导师回答',
          text: parsed.cleanText,
          ai: true,
          model: ai.model || aiStatus.model || '服务端 AI',
        })
      } catch (error) {
        const fallback = answerMentor(text, mentor)
        patchAnswer({
          ...fallback,
          note: `服务端 AI 调用失败：${errorMessage(error)}。先用固定诊断；网关恢复后可再试。`,
        })
      } finally {
        thinkingRef.current[mentorId] = false
        updateThinking(mentorId, false)
      }
      return
    }

    const fallback = answerMentor(text, mentor)
    thinkingRef.current[mentorId] = false
    updateThinking(mentorId, false)
    updateThread(mentorId, (current) => [
      ...current,
      {
        id: makeId('mentor-a'),
        role: 'mentor',
        text: fallback.title,
        answer: {
          ...fallback,
          note: '服务端 AI 网关尚未就绪，先用固定诊断；管理员配置后会自动按导师风格生成。',
        },
      },
    ])
  }

  useEffect(() => {
    if (!open || !seed) return
    if (lastSeed.current === seed.id) return
    lastSeed.current = seed.id
    void send(seed.text)
    // The seed id is the dedupe key; send must read the latest mentor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed?.id, mentor.courseId])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      const body = bodyRef.current
      if (!body) return
      if (messages.length === 0) {
        body.scrollTo({ top: 0, behavior: 'auto' })
        return
      }
      body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' })
    }, 60)
    return () => window.clearTimeout(timer)
  }, [messages.length, thinking, open, mentor.courseId])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 220)
    return () => window.clearTimeout(timer)
  }, [open, mentor.courseId])

  useEffect(() => {
    if (!open) setManagerOpen(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void fetchAIStatus()
      .then((status) => {
        if (!cancelled) setAiStatus(status)
      })
      .catch(() => {
        if (!cancelled) setAiStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const routeToCourse = (question: string) => {
    if (!canRoute) return
    onClose()
    onRoute(mentor.courseId, question)
  }

  return (
    <Drawer open={open} onClose={onClose} ariaLabel={`${mentor.title} AI 导师`}>
      <div className="mentor-drawer">
        <header className="mentor-drawer-head">
          <div className="mentor-drawer-head-main">
            <div className="mentor-drawer-head-copy">
              <MentorCourseSelect
                mentor={mentor}
                options={options}
                onSelect={(courseId) => {
                  selectMentor(courseId)
                  onSelectCourse(courseId)
                }}
                onManage={() => setManagerOpen(true)}
              />
            </div>
          </div>
          <button
            className="icon-button mentor-drawer-close"
            onClick={onClose}
            aria-label="关闭 AI 导师"
          >
            <X size={18} />
          </button>
        </header>

        <MentorAvatarStage
          mood={avatarMood}
          mentorName={mentor.name}
          courseTitle={mentor.title}
        />

        <div className="mentor-drawer-body" ref={bodyRef}>
          <div className={`mentor-welcome ${messages.length > 0 ? 'is-kept' : ''}`}>
              <DigitalAvatarBadge mood={avatarMood} size={32} />
              <div>
                <strong>我是你的{mentor.name}</strong>
                <p>
                  {mentor.chapters.length > 0
                    ? `已把公开课整理成 ${mentor.chapters.length} 个知识主题。先告诉我你卡在哪：${mentor.chapters
                        .slice(0, 4)
                        .map((chapter) => chapter.label)
                        .join('、')}？我会先定位卡点，再讲关键一步，最后留一道换数字的题。`
                    : '我会按这门课的课程知识和任课老师口径，先定位卡点，再讲关键一步；没有把握时建议转交任课老师。先告诉我你卡在哪。'}
                </p>
                <div className="mentor-quick">
                  {mentor.quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      className="mentor-quick-chip"
                      onClick={() => void send(prompt)}
                      disabled={thinking}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <div className="mentor-course-map">
                  <div className="mentor-course-map-head">
                    <GraduationCap size={14} />
                    <span>知识地图 · {mentor.chapters.length} 个主题</span>
                  </div>
                  <div className="mentor-course-chips">
                    {mentor.chapters.map((chapter) => (
                      <button
                        key={chapter.label}
                        className="mentor-course-chip"
                        onClick={() => send(`「${chapter.label}」这个主题先讲什么？`)}
                      >
                        {chapter.label}
                      </button>
                    ))}
                  </div>
                </div>
                {mentor.sourceStats && (
                  <div className="mentor-source-stats">
                    <div className="mentor-source-stats-head">
                      <span>术语匹配统计</span>
                      <strong>
                        {(
                          (mentor.sourceStats.matchedPages / mentor.sourceStats.subtitlePages) *
                          100
                        ).toFixed(1)}
                        % 匹配
                      </strong>
                    </div>
                    <div className="mentor-source-stats-grid">
                      <span>
                        总 P <strong>{mentor.sourceStats.totalPages}</strong>
                      </span>
                      <span>
                        有字幕 <strong>{mentor.sourceStats.subtitlePages}</strong>
                      </span>
                      <span>
                        匹配 <strong>{mentor.sourceStats.matchedPages}</strong>
                      </span>
                      <span>
                        匹配时长 <strong>{mentor.sourceStats.matchedHours}h</strong>
                      </span>
                    </div>
                    <p>
                      匹配 {(mentor.sourceStats.matchedChars / 10000).toFixed(1)} 万字 · 原课{' '}
                      {mentor.totalHours}h · 术语表 {mentor.sourceStats.termCount} 个
                    </p>
                    <div className="mentor-source-terms">
                      {mentor.sourceStats.topTerms.map((item) => (
                        <span key={item.term}>
                          {item.term}
                          <em>{item.count}</em>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {canRoute ? (
                  <button
                    className="button button-ghost mentor-open-course"
                    onClick={() => {
                      onClose()
                      onOpenCourse(mentor.courseId)
                    }}
                  >
                    <GraduationCap size={15} />
                    打开{mentor.title}课程
                  </button>
                ) : (
                  <p className="mentor-extension-note">
                    扩展导师只提供导师答疑；课程问答与教师待办仍限 5 门试点课程。
                  </p>
                )}
              </div>
            </div>

          <div className="mentor-thread">
            {messages.map((message) =>
              message.role === 'user' ? (
                <div className="mentor-msg is-user" key={message.id}>
                  <p>
                    {message.text}
                    {message.attachment?.kind === 'image' && message.attachment.dataUrl && (
                      <img
                        className="mentor-msg-attach-img"
                        src={message.attachment.dataUrl}
                        alt={message.attachment.name}
                      />
                    )}
                    {message.attachment?.kind === 'document' && (
                      <span className="mentor-msg-attach">
                        <FileText size={12} />
                        {message.attachment.name}
                      </span>
                    )}
                  </p>
                </div>
              ) : message.answer ? (
                <MathMentorBubble
                  key={message.id}
                  answer={message.answer}
                  mentorName={mentor.name}
                  onRoute={routeToCourse}
                  canRoute={canRoute}
                />
              ) : (
                <div className="mentor-msg is-mentor" key={message.id}>
                  <DigitalAvatarBadge mood="notice" size={28} />
                  <p className="mentor-msg-text">{message.text}</p>
                </div>
              ),
            )}
            {thinking && !messages[messages.length - 1]?.answer?.streaming && (
              <div className="mentor-msg is-mentor">
                <DigitalAvatarBadge mood="thinking" size={28} />
                <p className="mentor-msg-text">正在思考中…</p>
              </div>
            )}
          </div>
        </div>

        {mentor.courseId === 'digital' && <DigitalMentorTools />}
        {mentor.courseId === 'analog' && <AnalogMentorTools />}

        <footer
          className={`mentor-composer${dragActive ? ' is-drag-active' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            if (!dragActive) setDragActive(true)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDragActive(false)
            }
          }}
          onDrop={handleDrop}
        >
          <input
            ref={imageInputRef}
            type="file"
            accept={ASK_IMAGE_ACCEPT}
            onChange={(event) => void handleFilePicked(event)}
            hidden
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ASK_FILE_ACCEPT}
            onChange={(event) => void handleFilePicked(event)}
            hidden
          />

          {attachError && <div className="mentor-attach-error">{attachError}</div>}

          {invalidNotice && (
            <div className="mentor-invalid-banner" role="status" aria-live="polite">
              <span>{invalidNotice}</span>
              <button
                type="button"
                className="mentor-attach-remove"
                onClick={() => setInvalidNotice(null)}
                aria-label="关闭提示"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {attachment && (
            <div className="mentor-attach-preview">
              {attachment.kind === 'image' && attachment.dataUrl ? (
                <img
                  className="mentor-attach-thumb"
                  src={attachment.dataUrl}
                  alt={attachment.name}
                />
              ) : (
                <span className="mentor-attach-icon">
                  <FileText size={15} />
                </span>
              )}
              <div className="mentor-attach-meta">
                <strong>{attachment.name}</strong>
                {attachment.size ? <span>{formatFileSize(attachment.size)}</span> : null}
              </div>
              <button
                type="button"
                className="mentor-attach-remove"
                onClick={() => updateAttachment(mentor.courseId, null)}
                aria-label="移除附件"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="mentor-input-row">
            <div className="mentor-plus-wrap" ref={attachMenuRef}>
              <button
                type="button"
                className={`mentor-plus-btn${attachMenuOpen ? ' is-open' : ''}`}
                onClick={() => setAttachMenuOpen((current) => !current)}
                disabled={thinking || attachmentBusy}
                aria-label="添加照片或文件"
                aria-expanded={attachMenuOpen}
                aria-haspopup="menu"
              >
                {attachmentBusy ? <Loader2 size={17} className="spin-icon" /> : <Plus size={18} />}
              </button>
              {attachMenuOpen && (
                <div className="mentor-plus-menu" role="menu" aria-label="添加附件">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAttachMenuOpen(false)
                      imageInputRef.current?.click()
                    }}
                  >
                    <ImagePlus size={15} />
                    选择照片
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAttachMenuOpen(false)
                      fileInputRef.current?.click()
                    }}
                  >
                    <Paperclip size={15} />
                    选择文件
                  </button>
                </div>
              )}
            </div>

            <textarea
              ref={inputRef}
              className="mentor-input"
              value={input}
              onChange={(event) => {
                updateInput(mentor.courseId, event.target.value)
                resizeInput(event.target)
              }}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  void send(input)
                }
              }}
              placeholder={`问${mentor.title}：卡在哪、下一步怎么学…`}
              rows={1}
              aria-label={`问${mentor.title}`}
              disabled={thinking}
            />
            <button
              type="button"
              className="button button-primary mentor-send"
              onClick={() => void send(input)}
              disabled={(!input.trim() && !attachment) || thinking || attachmentBusy}
              aria-label={`发送给${mentor.name}`}
            >
              <Send size={16} />
            </button>
          </div>
        </footer>
      </div>
      <MentorManager
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        allMentors={allMentors}
        enabledIds={enabledIds}
        onAdd={addMentor}
        onRemove={removeMentor}
        onReset={resetMentors}
      />
    </Drawer>
  )
}

function MathMentorBubble({
  answer,
  mentorName,
  onRoute,
  canRoute,
}: {
  answer: MentorAnswer
  mentorName: string
  onRoute: (question: string) => void
  canRoute: boolean
}) {
  return (
    <article className="mentor-msg is-mentor mentor-kind-guide">
      <DigitalAvatarBadge
        mood={answer.streaming ? 'answering' : 'happy'}
        size={28}
      />
      <div className="mentor-msg-main">
        <div className="mentor-msg-head">
          <strong className="mentor-msg-author">{mentorName}</strong>
          {!answer.ai && answer.title && answer.title !== '导师回答' && (
            <span className="mentor-msg-subtitle">
              <MathText text={answer.title} />
            </span>
          )}
        </div>
        {answer.ai ? (
          <div className="mentor-ai-answer">
            {answer.streaming && !answer.text.trim() ? (
              <p className="mentor-msg-text mentor-thinking-text">正在思考中…</p>
            ) : (
              <>
                <RichText text={answer.text} />
                {answer.streaming && (
                  <span className="ai-streaming-caret" aria-label="正在生成" />
                )}
              </>
            )}
          </div>
        ) : (
          <p className="mentor-msg-text">
            <MathText text={answer.text} />
          </p>
        )}
        {answer.bullets && answer.bullets.length > 0 && (
          <ul className="mentor-bullets">
            {answer.bullets.map((bullet) => (
              <li key={bullet}>
                <MathText text={bullet} />
              </li>
            ))}
          </ul>
        )}
        {answer.prereq && (
          <div className="mentor-route">
            <div className="mentor-route-head">
              <ArrowRight size={14} />
              <span>先修检查</span>
            </div>
            <p>
              <MathText text={answer.prereq} />
            </p>
          </div>
        )}
        {answer.example && (
          <div className="mentor-route">
            <div className="mentor-route-head">
              <Lightbulb size={14} />
              <span>{answer.exampleLabel ?? '看个具体的'}</span>
            </div>
            <p>
              <MathText text={answer.example} />
            </p>
          </div>
        )}
        {answer.pitfall && (
          <p className="mentor-msg-text">
            <strong>{answer.pitfallLabel ?? '容易错：'}</strong>
            <MathText text={answer.pitfall} />
          </p>
        )}
        {answer.transfer && (
          <div className="mentor-route">
            <div className="mentor-route-head">
              <ArrowRight size={14} />
              <span>换你练一道 · 不是原题</span>
            </div>
            <p>
              <MathText text={answer.transfer.question} />
            </p>
            <p className="mentor-msg-text">
              <MathText text={answer.transfer.hint} />
            </p>
          </div>
        )}
        {answer.closing && (
          <p className="mentor-msg-text">
            <strong>最后：</strong>
            <MathText text={answer.closing} />
          </p>
        )}
        {answer.note && <p className="mentor-ai-note">{answer.note}</p>}
        {answer.routeQuestion && canRoute && (
          <button
            className="button button-secondary"
            onClick={() => onRoute(answer.routeQuestion!)}
          >
            {answer.routeLabel ?? '去课程里问'}
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </article>
  )
}
