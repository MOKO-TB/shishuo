import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  ChevronDown,
  GraduationCap,
  Lightbulb,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import type { AppData } from '../types'
import type { CourseMentor } from '../data/mentor'
import { buildMentorPrompt, findMentorTopicByQuestion } from '../data/mentor'
import { courseById } from '../data/seed'
import { isPilotCourse } from '../data/pilot'
import {
  answerMentorWithAI,
  errorMessage,
  fetchAIStatus,
  type AIStatus,
} from '../lib/ai'
import type { StudentProfile } from '../lib/profile'
import { useMentorSelection } from '../lib/mentorSelection'
import { makeId } from '../lib/utils'
import { useStore } from '../store'
import { DigitalMentorTools } from './DigitalTools'
import { AnalogMentorTools } from './AnalogTools'
import { AiMark, Badge, Drawer, MathText, Modal, RichText } from './ui'

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
  answer?: MentorAnswer
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
              <span className="mentor-manager-mark">
                <AiMark size={15} />
              </span>
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
      text: `按${mentor.name}的章节顺序：先把基础章打穿，再进后续章节；不要跳章硬啃。`,
      bullets: mentor.chapters
        .filter((item) => item.label !== '黑板版补充')
        .map((item) => item.label),
      routeQuestion: `${mentor.title}应该按什么顺序学？`,
      routeLabel: `去《${course.shortName}》问学习顺序`,
    }
  }

  const asksChapter = /这一章|章节/.test(text)
  const chapter = asksChapter
    ? mentor.chapters.find((item) => text.includes(item.label))
    : undefined

  if (chapter) {
    return {
      title: `章节：${chapter.label}`,
      text: chapter.advice,
      bullets: chapter.topics,
      routeQuestion: `请按「${chapter.label}」这一章给我一个学习顺序。`,
      routeLabel: `去《${course.shortName}》问这一章`,
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
      text: `${mentor.title}不是从最后一章才开始卡，很多问题在前面就已经埋下了。`,
      bullets: [
        ...mentor.foundation.map((item, index) => `先修 ${index + 1}：${item}`),
        '每周 2 次、每次 45 分钟；先做课本例题，再做 2 道变式，不要一次铺五章。',
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

export function MajorMentorSidebarCard({
  onOpen,
}: {
  onOpen: (prompt?: string) => void
  onEditMajor: () => void
}) {
  const { data } = useStore()
  const { mentor, selectMentor, options } = useMentorSelection()

  return (
    <section className="side-mentor" aria-label={`${mentor.title} AI 导师`}>
      <div className="side-mentor-head">
        <span className="side-mentor-mark">
          <AiMark size={16} />
        </span>
        <div className="side-mentor-copy">
          <span className="side-mentor-eyebrow">{mentor.name} · AI</span>
          <strong>{mentor.title}</strong>
        </div>
        <span className="side-mentor-tag">AI</span>
      </div>
      <p className="side-mentor-summary">{mentorSummary(data, mentor)}</p>
      <div className="side-mentor-switch">
        <span>AI 老师</span>
        <MentorSwitcher
          mentor={mentor}
          options={options}
          onSelect={selectMentor}
          variant="dark"
        />
      </div>
      <div className="side-mentor-actions">
        <button
          className="side-mentor-primary"
          onClick={() => onOpen(mentor.quickPrompts[0])}
        >
          先诊断
        </button>
        <button className="side-mentor-ghost" onClick={() => onOpen()}>
          问导师
        </button>
      </div>
      <button
        className="side-mentor-edit"
        onClick={() => onOpen('课程怎么排？')}
      >
        看课程地图
      </button>
    </section>
  )
}

export function MajorMentorStrip({
  data,
  onOpen,
}: {
  profile: StudentProfile
  data: AppData
  onOpen: (prompt?: string) => void
  onEditMajor: () => void
}) {
  const { mentor, selectMentor, options } = useMentorSelection()

  return (
    <section className="mentor-strip" aria-label={`${mentor.title} AI 导师`}>
      <div className="mentor-strip-main">
        <span className="mentor-strip-mark">
          <AiMark size={17} />
        </span>
        <div className="mentor-strip-copy">
          <div className="mentor-strip-title">
            <strong>{mentor.name}</strong>
            <span>{mentor.title}</span>
            <MentorSwitcher
              mentor={mentor}
              options={options}
              onSelect={selectMentor}
              variant="light"
            />
          </div>
          <p>{mentorSummary(data, mentor)}</p>
        </div>
      </div>
      <div className="mentor-strip-actions">
        <button
          className="button button-primary"
          onClick={() => onOpen(mentor.quickPrompts[0])}
        >
          先诊断
        </button>
        <button className="button button-ghost" onClick={() => onOpen()}>
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
}: {
  open: boolean
  onClose: () => void
  profile: StudentProfile
  data: AppData
  seed: { id: number; text: string } | null
  onRoute: (courseId: string, question: string) => void
  onOpenCourse: (courseId: string) => void
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
  const [thinkingByMentor, setThinkingByMentor] = useState<Record<string, boolean>>({})
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastSeed = useRef<number | null>(null)
  const thinkingRef = useRef<Record<string, boolean>>({})
  const aiReady = Boolean(aiStatus?.configured)
  const canRoute = isPilotCourse(mentor.courseId)

  const messages = threads[mentor.courseId] ?? []
  const input = inputs[mentor.courseId] ?? ''
  const thinking = Boolean(thinkingByMentor[mentor.courseId])

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

  const updateThinking = (mentorId: string, value: boolean) => {
    setThinkingByMentor((current) => ({ ...current, [mentorId]: value }))
  }

  const send = async (raw: string) => {
    const text = raw.trim()
    const mentorId = mentor.courseId
    if (!text || thinkingRef.current[mentorId]) return
    thinkingRef.current[mentorId] = true
    updateThread(mentorId, (current) => [
      ...current,
      { id: makeId('mentor-q'), role: 'user', text },
    ])
    updateInput(mentorId, '')
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
          onUpdate: (partial) => {
            patchAnswer({
              title: '导师回答',
              text: partial,
              ai: true,
              model: aiStatus.model || '服务端 AI',
              streaming: true,
            })
          },
        })
        patchAnswer({
          title: '导师回答',
          text: ai.text,
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
            <AiMark size={18} />
            <div>
              <div className="eyebrow">{mentor.name} · AI</div>
              <h2>{mentor.title}</h2>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭 AI 导师">
            <X size={18} />
          </button>
        </header>
        <div className="mentor-drawer-sub">
          <div className="mentor-teacher-switch" role="group" aria-label="切换 AI 老师">
            {options.map((option) => (
              <button
                key={option.courseId}
                className={`mentor-teacher-chip ${option.courseId === mentor.courseId ? 'is-active' : ''}`}
                onClick={() => selectMentor(option.courseId)}
              >
                {option.title}
              </button>
            ))}
          </div>
          <button
            className="mentor-manage-button"
            onClick={() => setManagerOpen(true)}
            aria-label="管理 AI 导师"
          >
            <Settings2 size={13} />
            管理导师
          </button>
        </div>

        {mentor.courseId === 'digital' && <DigitalMentorTools />}
        {mentor.courseId === 'analog' && <AnalogMentorTools />}

        <div className="mentor-drawer-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="mentor-welcome">
              <span className="mentor-welcome-mark">
                <AiMark size={17} />
              </span>
              <div>
                <strong>我是你的{mentor.name}</strong>
                <p>
                  已把公开课整理成 {mentor.chapters.length} 个章节。先告诉我你卡在哪：
                  {mentor.chapters.slice(0, 4).map((chapter) => chapter.label).join('、')}
                  ？我会先定位卡点，再讲关键一步，最后留一道换数字的题。
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
                    <span>课程地图 · {mentor.chapters.length} 章</span>
                  </div>
                  <div className="mentor-course-chips">
                    {mentor.chapters.map((chapter) => (
                      <button
                        key={chapter.label}
                        className="mentor-course-chip"
                        onClick={() => send(`「${chapter.label}」这一章先学什么？`)}
                      >
                        {chapter.label}
                      </button>
                    ))}
                  </div>
                  <p className="mentor-course-style">
                    讲课特点：条件先行 · 例题密度高 · 易错点直接说破
                  </p>
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
          )}

          <div className="mentor-thread">
            {messages.map((message) =>
              message.role === 'user' ? (
                <div className="mentor-msg is-user" key={message.id}>
                  <p>{message.text}</p>
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
                  <p className="mentor-msg-text">{message.text}</p>
                </div>
              ),
            )}
            {thinking && (
              <div className="mentor-msg is-mentor">
                <span className="mentor-msg-mark">
                  <AiMark size={14} />
                </span>
                <p className="mentor-msg-text">导师正在按你的卡点组织回答…</p>
              </div>
            )}
          </div>
        </div>

        <footer className="mentor-composer">
          <div className="mentor-input-row">
            <textarea
              ref={inputRef}
              className="mentor-input"
              value={input}
              onChange={(event) => updateInput(mentor.courseId, event.target.value)}
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
              rows={2}
              aria-label={`问${mentor.title}`}
              disabled={thinking}
            />
            <button
              className="button button-primary mentor-send"
              onClick={() => void send(input)}
              disabled={!input.trim() || thinking}
              aria-label={`发送给${mentor.name}`}
            >
              <Send size={16} />
            </button>
          </div>
          <p className="mentor-footnote">
            {aiReady
              ? '已接入服务端 AI；回答按导师档案生成。'
              : '服务端 AI 未就绪；当前用固定诊断。'}{' '}
            学习建议，不替代任课老师。Enter 发送，Shift + Enter 换行。
          </p>
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
      <span className="mentor-msg-mark">
        <AiMark size={14} />
      </span>
      <div className="mentor-msg-main">
        <div className="mentor-msg-head">
          <strong>
            <MathText text={answer.title} />
          </strong>
          <Badge tone="gold">{mentorName}</Badge>
          {answer.ai && <Badge tone="blue">AI 生成</Badge>}
        </div>
        {answer.ai ? (
          <div className="mentor-ai-answer">
            <RichText text={answer.text} />
            {answer.streaming && <span className="ai-streaming-caret" aria-label="正在生成" />}
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
        {answer.ai && answer.model && (
          <p className="mentor-ai-source">由 {answer.model} 生成 · 按导师档案提示</p>
        )}
      </div>
    </article>
  )
}
