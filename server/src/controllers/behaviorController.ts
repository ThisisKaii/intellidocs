import { Request, Response } from "express";
import { appendBehaviorEvent } from "../models/behaviorModel";
import { BehaviorEvent } from "../types/index";

export async function logBehaviorEvent(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const body = req.body as BehaviorEvent

    console.log('Behavior event hit:', { userId, body })

    if (!userId) {
      res.status(401).json({ message: "Unauthorized" })
      return
    }

    if (!body?.action || !body?.timestamp || !body?.documentId) {
      res.status(400).json({ error: 'Invalid behavior event payload' })
      return
    }

    try {
      await appendBehaviorEvent(userId, body)
    } catch (err) {
      console.error('Redis append failed:', err)
      res.status(500).json({ error: 'Redis write failed' })
      return
    }

    res.status(202).json({ message: "Behavior event logged" })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ message: message })
  }
}
