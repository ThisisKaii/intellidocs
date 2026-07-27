import { Router } from 'express'
import * as notificationController from '../controllers/notificationController'

const router = Router()

router.get('/', notificationController.getUserNotifications)
router.put('/:id/read', notificationController.markAsRead)

export default router
