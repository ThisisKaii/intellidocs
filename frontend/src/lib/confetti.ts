/** Brand-leaning confetti colours (read once from CSS tokens, with fallbacks). */
const FALLBACK_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed']
const PIECES = 140
const DURATION_MS = 2600
const GRAVITY = 0.12
const DRAG = 0.985

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  spin: number
  color: string
}

/** True when the viewer asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * A short confetti burst from the top-centre of the viewport, drawn on a temporary full-screen
 * canvas that ignores pointer events and removes itself. Skipped under reduced motion.
 */
export function burstConfetti(): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) return
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '1000' })
  document.body.appendChild(canvas)
  ctx.scale(dpr, dpr)

  const pieces: Piece[] = Array.from({ length: PIECES }, () => ({
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.3,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 11 - 4,
    size: 5 + Math.random() * 5,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    color: FALLBACK_COLORS[Math.floor(Math.random() * FALLBACK_COLORS.length)],
  }))

  const start = performance.now()
  const frame = (now: number): void => {
    const elapsed = now - start
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS)
    for (const piece of pieces) {
      piece.vx *= DRAG
      piece.vy = piece.vy * DRAG + GRAVITY
      piece.x += piece.vx
      piece.y += piece.vy
      piece.rotation += piece.spin
      ctx.save()
      ctx.translate(piece.x, piece.y)
      ctx.rotate(piece.rotation)
      ctx.fillStyle = piece.color
      ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2)
      ctx.restore()
    }
    if (elapsed < DURATION_MS) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
