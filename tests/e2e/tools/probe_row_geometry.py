"""Load a DOCX in the editor harness and print the live geometry of the table row holding some text.

usage: ml/venv/Scripts/python tests/e2e/tools/probe_row_geometry.py <docx> <text> [--web http://localhost:5173]
Needs the frontend dev server. Prints the row/cell heights, their inline style and each
paragraph's height, so the editor's row can be compared with Word's (word_truth.ps1 / table_rows.py).
"""
import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "tests" / "e2e"))
import fidelity_run as fr  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("docx")
ap.add_argument("text")
ap.add_argument("--web", default="http://localhost:5173")
a = ap.parse_args()
payload = fr.to_payload(fr.convert(Path(a.docx)))

JS = """(needle) => {
  const pm = document.querySelector('.ProseMirror');
  const cells = Array.from(pm.querySelectorAll('td, th')).filter(c => c.textContent.includes(needle));
  if (!cells.length) return {error: 'text not found'};
  // innermost cell holding the text
  const cell = cells.reduce((best, c) => (c.querySelectorAll('td, th').length < best.querySelectorAll('td, th').length ? c : best));
  const row = cell.closest('tr');
  const h = (el) => Math.round(el.getBoundingClientRect().height * 10) / 10;
  const table = row.closest('table');
  return {
    tableStyle: (table.getAttribute('style') || '').slice(0, 300),
    tableData: Object.assign({}, table.dataset),
    tableGridColumns: getComputedStyle(table).gridTemplateColumns,
    tableDisplay: getComputedStyle(table).display,
    rowDisplay: getComputedStyle(row).display,
    rowGridColumns: getComputedStyle(row).gridTemplateColumns,
    rowHeightPx: h(row),
    cells: Array.from(row.children).map(c => ({
      heightPx: h(c),
      style: (c.getAttribute('style') || '').slice(0, 220),
      paragraphs: Array.from(c.querySelectorAll(':scope > p, :scope > div > p')).map(p => ({
        heightPx: h(p), text: p.textContent.trim().slice(0, 30),
        marginTop: getComputedStyle(p).marginTop, lineHeight: getComputedStyle(p).lineHeight,
      })),
      nestedTables: c.querySelectorAll('table').length,
    })),
  };
}"""

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel="chrome", args=["--font-render-hinting=none"])
    page = browser.new_context(viewport={"width": 1300, "height": 1250}).new_page()
    page.route("**fonts.googleapis.com**", lambda r: r.abort())
    page.route("**fonts.gstatic.com**", lambda r: r.abort())
    page.add_init_script("window.__FIDELITY__ = " + json.dumps(payload))
    page.goto(f"{a.web}/dev/editor-harness", wait_until="domcontentloaded")
    page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=90000)
    fr.wait_for_layout(page)
    page.evaluate("document.fonts.ready.then(() => true)")
    fr.wait_for_layout(page)
    print(json.dumps(page.evaluate(JS, a.text), indent=1))
    browser.close()
