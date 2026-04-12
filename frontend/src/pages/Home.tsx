import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ArrowRight,
  Brain,
  FileText,
  FlaskConical,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react'

const features = [
  {
    icon: Brain,
    title: 'Behavioral learning',
    text: 'Learns your formatting patterns and adapts suggestions to your style.',
  },
  {
    icon: Wand2,
    title: 'Inline guidance',
    text: 'Confidence-scored recommendations appear without disrupting flow.',
  },
  {
    icon: ShieldCheck,
    title: 'Grammar & spelling',
    text: 'Real-time writing assistance trained on academic datasets.',
  },
  {
    icon: FlaskConical,
    title: 'Research-ready',
    text: 'Built for measurable user studies and behavior analytics.',
  },
]

function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            <span className="text-base font-semibold tracking-tight">IntelliDocs</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/register">
                Get started
                <ArrowRight className="ml-1 size-3" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-20 pt-16">
        <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3 text-primary" />
              Capstone research project
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                The editor that learns
                <br className="hidden sm:block" />
                how you format
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                IntelliDocs watches your formatting patterns, predicts your next move,
                and suggests improvements with confidence scoring you can trust.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/register">
                  Start writing
                  <ArrowRight className="ml-1 size-3.5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Prediction accuracy', value: '92%' },
                { label: 'Avg. time saved', value: '38%' },
                { label: 'Suggestions applied', value: '47' },
              ].map((stat) => (
                <Card key={stat.label} className="border-border bg-card shadow-sm">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="text-2xl font-semibold">{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="space-y-2">
              <CardDescription className="text-xs uppercase tracking-[0.2em]">
                Workspace preview
              </CardDescription>
              <CardTitle className="text-2xl">Your documents, organized</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 h-3 w-28 rounded-full bg-primary/20" />
                <div className="space-y-2">
                  <div className="h-2 w-full rounded bg-muted" />
                  <div className="h-2 w-5/6 rounded bg-muted" />
                  <div className="h-2 w-4/6 rounded bg-muted" />
                  <div className="h-2 w-3/4 rounded bg-muted" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs text-muted-foreground">Auto-save</p>
                  <p className="mt-2 text-lg font-semibold text-emerald-500">
                    Synced
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs text-muted-foreground">Next suggestion</p>
                  <p className="mt-2 text-lg font-semibold">Heading format</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="border-border bg-card shadow-sm">
              <CardHeader className="pb-2">
                <feature.icon className="mb-1 size-4 text-primary" />
                <CardTitle className="text-sm font-medium">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs leading-relaxed">
                  {feature.text}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="size-3.5" />
            IntelliDocs · Capstone Research 2026
          </div>
          <p className="text-xs text-muted-foreground">Built by Joshua Asingua</p>
        </div>
      </footer>
    </div>
  )
}

export default Home