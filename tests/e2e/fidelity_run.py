"""Import fidelity run: every sample document, page by page, against its reference.

For each source file (DOCX and PDF) this
  1. converts it with the real converter (ml/src/converter.py),
  2. loads the result into the real paged editor (the dev editor harness, so no
     login, database or Express server is involved),
  3. captures each editor page as an image plus the words that sit on it,
  4. compares them with the reference page images and the original PDF's words
     (see fidelity_lib.py for what counts as a match),
  5. writes side-by-side composites and a summary to tests/e2e/artifacts/fidelity.

Run from the repo root, with the frontend dev server up on --web:
    ml/venv/Scripts/python tests/e2e/fidelity_run.py --web http://localhost:5183
    ml/venv/Scripts/python tests/e2e/fidelity_run.py --only "DM_0440" --max-pages 3
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np
import cv2
from playwright.sync_api import Page, sync_playwright

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "ml" / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import fidelity_lib as fl  # noqa: E402
from converter import convert_docx_bytes_to_html, convert_pdf_bytes_to_html  # noqa: E402

DOCS = REPO / "tests" / "fixtures" / "import_baselines" / "documents"
REFS = REPO / "tests" / "fixtures" / "import_baselines" / "reference_screenshots"
DEFAULT_OUT = Path(__file__).resolve().parent / "artifacts" / "fidelity"

# Each source file and the PDF that shows what it should look like.
SOURCES: list[tuple[str, str]] = [
    ("DM_0440_s_26_SGOD_Conduct-of-World-Teachers-Day.docx", "DM_0440_s_26_SGOD_Conduct-of-World-Teachers-Day.pdf"),
    ("DM_0440_s_26_SGOD_Conduct-of-World-Teachers-Day.pdf", "DM_0440_s_26_SGOD_Conduct-of-World-Teachers-Day.pdf"),
    ("DM-OUHRODI-2026-3750-1.docx", "DM-OUHRODI-2026-3750-1.pdf"),
    ("DM-OUHRODI-2026-3750-1.pdf", "DM-OUHRODI-2026-3750-1.pdf"),
    ("V2 INTELLIDOCS (2).docx", "V2 INTELLIDOCS (2) (1).pdf"),
    ("V2 INTELLIDOCS (2) (1).pdf", "V2 INTELLIDOCS (2) (1).pdf"),
    ("V2 INTELLIDOCS sabotage.docx", "V2 INTELLIDOCS sabotage.pdf"),
    ("V2 INTELLIDOCS sabotage.pdf", "V2 INTELLIDOCS sabotage.pdf"),
    ("0200725_[research]_9569504b.docx", "0200725_[research]_9569504b.pdf"),
    ("0200725_[research]_9569504b.pdf", "0200725_[research]_9569504b.pdf"),
]

# The editor's page grid: a page is this tall and the next one starts this far below (page + gap).
PAGE_PITCH_PX = 1096


def folder_name(pdf_name: str) -> str:
    """The reference folder for a PDF (same rule as scripts/generate_reference_screenshots.py)."""
    return re.sub(r"[^\w\-.]", "_", Path(pdf_name).stem).strip("_")


def reference_words(pdf_path: Path) -> list[list[str]]:
    """The normalised words of each page of the original PDF, in reading order."""
    pages: list[list[str]] = []
    with fitz.open(str(pdf_path)) as pdf:
        for page in pdf:
            words = page.get_text("words", sort=True)
            pages.append(fl.normalize_words(" ".join(w[4] for w in words)))
    return pages


def convert(path: Path) -> dict:
    """Run the real converter for a DOCX or PDF."""
    data = path.read_bytes()
    return convert_pdf_bytes_to_html(data) if path.suffix.lower() == ".pdf" else convert_docx_bytes_to_html(data)


def _page_layout(result: dict) -> dict | None:
    """The page furniture the server stores as `page_layout`, or None when the file has none."""
    hf, art = result.get("hf") or {}, result.get("page_art") or {}
    if not (hf.get("parts") or art.get("repeat") or art.get("pages")):
        numbered = any(s.get("number_start") is not None or s.get("number_format") != "decimal" or s.get("title_pg") for s in hf.get("sections", []))
        if not numbered:
            return None
    return {
        "sections": hf.get("sections", []),
        "parts": hf.get("parts", {}),
        "repeat_art": art.get("repeat", ""),
        "page_art": art.get("pages", {}),
    }


def to_payload(result: dict) -> dict:
    """The converter result as the harness (and the Document page) lay it out."""
    setup = result.get("page_setup") or {}
    return {
        "html": result["html"],
        "pageSize": setup.get("page_size", "letter"),
        "margins": setup.get("margins", {"top": 1, "bottom": 1, "left": 1, "right": 1}),
        "orientation": setup.get("orientation", "portrait"),
        "header": result.get("header", ""),
        "footer": result.get("footer", ""),
        "headerNumberFormat": result.get("header_number_format", "none"),
        "footerNumberFormat": result.get("footer_number_format", "none"),
        "pageLayout": _page_layout(result),
    }


# Words per page: every text node is assigned to the page its words are drawn on.
JS_PAGE_WORDS = """(pitch) => {
  const pm = document.querySelector('.ProseMirror');
  const top0 = pm.getBoundingClientRect().top;
  const pages = [];
  const add = (page, text) => { (pages[page] = pages[page] || []).push(text); };
  const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
  const word = /\\S+/g;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest('.rm-page-break, .rm-page-header, .rm-page-footer')) continue;
    const text = node.textContent;
    if (!text || !text.trim()) continue;
    const whole = document.createRange(); whole.selectNodeContents(node);
    const rects = whole.getClientRects();
    if (!rects.length) continue;
    const first = Math.floor((rects[0].top - top0 + 1) / pitch);
    const last = Math.floor((rects[rects.length - 1].bottom - top0 - 1) / pitch);
    if (first === last) { add(first, text); continue; }
    let m;
    word.lastIndex = 0;
    while ((m = word.exec(text))) {
      const r = document.createRange(); r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length);
      const box = r.getClientRects()[0];
      if (box) add(Math.floor((box.top - top0 + box.height / 2) / pitch), m[0]);
    }
  }
  return Array.from({length: pages.length}, (_, i) => (pages[i] || []).join(' '));
}"""

JS_LAYOUT = """() => {
  const wrapper = document.querySelector('.rm-pages-wrapper');
  const pm = document.querySelector('.ProseMirror');
  const p = pm.getBoundingClientRect();
  const scroller = (function find(el) { while (el && el !== document.body) { const o = getComputedStyle(el).overflowY; if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) return el; el = el.parentElement; } return document.scrollingElement; })(wrapper);
  const pageW = parseFloat(getComputedStyle(wrapper).getPropertyValue('--rm-page-width'));
  const pageH = parseFloat(getComputedStyle(wrapper).getPropertyValue('--rm-page-height'));
  return {
    breaks: document.querySelectorAll('.rm-page-break').length,
    pageW, pageH,
    // The editor element is the page stack: pages are pageH tall with a 40px gap between them.
    pages: Math.max(1, Math.round((p.height + 40) / (pageH + 40))),
    left: p.left, top: p.top, height: p.height, scrollTop: scroller.scrollTop,
  };
}"""


def wait_for_layout(page: Page, timeout_s: float = 240.0) -> dict:
    """Wait until the paginator stops adding pages, and return the layout."""
    deadline = time.time() + timeout_s
    last, stable = None, 0
    while time.time() < deadline:
        layout = page.evaluate(JS_LAYOUT)
        signature = (layout["breaks"], round(layout["height"]))
        stable = stable + 1 if signature == last else 0
        last = signature
        if stable >= 3:
            return layout
        page.wait_for_timeout(1000)
    return page.evaluate(JS_LAYOUT)


def capture_pages(page: Page, count: int, pitch: float = PAGE_PITCH_PX) -> list[np.ndarray]:
    """Screenshot each editor page by scrolling it into view and clipping its rectangle."""
    images: list[np.ndarray] = []
    for index in range(count):
        page.evaluate(
            """(y) => { const w = document.querySelector('.rm-pages-wrapper');
              let el = w; while (el && el !== document.body) { const o = getComputedStyle(el).overflowY;
                if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) { el.scrollTop = y; return; } el = el.parentElement; } window.scrollTo(0, y); }""",
            index * pitch,
        )
        page.wait_for_timeout(250)
        layout = page.evaluate(JS_LAYOUT)
        clip = {"x": layout["left"], "y": layout["top"] + index * pitch, "width": layout["pageW"], "height": layout["pageH"]}
        png = page.screenshot(clip=clip)
        images.append(cv2.imdecode(np.frombuffer(png, dtype=np.uint8), cv2.IMREAD_COLOR))
    return images


@dataclass
class Args:
    web: str
    out: Path
    only: str | None
    max_pages: int | None
    keep_payload: bool


def run_one(browser, source: str, pdf_name: str, args: Args) -> fl.DocumentResult:
    """Import one file and compare every page."""
    name = source
    ref_dir = REFS / folder_name(pdf_name)
    ref_paths = sorted(ref_dir.glob("page_*.png"))
    ref_images = [fl.read_image(p) for p in ref_paths]
    ref_words = reference_words(DOCS / pdf_name)
    limit = args.max_pages or len(ref_images)
    ref_images, ref_words = ref_images[:limit], ref_words[:limit]

    started = time.time()
    result = convert(DOCS / source)
    payload = to_payload(result)
    print(f"  converted in {time.time() - started:.1f}s: {len(payload['html']) // 1024} KB html, page setup {payload['pageSize']} {payload['margins']}", flush=True)

    out_dir = args.out / re.sub(r"[^\w\-.]", "_", source)
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.keep_payload:
        (out_dir / "payload.json").write_text(json.dumps(payload), encoding="utf-8")

    context = browser.new_context(viewport={"width": 1300, "height": 1250}, device_scale_factor=2)
    page = context.new_page()
    page.route("**fonts.googleapis.com**", lambda r: r.abort())
    page.route("**fonts.gstatic.com**", lambda r: r.abort())
    page.add_init_script("window.__FIDELITY__ = " + json.dumps(payload))
    page.goto(f"{args.web}/dev/editor-harness", wait_until="domcontentloaded")
    page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=90000)
    layout = wait_for_layout(page)
    editor_pages = layout["pages"]
    pitch = layout["pageH"] + 40
    words_by_page = page.evaluate(JS_PAGE_WORDS, pitch)
    to_capture = min(editor_pages, limit)
    images = capture_pages(page, to_capture, pitch)
    context.close()

    actual_words = [fl.normalize_words(text) for text in words_by_page]
    pages = fl.compare_pages(ref_images, ref_words, images, actual_words)

    for result_page in pages:
        i = result_page.index - 1
        actual = images[i] if i < len(images) else np.full((100, 100, 3), 255, dtype=np.uint8)
        label = f"{name} p{result_page.index}  text {result_page.text_ratio:.2f}  layout {result_page.layout:.2f}  edges {'ok' if result_page.edges_match else 'DIFF'}"
        fl.write_image(out_dir / f"page_{result_page.index:03d}.png", fl.side_by_side(ref_images[i], actual, label))

    doc = fl.DocumentResult(name=name, reference_pages=len(ref_paths), imported_pages=editor_pages, pages=pages)
    if args.max_pages:
        doc.reference_pages, doc.imported_pages = min(doc.reference_pages, limit), min(doc.imported_pages, limit)
    return doc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--web", default="http://localhost:5183", help="frontend dev server serving /dev/editor-harness")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--only", help="run only sources whose name contains this text")
    parser.add_argument("--max-pages", type=int, help="compare only the first N pages of each document")
    parser.add_argument("--keep-payload", action="store_true", help="save each converter result as JSON for debugging")
    ns = parser.parse_args()
    args = Args(ns.web, ns.out, ns.only, ns.max_pages, ns.keep_payload)

    chosen = [(s, p) for s, p in SOURCES if not args.only or args.only.lower() in s.lower()]
    results: list[fl.DocumentResult] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome", args=["--font-render-hinting=none"])
        for source, pdf_name in chosen:
            print(f"{source}", flush=True)
            try:
                results.append(run_one(browser, source, pdf_name, args))
            except Exception as error:  # keep going so one bad file never hides the others
                print(f"  FAILED: {type(error).__name__}: {error}", flush=True)
                results.append(fl.DocumentResult(source, reference_pages=0, imported_pages=0, notes=[str(error)]))
        browser.close()

    table = fl.summary_table(results)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "summary.txt").write_text(table + "\n", encoding="utf-8")
    (args.out / "summary.json").write_text(
        json.dumps(
            [
                {
                    "name": r.name, "reference_pages": r.reference_pages, "imported_pages": r.imported_pages, "ok": r.ok,
                    "pages": [{"page": p.index, "text": round(p.text_ratio, 3), "layout": round(p.layout, 3), "edges": p.edges_match} for p in r.pages],
                }
                for r in results
            ],
            indent=1,
        ),
        encoding="utf-8",
    )
    print("\n" + table)
    return 0 if all(r.ok for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
