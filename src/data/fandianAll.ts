/**
 * 食堂数据合并入口：fandianData.ts（原有演示数据，保持不变）+ fandianData2.ts
 * （「校生活」真实数据集增量，2026-10-22 快照）。
 * 引擎与视图统一从这里取数据，保证原有 3 食堂 / 92 档口 / 350 菜品不被改动。
 */
export type { FdCanteen, FdStall, FdDish, FdPrefs } from './fandianData'
export { FANDIAN_PREFS, FANDIAN_HISTORY } from './fandianData'
export type { FdOptionGroup, FdOptionValue, FdDishX } from './fandianData2'

import {
  FANDIAN_CANTEENS as BASE_CANTEENS,
  FANDIAN_STALLS as BASE_STALLS,
  FANDIAN_DISHES as BASE_DISHES,
  type FdCanteen,
} from './fandianData'
import { FANDIAN_STALLS_DS, FANDIAN_DISHES_DS, type FdDishX } from './fandianData2'
import { FANDIAN_RETAG } from './fandianRetag'
import { FANDIAN_NUT_FIX } from './fandianNutFix'
import { FANDIAN_WEB_PHOTO_IDS } from './fandianWebPhoto'
import { FANDIAN_STALL_CANTEEN, FANDIAN_STALL_CATEGORY_FIX } from './fandianCanteens'

/**
 * 四个位置：商业街一期(c1，原「商业街」) / 商业街二期(c4，新增) / 桃园食堂(c2) / 桃蹊食堂(c3)。
 * 依据数据集 shops.json 的 area 字段拆分，基础演示数据本身不改动。
 */
export const FANDIAN_CANTEENS: FdCanteen[] = [
  { ...BASE_CANTEENS[0], name: '商业街一期', floor: '一期', note: '13 家门店' },
  BASE_CANTEENS[1],
  BASE_CANTEENS[2],
  { id: 'c4', name: '商业街二期', floor: '二期', distance: BASE_CANTEENS[0].distance, walk: BASE_CANTEENS[0].walk, note: '10 家门店' },
  // 保持 c1/c2/c3/c4 的顺序，界面「位置」按业务常用顺序单独排列
]

/** 全量档口 = 原有 92 家 + 数据集新增（商业街按 area 拆为一期 c1 / 二期 c4；类别错标按覆盖表修正） */
export const FANDIAN_STALLS = [...BASE_STALLS, ...FANDIAN_STALLS_DS].map((s) => {
  const canteenId = FANDIAN_STALL_CANTEEN[s.id]
  const category = FANDIAN_STALL_CATEGORY_FIX[s.id]
  return {
    ...s,
    ...(canteenId ? { canteenId } : {}),
    ...(category ? { category } : {}),
  }
})

/**
 * 「其他」类治理：按 fandianRetag.ts 覆盖表修正类别/加料标记
 * （酱汁噪声→加料、隐藏饮品甜品→饮品甜点、菜名关键词→真实类别）。
 * 覆盖表对基础 350 道与数据集增量同时生效；两个源文件本身保持不动。
 */
const applyRetag = <T extends { id: string; tags: string[]; addon?: boolean }>(d: T): T => {
  const r = FANDIAN_RETAG[d.id]
  if (!r) return d
  return {
    ...d,
    ...(r.tags ? { tags: r.tags } : {}),
    ...(r.addon !== undefined ? { addon: r.addon } : {}),
  }
}

/** 营养占位值修正：按 fandianNutFix.ts 覆盖表替换明显失真的 kcal/宏量（源文件不动） */
const applyNutFix = <T extends { id: string; kcal: number; p: number; c: number; f: number }>(d: T): T => {
  const r = FANDIAN_NUT_FIX[d.id]
  if (!r) return d
  return {
    ...d,
    ...(r.kcal !== undefined ? { kcal: r.kcal } : {}),
    ...(r.p !== undefined ? { p: r.p } : {}),
    ...(r.c !== undefined ? { c: r.c } : {}),
    ...(r.f !== undefined ? { f: r.f } : {}),
  }
}

/** 网络配图补齐：快照缺图的菜品按 fandianWebPhoto.ts 覆盖表挂 public/fandian/webfood 图 */
const applyWebPhoto = (d: FdDishX): FdDishX =>
  FANDIAN_WEB_PHOTO_IDS.has(d.id) && !d.photo ? { ...d, photo: '/fandian/webfood/' + d.id + '.jpg' } : d

/** 全量菜品 = 原有 350 道 + 数据集新增（重名跳过；加餐料/小料 addon:true；组合菜带 options 分组） */
export const FANDIAN_DISHES: FdDishX[] = [
  ...(BASE_DISHES as FdDishX[]).map(applyRetag).map(applyNutFix).map(applyWebPhoto),
  ...FANDIAN_DISHES_DS.map(applyRetag).map(applyNutFix).map(applyWebPhoto),
]
