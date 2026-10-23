import { useEffect, useRef, useState } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'

/** Zoom bounds and step shared by the widget, shortcuts, and wheel handler. */
export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 2
export const ZOOM_STEP = 0.1

/** Clamp a zoom level to the supported range, rounded to 2 decimals. */
export function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parseFloat(value.toFixed(2))))
}

/** Quick preset levels offered in the badge menu. */
const PRESETS: number[] = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2]

interface DocumentZoomWidgetProps {
  /** Current canvas zoom (1 = 100%). */
  zoomLevel: number
  /** Called with the next zoom level whenever the user zooms. */
  onZoomChange: (level: number) => void
  /** Fit the page width to roughly 90% of the visible canvas. */
  onFitWidth?: () => void
}

/**
 * Word-style floating zoom control docked at the bottom-right of the editor
 * canvas: step buttons, a range slider, and a percentage badge that opens
 * quick presets (50%-200% and Fit Width). It only drives the canvas `zoom`
 * style on `.intellidocs-page-editor` — never the browser zoom.
 */
export default function DocumentZoomWidget({
  zoomLevel,
  onZoomChange,
  onFitWidth,
}: DocumentZoomWidgetProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close the preset menu on any click outside the widget.
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  const percent = Math.round(zoomLevel * 100)

  /** Step the zoom by one 10% increment in the given direction. */
  const step = (direction: 1 | -1): void => onZoomChange(clampZoom(zoomLevel + direction * ZOOM_STEP))

  const iconButtonClass =
    'flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground ' +
    'transition-colors duration-150 hover:bg-secondary hover:text-foreground ' +
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40'

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Document zoom"
      className="sticky bottom-4 z-30 ml-auto mr-5 mt-2 flex w-fit items-center gap-1.5 rounded-xl border border-border/60 bg-card/95 p-1 shadow-sm backdrop-blur-sm"
    >
      <button
        type="button"
        className={iconButtonClass}
        onClick={() => step(-1)}
        disabled={zoomLevel <= ZOOM_MIN}
        title="Zoom out (Ctrl+-)"
        aria-label="Zoom out"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={0.05}
        value={zoomLevel}
        onChange={(event) => onZoomChange(clampZoom(parseFloat(event.target.value)))}
        className="w-28 h-6 cursor-pointer accent-[var(--primary)]"
        aria-label="Zoom level"
      />

      <button
        type="button"
        className={iconButtonClass}
        onClick={() => step(1)}
        disabled={zoomLevel >= ZOOM_MAX}
        title="Zoom in (Ctrl+=)"
        aria-label="Zoom in"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-7 min-w-[3.25rem] items-center justify-center rounded-lg px-1.5 text-xs font-medium text-foreground tabular-nums transition-colors duration-150 hover:bg-secondary active:scale-[0.98]"
          title="Zoom presets"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {percent}%
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute bottom-full right-0 mb-2 w-36 rounded-xl border border-border/60 bg-card p-1 shadow-md"
          >
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                role="menuitem"
                onClick={() => {
                  onZoomChange(clampZoom(preset))
                  setMenuOpen(false)
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs tabular-nums transition-colors duration-150 hover:bg-secondary ${
                  zoomLevel === preset ? 'font-semibold text-[var(--primary)]' : 'text-foreground'
                }`}
              >
                {Math.round(preset * 100)}%
                {preset === 1 && <span className="text-[10px] text-muted-foreground">Default</span>}
              </button>
            ))}
            {onFitWidth && (
              <>
                <div className="my-1 h-px bg-border/60" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onFitWidth()
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground transition-colors duration-150 hover:bg-secondary"
                >
                  <Maximize className="h-3 w-3 text-muted-foreground" />
                  Fit Width
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
