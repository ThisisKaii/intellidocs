"""Compare where pictures sit in Word's exported PDF with where the editor draws them.

usage: ml/venv/Scripts/python tests/e2e/tools/picture_positions.py <docx> <word.pdf> [--web http://localhost:5173]
<word.pdf> comes from word_truth.ps1. Prints, per picture in document order, the left edge and width
in px (page left = 0) for Word and for the editor, and the difference. Header/footer art is ignored.
Needs the frontend dev server; the converter runs in-process.
"""
import argparse
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF
from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "tests" / "e2e"))
import fidelity_run as fr  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("docx")
ap.add_argument("word_pdf")
ap.add_argument("--web", default="http://localhost:5173")
ap.add_argument("--min-width", type=float, default=60, help="ignore pictures narrower than this many px (logos, bullets)")
args = ap.parse_args()

PX = 96 / 72
word = []
with fitz.open(args.word_pdf) as pdf:
    for number, page in enumerate(pdf, start=1):
        height = page.rect.height
        for info in page.get_image_info():
            x0, y0, x1, y1 = info["bbox"]
            if (x1 - x0) * PX >= args.min_width and y0 > 0.09 * height and y1 < 0.91 * height:  # skip header/footer bands
                word.append({"page": number, "x": round(x0 * PX), "w": round((x1 - x0) * PX), "y": round(y0 * PX)})

payload = fr.to_payload(fr.convert(Path(args.docx)))
JS = """(pitch) => { const pm = document.querySelector('.ProseMirror'); const box = pm.getBoundingClientRect();
  return Array.from(pm.querySelectorAll('img')).filter(i => !i.closest('.rm-page-header, .rm-page-footer')).map(i => { const r = i.getBoundingClientRect();
    return {page: Math.floor((r.top - box.top + 1) / pitch) + 1, x: Math.round(r.left - box.left), w: Math.round(r.width)}; }).filter(i => i.w > 0); }"""
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel="chrome", args=["--font-render-hinting=none"])
    page = browser.new_context(viewport={"width": 1300, "height": 1250}).new_page()
    page.route("**fonts.googleapis.com**", lambda r: r.abort())
    page.route("**fonts.gstatic.com**", lambda r: r.abort())
    page.add_init_script("window.__FIDELITY__ = " + json.dumps(payload))
    page.goto(f"{args.web}/dev/editor-harness", wait_until="domcontentloaded")
    page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=90000)
    fr.wait_for_layout(page)
    page.evaluate("document.fonts.ready.then(() => true)")
    layout = fr.wait_for_layout(page)
    editor = [i for i in page.evaluate(JS, layout["pageH"] + 40) if i["w"] >= args.min_width]
    browser.close()

print(f"Word: {len(word)} pictures   editor: {len(editor)} pictures")
print(f"{'#':>2}  {'Word p/x/w':>16}  {'editor p/x/w':>16}  {'dx':>5}  {'dw':>5}")
for index in range(max(len(word), len(editor))):
    w = word[index] if index < len(word) else None
    e = editor[index] if index < len(editor) else None
    left = f"p{w['page']} {w['x']} {w['w']}" if w else "-"
    right = f"p{e['page']} {e['x']} {e['w']}" if e else "-"
    dx = f"{e['x'] - w['x']:+d}" if w and e else ""
    dw = f"{e['w'] - w['w']:+d}" if w and e else ""
    print(f"{index + 1:>2}  {left:>16}  {right:>16}  {dx:>5}  {dw:>5}")
