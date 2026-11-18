import { useState } from 'react'
import { Modal } from './ui'

type Width = 4 | 8 | 16
type InputMode = 'dec' | 'bin' | 'oct' | 'hex'

function groupBits(binary: string) {
  return binary.replace(/(.{4})(?=.)/g, '$1 ')
}

function buildNumberResult(value: number, width: Width) {
  const modulus = 1n << BigInt(width)
  const signed = BigInt(value)
  const unsigned = ((signed % modulus) + modulus) % modulus
  const bin = unsigned.toString(2).padStart(width, '0')
  const abs = BigInt(Math.abs(value))
  const absRaw = abs.toString(2)
  const magnitudeFits = absRaw.length <= width - 1
  const absBin = absRaw.padStart(width - 1, '0')
  const signMag =
    value < 0
      ? magnitudeFits
        ? `1${absBin}`
        : null
      : bin
  const ones =
    value < 0
      ? magnitudeFits
        ? `1${absBin.split('').map((bit) => (bit === '0' ? '1' : '0')).join('')}`
        : null
      : bin
  const twos = bin
  const hex = unsigned.toString(16).toUpperCase().padStart(Math.ceil(width / 4), '0')
  const oct = unsigned.toString(8)

  const steps = value < 0
    ? [
        {
          title: '取绝对值',
          detail: `|-${Math.abs(value)}| = ${Math.abs(value)}，转成 ${width - 1} 位二进制`,
          value: groupBits(absBin),
        },
        {
          title: '原码',
          detail: magnitudeFits ? '符号位 1 + 数值位' : `数值位放不下 ${width - 1} 位，原码溢出`,
          value: signMag ? groupBits(signMag) : '—',
        },
        {
          title: '反码',
          detail: magnitudeFits ? '符号位不变，数值位取反' : '原码溢出，反码也无法表示',
          value: ones ? groupBits(ones) : '—',
        },
        {
          title: '补码',
          detail: '反码 + 1（等价于 2 的 n 次方 + 负数）',
          value: groupBits(twos),
        },
      ]
    : [
        {
          title: '转二进制',
          detail: '除 2 取余，补足位宽',
          value: groupBits(bin),
        },
        {
          title: '原码 / 反码 / 补码',
          detail: '正数三者相同，最高位符号位为 0',
          value: groupBits(bin),
        },
      ]

  return { bin, hex, oct, signMag, ones, twos, steps }
}

function parseNumberInput(raw: string, mode: InputMode, width: Width) {
  const clean = raw.trim().replace(/[\s_]/g, '')
  if (!clean) return { value: null as number | null, error: '请输入一个值。' }

  if (mode === 'dec') {
    if (!/^-?\d+$/.test(clean)) return { value: null, error: '请输入十进制整数。' }
    const value = Number(clean)
    if (!Number.isSafeInteger(value)) return { value: null, error: '数值太大，换一个小一点的数。' }
    return { value, error: null }
  }

  const label = mode === 'bin' ? '二进制' : mode === 'oct' ? '八进制' : '十六进制'
  const maxLength = mode === 'bin' ? width : mode === 'oct' ? Math.ceil(width / 3) : Math.ceil(width / 4)
  if (mode === 'bin' && !/^[01]+$/.test(clean)) {
    return { value: null, error: '二进制只能包含 0 和 1。' }
  }
  if (mode === 'oct' && !/^[0-7]+$/.test(clean)) {
    return { value: null, error: '八进制只能包含 0-7。' }
  }
  if (mode === 'hex' && !/^[0-9a-f]+$/i.test(clean)) {
    return { value: null, error: '十六进制只能包含 0-9 / A-F。' }
  }
  if (clean.length > maxLength) {
    return {
      value: null,
      error: `${label}位数不能超过 ${maxLength} 位（${width} 位宽）。`,
    }
  }

  const unsigned =
    mode === 'bin' ? BigInt(`0b${clean}`) : mode === 'oct' ? BigInt(`0o${clean}`) : BigInt(`0x${clean}`)
  if (unsigned >= 1n << BigInt(width)) {
    return { value: null, error: `${label}数值超出 ${width} 位位宽。` }
  }
  const signBit = 1n << BigInt(width - 1)
  const signed = unsigned >= signBit ? unsigned - (1n << BigInt(width)) : unsigned
  return { value: Number(signed), error: null }
}

function formatNumberInput(value: number, mode: InputMode, width: Width) {
  if (mode === 'dec') return String(value)
  const result = buildNumberResult(value, width)
  return mode === 'bin' ? result.bin : mode === 'oct' ? result.oct : result.hex
}

export function NumberSystemTool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [raw, setRaw] = useState('-13')
  const [width, setWidth] = useState<Width>(8)
  const [inputMode, setInputMode] = useState<InputMode>('dec')
  const parsed = parseNumberInput(raw, inputMode, width)
  const min = -(2 ** (width - 1))
  const max = 2 ** (width - 1) - 1
  const inRange = parsed.value !== null && parsed.value >= min && parsed.value <= max
  const result = inRange && parsed.value !== null ? buildNumberResult(parsed.value, width) : null
  const presets =
    width === 4 ? [-8, -1, 0, 5, 7] : width === 8 ? [-13, -1, 0, 5, 127] : [-13, -1, 0, 5, 32767]

  const choosePreset = (value: number) => {
    setInputMode('dec')
    setRaw(String(value))
  }

  const changeMode = (mode: InputMode) => {
    if (mode === inputMode) return
    if (parsed.value !== null && parsed.value >= min && parsed.value <= max) {
      setRaw(formatNumberInput(parsed.value, mode, width))
    } else {
      setRaw('')
    }
    setInputMode(mode)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="数电工具"
      title="数制转换与补码计算"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="digital-footnote">
            {width} 位有符号范围 {min} ~ {max}；补码 = 反码 + 1。
          </span>
          <button className="button button-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      }
    >
      <div className="digital-tool">
        <p className="digital-tool-intro">
          支持十进制/二进制/八进制/十六进制输入；负数会展示原码、反码、补码推导。二进制、八进制与十六进制按当前位宽解释。
        </p>
        <div className="digital-form-row">
          <label className="digital-field">
            <span>输入进制</span>
            <select
              value={inputMode}
              onChange={(event) => changeMode(event.target.value as InputMode)}
            >
              <option value="dec">十进制</option>
              <option value="bin">二进制</option>
              <option value="oct">八进制</option>
              <option value="hex">十六进制</option>
            </select>
          </label>
          <label className="digital-field">
            <span>输入值</span>
            <input
              type="text"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder={
                inputMode === 'dec'
                  ? '例如 -13'
                  : inputMode === 'bin'
                    ? '例如 11110011'
                    : inputMode === 'oct'
                      ? '例如 363'
                      : '例如 F3'
              }
              inputMode={inputMode === 'dec' ? 'numeric' : 'text'}
              spellCheck={false}
            />
          </label>
          <label className="digital-field">
            <span>位宽</span>
            <select
              value={width}
              onChange={(event) => setWidth(Number(event.target.value) as Width)}
            >
              <option value={4}>4 位</option>
              <option value={8}>8 位</option>
              <option value={16}>16 位</option>
            </select>
          </label>
          <div className="digital-presets">
            {presets.map((item) => (
              <button key={item} className="digital-preset" onClick={() => choosePreset(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <p className="digital-hint">
          二进制/八进制/十六进制按当前位宽解释；最高位为 1 时按补码显示为负数。可输入空格或下划线。
        </p>

        {parsed.error ? (
          <p className="digital-warning">{parsed.error}</p>
        ) : !inRange ? (
          <p className="digital-warning">
            超出 {width} 位有符号范围（{min} ~ {max}），请换一个数或加宽位宽。
          </p>
        ) : (
          result &&
          parsed.value !== null && (
            <>
              <div className="digital-result-grid">
                <div className="digital-result-card">
                  <span>十进制</span>
                  <strong>{parsed.value}</strong>
                </div>
                <div className="digital-result-card">
                  <span>{parsed.value < 0 ? '二进制（补码）' : '二进制'}</span>
                  <code>{groupBits(result.bin)}</code>
                </div>
                <div className="digital-result-card">
                  <span>八进制</span>
                  <code>{result.oct}</code>
                </div>
                <div className="digital-result-card">
                  <span>十六进制</span>
                  <code>{result.hex}</code>
                </div>
                <div className="digital-result-card">
                  <span>原码</span>
                  <code>{result.signMag ? groupBits(result.signMag) : '—'}</code>
                </div>
                <div className="digital-result-card">
                  <span>反码</span>
                  <code>{result.ones ? groupBits(result.ones) : '—'}</code>
                </div>
                <div className="digital-result-card">
                  <span>补码</span>
                  <code>{groupBits(result.twos)}</code>
                </div>
              </div>

              <div className="digital-step-list">
                {result.steps.map((step, index) => (
                  <div className="digital-step" key={step.title}>
                    <span className="digital-step-index">{index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.detail}</p>
                    </div>
                    <code>{step.value}</code>
                  </div>
                ))}
              </div>

              {!result.signMag && (
                <p className="digital-warning">
                  这个最小负数只能可靠地用补码表示；原码/反码的数值位会溢出。
                </p>
              )}
            </>
          )
        )}
      </div>
    </Modal>
  )
}
