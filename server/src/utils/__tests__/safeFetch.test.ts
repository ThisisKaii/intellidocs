import { assertPublicHttpUrl, fetchPublicPage, isBlockedAddress } from '../safeFetch'

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255', '::1', '::', 'fc00::1', 'fd12:3456::1',
    'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', 'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  it.each(['8.8.8.8', '93.184.216.34', '172.15.0.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false)
  })
})

describe('assertPublicHttpUrl', () => {
  it('accepts plain http(s) links on standard ports', () => {
    expect(assertPublicHttpUrl('https://example.com/page').hostname).toBe('example.com')
    expect(assertPublicHttpUrl('http://example.com:80/page').port).toBe('')
  })

  it.each(['file:///etc/passwd', 'ftp://example.com', 'javascript:alert(1)', 'https://user:pw@example.com', 'http://example.com:8080', 'nonsense'])(
    'rejects %s',
    (link) => {
      expect(() => assertPublicHttpUrl(link)).toThrow()
    },
  )
})

/** A fetch stand-in that answers each URL from a table. */
function fakeFetch(table: Record<string, { status?: number; headers?: Record<string, string>; body?: string }>): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const key = String(input)
    const entry = table[key]
    if (!entry) throw new Error(`unexpected request to ${key}`)
    return new Response(entry.body ?? '', { status: entry.status ?? 200, headers: entry.headers ?? { 'content-type': 'text/html' } })
  }) as typeof fetch
}

const publicHost = async (): Promise<string[]> => ['93.184.216.34']

describe('fetchPublicPage', () => {
  it('returns the page text', async () => {
    const text = await fetchPublicPage('https://example.com/a', {
      resolver: publicHost,
      fetchImpl: fakeFetch({ 'https://example.com/a': { body: '<p>Hello</p>' } }),
    })
    expect(text).toBe('<p>Hello</p>')
  })

  it('refuses a host that resolves to an internal address', async () => {
    await expect(
      fetchPublicPage('https://sneaky.example/a', { resolver: async () => ['10.0.0.5'], fetchImpl: fakeFetch({}) }),
    ).rejects.toThrow(/not public/)
  })

  it('refuses a host with any internal address among its answers', async () => {
    await expect(
      fetchPublicPage('https://mixed.example/a', { resolver: async () => ['93.184.216.34', '127.0.0.1'], fetchImpl: fakeFetch({}) }),
    ).rejects.toThrow(/not public/)
  })

  it('refuses an internal IP written directly in the link', async () => {
    await expect(fetchPublicPage('http://169.254.169.254/latest/meta-data', { fetchImpl: fakeFetch({}) })).rejects.toThrow(/not public/)
  })

  it('follows a redirect but checks the new address too', async () => {
    const resolver = async (host: string): Promise<string[]> => (host === 'internal.example' ? ['192.168.0.9'] : ['93.184.216.34'])
    const fetchImpl = fakeFetch({
      'https://example.com/go': { status: 302, headers: { location: 'https://internal.example/secret' } },
      'https://example.com/ok': { status: 302, headers: { location: '/final' } },
      'https://example.com/final': { body: 'done' },
    })
    await expect(fetchPublicPage('https://example.com/go', { resolver, fetchImpl })).rejects.toThrow(/not public/)
    expect(await fetchPublicPage('https://example.com/ok', { resolver, fetchImpl })).toBe('done')
  })

  it('gives up after too many redirects', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/loop': { status: 302, headers: { location: 'https://example.com/loop' } },
    })
    await expect(fetchPublicPage('https://example.com/loop', { resolver: publicHost, fetchImpl })).rejects.toThrow(/redirects/)
  })

  it('returns null for pages that are not HTML or text, and for error pages', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/pdf': { headers: { 'content-type': 'application/pdf' }, body: '%PDF' },
      'https://example.com/missing': { status: 404 },
    })
    expect(await fetchPublicPage('https://example.com/pdf', { resolver: publicHost, fetchImpl })).toBeNull()
    expect(await fetchPublicPage('https://example.com/missing', { resolver: publicHost, fetchImpl })).toBeNull()
  })

  it('stops reading a page at the size limit', async () => {
    const big = 'x'.repeat(5000)
    const text = await fetchPublicPage('https://example.com/big', {
      resolver: publicHost,
      maxBytes: 1000,
      fetchImpl: fakeFetch({ 'https://example.com/big': { body: big } }),
    })
    expect(text?.length).toBe(1000)
  })
})
