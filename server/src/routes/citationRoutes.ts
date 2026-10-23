import { Router } from 'express'
import { lookup } from '../controllers/citationController'
import { aiArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { lookupCitationSchema } from '../../schemas/citationSchemas'

const router = Router()

router.post('/lookup', aiArcjet, validateBody(lookupCitationSchema), lookup)

export default router
