import { useParams, Link } from 'react-router-dom'
import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Toolbar } from '@/components/editor/Toolbar'
import { EditorCore } from '@/components/editor/EditorCore'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  FileText,
  Save,
  Lightbulb,
  MessageSquare,
  ArrowLeft,
  Cloud,
} from 'lucide-react'

// Document page — editor workspace with toolbar and sidebar
function Document() {
  const { id } = useParams()
  const [content, setContent] = useState('')
  const [isSaved, setIsSaved] = useState(true)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const editorRef = useRef<HTMLDivElement | null>(null)

  function focusEditor() {
    if (editorRef.current) {
      editorRef.current.focus()
    }
  }


  function handleContentChange(newContent: string) {
    setContent(newContent)
    setIsSaved(false)

    // Count words and characters
    const text = newContent.replace(/<[^>]*>/g, '') // Strip HTML tags
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0).length
    const chars = text.length

    setWordCount(words)
    setCharCount(chars)
  }

  function handleSave() {
    // TODO: Save to backend via api.documents.update()
    setIsSaved(true)
    console.log('Document saved:', content)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ── Top bar ────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm">
              <Link to="/" aria-label="Back to home">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <span className="text-sm font-medium">Untitled document</span>
            </div>
            <div
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
                isSaved
                  ? 'border-border bg-emerald-500/10 text-emerald-600'
                  : 'border-yellow-500 bg-yellow-500/10 text-yellow-600'
              }`}
            >
              <Cloud className="size-3" />
              {isSaved ? 'Saved' : 'Unsaved'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Lightbulb className="mr-1 size-3.5" />
              Suggestions
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaved}>
              <Save className="mr-1 size-3.5" />
              Save
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main workspace ─────────────────────────── */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-0">
        {/* Editor area */}
        <main className="flex-1 border-r border-border p-6">
          <div className="mx-auto max-w-3xl">
            <Toolbar onFormatApplied={() => {}} onFocusEditor={focusEditor} />
            <EditorCore ref={editorRef} onContentChange={handleContentChange} />

          </div>
        </main>

        {/* Right sidebar */}
        <aside className="hidden w-72 flex-col gap-4 p-5 lg:flex">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Document info</CardTitle>
              <CardDescription className="text-xs">
                Metadata and quick stats.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Words</span>
                <span className="font-medium">{wordCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Characters</span>
                <span className="font-medium">{charCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Suggestions</span>
                <span className="font-medium">—</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Confidence</span>
                <span className="font-medium text-primary">—</span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start">
                <Lightbulb className="mr-2 size-3.5" />
                View suggestions
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <MessageSquare className="mr-2 size-3.5" />
                Open assistant
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

export default Document
