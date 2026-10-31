import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DocumentTypePrompt from '../DocumentTypePrompt'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null

/** Render the prompt into the document. */
function mount(onApply: () => void, onDismiss: () => void): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(createElement(DocumentTypePrompt, { typeLabel: 'IEEE Manuscript', presetName: 'IEEE Conference', onApply, onDismiss })))
  return host
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

/** The button whose text is exactly `text`. */
function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)
  if (!found) throw new Error(`no button "${text}"`)
  return found
}

describe('DocumentTypePrompt', () => {
  it('names the detected type and the format it offers', () => {
    const container = mount(vi.fn(), vi.fn())
    expect(container.textContent).toContain('This looks like an IEEE Manuscript')
    expect(container.textContent).toContain('Use IEEE Conference')
  })

  it('applies on the main button and dismisses on Not now', () => {
    const onApply = vi.fn()
    const onDismiss = vi.fn()
    const container = mount(onApply, onDismiss)
    act(() => buttonWithText(container, 'Use IEEE Conference').click())
    expect(onApply).toHaveBeenCalledTimes(1)
    act(() => buttonWithText(container, 'Not now').click())
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
