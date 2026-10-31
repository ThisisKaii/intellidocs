import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TwoColumnPrompt from '../TwoColumnPrompt'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null

function mount(onPreview: () => void, onDismiss: () => void): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(createElement(TwoColumnPrompt, { onPreview, onDismiss })))
  return host
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)
  if (!found) throw new Error(`no button "${text}"`)
  return found
}

describe('TwoColumnPrompt', () => {
  it('says the file is set in two columns', () => {
    const view = mount(vi.fn(), vi.fn())
    expect(view.textContent).toContain('This file is set in two columns')
  })

  it('opens the IEEE preview from its main button', () => {
    const onPreview = vi.fn()
    const onDismiss = vi.fn()
    const view = mount(onPreview, onDismiss)
    act(() => buttonWithText(view, 'Preview in IEEE layout').click())
    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses from "Not now" and from the close button', () => {
    const onDismiss = vi.fn()
    const view = mount(vi.fn(), onDismiss)
    act(() => buttonWithText(view, 'Not now').click())
    act(() => (view.querySelector('button[title="Close"]') as HTMLButtonElement).click())
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })
})
