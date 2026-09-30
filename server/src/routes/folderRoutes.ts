import { Router } from 'express'
import {
  addDocumentToFolder,
  createFolder,
  deleteFolder,
  enrollStudent,
  getClassRoster,
  getFolderDocuments,
  getFolders,
  renameFolder,
  unenrollStudent,
} from '../controllers/folderController'
import { validateBody } from '../middleware/validate'
import {
  createFolderSchema,
  enrollStudentSchema,
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
router.get('/:id/enrollments', getClassRoster)
router.post('/:id/enrollments', validateBody(enrollStudentSchema), enrollStudent)
router.delete('/:id/enrollments/:studentId', unenrollStudent)

export default router
