/**
 * Whether the editor's ribbon toolbar is collapsed to its tab strip. Kept per browser in
 * localStorage; on short screens (lab monitors, laptops at 125% scaling) it starts collapsed so
 * the page gets the vertical space.
 */

const STORAGE_KEY = 'intellidocs:ribbon-collapsed'
/** Windows this short (CSS px) start with the ribbon collapsed. */
export const SHORT_SCREEN_PX = 800

/** The saved choice, else collapsed on a short screen. */
export function readRibbonCollapsed(): boolean {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'true' || saved === 'false') return saved === 'true'
  } catch {
    // Storage blocked: fall through to the screen-height default.
  }
  return typeof window !== 'undefined' && window.innerHeight <= SHORT_SCREEN_PX
}

/** Remember the user's choice. */
export function writeRibbonCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed))
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}
