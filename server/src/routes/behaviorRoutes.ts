import { Router } from 'express'
import { getBehaviorSummary, logBehaviorEvent, triggerAggregation, triggerFeatureExtraction, triggerFeatureExport } from '../controllers/behaviorController'
import { validateBody } from '../middleware/validate'
import { behaviorEventSchema } from '../../schemas/behaviorSchemas'

const router = Router()

router.post('/events', validateBody(behaviorEventSchema), logBehaviorEvent)
router.get('/summary/:documentId', getBehaviorSummary)
router.post('/aggregate', triggerAggregation)
router.post('/features', triggerFeatureExtraction)
router.post('/export', triggerFeatureExport)

export default router 