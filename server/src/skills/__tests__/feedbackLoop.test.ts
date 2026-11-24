import { processAIFeedback } from '../feedbackLoop'
import * as feedbackModel from '../../models/feedbackModel'
import * as behaviorModel from '../../models/behaviorModel'

import * as trigger from '../personalizationTrigger'

jest.mock('../../models/feedbackModel')
jest.mock('../../models/behaviorModel')
jest.mock('../personalizationTrigger')

describe('processAIFeedback skill', () => {
  const createRecordMock = feedbackModel.createFeedbackRecord as jest.MockedFunction<
    typeof feedbackModel.createFeedbackRecord
  >
  const appendEventMock = behaviorModel.appendDocumentBehaviorEvent as jest.MockedFunction<
    typeof behaviorModel.appendDocumentBehaviorEvent
  >

  beforeEach(() => {
    jest.clearAllMocks()
    createRecordMock.mockResolvedValue(undefined)
    ;(trigger.maybeStartPersonalization as jest.Mock).mockResolvedValue(false)
    appendEventMock.mockResolvedValue('logged')
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

  it('passes the block and the format it kept on to the feedback record', async () => {
    await processAIFeedback({
      userId: 'user-123',
      documentId: 'doc-456',
      predictionType: 'format_prompt',
      predictedFormat: 'heading1',
      accepted: false,
      blockText: 'Rationale of the Study',
      keptFormat: 'paragraph',
    })

    expect(createRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ accepted: false, blockText: 'Rationale of the Study', keptFormat: 'paragraph' })
    )
    // A labeled block may start the user's personalization run.
    expect(trigger.maybeStartPersonalization).toHaveBeenCalledWith('user-123')
  })

  it('never starts personalization for feedback without its block', async () => {
    await processAIFeedback({
      userId: 'user-123',
      documentId: 'doc-456',
      predictionType: 'chat_preview',
      predictedFormat: 'blockquote',
      accepted: true,
    })
    expect(trigger.maybeStartPersonalization).not.toHaveBeenCalled()
  })

  it('logs a negative behavior event against the document', async () => {
    await processAIFeedback({
      userId: 'user-123',
      documentId: 'doc-456',
      predictionType: 'chat_preview',
      predictedFormat: 'blockquote',
      confidence: 82,
      accepted: false,
    })

    expect(appendEventMock).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        documentId: 'doc-456',
        action: 'ai_suggestion_rejected:blockquote',
      })
    )
  })

  it('keeps document-less feedback out of the genre-partitioned behavior stream', async () => {
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

    expect(appendEventMock).not.toHaveBeenCalled()
  })
})

