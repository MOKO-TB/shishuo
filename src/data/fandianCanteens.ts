// 自动生成（2026-11-21）：商业街一期/二期拆分覆盖表。
// 源：校生活数据集 shops.json 的 area 字段。原 fandianData.ts / fandianData2.ts 不改。
// c1 = 商业街一期（原商业街），c4 = 商业街二期（新增）；其余食堂 id 不变。
export const FANDIAN_STALL_CANTEEN: Record<string, string> = {
  "s7": "c4",
  "s8": "c1",
  "s14": "c1",
  "s21": "c1",
  "s26": "c1",
  "s28": "c1",
  "s45": "c1",
  "s61": "c1",
  "s64": "c1",
  "s67": "c1",
  "s68": "c4",
  "s69": "c4",
  "s73": "c1",
  "s74": "c4",
  "s76": "c4",
  "s80": "c4",
  "s81": "c4",
  "s84": "c4",
  "s86": "c4",
  "s91": "c1",
  "s92": "c4",
  "x198764": "c1",
  "x207159": "c1",
}

/**
 * 档口类别修正覆盖表：基础数据里被错标的档口（源文件不改，合并入口应用）。
 * s74 合德记糖水铺：糖水甜品店，基础数据误标为 noodle——错误类别顺着重打标兜底
 * 污染了该店菜品的标签（麻薯糊标成「面食」、酒酿窝蛋标成「小炒快餐」），
 * 导致整店甜品漏进正餐推荐；改回 drink（饮品水果类）后全店按饮品甜点归类。
 */
export const FANDIAN_STALL_CATEGORY_FIX: Record<string, string> = {
  "s74": "drink",
}
