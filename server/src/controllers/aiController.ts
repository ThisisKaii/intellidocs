import { Request, Response } from 'express'
import { aiClient } from '../ai/aiClient'
import { consumeAIQuota } from '../models/aiQuotaModel'

interface ErrorWithStatus {
  status?: number
}

interface AIChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AIChatBody {
  message: string
  documentId?: string
  documentTitle?: string
  documentContent?: string
  history?: AIChatMessage[]
}

interface AIProviderSummary {
  provider: string
  model: string
}

/** Read the active AI provider summary from the environment. */
function getProviderSummary(): AIProviderSummary {
  return {
    provider: process.env.AI_PROVIDER ?? 'unknown',
    model: process.env.AI_MODEL ?? 'unknown',
  }
}

/** Build a compact document context block for the chat prompt. */
function buildDocumentContext(body: AIChatBody): string {
  const content = body.documentContent?.trim() ?? ''
  const normalizedContent = content.replace(/\s+/g, ' ').trim()
  const paragraphs = content
    .split('\n')
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
  const wordCount = normalizedContent ? normalizedContent.split(' ').length : 0
  const openingExcerpt = normalizedContent.slice(0, 1200)
  const closingExcerpt =
    normalizedContent.length > 1200
      ? normalizedContent.slice(Math.max(normalizedContent.length - 600, 0))
      : ''

  return [
    body.documentId ? `Document ID: ${body.documentId}` : 'Document ID: unavailable',
    body.documentTitle?.trim()
      ? `Document title: ${body.documentTitle.trim()}`
      : 'Document title: unavailable',
    `Word count: ${wordCount}`,
    `Paragraph count: ${paragraphs.length}`,
    openingExcerpt
      ? `Opening excerpt:\n${openingExcerpt}`
      : 'Opening excerpt: unavailable',
    closingExcerpt
      ? `Recent excerpt:\n${closingExcerpt}`
      : undefined,
  ]
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .join('\n\n')
}

/** Build the system prompt used for the first chatbot pass. */
function buildSystemPrompt(body: AIChatBody): string {
  return [
    'You are the IntelliDocs AI assistant.',
    'You help users with writing, structure, clarity, and document formatting advice.',
    'Be concise, practical, and helpful.',
    'Use the provided document context to ground your answer.',
    'Prefer discussing the title, structure, and visible excerpts instead of inventing missing content.',
    'Do not claim that you already changed the document.',
    'Do not claim that formatting was applied.',
    'If the user asks for a change, explain what should be changed and why.',
    'This first integration is chat-only, so respond with guidance rather than pretending to execute actions.',
    '',
    buildDocumentContext(body),
  ].join('\n')
}

/** Convert recent chat history into provider-ready messages. */
function buildHistoryMessages(
  history: AIChatMessage[] | undefined
): { role: 'user' | 'assistant'; content: string }[] {
  return (history ?? [])
    .filter((entry) => entry.content.trim().length > 0)
    .slice(-8)
    .map((entry) => ({
      role: entry.role,
      content: entry.content.trim(),
    }))
}

/** Handle authenticated AI chatbot requests. */
export async function chatWithAI(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const body = req.body as AIChatBody
    const message = body.message?.trim()

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!message) {
      res.status(400).json({ error: 'Message is required' })
      return
    }

    const quota = await consumeAIQuota(userId, 'chat')
    if (!quota.allowed) {
      res.status(429).json({
        error: 'AI request quota exceeded',
        quota: {
          limit: quota.limit,
          remaining: quota.remaining,
          resetInSeconds: quota.resetInSeconds,
        },
      })
      return
    }

    const reply = await aiClient.chat(
      [
        ...buildHistoryMessages(body.history),
        { role: 'user', content: message },
      ],
      buildSystemPrompt(body)
    )

    const providerSummary = getProviderSummary()

    res.status(200).json({
      reply,
      provider: providerSummary.provider,
      model: providerSummary.model,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'AI chat request failed'
    const status =
      typeof (error as ErrorWithStatus | undefined)?.status === 'number'
        ? (error as ErrorWithStatus).status as number
        : 500

    res.status(status).json({ error: message })
  }
}