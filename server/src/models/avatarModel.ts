import 'dotenv/config'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { detectImageType } from '../utils/imageType'
import { setOwnAvatarUrl } from './userModel'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

const AVATAR_BUCKET = 'avatars'

/** An avatar problem with the HTTP status the controller should answer with. */
export class AvatarError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
  }
}

/** True when Supabase says the avatars bucket has not been created (migration 036 not applied). */
function isMissingBucket(message: string): boolean {
  return /bucket not found|not found/i.test(message)
}

/** Delete every stored photo in the user's folder except the one to keep (best effort). */
async function removeOldPhotos(userId: string, keepName: string | null): Promise<void> {
  const { data } = await supabase.storage.from(AVATAR_BUCKET).list(userId)
  const stale = (data ?? []).filter((entry) => entry.name !== keepName).map((entry) => `${userId}/${entry.name}`)
  if (stale.length > 0) await supabase.storage.from(AVATAR_BUCKET).remove(stale)
}

/**
 * Save a new profile photo: check the bytes really are PNG/JPG/WebP, upload under a fresh
 * name (so browsers never show a cached old picture), point the account at it, and delete
 * the previous photos. Returns the public link.
 */
export async function saveAvatar(userId: string, buffer: Buffer): Promise<string> {
  const type = detectImageType(buffer)
  if (!type) throw new AvatarError('Use a PNG, JPG or WebP picture.', 400)

  const fileName = `${randomUUID()}.${type.extension}`
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(`${userId}/${fileName}`, buffer, { contentType: type.mime, upsert: false })
  if (error) {
    if (isMissingBucket(error.message)) throw new AvatarError('Profile photos are not set up yet. Please try again later.', 503)
    throw new AvatarError('Could not upload the picture. Please try again.', 502)
  }

  const publicUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(`${userId}/${fileName}`).data.publicUrl
  if (!(await setOwnAvatarUrl(userId, publicUrl))) {
    await supabase.storage.from(AVATAR_BUCKET).remove([`${userId}/${fileName}`])
    throw new AvatarError('Could not save the picture to your account. Please try again.', 502)
  }
  await removeOldPhotos(userId, fileName)
  return publicUrl
}

/** Remove the user's profile photo and clear the link on their account. */
export async function removeAvatar(userId: string): Promise<void> {
  if (!(await setOwnAvatarUrl(userId, null))) {
    throw new AvatarError('Could not remove the picture. Please try again.', 502)
  }
  await removeOldPhotos(userId, null)
}
