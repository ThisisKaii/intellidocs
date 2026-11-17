import { ZodError } from 'zod'
import { findTool, listTools } from '../toolRegistry'

const CTX = { userId: 'user-1', email: 'user@example.test' }

async function callTool(name: string, args: unknown): Promise<unknown> {
  const tool = findTool(name)
  if (!tool) throw new Error(`no tool ${name}`)
  return tool.call(CTX, args)
}

describe('tool registry', () => {
  it('lists every tool once, each with a description, an effect and its arguments', () => {
    const tools = listTools()
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length)
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(10)
      expect(['reads', 'suggests', 'plans']).toContain(tool.effect)
      expect(tool.params.length).toBeGreaterThan(0)
    }
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'formatBlocks',
        'applyPreset',
        'applyUsualFormatting',
        'fixFormattingSuggestions',
        'setPageSetup',
        'autoCaption',
        'renumberCaptions',
        'insertBibliography',
      ])
    )
  })

  it('formatBlocks turns parts of a change into the chat’s preview card', async () => {
    const result = await callTool('formatBlocks', { targetCategory: 'h2Headings', fontSize: 12, formats: ['italic'] })
    expect(result).toEqual({
      card: expect.objectContaining({
        mode: 'preview',
        reply: expect.stringContaining('every Heading 2'),
        preview: expect.objectContaining({ formats: ['italic'], fontSize: 12, scope: 'all', targetCategory: 'h2Headings' }),
      }),
    })
  })

  it('formatBlocks: a relative size, "everything except", and a named section', async () => {
    const bigger = (await callTool('formatBlocks', { targetCategory: 'except:tables', fontSizeStep: 2 })) as { card: { reply: string; preview: { style: { fontSizeStep: number } } } }
    expect(bigger.card.preview.style.fontSizeStep).toBe(2)
    expect(bigger.card.reply).toContain('everything except the tables')
    const section = (await callTool('formatBlocks', { target: 'introduction', formats: ['bold'] })) as { card: { preview: { targetMode: string; scope: string } } }
    expect(section.card.preview).toMatchObject({ targetMode: 'heading', scope: 'all' })
  })

  it('formatBlocks: a block by position, page and section, read the way models write them', async () => {
    const last = (await callTool('formatBlocks', { targetCategory: 'paragraphs', position: 'last', page: '1', formats: ['bold'], scope: 'selection' })) as {
      card: { reply: string; preview: { targetIndex: number; targetPage: number; scope: string } }
    }
    // A named place is the document's, even when the caller said "selection".
    expect(last.card.preview).toMatchObject({ targetIndex: -1, targetPage: 1, scope: 'all' })
    expect(last.card.reply).toContain('the last paragraph on page 1')
    const opening = (await callTool('formatBlocks', { targetCategory: 'paragraphs', target: 'statement of the problem', position: 1, formats: ['bold'] })) as {
      card: { preview: { targetMode: string; targetIndex: number } }
    }
    expect(opening.card.preview).toMatchObject({ targetMode: 'section', targetIndex: 1 })
    const here = (await callTool('formatBlocks', { targetCategory: 'headings', page: 'this', formats: ['italic'] })) as { card: { preview: { targetPage: string } } }
    expect(here.card.preview.targetPage).toBe('current')
    await expect(callTool('formatBlocks', { targetCategory: 'paragraphs', position: 0, formats: ['bold'] })).rejects.toBeInstanceOf(ZodError)
  })

  it('rejects a call that changes nothing or names a bad value', async () => {
    await expect(callTool('formatBlocks', { targetCategory: 'headings' })).rejects.toBeInstanceOf(ZodError)
    await expect(callTool('formatBlocks', { targetCategory: 'except:everything', bold: true })).rejects.toBeInstanceOf(ZodError)
    await expect(callTool('setPageSetup', {})).rejects.toBeInstanceOf(ZodError)
    await expect(callTool('setPageSetup', { margins: { left: 9 } })).rejects.toBeInstanceOf(ZodError)
    await expect(callTool('applyPreset', { preset: 'chicago' })).rejects.toBeInstanceOf(ZodError)
  })

  it('the editor-run automations come back as cards to confirm', async () => {
    expect(await callTool('applyPreset', { preset: 'ieee' })).toEqual({ card: expect.objectContaining({ mode: 'preview', preview: expect.objectContaining({ presetKey: 'ieee' }) }) })
    expect(await callTool('autoCaption', {})).toEqual({ card: expect.objectContaining({ mode: 'captions', captionKinds: ['figure', 'table'] }) })
    expect(await callTool('renumberCaptions', {})).toEqual({ card: expect.objectContaining({ mode: 'automation', automation: { action: 'renumberCaptions' } }) })
    expect(await callTool('fixFormattingSuggestions', {})).toEqual({ card: expect.objectContaining({ automation: { action: 'fixSuggestions', only: 'all' } }) })
    expect(await callTool('setPageSetup', { pageSize: 'a4', margins: { left: 1.5 } })).toEqual({
      card: expect.objectContaining({ automation: { action: 'pageSetup', pageSize: 'a4', margins: { left: 1.5 } } }),
    })
    expect(await callTool('insertBibliography', {})).toEqual({ card: expect.objectContaining({ automation: { action: 'bibliography' } }) })
  })

  it('has no tool by an unknown name', () => {
    expect(findTool('deleteDocument')).toBeUndefined()
  })
})
