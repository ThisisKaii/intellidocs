import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WordProgress, { resolveDynamicWordTarget } from '../WordProgress'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null

function mount(wordCount: number, documentId = 'doc-1'): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root?.render(createElement(WordProgress, { wordCount, documentId }))
  })
  return host
}

function unmountHost(): void {
  act(() => {
    root?.unmount()
  })
  host?.remove()
  root = null
  host = null
}

describe('resolveDynamicWordTarget', () => {
  it('scales cleanly across document sizes instead of sticking at 3000', () => {
    expect(resolveDynamicWordTarget(0)).toBe(500)
    expect(resolveDynamicWordTarget(206)).toBe(500)
    expect(resolveDynamicWordTarget(500)).toBe(500)
    expect(resolveDynamicWordTarget(501)).toBe(1000)
    expect(resolveDynamicWordTarget(1200)).toBe(1500)
    expect(resolveDynamicWordTarget(2950)).toBe(3000)
    expect(resolveDynamicWordTarget(3200)).toBe(5000)
    expect(resolveDynamicWordTarget(12000)).toBe(15000)
    expect(resolveDynamicWordTarget(62000)).toBe(75000)
  })
})

describe('WordProgress', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    unmountHost()
  })

  it('uses the adaptive dynamic target when targetWords is omitted', () => {
    const container = mount(206, 'doc-1')
    expect(container.textContent).toContain('206 / 500 words')
    expect(container.textContent).toContain('41%')
  })

  it('lets the user set a custom goal persisted per document and reset to Auto', () => {
    const container = mount(206, 'doc-1')

    const trigger = container.querySelector('button')
    expect(trigger?.textContent).toContain('206 / 500 words')
    act(() => {
      trigger?.click()
    })

    const input = container.querySelector('input[aria-label="Custom word goal"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    act(() => {
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, '1200')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })

    const form = container.querySelector('form')
    act(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(container.textContent).toContain('206 / 1,200 words (goal)')
    expect(container.textContent).toContain('17%')

    unmountHost()
    const remounted = mount(206, 'doc-1')
    expect(remounted.textContent).toContain('206 / 1,200 words (goal)')

    act(() => {
      remounted.querySelector('button')?.click()
    })
    const autoButton = Array.from(remounted.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Auto')
    expect(autoButton).toBeDefined()
    act(() => {
      autoButton?.click()
    })
    expect(remounted.textContent).toContain('206 / 500 words')
    expect(remounted.textContent).toContain('41%')
  })
})
