import { runCouncilScan } from '../runCouncilScan'
import { requestCouncilScan } from '../../ai/bridge/pythonBridge'

jest.mock('../../ai/bridge/pythonBridge', () => ({
  requestCouncilScan: jest.fn(),
}))

const mockedRequest = requestCouncilScan as jest.MockedFunction<typeof requestCouncilScan>

describe('runCouncilScan', () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = 'gemini'
    process.env.AI_API_KEY = 'test-key'
    process.env.AI_MODEL = 'gemini-2.0-flash'
    mockedRequest.mockReset()
    mockedRequest.mockResolvedValue({
      matches: [],
      transcript: [],
      active_judges: 0,
      quorum_reached: true,
      peer_similarity_score: 0,
      overall_originality_score: 100,
      processing_time_ms: 5,
    })
  })

  it('forwards the document, peers, timeline, and AI config to the bridge', async () => {
    const timeline = [{ action: 'type', timestamp: '2026-01-01T00:00:00Z', char_count: 120 }]

    await runCouncilScan({
      documentId: 'doc-a',
      folderId: 'folder-1',
      document: {
        id: 'doc-a',
        user_id: 'student-a',
        title: 'Alpha Thesis',
        content: '<p>Alpha body</p>',
      },
      peers: [
        {
          id: 'doc-b',
          user_id: 'student-b',
          title: 'Beta Thesis',
          content: '<p>Beta body</p>',
        },
      ],
      timeline,
    })

    expect(mockedRequest).toHaveBeenCalledWith({
      documentId: 'doc-a',
      userId: 'student-a',
      folderId: 'folder-1',
      text: '<p>Alpha body</p>',
      peers: [{ documentId: 'doc-b', userId: 'student-b', text: '<p>Beta body</p>' }],
      timeline,
      ai: { provider: 'gemini', apiKey: 'test-key', model: 'gemini-2.0-flash' },
    })
  })
})
