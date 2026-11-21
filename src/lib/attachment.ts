import type { FaqAttachment, ThreadAttachment } from '../types'
import { apiPost } from './api'
import { prepareImage, uploadThreadImage } from './image'

/** 单个资料文件上限；图片另有 10MB 压缩上限。 */
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
/** 解析后保留的最大字符数，足够覆盖课件 / 作业文档，避免拖垮请求。 */
const MAX_TEXT_CHARS = 60_000

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'log',
  'yml',
  'yaml',
  'xml',
  'html',
  'htm',
  'css',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'java',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'go',
  'rs',
  'php',
  'rb',
  'swift',
  'kt',
  'sql',
  'sh',
  'bat',
  'tex',
  'bib',
  'ini',
  'cfg',
  'conf',
])

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
}

/** 文件选择框：图片 + 常见课程资料。 */
export const ASK_FILE_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.log',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.js',
  '.ts',
  '.tex',
].join(',')

export const ASK_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

/** 老师发知识时可附的资料：解析成正文给 AI，同时保留原文件给学生下载。 */
export const FAQ_FILE_ACCEPT = [
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.txt',
  '.md',
  '.csv',
].join(',')

const FAQ_FILE_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'pptx',
  'xlsx',
  'txt',
  'md',
  'csv',
])

/** FAQ 附件的正文最多保留这么多字符，避免一条知识把整份课件塞进状态。 */
const MAX_FAQ_TEXT_CHARS = 20_000

export function fileExtension(name: string) {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

export function isImageFile(file: File) {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(fileExtension(file.name))
}

export function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 兼容旧线程：没有 kind、也没有图片地址的附件按文档处理。 */
export function isDocumentAttachment(
  attachment?: { kind?: 'image' | 'document'; url?: string; dataUrl?: string } | null,
) {
  if (!attachment) return false
  if (attachment.kind) return attachment.kind === 'document'
  return !attachment.url && !attachment.dataUrl
}

function normalizeText(raw: string) {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS)
}

function decodeXmlEntities(text: string) {
  return text.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos|nbsp);/g, (_, code: string) => {
    if (code === 'amp') return '&'
    if (code === 'lt') return '<'
    if (code === 'gt') return '>'
    if (code === 'quot') return '"'
    if (code === 'apos') return "'"
    if (code === 'nbsp') return ' '
    if (code.startsWith('#x') || code.startsWith('#X')) {
      const value = Number.parseInt(code.slice(2), 16)
      return Number.isFinite(value) ? String.fromCodePoint(value) : ''
    }
    if (code.startsWith('#')) {
      const value = Number.parseInt(code.slice(1), 10)
      return Number.isFinite(value) ? String.fromCodePoint(value) : ''
    }
    return ''
  })
}

function stripXmlTags(xml: string) {
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, ''))
}

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  localOffset: number
}

function readZipDirectory(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let end = -1
  const stop = Math.max(0, bytes.length - 65_558)
  for (let offset = bytes.length - 22; offset >= stop; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      end = offset
      break
    }
  }
  if (end < 0) throw new Error('文件结构无法识别，可能已损坏。')
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  const entries = new Map<string, ZipEntry>()
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    entries.set(name, { name, method, compressedSize, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function inflateRaw(data: Uint8Array) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持解析 Office 文件，请换 Chrome / Edge，或导出 PDF、截图后再传。')
  }
  const stream = new Blob([data as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readZipText(buffer: ArrayBuffer, entry?: ZipEntry) {
  if (!entry) return ''
  const view = new DataView(buffer)
  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) {
    throw new Error('文件数据损坏，请重新导出后再试。')
  }
  const nameLength = view.getUint16(entry.localOffset + 26, true)
  const extraLength = view.getUint16(entry.localOffset + 28, true)
  const start = entry.localOffset + 30 + nameLength + extraLength
  const data = new Uint8Array(buffer, start, entry.compressedSize)
  const raw = entry.method === 0 ? data : entry.method === 8 ? await inflateRaw(data) : null
  if (!raw) throw new Error('文件使用了不支持的压缩格式，请另存后再试。')
  return new TextDecoder('utf-8').decode(raw)
}

async function extractDocx(buffer: ArrayBuffer) {
  const entries = readZipDirectory(buffer)
  const xml = await readZipText(buffer, entries.get('word/document.xml'))
  if (!xml) throw new Error('这个 Word 文件里没有可读取的正文。')
  const text = xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<\/w:tr>/g, '\n')
  return stripXmlTags(text)
}

async function extractPptx(buffer: ArrayBuffer) {
  const entries = readZipDirectory(buffer)
  const slides = [...entries.values()]
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
    .sort(
      (a, b) =>
        Number(a.name.match(/slide(\d+)/)?.[1] ?? 0) -
        Number(b.name.match(/slide(\d+)/)?.[1] ?? 0),
    )
  if (slides.length === 0) throw new Error('这个 PPT 文件里没有可读取的幻灯片文字。')
  const blocks: string[] = []
  for (const [index, slide] of slides.entries()) {
    const xml = await readZipText(buffer, slide)
    const body = xml
      .replace(/<a:br[^>]*\/>/g, '\n')
      .replace(/<\/a:p>/g, '\n')
    const text = stripXmlTags(body).trim()
    if (text) blocks.push(`第 ${index + 1} 页\n${text}`)
  }
  return blocks.join('\n\n')
}

function columnLetters(ref: string) {
  return ref.replace(/\d+/g, '').toUpperCase()
}

function columnIndex(ref: string) {
  const letters = columnLetters(ref)
  let value = 0
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64)
  return Math.max(0, value - 1)
}

async function extractXlsx(buffer: ArrayBuffer) {
  const entries = readZipDirectory(buffer)
  const sharedXml = await readZipText(buffer, entries.get('xl/sharedStrings.xml'))
  const shared = sharedXml
    ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => stripXmlTags(match[1] ?? '').trim())
    : []
  const sheets = [...entries.values()]
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
    .sort(
      (a, b) =>
        Number(a.name.match(/sheet(\d+)/)?.[1] ?? 0) -
        Number(b.name.match(/sheet(\d+)/)?.[1] ?? 0),
    )
  if (sheets.length === 0) throw new Error('这个 Excel 文件里没有可读取的工作表。')
  const blocks: string[] = []
  for (const [index, sheet] of sheets.entries()) {
    const xml = await readZipText(buffer, sheet)
    const rows: string[] = []
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      for (const cell of (row[1] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cell[1] ?? ''
        const body = cell[2] ?? ''
        const ref = /\br="([A-Za-z]+\d+)"/.exec(attrs)?.[1] ?? ''
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? ''
        let value = ''
        if (type === 's') {
          const sharedIndex = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? NaN)
          value = Number.isFinite(sharedIndex) ? shared[sharedIndex] ?? '' : ''
        } else if (type === 'inlineStr') {
          value = stripXmlTags(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '')
        } else {
          value = stripXmlTags(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
        }
        value = value.replace(/\s+/g, ' ').trim()
        if (!value) continue
        const target = Math.min(columnIndex(ref), 40)
        while (cells.length < target) cells.push('')
        cells[target] = value
      }
      if (cells.some(Boolean)) rows.push(cells.join('\t'))
    }
    if (rows.length > 0) blocks.push(`工作表 ${index + 1}\n${rows.slice(0, 300).join('\n')}`)
  }
  return blocks.join('\n\n')
}

async function extractPdf(file: File) {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default
  const data = new Uint8Array(await file.arrayBuffer())
  const document = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  try {
    const pages = Math.min(document.numPages, 60)
    const blocks: string[] = []
    let total = 0
    for (let index = 1; index <= pages; index += 1) {
      const page = await document.getPage(index)
      const content = await page.getTextContent()
      let pageText = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        pageText += item.str
        pageText += item.hasEOL ? '\n' : ' '
      }
      pageText = pageText.replace(/[ \t]+\n/g, '\n').trim()
      if (pageText) {
        blocks.push(`第 ${index} 页\n${pageText}`)
        total += pageText.length
      }
      if (total > MAX_TEXT_CHARS) break
    }
    if (document.numPages > pages) {
      blocks.push(`（共 ${document.numPages} 页，只读取了前 ${pages} 页）`)
    }
    return blocks.join('\n\n')
  } finally {
    await document.destroy()
  }
}

async function extractDocumentText(file: File, extension: string) {
  if (extension === 'pdf') return extractPdf(file)
  if (extension === 'docx') return extractDocx(await file.arrayBuffer())
  if (extension === 'pptx') return extractPptx(await file.arrayBuffer())
  if (extension === 'xlsx') return extractXlsx(await file.arrayBuffer())
  if (TEXT_EXTENSIONS.has(extension) || file.type.startsWith('text/')) {
    const raw = await file.text()
    if (raw.includes('\u0000')) {
      throw new Error('这个文件不是纯文本，请换成 PDF、DOCX 或截图后再试。')
    }
    return raw
  }
  if (extension === 'doc' || extension === 'ppt' || extension === 'xls') {
    throw new Error('旧版 Office 文件暂不支持，请另存为 .docx / .pptx / .xlsx 或导出 PDF。')
  }
  throw new Error('暂不支持这种文件，请上传 PDF、Word、PPT、Excel、文本或截图。')
}

/**
 * 把用户选中的图片 / 资料变成统一附件：
 * - 图片压缩后上传，走视觉识别；
 * - 文档在本地解析成纯文本，发送时交给 AI 分析。
 */
export async function prepareAttachment(file: File): Promise<ThreadAttachment> {
  const extension = fileExtension(file.name)
  if (isImageFile(file)) {
    const normalized = file.type
      ? file
      : new File([file], file.name, {
          type: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream',
        })
    const prepared = await prepareImage(normalized)
    const uploaded = await uploadThreadImage(prepared)
    return {
      ...prepared,
      url: uploaded.url,
      name: uploaded.name || normalized.name,
      type: uploaded.type || prepared.type,
      kind: 'image',
      size: file.size,
    }
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('文件超过 20MB，请拆分或压缩后再试。')
  }
  const text = normalizeText(await extractDocumentText(file, extension))
  if (!text) {
    throw new Error('没有从文件里读到文字。如果是扫描版 PDF，请把关键页截图后粘贴进来。')
  }
  return {
    name: file.name,
    type: file.type || MIME_BY_EXTENSION[extension] || extension || 'document',
    kind: 'document',
    size: file.size,
    text,
    excerpt: text.slice(0, 1_200),
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('文件读取失败，请重新选择。'))
    reader.readAsDataURL(file)
  })
}

/**
 * 老师发知识时用的附件：
 * - 图片压缩上传，直接展示在答案下方；
 * - 资料先解析正文（AI 可引用），再把原文件上传，学生可下载。
 */
export async function prepareFaqAttachment(file: File): Promise<FaqAttachment> {
  const extension = fileExtension(file.name)
  if (isImageFile(file)) {
    const normalized = file.type
      ? file
      : new File([file], file.name, {
          type: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream',
        })
    const prepared = await prepareImage(normalized)
    const uploaded = await uploadThreadImage(prepared)
    return {
      kind: 'image',
      url: uploaded.url,
      name: uploaded.name || normalized.name,
      type: uploaded.type || prepared.type,
      size: file.size,
    }
  }

  if (!FAQ_FILE_EXTENSIONS.has(extension)) {
    throw new Error('暂不支持这种文件，请上传 PDF、Word、PPT、Excel、文本或图片。')
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('文件超过 20MB，请拆分或压缩后再试。')
  }

  // 扫描版 PDF 可能提不出文字；文件本身仍然值得发给学生，所以解析失败不阻塞上传。
  let text = ''
  try {
    text = normalizeText(await extractDocumentText(file, extension))
  } catch {
    text = ''
  }

  const dataUrl = await readFileAsDataUrl(file)
  const uploaded = await apiPost<{ url: string; name?: string; type?: string }>(
    '/api/uploads/file',
    { dataUrl, name: file.name },
  )
  return {
    kind: 'document',
    url: uploaded.url,
    name: uploaded.name || file.name,
    type: uploaded.type || MIME_BY_EXTENSION[extension] || 'application/octet-stream',
    size: file.size,
    ...(text
      ? {
          text: text.slice(0, MAX_FAQ_TEXT_CHARS),
          excerpt: text.slice(0, 1_200),
        }
      : {}),
  }
}
