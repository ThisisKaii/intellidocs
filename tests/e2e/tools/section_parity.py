"""Section margins drawn by the editor (SectionLayout decorations) must place every block exactly where
the converter's baked shifts (_shift_sections) did.

usage (repo root, frontend dev server on 5173):
    ml/venv/Scripts/python tests/e2e/tools/section_parity.py [--only NAME]

Each Word fixture is converted twice (converter._SECTION_LAYOUT_IN_EDITOR False, then True) and laid out
in the dev editor harness. For every paragraph, heading, list item and table, in document order, the
first text line's left and top, the block's right edge and a list item's marker x are compared.
Exit 0 when every difference is under 0.5px, 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[2] / "ml" / "src"))
import converter  # noqa: E402
import fidelity_run as fr  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

FIXTURES = HERE.parents[1] / "fixtures" / "import_baselines" / "documents"
TOLERANCE_PX = 0.5

JS_BOXES = """() => {
  const pm = document.querySelector('.ProseMirror');
  const origin = pm.getBoundingClientRect();
  const out = [];
  pm.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, table').forEach(el => {
    if (el.closest('.rm-page-header, .rm-page-footer')) return;
    const box = el.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(el);
    const first = el.tagName === 'TABLE' ? null : range.getClientRects()[0];
    const mx = el.tagName === 'LI' ? parseFloat(getComputedStyle(el).getPropertyValue('--mx')) : NaN;
    out.push({
      tag: el.tagName, text: (el.textContent || '').trim().slice(0, 40),
      left: first ? first.left - origin.left : box.left - origin.left,
      top: first ? first.top - origin.top : box.top - origin.top,
      right: box.right - origin.left,
      mx: Number.isFinite(mx) ? mx : null,
    });
  });
  return out;
}"""


def boxes(browser, web: str, fixture: Path, in_editor: bool) -> tuple[list[dict], int]:
    converter._SECTION_LAYOUT_IN_EDITOR = in_editor
    payload = fr.to_payload(fr.convert(fixture))
    context = browser.new_context(viewport={"width": 1300, "height": 1250})
    page = context.new_page()
    page.route("**fonts.googleapis.com**", lambda r: r.abort())
    page.route("**fonts.gstatic.com**", lambda r: r.abort())
    page.add_init_script("window.__FIDELITY__ = " + json.dumps(payload))
    try:
        page.goto(f"{web}/dev/editor-harness", wait_until="domcontentloaded")
        page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=90000)
        fr.wait_for_layout(page)
        page.evaluate("document.fonts.ready.then(() => true)")
        layout = fr.wait_for_layout(page)
        return page.evaluate(JS_BOXES), int(layout["pages"])
    finally:
        context.close()


def compare(baked: list[dict], drawn: list[dict]) -> list[str]:
    if len(baked) != len(drawn):
        return [f"block count differs: baked {len(baked)}, editor {len(drawn)}"]
    problems = []
    for index, (a, b) in enumerate(zip(baked, drawn)):
        if a["tag"] != b["tag"] or a["text"] != b["text"]:
            return problems + [f"#{index} is a different block: {a['tag']} {a['text']!r} vs {b['tag']} {b['text']!r}"]
        for field in ("left", "top", "right", "mx"):
            # A paragraph without text has no line to see; the editor moves it with its section anyway,
            # so the caret sits where text typed into it will go.
            if field in ("left", "right") and a["tag"] == "P" and not a["text"]:
                continue
            if a[field] is None and b[field] is None:
                continue
            if a[field] is None or b[field] is None or abs(a[field] - b[field]) >= TOLERANCE_PX:
                problems.append(f"#{index} {a['tag']} {a['text']!r}: {field} baked {a[field]} vs editor {b[field]}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--web", default="http://localhost:5173")
    parser.add_argument("--only")
    args = parser.parse_args(argv)
    failed = False
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome", args=["--font-render-hinting=none"])
        try:
            for fixture in sorted(FIXTURES.glob("*.docx")):
                if args.only and args.only not in fixture.stem:
                    continue
                baked, baked_pages = boxes(browser, args.web, fixture, in_editor=False)
                drawn, drawn_pages = boxes(browser, args.web, fixture, in_editor=True)
                problems = compare(baked, drawn)
                if baked_pages != drawn_pages:
                    problems.insert(0, f"pages: baked {baked_pages}, editor {drawn_pages}")
                status = "same" if not problems else f"{len(problems)} differences"
                print(f"{fixture.stem[:44]:44} {len(baked):5} blocks  pages {baked_pages}/{drawn_pages}  {status}")
                for problem in problems[:8]:
                    print("   ", problem)
                failed = failed or bool(problems)
        finally:
            browser.close()
            converter._SECTION_LAYOUT_IN_EDITOR = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
