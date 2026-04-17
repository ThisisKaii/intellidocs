
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import * as FormattingCommands from './FormattingCommands'
import { isFormatActive, restoreSelection } from './SelectionManager'
import {
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
} from 'lucide-react'

interface ToolbarProps {
  onFormatApplied?: (action: string) => void
  onFocusEditor?: () => void
}


export function Toolbar({ onFormatApplied, onFocusEditor }: ToolbarProps) {
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Update active formats when selection changes
    const updateActiveFormats = () => {
      const formats = new Set<string>()
      if (isFormatActive('bold')) formats.add('bold')
      if (isFormatActive('italic')) formats.add('italic')
      if (isFormatActive('underline')) formats.add('underline')
      setActiveFormats(formats)
    }

    document.addEventListener('selectionchange', updateActiveFormats)
    return () => document.removeEventListener('selectionchange', updateActiveFormats)
  }, [])

  // Apply formatting while keeping selection
  function handleFormat(command: () => void, action?: string) {
    onFocusEditor?.()
    restoreSelection()
    command()
    if (action) onFormatApplied?.(action)

    if (action) {
      setActiveFormats((prev) => {
        const next = new Set(prev)
        if (next.has(action)) {
          next.delete(action)
        } else {
          next.add(action)
        }
        return next
      })
    }
  }

  function handleMouseDown(command: () => void, action?: string) {
    return (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      handleFormat(command, action)
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card p-2">
      <Button variant={activeFormats.has('bold') ? 'default' : 'ghost'} size="sm" onMouseDown={handleMouseDown(FormattingCommands.bold, 'bold')}>
        <Bold className="size-4" />
      </Button>

      <Button variant={activeFormats.has('italic') ? 'default' : 'ghost'} size="sm" onMouseDown={handleMouseDown(FormattingCommands.italic, 'italic')}>
        <Italic className="size-4" />
      </Button>

      <Button variant={activeFormats.has('underline') ? 'default' : 'ghost'} size="sm" onMouseDown={handleMouseDown(FormattingCommands.underline, 'underline')}>
        <Underline className="size-4" />
      </Button>

      <div className="mx-1 h-5 w-px bg-border" />

      <Button variant="ghost" size="sm" onMouseDown={handleMouseDown(FormattingCommands.heading1, 'heading1')}>
        <Heading1 className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onMouseDown={handleMouseDown(FormattingCommands.heading2, 'heading2')}>
        <Heading2 className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onMouseDown={handleMouseDown(FormattingCommands.heading3, 'heading3')}>
        <Heading3 className="size-4" />
      </Button>

      <div className="mx-1 h-5 w-px bg-border" />

      <Button variant="ghost" size="sm" onMouseDown={handleMouseDown(FormattingCommands.bulletList, 'unordered_list')}>
        <List className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onMouseDown={handleMouseDown(FormattingCommands.numberedList, 'ordered_list')}>
        <ListOrdered className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onMouseDown={handleMouseDown(FormattingCommands.blockquote, 'blockquote')}>
        <Quote className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onMouseDown={handleMouseDown(FormattingCommands.codeBlock, 'code_block')}>
        <Code className="size-4" />
      </Button>
    </div>
  )
}
