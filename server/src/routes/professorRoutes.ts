import { Router } from 'express'
import * as professorController from '../controllers/professorController'
import { aiArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { complianceAuditSchema } from '../../schemas/auditSchemas'
import { addCommentSchema, submitGradeSchema } from '../../schemas/professorSchemas'

const router = Router()

router.post('/comments', validateBody(addCommentSchema), professorController.addComment)
router.get('/documents/:id/comments', professorController.getDocumentComments)
router.post('/grade', validateBody(submitGradeSchema), professorController.submitGrade)
router.get('/documents/:id/review', professorController.getDocumentReview)
router.post(
  '/audit/compliance',
  aiArcjet,
  validateBody(complianceAuditSchema),
  professorController.runComplianceAudit
)

export default router
