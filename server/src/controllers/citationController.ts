import type { Request, Response } from 'express'
import { lookupCitation } from '../skills/lookupCitation'

/** Find a reference's details from a DOI, link or title so the user does not type them. */
export async function lookup(req: Request, res: Response): Promise<void> {
  try {
    const found = await lookupCitation(req.body.query as string)
    if (!found) {
      res.status(404).json({ error: 'No matching source found. Check the DOI or try more of the title.' })
      return
    }
    res.status(200).json(found)
  } catch (error) {
    console.warn('Citation lookup failed:', error)
    res.status(502).json({ error: 'The citation service did not respond. Try again in a moment.' })
  }
}
