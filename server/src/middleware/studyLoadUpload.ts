import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'

export const STUDY_LOAD_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: STUDY_LOAD_MAX_BYTES, files: 1 },
}).single('studyLoad')

/**
 * Handle multipart/form-data for study load uploads (image or PDF up to 10 MB).
 * Passes JSON requests through so JSON clients continue to work.
 */
export function studyLoadUpload(req: Request, res: Response, next: NextFunction): void {
  const contentType = req.headers['content-type'] || ''
  if (contentType.includes('application/json')) {
    next()
    return
  }

  upload(req, res, (err: unknown) => {
    if (!err) {
      next()
      return
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'The study load document is larger than 10 MB. Please upload a smaller file.' })
      return
    }
    res.status(400).json({ error: 'Could not read the study load document. Please choose a valid image (PNG, JPG, WebP) or PDF.' })
  })
}
