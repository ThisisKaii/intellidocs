/** A chart captured as a PNG, with the pixel size it was drawn at (before scaling). */
export interface ChartImage {
  dataUrl: string
  width: number
  height: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Standalone SVG markup for a live Recharts surface: explicit size, inline font and a white
 * background, so it renders the same outside the page (an <img> sees no page CSS).
 */
export function standaloneSvg(svg: SVGSVGElement): { markup: string; width: number; height: number } {
  const width = Number(svg.getAttribute('width')) || svg.clientWidth || 600
  const height = Number(svg.getAttribute('height')) || svg.clientHeight || 260
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  clone.setAttribute('style', 'font-family:Arial,Helvetica,sans-serif;font-size:11px')
  const background = document.createElementNS(SVG_NS, 'rect')
  background.setAttribute('width', '100%')
  background.setAttribute('height', '100%')
  background.setAttribute('fill', '#ffffff')
  clone.insertBefore(background, clone.firstChild)
  return { markup: new XMLSerializer().serializeToString(clone), width, height }
}

/** Rasterize SVG markup to a base64 PNG data URL at `scale`× for a crisp print. */
export function svgToPngDataUrl(markup: string, width: number, height: number, scale = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * scale)
        canvas.height = Math.round(height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas is not available')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      } catch (error) {
        reject(error)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('A chart could not be rendered for the PDF'))
    }
    image.src = url
  })
}

/** Capture every live chart (`[data-chart-id] svg.recharts-surface`) in a container as PNGs, keyed by chart id. */
export async function rasterizeCharts(container: ParentNode): Promise<Record<string, ChartImage>> {
  const holders = Array.from(container.querySelectorAll<HTMLElement>('[data-chart-id]'))
  const entries = await Promise.all(
    holders.map(async (holder): Promise<[string, ChartImage] | null> => {
      const svg = holder.querySelector<SVGSVGElement>('svg.recharts-surface')
      const id = holder.dataset.chartId
      if (!svg || !id) return null
      const { markup, width, height } = standaloneSvg(svg)
      return [id, { dataUrl: await svgToPngDataUrl(markup, width, height), width, height }]
    }),
  )
  return Object.fromEntries(entries.filter((entry): entry is [string, ChartImage] => entry !== null))
}
