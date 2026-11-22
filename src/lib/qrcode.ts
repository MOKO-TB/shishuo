/**
 * 轻量纯 TypeScript QR 码生成器（ISO 18004 Byte 模式，纠错等级 M，支持 Version 1–10）。
 * 零外部依赖，用于教师端「本节提问墙」离线生成可扫码矢量二维码。
 */

interface QrVersionSpec {
  version: number
  size: number
  dataCodewords: number
  ecPerBlock: number
  blocks: Array<{ count: number; dataCount: number }>
  alignment: number[]
}

const VERSION_SPECS: QrVersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 16, ecPerBlock: 10, blocks: [{ count: 1, dataCount: 16 }], alignment: [] },
  { version: 2, size: 25, dataCodewords: 28, ecPerBlock: 16, blocks: [{ count: 1, dataCount: 28 }], alignment: [6, 18] },
  { version: 3, size: 29, dataCodewords: 44, ecPerBlock: 26, blocks: [{ count: 1, dataCount: 44 }], alignment: [6, 22] },
  { version: 4, size: 33, dataCodewords: 64, ecPerBlock: 18, blocks: [{ count: 2, dataCount: 32 }], alignment: [6, 26] },
  { version: 5, size: 37, dataCodewords: 86, ecPerBlock: 24, blocks: [{ count: 2, dataCount: 43 }], alignment: [6, 30] },
  { version: 6, size: 41, dataCodewords: 108, ecPerBlock: 16, blocks: [{ count: 4, dataCount: 27 }], alignment: [6, 34] },
  { version: 7, size: 45, dataCodewords: 124, ecPerBlock: 18, blocks: [{ count: 4, dataCount: 31 }], alignment: [6, 22, 38] },
  { version: 8, size: 49, dataCodewords: 154, ecPerBlock: 22, blocks: [{ count: 2, dataCount: 38 }, { count: 2, dataCount: 39 }], alignment: [6, 24, 42] },
  { version: 9, size: 53, dataCodewords: 182, ecPerBlock: 22, blocks: [{ count: 3, dataCount: 36 }, { count: 2, dataCount: 37 }], alignment: [6, 26, 46] },
  { version: 10, size: 57, dataCodewords: 216, ecPerBlock: 26, blocks: [{ count: 4, dataCount: 43 }, { count: 1, dataCount: 44 }], alignment: [6, 28, 50] },
]

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
{
  let value = 1
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = value
    GF_LOG[value] = i
    value <<= 1
    if (value & 0x100) value ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255]
  }
}

function gfMul(a: number, b: number) {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

function rsGeneratorPoly(degree: number) {
  let poly = [1]
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0)
    const root = GF_EXP[i]
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], root)
    }
    poly = next
  }
  return poly
}

function rsRemainder(data: number[], ecLength: number) {
  const gen = rsGeneratorPoly(ecLength)
  const buf = [...data, ...new Array<number>(ecLength).fill(0)]
  for (let i = 0; i < data.length; i += 1) {
    const factor = buf[i]
    if (factor === 0) continue
    for (let j = 0; j < gen.length; j += 1) {
      buf[i + j] ^= gfMul(gen[j], factor)
    }
  }
  return buf.slice(data.length)
}

function appendBits(target: number[], value: number, bitCount: number) {
  for (let i = bitCount - 1; i >= 0; i -= 1) {
    target.push((value >>> i) & 1)
  }
}

function encodeDataCodewords(bytes: Uint8Array, spec: QrVersionSpec) {
  const bits: number[] = []
  const countBits = spec.version >= 10 ? 16 : 8
  appendBits(bits, 0b0100, 4) // Byte mode
  appendBits(bits, bytes.length, countBits)
  for (const byte of bytes) appendBits(bits, byte, 8)

  const capacityBits = spec.dataCodewords * 8
  const terminator = Math.min(4, capacityBits - bits.length)
  for (let i = 0; i < terminator; i += 1) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i + b]
    codewords.push(byte)
  }
  const pads = [0xec, 0x11]
  let padIdx = 0
  while (codewords.length < spec.dataCodewords) {
    codewords.push(pads[padIdx % 2])
    padIdx += 1
  }
  return codewords
}

function interleaveCodewords(dataCodewords: number[], spec: QrVersionSpec) {
  const dataBlocks: number[][] = []
  const ecBlocks: number[][] = []
  let offset = 0
  for (const group of spec.blocks) {
    for (let i = 0; i < group.count; i += 1) {
      const slice = dataCodewords.slice(offset, offset + group.dataCount)
      offset += group.dataCount
      dataBlocks.push(slice)
      ecBlocks.push(rsRemainder(slice, spec.ecPerBlock))
    }
  }

  const out: number[] = []
  const maxDataLen = Math.max(...dataBlocks.map((block) => block.length))
  for (let i = 0; i < maxDataLen; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) out.push(block[i])
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of ecBlocks) {
      if (i < block.length) out.push(block[i])
    }
  }
  return out
}

function bchFormatBits(ecLevelBits: number, mask: number) {
  const data = (ecLevelBits << 3) | mask
  let rem = data << 10
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10)
  }
  return ((data << 10) | rem) ^ 0x5412
}

function bchVersionBits(version: number) {
  let rem = version << 12
  for (let i = 17; i >= 12; i -= 1) {
    if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12)
  }
  return (version << 12) | rem
}

function buildFunctionGrid(spec: QrVersionSpec) {
  const n = spec.size
  const modules = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const isFunction = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))

  const setFn = (row: number, col: number, dark: boolean) => {
    if (row < 0 || col < 0 || row >= n || col >= n) return
    modules[row][col] = dark
    isFunction[row][col] = true
  }

  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = top + r
        const cc = left + c
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue
        const inBox = r >= 0 && r <= 6 && c >= 0 && c <= 6
        const dark =
          inBox &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
        setFn(rr, cc, dark)
      }
    }
  }

  drawFinder(0, 0)
  drawFinder(0, n - 7)
  drawFinder(n - 7, 0)

  // Alignment patterns
  const pos = spec.alignment
  for (const rCenter of pos) {
    for (const cCenter of pos) {
      const overlapsCorner =
        (rCenter <= 8 && cCenter <= 8) ||
        (rCenter <= 8 && cCenter >= n - 9) ||
        (rCenter >= n - 9 && cCenter <= 8)
      if (overlapsCorner) continue
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const dark = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)
          setFn(rCenter + r, cCenter + c, dark)
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < n - 8; i += 1) {
    const dark = i % 2 === 0
    if (!isFunction[6][i]) setFn(6, i, dark)
    if (!isFunction[i][6]) setFn(i, 6, dark)
  }

  // Dark module & reserve format info areas
  setFn(4 * spec.version + 9, 8, true)
  for (let i = 0; i <= 8; i += 1) {
    if (!isFunction[8][i]) setFn(8, i, false)
    if (!isFunction[i][8]) setFn(i, 8, false)
    if (i < 8) {
      if (!isFunction[8][n - 1 - i]) setFn(8, n - 1 - i, false)
      if (!isFunction[n - 1 - i][8]) setFn(n - 1 - i, 8, false)
    }
  }

  // Version info for Version >= 7
  if (spec.version >= 7) {
    const bits = bchVersionBits(spec.version)
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) === 1
      const a = Math.floor(i / 3)
      const b = (i % 3) + n - 11
      setFn(a, b, dark)
      setFn(b, a, dark)
    }
  }

  return { modules, isFunction }
}

function drawFormatBits(modules: boolean[][], mask: number) {
  const n = modules.length
  // EC level M = 00
  const bits = bchFormatBits(0b00, mask)
  for (let i = 0; i < 15; i += 1) {
    // 格式信息按高位到低位写入；反序会导致标准扫码器读不出码。
    const dark = ((bits >>> (14 - i)) & 1) === 1
    if (i < 6) modules[8][i] = dark
    else if (i < 8) modules[8][i + 1] = dark
    else modules[8][n - 15 + i] = dark

    if (i < 8) modules[n - 1 - i][8] = dark
    else if (i < 9) modules[7][8] = dark
    else modules[14 - i][8] = dark
  }
}

function maskCondition(mask: number, row: number, col: number) {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0
    case 1:
      return row % 2 === 0
    case 2:
      return col % 3 === 0
    case 3:
      return (row + col) % 3 === 0
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0
  }
}

function penaltyScore(modules: boolean[][]) {
  const n = modules.length
  let score = 0

  // Rule 1: runs of 5+ same color
  for (let r = 0; r < n; r += 1) {
    let runColor = modules[r][0]
    let runLen = 1
    for (let c = 1; c < n; c += 1) {
      if (modules[r][c] === runColor) {
        runLen += 1
        if (runLen === 5) score += 3
        else if (runLen > 5) score += 1
      } else {
        runColor = modules[r][c]
        runLen = 1
      }
    }
  }
  for (let c = 0; c < n; c += 1) {
    let runColor = modules[0][c]
    let runLen = 1
    for (let r = 1; r < n; r += 1) {
      if (modules[r][c] === runColor) {
        runLen += 1
        if (runLen === 5) score += 3
        else if (runLen > 5) score += 1
      } else {
        runColor = modules[r][c]
        runLen = 1
      }
    }
  }

  // Rule 2: 2x2 blocks
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const color = modules[r][c]
      if (
        modules[r][c + 1] === color &&
        modules[r + 1][c] === color &&
        modules[r + 1][c + 1] === color
      ) {
        score += 3
      }
    }
  }

  // Rule 4: dark ratio
  let darkCount = 0
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (modules[r][c]) darkCount += 1
    }
  }
  const k = Math.floor(Math.abs(darkCount * 20 - n * n * 10) / (n * n))
  score += k * 10
  return score
}

/** 将任意文本编码为 QR 二维码布尔矩阵（true 为深色模块）。 */
export function encodeQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text)
  const spec = VERSION_SPECS.find((item) => {
    const headerBytes = item.version >= 10 ? 3 : 2
    return bytes.length + headerBytes <= item.dataCodewords
  })
  if (!spec) {
    throw new Error('二维码内容过长，请缩短链接后再试。')
  }

  const data = encodeDataCodewords(bytes, spec)
  const stream = interleaveCodewords(data, spec)
  const bitStream: number[] = []
  for (const byte of stream) appendBits(bitStream, byte, 8)

  const { modules: base, isFunction } = buildFunctionGrid(spec)
  const n = spec.size

  // Place data bits in zig-zag columns
  let bitIdx = 0
  let upward = true
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < n; vert += 1) {
      const row = upward ? n - 1 - vert : vert
      for (let lr = 0; lr < 2; lr += 1) {
        const col = right - lr
        if (!isFunction[row][col]) {
          base[row][col] = bitIdx < bitStream.length ? bitStream[bitIdx] === 1 : false
          bitIdx += 1
        }
      }
    }
    upward = !upward
  }

  let bestMatrix = base
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = base.map((row) => [...row])
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (!isFunction[r][c] && maskCondition(mask, r, c)) {
          candidate[r][c] = !candidate[r][c]
        }
      }
    }
    drawFormatBits(candidate, mask)
    const score = penaltyScore(candidate)
    if (score < bestScore) {
      bestScore = score
      bestMatrix = candidate
    }
  }

  return bestMatrix
}
