/**
 * 题目图片对象存储抽象。
 *
 * - local（默认）：写 data/uploads，经 /uploads/* 静态托管，行为与历史版本一致。
 * - s3：PUT 到任意 S3 兼容服务（AWS S3 / MinIO / OSS 兼容模式），
 *   AWS SigV4 签名在本地实现，凭 env 凭证启用；工作区里保存可直接访问的对象 URL。
 *
 * 访问控制口径与本地驱动一致：对象 Key 带随机 ID，不用于存放敏感证件。
 */
import { createHash, createHmac } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const sha256hex = (data) => createHash('sha256').update(data).digest('hex')
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()

/**
 * AWS Signature Version 4 请求签名。
 * now 可注入固定时间（测试用官方向量对拍）；payloadHash 可显式传入。
 */
export function signS3Request({
  method,
  host,
  path: objectPath,
  query = '',
  headers = {},
  body,
  accessKeyId,
  secretAccessKey,
  region,
  service = 's3',
  now = new Date(),
}) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = headers['x-amz-content-sha256'] ?? sha256hex(body ?? '')

  const merged = { ...headers, host, 'x-amz-date': amzDate }
  if (!merged['x-amz-content-sha256'] && service === 's3') {
    merged['x-amz-content-sha256'] = payloadHash
  }
  const normalizeValue = (value) => String(value).trim().replace(/ {2,}/g, ' ')
  const sorted = Object.entries(merged)
    .map(([key, value]) => [key.toLowerCase(), normalizeValue(value)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const canonicalHeaders = sorted.map(([key, value]) => `${key}:${value}\n`).join('')
  const signedHeaders = sorted.map(([key]) => key).join(';')

  const canonicalRequest = [
    method,
    objectPath,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const scope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join('\n')

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service),
    'aws4_request',
  )
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')

  return {
    amzDate,
    payloadHash,
    headers: {
      ...merged,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  }
}

function s3ObjectUrl(config, key) {
  const { endpoint, bucket, publicBase } = config.storage.s3
  if (publicBase) return `${publicBase.replace(/\/+$/, '')}/${key}`
  return `${endpoint.replace(/\/+$/, '')}/${bucket}/${key}`
}

/** 保存上传图片：按驱动写入本地磁盘或 S3 兼容服务，返回可直接访问的 URL。 */
export async function saveUpload(config, buffer, { id, ext, mime }) {
  if (config.storage.driver === 's3') {
    const key = `shishuo/${id}.${ext}`
    const endpoint = config.storage.s3.endpoint.replace(/\/+$/, '')
    const objectPath = `/${config.storage.s3.bucket}/${key}`
    const { host } = new URL(endpoint)
    const signed = signS3Request({
      method: 'PUT',
      host,
      path: objectPath,
      headers: { 'content-type': mime },
      body: buffer,
      accessKeyId: config.storage.s3.accessKeyId,
      secretAccessKey: config.storage.s3.secretAccessKey,
      region: config.storage.s3.region,
    })
    const response = await fetch(`${endpoint}${objectPath}`, {
      method: 'PUT',
      headers: signed.headers,
      body: new Uint8Array(buffer),
    })
    if (!response.ok) {
      throw new Error(`S3 上传失败（HTTP ${response.status}）`)
    }
    return { url: s3ObjectUrl(config, key), storage: 's3' }
  }
  await mkdir(config.uploadsDir, { recursive: true })
  await writeFile(path.join(config.uploadsDir, `${id}.${ext}`), buffer)
  return { url: `/uploads/${id}.${ext}`, storage: 'local' }
}
