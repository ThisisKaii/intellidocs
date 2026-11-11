import { useState } from 'react'

const MAX_COLS = 8
const MAX_ROWS = 6
const PRESETS: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [3, 3],
  [4, 4],
]

interface InsertTablePickerProps {
  onPick: (rows: number, cols: number) => void
}

/** Word-style table size picker: hover a grid to choose rows × columns, or pick a preset. */
export function InsertTablePicker({ onPick }: InsertTablePickerProps): JSX.Element {
  const [hover, setHover] = useState<{ rows: number; cols: number } | null>(null)

  return (
    <div style={{ padding: '6px 8px 4px' }} onMouseLeave={() => setHover(null)}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px' }}>
        {hover ? `${hover.rows} × ${hover.cols} Table` : 'Insert Table'}
      </div>
      <div
        role="grid"
        aria-label="Table size"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${MAX_COLS}, 18px)`, gap: '3px' }}
      >
        {Array.from({ length: MAX_ROWS * MAX_COLS }, (_, i) => {
          const row = Math.floor(i / MAX_COLS) + 1
          const col = (i % MAX_COLS) + 1
          const lit = hover !== null && row <= hover.rows && col <= hover.cols
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              aria-label={`${row} by ${col}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHover({ rows: row, cols: col })}
              onClick={() => onPick(row, col)}
              style={{
                width: '18px',
                height: '18px',
                padding: 0,
                borderRadius: '3px',
                border: lit ? '1px solid var(--primary)' : '1px solid var(--border)',
                backgroundColor: lit ? 'color-mix(in srgb, var(--primary) 20%, transparent)' : 'var(--card)',
                cursor: 'pointer',
              }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
        {PRESETS.map(([rows, cols]) => (
          <button
            key={`${rows}x${cols}`}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(rows, cols)}
            style={{
              flex: 1,
              height: '24px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              fontSize: '11px',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {rows}×{cols}
          </button>
        ))}
      </div>
    </div>
  )
}
