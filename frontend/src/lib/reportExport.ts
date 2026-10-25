/**
 * Admin report export.
 *
 * The PDF is a print layout (summary, charts, tables) loaded into a hidden
 * iframe and sent to the browser's print dialog, where "Save as PDF" produces
 * the file. Charts are the live Recharts SVGs serialized into the page, so the
 * PDF shows exactly what the admin sees.
 */

import type { ChartSpec } from './reportCharts'
import type { AdminUserRecord, RoleName, SystemReport } from '../types/admin'

const roleLabels: Record<RoleName, string> = {
  student: 'Student',
  professor: 'Professor',
  admin: 'Administrator',
}

/** Escape text destined for HTML output. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Render an array of cell strings as one table row of th or td cells. */
function tableRow(cells: string[], header = false): string {
  const tag = header ? 'th' : 'td'
  return `<tr>${cells.map((cell) => `<${tag}>${cell}</${tag}>`).join('')}</tr>`
}

/**
 * Serialize the Recharts SVG inside each `[data-chart-id]` element of a
 * container, keyed by chart id. The SVG gets a viewBox and fluid width so it
 * scales to the printed column.
 */
export function serializeChartSvgs(container: ParentNode): Record<string, string> {
  const result: Record<string, string> = {}
  container.querySelectorAll<HTMLElement>('[data-chart-id]').forEach((holder) => {
    const svg = holder.querySelector<SVGSVGElement>('svg.recharts-surface')
    const id = holder.dataset.chartId
    if (!svg || !id) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    const width = svg.getAttribute('width') ?? String(svg.clientWidth)
    const height = svg.getAttribute('height') ?? String(svg.clientHeight)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
    clone.removeAttribute('width')
    clone.removeAttribute('height')
    clone.setAttribute('style', 'width:100%;height:auto;font-family:Arial,Helvetica,sans-serif')
    result[id] = new XMLSerializer().serializeToString(clone)
  })
  return result
}

/** One chart block for the print layout: title, the chart (or a note when it has no data) and a legend. */
function chartBlock(spec: ChartSpec, svg: string | undefined): string {
  const legend = spec.series
    .map((s) => `<span class="key"><i style="background:${s.color}"></i>${esc(s.name)}</span>`)
    .join('')
  const body = spec.rows.length === 0 || !svg ? '<p class="empty">No data recorded for this chart yet.</p>' : svg
  return `<figure class="chart"><figcaption>${esc(spec.title)}</figcaption>${body}<div class="legend">${legend}</div></figure>`
}

/** Compose the full printable HTML page for the admin system report. */
export function buildAdminReportHtml(
  report: SystemReport,
  users: AdminUserRecord[],
  specs: ChartSpec[],
  chartSvgs: Record<string, string>,
): string {
  const generated = new Date(report.generatedAt).toLocaleString()
  const dateStamp = new Date(report.generatedAt).toISOString().slice(0, 10)

  const stats: Array<[string, string]> = [
    ['Total users', String(report.totalUsers)],
    ['Pending verifications', String(report.pendingApplicants)],
    ['Active documents', String(report.activeDocuments)],
    ['Formatting events', String(report.totalFormattingActions)],
    ['AI suggestions accepted', `${report.feedback.acceptanceRate} (${report.feedback.accepted}/${report.feedback.total})`],
  ]

  const feedbackRows = Object.entries(report.feedback.byType).map(([type, s]) =>
    tableRow([esc(type), String(s.total), String(s.accepted), String(s.rejected), esc(s.acceptanceRate)]),
  )
  const userRows = users.map((user) =>
    tableRow([
      esc(user.display_name || '—'),
      esc(user.email || '—'),
      user.role_name ? esc(roleLabels[user.role_name]) : '—',
      esc(user.verification_status),
      String(user.document_count),
      new Date(user.created_at).toLocaleDateString(),
    ]),
  )

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>IntelliDocs System Report ${dateStamp}</title>
<style>
  @page { size: letter; margin: 0.7in; }
  html, body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }
  body { margin: 0; font-size: 10.5pt; }
  h1 { font-size: 20pt; margin: 0 0 0.2rem; }
  h2 { font-size: 13pt; margin: 1.4rem 0 0.5rem; break-after: avoid; }
  .meta { color: #555; font-size: 9.5pt; margin: 0 0 1rem; }
  .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8pt; }
  .stat { border: 1px solid #ccc; border-radius: 4pt; padding: 7pt 8pt; }
  .stat b { display: block; font-size: 15pt; }
  .stat span { font-size: 8.5pt; color: #555; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; }
  .chart { margin: 0; border: 1px solid #ddd; border-radius: 4pt; padding: 8pt; break-inside: avoid; }
  .chart figcaption { font-weight: 700; font-size: 10pt; margin-bottom: 4pt; }
  .legend { margin-top: 4pt; font-size: 8.5pt; color: #444; }
  .key { margin-right: 10pt; }
  .key i { display: inline-block; width: 8pt; height: 8pt; margin-right: 3pt; border-radius: 2pt; }
  .empty { color: #777; font-size: 9pt; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #bbb; padding: 4pt 6pt; text-align: left; vertical-align: top; font-size: 9.5pt; }
  th { background: #f2f2f2; font-weight: 600; }
  tr { break-inside: avoid; }
</style>
</head>
<body>
  <h1>IntelliDocs &mdash; System Report</h1>
  <p class="meta">Generated ${esc(generated)} &bull; ${users.length} user account${users.length === 1 ? '' : 's'} listed</p>

  <div class="stats">
    ${stats.map(([label, value]) => `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('\n    ')}
  </div>

  <h2>Charts</h2>
  <div class="charts">
    ${specs.map((spec) => chartBlock(spec, chartSvgs[spec.id])).join('\n    ')}
  </div>

  <h2>Acceptance by feedback channel</h2>
  <table>
    <thead>${tableRow(['Channel', 'Total', 'Accepted', 'Rejected', 'Acceptance rate'], true)}</thead>
    <tbody>${feedbackRows.length > 0 ? feedbackRows.join('') : tableRow(['No AI feedback recorded yet.', '', '', '', ''])}</tbody>
  </table>

  <h2>Users &amp; roles</h2>
  <table>
    <thead>${tableRow(['Name', 'Email', 'Role', 'Status', 'Documents', 'Joined'], true)}</thead>
    <tbody>${userRows.length > 0 ? userRows.join('') : tableRow(['No user accounts found.', '', '', '', '', ''])}</tbody>
  </table>
</body>
</html>`
}

/**
 * Print the report as PDF. The page is loaded into a hidden iframe on this page
 * (a new window would be blocked as a pop-up), printed, then removed.
 */
export function exportAdminReportPdf(
  report: SystemReport,
  users: AdminUserRecord[],
  specs: ChartSpec[],
  chartSvgs: Record<string, string>,
): void {
  const html = buildAdminReportHtml(report, users, specs, chartSvgs)
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    throw new Error('The browser could not prepare the print layout')
  }
  doc.open()
  doc.write(html)
  doc.close()

  const cleanup = (): void => { frame.remove() }
  win.addEventListener('afterprint', cleanup)
  // Printing is blocking in most browsers; the timer covers those that never fire afterprint.
  window.setTimeout(cleanup, 120_000)
  win.focus()
  win.print()
}
