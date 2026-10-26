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

  it('sends omniroute requests to its configured base URL with the profile key', async () => {
    process.env.AI_PROVIDER = 'omniroute'
    process.env.AI_MODEL = 'free-combo'
    process.env.AI_API_KEY = 'sk-local'
    process.env.OMNIROUTE_BASE_URL = 'http://localhost:20128/v1/'

    const seen: Array<{ url: string; auth: string }> = []
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      seen.push({ url: String(url), auth: headers.Authorization })
      return fakeResponse(200, { choices: [{ message: { content: 'routed' } }] })
    }) as unknown as typeof fetch

    expect(await aiClient.chat([{ role: 'user', content: 'hi' }])).toBe('routed')
    expect(seen).toEqual([{ url: 'http://localhost:20128/v1/chat/completions', auth: 'Bearer sk-local' }])
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

  it('reports a timed-out request as a 504 so the next profile can take over', async () => {
    process.env.AI_PROVIDER = 'nvidia'
    process.env.AI_MODEL = 'meta/llama-3.3-70b-instruct'
    process.env.AI_API_KEY = 'key-one'

    global.fetch = jest.fn(async () => {
      const timeout = new Error('The operation was aborted due to timeout')
      timeout.name = 'TimeoutError'
      throw timeout
    }) as unknown as typeof fetch

    await expect(aiClient.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      status: 504,
      message: 'The AI provider took too long to respond',
    })
  })
})

describe('aiClient profile failover', () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  /** Two profiles: Gemini first, NVIDIA second. */
  function configureTwoProfiles(): void {
    process.env.AI_PROVIDER = 'gemini'
    process.env.AI_MODEL = 'gemini-2.5-flash'
    process.env.AI_API_KEY = 'gem-key'
    process.env.AI_PROVIDER_2 = 'nvidia'
    process.env.AI_MODEL_2 = 'meta/llama-3.2-11b-vision-instruct'
    process.env.AI_API_KEY_2 = 'nv-key'
  }

  it('answers from the second profile when the first provider is down', async () => {
    configureTwoProfiles()
    const urls: string[] = []
    global.fetch = jest.fn(async (url: unknown) => {
      urls.push(String(url))
      if (String(url).includes('generativelanguage')) {
        return fakeResponse(503, { error: { message: 'overloaded' } })
      }
      return fakeResponse(200, { choices: [{ message: { content: 'from llama' } }] })
    }) as unknown as typeof fetch

    const result = await aiClient.chatWithMeta([{ role: 'user', content: 'hi' }])

    expect(result).toEqual({ text: 'from llama', provider: 'nvidia', model: 'meta/llama-3.2-11b-vision-instruct' })
    expect(urls).toHaveLength(2)
  })

  it('fails over when every key of the first profile is rejected', async () => {
    configureTwoProfiles()
    global.fetch = jest.fn(async (url: unknown) =>
      String(url).includes('generativelanguage')
        ? fakeResponse(429, { error: { message: 'quota' } })
        : fakeResponse(200, { choices: [{ message: { content: 'second' } }] })
    ) as unknown as typeof fetch

    expect(await aiClient.chat([{ role: 'user', content: 'hi' }])).toBe('second')
  })

  it('does not fail over on a malformed request', async () => {
    configureTwoProfiles()
    const fetchMock = jest.fn(async () => fakeResponse(400, { error: { message: 'bad request' } }))
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(aiClient.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('AI request failed: 400')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws the last error when every profile fails', async () => {
    configureTwoProfiles()
    global.fetch = jest.fn(async () => fakeResponse(500, { error: { message: 'down' } })) as unknown as typeof fetch

    await expect(aiClient.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('AI request failed: 500')
  })
})
