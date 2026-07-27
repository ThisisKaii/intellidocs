import { Response } from 'express'
import { AuthenticatedRequest } from '../types/express'
import * as notificationModel from '../models/notificationModel'

export async function getUserNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const notifications = await notificationModel.getUserNotifications(userId)
    res.json(notifications)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch notifications'
    res.status(500).json({ error: message })
  }
}

export async function markAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const notificationId = req.params.id
    const updated = await notificationModel.markNotificationAsRead(notificationId, userId)
    res.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update notification'
    res.status(500).json({ error: message })
  }
}
