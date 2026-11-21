/**
 * 食堂数据体检（开发期自检）：对合并后的菜品库跑一遍一致性断言，
 * dev 模式下在控制台输出报告，帮助演示前发现「数字对不上 / 数据失真」类问题。
 * 生产构建不打日志，但检查逻辑可复用（后续接入管理后台体检页时直接调用 fdAuditIssues）。
 */
import { FANDIAN_DISHES, FANDIAN_STALLS } from '../data/fandianAll'
import { fdKindOf, fdGlobalStats, fdPoolStats, TAG_ALIAS, SWEET_NAME_RE } from './fandianEngine'

export interface FdAuditIssue {
  /** 严重度：error 会误导演示，warn 属于数据债务 */
  level: 'error' | 'warn'
  rule: string
  detail: string
}

export function fdAuditIssues(): FdAuditIssue[] {
  const issues: FdAuditIssue[] = []
  const menu = FANDIAN_DISHES.filter((d) => !d.addon)

  // 1) 占位宏量：同一条 (kcal,p,c,f) 被大量不同菜品共用 → 明显是兜底值
  const macro = new Map<string, string[]>()
  menu.forEach((d) => {
    const key = `${d.kcal}/${d.p}/${d.c}/${d.f}`
    const list = macro.get(key) || []
    list.push(d.name)
    macro.set(key, list)
  })
  macro.forEach((names, key) => {
    if (names.length >= 30) {
      issues.push({
        level: 'warn',
        rule: 'placeholder-macro',
        detail: `${key} 被 ${names.length} 道菜共用（如 ${names.slice(0, 3).join('、')}…），疑为数据集占位值`,
      })
    }
  })

  // 2) 每元热量离谱：性价比榜口径下，>150 kcal/元 基本是「小份配菜配上大份热量」
  menu.forEach((d) => {
    if (d.price > 0 && d.kcal / d.price > 150) {
      issues.push({ level: 'warn', rule: 'kcal-per-yuan', detail: `「${d.name}」¥${d.price} = ${Math.round(d.kcal / d.price)} kcal/元，热量疑似占位值` })
    }
  })

  // 3) 素菜热量上限 / 主食热量下限的常识区间
  menu.forEach((d) => {
    if (d.meat === '素' && d.kcal > 800) {
      issues.push({ level: 'warn', rule: 'veg-kcal', detail: `「${d.name}」（素）${d.kcal} kcal，超出素菜常识区间` })
    }
  })

  // 4) 口味标签覆盖：每个可勾选口味（含映射）必须至少能命中一道菜，否则选项是空话
  for (const [word, mapped] of Object.entries(TAG_ALIAS)) {
    const n = menu.filter((d) => mapped.some((t) => d.tags.indexOf(t) >= 0)).length
    if (n === 0) {
      issues.push({ level: 'error', rule: 'taste-coverage', detail: `口味「${word}」映射到 ${mapped.join('/')}，但没有任何菜品命中` })
    }
  }

  // 5) 分类混入 sanity：饮品甜点类里不应出现明显的主食/荤菜名；
  //    名字含甜品关键词的组合菜（葱油面拼绿豆沙、主食+冰豆花等）归甜品侧是预期，不算混入
  const STAPLE_RE = /^(?:[^拼＋+：])*?(汤粉|汤面|盖饭|腿|串|炸鸡|卤)/
  menu.forEach((d) => {
    if (fdKindOf(d) === 'sweet' && STAPLE_RE.test(d.name) && !SWEET_NAME_RE.test(d.name)) {
      issues.push({ level: 'error', rule: 'kind-mix', detail: `「${d.name}」出现在饮品甜点类，名字像正餐` })
    }
  })

  // 6) 规模口径：页头全局数与两类之和必须能对上（档口两类重复供应是已知口径，检查菜品数）
  const g = fdGlobalStats()
  const sum = fdPoolStats('food').dishes + fdPoolStats('sweet').dishes
  if (g.dishes !== sum) {
    issues.push({ level: 'error', rule: 'stats-reconcile', detail: `全站菜品 ${g.dishes} ≠ 两类之和 ${sum}` })
  }

  // 7) 营业时段覆盖：页脚承诺「105 家门店真实营业时段」，档口总数应不少于覆盖数
  if (FANDIAN_STALLS.length < 105) {
    issues.push({ level: 'error', rule: 'hours-coverage', detail: `档口总数 ${FANDIAN_STALLS.length} 少于营业时段覆盖的 105 家` })
  }

  return issues
}

/** dev 模式控制台报告；返回 issue 数便于测试断言 */
export function reportFdAudit(): number {
  const issues = fdAuditIssues()
  if (!issues.length) {
    console.info('[fandian-audit] 数据体检通过，未发现口径或失真问题')
    return 0
  }
  const errors = issues.filter((i) => i.level === 'error')
  const warns = issues.filter((i) => i.level === 'warn')
  console.group(`[fandian-audit] 发现 ${errors.length} 个错误 / ${warns.length} 个警告`)
  issues.forEach((i) => (i.level === 'error' ? console.error : console.warn)(`${i.rule}: ${i.detail}`))
  console.groupEnd()
  return issues.length
}
