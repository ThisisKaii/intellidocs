import { runOriginalityCheck } from '../runOriginalityCheck'
import { requestOriginalityCheck } from '../../ai/bridge/pythonBridge'

jest.mock('../../ai/bridge/pythonBridge', () => ({
  requestOriginalityCheck: jest.fn(),
}))

const mockedRequest = requestOriginalityCheck as jest.MockedFunction<typeof requestOriginalityCheck>

describe('runOriginalityCheck', () => {
  beforeEach(() => {
    mockedRequest.mockReset()
    mockedRequest.mockResolvedValue({ overlap_percent: 12.5, passages: [] })
  })

  it('sends the document text and the other documents as peers', async () => {
    const result = await runOriginalityCheck({
      document: { id: 'a', title: 'A', content: '<p>Alpha</p>' },
      others: [
        { id: 'a', title: 'A', content: '<p>Alpha</p>' },
        { id: 'b', title: 'Beta', content: '<p>Beta</p>' },
        { id: 'c', title: 'Empty', content: '' },
      ],
    })

    expect(mockedRequest).toHaveBeenCalledWith({
      text: '<p>Alpha</p>',
      peers: [{ documentId: 'b', title: 'Beta', text: '<p>Beta</p>' }],
    })
    expect(result.overlap_percent).toBe(12.5)
  })

  it('skips the ML call when there is nothing to compare against', async () => {
    const result = await runOriginalityCheck({
      document: { id: 'a', title: 'A', content: '<p>Alpha</p>' },
      others: [],
    })

    expect(mockedRequest).not.toHaveBeenCalled()
    expect(result).toEqual({ overlap_percent: 0, passages: [] })
  })
})
