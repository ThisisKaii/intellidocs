// @ts-nocheck
import { useState, useCallback, type ReactNode } from 'react'
import { Search, Plus, FileText, BookOpen, Globe, GraduationCap, FileCode, Trash2, Copy, Edit2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  panelStyle,
  tabsStyle,
  tabStyle,
  styleSelectorStyle,
  labelStyle,
  selectStyle,
  contentStyle,
  searchStyle,
  emptyStyle,
  listStyle,
  itemStyle,
  refRowStyle,
  refTypeIconStyle,
  refInfoStyle,
  refTitleStyle,
  refMetaStyle,
  insertButtonStyle,
  actionsStyle,
  actionButtonStyle,
  manageHeaderStyle,
  manageTitleStyle,
  addButtonStyle,
  groupStyle,
  groupLabelStyle,
  bibliographyHeaderStyle,
  bibliographyListStyle,
  bibliographyItemStyle,
  dialogOverlayStyle,
  dialogStyle,
  dialogHeaderStyle,
  dialogTitleStyle,
  closeButtonStyle,
  dialogContentStyle,
  formGroupStyle,
  authorRowStyle,
  inputStyle,
  removeAuthorButtonStyle,
  addAuthorButtonStyle,
  dialogFooterStyle,
  cancelButtonStyle,
  saveButtonStyle,
} from './CitationAssistantStyles'

/** Citation Assistant - Core types and formatting utilities. */

export type CitationStyle = 'ieee' | 'apa'

export interface CitationReference {
  id: string
  type: 'journal' | 'book' | 'conference' | 'website' | 'thesis' | 'report' | 'other'
  authors: string[]
  title: string
  year: number
  venue?: string
  volume?: string
  issue?: string
  pages?: string
  doi?: string
  url?: string
  publisher?: string
  edition?: string
  isbn?: string
  institution?: string
  reportNumber?: string
  customFields?: Record<string, string>
}

const TYPE_LABELS: Record<CitationReference['type'], string> = {
  journal: 'Journal Article',
  book: 'Book',
  conference: 'Conference Paper',
  website: 'Website',
  thesis: 'Thesis/Dissertation',
  report: 'Report',
  other: 'Other',
}

const TYPE_ICONS: Record<CitationReference['type'], any> = {
  journal: FileText,
  book: BookOpen,
  conference: FileCode,
  website: Globe,
  thesis: GraduationCap,
  report: FileText,
  other: FileText,
}

/** Generate a unique citation key from reference data. */
function generateCitationKey(ref: CitationReference): string {
  const firstAuthor = ref.authors[0]?.split(' ').pop()?.toLowerCase() || 'anon'
  const year = ref.year.toString()
  const titleWord = ref.title.split(' ')[0]?.toLowerCase().replace(/[^a-z]/g, '') || 'work'
  return `${firstAuthor}${year}${titleWord}`
}

/** Format author list for IEEE style: "J. Smith and A. Johnson" or "J. Smith et al." */
function formatAuthorsIEEE(authors: string[], maxAuthors = 6): string {
  if (authors.length === 0) return ''
  if (authors.length === 1) return formatAuthorName(authors[0], 'ieee')
  if (authors.length <= maxAuthors) {
    const formatted = authors.map((a) => formatAuthorName(a, 'ieee'))
    return formatted.slice(0, -1).join(', ') + ' and ' + formatted.slice(-1)[0]
  }
  return formatAuthorName(authors[0], 'ieee') + ' et al.'
}

/** Format author list for APA style: "Smith, J., & Johnson, A." or "Smith, J., et al." */
function formatAuthorsAPA(authors: string[], maxAuthors = 20): string {
  if (authors.length === 0) return ''
  if (authors.length === 1) return formatAuthorName(authors[0], 'apa')
  if (authors.length <= maxAuthors) {
    const formatted = authors.map((a) => formatAuthorName(a, 'apa'))
    return formatted.slice(0, -1).join(', ') + ', & ' + formatted.slice(-1)[0]
  }
  const first19 = authors.slice(0, 19).map((a) => formatAuthorName(a, 'apa'))
  return first19.join(', ') + ', ..., ' + formatAuthorName(authors[authors.length - 1], 'apa')
}

/** Format a single author name. */
function formatAuthorName(name: string, style: CitationStyle): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  const lastName = parts.pop()!
  const initials = parts.map((p) => p[0].toUpperCase() + '.').join(' ')
  return style === 'ieee' ? `${initials} ${lastName}` : `${lastName}, ${initials}`
}

/** Format an in-text citation. */
function formatInTextCitation(
  ref: CitationReference,
  style: CitationStyle,
  options?: { pageNumber?: string; prefix?: string; suffix?: string }
): string {
  const page = options?.pageNumber ? `:${options.pageNumber}` : ''
  const prefix = options?.prefix || ''
  const suffix = options?.suffix || ''

  if (style === 'ieee') {
    return `${prefix}[${ref.id}]${suffix}${page}`
  }
  const firstAuthor = ref.authors[0]?.split(' ').pop() || 'Anonymous'
  return `${prefix}(${firstAuthor}, ${ref.year}${page})${suffix}`
}

/** Format a full bibliography entry. */
function formatBibliographyEntry(ref: CitationReference, style: CitationStyle, number?: number): string {
  const authors = style === 'ieee' ? formatAuthorsIEEE(ref.authors) : formatAuthorsAPA(ref.authors)
  const year = style === 'ieee' ? ref.year.toString() : `(${ref.year})`
  const title = style === 'ieee' ? `"${ref.title},"` : `${ref.title}.`
  const prefix = number != null && style === 'ieee' ? `[${number}] ` : ''

  const parts: string[] = []

  if (style === 'ieee') {
    parts.push(`${prefix}${authors}, ${title}`)
    if (ref.venue) parts.push(`<i>${ref.venue}</i>`)
    if (ref.volume) parts.push(`vol. ${ref.volume}`)
    if (ref.issue) parts.push(`no. ${ref.issue}`)
    if (ref.pages) parts.push(`pp. ${ref.pages}`)
    parts.push(year + '.')
    if (ref.doi) parts.push(`doi: ${ref.doi}`)
    else if (ref.url) parts.push(`Available: ${ref.url}`)
  } else {
    parts.push(`${authors} ${year}. ${title}`)
    if (ref.venue) {
      let venuePart = `<i>${ref.venue}</i>`
      if (ref.volume) venuePart += `, <i>${ref.volume}</i>`
      if (ref.issue) venuePart += `(${ref.issue})`
      if (ref.pages) venuePart += `, ${ref.pages}.`
      parts.push(venuePart)
    }
    if (ref.publisher) parts.push(ref.publisher + '.')
    if (ref.doi) parts.push(`https://doi.org/${ref.doi}`)
    else if (ref.url) parts.push(`Retrieved from ${ref.url}`)
  }

  return parts.join(' ')
}

/** Sort references alphabetically by first author last name, then year. */
function sortReferences(references: CitationReference[]): CitationReference[] {
  return [...references].sort((a, b) => {
    const aLast = a.authors[0]?.split(' ').pop()?.toLowerCase() || ''
    const bLast = b.authors[0]?.split(' ').pop()?.toLowerCase() || ''
    if (aLast !== bLast) return aLast.localeCompare(bLast)
    return a.year - b.year
  })
}

/** Group references by type for organized bibliography. */
function groupReferencesByType(references: CitationReference[]): Record<string, CitationReference[]> {
  const groups: Record<string, CitationReference[]> = {}
  for (const ref of references) {
    const type = ref.type || 'other'
    if (!groups[type]) groups[type] = []
    groups[type].push(ref)
  }
  return groups
}

interface CitationAssistantProps {
  /** Editor instance for inserting citations. */
  editor: any
  /** Current citation style for the document. */
  citationStyle: CitationStyle
  /** Called when citation style changes. */
  onStyleChange?: (style: CitationStyle) => void
  /** Existing references in the document. */
  references?: CitationReference[]
  /** Called when references are updated. */
  onReferencesChange?: (refs: CitationReference[]) => void
  /** Insert mode callback - called when user wants to insert a citation at cursor. */
  onInsertCitation?: (citationText: string) => void
}

export function CitationAssistant({
  editor,
  citationStyle,
  onStyleChange,
  references = [],
  onReferencesChange,
  onInsertCitation,
}: CitationAssistantProps): ReactNode {
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingRef, setEditingRef] = useState<CitationReference | null>(null)
  const [activeTab, setActiveTab] = useState<'insert' | 'manage' | 'bibliography'>('insert')
  const [newRef, setNewRef] = useState<CitationReference>({
    id: '',
    type: 'journal',
    authors: [''],
    title: '',
    year: new Date().getFullYear(),
  })

  const filteredRefs = references.filter((ref) =>
    ref.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ref.authors.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase())) ||
    ref.id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sortedRefs = sortReferences(filteredRefs)
  const groupedRefs = groupReferencesByType(sortedRefs)

  const handleAddReference = () => {
    const ref: CitationReference = {
      ...newRef,
      id: newRef.id || generateCitationKey(newRef),
    }
    const updated = [...references, ref]
    onReferencesChange?.(updated)
    setNewRef({ id: '', type: 'journal', authors: [''], title: '', year: new Date().getFullYear() })
    setShowAddDialog(false)
  }

  const handleUpdateReference = () => {
    if (!editingRef) return
    const updated = references.map((r) => (r.id === editingRef.id ? editingRef : r))
    onReferencesChange?.(updated)
    setEditingRef(null)
  }

  const handleDeleteReference = (id: string) => {
    const updated = references.filter((r) => r.id !== id)
    onReferencesChange?.(updated)
  }

  const handleInsertCitation = (ref: CitationReference) => {
    const citationText = formatInTextCitation(ref, citationStyle)
    onInsertCitation?.(citationText)
    if (editor) {
      editor.chain().focus().insertContent(citationText).run()
    }
  }

  const handleAuthorChange = (index: number, value: string) => {
    const authors = [...(editingRef?.authors || newRef.authors)]
    authors[index] = value
    if (editingRef) {
      setEditingRef({ ...editingRef, authors })
    } else {
      setNewRef({ ...newRef, authors })
    }
  }

  const handleAddAuthor = () => {
    const authors = [...(editingRef?.authors || newRef.authors), '']
    if (editingRef) {
      setEditingRef({ ...editingRef, authors })
    } else {
      setNewRef({ ...newRef, authors })
    }
  }

  const handleRemoveAuthor = (index: number) => {
    const authors = [...(editingRef?.authors || newRef.authors)]
    authors.splice(index, 1)
    if (editingRef) {
      setEditingRef({ ...editingRef, authors })
    } else {
      setNewRef({ ...newRef, authors })
    }
  }

  /** Current reference type — used for conditional placeholder text in the form. */
  const currentRefType = editingRef?.type || newRef.type

  return (
    <div style={panelStyle}>
      {/* Tabs */}
      <div style={tabsStyle}>
        {(['insert', 'manage', 'bibliography'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              ...tabStyle,
              backgroundColor: activeTab === tab ? 'var(--primary)' : 'transparent',
              color: activeTab === tab ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Style Selector */}
      <div style={styleSelectorStyle}>
        <span style={labelStyle}>Citation Style:</span>
        <select
          value={citationStyle}
          onChange={(e) => onStyleChange?.(e.target.value as CitationStyle)}
          style={selectStyle}
        >
          <option value="ieee">IEEE [1]</option>
          <option value="apa">APA (Author, Year)</option>
        </select>
      </div>

      {activeTab === 'insert' && (
        <div style={contentStyle}>
          <input
            type="text"
            placeholder="Search references..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={searchStyle}
          />
          {sortedRefs.length === 0 ? (
            <div style={emptyStyle}>
              <Plus style={{ width: '24px', height: '24px', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }} />
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                No references yet. Switch to <strong>Manage</strong> tab to add references.
              </p>
            </div>
          ) : (
            <ul style={listStyle}>
              {sortedRefs.map((ref) => {
                const RefIcon = TYPE_ICONS[ref.type]
                return (
                  <li key={ref.id} style={itemStyle}>
                    <div style={refRowStyle}>
                      <span
                        style={{
                          ...refTypeIconStyle,
                          color: ref.type === 'journal' ? 'var(--info)' : ref.type === 'book' ? 'var(--success)' : 'var(--muted-foreground)',
                        }}
                      >
                        <RefIcon style={{ width: '14px', height: '14px' }} />
                      </span>
                      <div style={refInfoStyle}>
                        <span style={refTitleStyle}>{ref.title}</span>
                        <span style={refMetaStyle}>
                          {ref.authors.slice(0, 3).map((a) => a.split(' ').pop()).join(', ')}
                          {ref.authors.length > 3 ? ' et al.' : ''} · {ref.year}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInsertCitation(ref)}
                        title="Insert citation at cursor"
                        style={insertButtonStyle}
                      >
                        <Plus style={{ width: '14px', height: '14px' }} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'manage' && (
        <div style={contentStyle}>
          <div style={manageHeaderStyle}>
            <h3 style={manageTitleStyle}>References ({references.length})</h3>
            <button
              type="button"
              onClick={() => {
                setEditingRef(null)
                setNewRef({ id: '', type: 'journal', authors: [''], title: '', year: new Date().getFullYear() })
                setShowAddDialog(true)
              }}
              style={addButtonStyle}
            >
              <Plus style={{ width: '14px', height: '14px', marginRight: '0.375rem' }} />
              Add Reference
            </button>
          </div>

          {Object.entries(groupedRefs).map(([type, refs]) => {
            const TypeIcon = TYPE_ICONS[type]
            return (
              <div key={type} style={groupStyle}>
                <div style={groupLabelStyle}>
                  <TypeIcon style={{ width: '12px', height: '12px', marginRight: '0.375rem' }} />
                  {TYPE_LABELS[type]} ({refs.length})
                </div>
                <ul style={listStyle}>
                  {refs.map((ref) => (
                    <li key={ref.id} style={itemStyle}>
                      <div style={refRowStyle}>
                        <div style={refInfoStyle}>
                          <span style={refTitleStyle}>{ref.title}</span>
                          <span style={refMetaStyle}>
                            {ref.authors.slice(0, 3).map((a) => a.split(' ').pop()).join(', ')}
                            {ref.authors.length > 3 ? ' et al.' : ''} · {ref.year}
                            {ref.venue && ` · ${ref.venue}`}
                            {ref.volume && ` · vol. ${ref.volume}`}
                            {ref.pages && ` · pp. ${ref.pages}`}
                            {ref.doi && ` · doi:${ref.doi}`}
                          </span>
                        </div>
                        <div style={actionsStyle}>
                          <button
                            type="button"
                            onClick={() => setEditingRef(ref)}
                            title="Edit"
                            style={actionButtonStyle}
                          >
                            <Edit2 style={{ width: '14px', height: '14px' }} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInsertCitation(ref)}
                            title="Insert citation"
                            style={actionButtonStyle}
                          >
                            <Copy style={{ width: '14px', height: '14px' }} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteReference(ref.id)}
                            title="Delete"
                            style={{ ...actionButtonStyle, color: 'var(--destructive)' }}
                          >
                            <Trash2 style={{ width: '14px', height: '14px' }} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'bibliography' && (
        <div style={contentStyle}>
          <div style={bibliographyHeaderStyle}>
            <h3 style={manageTitleStyle}>Generated Bibliography</h3>
            <button
              type="button"
              onClick={() => {
                const text = sortedRefs.map((ref, i) => formatBibliographyEntry(ref, citationStyle, i + 1)).join('\n\n')
                navigator.clipboard.writeText(text)
              }}
              style={addButtonStyle}
            >
              <Copy style={{ width: '14px', height: '14px', marginRight: '0.375rem' }} />
              Copy All
            </button>
          </div>
          {sortedRefs.length === 0 ? (
            <div style={emptyStyle}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                Add references in the Manage tab to generate a bibliography.
              </p>
            </div>
          ) : (
            <ol style={bibliographyListStyle}>
              {sortedRefs.map((ref, i) => (
                <li key={ref.id} style={bibliographyItemStyle} dangerouslySetInnerHTML={{ __html: formatBibliographyEntry(ref, citationStyle, i + 1) }} />
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      {(showAddDialog || editingRef) && (
        <div style={dialogOverlayStyle} onClick={() => { setShowAddDialog(false); setEditingRef(null) }}>
          <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
            <div style={dialogHeaderStyle}>
              <h3 style={dialogTitleStyle}>{editingRef ? 'Edit Reference' : 'Add Reference'}</h3>
              <button type="button" onClick={() => { setShowAddDialog(false); setEditingRef(null) }} style={closeButtonStyle}>
                ×
              </button>
            </div>
            <div style={dialogContentStyle}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Type</label>
                <select
                  value={editingRef?.type || newRef.type}
                  onChange={(e) => {
                    const type = e.target.value as CitationReference['type']
                    if (editingRef) setEditingRef({ ...editingRef, type })
                    else setNewRef({ ...newRef, type })
                  }}
                  style={selectStyle}
                >
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Authors</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {(editingRef?.authors || newRef.authors).map((author, index) => (
                    <div key={index} style={authorRowStyle}>
                      <input
                        type="text"
                        placeholder={`Author ${index + 1} (Last, First)`}
                        value={author}
                        onChange={(e) => handleAuthorChange(index, e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button type="button" onClick={() => handleRemoveAuthor(index)} style={removeAuthorButtonStyle}>
                        <Trash2 style={{ width: '14px', height: '14px' }} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={handleAddAuthor} style={addAuthorButtonStyle}>
                    <Plus style={{ width: '14px', height: '14px', marginRight: '0.375rem' }} />
                    Add Author
                  </button>
                </div>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Title</label>
                <input
                  type="text"
                  placeholder="Title of work"
                  value={editingRef?.title || newRef.title}
                  onChange={(e) => {
                    if (editingRef) setEditingRef({ ...editingRef, title: e.target.value })
                    else setNewRef({ ...newRef, title: e.target.value })
                  }}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Year</label>
                  <input
                    type="number"
                    min="1000"
                    max={new Date().getFullYear() + 5}
                    value={editingRef?.year || newRef.year}
                    onChange={(e) => {
                      const year = parseInt(e.target.value) || new Date().getFullYear()
                      if (editingRef) setEditingRef({ ...editingRef, year })
                      else setNewRef({ ...newRef, year })
                    }}
                    style={inputStyle}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Venue / Publisher</label>
                  <input
                    type="text"
                    placeholder={currentRefType === 'book' ? 'Publisher' : 'Journal / Conference name'}
                    value={editingRef?.venue || newRef.venue || ''}
                    onChange={(e) => {
                      if (editingRef) setEditingRef({ ...editingRef, venue: e.target.value })
                      else setNewRef({ ...newRef, venue: e.target.value })
                    }}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Volume</label>
                  <input
                    type="text"
                    placeholder="Volume"
                    value={editingRef?.volume || newRef.volume || ''}
                    onChange={(e) => {
                      if (editingRef) setEditingRef({ ...editingRef, volume: e.target.value })
                      else setNewRef({ ...newRef, volume: e.target.value })
                    }}
                    style={inputStyle}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Issue / Edition</label>
                  <input
                    type="text"
                    placeholder={currentRefType === 'book' ? 'Edition' : 'Issue'}
                    value={editingRef?.issue || newRef.issue || ''}
                    onChange={(e) => {
                      if (editingRef) setEditingRef({ ...editingRef, issue: e.target.value })
                      else setNewRef({ ...newRef, issue: e.target.value })
                    }}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Pages</label>
                  <input
                    type="text"
                    placeholder="Page range (e.g., 123-145)"
                    value={editingRef?.pages || newRef.pages || ''}
                    onChange={(e) => {
                      if (editingRef) setEditingRef({ ...editingRef, pages: e.target.value })
                      else setNewRef({ ...newRef, pages: e.target.value })
                    }}
                    style={inputStyle}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>DOI / URL</label>
                  <input
                    type="text"
                    placeholder="10.1234/example or https://..."
                    value={editingRef?.doi || newRef.doi || newRef.url || ''}
                    onChange={(e) => {
                      const value = e.target.value
                      if (editingRef) setEditingRef({ ...editingRef, doi: value.startsWith('10.') ? value : undefined, url: value.startsWith('http') ? value : undefined })
                      else setNewRef({ ...newRef, doi: value.startsWith('10.') ? value : undefined, url: value.startsWith('http') ? value : undefined })
                    }}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
            <div style={dialogFooterStyle}>
              <button type="button" onClick={() => { setShowAddDialog(false); setEditingRef(null) }} style={cancelButtonStyle}>
                Cancel
              </button>
              <button type="button" onClick={editingRef ? handleUpdateReference : handleAddReference} style={saveButtonStyle}>
                {editingRef ? 'Save Changes' : 'Add Reference'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}