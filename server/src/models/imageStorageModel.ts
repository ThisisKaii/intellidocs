import 'dotenv/config'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

/**
 * Where document pictures are stored, and the record of each one (migration 050, `stored_images`)
 * that counts it toward its owner's storage.
 *
 * Pictures go to Cloudflare R2 when it is configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL, optionally R2_BUCKET): 10 GB free and no download fees, so
 * reading a long manuscript's pictures never uses up a monthly allowance. Otherwise they go to the
 * Supabase `document-images` bucket, as before. Pictures already stored keep working either way:
 * each URL says where its picture lives.
 *
 * Every record write tolerates a database without migration 050 (pictures are then stored but not
 * counted).
 */

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

export const IMAGE_BUCKET = 'document-images'
const SUPABASE_URL_MARKER = `/object/public/${IMAGE_BUCKET}/`

/** File extension per MIME type the editor accepts (the bucket's allow-list). */
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

type Backend = 'supabase' | 'r2'

interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicUrl: string
}

/** The R2 settings, or null when any required one is missing (Supabase is used then). */
export function r2Config(): R2Config | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL, R2_BUCKET } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_URL) return null
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET || IMAGE_BUCKET,
    publicUrl: R2_PUBLIC_URL.replace(/\/+$/, ''),
  }
}

let r2: { config: R2Config; client: S3Client } | null = null

function r2Client(config: R2Config): S3Client {
  if (!r2 || r2.config.accountId !== config.accountId || r2.config.accessKeyId !== config.accessKeyId) {
    r2 = {
      config,
      client: new S3Client({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      }),
    }
  }
  return r2.client
}

/** Where a stored picture lives, from its URL; null for a URL that is not one of ours. */
export function locateImage(url: string): { path: string; backend: Backend } | null {
  const config = r2Config()
  if (config && url.startsWith(`${config.publicUrl}/`)) {
    return { path: decodeURIComponent(url.slice(config.publicUrl.length + 1).split('?')[0]), backend: 'r2' }
  }
  const at = url.indexOf(SUPABASE_URL_MARKER)
  if (at >= 0) return { path: decodeURIComponent(url.slice(at + SUPABASE_URL_MARKER.length).split('?')[0]), backend: 'supabase' }
  return null
}

/**
 * Store a picture for a user (and, when known, the document it belongs to) and return its public
 * URL. The picture is recorded so it counts toward the user's storage.
 */
export async function storeImage(
  userId: string,
  file: { buffer: Buffer; mimetype: string },
  documentId?: string | null,
): Promise<string> {
  const extension = IMAGE_MIME_EXTENSIONS[file.mimetype] ?? 'png'
  const path = `${userId}/${randomUUID()}.${extension}`
  const config = r2Config()
  let url: string
  let backend: Backend
  if (config) {
    await r2Client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: path,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Each picture has a unique name and never changes.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )
    url = `${config.publicUrl}/${path}`
    backend = 'r2'
  } else {
    const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file.buffer, { contentType: file.mimetype, upsert: false })
    if (error) throw new Error(`Image upload failed: ${error.message}`)
    url = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
    backend = 'supabase'
  }
  await supabase
    .from('stored_images')
    .insert({ path, user_id: userId, document_id: documentId ?? null, bytes: file.buffer.length, backend })
    .then(({ error }) => {
      if (error && !/stored_images/.test(error.message)) console.warn('Could not record a stored picture:', error.message)
    })
  return url
}

/** Delete stored pictures and their records. Best-effort: a picture that cannot be removed is left. */
async function removeLocated(pictures: Array<{ path: string; backend: Backend }>): Promise<void> {
  const byBackend = { supabase: [] as string[], r2: [] as string[] }
  for (const picture of pictures) byBackend[picture.backend].push(picture.path)
  for (let start = 0; start < byBackend.supabase.length; start += 100) {
    const { error } = await supabase.storage.from(IMAGE_BUCKET).remove(byBackend.supabase.slice(start, start + 100))
    if (error) console.warn('Could not remove pictures:', error.message)
  }
  const config = r2Config()
  if (config && byBackend.r2.length > 0) {
    for (let start = 0; start < byBackend.r2.length; start += 1000) {
      const keys = byBackend.r2.slice(start, start + 1000).map((Key) => ({ Key }))
      await r2Client(config)
        .send(new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: keys, Quiet: true } }))
        .catch((error: unknown) => console.warn('Could not remove pictures from R2:', error))
    }
  }
  const paths = pictures.map((picture) => picture.path)
  for (let start = 0; start < paths.length; start += 200) {
    await supabase.from('stored_images').delete().in('path', paths.slice(start, start + 200))
  }
}

/** Delete pictures by their URLs (an import that did not create its document). */
export async function removeImages(urls: string[]): Promise<void> {
  const located = urls.map(locateImage).filter((picture): picture is { path: string; backend: Backend } => picture !== null)
  if (located.length > 0) await removeLocated(located)
}

/** The picture URLs (ours) that appear in some text: document HTML, its JSON, its layout. */
function imageUrlsIn(texts: string[]): string[] {
  const found = new Set<string>()
  for (const text of texts) {
    for (const match of text.matchAll(/https?:\/\/[^\s"'()<>\\]+/g)) {
      if (locateImage(match[0])) found.add(match[0])
    }
  }
  return Array.from(found)
}

/**
 * Tie the pictures a new document shows to it, so they are deleted with it and stop counting while
 * it is in the trash. Only the user's own pictures are linked.
 */
export async function linkImagesToDocument(userId: string, documentId: string, texts: string[]): Promise<void> {
  const paths = imageUrlsIn(texts)
    .map(locateImage)
    .filter((picture): picture is { path: string; backend: Backend } => picture !== null)
    .map((picture) => picture.path)
  for (let start = 0; start < paths.length; start += 200) {
    const { error } = await supabase
      .from('stored_images')
      .update({ document_id: documentId })
      .eq('user_id', userId)
      .in('path', paths.slice(start, start + 200))
    if (error) return
  }
}

/** Delete every picture tied to a document (before the document itself is deleted for good). */
export async function removeDocumentImages(documentId: string): Promise<void> {
  const { data, error } = await supabase.from('stored_images').select('path, backend').eq('document_id', documentId)
  if (error || !data || data.length === 0) return
  await removeLocated(data as Array<{ path: string; backend: Backend }>)
}

/** Delete every picture a user stored (account deletion), recorded or still only in the bucket. */
export async function removeUserImages(userId: string): Promise<void> {
  const { data } = await supabase.from('stored_images').select('path, backend').eq('user_id', userId)
  const recorded = (data ?? []) as Array<{ path: string; backend: Backend }>
  const known = new Set(recorded.map((picture) => picture.path))
  const legacy: Array<{ path: string; backend: Backend }> = []
  for (let offset = 0; ; offset += 1000) {
    const { data: objects } = await supabase.storage.from(IMAGE_BUCKET).list(userId, { limit: 1000, offset })
    for (const object of objects ?? []) {
      const path = `${userId}/${object.name}`
      if (!known.has(path)) legacy.push({ path, backend: 'supabase' })
    }
    if (!objects || objects.length < 1000) break
  }
  await removeLocated([...recorded, ...legacy])
}
