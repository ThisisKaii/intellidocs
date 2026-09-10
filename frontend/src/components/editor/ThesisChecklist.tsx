import { useState, useCallback } from 'react'
import { Editor } from '@tiptap/react'
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Plus,
  ListChecks,
} from 'lucide-react'

interface ThesisSection {
  id: string
  label: string
  required: boolean
  found: boolean
}

interface ThesisChecklistProps {
  editor: Editor | null
}

const STANDARD_SECTIONS: Omit<ThesisSection, 'found'>[] = [
  { id: 'title-page', label: 'Title Page', required: true },
  { id: 'abstract', label: 'Abstract', required: true },
  { id: 'toc', label: 'Table of Contents', required: true },
  { id: 'ch1', label: 'Chapter 1: Introduction', required: true },
  { id: 'ch2', label: 'Chapter 2: Literature Review', required: true },
  { id: 'ch3', label: 'Chapter 3: Methodology', required: true },
  { id: 'ch4', label: 'Chapter 4: Results', required: true },
  { id: 'ch5', label: 'Chapter 5: Discussion', required: true },
  { id: 'conclusion', label: 'Conclusion', required: true },
  { id: 'references', label: 'References', required: true },
  { id: 'appendices', label: 'Appendices', required: false },
]

/**
 * S3: Thesis Section Structure Checklist.
 * Collapsible editor sidebar showing standard thesis chapters.
 * Clicking a missing section inserts the required heading.
 */
export default function ThesisChecklist({ editor }: ThesisChecklistProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  const getDocumentText = useCallback((): string => {
    if (!editor) return ''
    return editor.getText().toLowerCase()
  }, [editor])

  const sections: ThesisSection[] = STANDARD_SECTIONS.map(s => {
    const text = getDocumentText()
    // Check for section label or numbered variants
    const keywords = s.label
      .toLowerCase()
      .replace(/^chapter \d+:\s*/, '')
      .replace(/^chapter \d+\s*/, '')
    const found = text.includes(keywords) || text.includes(s.label.toLowerCase())
    return { ...s, found }
  })

  const foundCount = sections.filter(s => s.found).length
  const totalCount = sections.length
  const progress = totalCount > 0 ? Math.round((foundCount / totalCount) * 100) : 0

  function insertHeading(label: string) {
    if (!editor) return
    // Determine heading level
    const isChapter = label.toLowerCase().startsWith('chapter')
    const headingLevel = isChapter ? 1 : 2

    editor
      .chain()
      .focus()
      .enter()
      .insertContent(`<h${headingLevel}>${label}</h${headingLevel}>`)
      .enter()
      .run()
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Thesis Checklist</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {foundCount}/{totalCount}
          </span>
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4">
          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Document Coverage
              </span>
              <span className="text-[10px] font-bold text-primary">{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Section list */}
          <div className="flex flex-col gap-0.5">
            {sections.map((section) => (
              <div
                key={section.id}
                className={`flex items-center gap-2 py-1.5 px-2 rounded-md text-sm ${
                  section.found
                    ? 'text-green-700'
                    : 'text-muted-foreground'
                }`}
              >
                {section.found ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className={`flex-1 text-xs ${section.found ? '' : 'font-medium'}`}>
                  {section.label}
                  {section.required && !section.found && (
                    <span className="text-red-500 ml-1">*</span>
                  )}
                </span>
                {!section.found && editor && (
                  <button
                    type="button"
                    onClick={() => insertHeading(section.label)}
                    className="p-0.5 rounded hover:bg-primary/10 text-primary transition-colors"
                    title={`Insert "${section.label}" heading`}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
