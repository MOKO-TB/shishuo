import type { ThreadAttachment } from '../types'
import { apiPost } from './api'

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_FILE_BYTES = 10 * 1024 * 1024

export async function prepareImage(file: File): Promise<ThreadAttachment> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error('请选择 PNG、JPEG 或 WebP 图片。')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('图片超过 10MB，请压缩后再试。')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('浏览器无法读取这张图片，请换一张再试。')
  }

  const maxSide = 1280
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('浏览器无法处理图片，请换一个浏览器再试。')
  }
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let dataUrl = canvas.toDataURL('image/jpeg', 0.82)
  if (dataUrl.length > 900_000) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.68)
  }
  if (dataUrl.length > 1_400_000) {
    throw new Error('图片压缩后仍然较大，请换一张更小的图片。')
  }

  return {
    dataUrl,
    name: file.name || '题目图片',
    type: 'image/jpeg',
  }
}

/** Store the compressed image once; threads keep only the returned URL. */
export async function uploadThreadImage(attachment: ThreadAttachment) {
  if (attachment.url) {
    return {
      url: attachment.url,
      name: attachment.name,
      type: attachment.type,
    } satisfies ThreadAttachment
  }
  if (!attachment.dataUrl) throw new Error('图片还没有准备好。')
  const uploaded = await apiPost<{ url: string; name: string; type: string }>(
    '/api/uploads/image',
    { dataUrl: attachment.dataUrl, name: attachment.name },
  )
  return {
    url: uploaded.url,
    name: uploaded.name || attachment.name,
    type: uploaded.type || attachment.type,
  } satisfies ThreadAttachment
}
