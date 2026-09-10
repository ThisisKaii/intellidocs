import { useState } from 'react'
import { Editor } from '@tiptap/react'
import { BookOpen, Loader2, Plus, X } from 'lucide-react'

interface CitationEntry {
  authors: string
  year: string
  title: string
  journal: string
  doi: string
  volume: string
  pages: string
}

interface CitationStylerProps {
  editor: Editor | null
}

/**
 * S5: Smart Citation & Bibliography Styler (APA 7th / IEEE).
 * Paste a DOI, arXiv ID, or paper title → fetch metadata → format
 * an exact hanging-indent bibliography entry.
 */
export default function CitationStyler({ editor }: CitationStylerProps): JSX.Element {
  const [input, setInput] = useState('')
  const [style, setStyle] = useState<'apa' | 'ieee'>('apa')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CitationEntry | null>(null)

  async function fetchMetadata() {
    const trimmed = input.trim()
    if (!trimmed) return

    setLoading(true)
    setError('')
    setResult(null)

    try {
      // Try CrossRef API for DOI or title search
      let url = ''
      if (trimmed.startsWith('10.')) {
        // DOI
        url = `https://api.crossref.org/works/${encodeURIComponent(trimmed)}`
      } else if (trimmed.startsWith('arXiv:') || trimmed.startsWith('arxiv:')) {
        const arxivId = trimmed.replace(/^arxiv:/i, '')
        url = `https://api.crossref.org/works?query.arxiv=${encodeURIComponent(arxivId)}&rows=1`
      } else {
        // Title search
        url = `https://api.crossref.org/works?query.title=${encodeURIComponent(trimmed)}&rows=1`
      }

      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch metadata')

      const data = await response.json()
      const work = data.message?.items?.[0] || data.message

      if (!work) {
        throw new Error('No results found for the given input')
      }

      const authors = (work.author || [])
        .map((a: { given?: string; family?: string }) => `${a.family || ''}, ${a.given || ''}`)
        .join('; ')

      const entry: CitationEntry = {
        authors: authors || 'Unknown Author',
        year: work.published?.['date-parts']?.[0]?.[0] || work.created?.['date-parts']?.[0]?.[0] || 'n.d.',
        title: work.title?.[0] || 'Untitled',
        journal: work['container-title']?.[0] || '',
        doi: work.DOI || '',
        volume: work.volume || '',
        pages: work.page || '',
      }

      setResult(entry)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch citation metadata')
    } finally {
      setLoading(false)
    }
  }

  function formatAPA(entry: CitationEntry): string {
    let citation = `${entry.authors} (${entry.year}). ${entry.title}.`
    if (entry.journal) {
      citation += ` <em>${entry.journal}</em>`
      if (entry.volume) citation += `, <em>${entry.volume}</em>`
      if (entry.pages) citation += `, ${entry.pages}`
    }
    citation += '.'
    if (entry.doi) citation += ` https://doi.org/${entry.doi}`
    return citation
  }

  function formatIEEE(entry: CitationEntry): string {
    let citation = `${entry.authors}, "${entry.title},"`
    if (entry.journal) {
      citation += ` <em>${entry.journal}</em>`
      if (entry.volume) citation += `, vol. ${entry.volume}`
      if (entry.pages) citation += `, pp. ${entry.pages}`
    }
    citation += `, ${entry.year}.`
    if (entry.doi) citation += ` doi: ${entry.doi}.`
    return citation
  }

  function insertCitation() {
    if (!result || !editor) return
    const formatted = style === 'apa' ? formatAPA(result) : formatIEEE(result)
    editor
      .chain()
      .focus()
      .insertContent(`<p>${formatted}</p>`)
      .run()
    setResult(null)
    setInput('')
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Smart Citation Styler</span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Paste a DOI, arXiv ID, or paper title to auto-format a bibliography entry.
        </p>
      </div>

      <div className="px-4 py-3">
        <div className="flex gap-2 mb-2">
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as 'apa' | 'ieee')}
            className="h-8 px-2 rounded-md border border-border bg-background text-xs outline-none"
          >
            <option value="apa">APA 7th</option>
            <option value="ieee">IEEE</option>
          </select>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="DOI, arXiv ID, or paper title…"
            className="flex-1 h-8 px-3 rounded-md border border-border bg-background text-xs outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void fetchMetadata()
              }
            }}
          />
          <button
            type="button"
            onClick={() => { void fetchMetadata() }}
            disabled={loading || !input.trim()}
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Fetch'}
          </button>
        </div>

        {error && (
          <p className="text-xs text-destructive mb-2">{error}</p>
        )}

        {result && (
          <div className="rounded-lg border border-border bg-secondary/50 p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <p className="text-xs font-semibold text-foreground">{result.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{result.authors} ({result.year})</p>
                {result.journal && (
                  <p className="text-[10px] text-muted-foreground italic">{result.journal}</p>
                )}
              </div>
              <button type="button" onClick={() => setResult(null)} className="p-0.5 hover:bg-secondary rounded">
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>

            <div className="text-xs text-foreground p-2 rounded bg-background border border-border mb-2"
              dangerouslySetInnerHTML={{ __html: style === 'apa' ? formatAPA(result) : formatIEEE(result) }}
            />

            <button
              type="button"
              onClick={insertCitation}
              className="inline-flex items-center gap-1 h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
            >
              <Plus className="w-3 h-3" />
              Insert Citation
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
