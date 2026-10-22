import { aiClient } from '../aiClient'

/** Minimal fake fetch Response for the rotation assertions. */
function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('aiClient key rotation', () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it('fails over to the next key on 429 and returns the answer', async () => {
    process.env.AI_PROVIDER = 'nvidia'
    process.env.AI_MODEL = 'meta/llama-3.3-70b-instruct'
    process.env.AI_API_KEY = 'key-one,key-two'

    const seenAuth: string[] = []
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      seenAuth.push(headers.Authorization)
      if (headers.Authorization === 'Bearer key-one') {
        return fakeResponse(429, { error: { message: 'quota exceeded' } })
      }
      return fakeResponse(200, { choices: [{ message: { content: 'hello' } }] })
    }) as unknown as typeof fetch

    const text = await aiClient.chat([{ role: 'user', content: 'hi' }])

    expect(text).toBe('hello')
    expect(seenAuth).toEqual(['Bearer key-one', 'Bearer key-two'])
  })

  it('does not rotate on a genuine provider error', async () => {
    process.env.AI_PROVIDER = 'nvidia'
    process.env.AI_MODEL = 'meta/llama-3.3-70b-instruct'
    process.env.AI_API_KEY = 'key-one,key-two'

    const seenAuth: string[] = []
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      seenAuth.push(headers.Authorization)
      return fakeResponse(500, { error: { message: 'boom' } })
    }) as unknown as typeof fetch

    await expect(aiClient.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'AI request failed: 500'
    )
    expect(seenAuth).toEqual(['Bearer key-one'])
  })
})
