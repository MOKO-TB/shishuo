import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Sparkles, X } from 'lucide-react'
import { AvatarMeshRig, type AvatarMood } from '../lib/avatarRig'
import { cn } from '../lib/utils'

export type { AvatarMood }

const MOOD_META: Record<
  AvatarMood,
  { src: string; label: string; alt: string }
> = {
  idle: {
    src: '/avatar/idle.webp',
    label: '待命中',
    alt: '师说书灵待机立绘',
  },
  thinking: {
    src: '/avatar/thinking.webp',
    label: '梳理思路中',
    alt: '师说书灵思考立绘',
  },
  answering: {
    src: '/avatar/answering.webp',
    label: '讲解中',
    alt: '师说书灵讲解立绘',
  },
  happy: {
    src: '/avatar/happy.webp',
    label: '真棒',
    alt: '师说书灵开心立绘',
  },
  notice: {
    src: '/avatar/notice.webp',
    label: '小提醒',
    alt: '师说书灵提醒立绘',
  },
  run: {
    src: '/avatar/side-body.webp',
    label: '奔跑中',
    alt: '师说书灵奔跑立绘',
  },
  walk: {
    src: '/avatar/side-body.webp',
    label: '漫步中',
    alt: '师说书灵漫步立绘',
  },
  wave: {
    src: '/avatar/notice.webp',
    label: '打招呼',
    alt: '师说书灵挥手立绘',
  },
  point: {
    src: '/avatar/answering.webp',
    label: '聚焦重点',
    alt: '师说书灵指路立绘',
  },
  celebrate: {
    src: '/avatar/happy.webp',
    label: '庆祝中',
    alt: '师说书灵庆功立绘',
  },
}

const INTERACT_TIPS = [
  '先定卡点再看公式，效率会高很多哦。',
  '没把握的题随时点「问导师」或转给任课老师！',
  '把易错步骤记在心上，换个数字也能做出来。',
  '今天也要一步一步把知识啃透呀。',
]

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/** 小图标头像（侧栏 / 导师横条 / 气泡标记），使用裁剪后的头部立绘。 */
export function DigitalAvatarBadge({
  mood = 'idle',
  size = 32,
  className,
}: {
  mood?: AvatarMood
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn('da-badge', `is-${mood}`, className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img
        src="/avatar/badge.webp"
        alt=""
        width={size}
        height={size}
        loading="eager"
        decoding="async"
      />
      <span className="da-badge-dot" />
    </span>
  )
}

/** 2D 骨骼网格 + 眨眼/张嘴帧动画虚拟人画布：支持视线跟随、尾巴/耳朵/发丝/肢体独立运动。 */
export function DigitalAvatarSprite({
  mood = 'idle',
  variant = 'stage',
  interactive = true,
  onInteract,
  className,
}: {
  mood?: AvatarMood
  variant?: 'stage' | 'thinking' | 'widget'
  interactive?: boolean
  onInteract?: () => void
  className?: string
}) {
  const [burstHappy, setBurstHappy] = useState(false)
  const [rigFailed, setRigFailed] = useState(() => prefersReducedMotion())
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<number | null>(null)
  const moodRef = useRef<AvatarMood>('idle')
  const pointerRef = useRef({ x: 0, y: 0 })

  const effectiveMood: AvatarMood = burstHappy && mood === 'idle' ? 'happy' : mood
  moodRef.current = effectiveMood
  const meta = MOOD_META[effectiveMood]

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (rigFailed) return
    const canvas = canvasRef.current
    const root = rootRef.current
    if (!canvas || !root) return

    let rig: AvatarMeshRig
    try {
      rig = new AvatarMeshRig(canvas)
      rig.preloadAll()
    } catch {
      setRigFailed(true)
      return
    }

    const syncSize = () => {
      const rect = root.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
      const w = Math.max(64, Math.round(rect.width * dpr))
      const h = Math.max(64, Math.round(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }
    syncSize()

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => syncSize())
        : null
    observer?.observe(root)

    // 桌面端轻量视线跟随：以立绘中心为基准归一化指针方向
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const rect = root.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const cx = rect.left + rect.width * 0.5
      const cy = rect.top + rect.height * 0.42
      const dx = (event.clientX - cx) / 260
      const dy = (event.clientY - cy) / 260
      pointerRef.current.x = Math.max(-1, Math.min(1, dx))
      pointerRef.current.y = Math.max(-1, Math.min(1, dy))
    }
    const resetPointer = () => {
      pointerRef.current.x = 0
      pointerRef.current.y = 0
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('blur', resetPointer)

    let rafId = 0
    let lastMs = performance.now()
    const startMs = lastMs

    const frame = (nowMs: number) => {
      if (!document.hidden) {
        const dt = Math.min(0.05, Math.max(0.004, (nowMs - lastMs) / 1000))
        lastMs = nowMs
        rig.render((nowMs - startMs) / 1000, dt, {
          mood: moodRef.current,
          pointerX: pointerRef.current.x,
          pointerY: pointerRef.current.y,
        })
      } else {
        lastMs = nowMs
      }
      rafId = window.requestAnimationFrame(frame)
    }
    rafId = window.requestAnimationFrame(frame)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', resetPointer)
      observer?.disconnect()
      rig.dispose()
    }
  }, [rigFailed])

  const triggerClick = () => {
    if (!interactive) return
    if (mood === 'idle') {
      setBurstHappy(true)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setBurstHappy(false), 1600)
    }
    onInteract?.()
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'da-sprite',
        `is-${variant}`,
        `is-mood-${effectiveMood}`,
        interactive && 'is-interactive',
        className,
      )}
      onClick={interactive ? triggerClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${meta.alt}，点击互动` : meta.alt}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                triggerClick()
              }
            }
          : undefined
      }
    >
      <span className="da-aura" aria-hidden="true" />
      {rigFailed ? (
        <img
          key={effectiveMood}
          className="da-img"
          src={meta.src}
          alt={meta.alt}
          loading="eager"
          decoding="async"
          draggable={false}
        />
      ) : (
        <canvas ref={canvasRef} className="da-canvas" aria-hidden="true" />
      )}
      {effectiveMood === 'answering' && (
        <span className="da-sparkle" aria-hidden="true">
          <Sparkles size={13} />
        </span>
      )}
    </div>
  )
}

/** 导师抽屉顶部的伴学小舞台：展示书灵当前姿态、课程提示与点击打气气泡。 */
export function MentorAvatarStage({
  mood,
  mentorName,
  courseTitle,
  statusText,
}: {
  mood: AvatarMood
  mentorName: string
  courseTitle: string
  statusText?: string
}) {
  const [tipIndex, setTipIndex] = useState<number | null>(null)
  const tipTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (tipTimer.current) window.clearTimeout(tipTimer.current)
    },
    [],
  )

  const handleInteract = () => {
    setTipIndex((prev) => (prev === null ? 0 : (prev + 1) % INTERACT_TIPS.length))
    if (tipTimer.current) window.clearTimeout(tipTimer.current)
    tipTimer.current = window.setTimeout(() => setTipIndex(null), 3200)
  }

  const meta = MOOD_META[mood]
  const activeTip =
    tipIndex !== null
      ? INTERACT_TIPS[tipIndex]
      : statusText ||
        (mood === 'thinking'
          ? '正在翻书对照知识点，稍等一下…'
          : mood === 'answering'
            ? '抓住这一步的条件，往下推就顺了！'
            : mood === 'happy'
              ? '这题理顺啦！可以再做一道变式巩固一下。'
              : mood === 'notice'
                ? '这道题建议带着原题去问任课老师更稳妥。'
                : `点我可以打招呼，或直接在下方问${mentorName}。`)

  return (
    <div className={cn('da-stage-bar', `is-${mood}`)}>
      <DigitalAvatarSprite
        mood={mood}
        variant="stage"
        onInteract={handleInteract}
      />
      <div className="da-stage-copy">
        <div className="da-stage-head">
          <span className="da-stage-name">书灵助教 · {courseTitle}</span>
          <span className="da-stage-pill">{meta.label}</span>
        </div>
        <p className="da-stage-line">{activeTip}</p>
      </div>
    </div>
  )
}

const COLLAPSE_KEY = 'shishuo.avatar.collapsed.v1'

function loadCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/** 桌面端右下角轻量伴学挂件：可一键收起成胶囊，点击唤起 AI 导师抽屉。 */
export function StudentAvatarWidget({
  mood = 'idle',
  mentorName,
  hint,
  hidden = false,
  onOpenMentor,
}: {
  mood?: AvatarMood
  mentorName: string
  hint?: string
  hidden?: boolean
  onOpenMentor: () => void
}) {
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [bubbleDismissed, setBubbleDismissed] = useState(false)

  const setCollapsedPref = (next: boolean) => {
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      // Ignore storage failures.
    }
  }

  if (hidden) return null

  if (collapsed) {
    return (
      <button
        type="button"
        className="da-widget-pill"
        onClick={() => setCollapsedPref(false)}
        aria-label="展开书灵伴学立绘"
        title="展开书灵助教"
      >
        <DigitalAvatarBadge mood={mood} size={26} />
        <span>书灵助教</span>
      </button>
    )
  }

  return (
    <aside className="da-widget" aria-label="书灵伴学助手">
      {!bubbleDismissed && (
        <div className="da-widget-bubble">
          <button
            type="button"
            className="da-widget-bubble-body"
            onClick={onOpenMentor}
          >
            <strong>{mentorName} · 在线伴学</strong>
            <span>{hint || '卡在某一步？点我打开 AI 导师'}</span>
          </button>
          <button
            type="button"
            className="da-widget-bubble-close"
            onClick={() => setBubbleDismissed(true)}
            aria-label="关闭气泡提示"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="da-widget-dock">
        <button
          type="button"
          className="da-widget-collapse"
          onClick={() => setCollapsedPref(true)}
          aria-label="收起书灵助教"
          title="收起为小胶囊"
        >
          <ChevronDown size={13} />
        </button>
        <DigitalAvatarSprite
          mood={mood}
          variant="widget"
          onInteract={onOpenMentor}
        />
      </div>
    </aside>
  )
}
