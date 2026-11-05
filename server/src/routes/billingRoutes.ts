import { Router } from 'express'
import * as billingController from '../controllers/billingController'
import { authArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { checkoutSchema } from '../../schemas/billingSchemas'

/** Mock Pro subscription (demo SaaS flow). Mounted behind authMiddleware. */
const router = Router()

router.get('/', billingController.getBilling)
router.post('/checkout', authArcjet, validateBody(checkoutSchema), billingController.checkout)
router.post('/cancel', authArcjet, billingController.cancel)
router.post('/resume', authArcjet, billingController.resume)

export default router
