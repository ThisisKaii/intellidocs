/** Chart colours as hex, because exported PDF charts are drawn outside the page's CSS variables. */
export const CHART_COLORS = {
  primary: '#1351aa',
  green: '#059669',
  amber: '#d97706',
  red: '#dc2626',
  violet: '#7c3aed',
  slate: '#64748b',
} as const

/** Colour order for series that have no meaning of their own (one colour per bar or slice). */
export const CHART_SERIES: string[] = [
  CHART_COLORS.primary,
  CHART_COLORS.green,
  CHART_COLORS.amber,
  CHART_COLORS.violet,
  CHART_COLORS.red,
  CHART_COLORS.slate,
]
