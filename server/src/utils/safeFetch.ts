import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/** The most a downloaded page may weigh. */
const MAX_PAGE_BYTES = 1_000_000

/** Ports a page may be fetched from; anything else could be an internal service. */
const ALLOWED_PORTS = new Set(['', '80', '443'])

/** True when an IPv4 address is private, loopback, link-local, shared, multicast or reserved. */
function isBlockedIpv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

/**
 * True when an address must never be fetched on a user's behalf: internal networks, loopback and
 * cloud metadata endpoints. IPv4-mapped IPv6 addresses are checked as the IPv4 address they wrap.
 */
export function isBlockedAddress(address: string): boolean {
  const kind = isIP(address)
  if (kind === 4) return isBlockedIpv4(address)
  if (kind !== 6) return true
  const lower = address.toLowerCase()
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isBlockedIpv4(mapped[1])
  return (
    lower === '::' ||
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    /^fe[89ab]/.test(lower) ||
    lower.startsWith('ff') ||
    lower.startsWith('64:ff9b:') ||
    lower.startsWith('2001:db8')
  )
}

/** Parse a link and accept only plain http(s) on a standard port without embedded credentials. */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Not a valid link')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https links can be fetched')
  if (url.username || url.password) throw new Error('Links with credentials are not allowed')
  if (!ALLOWED_PORTS.has(url.port)) throw new Error('That port is not allowed')
  return url
}

/** Resolver used to check where a host points; replaceable so tests need no network. */
export type HostResolver = (hostname: string) => Promise<string[]>

/** Resolve a host name to every address it points at. */
const resolveHost: HostResolver = async (hostname) => {
  const found = await dnsLookup(hostname, { all: true })
  return found.map((entry) => entry.address)
}

interface FetchOptions {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  resolver?: HostResolver
  fetchImpl?: typeof fetch
  userAgent?: string
}

/** Read a response body as text, stopping after maxBytes. */
async function readLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done || !value) break
    total += value.length
    chunks.push(value)
    if (total >= maxBytes) {
      await reader.cancel()
      break
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks).subarray(0, maxBytes))
}

/**
 * Download a public web page as text. Every hop (including redirects) is checked: only http(s) on
 * standard ports, and the host must resolve to public addresses only, so a link can never reach
 * the server's own network. The download is capped in time and size. Returns null for pages that
 * are not HTML or plain text. A page that changes DNS answer between the check and the download is
 * the one gap this does not close.
 */
export async function fetchPublicPage(rawUrl: string, options: FetchOptions = {}): Promise<string | null> {
  const {
    timeoutMs = 8000,
    maxBytes = MAX_PAGE_BYTES,
    maxRedirects = 3,
    resolver = resolveHost,
    fetchImpl = fetch,
    userAgent = 'IntelliDocs-Originality/1.0',
  } = options

  let target = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const url = assertPublicHttpUrl(target)
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const addresses = isIP(host) ? [host] : await resolver(host)
    if (addresses.length === 0 || addresses.some(isBlockedAddress)) throw new Error('That address is not public')

    const response = await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': userAgent, Accept: 'text/html,text/plain;q=0.9' },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return null
      target = new URL(location, url).toString()
      continue
    }
    if (!response.ok) return null
    const type = response.headers.get('content-type') ?? ''
    if (!/text\/(html|plain)|application\/xhtml/i.test(type)) return null
    return readLimited(response, maxBytes)
  }
  throw new Error('Too many redirects')
}
