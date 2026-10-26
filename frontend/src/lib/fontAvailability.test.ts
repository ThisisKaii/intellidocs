import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fontFamiliesIn, missingFonts } from './fontAvailability'

/** A canvas whose text width depends on the first family of the font stack, like a real browser's. */
function stubCanvas(installed: string[]): void {
  const widths: Record<string, number> = { monospace: 100, serif: 110, 'sans-serif': 120 }
  const context = {
    font: '',
    measureText(): { width: number } {
      const stack = context.font.replace(/^72px\s+/, '').split(',').map((family) => family.replace(/"/g, '').trim())
      return { width: installed.includes(stack[0]) ? 333 : widths[stack[stack.length - 1]] }
    },
  }
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'canvas' ? ({ getContext: () => context } as unknown as HTMLCanvasElement) : document.createElementNS('http://www.w3.org/1999/xhtml', tag)) as typeof document.createElement)
}

describe('fontFamiliesIn', () => {
  it('lists the first family of each stack once', () => {
    const html = `<span style="font-family:'Bookman Old Style', serif">a</span><span style="font-family:&quot;Bookman Old Style&quot;, serif">b</span><p style="font-family: Georgia, serif">c</p>`
    expect(fontFamiliesIn(html)).toEqual(['Bookman Old Style', 'Georgia'])
  })
})

describe('missingFonts', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('reports an uninstalled font but not an installed one or one with a bundled twin', async () => {
    stubCanvas(['Georgia'])
    const fresh = await import('./fontAvailability')
    expect(fresh.missingFonts(['Bookman Old Style', 'Georgia', 'Times New Roman', 'serif'])).toEqual(['Bookman Old Style'])
  })

  it('stays silent when the browser cannot measure text', () => {
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas' ? ({ getContext: () => null } as unknown as HTMLCanvasElement) : document.createElementNS('http://www.w3.org/1999/xhtml', tag)) as typeof document.createElement)
    expect(missingFonts(['Zapfino'])).toEqual([])
  })
})
