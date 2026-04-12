import { useParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
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

/** Document page — editor workspace with toolbar and sidebar */
function Document() {
  const { id } = useParams()

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
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
              <Cloud className="size-3 text-emerald-500" />
              Saved
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Lightbulb className="mr-1 size-3.5" />
              Suggestions
            </Button>
            <Button size="sm">
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
            {/* Toolbar placeholder */}
            <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-card p-1.5">
              {['B', 'I', 'U', 'H1', 'H2', 'H3'].map((btn) => (
                <button
                  key={btn}
                  className="flex h-7 min-w-[28px] items-center justify-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {btn}
                </button>
              ))}
              <div className="mx-1 h-5 w-px bg-border" />
              {['List', 'Quote', 'Code'].map((btn) => (
                <button
                  key={btn}
                  className="flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {btn}
                </button>
              ))}
            </div>

            {/* Editor surface */}
            <div className="min-h-[560px] rounded-lg border border-dashed border-border bg-card p-8">
              <p className="text-sm leading-7 text-muted-foreground">
                The custom contentEditable editor will render here. This surface
                will contain the toolbar formatting, inline grammar highlights,
                and the suggestion overlay with confidence scoring.
              </p>
              <p className="mt-4 text-xs text-muted-foreground/60">
                Document ID: {id}
              </p>
            </div>
          </div>
        </main>

        {/* Right sidebar */}
        <aside className="hidden w-72 flex-col gap-4 p-5 lg:flex">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Document info</CardTitle>
              <CardDescription className="text-xs">
                Metadata and quick actions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Words</span>
                <span className="font-medium">0</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Characters</span>
                <span className="font-medium">0</span>
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