import { useState } from 'react'
import { Modal } from './ui'

type AnalogTool = 'qpoint' | 'signal' | 'feedback'

interface QFields {
  vcc: string
  rb1: string
  rb2: string
  rc: string
  re: string
  beta: string
  ube: string
}

const Q_DEFAULT: QFields = {
  vcc: '12',
  rb1: '100',
  rb2: '33',
  rc: '3',
  re: '1.5',
  beta: '100',
  ube: '0.7',
}

const Q_PRESETS = [
  { label: '12V 分压偏置', fields: Q_DEFAULT },
  {
    label: '9V 低功耗',
    fields: { vcc: '9', rb1: '120', rb2: '47', rc: '2.2', re: '1', beta: '80', ube: '0.7' },
  },
  {
    label: '5V 饱和示例',
    fields: { vcc: '5', rb1: '100', rb2: '100', rc: '1', re: '0.1', beta: '100', ube: '0.7' },
  },
]

function numberValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function format(value: number, digits = 2) {
  if (!Number.isFinite(value)) return '—'
  const fixed = value.toFixed(digits)
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function QPointTool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [fields, setFields] = useState<QFields>(Q_DEFAULT)
  const nums = {
    vcc: numberValue(fields.vcc),
    rb1: numberValue(fields.rb1),
    rb2: numberValue(fields.rb2),
    rc: numberValue(fields.rc),
    re: numberValue(fields.re),
    beta: numberValue(fields.beta),
    ube: numberValue(fields.ube),
  }
  const valid =
    nums.vcc !== null &&
    nums.rb1 !== null &&
    nums.rb2 !== null &&
    nums.rc !== null &&
    nums.re !== null &&
    nums.beta !== null &&
    nums.ube !== null &&
    nums.vcc > 0 &&
    nums.rb1 > 0 &&
    nums.rb2 > 0 &&
    nums.rc >= 0 &&
    nums.re > 0 &&
    nums.beta > 0

  let result:
    | {
        ub: number
        ie: number
        ic: number
        ib: number
        uce: number
        rbe: number
        region: string
        warning: string | null
        loadMax: number
      }
    | null = null

  if (valid) {
    const ub = (nums.vcc! * nums.rb2!) / (nums.rb1! + nums.rb2!)
    const ie = (ub - nums.ube!) / nums.re!
    const ic = (ie * nums.beta!) / (1 + nums.beta!)
    const ib = ie / (1 + nums.beta!)
    const uce = nums.vcc! - ic * nums.rc! - ie * nums.re!
    const rbe = 200 + ((1 + nums.beta!) * 26) / ie
    const region = ie <= 0 || ub <= nums.ube! ? '截止 / 偏置不足' : uce <= 0.3 ? '饱和区' : '放大区'
    const warning =
      ie <= 0 || ub <= nums.ube!
        ? 'U_B ≤ U_BE，发射结没有正偏；检查分压比、R_E 或 U_BE。'
        : uce <= 0.3
          ? 'U_CE ≤ 0.3V，管子进入饱和；这个 Q 点不适合做放大。'
          : null
    result = {
      ub,
      ie,
      ic,
      ib: ib * 1000,
      uce,
      rbe,
      region,
      warning,
      loadMax: nums.vcc! / (nums.rc! + nums.re!),
    }
  }

  const update = (key: keyof QFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }))
  }
  const loadPreset = (preset: (typeof Q_PRESETS)[number]) => setFields(preset.fields)

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="模电工具"
      title="静态工作点计算"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="digital-footnote">
            电阻单位 kΩ，电流自动用 mA / µA；r_be 按 200Ω + (1+β)×26mV/I_EQ 估算。
          </span>
          <button className="button button-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      }
    >
      <div className="digital-tool analog-tool">
        <p className="digital-tool-intro">
          输入分压偏置共射电路参数，自动算 U_B、I_E、I_C、U_CE 和 r_be，并判断管子工作在哪个区。
        </p>
        <div className="digital-presets">
          {Q_PRESETS.map((preset) => (
            <button key={preset.label} className="digital-preset" onClick={() => loadPreset(preset)}>
              {preset.label}
            </button>
          ))}
        </div>
        <div className="digital-form-row">
          <label className="digital-field">
            <span>V_CC (V)</span>
            <input type="number" step="0.1" value={fields.vcc} onChange={(event) => update('vcc', event.target.value)} />
          </label>
          <label className="digital-field">
            <span>R_b1 (kΩ)</span>
            <input type="number" step="1" value={fields.rb1} onChange={(event) => update('rb1', event.target.value)} />
          </label>
          <label className="digital-field">
            <span>R_b2 (kΩ)</span>
            <input type="number" step="1" value={fields.rb2} onChange={(event) => update('rb2', event.target.value)} />
          </label>
          <label className="digital-field">
            <span>R_C (kΩ)</span>
            <input type="number" step="0.1" value={fields.rc} onChange={(event) => update('rc', event.target.value)} />
          </label>
          <label className="digital-field">
            <span>R_E (kΩ)</span>
            <input type="number" step="0.1" value={fields.re} onChange={(event) => update('re', event.target.value)} />
          </label>
          <label className="digital-field">
            <span>β</span>
            <input type="number" step="1" value={fields.beta} onChange={(event) => update('beta', event.target.value)} />
          </label>
          <label className="digital-field">
            <span>U_BE (V)</span>
            <input type="number" step="0.05" value={fields.ube} onChange={(event) => update('ube', event.target.value)} />
          </label>
        </div>

        {!valid ? (
          <p className="digital-warning">请填入有效的正数参数；R_E 必须大于 0。</p>
        ) : (
          result && (
            <>
              <div className="digital-result-grid">
                <div className="digital-result-card">
                  <span>U_B</span>
                  <strong>{format(result.ub)} V</strong>
                </div>
                <div className="digital-result-card">
                  <span>I_E</span>
                  <strong>{format(result.ie, 3)} mA</strong>
                </div>
                <div className="digital-result-card">
                  <span>I_C</span>
                  <strong>{format(result.ic, 3)} mA</strong>
                </div>
                <div className="digital-result-card">
                  <span>I_B</span>
                  <strong>{format(result.ib, 1)} µA</strong>
                </div>
                <div className="digital-result-card">
                  <span>U_CE</span>
                  <strong>{format(result.uce, 3)} V</strong>
                </div>
                <div className="digital-result-card">
                  <span>r_be</span>
                  <strong>{format(result.rbe, 0)} Ω</strong>
                </div>
              </div>

              {result.warning && <p className="digital-warning">{result.warning}</p>}
              <p className="digital-hint">
                工作区判断：{result.region}。U_CE 需要大于 0.3V 才按放大区处理。
              </p>

              <div className="analog-loadline-wrap">
                <svg
                  className="analog-loadline"
                  viewBox="0 0 300 170"
                  role="img"
                  aria-label="共射电路直流负载线示意"
                >
                  <line x1="34" y1="140" x2="286" y2="140" stroke="currentColor" opacity="0.35" />
                  <line x1="34" y1="20" x2="34" y2="140" stroke="currentColor" opacity="0.35" />
                  <line x1="34" y1="20" x2="286" y2="140" stroke="currentColor" opacity="0.65" strokeDasharray="5 4" />
                  <circle
                    cx={34 + Math.min(1, Math.max(0, result.uce / nums.vcc!)) * 252}
                    cy={140 - Math.min(1, Math.max(0, result.ic / result.loadMax)) * 120}
                    r="5"
                    fill="currentColor"
                  />
                  <text x="38" y="155" fontSize="9" fill="currentColor" opacity="0.7">
                    U_CE / V
                  </text>
                  <text x="38" y="16" fontSize="9" fill="currentColor" opacity="0.7">
                    I_C / mA
                  </text>
                  <text x="286" y="155" textAnchor="end" fontSize="9" fill="currentColor" opacity="0.7">
                    V_CC
                  </text>
                  <text
                    x={Math.min(274, 34 + Math.min(1, Math.max(0, result.uce / nums.vcc!)) * 252 + 10)}
                    y={Math.max(30, 136 - Math.min(1, Math.max(0, result.ic / result.loadMax)) * 120)}
                    fontSize="10"
                    fill="currentColor"
                  >
                    Q
                  </text>
                </svg>
                <p className="digital-hint">
                  虚线是直流负载线，斜率为 -1/(R_C+R_E)；Q 点越靠左上，越容易进入饱和。
                </p>
              </div>

              <div className="digital-step-list">
                <div className="digital-step">
                  <span className="digital-step-index">1</span>
                  <div>
                    <strong>分压求 U_B</strong>
                    <p>先忽略基极电流，用 R_b1、R_b2 分压。</p>
                  </div>
                  <code>{format(result.ub, 3)} V</code>
                </div>
                <div className="digital-step">
                  <span className="digital-step-index">2</span>
                  <div>
                    <strong>求 I_E / I_C</strong>
                    <p>按输入的 U_BE 计算，R_E 上的电压是 U_B − U_BE。</p>
                  </div>
                  <code>{format(result.ie, 3)} mA</code>
                </div>
                <div className="digital-step">
                  <span className="digital-step-index">3</span>
                  <div>
                    <strong>回算 U_CE</strong>
                    <p>从 V_CC 依次减去 R_C、R_E 上的压降，回验工作区。</p>
                  </div>
                  <code>{format(result.uce, 3)} V</code>
                </div>
                <div className="digital-step">
                  <span className="digital-step-index">4</span>
                  <div>
                    <strong>估算 r_be</strong>
                    <p>r_be ≈ 200Ω + (1+β)×26mV/I_EQ。</p>
                  </div>
                  <code>{format(result.rbe, 0)} Ω</code>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </Modal>
  )
}

const SIGNAL_DEFAULT = {
  beta: '100',
  ieq: '1',
  rb: '100',
  rc: '3',
  rl: '3',
  re: '1',
}

function SmallSignalTool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [fields, setFields] = useState(SIGNAL_DEFAULT)
  const [unloaded, setUnloaded] = useState(false)
  const [bypassed, setBypassed] = useState(true)
  const nums = {
    beta: numberValue(fields.beta),
    ieq: numberValue(fields.ieq),
    rb: numberValue(fields.rb),
    rc: numberValue(fields.rc),
    rl: numberValue(fields.rl),
    re: numberValue(fields.re),
  }
  const valid =
    nums.beta !== null &&
    nums.ieq !== null &&
    nums.rb !== null &&
    nums.rc !== null &&
    nums.rl !== null &&
    nums.re !== null &&
    nums.beta > 0 &&
    nums.ieq > 0 &&
    nums.rb > 0 &&
    nums.rc > 0 &&
    nums.rl > 0 &&
    nums.re >= 0

  let result:
    | { rbe: number; au: number; ri: number; ro: number; load: number; baseInput: number }
    | null = null
  if (valid) {
    const be = nums.beta!
    const rbe = 200 + ((1 + be) * 26) / nums.ieq!
    const load = unloaded ? nums.rc! : (nums.rc! * nums.rl!) / (nums.rc! + nums.rl!)
    const reOhm = bypassed ? 0 : nums.re! * 1000
    const baseInput = rbe + (1 + be) * reOhm
    const au = (-be * (load * 1000)) / baseInput
    const ri = ((nums.rb! * 1000 * baseInput) / (nums.rb! * 1000 + baseInput)) / 1000
    result = { rbe, au, ri, ro: nums.rc!, load, baseInput }
  }

  const update = (key: keyof typeof SIGNAL_DEFAULT, value: string) => {
    setFields((current) => ({ ...current, [key]: value }))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="模电工具"
      title="共射小信号估算"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="digital-footnote">
            只估算共射、低频、中频段；忽略结电容、Early 效应和负载电容。
          </span>
          <button className="button button-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      }
    >
      <div className="digital-tool analog-tool">
        <p className="digital-tool-intro">
          从 Q 点估算 r_be，再算共射电压增益 A_u、输入电阻 R_i 和输出电阻 R_o；可切换 R_E 是否旁路。
        </p>
        <div className="digital-form-row">
          <label className="digital-field">
            <span>β</span>
            <input type="number" step="1" value={fields.beta} onChange={(event) => update('beta', event.target.value)} />
          </label>
          <label className="digital-field">
            <span>I_EQ (mA)</span>
            <input type="number" step="0.1" value={fields.ieq} onChange={(event) => update('ieq', event.target.value)} />
          </label>
          <label className="digital-field">
            <span>R_b (kΩ)</span>
            <input type="number" step="1" value={fields.rb} onChange={(event) => update('rb', event.target.value)} />
          </label>
          <label className="digital-field">
            <span>R_C (kΩ)</span>
            <input type="number" step="0.1" value={fields.rc} onChange={(event) => update('rc', event.target.value)} />
          </label>
          <label className="digital-field">
            <span>R_L (kΩ)</span>
            <input
              type="number"
              step="0.1"
              value={fields.rl}
              disabled={unloaded}
              onChange={(event) => update('rl', event.target.value)}
            />
          </label>
          <label className="digital-field">
            <span>R_E (kΩ)</span>
            <input type="number" step="0.1" value={fields.re} onChange={(event) => update('re', event.target.value)} />
          </label>
        </div>
        <div className="analog-checks">
          <label className="analog-check">
            <input type="checkbox" checked={bypassed} onChange={(event) => setBypassed(event.target.checked)} />
            R_E 旁路（交流接地）
          </label>
          <label className="analog-check">
            <input type="checkbox" checked={unloaded} onChange={(event) => setUnloaded(event.target.checked)} />
            R_L 空载
          </label>
        </div>

        {!valid ? (
          <p className="digital-warning">请填入有效的正数参数；I_EQ 和 R_C 必须大于 0。</p>
        ) : (
          result && (
            <>
              <div className="digital-result-grid">
                <div className="digital-result-card">
                  <span>r_be</span>
                  <strong>{format(result.rbe, 0)} Ω</strong>
                </div>
                <div className="digital-result-card">
                  <span>A_u</span>
                  <strong>{format(result.au, 1)} 倍</strong>
                </div>
                <div className="digital-result-card">
                  <span>R_i</span>
                  <strong>{format(result.ri, 1)} kΩ</strong>
                </div>
                <div className="digital-result-card">
                  <span>R_o</span>
                  <strong>{format(result.ro, 2)} kΩ</strong>
                </div>
              </div>
              <p className="digital-hint">
                {bypassed
                  ? 'R_E 旁路：交流发射极接地，增益最大，但输入电阻较低。'
                  : 'R_E 未旁路：增益下降，输入电阻提高，偏置更稳定。'}
                {unloaded ? ' 当前按空载计算，R_L 视为开路。' : ''}
              </p>

              <div className="digital-step-list">
                <div className="digital-step">
                  <span className="digital-step-index">1</span>
                  <div>
                    <strong>先算 r_be</strong>
                    <p>r_be ≈ 200Ω + (1+β)×26mV/I_EQ。</p>
                  </div>
                  <code>{format(result.rbe, 0)} Ω</code>
                </div>
                <div className="digital-step">
                  <span className="digital-step-index">2</span>
                  <div>
                    <strong>画交流通路</strong>
                    <p>{bypassed ? 'R_E 被旁路，交流发射极接地。' : 'R_E 未旁路，发射极串入 R_E。'}</p>
                  </div>
                  <code>R_L′={format(result.load, 2)} kΩ</code>
                </div>
                <div className="digital-step">
                  <span className="digital-step-index">3</span>
                  <div>
                    <strong>算电压增益</strong>
                    <p>A_u ≈ −β(R_C∥R_L)/r_be；负号表示反相。</p>
                  </div>
                  <code>{format(result.au, 1)} 倍</code>
                </div>
                <div className="digital-step">
                  <span className="digital-step-index">4</span>
                  <div>
                    <strong>看输入/输出电阻</strong>
                    <p>
                      {bypassed
                        ? 'R_E 旁路：输入电阻是 R_b 与 r_be 的并联，输出电阻约等于 R_C。'
                        : 'R_E 未旁路：输入电阻是 R_b 与 [r_be+(1+β)R_E] 的并联，输出电阻约等于 R_C。'}
                    </p>
                  </div>
                  <code>R_i={format(result.ri, 1)} kΩ</code>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </Modal>
  )
}

type Sampling = 'voltage' | 'current'
type Comparison = 'series' | 'shunt'

const FEEDBACK_OPTIONS: Array<{
  sampling: Sampling
  comparison: Comparison
  label: string
  stable: string
  ri: string
  ro: string
  example: string
}> = [
  {
    sampling: 'voltage',
    comparison: 'series',
    label: '电压串联',
    stable: '稳定输出电压 u_o',
    ri: '输入电阻增大',
    ro: '输出电阻减小',
    example: '反馈信号取自 u_o，并在输入端与 u_i 串联比较。',
  },
  {
    sampling: 'voltage',
    comparison: 'shunt',
    label: '电压并联',
    stable: '稳定输出电压 u_o',
    ri: '输入电阻减小',
    ro: '输出电阻减小',
    example: '反馈信号取自 u_o，并在输入端与输入电流并联比较。',
  },
  {
    sampling: 'current',
    comparison: 'series',
    label: '电流串联',
    stable: '稳定输出电流 i_o',
    ri: '输入电阻增大',
    ro: '输出电阻增大',
    example: '反馈信号取自 i_o，并在输入端与 u_i 串联比较。',
  },
  {
    sampling: 'current',
    comparison: 'shunt',
    label: '电流并联',
    stable: '稳定输出电流 i_o',
    ri: '输入电阻减小',
    ro: '输出电阻增大',
    example: '反馈信号取自 i_o，并在输入端与输入电流并联比较。',
  },
]

function FeedbackTool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sampling, setSampling] = useState<Sampling>('voltage')
  const [comparison, setComparison] = useState<Comparison>('series')
  const selected = FEEDBACK_OPTIONS.find(
    (option) => option.sampling === sampling && option.comparison === comparison,
  )!

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="模电工具"
      title="反馈组态判断"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="digital-footnote">
            先确认是负反馈；正反馈、自激振荡和比较器电路不适用这套电阻变化结论。
          </span>
          <button className="button button-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      }
    >
      <div className="digital-tool analog-tool">
        <p className="digital-tool-intro">
          先看反馈信号取自输出电压还是输出电流，再看输入端是串联还是并联比较；四种组态的影响会同步更新。
        </p>
        <div className="analog-feedback-matrix" role="group" aria-label="选择反馈组态">
          {FEEDBACK_OPTIONS.map((option) => (
            <button
              key={option.label}
              className={`analog-feedback-button ${
                option.sampling === sampling && option.comparison === comparison ? 'is-active' : ''
              }`}
              onClick={() => {
                setSampling(option.sampling)
                setComparison(option.comparison)
              }}
            >
              <strong>{option.label}</strong>
              <span>{option.example}</span>
            </button>
          ))}
        </div>

        <div className="digital-result-grid">
          <div className="digital-result-card">
            <span>组态</span>
            <strong>{selected.label}负反馈</strong>
          </div>
          <div className="digital-result-card">
            <span>稳定量</span>
            <strong>{selected.stable}</strong>
          </div>
          <div className="digital-result-card">
            <span>输入电阻</span>
            <strong>{selected.ri}</strong>
          </div>
          <div className="digital-result-card">
            <span>输出电阻</span>
            <strong>{selected.ro}</strong>
          </div>
        </div>

        <div className="digital-step-list">
          <div className="digital-step">
            <span className="digital-step-index">1</span>
            <div>
              <strong>找反馈支路</strong>
              <p>从输出端连回输入端，确认是负反馈，不是正反馈或自激。</p>
            </div>
            <code>先验极性</code>
          </div>
          <div className="digital-step">
            <span className="digital-step-index">2</span>
            <div>
              <strong>看取样</strong>
              <p>{sampling === 'voltage' ? '反馈信号与输出电压成比例；输出短路后反馈消失。' : '反馈信号与输出电流成比例；输出回路断开后反馈消失。'}</p>
            </div>
            <code>{sampling === 'voltage' ? '电压取样' : '电流取样'}</code>
          </div>
          <div className="digital-step">
            <span className="digital-step-index">3</span>
            <div>
              <strong>看比较</strong>
              <p>{comparison === 'series' ? '反馈信号与输入信号串联，以电压相减。' : '反馈信号与输入信号并接在同一节点，以电流相减。'}</p>
            </div>
            <code>{comparison === 'series' ? '串联比较' : '并联比较'}</code>
          </div>
          <div className="digital-step">
            <span className="digital-step-index">4</span>
            <div>
              <strong>写结论</strong>
              <p>组态决定稳定的是电压还是电流，以及 R_i / R_o 的增减方向。</p>
            </div>
            <code>{selected.ri}；{selected.ro}</code>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function AnalogMentorTools() {
  const [tool, setTool] = useState<AnalogTool | null>(null)

  return (
    <>
      <div className="digital-tools-bar">
        <span className="digital-tools-label">模电工具</span>
        <div className="digital-tools-actions">
          <button className="digital-tool-button" onClick={() => setTool('qpoint')}>
            Q 点计算
          </button>
          <button className="digital-tool-button" onClick={() => setTool('signal')}>
            小信号增益
          </button>
          <button className="digital-tool-button" onClick={() => setTool('feedback')}>
            反馈组态
          </button>
        </div>
      </div>
      <QPointTool open={tool === 'qpoint'} onClose={() => setTool(null)} />
      <SmallSignalTool open={tool === 'signal'} onClose={() => setTool(null)} />
      <FeedbackTool open={tool === 'feedback'} onClose={() => setTool(null)} />
    </>
  )
}
