import type { EditorJson } from '../../types/index'
import { bodyText, hasTabBreaks, joinBody, splitBody, stripTabBreaks, tabBreakHtml, TabBodyMismatchError } from '../documentTabs'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const para = (text: string): Record<string, unknown> => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...nodes: unknown[]): EditorJson => ({ type: 'doc', content: nodes })

const tabs = [
  { tab_id: A, title: 'Front matter', content: '<p>Title page</p>', content_json: doc(para('Title page')) },
  { tab_id: B, title: 'Chapter 1 "Intro" & <more>', content: '<h1>CHAPTER I</h1><p>Text</p>', content_json: doc({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'CHAPTER I' }] }, para('Text')) },
]

describe('joining and splitting a tabbed body', () => {
  it('splits exactly what it joined, ids, titles and both formats', () => {
    const body = joinBody(tabs)
    expect(hasTabBreaks(body.content)).toBe(true)
    const parts = splitBody(body.content, body.content_json)
    expect(parts).toEqual(tabs.map((tab) => ({ tabId: tab.tab_id, title: tab.title, content: tab.content, content_json: tab.content_json })))
  })

  it('reads markers whatever order the editor writes their attributes in', () => {
    const html = `<div data-title="Chapter 2" data-tab-id="${A}" data-tab-break=""></div><p>x</p>`
    expect(splitBody(html, null)).toEqual([{ tabId: A, title: 'Chapter 2', content: '<p>x</p>', content_json: null }])
  })

  it('returns null for a body without tabs', () => {
    expect(splitBody('<p>plain</p>', doc(para('plain')))).toBeNull()
    expect(hasTabBreaks('<p>plain</p>')).toBe(false)
  })

  it('keeps content before the first marker in the first tab', () => {
    const html = `<p>lead</p>${tabBreakHtml(A, 'One')}<p>a</p>`
    const json = doc(para('lead'), { type: 'tabBreak', attrs: { tabId: A, title: 'One' } }, para('a'))
    const parts = splitBody(html, json)!
    expect(parts[0].content).toBe('<p>lead</p><p>a</p>')
    expect(parts[0].content_json).toEqual(doc(para('lead'), para('a')))
  })

  it('treats a marker without an id as a new tab', () => {
    const html = '<div data-tab-break="" data-title="Chapter 3"></div><p>c</p>'
    expect(splitBody(html, null)![0].tabId).toBeNull()
  })

  it('refuses HTML and JSON that mark different tabs', () => {
    const body = joinBody(tabs)
    const json = doc(...((body.content_json!.content as unknown[]).slice(0, 2)))
    expect(() => splitBody(body.content, json)).toThrow(TabBodyMismatchError)
  })

  it('merges by dropping the markers and nothing else', () => {
    const body = joinBody(tabs)
    const merged = stripTabBreaks(body.content, body.content_json)
    expect(merged.content).toBe(tabs.map((tab) => tab.content).join(''))
    expect(merged.content_json?.content).toHaveLength(3)
    expect(bodyText(merged.content)).toBe(bodyText(body.content))
  })

  it('clears the JSON when a tab has none (the HTML then loads)', () => {
    expect(joinBody([tabs[0], { ...tabs[1], content_json: null }]).content_json).toBeNull()
  })
})
