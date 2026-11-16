import { describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api', () => ({
  api: {
    documents: {
      tabs: {
        get: vi.fn(async (_id: string, tabId: string) => ({ content: `<p>saved ${tabId}</p>` })),
      },
    },
  },
}))

import { bodyForExport, exportTitle } from '../tabExport'

const tab = (tab_id: string, title: string) => ({
  tab_id,
  title,
  position: 0,
  page_count: 1,
  word_count: 1,
  numbering: null,
  caption_counts: null,
  outline: null,
  updated_at: '',
})

const context = {
  documentId: 'd1',
  tabs: [tab('front', 'Front matter'), tab('ch1', 'Chapter 1'), tab('ch2', 'Chapter 2')],
  openTabId: 'ch1',
  liveHtml: '<p>live chapter 1</p>',
}

describe('downloading tabs', () => {
  it('takes the open tab from the editor (with unsaved edits) and the others from the server, in order', async () => {
    expect(await bodyForExport({ kind: 'whole' }, context)).toBe('<p>saved front</p><p>live chapter 1</p><p>saved ch2</p>')
  })

  it('exports only the open tab', async () => {
    expect(await bodyForExport({ kind: 'tab' }, context)).toBe('<p>live chapter 1</p>')
  })

  it('keeps document order for chosen tabs, whatever order they were ticked in', async () => {
    expect(await bodyForExport({ kind: 'tabs', tabIds: ['ch2', 'front'] }, context)).toBe('<p>saved front</p><p>saved ch2</p>')
  })

  it('names a one-tab download after its tab', () => {
    expect(exportTitle('Thesis', { kind: 'tab' }, context)).toBe('Thesis – Chapter 1')
    expect(exportTitle('Thesis', { kind: 'whole' }, context)).toBe('Thesis')
    expect(exportTitle('Thesis', { kind: 'tabs', tabIds: ['ch1', 'ch2'] }, context)).toBe('Thesis')
  })
})
