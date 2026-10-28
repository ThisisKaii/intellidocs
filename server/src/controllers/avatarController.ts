import type { Response } from 'express'
import type { AuthenticatedRequest } from '../types/express'
import { AvatarError, removeAvatar, saveAvatar } from '../models/avatarModel'

/** Replace the signed-in user's profile photo with the uploaded picture. */
export async function uploadAvatar(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: '401 Unauthorized: Session required' })
    return
  }
  const file = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file
  if (!file) {
    res.status(400).json({ error: 'Choose a picture to upload.' })
    return
  }
  try {
    const avatarUrl = await saveAvatar(userId, file.buffer)
    res.status(200).json({ avatarUrl, message: 'Profile photo updated' })
  } catch (err) {
    if (err instanceof AvatarError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    res.status(500).json({ error: 'Could not update the profile photo.' })
  }
}

/** Remove the signed-in user's profile photo. */
export async function deleteAvatar(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: '401 Unauthorized: Session required' })
    return
  }
  try {
    await removeAvatar(userId)
    res.status(200).json({ avatarUrl: null, message: 'Profile photo removed' })
  } catch (err) {
    if (err instanceof AvatarError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    res.status(500).json({ error: 'Could not remove the profile photo.' })
  }
}
