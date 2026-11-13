import { useEffect, useState } from 'react'

/**
 * The value, updated only after it has stopped changing for `delayMs`. For work derived from the
 * whole document (outline, AI context) that must not run on every keystroke of a long document.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return settled
}
