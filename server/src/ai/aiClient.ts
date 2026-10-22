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

type AIProvider = 'gemini' | 'groq' | 'openrouter' | 'mistral' | 'nvidia'

/** Read and validate the active AI provider configuration. */
function getConfig(): {
  provider: AIProvider
  model: string
  url: string
} {
  const provider = process.env.AI_PROVIDER as AIProvider | undefined
  const model = process.env.AI_MODEL

  if (!provider) throw new Error('AI_PROVIDER is not set')
  if (!model) throw new Error('AI_MODEL is not set')

  if (provider === 'gemini') {
    return {
      provider,
      model,
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    }
  }

  const urlMap: Record<Exclude<AIProvider, 'gemini'>, string> = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    mistral: 'https://api.mistral.ai/v1/chat/completions',
    nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  }

  return { provider, model, url: urlMap[provider] }
}

/**
 * Configured API keys in failover order. AI_API_KEY may hold several
 * comma-separated keys (e.g. "key1,key2"); each is tried in turn when the
 * provider answers 429/401/403.
 */
function getApiKeys(): string[] {
  return (process.env.AI_API_KEY ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0)
}

/** Request headers for a provider and one API key. */
function buildHeaders(provider: AIProvider, apiKey: string): Record<string, string> {
  if (provider === 'gemini') {
    return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }
  }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
}

/** 429 (quota) and 401/403 (invalid key) mean: try the next configured key. */
function isKeyRotationStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429
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
  const keys = getApiKeys()

  if (keys.length === 0) {
    throw new Error('AI_API_KEY is not set')
  }

  let lastError: AIClientError | null = null

  for (const key of keys) {
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: buildHeaders(config.provider, key),
        body: JSON.stringify(buildBody(messages, systemPrompt)),
        // Providers that queue requests (free tiers) can otherwise hang the
        // request forever; rotation only covers 429/401/403, so cap the wait.
        signal: AbortSignal.timeout(60_000),
      })

      const payload = (await response.json().catch(() => null)) as unknown

      if (!response.ok) {
        const details = readErrorDetails(payload)
        const error = new AIClientError(
          `AI request failed: ${response.status} ${details}`,
          response.status,
          details
        )
        if (isKeyRotationStatus(response.status)) {
          lastError = error
          continue
        }
        throw error
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

  throw lastError ?? new AIClientError('AI request failed', 500, 'AI request failed')
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