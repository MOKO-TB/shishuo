export type AvatarMood =
  | 'idle'
  | 'thinking'
  | 'answering'
  | 'happy'
  | 'notice'
  | 'run'
  | 'walk'
  | 'wave'
  | 'point'
  | 'celebrate'

export interface AvatarActionMeta {
  id: AvatarMood
  label: string
  category: '基础陪伴' | '进度条/走位' | '讲解互动' | '情绪高潮'
  summary: string
  rigFeatures: string[]
}

export const AVATAR_ACTIONS: AvatarActionMeta[] = [
  {
    id: 'idle',
    label: '呼吸待机',
    category: '基础陪伴',
    summary: '胸腹自然呼吸、视线跟随、双连眨眼、狼耳定时抽动、长发微风与尾巴缓摇',
    rigFeatures: ['胸腹呼吸', '视线跟随', '自动眨眼', '狼耳抽动', '发丝物理', '尾巴缓摇'],
  },
  {
    id: 'wave',
    label: '挥手问好',
    category: '基础陪伴',
    summary: '开场/谢幕专属：高举小手热情大幅挥动、歪头微笑、狼耳欢快抖动与尾巴快摇',
    rigFeatures: ['大幅挥臂', '亲切歪头', '双耳欢抖', '快节奏摇尾', '自然眨眼'],
  },
  {
    id: 'run',
    label: '进度条奔跑',
    category: '进度条/走位',
    summary: '宣传片进度条专属：双腿独立前后跨步 + 反相摆臂 + 前倾弹跳 + 头发后飘 + 书本防滑晃动',
    rigFeatures: ['独立双腿跨步', '反相摆臂', '前倾弹跳', '长发向后飞扬', '书本惯性平衡', '侧颜眨眼'],
  },
  {
    id: 'walk',
    label: '轻快漫步',
    category: '进度条/走位',
    summary: '舒缓步态过场：优雅交替迈步、柔和摆臂、轻轻点头与尾巴悠闲摇摆',
    rigFeatures: ['独立双腿漫步', '舒缓摆臂', '步态微晃', '悠闲摇尾', '侧颜眨眼'],
  },
  {
    id: 'thinking',
    label: '翻书思考',
    category: '讲解互动',
    summary: '坐姿翻看发光“AI”书、魔杖轻点下巴、眉头与头部微晃、自动眨眼',
    rigFeatures: ['魔杖轻点', '坐姿微晃', '长发轻拂', '尾巴慢摇', '思考眨眼'],
  },
  {
    id: 'answering',
    label: '魔杖讲解',
    category: '讲解互动',
    summary: '流式讲课动作：星形魔杖画弧挥舞、笔记本起伏、拟人说话嘴型开合与点头强调',
    rigFeatures: ['说话嘴型开合', '魔杖画弧', '笔记本节奏', '讲课点头', '同步眨眼'],
  },
  {
    id: 'point',
    label: '指路聚焦',
    category: '讲解互动',
    summary: '界面解说员姿态：向右侧展示区探身前倾、魔杖双连点指聚焦画面重点、同步开口解说',
    rigFeatures: ['向右探身指路', '双连点指节奏', '开口解说嘴型', '头部引导转向', '同步眨眼'],
  },
  {
    id: 'notice',
    label: '歪头提醒',
    category: '讲解互动',
    summary: '好奇大幅歪头、竖起食指左右轻点提示注意事项、狼耳警觉双抖',
    rigFeatures: ['好奇歪头', '食指点提示', '双耳警觉抖动', '眨眼提示'],
  },
  {
    id: 'happy',
    label: '元气欢呼',
    category: '情绪高潮',
    summary: '迪士尼式 Squash & Stretch 挤压拉伸双连跳、双拳交替加油、尾巴高频欢快摇摆',
    rigFeatures: ['挤压拉伸跳跃', '双拳交替加油', '高频摇尾', '书本滞后弹跳'],
  },
  {
    id: 'celebrate',
    label: '魔法庆功',
    category: '情绪高潮',
    summary: '宣传片高潮/结尾专属：蓄力下蹲→高高跃起→空中欢呼摆头、长发裙摆飞扬与书本凌空回弹',
    rigFeatures: ['蓄力高跃', '空中欢呼甩头', '长发裙摆飞扬', '极限快摇尾', '书本凌空回弹'],
  },
]

interface Vec2 {
  x: number
  y: number
}

interface PoseRigProfile {
  /** 基础贴图名（对应 /avatar/${baseAsset}.webp） */
  baseAsset: 'idle' | 'thinking' | 'answering' | 'happy' | 'notice' | 'side-body' | 'wave-body'
  /** 默认是否水平镜像（如 point 指向右侧） */
  defaultMirrorX?: boolean
  /** 是否采用 4 层独立侧身骨骼（双腿 + 身体 + 手臂） */
  isSideArticulated?: boolean
  /** 是否采用 2 层独立挥手骨骼（身体 + 独立右臂，完全不拉扯脸部） */
  isWaveArticulated?: boolean
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
  /** 眨眼贴图名 */
  blinkAsset?: string
  /** 是否开启说话嘴型帧混合 */
  hasMouth: boolean
}

export const RIG_PROFILES: Record<AvatarMood, PoseRigProfile> = {
  idle: {
    baseAsset: 'idle',
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
    blinkAsset: 'idle-blink',
    hasMouth: false,
  },
  thinking: {
    baseAsset: 'thinking',
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
    blinkAsset: 'thinking-blink',
    hasMouth: false,
  },
  answering: {
    baseAsset: 'answering',
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
    blinkAsset: 'answering-blink',
    hasMouth: true,
  },
  point: {
    baseAsset: 'answering',
    defaultMirrorX: true,
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
    blinkAsset: 'answering-blink',
    hasMouth: true,
  },
  happy: {
    baseAsset: 'happy',
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
  celebrate: {
    baseAsset: 'happy',
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
    footAnchorY: 0.96,
    hasBlink: false,
    hasMouth: false,
  },
  notice: {
    baseAsset: 'wave-body',
    isWaveArticulated: true,
    neck: { x: 0.5, y: 0.5 },
    earL: { x: 0.35, y: 0.25 },
    earR: { x: 0.65, y: 0.25 },
    hairL: { x: 0.28, y: 0.64 },
    hairR: { x: 0.72, y: 0.64 },
    armL: { x: 0.412, y: 0.566 },
    armR: { x: 0.65, y: 0.6 },
    tailRoot: { x: 0.59, y: 0.78 },
    tailRadius: { x: 0.22, y: 0.16 },
    bookCenter: { x: 0.5, y: 0.13 },
    footAnchorY: 0.87,
    hasBlink: true,
    blinkAsset: 'notice-blink',
    hasMouth: false,
  },
  wave: {
    baseAsset: 'wave-body',
    isWaveArticulated: true,
    neck: { x: 0.5, y: 0.5 },
    earL: { x: 0.35, y: 0.25 },
    earR: { x: 0.65, y: 0.25 },
    hairL: { x: 0.28, y: 0.64 },
    hairR: { x: 0.72, y: 0.64 },
    armL: { x: 0.412, y: 0.566 },
    armR: { x: 0.65, y: 0.6 },
    tailRoot: { x: 0.59, y: 0.78 },
    tailRadius: { x: 0.22, y: 0.16 },
    bookCenter: { x: 0.5, y: 0.13 },
    footAnchorY: 0.87,
    hasBlink: true,
    blinkAsset: 'notice-blink',
    hasMouth: false,
  },
  run: {
    baseAsset: 'side-body',
    isSideArticulated: true,
    neck: { x: 0.58, y: 0.5 },
    earL: { x: 0.45, y: 0.36 },
    earR: { x: 0.45, y: 0.36 },
    hairL: { x: 0.36, y: 0.58 },
    hairR: { x: 0.44, y: 0.62 },
    armL: { x: 0.567, y: 0.545 },
    armR: { x: 0.567, y: 0.545 },
    tailRoot: { x: 0.5, y: 0.76 },
    tailRadius: { x: 0.28, y: 0.18 },
    bookCenter: { x: 0.53, y: 0.18 },
    footAnchorY: 0.99,
    hasBlink: true,
    blinkAsset: 'side-blink',
    hasMouth: false,
  },
  walk: {
    baseAsset: 'side-body',
    isSideArticulated: true,
    neck: { x: 0.58, y: 0.5 },
    earL: { x: 0.45, y: 0.36 },
    earR: { x: 0.45, y: 0.36 },
    hairL: { x: 0.36, y: 0.58 },
    hairR: { x: 0.44, y: 0.62 },
    armL: { x: 0.567, y: 0.545 },
    armR: { x: 0.567, y: 0.545 },
    tailRoot: { x: 0.5, y: 0.76 },
    tailRadius: { x: 0.28, y: 0.18 },
    bookCenter: { x: 0.53, y: 0.18 },
    footAnchorY: 0.99,
    hasBlink: true,
    blinkAsset: 'side-blink',
    hasMouth: false,
  },
}

const SIDE_LEG_PIVOT: Vec2 = { x: 0.597, y: 0.787 }
const SIDE_ARM_PIVOT: Vec2 = { x: 0.567, y: 0.545 }
const SIDE_TORSO_PIVOT: Vec2 = { x: 0.55, y: 0.68 }

const VERT_SRC = `
attribute vec2 a_pos;
attribute vec2 a_uv;
uniform float u_mirrorX;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  float px = u_mirrorX > 0.5 ? (1.0 - a_pos.x) : a_pos.x;
  gl_Position = vec4(px * 2.0 - 1.0, -(a_pos.y * 2.0 - 1.0), 0.0, 1.0);
}
`

const FRAG_SRC = `
precision mediump float;
uniform sampler2D u_base;
uniform sampler2D u_blink;
uniform sampler2D u_mouth;
uniform float u_blinkMix;
uniform float u_mouthMix;
uniform vec3 u_tint;
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
  col.rgb *= u_tint;
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

/** 基于绝对时间计算自然眨眼（含偶发双连眨），保证实时渲染与离线逐帧录屏完全一致。 */
function computeBlinkMix(timeSec: number): number {
  const cycle = 3.6
  const phase = ((timeSec + 0.9) % cycle + cycle) % cycle
  const cycleIdx = Math.floor((timeSec + 0.9) / cycle)
  const blinkDur = 0.16
  if (phase < blinkDur) {
    return Math.sin((phase / blinkDur) * Math.PI)
  }
  // 每 3 个周期出现一次俏皮双连眨
  if (cycleIdx % 3 === 1 && phase >= 0.24 && phase < 0.24 + blinkDur) {
    return Math.sin(((phase - 0.24) / blinkDur) * Math.PI)
  }
  return 0
}

/** 基于绝对时间计算狼耳抽动，避免跳帧时失步。 */
function computeEarFlick(timeSec: number): { left: number; right: number } {
  const cycle = 4.1
  const phase = ((timeSec + 1.4) % cycle + cycle) % cycle
  const cycleIdx = Math.floor((timeSec + 1.4) / cycle)
  if (phase < 0.34) {
    const p = phase / 0.34
    const flick = Math.sin(p * Math.PI * 2) * (1 - p) * 0.14
    return cycleIdx % 2 === 0 ? { left: -flick, right: 0 } : { left: 0, right: flick }
  }
  return { left: 0, right: 0 }
}

export interface RigState {
  mood: AvatarMood
  pointerX: number // -1..1
  pointerY: number // -1..1
  /** 可选覆盖水平翻转（用于宣传片向左跑或指向左侧） */
  flipX?: boolean
}

/** 轻量 WebGL1 2D 骨骼网格驱动器：支持单层网格变形与 4 层独立侧身奔跑骨骼、眨眼/嘴型帧混合。 */
export class AvatarMeshRig {
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private posBuffer: WebGLBuffer
  private uvBuffer: WebGLBuffer
  private indexBuffer: WebGLBuffer
  private gridN = 40
  private basePos: Float32Array
  private deformedPos: Float32Array
  private indexCount = 0
  private textures = new Map<string, WebGLTexture>()
  private loadedUrls = new Set<string>()
  private emptyTex: WebGLTexture
  private uBaseLoc: WebGLUniformLocation | null
  private uBlinkLoc: WebGLUniformLocation | null
  private uMouthLoc: WebGLUniformLocation | null
  private uBlinkMixLoc: WebGLUniformLocation | null
  private uMouthMixLoc: WebGLUniformLocation | null
  private uMirrorXLoc: WebGLUniformLocation | null
  private uTintLoc: WebGLUniformLocation | null
  private aPosLoc: number
  private aUvLoc: number
  private disposed = false
  private assetBase: string

  // 平滑指针视线跟踪状态
  private curLookX = 0
  private curLookY = 0

  constructor(canvas: HTMLCanvasElement, assetBase = '/avatar') {
    this.assetBase = assetBase.replace(/\/+$/, '')
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
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
    this.uMirrorXLoc = gl.getUniformLocation(program, 'u_mirrorX')
    this.uTintLoc = gl.getUniformLocation(program, 'u_tint')

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

  private assetUrl(name: string) {
    return `${this.assetBase}/${name}.webp`
  }

  loadTexture(url: string): Promise<void> {
    if (this.textures.has(url) || this.disposed) return Promise.resolve()
    const { gl } = this
    const placeholder = this.createEmptyTexture()
    this.textures.set(url, placeholder)

    return new Promise((resolve) => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => {
        if (!this.disposed) {
          gl.bindTexture(gl.TEXTURE_2D, placeholder)
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
          this.loadedUrls.add(url)
        }
        resolve()
      }
      img.onerror = () => resolve()
      img.src = url
    })
  }

  preloadAll(): Promise<void> {
    const names = [
      'idle',
      'idle-blink',
      'thinking',
      'thinking-blink',
      'answering',
      'answering-blink',
      'answering-mouth',
      'happy',
      'notice',
      'notice-blink',
      'side-body',
      'side-leg',
      'side-arm',
      'side-blink',
      'wave-body',
      'wave-arm',
    ]
    return Promise.all(names.map((n) => this.loadTexture(this.assetUrl(n)))).then(() => undefined)
  }

  private drawPass(
    baseUrl: string,
    blinkUrl: string,
    mouthUrl: string,
    blinkMix: number,
    mouthMix: number,
    mirrorX: boolean,
    tint: [number, number, number] = [1, 1, 1],
  ) {
    const { gl } = this
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
    gl.uniform1f(this.uMirrorXLoc, mirrorX ? 1 : 0)
    gl.uniform3f(this.uTintLoc, tint[0], tint[1], tint[2])

    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0)
  }

  /** 渲染 4 层独立侧身骨骼（进度条奔跑 `run` / 轻快漫步 `walk`） */
  private renderSideArticulated(timeSec: number, mood: 'run' | 'walk', mirrorX: boolean) {
    const isRun = mood === 'run'
    const strideFreq = isRun ? 10.6 : 5.4
    const phase = timeSec * strideFreq
    const sinP = Math.sin(phase)
    const cosP = Math.cos(phase)

    // 双倍频弹跳（每迈一次步都有一次轻盈腾空与落地缓冲）
    const bounceWave = Math.abs(Math.sin(phase))
    const bodyLift = isRun ? -bounceWave * 0.044 + 0.014 : -bounceWave * 0.015 + 0.005
    // 落地微挤压、腾空微拉伸（活感核心）
    const squash = isRun ? (0.5 - bounceWave) * 0.042 : (0.5 - bounceWave) * 0.014
    const bodyScaleX = 1 + squash
    const bodyScaleY = 1 - squash
    const forwardLean = isRun ? 0.145 + Math.sin(phase * 2) * 0.025 : 0.04 + Math.sin(phase * 2) * 0.014

    const legAmp = isRun ? 0.68 : 0.34
    const frontLegAngle = sinP * legAmp
    const backLegAngle = -sinP * legAmp
    // 迈向前时膝盖/小腿略抬高，让步态更像真人奔跑
    const frontLegLift = isRun ? Math.max(0, -sinP) * -0.02 : Math.max(0, -sinP) * -0.008
    const backLegLift = isRun ? Math.max(0, sinP) * -0.02 : Math.max(0, sinP) * -0.008

    const armAmp = isRun ? 0.64 : 0.3
    const frontArmAngle = -sinP * armAmp + (isRun ? 0.06 : 0)
    const backArmAngle = sinP * armAmp * 0.85

    const headBobAngle = isRun
      ? -0.04 + Math.sin(phase * 2 - 0.5) * 0.032
      : Math.sin(phase - 0.3) * 0.025
    const hairStreamAngle = isRun
      ? 0.16 + Math.sin(phase * 2 - 0.9) * 0.095
      : 0.04 + Math.sin(phase - 0.7) * 0.04
    const tailWagAngle = isRun
      ? 0.14 + Math.sin(phase * 2 - 1.1) * 0.16
      : Math.sin(phase - 0.8) * 0.09
    const bookWobble = isRun
      ? Math.sin(phase * 2 - 1.3) * 0.075
      : Math.sin(phase - 1.0) * 0.028
    const bookFloatY = isRun ? Math.sin(phase * 2 - 1.1) * 0.009 : Math.sin(phase * 2 - 1.0) * 0.003

    const blinkMix = computeBlinkMix(timeSec)
    const ear = computeEarFlick(timeSec)

    const bodyUrl = this.assetUrl('side-body')
    const legUrl = this.assetUrl('side-leg')
    const armUrl = this.assetUrl('side-arm')
    const blinkUrl = this.assetUrl('side-blink')
    void this.loadTexture(bodyUrl)
    void this.loadTexture(legUrl)
    void this.loadTexture(armUrl)
    void this.loadTexture(blinkUrl)

    const N = this.gridN
    const total = (N + 1) * (N + 1)

    const applyBodyTransform = (bx: number, by: number): Vec2 => {
      let x = SIDE_TORSO_PIVOT.x + (bx - SIDE_TORSO_PIVOT.x) * bodyScaleX
      let y = SIDE_TORSO_PIVOT.y + (by - SIDE_TORSO_PIVOT.y) * bodyScaleY + bodyLift
      const leaned = rotateAround(x, y, SIDE_TORSO_PIVOT.x, SIDE_TORSO_PIVOT.y + bodyLift, forwardLean, 1)
      return leaned
    }

    const fillLimbMesh = (pivot: Vec2, limbAngle: number, extraLiftY: number, extraOffsetX = 0) => {
      for (let idx = 0; idx < total; idx += 1) {
        const bx = this.basePos[idx * 2]
        const by = this.basePos[idx * 2 + 1]
        // 先绕自身关节旋转，再跟随身体前倾与弹跳
        const rot = rotateAround(bx, by, pivot.x, pivot.y, limbAngle, 1)
        const p = applyBodyTransform(rot.x + extraOffsetX, rot.y + extraLiftY)
        this.deformedPos[idx * 2] = p.x
        this.deformedPos[idx * 2 + 1] = p.y
      }
    }

    // Pass 0: 后侧手臂剪影（略暗，增加奔跑立体感）
    fillLimbMesh(SIDE_ARM_PIVOT, backArmAngle, 0, 0.028)
    this.drawPass(armUrl, '', '', 0, 0, mirrorX, [0.74, 0.76, 0.78])

    // Pass 1: 后腿（暗化 22% 区分景深）
    fillLimbMesh(SIDE_LEG_PIVOT, backLegAngle, backLegLift, 0.012)
    this.drawPass(legUrl, '', '', 0, 0, mirrorX, [0.76, 0.78, 0.8])

    // Pass 2: 前腿
    fillLimbMesh(SIDE_LEG_PIVOT, frontLegAngle, frontLegLift, -0.006)
    this.drawPass(legUrl, '', '', 0, 0, mirrorX, [1, 1, 1])

    // Pass 3: 身体 + 头部 + 长发飞扬 + 尾巴甩动 + 头顶书本防滑平衡 + 侧面眨眼
    const profile = RIG_PROFILES[mood]
    for (let idx = 0; idx < total; idx += 1) {
      const bx = this.basePos[idx * 2]
      const by = this.basePos[idx * 2 + 1]
      let x = bx
      let y = by

      // 头部点动
      const headW = 1 - smoothstep(profile.neck.y - 0.08, profile.neck.y + 0.07, by)
      if (headW > 0.001) {
        const hp = rotateAround(x, y, profile.neck.x, profile.neck.y, headBobAngle, headW)
        x = hp.x
        y = hp.y
      }

      // 侧耳抽动
      const earW = gaussian2D(bx, by, 0.43, 0.36, 0.1, 0.08)
      if (earW > 0.01) {
        const ep = rotateAround(x, y, 0.49, 0.36, ear.left + ear.right + (isRun ? 0.06 : 0), earW)
        x = ep.x
        y = ep.y
      }

      // 头顶书本防滑微晃 + 凌空弹起滞后
      const bookW = gaussian2D(bx, by, profile.bookCenter.x, profile.bookCenter.y, 0.24, 0.1)
      if (bookW > 0.01) {
        const bp = rotateAround(x, y, profile.bookCenter.x, profile.bookCenter.y + 0.07, bookWobble, bookW)
        x = bp.x
        y = bp.y + bookFloatY * bookW
      }

      // 绿色长发向后（左侧）随风飞扬
      const hairBackW =
        gaussian2D(bx, by, 0.35, 0.56, 0.16, 0.2) * (1 - smoothstep(0.46, 0.55, bx))
      if (hairBackW > 0.01) {
        const fl = rotateAround(x, y, 0.48, 0.4, hairStreamAngle, hairBackW)
        x = fl.x - (isRun ? 0.018 * hairBackW * (0.6 + 0.4 * cosP) : 0)
        y = fl.y - (isRun ? 0.012 * hairBackW : 0)
      }

      // 尾巴波浪甩动（左下区域 x < 0.52, y > 0.66）
      const tailW =
        gaussian2D(bx, by, 0.34, 0.78, 0.22, 0.14) * (1 - smoothstep(0.47, 0.56, bx))
      if (tailW > 0.01) {
        const tp = rotateAround(x, y, 0.5, 0.74, tailWagAngle, tailW)
        x = tp.x
        y = tp.y
      }

      // 叠加全身前倾与弹跳挤压
      const finalPos = applyBodyTransform(x, y)
      this.deformedPos[idx * 2] = finalPos.x
      this.deformedPos[idx * 2 + 1] = finalPos.y
    }
    this.drawPass(bodyUrl, blinkUrl, '', blinkMix, 0, mirrorX, [1, 1, 1])

    // Pass 4: 前侧摆动手臂
    fillLimbMesh(SIDE_ARM_PIVOT, frontArmAngle, 0, 0)
    this.drawPass(armUrl, '', '', 0, 0, mirrorX, [1, 1, 1])
  }

  render(timeSec: number, dt: number, state: RigState) {
    if (this.disposed) return
    const { gl } = this
    const profile = RIG_PROFILES[state.mood]
    const mirrorX = state.flipX ?? Boolean(profile.defaultMirrorX)

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    if (profile.isSideArticulated && (state.mood === 'run' || state.mood === 'walk')) {
      this.renderSideArticulated(timeSec, state.mood, mirrorX)
      return
    }

    const baseUrl = this.assetUrl(profile.baseAsset)
    const blinkUrl = profile.hasBlink && profile.blinkAsset ? this.assetUrl(profile.blinkAsset) : ''
    const mouthUrl = profile.hasMouth ? this.assetUrl('answering-mouth') : ''

    void this.loadTexture(baseUrl)
    if (blinkUrl) void this.loadTexture(blinkUrl)
    if (mouthUrl) void this.loadTexture(mouthUrl)

    // 指针视线平滑跟随
    const followRate = Math.min(1, dt * 7.0)
    this.curLookX += (state.pointerX - this.curLookX) * followRate
    this.curLookY += (state.pointerY - this.curLookY) * followRate

    const blinkMix = profile.hasBlink ? computeBlinkMix(timeSec) : 0
    const earFlick = computeEarFlick(timeSec)

    // 拟人说话嘴型顿挫节奏（answering / point）
    let mouthMix = 0
    if (profile.hasMouth && (state.mood === 'answering' || state.mood === 'point')) {
      const speechWave =
        0.5 +
        0.34 * Math.sin(timeSec * 14.5) +
        0.22 * Math.sin(timeSec * 9.2 + 1.1) +
        0.14 * Math.cos(timeSec * 21.0)
      mouthMix = smoothstep(0.32, 0.72, speechWave)
    }

    // ---- 按动作定制更具“活感”的骨骼运动曲线（含 Squash & Stretch） ----
    const mood = state.mood
    const breathSpeed =
      mood === 'celebrate'
        ? 4.6
        : mood === 'happy'
          ? 4.0
          : mood === 'wave'
            ? 3.4
            : mood === 'answering' || mood === 'point'
              ? 3.0
              : 2.1
    const breath = Math.sin(timeSec * breathSpeed)

    let bodyBob = breath * 0.0055
    let bodyLean = 0
    let squashX = 1 + breath * 0.008
    let squashY = 1 - breath * 0.009
    let bookJumpLagY = 0

    if (mood === 'happy') {
      const hopPhase = timeSec * 5.6
      const hop = Math.abs(Math.sin(hopPhase))
      bodyBob = -hop * 0.032 + 0.01
      const sq = (0.45 - hop) * 0.055
      squashX = 1 + sq
      squashY = 1 - sq
      bodyLean = Math.sin(hopPhase * 0.5) * 0.038
      bookJumpLagY = -Math.abs(Math.sin(hopPhase - 0.45)) * 0.012
    } else if (mood === 'celebrate') {
      // 蓄力下蹲 -> 高高跃起 -> 空中欢呼 -> 回弹
      const cPhase = (timeSec * 1.15) % 1
      let jumpH = 0
      let sq = 0
      if (cPhase < 0.18) {
        // 蓄力下蹲
        const p = Math.sin((cPhase / 0.18) * Math.PI)
        jumpH = p * 0.022
        sq = p * 0.085
      } else if (cPhase < 0.72) {
        // 高高跃起腾空（保留顶部书本安全边距不裁切）
        const p = (cPhase - 0.18) / 0.54
        const arc = Math.sin(p * Math.PI)
        jumpH = -arc * 0.048
        sq = -Math.sin(p * Math.PI) * 0.048
      } else {
        // 落地弹性缓冲
        const p = (cPhase - 0.72) / 0.28
        const damp = Math.sin(p * Math.PI) * (1 - p * 0.4)
        jumpH = damp * 0.016
        sq = damp * 0.06
      }
      bodyBob = jumpH
      squashX = 1 + sq
      squashY = 1 - sq
      bodyLean = Math.sin(timeSec * 6.2) * 0.06
      bookJumpLagY = -Math.max(0, -jumpH) * 0.35 + Math.sin(timeSec * 7.2 - 0.8) * 0.008
    } else if (mood === 'wave') {
      bodyBob = Math.sin(timeSec * 3.8) * 0.008
      bodyLean = Math.sin(timeSec * 2.4) * 0.032
    } else if (mood === 'point') {
      // 向右展示区探身（由于 point 镜像，本地坐标向左倾即画面向右倾！）
      bodyLean = -0.055 - Math.sin(timeSec * 3.2) * 0.02
      bodyBob = Math.sin(timeSec * 3.2) * 0.007
    }

    const headBaseTilt =
      mood === 'notice'
        ? 0.075 + Math.sin(timeSec * 2.3) * 0.032
        : mood === 'wave'
          ? -0.055 + Math.sin(timeSec * 3.8) * 0.045
          : mood === 'thinking'
            ? -0.04 + Math.sin(timeSec * 1.6) * 0.03
            : mood === 'point'
              ? -0.045 + Math.sin(timeSec * 3.2) * 0.028
              : mood === 'answering'
                ? Math.sin(timeSec * 3.2) * 0.038
                : mood === 'happy'
                  ? Math.sin(timeSec * 5.6) * 0.06
                  : mood === 'celebrate'
                    ? Math.sin(timeSec * 6.8) * 0.085
                    : Math.sin(timeSec * 1.5) * 0.032

    const lookSign = mirrorX ? -1 : 1
    const headAngle = headBaseTilt + this.curLookX * lookSign * 0.06
    const headShiftX = this.curLookX * lookSign * 0.012
    const headShiftY =
      this.curLookY * 0.01 +
      (mood === 'answering' || mood === 'point' ? Math.sin(timeSec * 6.4) * 0.0055 : 0)

    const hairSway =
      mood === 'celebrate'
        ? Math.sin(timeSec * 6.2 - 0.6) * 0.095
        : mood === 'happy'
          ? Math.sin(timeSec * 5.6 - 0.5) * 0.07
          : Math.sin(timeSec * 2.2 - 0.4) * 0.042 - headBaseTilt * 0.35

    const bookLag = Math.sin(timeSec * breathSpeed - 0.8) * (mood === 'celebrate' ? 0.065 : 0.025) - headAngle * 0.25

    const tailFreq =
      mood === 'celebrate'
        ? 9.2
        : mood === 'happy'
          ? 7.8
          : mood === 'wave'
            ? 5.8
            : mood === 'answering' || mood === 'point'
              ? 4.6
              : mood === 'thinking'
                ? 1.8
                : 2.8
    const tailAmp =
      mood === 'celebrate'
        ? 0.2
        : mood === 'happy'
          ? 0.16
          : mood === 'wave'
            ? 0.13
            : mood === 'answering' || mood === 'point'
              ? 0.1
              : 0.085
    const tailAngle = Math.sin(timeSec * tailFreq) * tailAmp

    // 肢体动作（挥手 / 魔杖讲解 / 双连点指 / 双拳欢呼 / 思考轻点）
    const armWaveL =
      mood === 'wave'
        ? Math.sin(timeSec * 8.2) * 0.28 + 0.06
        : mood === 'point'
          ? Math.sin(timeSec * 5.2) * 0.16 + Math.sin(timeSec * 10.4) * 0.05 - 0.08
          : mood === 'answering'
            ? Math.sin(timeSec * 4.4) * 0.16
            : mood === 'celebrate'
              ? Math.sin(timeSec * 8.4) * 0.18
              : mood === 'happy'
                ? Math.sin(timeSec * 6.2) * 0.12
                : mood === 'notice'
                  ? Math.sin(timeSec * 4.2) * 0.085
                  : mood === 'thinking'
                    ? Math.sin(timeSec * 2.4) * 0.045
                    : Math.sin(timeSec * 2.1) * 0.04

    const armWaveR =
      mood === 'celebrate'
        ? -Math.sin(timeSec * 8.4) * 0.18
        : mood === 'happy'
          ? -Math.sin(timeSec * 6.2) * 0.12
          : mood === 'answering' || mood === 'point'
            ? Math.cos(timeSec * 3.8) * 0.065
            : -Math.sin(timeSec * 2.1) * 0.04

    const extraEarExcite =
      mood === 'happy' || mood === 'celebrate' || mood === 'wave'
        ? Math.sin(timeSec * 6.5) * 0.045
        : 0

    // 遍历 29×29 网格计算骨骼混合变形
    const N = this.gridN
    const total = (N + 1) * (N + 1)
    for (let idx = 0; idx < total; idx += 1) {
      const bx = this.basePos[idx * 2]
      const by = this.basePos[idx * 2 + 1]

      // 1. 全身呼吸 / 挤压拉伸 / 跳跃与前倾
      const standWeight =
        mood === 'celebrate' ? 1 : 1 - smoothstep(profile.footAnchorY, 0.96, by)
      let x =
        profile.neck.x +
        (bx - profile.neck.x) * (1 + (squashX - 1) * standWeight * smoothstep(0.32, 0.72, by))
      let y = by + bodyBob * standWeight + (by - 0.85) * (squashY - 1) * standWeight

      if (Math.abs(bodyLean) > 1e-4) {
        const leanPivotY = mood === 'celebrate' ? 0.65 : 0.88
        const leanW = mood === 'celebrate' ? 1 : 1 - smoothstep(0.84, 0.96, by)
        const lp = rotateAround(x, y, profile.neck.x, leanPivotY, bodyLean, leanW)
        x = lp.x
        y = lp.y
      }

      // 2. 头部骨骼
      const headWeight = 1 - smoothstep(profile.neck.y - 0.08, profile.neck.y + 0.08, by)
      if (headWeight > 0.001) {
        const hPos = rotateAround(x, y, profile.neck.x, profile.neck.y, headAngle, headWeight)
        x = hPos.x + headShiftX * headWeight
        y = hPos.y + headShiftY * headWeight
      }

      // 3. 头顶书本惯性微晃 & 跳跃凌空滞后
      const bookWeight = gaussian2D(bx, by, profile.bookCenter.x, profile.bookCenter.y, 0.22, 0.11)
      if (bookWeight > 0.01) {
        const bPos = rotateAround(
          x,
          y,
          profile.bookCenter.x,
          profile.bookCenter.y + 0.07,
          bookLag,
          bookWeight,
        )
        x = bPos.x
        y = bPos.y + bookJumpLagY * bookWeight
      }

      // 4. 左/右狼耳独立抽动
      const earLw = gaussian2D(bx, by, profile.earL.x - 0.04, profile.earL.y - 0.04, 0.09, 0.1)
      if (earLw > 0.01) {
        const ePos = rotateAround(x, y, profile.earL.x, profile.earL.y, earFlick.left - extraEarExcite, earLw)
        x = ePos.x
        y = ePos.y
      }
      const earRw = gaussian2D(bx, by, profile.earR.x + 0.04, profile.earR.y - 0.04, 0.09, 0.1)
      if (earRw > 0.01) {
        const ePos = rotateAround(x, y, profile.earR.x, profile.earR.y, earFlick.right + extraEarExcite, earRw)
        x = ePos.x
        y = ePos.y
      }

      // 5. 长发下摆物理飘动（庆祝跳跃时略向外扬）
      const hairFlare = mood === 'celebrate' ? Math.max(0, -bodyBob) * 0.9 : 0
      const hairLw = gaussian2D(bx, by, profile.hairL.x, profile.hairL.y + 0.07, 0.11, 0.15)
      if (hairLw > 0.01) {
        const hlPos = rotateAround(x, y, profile.hairL.x + 0.04, profile.hairL.y - 0.12, hairSway + hairFlare, hairLw)
        x = hlPos.x
        y = hlPos.y
      }
      const hairRw = gaussian2D(bx, by, profile.hairR.x, profile.hairR.y + 0.07, 0.11, 0.15)
      if (hairRw > 0.01) {
        const hrPos = rotateAround(x, y, profile.hairR.x - 0.04, profile.hairR.y - 0.12, hairSway * 0.9 - hairFlare, hairRw)
        x = hrPos.x
        y = hrPos.y
      }

      // 6. 左/右肢体动作（加面部防变形保护盾；isWaveArticulated 的右臂改由独立图层绘制，绝不拉扯脸部）
      const faceShield = 1 - gaussian2D(bx, by, profile.neck.x, profile.neck.y - 0.12, 0.17, 0.15)
      if (!profile.isWaveArticulated) {
        const armLw =
          (mood === 'answering' || mood === 'point'
            ? gaussian2D(bx, by, 0.25, 0.48, 0.14, 0.17)
            : gaussian2D(bx, by, profile.armL.x - 0.06, profile.armL.y, 0.1, 0.12)) * faceShield
        if (armLw > 0.01) {
          const alPos = rotateAround(x, y, profile.armL.x, profile.armL.y, armWaveL, armLw)
          x = alPos.x
          y = alPos.y
        }
      }
      const armRw =
        (mood === 'answering' || mood === 'point'
          ? gaussian2D(bx, by, 0.77, 0.56, 0.13, 0.13)
          : gaussian2D(bx, by, profile.armR.x + 0.06, profile.armR.y, 0.1, 0.12)) * faceShield
      if (armRw > 0.01) {
        const arPos = rotateAround(x, y, profile.armR.x, profile.armR.y, armWaveR, armRw)
        x = arPos.x
        y = arPos.y
      }

      // 7. 尾巴独立摇摆
      const tailDx = bx - profile.tailRoot.x
      if (tailDx > -0.02) {
        const tw =
          gaussian2D(
            bx,
            by,
            profile.tailRoot.x + profile.tailRadius.x * 0.45,
            profile.tailRoot.y,
            profile.tailRadius.x,
            profile.tailRadius.y,
          ) * smoothstep(-0.02, 0.06, tailDx)
        if (tw > 0.01) {
          const tPos = rotateAround(x, y, profile.tailRoot.x, profile.tailRoot.y, tailAngle, tw)
          x = tPos.x
          y = tPos.y
        }
      }

      this.deformedPos[idx * 2] = x
      this.deformedPos[idx * 2 + 1] = y
    }

    this.drawPass(baseUrl, blinkUrl, mouthUrl, blinkMix, mouthMix, mirrorX, [1, 1, 1])

    // 独立挥手/提醒右臂 Pass（肩部锁定在马甲袖口零割裂，肘关节柔顺挥动 + 手腕弹性滞后，完全不触碰脸颊！）
    if (profile.isWaveArticulated) {
      const waveArmUrl = this.assetUrl('wave-arm')
      void this.loadTexture(waveArmUrl)
      const isWave = mood === 'wave'
      // 1. 极微小的上臂呼吸跟随（肩缝 bx >= 0.402 处权重归零，彻底锁死肩部无缝隙）
      const shoulderAngle = isWave
        ? -0.012 + Math.sin(timeSec * 6.8) * 0.024
        : -0.005 + Math.sin(timeSec * 4.2) * 0.01
      // 2. 前臂绕真实肘关节 (0.360, 0.616) 克制自然摆动（-9° ~ +4.5°，绝不夸张割裂）
      const elbowAngle = isWave
        ? -0.04 + Math.sin(timeSec * 6.8) * 0.115
        : -0.015 + Math.sin(timeSec * 4.2) * 0.05
      // 3. 手腕/手指二次弹性滞后跟随（Live2D 级柔顺感）
      const wristAngle = isWave
        ? -0.008 + Math.sin(timeSec * 6.8 - 0.55) * 0.042
        : Math.sin(timeSec * 4.2 - 0.5) * 0.022

      const leanPivotY = 0.88
      for (let idx = 0; idx < total; idx += 1) {
        const bx = this.basePos[idx * 2]
        const by = this.basePos[idx * 2 + 1]

        // 一级：肩部锁缝微跟随（bx >= 0.402 处严格为 0，与绿马甲肩线 100% 贴合）
        const shW = (1 - smoothstep(0.372, 0.402, bx)) * (1 - smoothstep(0.61, 0.665, by))
        let rx = bx
        let ry = by
        if (shW > 0.001) {
          const sPos = rotateAround(rx, ry, 0.404, 0.562, shoulderAngle, shW)
          rx = sPos.x
          ry = sPos.y
        }

        // 二级：前臂绕肘关节中心 (0.360, 0.616) 柔和弯曲摆动，上臂与下袖口自然固定
        const elbowW = (1 - smoothstep(0.362, 0.388, bx)) * (1 - smoothstep(0.585, 0.642, by))
        if (elbowW > 0.001) {
          const ePos = rotateAround(rx, ry, 0.36, 0.616, elbowAngle, elbowW)
          rx = ePos.x
          ry = ePos.y
        }

        // 三级：手腕/小手 (by < 0.568) 轻柔弹性摆动
        const wristW = (1 - smoothstep(0.528, 0.568, by)) * (1 - smoothstep(0.365, 0.392, bx))
        if (wristW > 0.001) {
          const wPos = rotateAround(rx, ry, 0.344, 0.558, wristAngle, wristW)
          rx = wPos.x
          ry = wPos.y
        }

        // 叠加与躯干完全一致的呼吸起伏和身体微倾，确保肩缝与袖口严丝合缝
        const sw = 1 - smoothstep(profile.footAnchorY, 0.96, ry)
        let ax =
          profile.neck.x +
          (rx - profile.neck.x) * (1 + (squashX - 1) * sw * smoothstep(0.32, 0.72, ry))
        let ay = ry + bodyBob * sw + (ry - 0.85) * (squashY - 1) * sw
        if (Math.abs(bodyLean) > 1e-4) {
          const lw = 1 - smoothstep(0.84, 0.96, ry)
          const lp = rotateAround(ax, ay, profile.neck.x, leanPivotY, bodyLean, lw)
          ax = lp.x
          ay = lp.y
        }
        this.deformedPos[idx * 2] = ax
        this.deformedPos[idx * 2 + 1] = ay
      }
      this.drawPass(waveArmUrl, '', '', 0, 0, mirrorX, [1, 1, 1])
    }
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
