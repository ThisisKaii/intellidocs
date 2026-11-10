import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { comparePassages, type ComparisonSource } from '../shingleMatch'

/**
 * Web similarity benchmark on the shared plagiarism corpus
 * (tests/fixtures/plagiarism_benchmark/corpus.json): the peer thesis stands in for
 * a published web source. Copies and paraphrases must be reported, originals not.
 */
interface Corpus {
  peer_paragraphs: Record<string, string>
  cases: Array<{ id: string; label: 'copied' | 'paraphrase' | 'original'; text: string; source: string | null }>
}

const corpus = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../tests/fixtures/plagiarism_benchmark/corpus.json'), 'utf-8')
) as Corpus

const SOURCE: ComparisonSource = {
  url: 'https://example.org/peer-thesis',
  title: 'Peer thesis',
  kind: 'web',
  text: Object.values(corpus.peer_paragraphs).join('\n\n'),
}

describe('web similarity benchmark', () => {
  const paragraphs = corpus.cases.map((item) => item.text)
  const result = comparePassages(paragraphs, [SOURCE])
  const found = new Map(result.passages.map((passage) => [passage.paragraph_index, passage]))
  const rows = corpus.cases.map((item, index) => ({ ...item, got: found.get(index)?.match_type ?? '-', score: found.get(index)?.similarity ?? 0 }))

  it('prints the per-case table', () => {
    // Visible with --verbose; kept as a test so the numbers show up next to the assertions.
    console.log(rows.map((row) => `${row.id.padEnd(34)}${row.label.padEnd(12)}${row.got.padEnd(13)}${row.score}`).join('\n'))
    expect(rows).toHaveLength(corpus.cases.length)
  })

  it('reports every copy and light edit', () => {
    expect(rows.filter((row) => row.label === 'copied' && row.got === '-').map((row) => row.id)).toEqual([])
    expect(rows.filter((row) => row.id.startsWith('verbatim')).every((row) => row.got === 'verbatim')).toBe(true)
  })

  it('reports reworded paragraphs', () => {
    expect(rows.filter((row) => row.label === 'paraphrase' && row.got === '-').map((row) => row.id)).toEqual([])
  })

  it('leaves same-topic and unrelated originals alone', () => {
    expect(rows.filter((row) => row.label === 'original' && row.got !== '-').map((row) => row.id)).toEqual([])
  })
})
