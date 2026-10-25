import { useState } from 'react'
import { Sparkles, Download, Upload } from 'lucide-react'
import {
  getEditorPreferences,
  setEditorPreferences,
  type EditorPreferences,
} from '@/lib/editorPreferences'
import PersonalizationProfileModal from '@/components/editor/PersonalizationProfileModal'
import LearningCard from '@/components/editor/LearningCard'
import FormattingPanel from '@/components/editor/FormattingPanel'

/** Persisted editor & AI preferences: underline style, sensitivity, highlight color. */
export function EditorPersonalizationSection(): JSX.Element {
  const [prefs, setPrefs] = useState(() => getEditorPreferences())
  const [profileModalOpen, setProfileModalOpen] = useState(false)

  function update(next: Partial<EditorPreferences>): void {
    setPrefs(setEditorPreferences(next))
  }

  return (
    <section className="rounded-xl bg-card border border-border p-6 shadow-sm">
      <h2 className="text-base font-medium mb-4 flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Editor &amp; AI
      </h2>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Suggestion underline style</label>
          <div className="flex gap-2">
            {(
              [
                { value: 'straight', label: 'Straight lines' },
                { value: 'wavy', label: 'Wavy lines' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => update({ underlineStyle: option.value })}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium border transition-colors cursor-pointer ${
                  prefs.underlineStyle === option.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Grammar issues underline in red, spelling issues in amber.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Suggestion sensitivity</label>
          <div className="flex gap-2">
            {(
              [
                { value: 'low', label: 'Fewer tips', threshold: '≥55%' },
                { value: 'medium', label: 'Balanced', threshold: '≥68%' },
                { value: 'high', label: 'More tips', threshold: '≥80%' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => update({ sensitivity: option.value })}
                className={`flex-1 rounded-lg px-3 py-2 text-sm border transition-colors cursor-pointer ${
                  prefs.sensitivity === option.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
                }`}
              >
                <span className="block font-medium">{option.label}</span>
                <span className="block text-xs opacity-80">{option.threshold}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Highlight color</label>
          <div className="flex gap-2">
            {(
              [
                { value: 'indigo', swatch: '#6366f1' },
                { value: 'purple', swatch: '#7c3aed' },
                { value: 'emerald', swatch: '#059669' },
                { value: 'amber', swatch: '#d97706' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.value}
                onClick={() => update({ highlightColor: option.value })}
                aria-label={`Highlight color ${option.value}`}
                className="rounded-full p-1 border transition-transform cursor-pointer hover:scale-110"
                style={{
                  backgroundColor: option.swatch,
                  borderColor: prefs.highlightColor === option.value ? 'var(--foreground)' : 'transparent',
                  boxShadow: prefs.highlightColor === option.value ? '0 0 0 2px var(--card)' : undefined,
                }}
              >
                <span className="block size-6 rounded-full" />
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Used for in-canvas formatting suggestion highlights and the suggestion pulse.
          </p>
        </div>

        <div className="border-t border-border pt-5">
          <LearningCard />
        </div>

        <details className="border-t border-border pt-5">
          <summary className="text-sm font-medium text-foreground cursor-pointer">
            Advanced: custom formatting rules
          </summary>
          <p className="text-xs text-muted-foreground mt-2 mb-3">
            Tell IntelliDocs that a short line on its own should always become a particular format.
          </p>
          <FormattingPanel rulesOnly />
        </details>

        <div className="border-t border-border pt-5">
          <label className="text-sm font-medium text-foreground block mb-1">
            Personalization profile (.idocprofile)
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Export your learned formatting rules and custom dictionary as a portable file, or import
            a profile shared by a professor or teammate.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border border-border bg-transparent text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Download className="size-4" />
              Export profile
            </button>
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border border-border bg-transparent text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Upload className="size-4" />
              Import profile
            </button>
          </div>
        </div>
      </div>

      <PersonalizationProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />
    </section>
  )
}
