import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Soup,
  ChefHat,
  CupSoda,
  Flame,
  Footprints,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { Badge } from '../components/ui'
import { FANDIAN_PREFS } from '../data/fandianData'
import {
  FD_MEALS,
  fdBlindBox,
  fdGlobalStats,
  fdPoolStats,
  fdRankings,
  fdRecommend,
  type BlindBox,
  type DishView,
  type FdKind,
  type FdMeal,
  type FdPrefsInput,
  type Rankings,
} from '../lib/fandianEngine'
import { reportFdAudit } from '../lib/fandianAudit'

interface FandianViewProps {
  notify?: (
    message: string,
    tone?: 'success' | 'info' | 'danger',
    action?: { label: string; onAction: () => void },
  ) => void
}

type MainTab = 'eat' | 'rank' | 'blind'
type RankKey = keyof Rankings

/** 两大类别：正餐食堂 / 饮品甜点（各自都有「推荐」与「榜单」） */
const KIND_TABS: { key: FdKind; label: string; hint: string }[] = [
  { key: 'food', label: '正餐食堂', hint: '饭菜主食 · 食堂与商业街' },
  { key: 'sweet', label: '饮品甜点', hint: '奶茶果切 · 糖水甜品' },
]

const RANK_TABS: { key: RankKey; label: string; hint: string }[] = [
  { key: 'hot', label: '热销榜', hint: '最多人选' },
  { key: 'top', label: '好评榜', hint: '评分最高 · 同分看销量' },
  { key: 'value', label: '性价比', hint: '主食管饱 · 每元热量最高' },
]

/** 点餐预算档位（与饭点原版一致：¥10 / ¥15 / ¥20 / ¥25） */
const BUDGET_OPTIONS = [10, 15, 20, 25]

/** 喜欢的口味（按菜品库真实命中规模排序；引擎里有风味词→类别映射，全部真实生效） */
const TASTE_OPTIONS = ['川', '家常', '小吃炸物', '面食', '粤', '清淡']

/** 位置：数据集 6 个区域合并为 4 个选项；c1=商业街一期、c4=商业街二期 */
const LOCATION_OPTIONS: { id: string; label: string }[] = [
  { id: 'c2', label: '桃园食堂' },
  { id: 'c3', label: '桃蹊食堂' },
  { id: 'c1', label: '商业街一期' },
  { id: 'c4', label: '商业街二期' },
]

const PREFS_LS_KEY = 'shishuo-fandian-prefs'
/** 「吃过」历史（真实点单记录，驱动推荐越用越准） */
const HISTORY_LS_KEY = 'shishuo-fandian-history'
/** 口味偏好首次引导（关闭后不再出现） */
const HINT_LS_KEY = 'shishuo-fandian-hint-dismissed'

const mealLabel = (m: FdMeal) => FD_MEALS.find((x) => x.key === m)?.label || m

function defaultPrefs(): FdPrefsInput {
  return {
    maxSpicy: 3, // 辣度上限 UI 已移除：3 = 不限制
    budget: FANDIAN_PREFS.budget,
    taste: [...FANDIAN_PREFS.taste],
    avoid: [],
    meals: [],
    locations: [],
  }
}

/** 预算必须是档位值（旧版本存过滑杆任意值，这里吸附到最近的档位） */
function snapBudget(value: number): number {
  let best = BUDGET_OPTIONS[0]
  for (const b of BUDGET_OPTIONS) {
    if (Math.abs(b - value) < Math.abs(best - value)) best = b
  }
  return best
}

function loadPrefs(): FdPrefsInput {
  try {
    const raw = localStorage.getItem(PREFS_LS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as FdPrefsInput
      if (
        typeof p.maxSpicy === 'number' &&
        typeof p.budget === 'number' &&
        Array.isArray(p.taste) &&
        Array.isArray(p.avoid)
      ) {
        return {
          ...p,
          budget: snapBudget(p.budget),
          maxSpicy: 3, // 忽略旧存储的辣度设置（UI 已移除，不限制）
          avoid: [],
          meals: Array.isArray(p.meals) ? p.meals : [],
          locations: Array.isArray(p.locations)
            ? p.locations.filter((id): id is string => typeof id === 'string' && LOCATION_OPTIONS.some((x) => x.id === id))
            : [],
        }
      }
    }
  } catch {
    // 本地存储不可用时回退默认
  }
  return defaultPrefs()
}

/** 真实「吃过」历史：dishId → 次数。损坏/缺失回退空记录 */
function loadHistory(): Record<string, number> {
  try {
    const raw = localStorage.getItem(HISTORY_LS_KEY)
    if (raw) {
      const h = JSON.parse(raw) as Record<string, number>
      if (h && typeof h === 'object') {
        const out: Record<string, number> = {}
        for (const [k, v] of Object.entries(h)) {
          if (typeof v === 'number' && v > 0 && Number.isFinite(v)) out[k] = Math.floor(v)
        }
        return out
      }
    }
  } catch {
    // 忽略损坏数据
  }
  return {}
}

function thumbTone(dish: DishView): string {
  if (dish.meat === '素') return 'veg'
  if (dish.spicy >= 2) return 'spicy'
  if (dish.tags.indexOf('面食') >= 0) return 'noodle'
  return 'main'
}

/** 菜品缩略图：有图铺满，无图/加载失败回退到彩色碗形占位（来自饭点 food-art.js 规则）。 */
function DishArt({
  dish,
  className = 'fd-thumb',
  iconSize = 22,
}: {
  dish: DishView
  className?: string
  iconSize?: number
}) {
  const [broken, setBroken] = useState(false)
  const src = dish.art && !broken ? dish.art : ''
  return (
    <span className={`${className}${src ? ' has-photo' : ''}`}>
      {src ? (
        <img src={src} alt={dish.name} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Soup size={iconSize} />
      )}
      {dish.lowStock && dish.stockText && <em className="fd-stock">{dish.stockText}</em>}
    </span>
  )
}

/** 「吃过」小按钮：记录真实用餐次数，推荐会越用越准；阻止冒泡避免触发卡片/行点击 */
function EatBtn({ dish, count, onEaten }: { dish: DishView; count: number; onEaten: (dish: DishView) => void }) {
  return (
    <button
      type="button"
      className={`fd-eat-btn${count ? ' has-count' : ''}`}
      title="记一次吃过，推荐会更合你口味"
      onClick={(e) => { e.stopPropagation(); onEaten(dish) }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <UtensilsCrossed size={11} />
      吃过
      {count > 0 && <em>{count}</em>}
    </button>
  )
}

function RankList({ list, rankKey, emptyText, onPick, eatenCounts, onEaten }: { list: DishView[]; rankKey: RankKey; emptyText: string; onPick?: (d: DishView) => void; eatenCounts: Record<string, number>; onEaten: (d: DishView) => void }) {
  if (!list.length) return <div className="fd-empty">{emptyText}</div>
  return (
    <ol className="fd-rank-list">
      {list.map((dish, index) => (
        <li
          key={dish.id}
          className="fd-rank-item is-clickable"
          onClick={() => onPick?.(dish)}
          onKeyDown={(e) => { if (e.key === 'Enter') onPick?.(dish) }}
          role="button"
          tabIndex={0}
        >
          <span className={`fd-rank-no${index < 3 ? ' is-top' : ''}`}>{index + 1}</span>
          <DishArt dish={dish} className="fd-rank-art" iconSize={18} />
          <span className="fd-rank-body">
            <b>
              {dish.name}
              {dish.single && <em className="fd-rank-tag is-single">单点不送</em>}
              {dish.options && <em className="fd-rank-tag is-opt">可自选</em>}
            </b>
            <small>
              {dish.canteenName} · {dish.stallName} ·{' '}
              {rankKey === 'value' && `${dish.kcalText} · 每元 ${dish.kcalPerYuan} kcal · `}
              {rankKey !== 'value' && `热销 ${dish.soldToday} 份 · `}
              ★ {dish.rating}
            </small>
          </span>
          <span className="fd-rank-price">
            <b>¥{dish.price}</b>
            <EatBtn dish={dish} count={eatenCounts[dish.id] || 0} onEaten={onEaten} />
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * 菜品明细弹层：组合菜（一荤一素/一荤二素/麻辣烫选菜等）的荤素/加料分组可真实勾选
 * （必选组默认选第一项、多选组受 maxSelect 限制），底部实时算价，可一键记「吃过」。
 */
function DishDetail({ dish, eatenCount, onEaten, onClose }: { dish: DishView; eatenCount: number; onEaten: (dish: DishView, info?: { combo?: string; total: number }) => void; onClose: () => void }) {
  const opts = dish.options || []
  // 每组已选项下标；必选组默认选中第一个，避免总价漏算
  const [sel, setSel] = useState<number[][]>(() => opts.map((g) => (g.required && g.values.length ? [0] : [])))

  const toggle = (gi: number, vi: number) => {
    const g = opts[gi]
    if (!g) return
    setSel((prev) => {
      const next = prev.map((a) => [...a])
      const cur = next[gi] || []
      const at = cur.indexOf(vi)
      if (at >= 0) {
        // 必选组至少保留一项
        if (g.required && cur.length <= 1) return prev
        cur.splice(at, 1)
        return next
      }
      if (g.multiSelect) {
        if (cur.length >= g.maxSelect) return prev
        cur.push(vi)
      } else {
        next[gi] = [vi]
      }
      return next
    })
  }

  // 金额一律取整到分
  const total = Math.round(
    (dish.price + opts.reduce((n, g, gi) => n + (sel[gi] || []).reduce((m, vi) => m + (g.values[vi]?.price || 0), 0), 0)) * 100,
  ) / 100
  const comboText = opts
    .map((g, gi) => ((sel[gi] || []).length ? g.name + '：' + (sel[gi] || []).map((vi) => g.values[vi]?.name).filter(Boolean).join('、') : ''))
    .filter(Boolean)
    .join(' / ')

  return (
    <div className="fd-blind-mask" onClick={onClose}>
      <div className="fd-detail-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="fd-blind-close" onClick={onClose} aria-label="关闭">
          <X size={14} />
        </button>
        <div className="fd-detail-head">
          <DishArt dish={dish} className="fd-detail-photo" iconSize={30} />
          <div className="fd-detail-info">
            <h3>{dish.name}</h3>
            <small>{dish.canteenName} · {dish.stallName}</small>
            <span className="fd-detail-price">
              ¥{dish.price} · {dish.kcal} kcal · ★ {dish.rating}
              {eatenCount > 0 && <em className="fd-eat-badge">吃过 {eatenCount} 次</em>}
            </span>
          </div>
        </div>
        {opts.length ? (
          <div className="fd-detail-groups">
            {opts.map((g, gi) => (
              <div key={g.name} className="fd-opt-group">
                <header>
                  <b>{g.name}</b>
                  <small>
                    {g.required ? '必选' : '可选'} · {g.multiSelect ? `最多 ${g.maxSelect} 个` : '单选'}
                    {(sel[gi] || []).length ? ` · 已选 ${sel[gi].length}` : ''}
                  </small>
                </header>
                <div className="fd-opt-chips">
                  {g.values.map((v, vi) => {
                    const on = (sel[gi] || []).indexOf(vi) >= 0
                    return (
                      <button
                        key={v.name}
                        type="button"
                        className={`fd-opt-chip${on ? ' is-on' : ''}`}
                        onClick={() => toggle(gi, vi)}
                      >
                        {v.name}
                        {v.price > 0 ? <i>+¥{v.price}</i> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="fd-detail-plain">这道菜按门店标准做法出餐，无需自选配置</div>
        )}
        <div className="fd-detail-foot">
          <span>
            {opts.length ? '勾选荤素/加料，价格实时合计 · ' : ''}选项来自「校生活」小程序菜单快照（2026-10-22）
          </span>
          <div className="fd-detail-actions">
            <button type="button" className="fd-detail-cancel" onClick={onClose}>知道了</button>
            <button
              type="button"
              className="fd-detail-ok"
              onClick={() => { onEaten(dish, { combo: comboText || undefined, total }); onClose() }}
            >
              记一次吃过 ¥{total}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function FandianView({ notify }: FandianViewProps) {
  const [kind, setKind] = useState<FdKind>('food')
  const [tab, setTab] = useState<MainTab>('eat')
  const [rankKey, setRankKey] = useState<RankKey>('hot')
  const [recOffset, setRecOffset] = useState(0)
  const [blind, setBlind] = useState<BlindBox | null>(null)
  const [detail, setDetail] = useState<DishView | null>(null)
  const [prefs, setPrefsState] = useState<FdPrefsInput>(loadPrefs)
  // 真实「吃过」历史（本机保存）：推荐打分与「你点过 N 次」理由都来自这里
  const [history, setHistory] = useState<Record<string, number>>(loadHistory)
  // 口味偏好首次引导（关闭过就不再出现）
  const [hintOpen, setHintOpen] = useState(() => {
    try {
      return !localStorage.getItem(HINT_LS_KEY)
    } catch {
      return true
    }
  })

  // 推荐 / 榜单是纯静态计算（口味 / 预算 / 评分 / 人气），无需定时刷新

  // 数据体检：dev 模式下输出口径 / 占位值 / 标签覆盖检查报告，生产构建不打日志
  useEffect(() => {
    if (import.meta.env.DEV) reportFdAudit()
  }, [])

  const updatePrefs = (next: FdPrefsInput) => {
    setPrefsState(next)
    try {
      localStorage.setItem(PREFS_LS_KEY, JSON.stringify(next))
    } catch {
      // 忽略持久化失败，会话内仍然生效
    }
  }

  const closeHint = () => {
    setHintOpen(false)
    try {
      localStorage.setItem(HINT_LS_KEY, '1')
    } catch {
      // 本地存储不可用则本次会话内不再显示
    }
  }

  const toggleTaste = (t: string) => {
    closeHint()
    const taste = prefs.taste.indexOf(t) >= 0 ? prefs.taste.filter((x) => x !== t) : [...prefs.taste, t]
    updatePrefs({ ...prefs, taste })
  }

  const toggleMeal = (m: FdMeal) => {
    closeHint()
    const cur = prefs.meals || []
    const meals = cur.indexOf(m) >= 0 ? cur.filter((x) => x !== m) : [...cur, m]
    updatePrefs({ ...prefs, meals })
  }

  const toggleLocation = (id: string) => {
    closeHint()
    const cur = prefs.locations || []
    const locations = cur.indexOf(id) >= 0 ? cur.filter((x) => x !== id) : [...cur, id]
    updatePrefs({ ...prefs, locations })
  }

  /** 记一次「吃过」：本机累计次数，推荐打分（历史加权）与理由文案随之更新；
   *  toast 附带「撤销」按钮防误触（6 秒内可撤，撤销只回退最近一次）。 */
  const markEaten = (dish: { id: string; name: string }, info?: { combo?: string; total?: number }) => {
    setHistory((prev) => {
      const next = { ...prev, [dish.id]: (prev[dish.id] || 0) + 1 }
      try {
        localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(next))
      } catch {
        // 会话内仍然生效
      }
      return next
    })
    const combo = info?.combo
    const price = info?.total
    notify?.(
      `已记一次「${dish.name}」${combo ? `（${combo.length > 26 ? combo.slice(0, 26) + '…' : combo}）` : ''}${price !== undefined ? ` · ¥${price}` : ''}`,
      'success',
      {
        label: '撤销',
        onAction: () => {
          setHistory((prev) => {
            const cur = prev[dish.id] || 0
            const next = { ...prev }
            if (cur <= 1) delete next[dish.id]
            else next[dish.id] = cur - 1
            try {
              localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(next))
            } catch {
              // 会话内仍然生效
            }
            return next
          })
        },
      },
    )
  }

  /** 切换类别：留在当前页签；盲盒页签按新类别重新开一盒 */
  const switchKind = (k: FdKind) => {
    if (k === kind) return
    setKind(k)
    setRankKey('hot')
    if (tab === 'blind') drawBlind(k)
  }

  // 各类别规模（类别页签用；糖水铺等两类都供应的档口会同时计入两栏，加料小料不计入）
  const stats = useMemo(() => ({ food: fdPoolStats('food'), sweet: fdPoolStats('sweet') }), [])
  // 页头展示全站口径：档口去重、两类菜品合计、真实配图数，全部由数据推导（与页脚 105 家营业时段口径区分开）
  const globalStats = useMemo(() => fdGlobalStats(), [])
  const ranks = useMemo(() => fdRankings(undefined, prefs, kind), [prefs, kind])

  /** 换一批的候选牌堆：按设置取前 60 道（评分打分排序后）洗牌，每次发 4 道；
   *  一轮发完自动重洗——反复点「换一批」不再固定循环同几道 */
  const [deck, setDeck] = useState<DishView[]>([])
  const reshuffle = useCallback(() => {
    const pool = fdRecommend(60, undefined, prefs, kind, history)
    const arr = [...pool]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    setDeck(arr)
    setRecOffset(0)
  }, [prefs, kind, history])
  // 偏好 / 历史 / 类别变化时重新洗牌（「吃过」记录变化也换，保证推荐立刻反映新历史）
  useEffect(() => { reshuffle() }, [reshuffle])

  const rankTabs = kind === 'food' ? RANK_TABS : RANK_TABS.filter((t) => t.key !== 'value')

  const pickRecs = useMemo(() => {
    if (!deck.length) return []
    return Array.from({ length: Math.min(4, deck.length) }, (_, i) => deck[(recOffset + i) % deck.length])
  }, [deck, recOffset])

  /** 换一批：往后翻 4 道；一轮发完自动重洗牌 */
  const nextBatch = () => {
    if (recOffset + 4 >= deck.length) reshuffle()
    else setRecOffset((n) => n + 4)
  }

  const mealsText = prefs.meals && prefs.meals.length
    ? `餐类 ${prefs.meals.map(mealLabel).join('/')}`
    : '全时段'
  const locText = prefs.locations && prefs.locations.length
    ? `位置 ${prefs.locations.map((id) => LOCATION_OPTIONS.find((x) => x.id === id)?.label || id).join('/')}`
    : '全位置'
  const tasteText = prefs.taste.length ? `口味 ${prefs.taste.join('/')}` : '口味不限'
  const kindStats = kind === 'food' ? stats.food : stats.sweet

  /** 按当前设置开一盒；kind 可传入（切换类别时立即按新类别抽） */
  const drawBlind = (k: FdKind = kind) => {
    const box = fdBlindBox(prefs.budget, undefined, prefs, k)
    if (!box) {
      setBlind(null)
      notify?.(k === 'food' ? '按当前设置没有符合预算的菜，放宽预算或位置试试' : '按当前预算没有合适的菜，放宽预算试试', 'info')
      return
    }
    setBlind(box)
  }

  /** 打开盲盒页签：每次进入都重新开一盒 */
  const enterBlind = () => {
    setTab('blind')
    drawBlind()
  }

  const rerollBlind = () => {
    const prev = blind?.names || ''
    let next: BlindBox | null = null
    for (let i = 0; i < 10; i++) {
      const b = fdBlindBox(prefs.budget, undefined, prefs, kind)
      if (!b) break
      next = b
      if (b.names !== prev) break
    }
    if (!next) notify?.('按当前设置没有别的菜了，放宽预算或位置试试', 'info')
    else if (next.names === prev) notify?.('当前预算下可抽的菜基本就这些了，放宽预算试试', 'info')
    else setBlind(next)
  }

  return (
    <div className="fd-page">
      <section className="fd-hero">
        <div className="fd-hero-main">
          <div className="fd-hero-kicker">
            <UtensilsCrossed size={15} /> 校园食堂决策 · {kind === 'food' ? '正餐' : '饮品甜点'}
          </div>
          <h1>{tab === 'eat' ? '推荐' : tab === 'rank' ? '榜单' : '盲盒'}</h1>
          <p>
            {kind === 'food' ? (
              <>
                预算 ¥{prefs.budget} · {mealsText} · {locText} · 喜欢{prefs.taste.length ? prefs.taste.join('、') : '不限'}
                {' —— '}
                {tab === 'eat'
                  ? '推荐、盲盒与榜单都按这套设置实时生成'
                  : tab === 'rank'
                    ? '榜单按这套设置过滤'
                    : '按这套设置随机抽一款，每次都不一样'}
              </>
            ) : (
              tab === 'blind'
                ? <>奶茶果饮 · 果切 · 糖水甜品 —— 随机一款，每次开盒都不一样</>
                : tab === 'rank'
                  ? <>饮品甜点全量榜单 —— 不受口味与预算限制</>
                  : <>奶茶果饮 · 果切 · 糖水甜品 —— 按评分与人气推荐</>
            )}
          </p>
        </div>
        <div className="fd-hero-side">
          <span className="fd-live"><i />设置实时生效</span>
          <span className="fd-hero-meta">
            {globalStats.stalls} 档口 · {globalStats.dishes} 菜品 · 本类 {kindStats.dishes} 道
          </span>
        </div>
      </section>

      <nav className="fd-kindtabs" aria-label="类别切换">
        {KIND_TABS.map((k) => {
          const st = k.key === 'food' ? stats.food : stats.sweet
          return (
            <button
              key={k.key}
              type="button"
              className={kind === k.key ? 'is-active' : ''}
              onClick={() => switchKind(k.key)}
            >
              {k.key === 'food' ? <UtensilsCrossed size={17} /> : <CupSoda size={17} />}
              <span className="fd-kind-label"><b>{k.label}</b><small>{k.hint}</small></span>
              <span className="fd-kind-count">{st.dishes} 道</span>
            </button>
          )
        })}
      </nav>

      <nav className="fd-maintabs" aria-label="食堂决策主导航">
        <button
          type="button"
          className={tab === 'eat' ? 'is-active' : ''}
          onClick={() => setTab('eat')}
        >
          <Soup size={16} /> 推荐
        </button>
        <button
          type="button"
          className={tab === 'rank' ? 'is-active' : ''}
          onClick={() => setTab('rank')}
        >
          <Trophy size={16} /> 榜单
        </button>
        <button
          type="button"
          className={tab === 'blind' ? 'is-active' : ''}
          onClick={enterBlind}
        >
          <Sparkles size={16} /> 盲盒
        </button>
      </nav>

      {tab === 'eat' ? (
        <div className={`fd-grid${kind === 'sweet' ? ' fd-grid-single' : ''}`}>
          {kind === 'food' && (
            <div className="fd-col">
              <section className="fd-card fd-pref-card">
                {hintOpen && (
                  <div className="fd-pref-bubble" role="status">
                    <b>选好位置与口味，推荐 / 盲盒 / 榜单都会跟着变</b>
                    <small>设置只保存在本机，点下面的选项试试</small>
                    <button type="button" className="fd-pref-bubble-ok" onClick={closeHint}>知道了</button>
                  </div>
                )}
                <header className="fd-card-head">
                  <div>
                    <h2><SlidersHorizontal size={16} /> 设置</h2>
                    <p>位置、餐类、预算与口味——推荐、盲盒、榜单都按这里实时更新</p>
                  </div>
                  <button type="button" className="fd-link" onClick={() => updatePrefs(defaultPrefs())}>
                    <RotateCcw size={13} /> 恢复默认
                  </button>
                </header>

                <div className="fd-pref-row">
                  <label>餐类</label>
                  <div className="fd-chips">
                    {FD_MEALS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        className={prefs.meals && prefs.meals.indexOf(m.key) >= 0 ? 'is-on' : ''}
                        onClick={() => toggleMeal(m.key)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <small className="fd-pref-hint">
                    午餐与晚餐统一为「午晚」不细分；夜宵以小吃、汉堡、烧烤为主；不勾选＝全时段
                  </small>
                </div>

                <div className="fd-pref-row">
                  <label>点餐预算</label>
                  <div className="fd-chips">
                    {BUDGET_OPTIONS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        className={prefs.budget === b ? 'is-on' : ''}
                        onClick={() => { closeHint(); updatePrefs({ ...prefs, budget: b }) }}
                      >
                        ¥{b}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="fd-pref-row">
                  <label>喜欢的口味</label>
                  <div className="fd-chips">
                    {TASTE_OPTIONS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={prefs.taste.indexOf(t) >= 0 ? 'is-on' : ''}
                        onClick={() => toggleTaste(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="fd-pref-row">
                  <label>位置</label>
                  <div className="fd-chips">
                    {LOCATION_OPTIONS.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        className={prefs.locations && prefs.locations.indexOf(loc.id) >= 0 ? 'is-on' : ''}
                        onClick={() => toggleLocation(loc.id)}
                      >
                        {loc.label}
                      </button>
                    ))}
                  </div>
                  <small className="fd-pref-hint">
                    商业街按数据集门店区域拆为一期 / 二期；不勾选＝全部四个位置
                  </small>
                </div>
              </section>
            </div>
          )}

          <div className="fd-col">
            <section className="fd-card">
              <header className="fd-card-head">
                <div>
                  <h2>为你推荐</h2>
                  <p>
                    {kind === 'food'
                      ? '餐类 · 位置 · 口味 · 预算综合打分，超出设置的菜不进推荐'
                      : '评分 · 人气综合打分'}
                  </p>
                </div>
                <button
                  type="button"
                  className="fd-link"
                  onClick={nextBatch}
                >
                  <RefreshCw size={14} /> 换一批
                </button>
              </header>
              <div className="fd-recs">
                {pickRecs.length === 0 && (
                  <div className="fd-empty">按当前设置暂时没有合适的菜——放宽预算、位置或餐类试试</div>
                )}
                {pickRecs.map((dish, i) => (
                  <div
                    key={dish.id}
                    className={`fd-rec is-clickable${i === 3 ? ' is-extra' : ''}`}
                    onClick={() => setDetail(dish)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setDetail(dish) }}
                    role="button"
                    tabIndex={0}
                  >
                    <DishArt dish={dish} className={`fd-thumb fd-thumb-${thumbTone(dish)}`} iconSize={22} />
                    <b>
                      {dish.name}
                      {dish.options && <em className="fd-rank-tag is-opt">可自选</em>}
                    </b>
                    <span className="fd-rec-priceline">
                      <span className="fd-rec-price">
                        ¥{dish.price} · {dish.kcal} kcal
                        {dish.single && <em className="fd-rec-single">单点不送</em>}
                      </span>
                      <EatBtn dish={dish} count={history[dish.id] || 0} onEaten={markEaten} />
                    </span>
                    <span className="fd-rec-why">{dish.reason}</span>
                    <span className="fd-rec-stall">{dish.canteenName} · {dish.stallName}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : tab === 'rank' ? (
        <div className="fd-rank-wrap">
          <div className={`fd-rank-tabs${rankTabs.length === 3 ? ' is-three' : rankTabs.length === 2 ? ' is-two' : ''}`}>
            {rankTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                className={rankKey === item.key ? 'is-active' : ''}
                onClick={() => setRankKey(item.key)}
              >
                <b>{item.label}</b>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>
          <section className="fd-card fd-rank-card">
            <header className="fd-card-head">
              <div>
                <h2>{rankTabs.find((r) => r.key === rankKey)?.label}</h2>
                <p>
                  {kind === 'food'
                    ? rankKey === 'value'
                      ? `已按设置过滤 · 限主食正餐（¥7–22 · 热量 ≥500 kcal）· 按每元热量排序`
                      : `已按设置过滤（${tasteText} · ${mealsText} · ${locText} · 预算 ¥${prefs.budget} 内）`
                    : '饮品甜点全量 · 不受口味与预算偏好限制'}
                </p>
              </div>
              <Badge tone="gold">TOP 20</Badge>
            </header>
            <RankList
              list={ranks[rankKey]}
              rankKey={rankKey}
              emptyText={kind === 'food' ? '按当前设置，这一榜暂时没有菜——放宽预算、位置或餐类试试' : '这一榜暂时没有菜品'}
              eatenCounts={history}
              onEaten={markEaten}
              onPick={(d) => setDetail(d)}
            />
          </section>
        </div>
      ) : (
        <section className="fd-card fd-blind-panel">
          {blind ? (
            <>
              <div className="fd-blind-kicker">
                <Sparkles size={15} /> {kind === 'food' ? '今日盲盒' : '饮品甜点盲盒'}
              </div>
              <h3>{blind.names}</h3>
              <div className="fd-blind-items">
                {blind.items.map((d) => (
                  <div key={d.id} className="fd-blind-item">
                    <DishArt dish={d} className={`fd-thumb fd-thumb-${thumbTone(d)}`} iconSize={20} />
                    <span><b>{d.name}</b><small>{d.stallName}</small></span>
                    <strong>¥{d.price}</strong>
                    <EatBtn dish={d} count={history[d.id] || 0} onEaten={markEaten} />
                  </div>
                ))}
              </div>
              <div className="fd-blind-facts">
                <span><Flame size={14} /> {blind.kcal} kcal</span>
                <span><ChefHat size={14} /> 蛋白 {blind.protein}g</span>
                <span><Users size={14} /> {blind.stallName}</span>
              </div>
              <div className="fd-blind-foot">
                <b>{blind.totalText}</b>
                <span>{blind.saveText}</span>
                <button type="button" className="fd-blind-reroll" onClick={rerollBlind}>
                  <RefreshCw size={14} /> 换一个
                </button>
              </div>
              <p className="fd-blind-note">
                按当前设置随机抽取：预算 ¥{prefs.budget} · {kind === 'food' ? `${mealsText} · ${locText}` : '饮品甜点'} · 每次都不一样
              </p>
            </>
          ) : (
            <div className="fd-blind-empty">
              <span className="fd-blind-icon"><Sparkles size={22} /></span>
              <b>按当前设置没有符合预算的菜</b>
              <small>放宽预算、位置或餐类后再试</small>
              <button type="button" className="fd-blind-reroll" onClick={() => drawBlind()}>
                <RefreshCw size={14} /> 再开一次
              </button>
            </div>
          )}
        </section>
      )}

      {detail && (
        <DishDetail
          key={detail.id}
          dish={detail}
          eatenCount={history[detail.id] || 0}
          onEaten={markEaten}
          onClose={() => setDetail(null)}
        />
      )}

      <footer className="fd-foot">
        <Footprints size={13} /> 移植自「饭点·广应科」学生端 + 校生活真实数据集（105 家门店真实营业时段）· 组合菜可勾选荤素加料 · 「吃过」让推荐越用越准 · 演示数据
      </footer>
    </div>
  )
}
