import { Router } from 'express'
import * as professorController from '../controllers/professorController'
import { aiArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { complianceAuditSchema } from '../../schemas/auditSchemas'
import { addCommentSchema, submitGradeSchema } from '../../schemas/professorSchemas'
import { documentIdParamSchema } from '../../schemas/documentSchemas'
import { validateParams } from '../middleware/validate'

const router = Router()

router.post('/comments', validateBody(addCommentSchema), professorController.addComment)
router.get('/documents/:id/comments', validateParams(documentIdParamSchema), professorController.getDocumentComments)
router.post('/grade', validateBody(submitGradeSchema), professorController.submitGrade)
router.get('/documents/:id/review', validateParams(documentIdParamSchema), professorController.getDocumentReview)
router.get('/folders/:id/similarity', professorController.getFolderSimilarity)
router.post(
  '/audit/compliance',
  aiArcjet,
  validateBody(complianceAuditSchema),
  professorController.runComplianceAudit
)

export default router
