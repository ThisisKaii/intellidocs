import { reviewOriginalityWithCouncil, toPassageVerdict, MAX_REVIEWED_PASSAGES } from '../reviewOriginalityWithCouncil'
import { runCouncilScan } from '../runCouncilScan'

jest.mock('../runCouncilScan', () => ({ runCouncilScan: jest.fn() }))

const doc = { id: 'd1', user_id: 'u1', title: 'Essay', content: '<p>x</p>' }
const other = { id: 'd2', user_id: 'u1', title: 'Old essay', content: '<p>y</p>' }

describe('toPassageVerdict', () => {
  it('translates council wording into the three student-facing outcomes', () => {
    expect(toPassageVerdict('plagiarism')).toBe('reused')
    expect(toPassageVerdict('paraphrasing')).toBe('paraphrased')
    expect(toPassageVerdict('original')).toBe('original')
    expect(toPassageVerdict('something else')).toBe('inconclusive')
  })
})

describe('reviewOriginalityWithCouncil', () => {
  it('caps the passages sent to the judges and keeps which model answered', async () => {
    ;(runCouncilScan as jest.Mock).mockResolvedValue({
      active_judges: 4,
      matches: [{
        paragraph_index: 2,
        matched_document_id: 'd2',
        similarity_score: 88,
        flagged_text: 'Same paragraph',
        council_verdict: {
          final_verdict: 'plagiarism',
          overall_confidence: 0.9,
          final_reasoning: 'Verbatim reuse',
          deliberation_transcript: [{ judge: 'Forensic', provider: 'gemini', model: 'gemini-2.5-flash', verdict: 'plagiarism' }],
        },
      }],
    })

    const result = await reviewOriginalityWithCouncil({ document: doc, others: [other] })

    expect((runCouncilScan as jest.Mock).mock.calls[0][0].maxMatches).toBe(MAX_REVIEWED_PASSAGES)
    expect(result.reviews[0]).toMatchObject({
      verdict: 'reused',
      peer_title: 'Old essay',
      judges: [{ provider: 'gemini', model: 'gemini-2.5-flash' }],
    })
  })
})
