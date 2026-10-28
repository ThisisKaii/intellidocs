import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'

/** The most a profile photo may weigh. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
}).single('avatar')

/** Accept one picture in the `avatar` field and turn upload problems into plain 400/413 answers. */
export function avatarUpload(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (!err) {
      next()
      return
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'That picture is larger than 2 MB. Choose a smaller one.' })
      return
    }
    res.status(400).json({ error: 'Could not read the picture. Choose a PNG, JPG or WebP file.' })
  })
}
