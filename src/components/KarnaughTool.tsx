import { Fragment, useMemo, useState } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { Badge, MathText, Modal } from './ui'

type KValue = 0 | 1 | 'd'
type KVars = 3 | 4
type GroupColor = 'jade' | 'blue' | 'gold' | 'violet' | 'rose' | 'teal'

interface KPreset {
  id: string
  vars: KVars
  label: string
  minterms: number[]
  dontcares?: number[]
  insight: string
}

interface KBlock {
  cells: number[]
  mask: number
  termLatex: string
  termLabel: string
  kept: string
  dropped: string
  note: string
  color: GroupColor
}

interface KResult {
  groups: KBlock[]
  expression: string
  ones: number[]
  dontcares: number[]
}

const PRESETS: KPreset[] = [
  {
    id: 'c1',
    vars: 3,
    label: 'F=Σm(1,3,5,7)',
    minterms: [1, 3, 5, 7],
    insight: '四个 1 覆盖 C=1 的两列，圈越大，消掉的变量越多。',
  },
  {
    id: 'c0',
    vars: 3,
    label: 'F=Σm(0,2,4,6)',
    minterms: [0, 2, 4, 6],
    insight: '卡诺图边界可以卷起来；不要把 00 和 10 当成不相邻。',
  },
  {
    id: 'two',
    vars: 3,
    label: 'F=Σm(0,1,4,5,6)',
    minterms: [0, 1, 4, 5, 6],
    insight: '先圈大组 B′，再用 A C′ 覆盖剩下的 m6；允许重叠。',
  },
  {
    id: 'b0-4',
    vars: 4,
    label: 'F=Σm(0–3,8–11)',
    minterms: [0, 1, 2, 3, 8, 9, 10, 11],
    insight: '上下两行通过边界相邻，B=0 保持不变，A 被消去，得到 F=B′。',
  },
  {
    id: 'c0-4',
    vars: 4,
    label: 'F=Σm(0,1,4,5,8,9,12,13)',
    minterms: [0, 1, 4, 5, 8, 9, 12, 13],
    insight: 'C=0 的两列整列圈起来，F=C′。',
  },
  {
    id: 'corners-4',
    vars: 4,
    label: 'F=Σm(0,2,8,10)',
    minterms: [0, 2, 8, 10],
    insight: '四个角在行、列两个方向都相邻，B=0、D=0 保持不变，得到 F=B′D′。',
  },
]

const KMAP_COLS = ['00', '01', '11', '10']
const STEPS = [
  { label: '填图', desc: '把真值表里为 1 的最小项填进卡诺图；点击格子可切换 0 / 1 / d。' },
  { label: '圈组', desc: '自动圈 2^n 个相邻 1；先大后小，边界可跨，允许重叠。' },
  { label: '消变量', desc: '圈内不变的变量保留，变化的变量消去。' },
  { label: '写式', desc: '每个圈写一个与项，最后把所有与项或起来。' },
]
const COLORS: GroupColor[] = ['jade', 'blue', 'gold', 'violet', 'rose', 'teal']
const VAR_NAMES = ['A', 'B', 'C', 'D']
const COL_ORDER = [0, 1, 3, 2]

function mintermAt(row: number, col: number) {
  return COL_ORDER[row] * 4 + COL_ORDER[col]
}

function boardRows(vars: KVars) {
  if (vars === 3) {
    return [
      { label: 'A=0', cells: [0, 1, 3, 2] },
      { label: 'A=1', cells: [4, 5, 7, 6] },
    ]
  }
  return ['00', '01', '11', '10'].map((label, row) => ({
    label: `AB=${label}`,
    cells: KMAP_COLS.map((_, col) => mintermAt(row, col)),
  }))
}

function valuesFromMinterms(minterms: number[], vars: KVars, dontcares: number[] = []) {
  return Array.from({ length: 2 ** vars }, (_, index) =>
    dontcares.includes(index) ? 'd' : minterms.includes(index) ? 1 : 0,
  ) as KValue[]
}

function valuesMatch(values: KValue[], preset: KPreset) {
  if (values.length !== 2 ** preset.vars) return false
  return values.every((value, index) => {
    if (preset.dontcares?.includes(index)) return value === 'd'
    return value === (preset.minterms.includes(index) ? 1 : 0)
  })
}

function literalLatex(name: string, value: number) {
  return value === 0 ? `\\overline{${name}}` : name
}

function literalLabel(name: string, value: number) {
  return value === 0 ? `${name}′` : name
}

function maskOf(cells: number[]) {
  return cells.reduce((mask, cell) => mask | (1 << cell), 0)
}

function blockTerm(cells: number[], vars: KVars) {
  const valuesByVar = Array.from({ length: vars }, (_, index) =>
    cells.map((cell) => (cell >> (vars - 1 - index)) & 1),
  )
  const consts = valuesByVar.map((values) => {
    const unique = [...new Set(values)]
    return unique.length === 1 ? unique[0] : null
  })
  const latex = consts
    .map((value, index) => (value === null ? '' : literalLatex(VAR_NAMES[index], value)))
    .filter(Boolean)
    .join('')
  const label = consts
    .map((value, index) => (value === null ? '' : literalLabel(VAR_NAMES[index], value)))
    .filter(Boolean)
    .join('')
  const kept =
    consts
      .map((value, index) => (value === null ? '' : `${VAR_NAMES[index]}=${value}`))
      .filter(Boolean)
      .join('、') || '—'
  const dropped =
    consts
      .map((value, index) => (value === null ? VAR_NAMES[index] : ''))
      .filter(Boolean)
      .join('、') || '—'

  return {
    termLatex: latex || '1',
    termLabel: label || '1',
    kept,
    dropped,
    note:
      cells.length === 2 ** vars
        ? `${cells.length} 格全圈，F=1`
        : `${cells.length} 格组；${dropped === '—' ? '没有变量可消' : `${dropped} 变化被消去`}`,
  }
}

function generateBlocks(values: KValue[], vars: KVars) {
  const seen = new Set<string>()
  const blocks: Omit<KBlock, 'color'>[] = []
  const rowCount = vars === 3 ? 2 : 4
  const rowSpans = vars === 3 ? [1, 2] : [1, 2, 4]
  const colSpans = [1, 2, 4]

  for (const rowSpan of rowSpans) {
    for (const colSpan of colSpans) {
      for (let rowStart = 0; rowStart < rowCount; rowStart += 1) {
        for (let colStart = 0; colStart < 4; colStart += 1) {
          const cells = new Set<number>()
          for (let row = 0; row < rowSpan; row += 1) {
            for (let col = 0; col < colSpan; col += 1) {
              cells.add(mintermAt((rowStart + row) % rowCount, (colStart + col) % 4))
            }
          }
          if (cells.size !== rowSpan * colSpan) continue
          const list = [...cells]
          const key = [...list].sort((a, b) => a - b).join(',')
          if (seen.has(key)) continue
          const cellValues = list.map((cell) => values[cell])
          if (cellValues.some((value) => value === 0)) continue
          if (!cellValues.some((value) => value === 1)) continue
          seen.add(key)
          blocks.push({
            cells: list,
            mask: maskOf(list),
            ...blockTerm(list, vars),
          })
        }
      }
    }
  }

  return blocks
}

function literalCount(block: KBlock) {
  return block.termLabel.replace(/[^A-D]/g, '').length
}

function popcount(mask: number) {
  let count = 0
  while (mask) {
    count += mask & 1
    mask >>>= 1
  }
  return count
}

function minimize(values: KValue[], vars: KVars): KResult {
  const ones = values.flatMap((value, index) => (value === 1 ? [index] : []))
  const dontcares = values.flatMap((value, index) => (value === 'd' ? [index] : []))
  if (ones.length === 0) {
    return { groups: [], expression: '0', ones, dontcares }
  }

  const blocks = generateBlocks(values, vars) as KBlock[]
  const byCell = new Map<number, KBlock[]>()
  for (const block of blocks) {
    for (const cell of block.cells) {
      const list = byCell.get(cell) ?? []
      list.push(block)
      byCell.set(cell, list)
    }
  }

  const oneMask = maskOf(ones)
  const greedy: KBlock[] = []
  let greedyMask = oneMask
  while (greedyMask !== 0) {
    let pick: KBlock | undefined
    let pickCover = 0
    for (const block of blocks) {
      const cover = popcount(block.mask & greedyMask)
      if (cover === 0) continue
      if (
        !pick ||
        cover > pickCover ||
        (cover === pickCover && literalCount(block) < literalCount(pick))
      ) {
        pick = block
        pickCover = cover
      }
    }
    if (!pick) break
    greedy.push(pick)
    greedyMask &= ~pick.mask
  }

  const fallback =
    greedyMask === 0
      ? greedy
      : ones
          .map((minterm) => blocks.find((block) => block.cells.length === 1 && block.cells[0] === minterm))
          .filter((block): block is KBlock => Boolean(block))

  let best = fallback
  let bestCost = best.length * 100 + best.reduce((sum, block) => sum + literalCount(block), 0)
  let bestGroups = best.length
  const memo = new Map<number, { groups: number; literals: number }>()
  let nodes = 0

  const search = (uncovered: number, chosen: KBlock[], literals: number) => {
    nodes += 1
    if (nodes > 200_000) return
    const groups = chosen.length
    if (groups * 100 + literals >= bestCost) return
    if (uncovered === 0) {
      best = chosen.slice()
      bestCost = groups * 100 + literals
      bestGroups = groups
      return
    }
    if (groups + 1 > bestGroups) return

    const previous = memo.get(uncovered)
    if (
      previous &&
      (groups > previous.groups || (groups === previous.groups && literals >= previous.literals))
    ) {
      return
    }
    memo.set(uncovered, { groups, literals })

    let picked: KBlock[] | null = null
    for (let minterm = 0; minterm < values.length; minterm += 1) {
      if ((uncovered & (1 << minterm)) === 0) continue
      const candidates = (byCell.get(minterm) ?? []).filter(
        (block) => (block.mask & uncovered) !== 0,
      )
      if (candidates.length === 0) return
      if (!picked || candidates.length < picked.length) {
        picked = candidates
        if (candidates.length === 1) break
      }
    }
    if (!picked) return

    const sorted = [...picked].sort((a, b) => {
      const coverA = popcount(a.mask & uncovered)
      const coverB = popcount(b.mask & uncovered)
      return coverB - coverA || literalCount(a) - literalCount(b) || b.cells.length - a.cells.length
    })

    for (const block of sorted) {
      search(uncovered & ~block.mask, [...chosen, block], literals + literalCount(block))
    }
  }

  search(oneMask, [], 0)

  const sorted = [...best].sort(
    (a, b) => b.cells.length - a.cells.length || a.termLatex.localeCompare(b.termLatex),
  )
  const groups = sorted.map((block, index) => ({
    ...block,
    color: COLORS[index % COLORS.length],
  }))
  const expression = groups.map((group) => group.termLatex).join('+') || '0'

  return { groups, expression, ones, dontcares }
}

export function KarnaughTool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [vars, setVars] = useState<KVars>(3)
  const [values, setValues] = useState<KValue[]>(() =>
    valuesFromMinterms(PRESETS[0].minterms, 3),
  )
  const [step, setStep] = useState(0)
  const result = useMemo(() => minimize(values, vars), [values, vars])
  const activePreset = PRESETS.find((preset) => preset.vars === vars && valuesMatch(values, preset))
  const insight =
    activePreset?.insight ??
    `自定义 ${vars} 变量函数：点击格子改 0 / 1 / d，圈组和表达式会自动重算；无关项可以帮助化简。`
  const rows = boardRows(vars)

  const choosePreset = (preset: KPreset) => {
    setVars(preset.vars)
    setValues(valuesFromMinterms(preset.minterms, preset.vars, preset.dontcares))
    setStep(0)
  }

  const chooseVars = (next: KVars) => {
    if (next === vars) return
    const preset = PRESETS.find((item) => item.vars === next) ?? PRESETS[0]
    setVars(next)
    setValues(valuesFromMinterms(preset.minterms, next, preset.dontcares))
    setStep(0)
  }

  const cycleCell = (minterm: number) => {
    setValues((current) => {
      const next = [...current]
      next[minterm] = current[minterm] === 0 ? 1 : current[minterm] === 1 ? 'd' : 0
      return next
    })
    setStep(0)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="数电工具"
      title="卡诺图化简流程"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="digital-footnote">
            当前 {vars} 变量；点击格子切换 0 / 1 / d；圈 2^n 个相邻 1，边界可跨，允许重叠。
          </span>
          <button className="button button-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      }
    >
      <div className="digital-tool">
        <div className="kmap-presets">
          <span className="kmap-presets-label">变量</span>
          <button
            className={`digital-preset ${vars === 3 ? 'is-active' : ''}`}
            onClick={() => chooseVars(3)}
          >
            3 变量
          </button>
          <button
            className={`digital-preset ${vars === 4 ? 'is-active' : ''}`}
            onClick={() => chooseVars(4)}
          >
            4 变量
          </button>
        </div>
        <div className="kmap-presets">
          {PRESETS.filter((preset) => preset.vars === vars).map((preset) => (
            <button
              key={preset.id}
              className={`digital-preset ${activePreset?.id === preset.id ? 'is-active' : ''}`}
              onClick={() => choosePreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="kmap-flow">
          {STEPS.map((item, index) => (
            <Fragment key={item.label}>
              <div className={`kmap-flow-node ${index === step ? 'is-active' : ''} ${index < step ? 'is-done' : ''}`}>
                <span>{index + 1}</span>
                <strong>{item.label}</strong>
              </div>
              {index < STEPS.length - 1 && <ArrowRight size={14} className="kmap-flow-arrow" />}
            </Fragment>
          ))}
        </div>
        <p className="kmap-step-desc">{STEPS[step].desc}</p>

        <div className="kmap-controls">
          <button
            className="button button-ghost"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0}
          >
            上一步
          </button>
          <button
            className="button button-primary"
            onClick={() => setStep((current) => Math.min(3, current + 1))}
            disabled={step === 3}
          >
            下一步
          </button>
          <button className="text-button" onClick={() => setStep(0)}>
            <RotateCcw size={13} />
            重置
          </button>
        </div>

        <div className="kmap-layout">
          <div>
            <div className={`kmap-board ${vars === 4 ? 'is-4var' : ''}`}>
              <div className="kmap-corner">{vars === 3 ? 'A \\ BC' : 'AB \\ CD'}</div>
              {KMAP_COLS.map((col) => (
                <div className="kmap-col-head" key={col}>
                  {col}
                </div>
              ))}
              {rows.map((row) => (
                <Fragment key={row.label}>
                  <div className="kmap-row-head">{row.label}</div>
                  {row.cells.map((minterm) => {
                    const value = values[minterm]
                    const groups = step >= 1
                      ? result.groups.filter((group) => group.cells.includes(minterm))
                      : []
                    return (
                      <button
                        type="button"
                        className={`kmap-cell ${value === 1 ? 'is-one' : value === 'd' ? 'is-dontcare' : 'is-zero'} ${groups
                          .map((group) => `is-group-${group.color}`)
                          .join(' ')}`}
                        key={minterm}
                        onClick={() => cycleCell(minterm)}
                        aria-label={`m${minterm}，当前 ${value}，点击切换`}
                      >
                        <span className="kmap-m">m{minterm}</span>
                        <strong>{value === 'd' ? 'd' : value}</strong>
                        {groups.length > 0 && (
                          <span className="kmap-dots">
                            {groups.map((group) => (
                              <i key={group.cells.join('-')} className={`kmap-dot is-${group.color}`} />
                            ))}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </Fragment>
              ))}
            </div>
            <p className="kmap-hint">
              点击单元格切换 0 / 1 / d；{vars === 3 ? '列' : '行和列'}使用格雷码 00 / 01 / 11 / 10，
              {vars === 3 ? '最左列和最右列' : '最上/最下、最左/最右'}都相邻。
            </p>
          </div>

          <div className="kmap-side">
            {step === 0 && (
              <div className="kmap-side-card">
                <Badge tone="neutral">第 1 步</Badge>
                <p>
                  当前 1：{result.ones.length > 0 ? result.ones.map((m) => `m${m}`).join('、') : '无'}
                  {result.dontcares.length > 0
                    ? `；无关项：${result.dontcares.map((m) => `m${m}`).join('、')}`
                    : ''}
                  。点击格子修改后，下一步会自动圈组。
                </p>
              </div>
            )}
            {step >= 3 && (
              <div className="kmap-expression">
                <span>最简式</span>
                <strong>
                  <MathText text={`$F=${result.expression}$`} />
                </strong>
                <p>{insight}</p>
              </div>
            )}
            {step >= 1 && (
              <div className="kmap-group-list">
                {result.groups.length > 0 ? (
                  result.groups.map((group) => (
                    <div className={`kmap-group-card is-${group.color}`} key={group.cells.join('-')}>
                      <div className="kmap-group-head">
                        <i className={`kmap-dot is-${group.color}`} />
                        <strong>
                          <MathText text={`$${group.termLatex}$`} />
                        </strong>
                      </div>
                      <p>{group.note}</p>
                      {step >= 2 && (
                        <p className="kmap-group-vars">
                          保留：{group.kept} · 消去：{group.dropped}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="kmap-side-card">
                    <p>没有 1，F=0。</p>
                  </div>
                )}
              </div>
            )}
            {step >= 2 && result.groups.length > 0 && (
              <div className="kmap-var-table">
                <div className="kmap-var-head">
                  <span>圈</span>
                  <span>保留</span>
                  <span>消去</span>
                </div>
                {result.groups.map((group) => (
                  <div className="kmap-var-row" key={group.cells.join('-')}>
                    <span>
                      <MathText text={`$${group.termLatex}$`} />
                    </span>
                    <span>{group.kept}</span>
                    <span>{group.dropped}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
