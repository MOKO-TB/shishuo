export type AvatarMood = 'idle' | 'thinking' | 'answering' | 'happy' | 'notice'

interface Vec2 {
  x: number
  y: number
}

interface PoseRigProfile {
  /** 角色头颈中心（UV 0..1） */
  neck: Vec2
  /** 左/右狼耳旋转枢轴 */
  earL: Vec2
  earR: Vec2
  /** 左/右长发下摆物理中心 */
  hairL: Vec2
  hairR: Vec2
  /** 左/右肢体（魔杖/书本/手势）枢轴 */
  armL: Vec2
  armR: Vec2
  /** 尾巴根部枢轴 */
  tailRoot: Vec2
  /** 尾巴影响半径 */
  tailRadius: Vec2
  /** 头顶书本中心 */
  bookCenter: Vec2
  /** 脚底锚定起始 Y（站姿落地用） */
  footAnchorY: number
  /** 是否开启眨眼帧混合 */
  hasBlink: boolean
  /** 是否开启说话嘴型帧混合 */
  hasMouth: boolean
}

export const RIG_PROFILES: Record<AvatarMood, PoseRigProfile> = {
  idle: {
    neck: { x: 0.5, y: 0.5 },
    earL: { x: 0.35, y: 0.25 },
    earR: { x: 0.65, y: 0.25 },
    hairL: { x: 0.28, y: 0.64 },
    hairR: { x: 0.72, y: 0.64 },
    armL: { x: 0.34, y: 0.6 },
    armR: { x: 0.66, y: 0.6 },
    tailRoot: { x: 0.59, y: 0.78 },
    tailRadius: { x: 0.22, y: 0.16 },
    bookCenter: { x: 0.5, y: 0.13 },
    footAnchorY: 0.87,
    hasBlink: true,
    hasMouth: false,
  },
  thinking: {
    neck: { x: 0.41, y: 0.5 },
    earL: { x: 0.28, y: 0.24 },
    earR: { x: 0.56, y: 0.24 },
    hairL: { x: 0.24, y: 0.62 },
    hairR: { x: 0.62, y: 0.64 },
    armL: { x: 0.34, y: 0.64 },
    armR: { x: 0.49, y: 0.66 },
    tailRoot: { x: 0.66, y: 0.74 },
    tailRadius: { x: 0.27, y: 0.24 },
    bookCenter: { x: 0.45, y: 0.13 },
    footAnchorY: 0.92,
    hasBlink: true,
    hasMouth: false,
  },
  answering: {
    neck: { x: 0.55, y: 0.5 },
    earL: { x: 0.4, y: 0.25 },
    earR: { x: 0.69, y: 0.25 },
    hairL: { x: 0.34, y: 0.64 },
    hairR: { x: 0.75, y: 0.64 },
    armL: { x: 0.34, y: 0.56 },
    armR: { x: 0.72, y: 0.58 },
    tailRoot: { x: 0.64, y: 0.78 },
    tailRadius: { x: 0.22, y: 0.16 },
    bookCenter: { x: 0.54, y: 0.13 },
    footAnchorY: 0.87,
    hasBlink: true,
    hasMouth: true,
  },
  happy: {
    neck: { x: 0.5, y: 0.5 },
    earL: { x: 0.35, y: 0.25 },
    earR: { x: 0.65, y: 0.25 },
    hairL: { x: 0.28, y: 0.64 },
    hairR: { x: 0.72, y: 0.64 },
    armL: { x: 0.35, y: 0.56 },
    armR: { x: 0.65, y: 0.56 },
    tailRoot: { x: 0.59, y: 0.78 },
    tailRadius: { x: 0.22, y: 0.16 },
    bookCenter: { x: 0.5, y: 0.13 },
    footAnchorY: 0.87,
    hasBlink: false,
    hasMouth: false,
  },
  notice: {
    neck: { x: 0.5, y: 0.5 },
    earL: { x: 0.35, y: 0.25 },
    earR: { x: 0.65, y: 0.25 },
    hairL: { x: 0.28, y: 0.64 },
    hairR: { x: 0.72, y: 0.64 },
    armL: { x: 0.36, y: 0.55 },
    armR: { x: 0.65, y: 0.6 },
    tailRoot: { x: 0.59, y: 0.78 },
    tailRadius: { x: 0.22, y: 0.16 },
    bookCenter: { x: 0.5, y: 0.13 },
    footAnchorY: 0.87,
    hasBlink: true,
    hasMouth: false,
  },
}

const VERT_SRC = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}
`

const FRAG_SRC = `
precision mediump float;
uniform sampler2D u_base;
uniform sampler2D u_blink;
uniform sampler2D u_mouth;
uniform float u_blinkMix;
uniform float u_mouthMix;
varying vec2 v_uv;

vec4 over(vec4 fg, vec4 bg) {
  float outA = fg.a + bg.a * (1.0 - fg.a);
  if (outA < 0.001) return vec4(0.0);
  vec3 outRgb = (fg.rgb * fg.a + bg.rgb * bg.a * (1.0 - fg.a)) / outA;
  return vec4(outRgb, outA);
}

void main() {
  vec4 baseCol = texture2D(u_base, v_uv);
  vec4 col = baseCol;
  if (u_blinkMix > 0.01) {
    vec4 bCol = texture2D(u_blink, v_uv);
    bCol.a *= u_blinkMix;
    col = over(bCol, col);
  }
  if (u_mouthMix > 0.01) {
    vec4 mCol = texture2D(u_mouth, v_uv);
    mCol.a *= u_mouthMix;
    col = over(mCol, col);
  }
  gl_FragColor = vec4(col.rgb * col.a, col.a);
}
`

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function gaussian2D(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  const dx = (x - cx) / rx
  const dy = (y - cy) / ry
  return Math.exp(-(dx * dx + dy * dy))
}

function rotateAround(x: number, y: number, px: number, py: number, angle: number, weight: number): Vec2 {
  if (Math.abs(angle * weight) < 1e-6) return { x, y }
  const a = angle * weight
  const c = Math.cos(a)
  const s = Math.sin(a)
  const dx = x - px
  const dy = y - py
  return {
    x: px + dx * c - dy * s,
    y: py + dx * s + dy * c,
  }
}

export interface RigState {
  mood: AvatarMood
  pointerX: number // -1..1
  pointerY: number // -1..1
}

/** 轻量 WebGL1 2D 骨骼网格驱动器：实现分部件摆动、呼吸、物理跟随与眨眼/说话帧混合。 */
export class AvatarMeshRig {
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private posBuffer: WebGLBuffer
  private uvBuffer: WebGLBuffer
  private indexBuffer: WebGLBuffer
  private gridN = 28
  private basePos: Float32Array
  private deformedPos: Float32Array
  private indexCount = 0
  private textures = new Map<string, WebGLTexture>()
  private emptyTex: WebGLTexture
  private uBaseLoc: WebGLUniformLocation | null
  private uBlinkLoc: WebGLUniformLocation | null
  private uMouthLoc: WebGLUniformLocation | null
  private uBlinkMixLoc: WebGLUniformLocation | null
  private uMouthMixLoc: WebGLUniformLocation | null
  private aPosLoc: number
  private aUvLoc: number
  private disposed = false

  // 平滑物理状态
  private curLookX = 0
  private curLookY = 0
  private prevHeadAngle = 0
  private hairPhaseOffset = 0
  private bookLagAngle = 0
  private nextBlinkAt = 2.4
  private blinkProgress = -1
  private nextEarAt = 3.2
  private earSide: -1 | 1 = 1

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: false,
    })
    if (!gl) throw new Error('WebGL unavailable')
    this.gl = gl

    const vs = this.compileShader(gl.VERTEX_SHADER, VERT_SRC)
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAG_SRC)
    const program = gl.createProgram()
    if (!program) throw new Error('Failed to create WebGL program')
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Program link failed')
    }
    this.program = program
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    this.aPosLoc = gl.getAttribLocation(program, 'a_pos')
    this.aUvLoc = gl.getAttribLocation(program, 'a_uv')
    this.uBaseLoc = gl.getUniformLocation(program, 'u_base')
    this.uBlinkLoc = gl.getUniformLocation(program, 'u_blink')
    this.uMouthLoc = gl.getUniformLocation(program, 'u_mouth')
    this.uBlinkMixLoc = gl.getUniformLocation(program, 'u_blinkMix')
    this.uMouthMixLoc = gl.getUniformLocation(program, 'u_mouthMix')

    const N = this.gridN
    const vertCount = (N + 1) * (N + 1)
    this.basePos = new Float32Array(vertCount * 2)
    this.deformedPos = new Float32Array(vertCount * 2)
    const uvs = new Float32Array(vertCount * 2)

    let ptr = 0
    for (let j = 0; j <= N; j += 1) {
      const v = j / N
      for (let i = 0; i <= N; i += 1) {
        const u = i / N
        this.basePos[ptr] = u
        this.basePos[ptr + 1] = v
        uvs[ptr] = u
        uvs[ptr + 1] = v
        ptr += 2
      }
    }
    this.deformedPos.set(this.basePos)

    const indices = new Uint16Array(N * N * 6)
    let k = 0
    for (let j = 0; j < N; j += 1) {
      for (let i = 0; i < N; i += 1) {
        const a = j * (N + 1) + i
        const b = a + 1
        const c = a + (N + 1)
        const d = c + 1
        indices[k++] = a
        indices[k++] = b
        indices[k++] = c
        indices[k++] = b
        indices[k++] = d
        indices[k++] = c
      }
    }
    this.indexCount = indices.length

    this.posBuffer = gl.createBuffer()!
    this.uvBuffer = gl.createBuffer()!
    this.indexBuffer = gl.createBuffer()!

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

    this.emptyTex = this.createEmptyTexture()
  }

  private compileShader(type: number, src: string) {
    const { gl } = this
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader) || 'Shader compile error'
      gl.deleteShader(shader)
      throw new Error(err)
    }
    return shader
  }

  private createEmptyTexture() {
    const { gl } = this
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    )
    return tex
  }

  loadTexture(url: string) {
    if (this.textures.has(url) || this.disposed) return
    const { gl } = this
    const placeholder = this.createEmptyTexture()
    this.textures.set(url, placeholder)

    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (this.disposed) return
      gl.bindTexture(gl.TEXTURE_2D, placeholder)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    }
    img.src = url
  }

  preloadAll() {
    const urls = [
      '/avatar/idle.webp',
      '/avatar/idle-blink.webp',
      '/avatar/thinking.webp',
      '/avatar/thinking-blink.webp',
      '/avatar/answering.webp',
      '/avatar/answering-blink.webp',
      '/avatar/answering-mouth.webp',
      '/avatar/happy.webp',
      '/avatar/notice.webp',
      '/avatar/notice-blink.webp',
    ]
    urls.forEach((url) => this.loadTexture(url))
  }

  render(timeSec: number, dt: number, state: RigState) {
    if (this.disposed) return
    const { gl } = this
    const profile = RIG_PROFILES[state.mood]

    const baseUrl = `/avatar/${state.mood}.webp`
    const blinkUrl = profile.hasBlink ? `/avatar/${state.mood}-blink.webp` : ''
    const mouthUrl = profile.hasMouth ? '/avatar/answering-mouth.webp' : ''

    this.loadTexture(baseUrl)
    if (blinkUrl) this.loadTexture(blinkUrl)
    if (mouthUrl) this.loadTexture(mouthUrl)

    // 指针视线平滑跟随
    const followRate = Math.min(1, dt * 6.5)
    this.curLookX += (state.pointerX - this.curLookX) * followRate
    this.curLookY += (state.pointerY - this.curLookY) * followRate

    // 眨眼计时器（每 2.8~4.6 秒自然眨一次，持续 ~0.16s）
    let blinkMix = 0
    if (profile.hasBlink) {
      if (this.blinkProgress >= 0) {
        this.blinkProgress += dt / 0.16
        if (this.blinkProgress >= 1) {
          this.blinkProgress = -1
          this.nextBlinkAt = timeSec + 2.8 + ((Math.sin(timeSec * 17.3) + 1) * 0.9)
        } else {
          // 快速闭眼后平滑睁开
          blinkMix = Math.sin(this.blinkProgress * Math.PI)
        }
      } else if (timeSec >= this.nextBlinkAt) {
        this.blinkProgress = 0
      }
    }

    // 说话嘴型节奏（正弦叠加形成自然讲话顿挫）
    let mouthMix = 0
    if (profile.hasMouth && state.mood === 'answering') {
      const speechWave =
        0.5 +
        0.34 * Math.sin(timeSec * 14.5) +
        0.22 * Math.sin(timeSec * 9.2 + 1.1) +
        0.14 * Math.cos(timeSec * 21.0)
      mouthMix = smoothstep(0.32, 0.72, speechWave)
    }

    // 定时抽动一只狼耳（每 3.4~5.2 秒一次双连抖）
    let earFlickL = 0
    let earFlickR = 0
    if (timeSec >= this.nextEarAt && timeSec < this.nextEarAt + 0.34) {
      const p = (timeSec - this.nextEarAt) / 0.34
      const flick = Math.sin(p * Math.PI * 2) * (1 - p) * 0.11
      if (this.earSide < 0) earFlickL = -flick
      else earFlickR = flick
    } else if (timeSec >= this.nextEarAt + 0.34) {
      this.nextEarAt = timeSec + 3.4 + ((Math.cos(timeSec * 11.7) + 1) * 0.9)
      this.earSide = this.earSide > 0 ? -1 : 1
    }

    // 各状态下的核心骨骼参数
    const breathSpeed = state.mood === 'happy' ? 3.8 : state.mood === 'answering' ? 3.0 : 2.1
    const breath = Math.sin(timeSec * breathSpeed)
    const bodyBob =
      state.mood === 'happy'
        ? -Math.abs(Math.sin(timeSec * 5.2)) * 0.014
        : breath * 0.005
    const breathScaleX = 1 + breath * 0.007
    const breathScaleY = 1 - breath * 0.008

    const headBaseTilt =
      state.mood === 'notice'
        ? 0.045 + Math.sin(timeSec * 1.9) * 0.02
        : state.mood === 'thinking'
          ? -0.025 + Math.sin(timeSec * 1.4) * 0.02
          : state.mood === 'answering'
            ? Math.sin(timeSec * 3.1) * 0.032
            : state.mood === 'happy'
              ? Math.sin(timeSec * 4.8) * 0.045
              : Math.sin(timeSec * 1.5) * 0.028

    const headAngle = headBaseTilt + this.curLookX * 0.055
    const headShiftX = this.curLookX * 0.012
    const headShiftY =
      this.curLookY * 0.01 +
      (state.mood === 'answering' ? Math.sin(timeSec * 6.2) * 0.004 : 0)

    // 头发与头顶书本的二阶惯性滞后
    const headVel = (headAngle - this.prevHeadAngle) / Math.max(0.008, dt)
    this.prevHeadAngle = headAngle
    this.hairPhaseOffset += (Math.max(-0.08, Math.min(0.08, -headVel * 0.03)) - this.hairPhaseOffset) * Math.min(1, dt * 8)
    this.bookLagAngle += (headAngle * 0.45 - this.bookLagAngle) * Math.min(1, dt * 7)

    const hairSway = Math.sin(timeSec * 2.2) * 0.035 + this.hairPhaseOffset
    const tailFreq =
      state.mood === 'happy'
        ? 7.2
        : state.mood === 'answering'
          ? 4.4
          : state.mood === 'thinking'
            ? 1.7
            : 2.7
    const tailAmp =
      state.mood === 'happy'
        ? 0.14
        : state.mood === 'answering'
          ? 0.09
          : 0.075
    const tailAngle = Math.sin(timeSec * tailFreq) * tailAmp

    const armWaveL =
      state.mood === 'answering'
        ? Math.sin(timeSec * 4.2) * 0.12
        : state.mood === 'happy'
          ? Math.sin(timeSec * 6.0) * 0.08
          : state.mood === 'notice'
            ? Math.sin(timeSec * 3.5) * 0.05
            : state.mood === 'thinking'
              ? Math.sin(timeSec * 2.0) * 0.03
              : Math.sin(timeSec * 2.1) * 0.035

    const armWaveR =
      state.mood === 'answering'
        ? Math.cos(timeSec * 3.6) * 0.05
        : state.mood === 'happy'
          ? -Math.sin(timeSec * 6.0) * 0.08
          : -Math.sin(timeSec * 2.1) * 0.035

    // 遍历 29x29 网格顶点计算骨骼混合变形
    const N = this.gridN
    const total = (N + 1) * (N + 1)
    for (let idx = 0; idx < total; idx += 1) {
      const bx = this.basePos[idx * 2]
      const by = this.basePos[idx * 2 + 1]

      // 1. 脚底锚定权重：脚越靠近底部越稳，上半身随呼吸起伏
      const standWeight = 1 - smoothstep(profile.footAnchorY, 0.96, by)
      let x = profile.neck.x + (bx - profile.neck.x) * (1 + (breathScaleX - 1) * standWeight * smoothstep(0.45, 0.72, by))
      let y = by + bodyBob * standWeight + (by - 0.85) * (breathScaleY - 1) * standWeight

      // 2. 头部骨骼（颈部以上平滑过渡）
      const headWeight = 1 - smoothstep(profile.neck.y - 0.08, profile.neck.y + 0.08, by)
      if (headWeight > 0.001) {
        const hPos = rotateAround(x, y, profile.neck.x, profile.neck.y, headAngle, headWeight)
        x = hPos.x + headShiftX * headWeight
        y = hPos.y + headShiftY * headWeight
      }

      // 3. 头顶书本惯性微晃
      const bookWeight = gaussian2D(bx, by, profile.bookCenter.x, profile.bookCenter.y, 0.22, 0.11)
      if (bookWeight > 0.01) {
        const bPos = rotateAround(
          x,
          y,
          profile.bookCenter.x,
          profile.bookCenter.y + 0.07,
          (this.bookLagAngle - headAngle * 0.45) + Math.sin(timeSec * breathSpeed - 0.6) * 0.018,
          bookWeight,
        )
        x = bPos.x
        y = bPos.y + (state.mood === 'happy' ? Math.sin(timeSec * 5.2 - 0.7) * 0.005 * bookWeight : 0)
      }

      // 4. 左/右狼耳独立抖动
      const earLw = gaussian2D(bx, by, profile.earL.x - 0.04, profile.earL.y - 0.04, 0.09, 0.1)
      if (earLw > 0.01 && Math.abs(earFlickL) > 1e-4) {
        const ePos = rotateAround(x, y, profile.earL.x, profile.earL.y, earFlickL, earLw)
        x = ePos.x
        y = ePos.y
      }
      const earRw = gaussian2D(bx, by, profile.earR.x + 0.04, profile.earR.y - 0.04, 0.09, 0.1)
      if (earRw > 0.01 && Math.abs(earFlickR) > 1e-4) {
        const ePos = rotateAround(x, y, profile.earR.x, profile.earR.y, earFlickR, earRw)
        x = ePos.x
        y = ePos.y
      }

      // 5. 长发下摆物理飘动（左右两侧）
      const hairLw = gaussian2D(bx, by, profile.hairL.x, profile.hairL.y + 0.07, 0.11, 0.15)
      if (hairLw > 0.01) {
        const hlPos = rotateAround(x, y, profile.hairL.x + 0.04, profile.hairL.y - 0.12, hairSway, hairLw)
        x = hlPos.x
        y = hlPos.y
      }
      const hairRw = gaussian2D(bx, by, profile.hairR.x, profile.hairR.y + 0.07, 0.11, 0.15)
      if (hairRw > 0.01) {
        const hrPos = rotateAround(x, y, profile.hairR.x - 0.04, profile.hairR.y - 0.12, hairSway * 0.9, hairRw)
        x = hrPos.x
        y = hrPos.y
      }

      // 6. 左/右肢体（魔杖 / 书本 / 举手欢呼 / 食指提醒）
      const armLw =
        state.mood === 'answering'
          ? gaussian2D(bx, by, 0.25, 0.48, 0.14, 0.17)
          : gaussian2D(bx, by, profile.armL.x - 0.06, profile.armL.y, 0.1, 0.12)
      if (armLw > 0.01) {
        const alPos = rotateAround(x, y, profile.armL.x, profile.armL.y, armWaveL, armLw)
        x = alPos.x
        y = alPos.y
      }
      const armRw =
        state.mood === 'answering'
          ? gaussian2D(bx, by, 0.77, 0.56, 0.13, 0.13)
          : gaussian2D(bx, by, profile.armR.x + 0.06, profile.armR.y, 0.1, 0.12)
      if (armRw > 0.01) {
        const arPos = rotateAround(x, y, profile.armR.x, profile.armR.y, armWaveR, armRw)
        x = arPos.x
        y = arPos.y
      }

      // 7. 尾巴独立摇摆（局部平滑权重避免拉扯裙摆）
      const tailDx = bx - profile.tailRoot.x
      if (tailDx > -0.02) {
        const tw =
          gaussian2D(bx, by, profile.tailRoot.x + profile.tailRadius.x * 0.45, profile.tailRoot.y, profile.tailRadius.x, profile.tailRadius.y) *
          smoothstep(-0.02, 0.06, tailDx)
        if (tw > 0.01) {
          const tPos = rotateAround(x, y, profile.tailRoot.x, profile.tailRoot.y, tailAngle, tw)
          x = tPos.x
          y = tPos.y
        }
      }

      this.deformedPos[idx * 2] = x
      this.deformedPos[idx * 2 + 1] = y
    }

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    gl.useProgram(this.program)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.deformedPos, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.aPosLoc)
    gl.vertexAttribPointer(this.aPosLoc, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer)
    gl.enableVertexAttribArray(this.aUvLoc)
    gl.vertexAttribPointer(this.aUvLoc, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get(baseUrl) ?? this.emptyTex)
    gl.uniform1i(this.uBaseLoc, 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, (blinkUrl && this.textures.get(blinkUrl)) || this.emptyTex)
    gl.uniform1i(this.uBlinkLoc, 1)

    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, (mouthUrl && this.textures.get(mouthUrl)) || this.emptyTex)
    gl.uniform1i(this.uMouthLoc, 2)

    gl.uniform1f(this.uBlinkMixLoc, blinkMix)
    gl.uniform1f(this.uMouthMixLoc, mouthMix)

    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    const { gl } = this
    for (const tex of this.textures.values()) gl.deleteTexture(tex)
    this.textures.clear()
    gl.deleteTexture(this.emptyTex)
    gl.deleteBuffer(this.posBuffer)
    gl.deleteBuffer(this.uvBuffer)
    gl.deleteBuffer(this.indexBuffer)
    gl.deleteProgram(this.program)
  }
}
