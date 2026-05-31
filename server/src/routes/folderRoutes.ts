import { Router } from 'express'
import {
  addDocumentToFolder,
  createFolder,
  deleteFolder,
  getFolderDocuments,
  getFolders,
  renameFolder,
} from '../controllers/folderController'
import { validateBody } from '../middleware/validate'
import {
  createFolderSchema,
  folderDocumentSchema,
  updateFolderSchema,
} from '../../schemas/folderSchemas'

const router = Router()

router.get('/', getFolders)
router.post('/', validateBody(createFolderSchema), createFolder)
router.put('/:id', validateBody(updateFolderSchema), renameFolder)
router.delete('/:id', deleteFolder)
router.get('/:id/documents', getFolderDocuments)
router.post('/:id/documents', validateBody(folderDocumentSchema), addDocumentToFolder)

export default router
