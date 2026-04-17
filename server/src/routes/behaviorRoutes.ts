import { Router } from 'express'
import { logBehaviorEvent } from '../controllers/behaviorController'

const router = Router()

router.post('/events', logBehaviorEvent)

export default router 