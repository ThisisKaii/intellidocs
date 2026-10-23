import { summarizeLearning, weekStartOf } from '../summarizeLearning'

const row = (prediction_type: string, accepted: boolean, created_at: string) => ({ prediction_type, accepted, created_at })

describe('summarizeLearning', () => {
  it('returns empty buckets for no feedback', () => {
    const summary = summarizeLearning([])
    expect(summary.overall).toEqual({ total: 0, accepted: 0, acceptRate: null })
    expect(summary.weekly).toEqual([])
  })

  it('counts overall and per-type accept rates', () => {
    const summary = summarizeLearning([
      row('format_prompt', true, '2026-03-02T10:00:00Z'),
      row('format_prompt', false, '2026-03-02T11:00:00Z'),
      row('chat_preview', true, '2026-03-03T10:00:00Z'),
      row('chat_preview', true, '2026-03-04T10:00:00Z'),
    ])
    expect(summary.overall).toEqual({ total: 4, accepted: 3, acceptRate: 75 })
    expect(summary.byType.format_prompt.acceptRate).toBe(50)
    expect(summary.byType.chat_preview.acceptRate).toBe(100)
  })

  it('groups feedback into Monday-based weeks, oldest first, keeping the latest weeks', () => {
    expect(weekStartOf('2026-03-08T23:00:00Z')).toBe('2026-03-02')
    expect(weekStartOf('2026-03-09T00:30:00Z')).toBe('2026-03-09')
    const summary = summarizeLearning(
      [
        row('format_prompt', false, '2026-03-01T10:00:00Z'),
        row('format_prompt', true, '2026-03-10T10:00:00Z'),
        row('format_prompt', true, '2026-03-17T10:00:00Z'),
      ],
      2
    )
    expect(summary.weekly.map((w) => w.weekStart)).toEqual(['2026-03-09', '2026-03-16'])
    expect(summary.weekly[0].acceptRate).toBe(100)
  })
})
