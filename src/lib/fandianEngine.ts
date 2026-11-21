/**
 * 饭点分流引擎 —— 移植自「饭点·广应科」两套 engine.js（纯计算，不碰存储）。
 * 教师端界面展示「推荐 / 榜单 / 设置」，设置（位置 / 餐类 / 预算 / 口味）作为参数传入计算函数：
 *   1) 推荐：真实吃过历史（界面记录，localStorage）+ 口味 + 预算 + 评分/人气加权打分
 *   2) 榜单：热销 / 好评 / 性价比（每榜 20 条；按预算与餐类过滤）
 *   3) 菜品淘汰建议：算法保留，教师端当前不展示
 * 纯静态计算：无模拟时钟、无拥挤度/排队/等待时长模型；餐段优先用「校生活」
 * 数据集门店真实营业时段（FANDIAN_HOURS）推导。
 */

import {
  FANDIAN_CANTEENS,
  FANDIAN_STALLS,
  FANDIAN_DISHES,
  FANDIAN_PREFS,
  FANDIAN_HISTORY,
  type FdCanteen,
  type FdStall,
  type FdPrefs,
  type FdDishX,
} from '../data/fandianAll'
import { FANDIAN_HOURS, type FdWorkWindow } from '../data/fandianHours'
import { fdDishArt } from '../data/fandianArt'

/** 菜品类型 = 基础 FdDish + 真实数据集扩展（options 分组 / 站内照片路径） */
type FdDish = FdDishX

/** 界面可调的设置子集（goal 等扩展字段不参与计算）；meals / locations 为空表示不限 */
export type FdPrefsInput = Pick<FdPrefs, 'maxSpicy' | 'budget' | 'taste' | 'avoid'> & {
  meals?: FdMeal[]
  /** 位置食堂 id 列表：c1 商业街一期 / c4 商业街二期 / c2 桃园食堂 / c3 桃蹊食堂 */
  locations?: string[]
}

/** 位置硬过滤：勾选了食堂就只看这些食堂的档口，正餐与饮品甜点都生效 */
function inLocation(d: FdDish, prefs: FdPrefsInput, stallMap: Record<string, StallView>): boolean {
  const locs = prefs.locations
  if (!locs || !locs.length) return true
  const stall = stallMap[d.stallId]
  return !!stall && locs.indexOf(stall.canteenId) >= 0
}

/**
 * 原版「口味偏好」用风味词（川 / 清淡 / 重口…），本数据集的 tags 是档口类别。
 * 这里把风味词映射到真实类别标签，保证原版每个选项都能实际命中菜品；
 * 未列出的词按原样匹配（面食 / 轻食 / 烧腊 等本身就是类别）。
 */
/** 导出给数据体检（fandianAudit）复用：体检会校验每个口味词都能真实命中菜品 */
export const TAG_ALIAS: Record<string, string[]> = {
  川: ['麻辣烫', '小炒快餐'],
  家常: ['小炒快餐', '焖炖'],
  清淡: ['粥汤', '轻食'],
  粤: ['烧腊', '粥汤'],
  小吃炸物: ['小吃', '烧烤'],
  重口: ['麻辣烫', '烧烤'],
  麻辣: ['麻辣烫'],
  主食: ['面食', '粥汤'],
}

function expandTags(list: string[]): string[] {
  const out: string[] = []
  for (const t of list) {
    const mapped = TAG_ALIAS[t]
    if (mapped) {
      for (const m of mapped) if (out.indexOf(m) < 0) out.push(m)
    } else if (out.indexOf(t) < 0) {
      out.push(t)
    }
  }
  return out
}

/** 「单点不送 / 另点 / 备注」类名字：不是独立菜品（addon 标记漏标的加料项），
 *  推荐、榜单、盲盒统一按此排除，避免「面（单点不送）」这类条目出现在师生面前 */
const FD_JUNK_RE = /单点|另点|不带|分装|打包|餐具|配料|蘸料|随机|备注|可选|任选|搭配|拼盘/

/* ---------- 类别划分：正餐 / 饮品甜点 ---------- */

/** 餐类：午餐与晚餐不细分，统一「午晚」；夜宵主打小吃/汉堡/烧烤/奶茶糖水 */
export type FdMeal = '早餐' | '午晚' | '夜宵'

/** 界面展示顺序与文案（午餐·晚餐为同一档，避免分得太细） */
export const FD_MEALS: { key: FdMeal; label: string }[] = [
  { key: '早餐', label: '早餐' },
  { key: '午晚', label: '午餐·晚餐' },
  { key: '夜宵', label: '夜宵' },
]

/** 两大类别：food 正餐 / sweet 饮品甜点 */
export type FdKind = 'food' | 'sweet'

const FD_STALL_CAT: Record<string, string> = {}
FANDIAN_STALLS.forEach((s) => { FD_STALL_CAT[s.id] = s.category })
const FD_STALL_NAME: Record<string, string> = {}
FANDIAN_STALLS.forEach((s) => { FD_STALL_NAME[s.id] = s.name })

/** 菜名级甜品/饮品关键词：只有「纯甜品」（名字只有甜品词、没有主食/炸物成分）才归饮品甜点 */
export const SWEET_NAME_RE = /双皮奶|龟苓膏|糖水|西米|烧仙草|清补凉|木薯|芋圆|芝麻糊|红豆沙|绿豆沙|杨枝甘露|蛋糕|雪糕|冰淇淋|布丁|奶冻|冰粉|奶昔|沙冰|慕斯|蛋挞|汤圆|椰奶|凉粉|果冻|银耳|麻薯|芋泥|豆花/

/** 主食/炸物成分关键词：与甜品词同时出现即为「组合」（葱油面拼绿豆沙、清凉炸鸡套餐、
 *  汉堡+鸡肉卷+可乐、酸辣粉+冰豆花），按「小吃炸物」归正餐侧；纯甜品（绿豆沙、烧仙草、
 *  双皮奶、冰粉、凉粉等）才归饮品甜点。裸「粉」用负向后瞻排除 冰粉/凉粉/藕粉 */
const COMBO_STAPLE_RE = /面|饭|(?<![冰凉藕])粉|米粉|河粉|粿条|肠粉|汉堡|堡|鸡腿|鸡排|鸡扒|肉卷|薯条|烤全腿|猪扒|比萨|披萨|pizza|意粉|套餐|腿|串|麻辣/i
const FRIED_MAIN_RE = /炸鸡|汉堡|鸡腿|鸡排|鸡扒|肉卷|薯条|烤全腿|猪扒|比萨|披萨|意粉/

/** 菜品类别：含甜品词的组合菜与主食/炸物一律归「正餐」（小吃炸物组），只有纯甜品归「饮品甜点」 */
export function fdKindOf(d: FdDish): FdKind {
  const sweetByName = SWEET_NAME_RE.test(d.name)
  const sweetByTag = d.tags.indexOf('饮品') >= 0 || d.tags.indexOf('水果') >= 0 || d.tags.indexOf('甜品') >= 0
  const staple = COMBO_STAPLE_RE.test(d.name)
  // 组合优先：甜品词 + 主食/炸物成分 → 小吃炸物（糖水铺的组合也照此办理）
  if ((sweetByName || sweetByTag) && staple) return 'food'
  // 纯主食/炸物名（无甜品词）→ 正餐：覆盖糖水铺兼卖的车仔面、战斧鸡腿、炸物双拼等
  if (staple || FRIED_MAIN_RE.test(d.name)) return 'food'
  const cat = FD_STALL_CAT[d.stallId]
  if (cat === 'drink' || cat === 'fruit') return 'sweet'
  if (sweetByTag) return 'sweet'
  if (sweetByName) return 'sweet'
  return 'food'
}

/* ---------- 餐类（早餐 / 午晚 / 夜宵） ---------- */

/**
 * 档口类别 → 基础供应餐段。口径参考通用餐段定义（早餐 5:00–10:00 清淡易消化：
 * 粥/包子/豆浆/肠粉/饭团；午餐 10:00–14:00 与晚餐 17:00–21:00 为正餐主食，
 * 本应用按用户要求合并为「午晚」不细分；夜宵 20:00–凌晨以不易吃饱的小吃为主：
 * 烧烤/麻辣烫/卤味/炸鸡/汉堡/糖水奶茶/果切——对应小吃、烧烤、麻辣烫、饮品水果档）：
 * - 粥汤/面食档开早市；便利店全天供应；小吃/烧烤/麻辣烫/饮品水果档营业到夜里
 */
const STALL_BASE_MEALS: Record<string, FdMeal[]> = {
  porridge: ['早餐', '午晚'],
  noodle: ['早餐', '午晚'],
  super: ['早餐', '午晚', '夜宵'],
  snack: ['午晚', '夜宵'],
  bbq: ['午晚', '夜宵'],
  malatang: ['午晚', '夜宵'],
  drink: ['午晚', '夜宵'],
  fruit: ['午晚', '夜宵'],
  other: ['午晚'],
}

/** 名字命中即额外供应早餐 / 夜宵（在档口基础餐段上叠加；关键词对应通用餐段定义） */
const BREAKFAST_RE = /粥|肠粉|包子|豆浆|油条|馒头|花卷|蒸饺|云吞|汤粉|米粉|糯米鸡|蛋饼|三明治|饭团|麦片|猪杂汤|及第|荷包蛋/
const NIGHT_RE = /烧烤|烤串|串烧|炸串|小龙虾|田螺|卤味|卤水|炸鸡|香锅|烤鱼|砂锅|宵夜|关东煮/

const DISH_MEALS = new Map<string, FdMeal[]>()

/** 真实营业时段 → 餐段：早餐=与 5:00–10:00 相交；午晚=与 10:00–14:00 / 17:00–21:00 相交；夜宵=与 20:00 后相交 */
function mealsFromWindows(windows: FdWorkWindow[]): FdMeal[] | null {
  const set = new Set<FdMeal>()
  for (const w of windows) {
    if (w.s < 600 && w.e > 300) set.add('早餐')
    if ((w.s < 840 && w.e > 600) || (w.s < 1260 && w.e > 1020)) set.add('午晚')
    if (w.s < 1440 && w.e > 1200) set.add('夜宵')
  }
  return set.size ? Array.from(set) : null
}

/**
 * 菜品供应餐段：档口有「校生活」真实营业时段（105 家门店全覆盖）→ 按时段推导，
 * 夜宵档口晚上开不开由营业时间说了算；无时段的档口回退 类别基础餐段 ∪ 菜名关键词。
 */
export function fdMealsOf(d: FdDish): FdMeal[] {
  const cached = DISH_MEALS.get(d.id)
  if (cached) return cached
  const hours = FANDIAN_HOURS[d.stallId]
  const fromHours = hours && hours.length ? mealsFromWindows(hours) : null
  if (fromHours) {
    DISH_MEALS.set(d.id, fromHours)
    return fromHours
  }
  const set = new Set<FdMeal>(STALL_BASE_MEALS[FD_STALL_CAT[d.stallId]] || STALL_BASE_MEALS.other)
  if (BREAKFAST_RE.test(d.name)) set.add('早餐')
  if (NIGHT_RE.test(d.name)) set.add('夜宵')
  const meals = Array.from(set)
  DISH_MEALS.set(d.id, meals)
  return meals
}

/** 各类别的档口/菜品规模（类别页签用；加料小料不算菜品） */
export function fdPoolStats(kind: FdKind): { stalls: number; dishes: number } {
  const dishes = FANDIAN_DISHES.filter((d) => fdKindOf(d) === kind && !d.addon)
  const stallIds = new Set<string>()
  dishes.forEach((d) => stallIds.add(d.stallId))
  return { stalls: stallIds.size, dishes: dishes.length }
}

/**
 * 全站规模（页头数据用）：档口取去重后的供应档口总数，菜品为两类合计（不含加料小料），
 * 配图为带真实照片的菜品数——数字全部由同一份数据推导，页脚「105 家门店真实营业时段」
 * 指营业时段覆盖数，两者口径不同但不再互相矛盾。
 */
export function fdGlobalStats(): { stalls: number; dishes: number; photos: number } {
  const stallIds = new Set<string>()
  let dishes = 0
  let photos = 0
  FANDIAN_DISHES.forEach((d) => {
    if (d.addon) return
    dishes++
    stallIds.add(d.stallId)
    if (d.photo) photos++
  })
  return { stalls: stallIds.size, dishes, photos }
}

/** meals 为空＝全时段；否则菜品餐段与所选餐类有交集即可 */
function mealsMatch(d: FdDish, meals?: FdMeal[]): boolean {
  if (!meals || !meals.length) return true
  const dishMeals = fdMealsOf(d)
  return meals.some((m) => dishMeals.indexOf(m) >= 0)
}

/** 档口视图 = 基础档口信息 + 所属食堂名（纯静态，无排队/等待模拟） */
export interface StallView extends FdStall {
  canteenName: string
}

export interface DishView extends FdDish {
  canteenName: string
  stallName: string
  priceText: string
  kcalText: string
  /** 站内配图路径；无图为空串，界面回退到碗形占位 */
  art: string
  /** 加料/单点不送，推荐与榜单会过滤，这里保留标记做防御展示 */
  single: boolean
  /** 每元热量，性价比榜副标题用 */
  kcalPerYuan: number
  reason?: string
  lowStock?: boolean
  stockText?: string
}

export interface BlindBox {
  items: DishView[]
  names: string
  total: number
  totalText: string
  kcal: number
  protein: number
  budget: number
  stallId: string
  stallName: string
  saveText: string
}

export interface Rankings {
  hot: DishView[]
  fresh: DishView[]
  top: DishView[]
  value: DishView[]
}

export interface DishAdvice {
  id: string
  name: string
  stallName: string
  sold: number
  remain: number
  rating: number
  advice: '建议下架' | '加量备货' | '估清过早' | '保留'
  tone: 'bad' | 'good' | 'warn' | 'ok'
}

/** 档口静态映射：id → 档口信息（含所属食堂名）。推荐 / 榜单 / 盲盒共用，
 *  只用于位置过滤与「食堂 · 档口」名称展示，不含任何排队/等待模拟。 */
function buildStallMap(): Record<string, StallView> {
  const map: Record<string, StallView> = {}
  FANDIAN_STALLS.forEach((s) => {
    const canteen = FANDIAN_CANTEENS.find((x) => x.id === s.canteenId)
    map[s.id] = { ...s, canteenName: canteen ? canteen.name : '' }
  })
  return map
}

function reasonOf(
  dish: FdDish,
  prefs: FdPrefsInput,
  history: Record<string, number>,
  meals?: FdMeal[],
): string {
  // 点过次数来自界面「吃过」的真实记录：吃过 1 次就值得说明
  const hist = history[dish.id] || 0
  if (hist >= 1) return '你点过 ' + hist + ' 次'
  // 口味理由优先于预算理由：勾选口味后，卡片要能看出「为什么推荐这道」。
  // 展示用户勾选的口味词本身（川/家常/面食…），而不是映射后的档口类别——
  // 否则会出现「勾的是川、页面写小炒快餐」这种与设置面板对不上的解释
  const words = prefs.taste && prefs.taste.length ? prefs.taste : []
  for (const w of words) {
    const exp = expandTags([w])
    if (exp.some((t) => dish.tags.indexOf(t) >= 0)) return '合你口味：' + w
  }
  if (dish.price <= prefs.budget && dish.spicy <= prefs.maxSpicy) {
    const spicyCn = fdKindOf(dish) === 'sweet' ? '' : dish.spicy === 0 ? ' 不辣' : ' 微辣'
    return '¥' + dish.price + spicyCn + '，符合你的预算'
  }
  const mealHit = meals && meals.length ? fdMealsOf(dish).filter((m) => meals.indexOf(m) >= 0)[0] : undefined
  if (mealHit) return mealHit === '午晚' ? '午晚正餐供应，赶上就能吃' : mealHit + '时段供应，赶上就能吃'
  return '评分 ' + dish.rating
}

function withStall(d: FdDish, stallMap: Record<string, StallView>): DishView {
  const s = stallMap[d.stallId] || ({} as StallView)
  return {
    ...d,
    canteenName: s.canteenName || '',
    stallName: s.name || '',
    priceText: '¥' + d.price,
    kcalText: d.kcal + ' kcal',
    art: d.photo || fdDishArt(d.id),
    single: d.addon,
    kcalPerYuan: d.price > 0 ? Math.round(d.kcal / d.price) : 0,
  }
}

export function fdRecommend(limit = 6, canteenId?: string, prefs: FdPrefsInput = FANDIAN_PREFS, kind: FdKind = 'food', history: Record<string, number> = FANDIAN_HISTORY): DishView[] {
  const stallMap = buildStallMap()
  const usePrefs = kind === 'food'
  const avoidTags = usePrefs ? expandTags(prefs.avoid) : []
  const tasteTags = usePrefs ? expandTags(prefs.taste) : []
  const mealsFilter = usePrefs ? prefs.meals : undefined

  return FANDIAN_DISHES
    .filter((d) => fdKindOf(d) === kind)
    .filter((d) => !canteenId || (stallMap[d.stallId] && stallMap[d.stallId].canteenId === canteenId))
    .filter((d) => inLocation(d, prefs, stallMap))
    .filter((d) => !d.addon)
    .filter((d) => !FD_JUNK_RE.test(d.name))
    .filter((d) => d.remain > 0)
    .filter((d) => !usePrefs || !avoidTags.some((a) => d.tags.indexOf(a) >= 0))
    // 辣度与预算是硬过滤：超出上限/预算的菜绝不进推荐（榜单与盲盒同口径）
    .filter((d) => !usePrefs || (d.spicy <= prefs.maxSpicy && d.price <= prefs.budget))
    // 喜欢的口味也是硬过滤：勾选了口味就只推命中对应类别的菜，保证「推荐＝口味」
    .filter((d) => !usePrefs || !prefs.taste.length || tasteTags.some((t) => d.tags.indexOf(t) >= 0))
    .filter((d) => mealsMatch(d, mealsFilter))
    .map((d) => {
      const hist = history[d.id] || 0
      let score = 0
      score += Math.min(3, hist) * 1.3
      score += (d.rating - 4.2) * 2.4
      if (usePrefs && tasteTags.some((t) => d.tags.indexOf(t) >= 0)) score += 1.6
      if (d.remain <= 3) score -= 0.7
      if (d.isNew) score += 0.4
      return { dish: d, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ dish }) => ({
      ...withStall(dish, stallMap),
      reason: reasonOf(dish, prefs, history, mealsFilter),
      lowStock: dish.remain > 0 && dish.remain <= 3,
      stockText: dish.remain <= 3 ? '仅剩 ' + dish.remain + ' 份' : '',
    }))
}

export function fdBlindBox(budget?: number, canteenId?: string, prefs: FdPrefsInput = FANDIAN_PREFS, kind: FdKind = 'food'): BlindBox | null {
  const cap = budget || prefs.budget || 15
  const stallMap = buildStallMap()

  // 过滤掉「单点不送 / 另点 / 分装」这类加料备注名，避免盲盒选出非主菜（与推荐、榜单同口径）

  const usePrefs = kind === 'food'
  const avoidTags = usePrefs ? expandTags(prefs.avoid) : []
  const tasteTags = usePrefs ? expandTags(prefs.taste) : []
  const mealsFilter = usePrefs ? prefs.meals : undefined
  const ok = (d: FdDish) =>
    fdKindOf(d) === kind &&
    (!canteenId || (stallMap[d.stallId] && stallMap[d.stallId].canteenId === canteenId)) &&
    inLocation(d, prefs, stallMap) &&
    d.remain > 0 &&
    (!usePrefs || (
      d.spicy <= prefs.maxSpicy &&
      !avoidTags.some((a) => d.tags.indexOf(a) >= 0) &&
      (!prefs.taste.length || tasteTags.some((t) => d.tags.indexOf(t) >= 0))
    )) &&
    mealsMatch(d, mealsFilter) &&
    !d.addon && !FD_JUNK_RE.test(d.name)

  // 组合池：先把所有可行组合按分排序，再取前 8 名随机抽一个——
  // 每次开盒 /「换一个」都有变化，不再总是同一组「最优解」
  const pickRandom = <T>(list: T[]): T | undefined =>
    list.length ? list[Math.floor(Math.random() * list.length)] : undefined

  const buildBox = (items: FdDish[]): BlindBox => {
    const stall = stallMap[items[0].stallId]
    // 金额一律取整到分，避免浮点差产生「¥2.2999999999999998」这类长小数
    const total = Math.round(items.reduce((n, d) => n + d.price, 0) * 100) / 100
    return {
      items: items.map((d) => withStall(d, stallMap)),
      names: items.map((d) => d.name).join(' + '),
      total,
      totalText: '¥' + total,
      kcal: items.reduce((n, d) => n + d.kcal, 0),
      protein: items.reduce((n, d) => n + d.p, 0),
      budget: cap,
      stallId: items[0].stallId,
      stallName: stall ? stall.canteenName + stall.name : '',
      saveText: '比预算省 ¥' + Math.round(Math.max(0, cap - total) * 100) / 100,
    }
  }

  const pool = FANDIAN_DISHES.filter((d) => ok(d) && d.price <= cap)

  // 单品盲盒：可行池已按口味偏好硬过滤，评分排序取前 8 名随机抽一款——
  // 每次开盒 /「换一个」都有变化，且必定符合口味偏好
  if (!pool.length) return null
  const scored = pool
    .map((d) => {
      return {
        d,
        score: d.rating + (d.price >= 8 ? 0.3 : 0) + Math.random() * 0.8,
      }
    })
    .sort((a, b) => b.score - a.score)
  const pick = pickRandom(scored.slice(0, Math.min(8, scored.length)))
  return pick ? buildBox([pick.d]) : null
}

export function fdRankings(canteenId?: string, prefs: FdPrefsInput = FANDIAN_PREFS, kind: FdKind = 'food'): Rankings {
  const stallMap = buildStallMap()
  const inScope = (d: FdDish) => (!canteenId || (stallMap[d.stallId] && stallMap[d.stallId].canteenId === canteenId)) && inLocation(d, prefs, stallMap)
  // 榜单同样尊重口味偏好：辣度 / 预算 / 忌口 / 口味 / 餐段全部硬过滤，与推荐、盲盒同口径
  // （饮品甜点不受偏好限制）
  const usePrefs = kind === 'food'
  const avoidTags = usePrefs ? expandTags(prefs.avoid) : []
  const tasteTags = usePrefs ? expandTags(prefs.taste) : []
  const mealsFilter = usePrefs ? prefs.meals : undefined
  const alive = FANDIAN_DISHES
    .filter((d) => fdKindOf(d) === kind && d.remain > 0 && inScope(d) && !d.addon && !FD_JUNK_RE.test(d.name))
    .filter((d) => !usePrefs || (d.spicy <= prefs.maxSpicy && d.price <= prefs.budget && !avoidTags.some((a) => d.tags.indexOf(a) >= 0)))
    .filter((d) => !usePrefs || !prefs.taste.length || tasteTags.some((t) => d.tags.indexOf(t) >= 0))
    .filter((d) => mealsMatch(d, mealsFilter))
  const noStaple = (d: FdDish) => d.tags.indexOf('主食') < 0 && d.tags.indexOf('饮品') < 0
  const N = 20

  const hot = alive.filter(noStaple)
    .sort((a, b) => b.soldToday - a.soldToday || b.rating - a.rating)
    .slice(0, N).map((d) => withStall(d, stallMap))

  const freshPool = alive.filter((d) => d.isNew)
    .concat(alive.slice().sort((a, b) => b.rating - a.rating).slice(0, 3))
  const seen: Record<string, boolean> = {}
  const fresh = freshPool.filter((d) => {
    if (seen[d.id]) return false
    seen[d.id] = true
    return true
  }).slice(0, N).map((d) => withStall(d, stallMap))

  // 好评榜：4.9 扎堆时按今日销量、再按价格定平局次序——排序结果可解释、可复现，
  // 不会因为数据集顺序碰巧把某一类全挤出前 20
  const top = alive.slice()
    .sort((a, b) => b.rating - a.rating || b.soldToday - a.soldToday || a.price - b.price)
    .slice(0, N).map((d) => withStall(d, stallMap))

  // 性价比榜（按每元热量）只对正餐有意义；饮品甜点类别返回空，界面隐藏该 tab
  const value: DishView[] = []
  if (kind === 'food') {
    const VALUE_JUNK = /分装|另点|打包|餐具|米饭$|白饭|例汤|配料|蘸料|随机|备注|可选|任选|搭配|拼盘/
    const MAIN_TAGS = ['面食', '小炒快餐', '烧腊', '焖炖', '粥汤', '麻辣烫', '称重自选', '烧烤']
    const MAIN_NAME = /饭|面|粉|线|煲|套餐|饺|馄饨|锅|饼|馍|肉|鸡|鱼|牛|猪|鸭|虾|排|卷|盒/
    const valuePool = alive
      .filter((d) => d.price >= 7 && d.price <= 22 && d.kcal >= 500)
      .filter((d) => !VALUE_JUNK.test(d.name))
      .filter((d) => MAIN_TAGS.indexOf(d.tags[0]) >= 0 || MAIN_NAME.test(d.name))
      .filter((d) => {
        const cat = FD_STALL_CAT[d.stallId]
        const loose = cat === 'malatang' || cat === 'weigh'
        return !loose || /饭|面|粉|套餐|冒菜|锅/.test(d.name)
      })
      .sort((a, b) => (b.kcal / b.price) - (a.kcal / a.price) || a.price - b.price || b.rating - a.rating)

    const perStall: Record<string, number> = {}
    for (let i = 0; i < valuePool.length && value.length < N; i++) {
      const d = valuePool[i]
      const cnt = perStall[d.stallId] || 0
      if (cnt >= 2) continue
      perStall[d.stallId] = cnt + 1
      value.push(withStall(d, stallMap))
    }
  }

  return { hot, fresh, top, value }
}

/** 菜品淘汰建议：来自 Web 运营后台 dishStats 规则。 */
export function fdDishAdvice(limit = 8): DishAdvice[] {
  const stallMap: Record<string, FdStall> = {}
  FANDIAN_STALLS.forEach((s) => { stallMap[s.id] = s })
  return FANDIAN_DISHES
    .filter((d) => d.tags.indexOf('主食') < 0 && d.tags.indexOf('饮品') < 0)
    .map((d) => {
      const sold = d.soldToday
      const soldOut = d.remain === 0
      let advice: DishAdvice['advice'] = '保留'
      let tone: DishAdvice['tone'] = 'ok'
      if (sold < 8) { advice = '建议下架'; tone = 'bad' }
      else if (sold > 30) { advice = '加量备货'; tone = 'good' }
      else if (soldOut) { advice = '估清过早'; tone = 'warn' }
      return {
        id: d.id,
        name: d.name,
        stallName: stallMap[d.stallId]?.name || '',
        sold,
        remain: d.remain,
        rating: d.rating,
        advice,
        tone,
      }
    })
    .sort((a, b) => {
      const order: Record<DishAdvice['tone'], number> = { bad: 0, warn: 1, good: 2, ok: 3 }
      return order[a.tone] - order[b.tone] || b.sold - a.sold
    })
    .slice(0, limit)
}

export const FANDIAN_PREFS_EXPORT = FANDIAN_PREFS
