import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import katex from 'katex'
import {
  AlertTriangle,
  Check,
  Info,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react'
import type { Confidence, FeedbackReason } from '../types'
import { cn } from '../lib/utils'
import { popOverlay, pushOverlay } from '../lib/overlayStack'
import { morphAllowed, morphIn, morphOut, takeMorphOrigin, type MorphKind } from '../lib/morph'

export function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="18" fill="var(--brand-bg, #14211c)" />
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="17.25"
        fill="none"
        stroke="var(--brand-border, transparent)"
        strokeWidth="1.5"
      />
      <path
        d="M14 18a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v13a6 6 0 0 1-6 6H27l-9 8v-8a6 6 0 0 1-4-5.65V18Z"
        fill="var(--brand-bubble-primary, #f6f1e5)"
      />
      <path
        d="M26 34a5 5 0 0 1 5-5h14a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5h-2v6l-7-6H31a5 5 0 0 1-5-5v-9Z"
        fill="var(--brand-bubble-reply, #2f8a70)"
      />
      <circle cx="50" cy="52" r="5" fill="var(--brand-dot, #d8a52a)" />
    </svg>
  )
}

export type AvatarTone = 'jade' | 'clay' | 'blue' | 'gold' | 'ink' | 'mint'

interface AvatarProps {
  name: string
  tone?: AvatarTone
  size?: 'xs' | 'sm' | 'md' | 'lg'
  anonymous?: boolean
  className?: string
}

export function Avatar({ name, tone = 'jade', size = 'md', anonymous = false, className }: AvatarProps) {
  return (
    <span
      className={cn('avatar', `avatar-${tone}`, `avatar-${size}`, anonymous && 'avatar-anon', className)}
      aria-label={anonymous ? '匿名同学' : name}
      title={anonymous ? '匿名同学' : name}
    >
      {anonymous ? '匿' : name.trim().slice(0, 1)}
    </span>
  )
}

export function AvatarStack({
  people,
  max = 3,
  size = 'sm',
}: {
  people: Array<{ name: string; anonymous?: boolean }>
  max?: number
  size?: 'xs' | 'sm' | 'md'
}) {
  const visible = people.slice(0, max)
  const rest = people.length - visible.length
  const tones: AvatarTone[] = ['jade', 'clay', 'blue', 'gold']
  return (
    <span className="avatar-stack" aria-label={`${people.length} 位同学`}>
      {visible.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          name={person.name}
          anonymous={person.anonymous}
          tone={tones[index % tones.length]}
          size={size}
        />
      ))}
      {rest > 0 && <span className={cn('avatar-more', `avatar-${size}`)}>+{rest}</span>}
    </span>
  )
}

export type BadgeTone =
  | 'neutral'
  | 'high'
  | 'medium'
  | 'low'
  | 'pending'
  | 'answered'
  | 'ai'
  | 'jade'
  | 'clay'
  | 'gold'
  | 'blue'
  | 'danger'
  | 'outline'

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
  className,
}: {
  tone?: BadgeTone
  children: ReactNode
  dot?: boolean
  className?: string
}) {
  return (
    <span className={cn('badge', `badge-${tone}`, className)}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  )
}

export function ConfidenceMeter({
  confidence,
  compact = false,
}: {
  confidence?: Confidence
  compact?: boolean
}) {
  const active = confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1
  return (
    <span className={cn('confidence-meter', `confidence-${confidence ?? 'low'}`, compact && 'is-compact')}>
      {[0, 1, 2].map((index) => (
        <span key={index} className={cn('confidence-bar', index < active && 'is-active')} />
      ))}
      {!compact && (
        <span className="confidence-meter-label">
          {confidence === 'high' ? '依据充分' : confidence === 'medium' ? '建议确认' : '未达阈值'}
        </span>
      )}
    </span>
  )
}

function MathSpan({ source, displayMode = false }: { source: string; displayMode?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.textContent = ''
    try {
      katex.render(source, node, {
        throwOnError: true,
        displayMode,
        strict: 'ignore',
        trust: false,
        output: 'html',
      })
    } catch {
      node.textContent = displayMode ? `$$${source}$$` : `$${source}$`
    }
  }, [source, displayMode])

  return <span ref={ref} className={displayMode ? 'math-span is-display' : 'math-span'} />
}

type InlinePart = { kind: 'text' | 'math' | 'display'; value: string }

function splitMath(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  // 兼容模型常见的四种公式写法：$...$、$$...$$、\(...\)、\[...\]。
  // 显示公式放在前面，避免 $$ 被当成两个行内 $。
  const pattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) parts.push({ kind: 'text', value: text.slice(cursor, index) })
    const token = match[0]
    if (token.startsWith('$$') || token.startsWith('\\[')) {
      parts.push({ kind: 'display', value: token.slice(2, -2) })
    } else if (token.startsWith('\\(')) {
      parts.push({ kind: 'math', value: token.slice(2, -2) })
    } else {
      parts.push({ kind: 'math', value: token.slice(1, -1) })
    }
    cursor = index + token.length
  }
  if (cursor < text.length) parts.push({ kind: 'text', value: text.slice(cursor) })
  return parts.length > 0 ? parts : [{ kind: 'text', value: text }]
}

function renderLinks(text: string) {
  const parts = text.split(
    /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<]+|(?:www\.)?(?:[a-z0-9-]+\.)+(?:com|cn|net|org|edu\.cn)(?:\/[^\s<，。；、）】]*)?)/gi,
  )
  return parts.filter(Boolean).map((part, index) => {
    const markdown = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part)
    if (markdown) {
      return (
        <a
          key={index}
          className="rich-link"
          href={markdown[2]}
          target="_blank"
          rel="noreferrer"
        >
          {markdown[1]}
        </a>
      )
    }
    if (/^(https?:\/\/|www\.|[a-z0-9-]+\.(?:com|cn|net|org))/i.test(part)) {
      let href = part
      let tail = ''
      while (/[),.;，。；、）】]+$/.test(href)) {
        tail = href.slice(-1) + tail
        href = href.slice(0, -1)
      }
      const url = /^https?:\/\//i.test(href) ? href : `https://${href}`
      return (
        <Fragment key={index}>
          <a className="rich-link" href={url} target="_blank" rel="noreferrer">
            {href}
          </a>
          {tail}
        </Fragment>
      )
    }
    return <Fragment key={index}>{part}</Fragment>
  })
}

function renderBold(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={index}>{renderLinks(part.slice(2, -2))}</strong>
    ) : (
      <Fragment key={index}>{renderLinks(part)}</Fragment>
    ),
  )
}

function renderInline(text: string) {
  return text
    .split(/(`[^`]+`)/g)
    .filter(Boolean)
    .map((segment, segmentIndex) => {
      if (segment.length > 2 && segment.startsWith('`') && segment.endsWith('`')) {
        return (
          <code key={segmentIndex} className="rich-code-inline">
            {segment.slice(1, -1)}
          </code>
        )
      }
      return (
        <Fragment key={segmentIndex}>
          {splitMath(segment).map((part, index) => {
            if (part.kind === 'math') return <MathSpan key={index} source={part.value} />
            if (part.kind === 'display') {
              return <MathSpan key={index} source={part.value} displayMode />
            }
            return <span key={index}>{renderBold(part.value)}</span>
          })}
        </Fragment>
      )
    })
}

export function MathText({ text, className }: { text: string; className?: string }) {
  return <span className={cn('math-text', className)}>{renderInline(text)}</span>
}

type RichBlock =
  | { kind: 'gap' }
  | { kind: 'heading'; level: number; value: string }
  | { kind: 'bullet'; value: string }
  | { kind: 'ordered'; index: number; value: string }
  | { kind: 'quote'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'paragraph'; value: string }

function buildRichBlocks(text: string): RichBlock[] {
  const blocks: RichBlock[] = []
  let orderedIndex = 0
  let codeBuffer: string[] | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (codeBuffer) {
      if (line.startsWith('```')) {
        blocks.push({ kind: 'code', value: codeBuffer.join('\n') })
        codeBuffer = null
      } else {
        codeBuffer.push(raw)
      }
      continue
    }
    if (line.startsWith('```')) {
      orderedIndex = 0
      codeBuffer = []
      continue
    }
    if (!line) {
      orderedIndex = 0
      blocks.push({ kind: 'gap' })
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      orderedIndex = 0
      blocks.push({ kind: 'heading', level: heading[1].length, value: heading[2] })
      continue
    }
    if (/^[•\-]\s+/.test(line)) {
      orderedIndex = 0
      blocks.push({ kind: 'bullet', value: line.replace(/^[•\-]\s+/, '') })
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      orderedIndex += 1
      blocks.push({
        kind: 'ordered',
        index: orderedIndex,
        value: line.replace(/^\d+\.\s+/, ''),
      })
      continue
    }
    if (/^>\s?/.test(line)) {
      orderedIndex = 0
      blocks.push({ kind: 'quote', value: line.replace(/^>\s?/, '') })
      continue
    }
    orderedIndex = 0
    blocks.push({ kind: 'paragraph', value: line })
  }
  if (codeBuffer && codeBuffer.length > 0) {
    blocks.push({ kind: 'code', value: codeBuffer.join('\n') })
  }
  return blocks
}

export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('rich-text', className)}>
      {buildRichBlocks(text).map((block, index) => {
        if (block.kind === 'gap') return <div key={index} className="rich-gap" />
        if (block.kind === 'heading') {
          return (
            <div key={index} className={`rich-heading is-h${block.level}`}>
              {renderInline(block.value)}
            </div>
          )
        }
        if (block.kind === 'bullet') {
          return (
            <div key={index} className="rich-line rich-bullet">
              <span className="rich-marker" />
              <span>{renderInline(block.value)}</span>
            </div>
          )
        }
        if (block.kind === 'ordered') {
          return (
            <div key={index} className="rich-line rich-ordered">
              <span className="rich-index">{block.index}</span>
              <span>{renderInline(block.value)}</span>
            </div>
          )
        }
        if (block.kind === 'quote') {
          return (
            <div key={index} className="rich-quote">
              {renderInline(block.value)}
            </div>
          )
        }
        if (block.kind === 'code') {
          return (
            <pre key={index} className="rich-code">
              <code>{block.value}</code>
            </pre>
          )
        }
        return (
          <p key={index} className="rich-paragraph">
            {renderInline(block.value)}
          </p>
        )
      })}
    </div>
  )
}

export function Seal({ children = '已沉淀', className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cn('seal', className)}>
      <span>{children}</span>
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <Sparkles size={20} />}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

export interface ToastState {
  id: number
  message: string
  tone: 'success' | 'info' | 'danger'
  /** 可选动作按钮（如「撤销」），显示在消息与关闭钮之间；点击后自动关闭 toast */
  actionLabel?: string
  onAction?: () => void
}

export function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  if (!toast) return null
  const Icon = toast.tone === 'success' ? Check : toast.tone === 'danger' ? AlertTriangle : Info
  return createPortal(
    <div className={cn('toast', `toast-${toast.tone}`)} role="status" aria-live="polite">
      <span className="toast-icon">
        <Icon size={16} />
      </span>
      <span className="toast-message">{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <button
          className="toast-action"
          onClick={() => {
            toast.onAction?.()
            onClose()
          }}
        >
          {toast.actionLabel}
        </button>
      )}
      <button className="toast-close" onClick={onClose} aria-label="关闭提示">
        <X size={14} />
      </button>
    </div>,
    document.body,
  )
}

function useOverlay(onClose: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return
    pushOverlay(onClose)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      popOverlay(onClose)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, open])
}

/**
 * 焦点圈定 + 归还：
 * 1) 打开时记住触发元素，关闭后把焦点还回去；
 * 2) Tab / Shift+Tab 在面板内循环，不跑到背景页面。
 */
function useFocusTrap(open: boolean, panelRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const focusables = () => {
      const root = panelRef.current
      if (!root) return [] as HTMLElement[]
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === root)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (!active || !panelRef.current?.contains(active)) {
        event.preventDefault()
        first.focus()
        return
      }
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus?.({ preventScroll: true })
    }
  }, [open, panelRef])
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  eyebrow?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
  layerClassName?: string
}

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  size = 'md',
  className,
  layerClassName,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [dragY, setDragY] = useState(0)
  const [dragProgress, setDragProgress] = useState(0)
  const dragRef = useRef({
    startY: 0,
    lastY: 0,
    lastAt: 0,
    velocity: 0,
    height: 0,
    active: false,
  })
  const morphRef = useRef<{ el: HTMLElement; rect: DOMRect; kind: MorphKind } | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const closingRef = useRef(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const requestClose = () => {
    if (closingRef.current) return
    const panel = panelRef.current
    const surface = surfaceRef.current
    const origin = morphRef.current
    // 形变尚未结束就关闭时不做反向动画：此时量到的是形变中的矩形，会算错落点。
    if (!panel || !surface || !origin || !morphAllowed() || panel.classList.contains('is-morphing')) {
      closeRef.current()
      return
    }
    closingRef.current = true
    // 起点元素可能已被列表重渲染移除，位置以最新矩形为准。
    const rect = origin.el.isConnected ? origin.el.getBoundingClientRect() : origin.rect
    morphOut(panel, rect, origin.kind, () => closeRef.current())
  }

  // 02 / 03：空形变面从触发元素的位置与尺寸展开到面板矩形，面板本体不参与逐帧重排。
  useLayoutEffect(() => {
    if (!open) {
      closingRef.current = false
      morphRef.current = null
      return
    }
    if (morphRef.current || !morphAllowed()) return
    const panel = panelRef.current
    const surface = surfaceRef.current
    if (!panel || !surface) return
    const origin = takeMorphOrigin()
    if (!origin) return
    const rect = origin.el.getBoundingClientRect()
    if (rect.width < 6 || rect.height < 6) return
    morphRef.current = { el: origin.el, rect, kind: origin.kind }
    morphIn(panel, surface, rect, origin.kind, () => {})
  }, [open])

  useOverlay(requestClose, open)
  useFocusTrap(open, panelRef)

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(max-width: 640px)').matches) return
    dragRef.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastAt: performance.now(),
      velocity: 0,
      height: panelRef.current?.getBoundingClientRect().height ?? 0,
      active: true,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    panelRef.current?.classList.add('is-dragging')
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag.active) return
    const raw = event.clientY - drag.startY
    const now = performance.now()
    drag.velocity = (event.clientY - drag.lastY) / Math.max(1, now - drag.lastAt)
    drag.lastY = event.clientY
    drag.lastAt = now
    // 向下是允许区间，跟手 1:1；向上越界按 0.35 衰减做橡皮筋（不硬顶）。
    const next = raw >= 0 ? raw : raw * 0.35
    setDragY(next)
    setDragProgress(Math.min(1, Math.max(0, next / Math.max(1, drag.height))))
  }

  const endDrag = () => {
    const drag = dragRef.current
    if (!drag.active) return
    drag.active = false
    panelRef.current?.classList.remove('is-dragging')
    // 位置 + 速度投影（160ms）后再找最近锚点：回弹 0 / 关闭。
    const projected = dragY + drag.velocity * 160
    const closeAnchor = Math.max(96, drag.height * 0.32)
    if (projected > closeAnchor) {
      setDragY(Math.max(drag.height, dragY))
      setDragProgress(1)
      window.setTimeout(() => closeRef.current(), 260)
      return
    }
    setDragY(0)
    setDragProgress(0)
  }

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      panelRef.current?.focus()
    }, 20)
    return () => window.clearTimeout(timer)
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className={cn('modal-layer', layerClassName)}
      style={{ '--sheet-progress': dragProgress } as CSSProperties}
    >
      <div className="modal-backdrop" onMouseDown={requestClose} />
      <div className="morph-surface" ref={surfaceRef} aria-hidden="true">
        <div className="morph-surface-head" />
      </div>
      <div
        ref={panelRef}
        className={cn('modal-panel', `modal-${size}`, className)}
        style={dragY !== 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : '对话框'}
        tabIndex={-1}
      >
        <div
          className="modal-grab"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-hidden="true"
        />
        {(title || eyebrow) && (
          <header className="modal-head">
            <div className="modal-heading">
              {eyebrow && <div className="eyebrow">{eyebrow}</div>}
              {title && <h2>{title}</h2>}
            </div>
            <button className="icon-button modal-close" onClick={requestClose} aria-label="关闭">
              <X size={18} />
            </button>
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({
  open,
  onClose,
  children,
  ariaLabel,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  ariaLabel: string
}) {
  useOverlay(onClose, open)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, panelRef)
  if (!open) return null
  return createPortal(
    <div className="drawer-layer">
      <div className="drawer-backdrop" onMouseDown={onClose} />
      <aside
        ref={panelRef}
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        {children}
      </aside>
    </div>,
    document.body,
  )
}

const FEEDBACK_REASONS: ReadonlyArray<readonly [FeedbackReason, string]> = [
  ['too-vague', '太笼统'],
  ['mismatch', '和课本不一致'],
  ['skipped-steps', '跳步骤'],
  ['unreadable', '图片/题面看不清'],
  ['other', '其他'],
]

export function FeedbackButtons({
  value,
  onChange,
  reason,
  onReasonChange,
}: {
  value?: 'helpful' | 'unhelpful' | null
  onChange: (next: 'helpful' | 'unhelpful') => void
  reason?: FeedbackReason | null
  onReasonChange?: (next: FeedbackReason | null) => void
}) {
  return (
    <div className={cn('feedback-block', value === 'unhelpful' && 'is-negative')}>
      <div className="feedback-buttons">
        <span className="feedback-label">这条回答有帮助吗？</span>
        <button
          type="button"
          className={cn('feedback-button', value === 'helpful' && 'is-active')}
          onClick={() => onChange('helpful')}
          aria-pressed={value === 'helpful'}
        >
          <ThumbsUp size={14} />
          有帮助
        </button>
        <button
          type="button"
          className={cn('feedback-button', value === 'unhelpful' && 'is-active is-negative')}
          onClick={() => onChange('unhelpful')}
          aria-pressed={value === 'unhelpful'}
        >
          <ThumbsDown size={14} />
          还不够
        </button>
      </div>
      {value === 'unhelpful' && onReasonChange && (
        <div className="feedback-reasons" role="group" aria-label="不够清楚的原因">
          <span>哪里不够清楚？</span>
          {FEEDBACK_REASONS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn('feedback-reason-chip', reason === key && 'is-active')}
              onClick={() => onReasonChange(reason === key ? null : key)}
              aria-pressed={reason === key}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function AiMark({ size = 20 }: { size?: number }) {
  return (
    <span className="ai-mark" aria-hidden="true">
      <Sparkles size={size} />
    </span>
  )
}
