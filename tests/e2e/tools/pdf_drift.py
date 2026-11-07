"""Where does an imported PDF grow? Per source page, how much taller its content is in the editor, and why.

Usage: python tests/e2e/tools/pdf_drift.py "V2 INTELLIDOCS sabotage.pdf" [--web http://localhost:5173]

Each source PDF page is anchored in the editor by its first words. Between two anchors, the editor's
flow height (block heights and margins, page-break spacers left out) is compared with the PDF's
text height for that page, and the difference is split into causes:

  rewrap    more lines than the PDF (wider text, different line breaks)
  pitch     the same lines, taller (line height above the PDF's line pitch)
  blank     empty paragraphs
  spacing   space before/after paragraphs
  objects   tables and pictures

Every PDF page ends in a page break, so a page adds editor pages only when its content is taller than
the page's text area: `overflow` is that count (the PDF's extra pages come from these pages).

Needs the frontend dev server (it uses /dev/editor-harness like fidelity_run.py).
"""
import argparse
import json
import statistics
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "tests" / "e2e"), str(ROOT / "ml" / "src")]
import fidelity_lib as fl  # noqa: E402
import fidelity_run as fr  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

PX_PER_PT = 96 / 72
ANCHOR_WORDS = 6

# Every top-level block of the editor, in order, with what the attribution needs.
JS_BLOCKS = """() => {
  const pm = document.querySelector('.ProseMirror');
  const out = [];
  for (const el of pm.children) {
    // Page-break spacers pad a page out to its end: layout, not content.
    if (el.classList.contains('intellidocs-page-break') || el.classList.contains('rm-page-break') || el.matches('[data-rm-pagination], .rm-pagination-gap, .rm-pages-wrapper, .rm-page-header')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.height === 0 && !el.textContent.trim()) { out.push({kind: 'blank', h: 0, mt: parseFloat(cs.marginTop) || 0, mb: parseFloat(cs.marginBottom) || 0, words: []}); continue; }
    const tag = el.tagName.toLowerCase();
    const text = el.innerText || '';
    const kind = tag === 'table' || el.querySelector('table') ? 'table'
      : (el.querySelector('img') && !text.trim()) ? 'picture'
      : !text.trim() ? 'blank' : 'text';
    let lh = parseFloat(cs.lineHeight);
    if (!lh) lh = parseFloat(cs.fontSize) * 1.2;
    out.push({kind, h: r.height, mt: parseFloat(cs.marginTop) || 0, mb: parseFloat(cs.marginBottom) || 0, lh,
              lines: kind === 'text' ? Math.max(1, Math.round(r.height / lh)) : 0,
              words: text.toLowerCase().match(/[a-z0-9]+/g) || []});
  }
  return out;
}"""


def pdf_pages(pdf_path: Path) -> list[dict]:
    """Per source page: its words (furniture removed), text height, line count and line pitch (px)."""
    with fitz.open(str(pdf_path)) as pdf:
        blocks_per_page = [fl.page_blocks(page) for page in pdf]
        drop = fl.furniture_keys(blocks_per_page)
        pages = []
        for page, blocks in zip(pdf, blocks_per_page):
            words = fl.normalize_words(" ".join(text for key, text in blocks if key not in drop))
            lines = []
            for block in page.get_text("dict")["blocks"]:
                if block.get("type") != 0:
                    continue
                for line in block["lines"]:
                    text = "".join(span["text"] for span in line["spans"]).strip()
                    y0, y1 = line["bbox"][1], line["bbox"][3]
                    if text and fl.FURNITURE_BAND_PT < y1 and y0 < page.rect.height - fl.FURNITURE_BAND_PT:
                        lines.append((round(y0, 1), round(y1, 1)))
            # Lines sharing a baseline (columns, tab stops) are one visual line.
            baselines = sorted({round(y1) for _, y1 in lines})
            pitches = [b - a for a, b in zip(baselines, baselines[1:]) if 6 < b - a < 40]
            height = (max(y1 for _, y1 in lines) - min(y0 for y0, _ in lines)) * PX_PER_PT if lines else 0
            pages.append({"words": words, "height": height, "lines": len(baselines),
                          "pitch": statistics.median(pitches) * PX_PER_PT if pitches else 0})
    return pages


def anchor_index(blocks: list[dict], words: list[str], start: int) -> int | None:
    """The first block at or after `start` that holds the page's opening words."""
    needle = words[:ANCHOR_WORDS]
    if len(needle) < 2:
        return None
    for index in range(start, len(blocks)):
        haystack = blocks[index]["words"]
        for offset in range(0, max(1, len(haystack) - len(needle) + 1)):
            if haystack[offset:offset + len(needle)] == needle:
                return index
    return None


def attribute(blocks: list[dict], pdf_page: dict, body_px: float, covered: int = 1) -> dict:
    """Split the editor height of one source page's blocks (or `covered` pages whose starts were not
    found) into causes, against the PDF."""
    text = [b for b in blocks if b["kind"] == "text"]
    lines = sum(b["lines"] for b in text)
    pitch = (sum(b["h"] for b in text) / lines) if lines else 0
    spacing = sum(b["mt"] + b["mb"] for b in blocks)
    blank = sum(b["h"] for b in blocks if b["kind"] == "blank")
    objects = sum(b["h"] for b in blocks if b["kind"] in ("table", "picture"))
    total = sum(b["h"] + b["mt"] + b["mb"] for b in blocks)
    pdf_pitch = pdf_page["pitch"] or pitch
    return {
        "editor": round(total), "pdf": round(pdf_page["height"]), "extra": round(total - pdf_page["height"]),
        "overflow": max(0, -(-int(total) // int(body_px)) - covered) if body_px > 0 else 0,
        "lines": f"{lines}/{pdf_page['lines']}", "pitch": f"{pitch:.1f}/{pdf_pitch:.1f}",
        "rewrap": round((lines - pdf_page["lines"]) * pitch) if lines and pdf_page["lines"] else 0,
        "taller": round(lines * (pitch - pdf_pitch)) if lines else 0,
        "blank": round(blank), "spacing": round(spacing), "objects": round(objects),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("--web", default="http://localhost:5173")
    parser.add_argument("--json", type=Path, help="also write the per-page report here")
    parser.add_argument("--page", type=int, action="append", default=[], help="list the editor blocks of this source page")
    args = parser.parse_args()
    pdf_path = fr.DOCS / args.pdf
    pages = pdf_pages(pdf_path)
    payload = fr.to_payload(fr.convert(pdf_path))

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_context(viewport={"width": 1300, "height": 1250}).new_page()
        page.route("**fonts.g*.com**", lambda r: r.abort())
        page.add_init_script("window.__FIDELITY__ = " + json.dumps(payload))
        page.goto(f"{args.web}/dev/editor-harness", wait_until="domcontentloaded")
        page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=90000)
        layout = fr.wait_for_layout(page)
        page.evaluate("document.fonts.ready.then(() => true)")
        layout = fr.wait_for_layout(page)
        blocks = page.evaluate(JS_BLOCKS)
        browser.close()

    anchors: list[int | None] = []
    cursor = 0
    for pdf_page in pages:
        found = anchor_index(blocks, pdf_page["words"], cursor)
        anchors.append(found)
        if found is not None:
            cursor = found
    margins = payload.get("margins") or {}
    body_px = layout["pageH"] - (float(margins.get("top", 1)) + float(margins.get("bottom", 1))) * 96
    report = []
    totals = {"extra": 0, "overflow": 0, "rewrap": 0, "taller": 0, "blank": 0, "spacing": 0, "objects": 0}
    print(f"{args.pdf}: {len(pages)} PDF pages -> {layout['pages']} editor pages, {len(blocks)} blocks")
    print(f"text area per page: {body_px:.0f}px")
    print(f"{'pg':>3} {'over':>4} {'editor':>7} {'pdf':>6} {'extra':>6} {'lines ed/pdf':>12} {'pitch ed/pdf':>13} {'rewrap':>7} {'taller':>7} {'blank':>6} {'spacing':>8} {'objects':>8}")
    for index, (start, pdf_page) in enumerate(zip(anchors, pages)):
        later = [(k, a) for k, a in enumerate(anchors[index + 1:], index + 1) if a is not None]
        end = later[0][1] if later else len(blocks)
        if start is None:
            print(f"{index + 1:>3}  (page start not found in the editor; counted with the page before)")
            continue
        # Pages whose starts were not found are measured together with this one.
        covered = (later[0][0] if later else len(pages)) - index
        merged = dict(pdf_page)
        merged["height"] = sum(p["height"] for p in pages[index:index + covered])
        merged["lines"] = sum(p["lines"] for p in pages[index:index + covered])
        row = attribute(blocks[start:end], merged, body_px, covered)
        if index + 1 in args.page:
            for block in blocks[start:end]:
                print(f"      {block['kind']:7} h={block['h']:6.1f} mt={block['mt']:4.1f} mb={block['mb']:4.1f} lh={block.get('lh', 0):4.1f} lines={block.get('lines', 0):2} {' '.join(block['words'][:8])}")
        report.append({"page": index + 1, **row})
        for key in totals:
            totals[key] += row[key]
        print(f"{index + 1:>3} {row['overflow']:>4} {row['editor']:>7} {row['pdf']:>6} {row['extra']:>6} {row['lines']:>12} {row['pitch']:>13} {row['rewrap']:>7} {row['taller']:>7} {row['blank']:>6} {row['spacing']:>8} {row['objects']:>8}")
    print("extra editor pages:", totals["overflow"], "| total extra px:", totals["extra"], "| rewrap", totals["rewrap"], "| taller lines", totals["taller"],
          "| blank lines", totals["blank"], "| spacing", totals["spacing"], "| objects", totals["objects"])
    if args.json:
        args.json.write_text(json.dumps({"pages": report, "totals": totals, "editorPages": layout["pages"]}, indent=1))


if __name__ == "__main__":
    main()
