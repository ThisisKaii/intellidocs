import { Router } from 'express'
import { predictFormatting } from '../controllers/predictionController'

const router = Router()

router.post('/predict', predictFormatting)

export default router