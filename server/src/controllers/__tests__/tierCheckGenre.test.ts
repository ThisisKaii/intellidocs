jest.mock('../../models/formattingModel')
jest.mock('../../skills/predictFormat')
jest.mock('../../models/aiQuotaModel')

import type { Request, Response } from 'express'
import { tierCheck } from '../formattingController'
import * as formattingModel from '../../models/formattingModel'
import { predictFormat, type PredictFormatResult } from '../../skills/predictFormat'
import { consumeAIQuota } from '../../models/aiQuotaModel'
import type { DocumentGenre, FormatPreset } from '../../types/index'

const model = formattingModel as jest.Mocked<typeof formattingModel>
const predict = predictFormat as jest.MockedFunction<typeof predictFormat>

function call(text: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code
        return this
      },
      json(body: Record<string, unknown>) {
        resolve({ status: this.statusCode, body })
        return this
      },
    }
    const req = { user: { id: 'u1', email: 'u1@x.test' }, body: { text, documentId: 'doc-1' } }
    void tierCheck(req as unknown as Request, res as unknown as Response)
  })
}

function neutralPrediction(partial: Partial<PredictFormatResult> = {}): PredictFormatResult {
  return {
    predictedFormat: 'paragraph',
    confidence: 0.6,
    featureValues: {},
    isolationMode: 'hybrid',
    genrePartitionHit: false,
    ...partial,
  }
}

function useGenre(genre: DocumentGenre): void {
  model.getDocumentGenre.mockResolvedValue(genre)
}

describe('tierCheck genre isolation', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    model.getOwnerOfDocument.mockResolvedValue('u1')
    model.getBindings.mockResolvedValue([])
    model.getDocumentPreset.mockResolvedValue(null)
    model.getPresetByKey.mockResolvedValue(null)
    ;(consumeAIQuota as jest.Mock).mockResolvedValue({ allowed: true, limit: 30, remaining: 29, resetInSeconds: 60 })
  })

  it('passes the document genre to prediction', async () => {
    useGenre('thesis')
    predict.mockResolvedValue(neutralPrediction())
    await call('Some body text that is long enough')
    expect(predict).toHaveBeenCalledWith(expect.objectContaining({ genre: 'thesis', userId: 'u1' }))
  })

  it('answers from the genre partition when it has a learned match', async () => {
    useGenre('ieee')
    predict.mockResolvedValue(neutralPrediction({
      genrePartitionHit: true,
      learned: { format: 'heading1', snippet: 'Results', bold: false, italic: false, underline: false, fontSize: 10, confidence: 0.9, count: 4 },
    }))
    const { body } = await call('Results')
    expect(body).toMatchObject({ tier: 'learned', format: 'heading1', genre: 'ieee' })
  })

  it('accepts the personal ML model only for a genre partition hit', async () => {
    useGenre('ieee')
    predict.mockResolvedValue(neutralPrediction({ predictedFormat: 'heading2', genrePartitionHit: true }))
    const { body } = await call('Experimental setup')
    expect(body).toMatchObject({ tier: 'ml', format: 'heading2', genre: 'ieee' })
    expect(model.getPresetByKey).not.toHaveBeenCalled()
  })

  it('falls back to the genre base preset, never another genre', async () => {
    useGenre('thesis')
    predict.mockResolvedValue(neutralPrediction())
    model.getPresetByKey.mockResolvedValue({
      key: 'thesis',
      rules: [{ condition: { startsWith: 'Chapter' }, format: 'heading1', priority: 20 }],
    } as unknown as FormatPreset)

    const { body } = await call('Chapter 3 Methodology')

    expect(model.getPresetByKey).toHaveBeenCalledWith('thesis')
    expect(body).toMatchObject({ tier: 'genre_preset', format: 'heading1', genre: 'thesis' })
  })

  it('uses ieee_base for IEEE documents', async () => {
    useGenre('ieee')
    predict.mockResolvedValue(neutralPrediction())
    await call('Plain sentence of body text here.')
    expect(model.getPresetByKey).toHaveBeenCalledWith('ieee_base')
  })

  it('ends at the neutral base model when the genre preset has no rule', async () => {
    useGenre('memo')
    predict.mockResolvedValue(neutralPrediction({ predictedFormat: 'paragraph', confidence: 0.55 }))
    const { body } = await call('Please submit your forms by Friday.')
    expect(body).toMatchObject({ tier: 'ml', format: 'paragraph', genre: 'memo' })
  })

  it('still lets bindings win before any genre data', async () => {
    useGenre('ieee')
    model.getBindings.mockResolvedValue([
      { id: 'b', user_id: 'u1', trigger_condition: { startsWith: 'Note' }, format_to_apply: 'blockquote', priority: 1, created_at: '' },
    ])
    const { body } = await call('Note: this is important')
    expect(body).toMatchObject({ tier: 'binding', format: 'blockquote' })
    expect(predict).not.toHaveBeenCalled()
  })
})
