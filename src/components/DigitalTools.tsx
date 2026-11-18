import { useState } from 'react'
import { Binary, Grid3X3, RotateCcw, Waves } from 'lucide-react'
import { KarnaughTool } from './KarnaughTool'
import { NumberSystemTool } from './NumberSystemTool'
import { Modal } from './ui'

type DigitalTool = 'number' | 'kmap' | 'wave'

export function DigitalMentorTools() {
  const [tool, setTool] = useState<DigitalTool | null>(null)

  return (
    <>
      <div className="digital-tools-bar">
        <span className="digital-tools-label">数电工具</span>
        <div className="digital-tools-actions">
          <button className="digital-tool-button" onClick={() => setTool('number')}>
            <Binary size={14} />
            数制/补码
          </button>
          <button className="digital-tool-button" onClick={() => setTool('kmap')}>
            <Grid3X3 size={14} />
            卡诺图
          </button>
          <button className="digital-tool-button" onClick={() => setTool('wave')}>
            <Waves size={14} />
            时序波形
          </button>
        </div>
      </div>

      <NumberSystemTool open={tool === 'number'} onClose={() => setTool(null)} />
      <KarnaughTool open={tool === 'kmap'} onClose={() => setTool(null)} />
      <WaveformTool open={tool === 'wave'} onClose={() => setTool(null)} />
    </>
  )
}

interface WaveSignal {
  name: string
  values: number[]
  color: string
  clock?: boolean
}

const WAVE_CYCLES = 6
const WAVE_DEFAULT = [1, 0, 1, 1, 0, 1]
const COUNTER_STATES = ['00', '01', '10', '11', '00', '01']

function Waveform({
  signals,
  cursor,
}: {
  signals: WaveSignal[]
  cursor: number
}) {
  const left = 54
  const plotWidth = 540
  const rowHeight = 38
  const top = 16
  const height = top + signals.length * rowHeight + 10
  const cycleWidth = plotWidth / WAVE_CYCLES

  return (
    <div className="wave-scroll">
      <svg
        className="wave-svg"
        viewBox={`0 0 ${left + plotWidth + 10} ${height}`}
        role="img"
        aria-label="时序波形"
      >
        {Array.from({ length: WAVE_CYCLES + 1 }, (_, index) => (
          <line
            key={index}
            className="wave-grid"
            x1={left + index * cycleWidth}
            y1={top}
            x2={left + index * cycleWidth}
            y2={height - 10}
          />
        ))}
        {signals.map((signal, index) => {
          const yHigh = top + index * rowHeight + 9
          const yLow = top + index * rowHeight + rowHeight - 11
          const values = signal.clock
            ? Array.from({ length: WAVE_CYCLES * 2 }, (_, item) => (item % 2 === 0 ? 1 : 0))
            : signal.values
          const cellWidth = signal.clock ? cycleWidth / 2 : cycleWidth
          const path = values
            .map((value, item) => {
              const x1 = left + item * cellWidth
              const x2 = left + (item + 1) * cellWidth
              const y = value ? yHigh : yLow
              return `${item === 0 ? 'M' : 'L'} ${x1} ${y} L ${x2} ${y}`
            })
            .join(' ')
          return (
            <g key={signal.name}>
              <text className="wave-label" x={8} y={(yHigh + yLow) / 2 + 4}>
                {signal.name}
              </text>
              <line className="wave-base" x1={left} y1={yLow + 4} x2={left + plotWidth} y2={yLow + 4} />
              <path className="wave-line" d={path} style={{ stroke: signal.color }} />
            </g>
          )
        })}
        <line
          className="wave-cursor"
          x1={left + cursor * cycleWidth}
          y1={top}
          x2={left + cursor * cycleWidth}
          y2={height - 10}
        />
      </svg>
    </div>
  )
}

function WaveformTool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'dff' | 'counter'>('dff')
  const [dInputs, setDInputs] = useState<number[]>(WAVE_DEFAULT)
  const [cursor, setCursor] = useState(0)

  const toggleD = (index: number) => {
    setDInputs((current) => current.map((value, item) => (item === index ? 1 - value : value)))
  }

  const reset = () => setCursor(0)

  const dffSignals: WaveSignal[] = [
    { name: 'CLK', values: [], color: 'var(--gold)', clock: true },
    { name: 'D', values: dInputs, color: '#4a7db5' },
    { name: 'Q', values: dInputs, color: 'var(--jade)' },
  ]
  const counterQ1 = [0, 0, 1, 1, 0, 0]
  const counterQ0 = [0, 1, 0, 1, 0, 1]
  const counterSignals: WaveSignal[] = [
    { name: 'CLK', values: [], color: 'var(--gold)', clock: true },
    { name: 'Q1', values: counterQ1, color: 'var(--jade)' },
    { name: 'Q0', values: counterQ0, color: '#4a7db5' },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="数电工具"
      title="时序逻辑波形演示"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="digital-footnote">理想波形，未显示建立/保持时间和门延迟。</span>
          <button className="button button-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      }
    >
      <div className="digital-tool">
        <div className="wave-tabs">
          <button
            className={mode === 'dff' ? 'is-active' : ''}
            onClick={() => {
              setMode('dff')
              reset()
            }}
          >
            D 触发器
          </button>
          <button
            className={mode === 'counter' ? 'is-active' : ''}
            onClick={() => {
              setMode('counter')
              reset()
            }}
          >
            2 位计数器
          </button>
        </div>

        {mode === 'dff' ? (
          <>
            <p className="digital-tool-intro">
              Q 只在时钟上升沿更新；上升沿前 Q 是旧值，上升沿后 Q = D。点击下方 0/1 可改 D 序列。
            </p>
            <div className="wave-d-inputs">
              <span>D 输入</span>
              {dInputs.map((value, index) => (
                <button
                  key={index}
                  className={`wave-bit ${value ? 'is-one' : ''}`}
                  onClick={() => toggleD(index)}
                  aria-label={`切换第 ${index + 1} 个周期的 D`}
                >
                  {value}
                </button>
              ))}
            </div>
            <Waveform signals={dffSignals} cursor={cursor} />
            <div className="wave-table-wrap">
              <table className="wave-table">
                <thead>
                  <tr>
                    <th>边沿</th>
                    <th>D</th>
                    <th>Q 前</th>
                    <th>Q 后</th>
                  </tr>
                </thead>
                <tbody>
                  {dInputs.map((value, index) => {
                    const before = index === 0 ? 0 : dInputs[index - 1]
                    return (
                      <tr
                        key={index}
                        className={
                          index < cursor
                            ? index === cursor - 1
                              ? 'is-applied is-current'
                              : 'is-applied'
                            : 'is-future'
                        }
                      >
                        <td>{index + 1}</td>
                        <td>{value}</td>
                        <td>{before}</td>
                        <td>{value}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <p className="digital-tool-intro">
              2 位同步计数器每个上升沿加 1：00 → 01 → 10 → 11 → 00。观察 Q1/Q0 的翻转时序。
            </p>
            <Waveform signals={counterSignals} cursor={cursor} />
            <div className="wave-table-wrap">
              <table className="wave-table">
                <thead>
                  <tr>
                    <th>边沿</th>
                    <th>Q1</th>
                    <th>Q0</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {COUNTER_STATES.map((state, index) => (
                    <tr
                      key={index}
                      className={
                        index < cursor
                          ? index === cursor - 1
                            ? 'is-applied is-current'
                            : 'is-applied'
                          : 'is-future'
                      }
                    >
                      <td>{index + 1}</td>
                      <td>{counterQ1[index]}</td>
                      <td>{counterQ0[index]}</td>
                      <td>{state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="wave-controls">
          <button
            className="button button-ghost"
            onClick={() => setCursor((current) => Math.max(0, current - 1))}
            disabled={cursor === 0}
          >
            上一边沿
          </button>
          <button
            className="button button-primary"
            onClick={() => setCursor((current) => Math.min(WAVE_CYCLES, current + 1))}
            disabled={cursor === WAVE_CYCLES}
          >
            下一个时钟沿
          </button>
          <button className="text-button" onClick={reset}>
            <RotateCcw size={13} />
            重置
          </button>
        </div>
      </div>
    </Modal>
  )
}
