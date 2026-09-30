import { PassThrough } from 'stream'
import { readFile, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { streamToFileWithProgress } from '../streamDownload'
import { rtfToParagraphs, textToHtml, escapeHtml } from '../driveTextExtract'

/** Build a fake googleapis download stream with a declared content-length. */
function fakeStream(
  body: Buffer,
  declaredSize?: number
): PassThrough & { headers: Record<string, string> } {
  const stream = new PassThrough() as PassThrough & { headers: Record<string, string> }
  stream.headers = { 'content-length': String(declaredSize ?? body.length) }
  // Feed asynchronously so the consumer has time to attach its listeners.
  setImmediate(() => {
    // Chunked to prove the progress counter accumulates across multiple reads.
    for (let offset = 0; offset < body.length; offset += 7) {
      stream.write(body.subarray(offset, offset + 7))
    }
    stream.end()
  })
  return stream
}

let tempPath: string

beforeEach(() => {
  tempPath = path.join(os.tmpdir(), `stream-test-${crypto.randomUUID()}`)
})

afterEach(async () => {
  await rm(tempPath, { force: true }).catch(() => undefined)
})

describe('streamToFileWithProgress', () => {
  it('writes the full body to disk', async () => {
    const body = Buffer.from('a'.repeat(5000))
    const result = await streamToFileWithProgress(fakeStream(body), tempPath)

    expect(result.bytes).toBe(5000)
    expect(result.size).toBe(5000)
    expect((await readFile(tempPath)).length).toBe(5000)
  })

  it('reports monotonically increasing progress that stays under 100', async () => {
    const body = Buffer.from('b'.repeat(4000))
    const seen: number[] = []

    await streamToFileWithProgress(fakeStream(body), tempPath, (p) => seen.push(p))

    expect(seen.length).toBeGreaterThan(0)
    // The download clamps at 99: 100 is reserved for the convert step, so a
    // client never shows "done" while conversion is still running.
    expect(Math.max(...seen)).toBeLessThanOrEqual(99)
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
    }
  })

  it('emits far fewer updates than chunks for a large file', async () => {
    // 500KB in 7-byte chunks is ~73k chunks; progress must be throttled to
    // whole percents so Redis is not hammered with writes.
    const body = Buffer.from('c'.repeat(500_000))
    const seen: number[] = []

    await streamToFileWithProgress(fakeStream(body), tempPath, (p) => seen.push(p))

    expect(seen.length).toBeLessThanOrEqual(100)
  })

  it('handles a multi-byte body without corrupting the byte count', async () => {
    const body = Buffer.from('héllo wörld '.repeat(100), 'utf-8')
    const result = await streamToFileWithProgress(fakeStream(body), tempPath)

    expect(result.bytes).toBe(body.length)
    expect((await readFile(tempPath)).equals(body)).toBe(true)
  })

  it('skips percentage reporting when content-length is absent', async () => {
    const body = Buffer.from('d'.repeat(1000))
    const stream = new PassThrough() as PassThrough & { headers: Record<string, string> }
    stream.headers = {}
    setImmediate(() => stream.end(body))

    const seen: number[] = []
    const result = await streamToFileWithProgress(stream, tempPath, (p) => seen.push(p))

    // An indeterminate stream must not invent a percentage.
    expect(seen).toEqual([])
    expect(result.size).toBe(1000)
  })

  it('works with no progress callback', async () => {
    const body = Buffer.from('e'.repeat(200))
    const result = await streamToFileWithProgress(fakeStream(body), tempPath)
    expect(result.size).toBe(200)
  })

  it('propagates a source stream error instead of writing a partial file', async () => {
    const stream = new PassThrough() as PassThrough & { headers: Record<string, string> }
    stream.headers = { 'content-length': '1000' }
    setImmediate(() => {
      stream.write(Buffer.from('partial'))
      stream.destroy(new Error('connection reset by peer'))
    })

    await expect(streamToFileWithProgress(stream, tempPath)).rejects.toThrow(
      'connection reset by peer'
    )
  })
})

describe('textToHtml', () => {
  it('wraps each non-empty line in a paragraph', () => {
    expect(textToHtml('one\ntwo\n\nthree')).toBe('<p>one</p>\n<p>two</p>\n<p>three</p>')
  })

  it('escapes HTML so imported text cannot inject markup', () => {
    expect(textToHtml('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
    )
  })

  it('returns an empty string for blank input', () => {
    expect(textToHtml('')).toBe('')
    expect(textToHtml('   \n  \n')).toBe('')
  })
})

describe('rtfToParagraphs', () => {
  it('strips control words and keeps visible text', () => {
    const rtf = Buffer.from('{\\rtf1\\ansi{\\fonttbl\\f0 Arial;}\\pard Hello world\\par}')
    const html = rtfToParagraphs(rtf)
    expect(html).toContain('Hello world')
    // No control words may survive into the output.
    expect(html).not.toContain('\\rtf')
    expect(html).not.toContain('\\pard')
  })

  it('converts unicode escapes using decimal, as RTF specifies', () => {
    // RTF `\u9731` is decimal 9731, which is the snowman. Treating it as hex
    // produced U+9731 (a CJK glyph) instead.
    const rtf = Buffer.from('{\\rtf1 \\u9731?}')
    expect(rtfToParagraphs(rtf)).toContain(String.fromCodePoint(9731))
    expect(rtfToParagraphs(rtf)).not.toContain(String.fromCodePoint(0x9731))
  })

  it('escapes markup recovered from RTF', () => {
    const rtf = Buffer.from('{\\rtf1 <b>bold</b>}')
    expect(rtfToParagraphs(rtf)).toContain('&lt;b&gt;')
  })
})

describe('escapeHtml', () => {
  it('escapes ampersands before angle brackets', () => {
    // Order matters: escaping & last would double-encode the other entities.
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;')
  })
})
