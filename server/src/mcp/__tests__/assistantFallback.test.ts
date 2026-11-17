import { runAssistantFallback, routableTools } from '../assistantFallback'
import type { RouteDecision } from '../../skills/routeAssistantRequest'

jest.mock('../../models/aiQuotaModel', () => ({
  consumeAIQuota: jest.fn(),
  refundAIQuota: jest.fn(),
}))
jest.mock('../../models/assistantRouteModel', () => ({
  routeId: jest.fn(() => 'a'.repeat(32)),
  getCachedRoute: jest.fn(),
  cacheRoute: jest.fn(),
}))

import { consumeAIQuota, refundAIQuota } from '../../models/aiQuotaModel'
import { cacheRoute, getCachedRoute } from '../../models/assistantRouteModel'

const consume = consumeAIQuota as jest.Mock
const refund = refundAIQuota as jest.Mock
const cached = getCachedRoute as jest.Mock
const cache = cacheRoute as jest.Mock

const DOC = '<h1>Introduction</h1><p>Body.</p><h2>Scope</h2><p>More.</p>'
const INPUT = { userId: 'u1', message: 'make the headres biger', documentContent: DOC, sectionTitles: ['Introduction', 'Scope'], rejected: [] }

function routedTo(decision: RouteDecision): jest.Mock {
  return jest.fn().mockResolvedValue(decision)
}

beforeEach(() => {
  jest.clearAllMocks()
  consume.mockResolvedValue({ allowed: true, limit: 30, remaining: 29, resetInSeconds: 60 })
  refund.mockResolvedValue(undefined)
  cached.mockResolvedValue(null)
  cache.mockResolvedValue(undefined)
})

describe('runAssistantFallback', () => {
  it('turns the AI’s pick into the tool’s card, charges one unit and caches the route', async () => {
    const route = routedTo({ kind: 'tool', tool: 'formatBlocks', args: { targetCategory: 'headings', fontSizeStep: 2 }, confidence: 0.9 })
    const result = await runAssistantFallback(INPUT, route)
    expect(result).toEqual(expect.objectContaining({ kind: 'card', fromCache: false, card: expect.objectContaining({ mode: 'preview' }) }))
    expect(consume).toHaveBeenCalledTimes(1)
    expect(refund).not.toHaveBeenCalled()
    expect(cache).toHaveBeenCalledWith('u1', 'a'.repeat(32), expect.objectContaining({ tool: 'formatBlocks' }))
  })

  it('answers a request it has routed before without the AI and without quota', async () => {
    cached.mockResolvedValue({ message: 'make the headres biger', tool: 'formatBlocks', args: { targetCategory: 'headings', fontSizeStep: 2 }, confidence: 0.9 })
    const route = routedTo({ kind: 'none', reason: '' })
    expect(await runAssistantFallback(INPUT, route)).toEqual(expect.objectContaining({ kind: 'card', fromCache: true }))
    expect(route).not.toHaveBeenCalled()
    expect(consume).not.toHaveBeenCalled()
  })

  it('refunds a pick the tool rejects, a missing section, a question back and a miss', async () => {
    expect((await runAssistantFallback(INPUT, routedTo({ kind: 'tool', tool: 'formatBlocks', args: { targetCategory: 'headings' }, confidence: 0.9 }))).kind).toBe('none')
    const missing = await runAssistantFallback(INPUT, routedTo({ kind: 'tool', tool: 'formatBlocks', args: { target: 'conclusion', formats: ['bold'] }, confidence: 0.9 }))
    expect(missing).toEqual({ kind: 'answer', reply: expect.stringContaining('I couldn’t find “conclusion”') })
    const asked = await runAssistantFallback(
      INPUT,
      routedTo({
        kind: 'clarify',
        question: 'Which headings?',
        options: [
          { label: 'Every heading', tool: 'formatBlocks', args: { targetCategory: 'headings', fontSize: 12 } },
          { label: 'Bad', tool: 'formatBlocks', args: {} },
        ],
      })
    )
    expect(asked).toEqual(expect.objectContaining({ kind: 'clarify', options: [expect.objectContaining({ label: 'Every heading' })] }))
    expect((await runAssistantFallback(INPUT, routedTo({ kind: 'none', reason: '' }))).kind).toBe('none')
    expect(refund).toHaveBeenCalledTimes(4)
    expect(cache).not.toHaveBeenCalled()
  })

  it('stops at the quota', async () => {
    consume.mockResolvedValue({ allowed: false, limit: 30, remaining: 0, resetInSeconds: 12 })
    const route = routedTo({ kind: 'none', reason: '' })
    expect((await runAssistantFallback(INPUT, route)).kind).toBe('quota')
    expect(route).not.toHaveBeenCalled()
  })

  it('never offers the older log-only tools to the router', () => {
    const names = routableTools().map((tool) => tool.name)
    expect(names).toContain('formatBlocks')
    expect(names).not.toContain('applyFormatting')
    expect(names).not.toContain('getDocumentContent')
  })
})
