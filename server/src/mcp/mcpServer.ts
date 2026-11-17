import { Router } from 'express'
import { ZodError } from 'zod'
import { validateBody } from '../middleware/validate'
import { aiArcjet } from '../middleware/arcjet'
import { mcpToolCallSchema } from '../../schemas/mcpSchemas'
import { findTool, listTools } from './toolRegistry'

const router = Router()

/** Every tool: its name, what it is for, what it changes and its arguments. */
router.get('/tools', aiArcjet, (_req, res) => {
  res.json({ tools: listTools() })
})

router.post('/call', aiArcjet, validateBody(mcpToolCallSchema), async (req, res) => {
  const userId = req.user?.id
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const { tool: name, args } = req.body as { tool: string; args: Record<string, unknown> }
  const tool = findTool(name)
  if (!tool) return res.status(400).json({ error: `Unknown tool: ${name}` })

  try {
    return res.json(await tool.call({ userId, email: req.user?.email }, args))
  } catch (error) {
    // Bad tool arguments are the caller's mistake: say which one, as a 400.
    if (error instanceof ZodError) {
      const issue = error.issues[0]
      return res.status(400).json({ error: issue ? `${issue.path.join('.') || 'args'}: ${issue.message}` : 'Invalid tool arguments' })
    }
    const message = error instanceof Error ? error.message : 'Tool execution failed'
    return res.status(500).json({ error: message })
  }
})

export default router
