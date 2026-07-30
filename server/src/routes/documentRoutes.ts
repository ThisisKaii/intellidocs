import { Router } from 'express'
import multer from 'multer'
import * as documentController from '../controllers/documentController'
import { validateBody } from '../middleware/validate'
import {
  createDocumentSchema,
  updateDocumentSchema,
} from '../../schemas/documentSchemas'

const router = Router()

/**
 * Multer configuration for file import.
 * Memory storage — file buffer passed directly to controller.
 * Allowed MIME types for .docx, .txt, .html, and .pdf accepted.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'text/plain',        // .txt
      'text/html',         // .html
      'application/pdf',   // .pdf
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`))
    }
  },
})

router.get('/', documentController.getAllDocuments)
router.post('/', validateBody(createDocumentSchema), documentController.createDocument)

/** Import a local file and create a document from it. Must be before /:id */
router.post('/import', upload.single('file'), documentController.importDocument)

router.get('/:id', documentController.getDocument)
router.put('/:id', validateBody(updateDocumentSchema), documentController.updateDocument)
router.delete('/:id', documentController.deleteDocument)

export default router