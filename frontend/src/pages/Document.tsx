import { useParams, Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Toolbar } from '@/components/editor/Toolbar'
import { EditorCore } from '@/components/editor/EditorCore'
import { BehaviorEvent, createBehaviorEvent } from '@/components/editor/behaviorListener'
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


function Document(): JSX.Element {
  const { id } = useParams()
  const [behaviorEvents, setBehaviorEvents] = useState<BehaviorEvent[]>([])
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [formatHistory, setFormatHistory] = useState<string[]>([])

  const [title, setTitle] = useState<string>()
  const [content, setContent] = useState<string>('')
  const [lastSavedContent, setLastSavedContent] = useState<string>('')
  const [isSaved, setIsSaved] = useState<boolean>(true)
  const [wordCount, setWordCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)

  const savingRef = useRef<boolean>(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function loadDocument(): Promise<void> {
      if (!id) return

      try {
        const doc = await api.documents.get(id)
        setTitle(doc.title)
        setContent(doc.content || '')
        setLastSavedContent(doc.content || '')
        setIsSaved(true)
        updateCounts(doc.content || '')
      } catch (err) {
        console.error(err)
      }
    }

    loadDocument()
  }, [id])

  useEffect(() => {
    if (!id) return

    intervalRef.current = setInterval(async () => {
      if (savingRef.current) return
      if (content === lastSavedContent) return

      try {
        savingRef.current = true
        await api.documents.update(id, { content })
        setLastSavedContent(content)
        setIsSaved(true)
      } catch (err) {
        console.error('Autosave failed', err)
      } finally {
        savingRef.current = false
      }
    }, 8000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [id, content, lastSavedContent])

     function handleFormatApplied(action: string): void {
    setFormatHistory((prev) => [...prev, action])

    if (id) {
      const event = createBehaviorEvent(action, id)
      setBehaviorEvents((prev) => [...prev, event])

      const token = localStorage.getItem('authToken')
      if (!token) {
        console.error('No auth token in localStorage')
        return
      }

      fetch('http://localhost:3000/behavior/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(event),
      }).catch((err) => {
        console.error('Behavior log failed', err)
      })
    }
  }


  function updateCounts(html: string): void {
    const text = html.replace(/<[^>]*>/g, '')
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0).length
    setWordCount(words)
    setCharCount(text.length)
  }

  function handleContentChange(newContent: string): void {
    setContent(newContent)
    setIsSaved(false)
    updateCounts(newContent)
  }

async function handleSave(): Promise<void> {
  if (!id) return
  try {
    await api.documents.update(id, {
      content,
      formatting_history: formatHistory,
    })
    console.log('behaviorEvents', behaviorEvents)
    setLastSavedContent(content)
    setIsSaved(true)
  } catch (err) {
    console.error(err)
  }
}


  function focusEditor(): void {
    if (editorRef.current) {
      editorRef.current.focus()
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link to="/" aria-label="Back to home">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <span className="text-sm font-medium">{title}</span>
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

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-0">
        <main className="flex-1 border-r border-border p-6">
          <div className="mx-auto max-w-3xl">
            <Toolbar
              onFormatApplied={handleFormatApplied}
              onFocusEditor={focusEditor}/>

            <EditorCore
              ref={editorRef}
              onContentChange={handleContentChange}
              initialContent={content}
            />
          </div>
        </main>

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
