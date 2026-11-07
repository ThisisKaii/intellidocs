import { waitForConverter } from '../waitForConverter'
import { textBlockSchema } from '../../../schemas/predictionSchemas'

jest.mock('../../ai/bridge/pythonBridge', () => ({ probeMlHealth: jest.fn() }))

/** A probe that answers from a script of reachable/unreachable results. */
function scripted(results: boolean[]): jest.Mock {
  const probe = jest.fn()
  for (const reachable of results) probe.mockResolvedValueOnce({ reachable })
  probe.mockResolvedValue({ reachable: results[results.length - 1] ?? false })
  return probe
}

const noSleep = (): Promise<void> => Promise.resolve()

describe('waitForConverter', () => {
  it('goes straight on when the converter is awake', async () => {
    const onWaking = jest.fn(async () => undefined)
    const result = await waitForConverter(onWaking, { probe: scripted([true]), sleep: noSleep })
    expect(result).toEqual({ reachable: true, wakeMs: 0 })
    expect(onWaking).not.toHaveBeenCalled()
  })

  it('says the converter is waking once, then waits until it answers', async () => {
    const onWaking = jest.fn(async () => undefined)
    const probe = scripted([false, false, true])
    const result = await waitForConverter(onWaking, { probe, sleep: noSleep, pollMs: 1 })
    expect(result.reachable).toBe(true)
    expect(onWaking).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('gives up after the timeout without throwing', async () => {
    const result = await waitForConverter(async () => undefined, { probe: scripted([false]), sleep: noSleep, timeoutMs: 0 })
    expect(result.reachable).toBe(false)
  })
})

describe('grammar text blocks', () => {
  it('accept the title-page and approval-sheet regions the editor marks, and nothing else', () => {
    expect(textBlockSchema.parse({ text: 'Ms. Gian S. Mahusay', region: 'title_page' }).region).toBe('title_page')
    expect(textBlockSchema.safeParse({ text: 'x', region: 'appendix' }).success).toBe(false)
  })
})
