export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export class AIClientError extends Error {
  status: number
  details: string

  constructor(message: string, status: number, details: string) {
    super(message)
    this.name = 'AIClientError'
    this.status = status
    this.details = details
  }
}

export interface AIResponse {
  text: string
  provider: string
  model: string
}

export interface AIProviderSummary {
  provider: string
  model: string
}

type AIProvider = 'gemini' | 'groq' | 'openrouter' | 'mistral'

/** Read and validate the active AI provider configuration. */
function getConfig(): {
  provider: AIProvider
  model: string
  apiKey: string
  url: string
  headers: Record<string, string>
} {
  const provider = process.env.AI_PROVIDER as AIProvider | undefined
  const apiKey = process.env.AI_API_KEY
  const model = process.env.AI_MODEL

  if (!provider) throw new Error('AI_PROVIDER is not set')
  if (!apiKey) throw new Error('AI_API_KEY is not set')
  if (!model) throw new Error('AI_MODEL is not set')

  if (provider === 'gemini') {
    return {
      provider,
      model,
      apiKey,
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    }
  }

  const urlMap: Record<Exclude<AIProvider, 'gemini'>, string> = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    mistral: 'https://api.mistral.ai/v1/chat/completions',
  }

  return {
    provider,
    model,
    apiKey,
    url: urlMap[provider],
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  }
}

/** Convert app messages into the provider-specific request payload. */
function buildBody(messages: Message[], systemPrompt?: string): unknown {
  const { provider, model } = getConfig()

  if (provider === 'gemini') {
    const nonSystemMessages = messages.filter((message) => message.role !== 'system')

    return {
      ...(systemPrompt
        ? {
            system_instruction: {
              parts: [{ text: systemPrompt }],
            },
          }
        : {}),
      contents: nonSystemMessages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
    }
  }

  const finalMessages = systemPrompt
    ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
    : messages

  return { model, messages: finalMessages }
}

/** Extract plain text from the provider response payload. */
function readText(provider: AIProvider, payload: unknown): string {
  const data = payload as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    choices?: { message?: { content?: string } }[]
  }

  if (provider === 'gemini') {
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }

  return data.choices?.[0]?.message?.content ?? ''
}

/** Extract a readable provider error message from an error payload. */
function readErrorDetails(payload: unknown): string {
  const data = payload as {
    error?: {
      message?: string
      code?: number
      status?: string
    }
  }

  if (typeof data.error?.message === 'string' && data.error.message.trim()) {
    return data.error.message
  }

  return 'Unknown provider error'
}

/** Send a chat request through the configured AI provider. */
async function chat(messages: Message[], systemPrompt?: string): Promise<string> {
  const config = getConfig()

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify(buildBody(messages, systemPrompt)),
    })

    const payload = (await response.json().catch(() => null)) as unknown

    if (!response.ok) {
      const details = readErrorDetails(payload)
      throw new AIClientError(
        `AI request failed: ${response.status} ${details}`,
        response.status,
        details
      )
    }

    return readText(config.provider, payload)
  } catch (error) {
    if (error instanceof AIClientError) {
      throw error
    }

    throw new AIClientError(
      error instanceof Error ? error.message : 'AI request failed',
      500,
      'AI request failed'
    )
  }
}

/** Stream is not wired yet for the current providers. */
async function stream(
  messages: Message[],
  systemPrompt: string | undefined,
  onChunk: (chunk: string) => void
): Promise<void> {
  const text = await chat(messages, systemPrompt)
  onChunk(text)
}

/** Expose the active provider and model for API responses and logging. */
function getProviderSummary(): AIProviderSummary {
  const { provider, model } = getConfig()
  return { provider, model }
}

export const aiClient = { chat, stream, getProviderSummary }