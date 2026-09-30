/**
 * Admin report export engine.
 *
 * Renders the aggregated system analytics plus the user directory (names and
 * roles) into a dedicated print layout opened in the browser's Save-as-PDF
 * dialog — the same mechanism used by the thesis "Export as PDF" flow.
 */

import { AdminUserRecord, RoleName, SystemReport } from '../types/admin'

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

/** Compose the full printable HTML page for the admin system report. */
export function buildAdminReportHtml(report: SystemReport, users: AdminUserRecord[]): string {
  const generated = new Date(report.generatedAt).toLocaleString()
  const dateStamp = new Date(report.generatedAt).toISOString().slice(0, 10)

  const summaryRows: Array<[string, string]> = [
    ['Total users', String(report.totalUsers)],
    ['Students', String(report.byRole.student)],
    ['Professors', String(report.byRole.professor)],
    ['Administrators', String(report.byRole.admin)],
    ['Pending verifications', String(report.pendingApplicants)],
    ['Total documents', String(report.totalDocuments)],
    ['Active documents', String(report.activeDocuments)],
    ['Soft-deleted documents', String(report.softDeletedDocuments)],
    ['Formatting action events', String(report.totalFormattingActions)],
    ['AI suggestion feedback', `${report.feedback.accepted} accepted / ${report.feedback.total} total (${report.feedback.acceptanceRate})`],
  ]

  const feedbackRows = Object.entries(report.feedback.byType).map(([type, stats]) =>
    tableRow([esc(type), String(stats.total), String(stats.accepted), String(stats.rejected), esc(stats.acceptanceRate)])
  )

  const userRows = users.map((user) =>
    tableRow([
      esc(user.display_name || '—'),
      esc(user.email || '—'),
      user.role_name ? esc(roleLabels[user.role_name]) : '—',
      esc(user.verification_status),
      String(user.document_count),
      new Date(user.created_at).toLocaleDateString(),
    ])
  )

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset='utf-8'>
<title>IntelliDocs System Report ${dateStamp}</title>
<style>
  @page { size: letter; margin: 0.75in; }
  html, body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }
  body { margin: 0; padding: 0; font-size: 11pt; }
  h1 { font-size: 18pt; margin: 0 0 0.25rem; }
  h2 { font-size: 13pt; margin: 1.25rem 0 0.5rem; }
  .meta { color: #555; font-size: 9.5pt; margin: 0 0 1rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #bbb; padding: 4pt 6pt; text-align: left; vertical-align: top; font-size: 10pt; }
  th { background: #f2f2f2; font-weight: 600; }
</style>
</head>
<body>
  <h1>IntelliDocs &mdash; System Analytics Report</h1>
  <p class="meta">Generated ${esc(generated)} &bull; ${users.length} user account${users.length === 1 ? '' : 's'} listed</p>

  <h2>Platform Summary</h2>
  <table>
    <tbody>
      ${summaryRows.map(([label, value]) => tableRow([esc(label), esc(value)])).join('\n      ')}
    </tbody>
  </table>

  <h2>Acceptance by Feedback Channel</h2>
  <table>
    <thead>
      ${tableRow(['Channel', 'Total', 'Accepted', 'Rejected', 'Acceptance Rate'], true)}
    </thead>
    <tbody>
      ${feedbackRows.length > 0 ? feedbackRows.join('\n      ') : tableRow(['No AI feedback recorded yet.', '', '', '', ''])}
    </tbody>
  </table>

  <h2>Users &amp; Roles</h2>
  <table>
    <thead>
      ${tableRow(['Name', 'Email', 'Role', 'Status', 'Documents', 'Joined'], true)}
    </thead>
    <tbody>
      ${userRows.length > 0 ? userRows.join('\n      ') : tableRow(['No user accounts found.', '', '', '', '', ''])}
    </tbody>
  </table>
</body>
</html>`
}

/** One-click PDF export: opens the browser print dialog preconfigured for PDF. */
export function exportAdminReportPdf(report: SystemReport, users: AdminUserRecord[]): void {
  const html = buildAdminReportHtml(report, users)
  const win = window.open('', '_blank', 'noopener')
  if (!win) {
    // Pop-up blocked: fall back to a temporary iframe over the current page.
    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'
    frame.style.right = '0'
    frame.style.bottom = '0'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    }
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
}
