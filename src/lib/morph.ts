/**
 * 02 FLUID MORPH / 03 SHARED ELEMENT 的共用实现。
 *
 * 关键性能取舍：**不直接给弹窗面板做 width/height 动画**。
 * 面板里有大段文本，逐帧改高度会让内容反复重排、滚动位置跳动，录屏里就是「卡顿」。
 * 这里改成：另起一个空的形变面（.morph-surface，无子节点）去补间盒模型，
 * 面板本体在形变期间 visibility:hidden，落位后瞬间替换再淡入内容——
 * 视觉上仍是「胶囊长成面板」，但每帧只需要重排一个空 div。
 *
 * 圆角同样不靠 scale 缩放（会把圆角拉成巨型药丸），而是在空面上直接补间 border-radius。
 */

export type MorphKind = 'capsule' | 'shared'

interface PointerOrigin {
  el: HTMLElement
  at: number
}

const TRACKER_FLAG = '__shishuoMorphTracker'
const ORIGIN_KEY = '__shishuoMorphOrigin'
const ORIGIN_TTL = 2500
const FLUID_EASE = 'linear'
const DURATION_IN = 280
const DURATION_RETURN = 200

type MorphWindow = Window & {
  [TRACKER_FLAG]?: boolean
  [ORIGIN_KEY]?: PointerOrigin | null
}

function installTracker() {
  if (typeof window === 'undefined') return
  const win = window as MorphWindow
  if (win[TRACKER_FLAG]) return
  win[TRACKER_FLAG] = true
  // 捕获阶段先于 React 的合成事件，保证记到的是「真正被点的元素」。
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target as Element | null
      const el =
        target?.closest<HTMLElement>('[data-morph]') ??
        target?.closest<HTMLElement>('button, [role="button"], a')
      win[ORIGIN_KEY] = el ? { el, at: performance.now() } : null
    },
    true,
  )
  // 键盘触发（Enter / Space）不播形变：没有可用的起点矩形。
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') win[ORIGIN_KEY] = null
    },
    true,
  )
}

/** 取本次打开弹窗的形变起点；过期、已卸载或非指针触发时返回 null。 */
export function takeMorphOrigin(): { el: HTMLElement; kind: MorphKind } | null {
  installTracker()
  const win = window as MorphWindow
  const origin = win[ORIGIN_KEY]
  if (!origin) return null
  win[ORIGIN_KEY] = null
  if (!origin.el.isConnected) return null
  if (performance.now() - origin.at > ORIGIN_TTL) return null
  const kind: MorphKind = origin.el.dataset.morph === 'shared' ? 'shared' : 'capsule'
  return { el: origin.el, kind }
}

// 必须在第一次点击之前就挂上监听；本模块随 ui.tsx 在应用启动时加载。
installTracker()

/** 只有桌面端做形变；≤640px 交给 05 的底部抽屉。 */
export function morphAllowed() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return window.matchMedia('(min-width: 641px)').matches
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

function toBox(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

interface Metrics {
  target: Box
  radiusEnd: number
  radiusStart: number
}

function measure(panel: HTMLElement, origin: DOMRect): Metrics | null {
  const rect = panel.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return null
  const style = window.getComputedStyle(panel)
  return {
    target: toBox(rect),
    radiusEnd: Number.parseFloat(style.borderTopLeftRadius) || 24,
    // 胶囊态的数学定义：圆角 = 高度的一半（描述词读数 60 / 2 = 30）。
    radiusStart: Math.min(origin.width, origin.height) / 2,
  }
}

function backdropOf(panel: HTMLElement) {
  return panel.closest('.modal-layer')?.querySelector<HTMLElement>('.modal-backdrop') ?? null
}

/**
 * 弹窗直接带内容平滑入场（仅合成层 transform + opacity，彻底移除空白 .morph-surface 占位框，
 * 避免先出现空白框再卡顿出内容）。
 */
export function morphIn(
  panel: HTMLElement,
  surface: HTMLElement,
  origin: DOMRect,
  _kind: MorphKind,
  onDone: () => void,
) {
  surface.style.display = 'none'
  panel.classList.remove('is-morphing', 'is-content-in')
  const metrics = measure(panel, origin)
  if (!metrics || typeof panel.animate !== 'function') {
    onDone()
    return
  }
  const target = metrics.target
  const originCx = origin.left + origin.width / 2
  const originCy = origin.top + origin.height / 2
  const targetCx = target.left + target.width / 2
  const targetCy = target.top + target.height / 2
  const ox = Math.max(-72, Math.min(72, (originCx - targetCx) * 0.28))
  const oy = Math.max(-52, Math.min(52, (originCy - targetCy) * 0.28))

  // 关闭 CSS 自带 modalIn，避免与 WAAPI 双重叠加导致加速过快
  panel.style.animation = 'none'
  const backdrop = backdropOf(panel)
  if (backdrop) backdrop.style.animation = 'none'
  backdrop?.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0.45, offset: 0.4 },
      { opacity: 0.82, offset: 0.75 },
      { opacity: 1, offset: 1 },
    ],
    {
      duration: DURATION_IN,
      easing: 'linear',
    },
  )
  const anim = panel.animate(
    [
      {
        offset: 0,
        opacity: 0,
        transform: `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0) scale(0.92)`,
      },
      {
        offset: 0.28,
        opacity: 0.38,
        transform: `translate3d(${(ox * 0.68).toFixed(1)}px, ${(oy * 0.68).toFixed(1)}px, 0) scale(0.946)`,
      },
      {
        offset: 0.56,
        opacity: 0.74,
        transform: `translate3d(${(ox * 0.38).toFixed(1)}px, ${(oy * 0.38).toFixed(1)}px, 0) scale(0.972)`,
      },
      {
        offset: 0.82,
        opacity: 0.94,
        transform: `translate3d(${(ox * 0.14).toFixed(1)}px, ${(oy * 0.14).toFixed(1)}px, 0) scale(0.991)`,
      },
      {
        offset: 1,
        opacity: 1,
        transform: 'translate3d(0, 0, 0) scale(1)',
      },
    ],
    { duration: DURATION_IN, easing: FLUID_EASE },
  )
  anim.onfinish = () => {
    onDone()
  }
}

/** 面板平滑线性缩放淡出（仅 transform + opacity）。 */
export function morphOut(
  panel: HTMLElement,
  origin: DOMRect,
  _kind: MorphKind,
  onDone: () => void,
) {
  const metrics = measure(panel, origin)
  if (!metrics || typeof panel.animate !== 'function') {
    onDone()
    return
  }
  const target = metrics.target
  const originCx = origin.left + origin.width / 2
  const originCy = origin.top + origin.height / 2
  const targetCx = target.left + target.width / 2
  const targetCy = target.top + target.height / 2
  const ox = Math.max(-56, Math.min(56, (originCx - targetCx) * 0.22))
  const oy = Math.max(-40, Math.min(40, (originCy - targetCy) * 0.22))
  panel.classList.add('is-returning')
  panel.closest('.modal-layer')?.classList.add('is-returning')

  const backdrop = backdropOf(panel)
  backdrop?.animate(
    [
      { opacity: 1, offset: 0 },
      { opacity: 0.5, offset: 0.5 },
      { opacity: 0, offset: 1 },
    ],
    {
      duration: DURATION_RETURN,
      easing: 'linear',
      fill: 'forwards',
    },
  )

  const anim = panel.animate(
    [
      { offset: 0, transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      {
        offset: 0.5,
        transform: `translate3d(${(ox * 0.48).toFixed(1)}px, ${(oy * 0.48).toFixed(1)}px, 0) scale(0.97)`,
        opacity: 0.52,
      },
      {
        offset: 1,
        transform: `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0) scale(0.94)`,
        opacity: 0,
      },
    ],
    { duration: DURATION_RETURN, easing: 'linear', fill: 'forwards' },
  )
  anim.onfinish = () => onDone()
}
