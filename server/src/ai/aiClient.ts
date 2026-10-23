import { getAIProfiles } from './aiProfiles'
import type { AIProfile, AIProvider } from './aiProfiles'

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

/** Request URL for a profile (Gemini's native REST API, everyone else OpenAI-compatible). */
function buildUrl(profile: AIProfile): string {
  if (profile.provider === 'gemini') {
    return `https://generativelanguage.googleapis.com/v1beta/models/${profile.model}:generateContent`
  }

  const urlMap: Record<Exclude<AIProvider, 'gemini'>, string> = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    mistral: 'https://api.mistral.ai/v1/chat/completions',
    nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  }
  return urlMap[profile.provider]
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

/**
 * Whether the next profile should be tried after this failure: the provider is
 * down or overloaded (5xx, 408), the model is unknown there (404), or every key
 * was rejected. Malformed requests (400, 422) would fail everywhere, so they stop.
 */
function shouldFailover(status: number): boolean {
  return status >= 500 || status === 408 || status === 404 || isKeyRotationStatus(status)
}

/** Convert app messages into the provider-specific request payload. */
function buildBody(profile: AIProfile, messages: Message[], systemPrompt?: string): unknown {
  if (profile.provider === 'gemini') {
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

  return { model: profile.model, messages: finalMessages }
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

/** Longest a single provider attempt may take before failing over. */
const REQUEST_TIMEOUT_MS = 25_000

/** Send one request through a single profile, rotating its API keys on quota/auth errors. */
async function chatWithProfile(
  profile: AIProfile,
  messages: Message[],
  systemPrompt?: string
): Promise<string> {
  let lastError: AIClientError | null = null

  for (const key of profile.apiKeys) {
    try {
      const response = await fetch(buildUrl(profile), {
        method: 'POST',
        headers: buildHeaders(profile.provider, key),
        body: JSON.stringify(buildBody(profile, messages, systemPrompt)),
        // Providers that queue requests (free tiers) can otherwise hang the
        // request forever; rotation only covers 429/401/403, so cap the wait
        // short enough that failover still reaches the next profile in time.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

      return readText(profile.provider, payload)
    } catch (error) {
      if (error instanceof AIClientError) {
        throw error
      }

      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new AIClientError('The AI provider took too long to respond', 504, 'timeout')
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

/**
 * Send a chat request through the configured AI profiles in priority order.
 * The first profile that answers wins; a provider outage, an unknown model or
 * exhausted keys fall through to the next profile, while a malformed request
 * (400/422) is reported immediately.
 */
async function chatWithMeta(messages: Message[], systemPrompt?: string): Promise<AIResponse> {
  const profiles = getAIProfiles()
  let lastError: AIClientError | null = null

  for (const profile of profiles) {
    try {
      const text = await chatWithProfile(profile, messages, systemPrompt)
      return { text, provider: profile.provider, model: profile.model }
    } catch (error) {
      if (!(error instanceof AIClientError) || !shouldFailover(error.status)) throw error
      lastError = error
      console.warn(`[AI] ${profile.provider}/${profile.model} failed (${error.status})`)
    }
  }

  throw lastError ?? new AIClientError('AI request failed', 500, 'AI request failed')
}

/** Send a chat request and return just the answer text. */
async function chat(messages: Message[], systemPrompt?: string): Promise<string> {
  return (await chatWithMeta(messages, systemPrompt)).text
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

/** Expose the primary provider and model for API responses and logging. */
function getProviderSummary(): AIProviderSummary {
  const [primary] = getAIProfiles()
  return { provider: primary.provider, model: primary.model }
}

/** Every configured provider/model in failover order (profile 1 first). */
function getProfileSummaries(): AIProviderSummary[] {
  return getAIProfiles().map(({ provider, model }) => ({ provider, model }))
}

export const aiClient = { chat, chatWithMeta, stream, getProviderSummary, getProfileSummaries }
