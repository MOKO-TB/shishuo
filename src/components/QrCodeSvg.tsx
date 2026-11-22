import { useMemo } from 'react'
import { encodeQrMatrix } from '../lib/qrcode'

interface QrCodeSvgProps {
  value: string
  size?: number
  label?: string
}

/** 轻量 SVG 二维码组件，保证浅色/深色模式下均有高对比白底静区。 */
export function QrCodeSvg({ value, size = 168, label = '扫码进入本节提问墙' }: QrCodeSvgProps) {
  const { modules, count } = useMemo(() => {
    try {
      const matrix = encodeQrMatrix(value)
      return { modules: matrix, count: matrix.length }
    } catch {
      return { modules: null, count: 0 }
    }
  }, [value])

  if (!modules) {
    return (
      <div className="qr-fallback" style={{ width: size, height: size }}>
        链接过长，请使用下方复制链接
      </div>
    )
  }

  const quiet = 4
  const viewSize = count + quiet * 2
  const paths: string[] = []
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (modules[r][c]) {
        paths.push(`M${c + quiet},${r + quiet}h1v1h-1z`)
      }
    }
  }

  return (
    <svg
      className="qr-svg"
      width={size}
      height={size}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={viewSize} height={viewSize} fill="#ffffff" />
      <path d={paths.join('')} fill="#17241e" />
    </svg>
  )
}
