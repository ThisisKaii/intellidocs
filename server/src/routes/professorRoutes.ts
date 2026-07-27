import { Router } from 'express'
import * as professorController from '../controllers/professorController'
import { validateBody } from '../middleware/validate'
import { addCommentSchema, submitGradeSchema } from '../../schemas/professorSchemas'

const router = Router()

router.post('/comments', validateBody(addCommentSchema), professorController.addComment)
router.get('/documents/:id/comments', professorController.getDocumentComments)
router.post('/grade', validateBody(submitGradeSchema), professorController.submitGrade)
router.get('/documents/:id/review', professorController.getDocumentReview)

export default router
