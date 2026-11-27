import 'dotenv/config'
import path from 'path'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { detectImageType } from '../utils/imageType'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

const VERIFICATION_BUCKET = 'verification-documents'
const MAX_VERIFICATION_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
const SIGNED_URL_EXPIRY_SECONDS = 3600

export interface VerificationDocumentInput {
  buffer: Buffer
  mimetype: string
  originalname: string
}

export interface StoredVerificationDocument {
  path: string
  mime: string
  name: string
}

/** Validation or storage error carrying the HTTP status the controller should return. */
export class VerificationDocumentError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
  }
}

/** Identify PNG/JPEG/WebP or PDF purely from leading file bytes rather than browser headers. */
export function detectVerificationDocumentType(buffer: Buffer): { mime: string; extension: string } | null {
  const image = detectImageType(buffer)
  if (image) return image

  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { mime: 'application/pdf', extension: 'pdf' }
  }
  return null
}

function isMissingBucket(message: string): boolean {
  return /bucket not found|not found/i.test(message)
}

function sanitizeFileName(originalname: string, fallbackExt: string): string {
  const base = path.basename(originalname || '').trim()
  if (!base) return `document.${fallbackExt}`
  return base.slice(0, 120)
}

/** Ensure the private bucket exists on first upload if migration 053 has not run yet. */
async function ensureVerificationBucket(): Promise<void> {
  await supabase.storage.createBucket(VERIFICATION_BUCKET, {
    public: false,
    fileSizeLimit: MAX_VERIFICATION_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  })
}

/**
 * Validate and upload a student's study load or professor's ID document into the
 * private `verification-documents` bucket under `{userId}/{role}/{uuid}.{ext}`.
 */
export async function saveVerificationDocument(
  userId: string,
  role: 'student' | 'professor',
  file: VerificationDocumentInput,
): Promise<StoredVerificationDocument> {
  const detected = detectVerificationDocumentType(file.buffer)
  if (!detected) {
    throw new VerificationDocumentError('Use a PNG, JPG, WebP image or PDF document.', 400)
  }

  const objectPath = `${userId}/${role}/${randomUUID()}.${detected.extension}`
  let { error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .upload(objectPath, file.buffer, { contentType: detected.mime, upsert: false })

  if (error && isMissingBucket(error.message)) {
    await ensureVerificationBucket()
    const retry = await supabase.storage
      .from(VERIFICATION_BUCKET)
      .upload(objectPath, file.buffer, { contentType: detected.mime, upsert: false })
    error = retry.error
  }

  if (error) {
    throw new VerificationDocumentError('Could not upload the verification document. Please try again.', 502)
  }

  return {
    path: objectPath,
    mime: detected.mime,
    name: sanitizeFileName(file.originalname, detected.extension),
  }
}

/** Generate short-lived signed URLs for admin review of pending verification files. */
export async function signVerificationDocumentUrls(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const unique = [...new Set(paths.map((p) => p.trim()).filter(Boolean))]
  if (unique.length === 0) return result

  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_EXPIRY_SECONDS)

  if (error || !data) {
    if (error && !isMissingBucket(error.message)) {
      console.error('signVerificationDocumentUrls failed:', error.message)
    }
    return result
  }

  for (const item of data) {
    if (item.path && item.signedUrl) {
      result.set(item.path, item.signedUrl)
    }
  }
  return result
}
