import { Request, Response } from 'express'
import * as subscriptionModel from '../models/subscriptionModel'
import type { SubscriptionStatus } from '../types/index'

type SubscriptionAction = (userId: string) => Promise<SubscriptionStatus>

/** Run one subscription action for the signed-in user and send the resulting status. */
async function respond(req: Request, res: Response, action: SubscriptionAction, failure: string): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    res.status(200).json(await action(userId))
  } catch (error) {
    console.error(`${failure}:`, error instanceof Error ? error.message : error)
    res.status(500).json({ error: failure })
  }
}

/** GET /billing: the signed-in user's mock subscription. */
export async function getBilling(req: Request, res: Response): Promise<void> {
  await respond(req, res, subscriptionModel.getSubscription, 'Failed to load subscription')
}

/** POST /billing/checkout: start the mock Pro plan (no payment is processed). */
export async function checkout(req: Request, res: Response): Promise<void> {
  await respond(req, res, subscriptionModel.startProSubscription, 'Checkout failed')
}

/** POST /billing/cancel: cancel at the end of the current period. */
export async function cancel(req: Request, res: Response): Promise<void> {
  await respond(req, res, subscriptionModel.cancelSubscription, 'Cancellation failed')
}

/** POST /billing/resume: undo a pending cancellation. */
export async function resume(req: Request, res: Response): Promise<void> {
  await respond(req, res, subscriptionModel.resumeSubscription, 'Resume failed')
}
