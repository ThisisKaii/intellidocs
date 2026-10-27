import 'dotenv/config'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const REVIEW_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export interface ReviewImageFile {
  buffer: Buffer
  mimetype: string
}

export interface ReviewRecord {
  id: string
  user_id: string
  message: string
  page_path: string | null
  image_urls: string[]
  created_at: string
}

/** Upload one review screenshot to the `review-images` bucket and return its public URL. */
async function uploadReviewImage(userId: string, file: ReviewImageFile): Promise<string> {
  const extension = REVIEW_IMAGE_EXTENSIONS[file.mimetype] ?? 'png'
  const objectPath = `${userId}/${randomUUID()}.${extension}`
  const { error } = await supabase.storage
    .from('review-images')
    .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false })
  if (error) throw new Error(`Review image upload failed: ${error.message}`)
  return supabase.storage.from('review-images').getPublicUrl(objectPath).data.publicUrl
}

/** Store a review and its screenshots for the given user. */
export async function createReview(
  userId: string,
  message: string,
  pagePath: string | undefined,
  userAgent: string | undefined,
  files: ReviewImageFile[],
): Promise<ReviewRecord> {
  const imageUrls = await Promise.all(files.map((file) => uploadReviewImage(userId, file)))
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      user_id: userId,
      message,
      page_path: pagePath ?? null,
      image_urls: imageUrls,
      user_agent: userAgent ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`Failed to save review: ${error.message}`)
  return data as ReviewRecord
}
