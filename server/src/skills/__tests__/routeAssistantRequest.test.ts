import type { AIResponse, ChatCompleter } from '../../ai/aiClient'
import { looksLikeCommand, namesUnknownGroup, routeAssistantRequest } from '../routeAssistantRequest'

const TOOLS = [
  { name: 'formatBlocks', description: 'Format text.', params: 'formats?, fontSize?' },
  { name: 'setPageSetup', description: 'Page setup.', params: 'pageSize?' },
]

function answering(text: string): ChatCompleter {
  return jest.fn<Promise<AIResponse>, Parameters<ChatCompleter>>().mockResolvedValue({ text, provider: 'test', model: 'test' })
}

const input = (message: string) => ({ message, tools: TOOLS, sectionTitles: ['Introduction'], rejected: ['bold'] })

describe('routeAssistantRequest', () => {
  it('returns the tool the model picked', async () => {
    const complete = answering('Sure: ```json\n{"action":"tool","tool":"formatBlocks","args":{"targetCategory":"headings","fontSizeStep":2},"confidence":0.9}\n```')
    expect(await routeAssistantRequest(input('make the headres biger'), complete)).toEqual({
      kind: 'tool',
      tool: 'formatBlocks',
      args: { targetCategory: 'headings', fontSizeStep: 2 },
      confidence: 0.9,
    })
    // The prompt lists the tools, the sections and what was rejected; never the document text.
    const [, prompt] = (complete as jest.Mock).mock.calls[0] as [unknown, string]
    expect(prompt).toContain('formatBlocks')
    expect(prompt).toContain('Introduction')
    expect(prompt).toContain('rejected these changes in this chat; do not choose them again: bold')
  })

  it('never trusts a pick it cannot use', async () => {
    expect((await routeAssistantRequest(input('x'), answering('{"action":"tool","tool":"deleteDocument","args":{}}'))).kind).toBe('none')
    expect((await routeAssistantRequest(input('x'), answering('{"action":"tool","tool":"formatBlocks","args":{},"confidence":0.3}'))).kind).toBe('none')
    expect((await routeAssistantRequest(input('x'), answering('I think you want bold.'))).kind).toBe('none')
    const down = jest.fn<Promise<AIResponse>, Parameters<ChatCompleter>>().mockRejectedValue(new Error('offline'))
    expect((await routeAssistantRequest(input('x'), down)).kind).toBe('none')
  })

  it('keeps a question’s options only when they name real tools', async () => {
    const reply = JSON.stringify({
      action: 'clarify',
      question: 'Every heading, or only the Heading 2s?',
      options: [
        { label: 'Every heading', tool: 'formatBlocks', args: { targetCategory: 'headings', fontSize: 12 } },
        { label: 'Something else', tool: 'nope', args: {} },
      ],
    })
    expect(await routeAssistantRequest(input('headings 12'), answering(reply))).toEqual({
      kind: 'clarify',
      question: 'Every heading, or only the Heading 2s?',
      options: [{ label: 'Every heading', tool: 'formatBlocks', args: { targetCategory: 'headings', fontSize: 12 } }],
    })
  })
})

describe('looksLikeCommand', () => {
  it.each(['make the headres biger', 'pls center tables', 'landscape please', 'can u bump up the font', 'renumber figures'])('routes "%s"', (message) => {
    expect(looksLikeCommand(message)).toBe(true)
  })
  it.each(['thanks!', 'hello there', 'ok', 'what a day'])('does not route "%s"', (message) => {
    expect(looksLikeCommand(message)).toBe(false)
  })
})

describe('namesUnknownGroup', () => {
  it.each(['pls center every pic', 'make all my charts bigger', 'bold each footnote'])('a group: %s', (message) => {
    expect(namesUnknownGroup(message)).toBe(true)
  })
  it.each(['make all of this bold', 'make it all bold', 'center it', 'make them all italic'])('the selection: %s', (message) => {
    expect(namesUnknownGroup(message)).toBe(false)
  })
})
