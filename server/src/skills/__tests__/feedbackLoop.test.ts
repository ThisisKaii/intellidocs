import { processAIFeedback } from '../feedbackLoop'
import * as feedbackModel from '../../models/feedbackModel'
import * as behaviorModel from '../../models/behaviorModel'

jest.mock('../../models/feedbackModel')
jest.mock('../../models/behaviorModel')

describe('processAIFeedback skill', () => {
  const createRecordMock = feedbackModel.createFeedbackRecord as jest.MockedFunction<
    typeof feedbackModel.createFeedbackRecord
  >
  const appendEventMock = behaviorModel.appendBehaviorEvent as jest.MockedFunction<
    typeof behaviorModel.appendBehaviorEvent
  >

  beforeEach(() => {
    jest.clearAllMocks()
    createRecordMock.mockResolvedValue(undefined)
    appendEventMock.mockResolvedValue(undefined)
  })

  it('persists acceptance feedback to Supabase and logs positive behavior event', async () => {
    await processAIFeedback({
      userId: 'user-123',
      documentId: 'doc-456',
      predictionType: 'format_prompt',
      predictedFormat: 'heading1',
      confidence: 95,
      accepted: true,
    })

    expect(createRecordMock).toHaveBeenCalledWith({
      userId: 'user-123',
      documentId: 'doc-456',
      predictionType: 'format_prompt',
      predictedFormat: 'heading1',
      confidence: 95,
      accepted: true,
    })

    expect(appendEventMock).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        documentId: 'doc-456',
        action: 'ai_suggestion_accepted:heading1',
      })
    )
  })

  it('persists rejection feedback to Supabase and logs negative behavior event', async () => {
    await processAIFeedback({
      userId: 'user-123',
      predictionType: 'chat_preview',
      predictedFormat: 'blockquote',
      confidence: 82,
      accepted: false,
    })

    expect(createRecordMock).toHaveBeenCalledWith({
      userId: 'user-123',
      documentId: undefined,
      predictionType: 'chat_preview',
      predictedFormat: 'blockquote',
      confidence: 82,
      accepted: false,
    })

    expect(appendEventMock).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        documentId: 'global',
        action: 'ai_suggestion_rejected:blockquote',
      })
    )
  })
})

