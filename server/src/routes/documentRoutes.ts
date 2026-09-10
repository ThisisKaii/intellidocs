import { Router } from 'express'
import multer from 'multer'
import * as documentController from '../controllers/documentController'
import * as shareController from '../controllers/shareController'
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
router.get('/shared', documentController.getSharedDocuments)
router.get('/trash', documentController.getTrashDocuments)

router.post('/', validateBody(createDocumentSchema), documentController.createDocument)

/** Import a local file and create a document from it. Must be before /:id */
router.post('/import', upload.single('file'), documentController.importDocument)

router.get('/:id', documentController.getDocument)
router.put('/:id', validateBody(updateDocumentSchema), documentController.updateDocument)

/** Trash / restore / permanent-delete. Soft-delete must come before hard delete. */
router.post('/:id/trash', documentController.trashDocument)
router.post('/:id/restore', documentController.restoreTrashDocument)
router.delete('/:id/permanent', documentController.purgeTrashDocument)
router.delete('/:id', documentController.deleteDocument)

/** Sharing — owner-managed shares for a specific document. */
router.get('/:id/shares', shareController.getSharesForDocument)
router.post('/:id/shares', shareController.createShare)
router.put('/:id/shares/:shareId', shareController.updateShare)
router.delete('/:id/shares/:shareId', shareController.deleteShare)

/** Copyable share links — owner manages, recipients open with ?share=token. */
router.get('/:id/share-link', shareController.getShareLink)
router.post('/:id/share-link', shareController.createShareLink)
router.delete('/:id/share-link', shareController.revokeShareLink)

export default router