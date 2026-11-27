import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'

export const STUDY_LOAD_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Build a multipart upload middleware (up to 10 MB) for verification documents
 * while passing JSON requests through unchanged.
 */
function createVerificationUpload(fieldName: string, docLabel: string) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: STUDY_LOAD_MAX_BYTES, files: 1 },
  }).single(fieldName)

  return function verificationUpload(req: Request, res: Response, next: NextFunction): void {
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
        res.status(413).json({ error: `The ${docLabel} is larger than 10 MB. Please upload a smaller file.` })
        return
      }
      res.status(400).json({ error: `Could not read the ${docLabel}. Please choose a valid image (PNG, JPG, WebP) or PDF.` })
    })
  }
}

/** Handle multipart/form-data for student study load uploads (image or PDF up to 10 MB). */
export const studyLoadUpload = createVerificationUpload('studyLoad', 'study load document')

/** Handle multipart/form-data for professor faculty ID uploads (image or PDF up to 10 MB). */
export const facultyIdUpload = createVerificationUpload('facultyIdImage', 'faculty ID document')
