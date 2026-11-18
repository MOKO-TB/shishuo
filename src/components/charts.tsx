import type { DailyMetric } from '../types'
import { formatWeekday } from '../lib/utils'

export function Donut({
  value,
  label,
  size = 92,
  stroke = 9,
  tone = 'jade',
}: {
  value: number
  label?: string
  size?: number
  stroke?: number
  tone?: 'jade' | 'clay'
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const normalized = Math.min(1, Math.max(0, value))
  return (
    <div className={`donut donut-${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="donut-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="donut-value"
          strokeDasharray={`${normalized * circumference} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="donut-center">
        <strong>{Math.round(normalized * 100)}%</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  )
}

export function StackedBars({ data }: { data: DailyMetric[] }) {
  const max = Math.max(1, ...data.map((entry) => entry.ai + entry.human))
  const lastIndex = data.length - 1
  return (
    <div className="stacked-chart">
      <div className="stacked-legend">
        <span>
          <i className="legend-dot ai" /> AI 自动解决
        </span>
        <span>
          <i className="legend-dot human" /> 转人工
        </span>
      </div>
      <div className="stacked-plot">
        {data.map((entry, index) => {
          const total = entry.ai + entry.human
          const barHeight = Math.max(6, Math.round((total / max) * 158))
          return (
            <div className={`stacked-col ${index === lastIndex ? 'is-today' : ''}`} key={entry.date}>
              <div className="stacked-total">{total}</div>
              <div
                className="stacked-bar"
                style={{ height: `${barHeight}px` }}
                title={`${entry.date}：AI ${entry.ai} 个，转人工 ${entry.human} 个`}
              >
                <span className="stacked-ai" style={{ flexGrow: entry.ai, flexBasis: 0 }} />
                <span className="stacked-human" style={{ flexGrow: entry.human, flexBasis: 0 }} />
              </div>
              <div className="stacked-label">
                {index === lastIndex ? '今天' : `周${formatWeekday(new Date(`${entry.date}T12:00:00`).getTime())}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MiniBars({ values, tone = 'jade' }: { values: number[]; tone?: 'jade' | 'clay' }) {
  const max = Math.max(1, ...values)
  return (
    <div className={`mini-bars mini-bars-${tone}`} aria-hidden="true">
      {values.map((value, index) => (
        <span key={index} style={{ height: `${Math.max(12, (value / max) * 100)}%` }} />
      ))}
    </div>
  )
}
