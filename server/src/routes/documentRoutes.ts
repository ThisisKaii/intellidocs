import { Router } from 'express'
import multer from 'multer'
import * as documentController from '../controllers/documentController'
import * as shareController from '../controllers/shareController'
import * as documentOpenController from '../controllers/documentOpenController'
import { validateBody, validateParams, validateQuery } from '../middleware/validate'
import {
  createDocumentSchema,
  documentIdParamSchema,
  joinCodeSchema,
  updateDocumentSchema,
} from '../../schemas/documentSchemas'
import { importQuerySchema } from '../../schemas/importSchemas'

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

/**
 * Multer configuration for editor image uploads.
 * Memory storage — 10 MB cap, MIME list mirrors the document-images bucket.
 */
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Image type not allowed: ${file.mimetype}`))
    }
  },
})

router.get('/', documentController.getAllDocuments)
router.get('/shared', documentController.getSharedDocuments)
router.get('/trash', documentController.getTrashDocuments)
/** Documents opened in the last 7 days, most recently opened first. Must be before /:id */
router.get('/recent', documentOpenController.listRecent)
/** Open someone's document with its short share code. Must be before /:id */
router.post('/join-code', validateBody(joinCodeSchema), shareController.joinWithCode)

router.post('/', validateBody(createDocumentSchema), documentController.createDocument)

/** Import a local file and create a document from it. Must be before /:id */
router.post('/import', validateQuery(importQuerySchema), upload.single('file'), documentController.importDocument)

/** Background import jobs for the caller. Must be before /:id */
router.get('/imports', documentController.listImportJobs)
router.get('/imports/:jobId', documentController.getImportJobStatus)

/** Upload an editor image and get back its public URL. Must be before /:id */
router.post('/images', imageUpload.single('image'), documentController.uploadImage)

/** The caller just opened this document (feeds "Recent"). */
router.post('/:id/opened', validateParams(documentIdParamSchema), documentOpenController.markOpened)

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
router.put('/:id/share-link', shareController.updateShareLink)
router.post('/:id/share-code', shareController.createShareCode)
router.delete('/:id/share-link', shareController.revokeShareLink)

/** Undo-lock version history — owner can list and restore snapshots. */
router.get('/:id/versions', documentController.getDocumentVersions)
router.post('/:id/versions/:versionId/restore', documentController.restoreDocumentVersion)

export default router