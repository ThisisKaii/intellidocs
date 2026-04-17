import { Router } from 'express'
import { logBehaviorEvent, triggerAggregation, triggerFeatureExtraction, triggerFeatureExport } from '../controllers/behaviorController'

const router = Router()

router.post('/events', logBehaviorEvent)
router.post('/aggregate', triggerAggregation)
router.post('/features', triggerFeatureExtraction)
router.post('/export', triggerFeatureExport)

export default router 