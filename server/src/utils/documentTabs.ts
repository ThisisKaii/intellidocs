import type { EditorJson } from '../types/index'

/**
 * Document tabs: a document's whole body carries an empty marker block before each tab
 * (migration 048). These helpers split a body at the markers and join tabs back into a body, in
 * exactly the format `assemble_document_tabs` writes, so the server, the database and the editor
 * agree on where every tab starts.
 *
 *   HTML  <div data-tab-break="" data-tab-id="…" data-title="…"></div>
 *   JSON  {"type":"tabBreak","attrs":{"tabId":"…","title":"…"}}
 */

export const TAB_BREAK_TYPE = 'tabBreak'
export const DEFAULT_TAB_TITLE = 'Untitled tab'
export const MAX_TAB_TITLE = 120

/** One tab cut out of a body. `tabId` is null for a marker without an id (a tab made by a split). */
export interface BodyPart {
  tabId: string | null
  title: string
  content: string
  content_json: EditorJson | null
}

const MARKER_HTML = /<div\b[^>]*\bdata-tab-break\b[^>]*>\s*<\/div>/gi
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function escapeAttribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function unescapeAttribute(text: string): string {
  return text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)
  return match ? unescapeAttribute(match[1]) : null
}

/** A title fit to store: trimmed, single-line, capped. */
export function cleanTabTitle(title: unknown): string {
  const text = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, MAX_TAB_TITLE) : ''
  return text || DEFAULT_TAB_TITLE
}

function cleanTabId(id: unknown): string | null {
  return typeof id === 'string' && UUID.test(id) ? id.toLowerCase() : null
}

/** The marker block written before a tab, as the database writes it. */
export function tabBreakHtml(tabId: string, title: string): string {
  return `<div data-tab-break="" data-tab-id="${escapeAttribute(tabId)}" data-title="${escapeAttribute(title)}"></div>`
}

export function tabBreakNode(tabId: string, title: string): Record<string, unknown> {
  return { type: TAB_BREAK_TYPE, attrs: { tabId, title } }
}

/** Whether a body (HTML) has tab markers, i.e. belongs to a document split into tabs. */
export function hasTabBreaks(content: string | null | undefined): boolean {
  if (!content) return false
  MARKER_HTML.lastIndex = 0
  return MARKER_HTML.test(content)
}

/** Thrown when a body's HTML and JSON disagree about its tabs. */
export class TabBodyMismatchError extends Error {
  status = 400
  constructor(message: string) {
    super(message)
  }
}

/**
 * Cut a body into its tabs at the markers, or null when it has none. Content before the first
 * marker belongs to the first tab. The HTML and the JSON (when given) must mark the same tabs.
 */
export function splitBody(content: string, contentJson: EditorJson | null | undefined): BodyPart[] | null {
  MARKER_HTML.lastIndex = 0
  const markers = Array.from(content.matchAll(MARKER_HTML))
  if (markers.length === 0) return null

  const htmlParts: Array<{ tabId: string | null; title: string; content: string }> = []
  markers.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const end = index + 1 < markers.length ? markers[index + 1].index ?? content.length : content.length
    htmlParts.push({
      tabId: cleanTabId(attribute(match[0], 'data-tab-id')),
      title: cleanTabTitle(attribute(match[0], 'data-title')),
      content: content.slice(start, end),
    })
  })
  const leading = content.slice(0, markers[0].index ?? 0)
  if (leading.trim()) htmlParts[0].content = leading + htmlParts[0].content

  if (!contentJson) return htmlParts.map((part) => ({ ...part, content_json: null }))

  const nodes = Array.isArray(contentJson.content) ? (contentJson.content as Array<Record<string, unknown>>) : []
  const jsonParts: Array<{ tabId: string | null; nodes: unknown[] }> = []
  const leadingNodes: unknown[] = []
  for (const node of nodes) {
    if (node && node.type === TAB_BREAK_TYPE) {
      const attrs = (node.attrs ?? {}) as Record<string, unknown>
      jsonParts.push({ tabId: cleanTabId(attrs.tabId), nodes: [] })
    } else if (jsonParts.length === 0) {
      leadingNodes.push(node)
    } else {
      jsonParts[jsonParts.length - 1].nodes.push(node)
    }
  }
  if (jsonParts.length !== htmlParts.length) {
    throw new TabBodyMismatchError(`The document's HTML marks ${htmlParts.length} tabs but its JSON marks ${jsonParts.length}.`)
  }
  if (leadingNodes.length > 0) jsonParts[0].nodes.unshift(...leadingNodes)
  return htmlParts.map((part, index) => {
    const ownId = jsonParts[index].tabId
    if (part.tabId && ownId && part.tabId !== ownId) {
      throw new TabBodyMismatchError('The document\'s HTML and JSON mark different tabs.')
    }
    return {
      ...part,
      tabId: part.tabId ?? ownId,
      content_json: { type: 'doc', content: jsonParts[index].nodes },
    }
  })
}

/** Join tabs back into a whole body, as `assemble_document_tabs` does. */
export function joinBody(tabs: Array<{ tab_id: string; title: string; content: string; content_json: EditorJson | null }>): {
  content: string
  content_json: EditorJson | null
} {
  const content = tabs.map((tab) => tabBreakHtml(tab.tab_id, tab.title) + tab.content).join('')
  const allJson = tabs.every((tab) => tab.content_json)
  const content_json: EditorJson | null = allJson
    ? {
        type: 'doc',
        content: tabs.flatMap((tab) => [
          tabBreakNode(tab.tab_id, tab.title),
          ...(Array.isArray(tab.content_json?.content) ? (tab.content_json?.content as unknown[]) : []),
        ]),
      }
    : null
  return { content, content_json }
}

/** A body without its tab markers (merging every tab into one). */
export function stripTabBreaks(content: string, contentJson: EditorJson | null | undefined): {
  content: string
  content_json: EditorJson | null
} {
  MARKER_HTML.lastIndex = 0
  const html = content.replace(MARKER_HTML, '')
  if (!contentJson) return { content: html, content_json: null }
  const nodes = Array.isArray(contentJson.content) ? (contentJson.content as Array<Record<string, unknown>>) : []
  return { content: html, content_json: { ...contentJson, content: nodes.filter((node) => node?.type !== TAB_BREAK_TYPE) } }
}

/** The text a body shows, whitespace-normalised and without markers (to check a split lost nothing). */
export function bodyText(content: string): string {
  MARKER_HTML.lastIndex = 0
  return content
    .replace(MARKER_HTML, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Words in a body (as version snapshots count them). */
export function countBodyWords(content: string): number {
  const text = bodyText(content)
  return text ? text.split(' ').length : 0
}
