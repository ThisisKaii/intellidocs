import { isTrainingPoint, maybeStartPersonalization } from '../personalizationTrigger'
import * as feedbackModel from '../../models/feedbackModel'
import * as bridge from '../../ai/bridge/pythonBridge'

jest.mock('../../models/feedbackModel')
jest.mock('../../ai/bridge/pythonBridge')

const count = feedbackModel.countFeedbackTrainingExamples as jest.MockedFunction<typeof feedbackModel.countFeedbackTrainingExamples>
const examples = feedbackModel.listFeedbackTrainingExamples as jest.MockedFunction<typeof feedbackModel.listFeedbackTrainingExamples>
const aggregate = bridge.requestAggregation as jest.MockedFunction<typeof bridge.requestAggregation>
const fineTune = bridge.triggerFineTune as jest.MockedFunction<typeof bridge.triggerFineTune>

/** Let the background run finish. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

const LABELED = [{ text: 'CHAPTER I', label: 'heading1', genre: 'thesis' }]

beforeEach(() => {
  jest.clearAllMocks()
  examples.mockResolvedValue(LABELED)
  aggregate.mockResolvedValue({ status: 'ok' } as Awaited<ReturnType<typeof bridge.requestAggregation>>)
  fineTune.mockResolvedValue({ status: 'started', message: 'ok', user_id: 'u1' })
})

describe('personalization trigger', () => {
  it('trains at 5 labeled blocks, then every 10 more', () => {
    expect([1, 4, 5, 6, 14, 15, 16, 25, 35].filter(isTrainingPoint)).toEqual([5, 15, 25, 35])
  })

  it('aggregates behavior, then fine-tunes on the labeled blocks, at a training point', async () => {
    count.mockResolvedValue(5)
    await expect(maybeStartPersonalization('u1')).resolves.toBe(true)
    await settle()
    expect(aggregate).toHaveBeenCalledTimes(1)
    expect(fineTune).toHaveBeenCalledWith('u1', LABELED)
    expect(aggregate.mock.invocationCallOrder[0]).toBeLessThan(fineTune.mock.invocationCallOrder[0])
  })

  it('does nothing between training points', async () => {
    count.mockResolvedValue(6)
    await expect(maybeStartPersonalization('u1')).resolves.toBe(false)
    await settle()
    expect(fineTune).not.toHaveBeenCalled()
  })

  it('still fine-tunes when aggregation fails, and starts one run at a time per user', async () => {
    count.mockResolvedValue(15)
    aggregate.mockRejectedValue(new Error('ML asleep'))
    let finish: () => void = () => undefined
    fineTune.mockReturnValue(new Promise((resolve) => { finish = () => resolve({ status: 'started', message: 'ok', user_id: 'u2' }) }))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(maybeStartPersonalization('u2')).resolves.toBe(true)
    await settle()
    await expect(maybeStartPersonalization('u2')).resolves.toBe(false)
    finish()
    await settle()
    expect(fineTune).toHaveBeenCalledTimes(1)
    await expect(maybeStartPersonalization('u2')).resolves.toBe(true)
    warn.mockRestore()
  })
})
