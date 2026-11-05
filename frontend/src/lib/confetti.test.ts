import { afterEach, describe, expect, it, vi } from 'vitest'
import { burstConfetti, prefersReducedMotion } from './confetti'

function mockReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }))
}

describe('confetti', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('respects reduced motion by drawing nothing', () => {
    mockReducedMotion(true)
    expect(prefersReducedMotion()).toBe(true)
    burstConfetti()
    expect(document.querySelector('canvas')).toBeNull()
  })

  it('reports full motion when the viewer has not asked to reduce it', () => {
    mockReducedMotion(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})
