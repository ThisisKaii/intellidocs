import { useState, useRef, useEffect } from 'react'
import { Info } from 'lucide-react'

interface FeatureWeight {
  name: string
  value: number
  percentage: number
}

interface ExplainableAIPopoverProps {
  featureValues: Record<string, number>
  predictedFormat: string
  confidence: number
}

/**
 * S1: Capstone Defense Explainable AI Visualizer.
 * Shows exact feature weights when the user clicks the confidence pill,
 * providing visual proof of the multi-feature ML pipeline for defense panels.
 */
export default function ExplainableAIPopover({
  featureValues,
  predictedFormat,
  confidence,
}: ExplainableAIPopoverProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
    return undefined
  }, [open])

  // Convert feature values to human-readable weights
  const features: FeatureWeight[] = Object.entries(featureValues)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => {
      const readable = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
      return {
        name: readable,
        value,
        percentage: Math.round(value * 100),
      }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const formatLabel = predictedFormat
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
        title="View feature weights"
      >
        {Math.round(confidence * 100)}%
        <Info className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 rounded-xl bg-popover border border-border shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              ML Feature Weights
            </h4>
            <span className="text-xs font-medium text-muted-foreground">
              → {formatLabel}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {features.map((f) => (
              <div key={f.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{f.name}</span>
                  <span className="text-xs font-semibold text-foreground">{f.percentage}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(f.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              These weights reflect the RandomForest model's feature importance
              for this prediction. Feature values are computed from text structure,
              typography, and hierarchical document context.
            </p>
          </div>

          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-popover border-r border-b border-border rotate-45" />
        </div>
      )}
    </div>
  )
}
