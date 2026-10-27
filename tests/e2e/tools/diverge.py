"""First-divergence report: Word's layout (truth) vs the IntelliDocs editor, paragraph by paragraph.

usage: ml/venv/Scripts/python tests/e2e/tools/diverge.py <docx path> <word.json> [--web http://localhost:5173]
"""
import argparse, json, re, sys, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "tests" / "e2e"))
import fidelity_run as fr  # noqa: E402  (reuses convert / to_payload / wait_for_layout)
from playwright.sync_api import sync_playwright  # noqa: E402

JS_BLOCKS = """(pitch) => {
  const pm = document.querySelector('.ProseMirror');
  const top0 = pm.getBoundingClientRect().top;
  const out = [];
  pm.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach(el => {
    if (el.closest('.rm-page-header, .rm-page-footer, .rm-page-break')) return;
    const text = (el.textContent || '').trim();
    if (!text) return;
    // Measure where the first line of text is drawn: the paginator draws its page
    // boundary inside the next block's box, so the element's own top is misleading.
    const range = document.createRange(); range.selectNodeContents(el);
    const first = range.getClientRects()[0];
    if (!first) return;
    const rect = el.getBoundingClientRect();
    const rel = first.top - top0;
    const page = Math.floor((rel + 1) / pitch);
    out.push({ text: text.slice(0, 80), page: page + 1, y: (rel - page * pitch) * 0.75, lines: Math.round(rect.height) });
  });
  return out;
}"""


def key(text: str) -> str:
    """Comparable form of a paragraph's opening text."""
    text = re.sub(r"[\x00-\x1f\x7f\u200b\ufeff]", " ", text)
    return re.sub(r"[^a-z0-9]+", "", text.lower())[:22]


def align(word_paras: list[dict], editor: list[dict]) -> list[tuple[dict, dict]]:
    """Pair Word paragraphs with editor blocks in document order, resyncing across gaps."""
    pairs, ptr = [], 0
    for wp in word_paras:
        k = key(wp["text"])
        if len(k) < 4:
            continue
        for j in range(ptr, min(len(editor), ptr + 40)):
            if key(editor[j]["text"]) == k:
                pairs.append((wp, editor[j]))
                ptr = j + 1
                break
    return pairs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("docx")
    ap.add_argument("word_json")
    ap.add_argument("--web", default="http://localhost:5173")
    ap.add_argument("--show", type=int, default=6, help="how many divergences to print")
    ap.add_argument("--dump", help="print every matched paragraph in this Word paragraph range, e.g. 285-299")
    a = ap.parse_args()

    word = json.loads(Path(a.word_json).read_text(encoding="utf-8-sig"))
    paras = [p for p in word["paragraphs"] if len(key(p["text"])) >= 4]

    result = fr.convert(Path(a.docx))
    payload = fr.to_payload(result)
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
        layout = fr.wait_for_layout(page)
        pitch = layout["pageH"] + 40
        blocks = page.evaluate(JS_BLOCKS, pitch)
        browser.close()

    pairs = align(paras, blocks)
    name = word["name"]
    print(f"{name}: Word {word['pages']} pages, editor {layout['pages']} pages; "
          f"matched {len(pairs)}/{len(paras)} Word paragraphs ({len(blocks)} editor blocks)")

    # Page delta at the first matched paragraph of every Word page.
    first_on_page: dict[int, int] = {}
    for wp, ep in pairs:
        first_on_page.setdefault(wp["page"], ep["page"] - wp["page"])
    print("page delta per Word page (editor - Word):",
          " ".join(f"{p}:{d:+d}" for p, d in sorted(first_on_page.items())))

    if a.dump:
        low, high = (int(x) for x in a.dump.split("-"))
        print(f"\n{'para':>5} {'Word p/y':>14} {'editor p/y':>14} {'dy':>6}  text")
        for wp, ep in pairs:
            if low <= wp["i"] <= high:
                print(f"{wp['i']:>5} {'p%d %.1f' % (wp['page'], wp['y']):>14} {'p%d %.0f' % (ep['page'], ep['y']):>14} "
                      f"{ep['y'] - wp['y']:>+6.0f}  {wp['text'][:52]!r}")

    shown = 0
    prev_dy, prev_delta = 0.0, 0
    for idx, (wp, ep) in enumerate(pairs):
        dy = ep["y"] - wp["y"]
        delta = ep["page"] - wp["page"]
        # a NEW divergence = the page offset changed, or the vertical drift jumped by more than a line
        changed = delta != prev_delta or (delta == prev_delta and abs(dy - prev_dy) > 14)
        if changed:
            context = pairs[max(0, idx - 2):idx]
            print(f"\n--- change #{shown + 1} at Word para {wp['i']}: Word p{wp['page']} y={wp['y']}pt | "
                  f"editor p{ep['page']} y={ep['y']:.0f}pt (page delta {prev_delta:+d}->{delta:+d}, dy {prev_dy:+.0f}->{dy:+.0f}pt)")
            print(f"    text: {wp['text'][:70]!r}")
            for cw, ce in context:
                print(f"    before: Word p{cw['page']} y={cw['y']:<6} editor p{ce['page']} y={ce['y']:<6.0f} "
                      f"dy={ce['y'] - cw['y']:+.0f}pt  {cw['text'][:38]!r}")
            shown += 1
            if shown >= a.show:
                break
        prev_dy, prev_delta = dy, delta
    if shown == 0:
        print("no change in drift across the document")


if __name__ == "__main__":
    main()
