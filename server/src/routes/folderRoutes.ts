import { Router } from 'express'
import {
  addDocumentToFolder,
  createFolder,
  deleteFolder,
  enrollStudent,
  getClassRoster,
  getFolderChildren,
  getClassRubric,
  getFolderDocuments,
  getFolders,
  getMyClassGrades,
  joinClass,
  regenerateJoinCode,
  renameFolder,
  saveClassRubric,
  unenrollStudent,
} from '../controllers/folderController'
import { validateBody } from '../middleware/validate'
import { requireProfessorForClassFolder } from '../middleware/authMiddleware'
import {
  createFolderSchema,
  enrollStudentSchema,
  folderDocumentSchema,
  joinClassSchema,
  updateFolderSchema,
} from '../../schemas/folderSchemas'
import { classRubricSchema } from '../../schemas/professorSchemas'

const router = Router()

router.get('/', getFolders)
router.post('/', validateBody(createFolderSchema), requireProfessorForClassFolder, createFolder)
router.post('/join', validateBody(joinClassSchema), joinClass)
router.post('/:id/join-code', regenerateJoinCode)
router.put('/:id', validateBody(updateFolderSchema), renameFolder)
router.delete('/:id', deleteFolder)
router.get('/:id/documents', getFolderDocuments)
router.get('/:id/children', getFolderChildren)
router.post('/:id/documents', validateBody(folderDocumentSchema), addDocumentToFolder)
router.get('/:id/enrollments', getClassRoster)
router.post('/:id/enrollments', validateBody(enrollStudentSchema), enrollStudent)
router.delete('/:id/enrollments/:studentId', unenrollStudent)
/** A class's grading rubric: read by its professor and enrolled students, changed by its professor. */
router.get('/:id/rubric', getClassRubric)
router.put('/:id/rubric', validateBody(classRubricSchema), saveClassRubric)
/** The signed-in student's grades on their submissions in this class. */
router.get('/:id/my-grades', getMyClassGrades)

export default router
