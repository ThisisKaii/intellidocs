"""Load a fixture in the editor harness and report the geometry around one heading and its page break."""
import json, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "tests" / "e2e"))
import fidelity_run as fr  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

docx, needle = sys.argv[1], sys.argv[2]
payload = fr.to_payload(fr.convert(Path(docx)))

JS = """(needle) => {
  const pm = document.querySelector('.ProseMirror');
  const top0 = pm.getBoundingClientRect().top;
  const r = (el) => { const b = el.getBoundingClientRect(); return {top: Math.round(b.top - top0), bottom: Math.round(b.bottom - top0), h: Math.round(b.height)}; };
  const target = Array.from(pm.querySelectorAll('p,h1,h2,h3')).find(e => e.textContent.trim() === needle);
  if (!target) return {error: 'heading not found'};
  const out = {heading: r(target), prev: [], breakers: [], pageH: getComputedStyle(document.querySelector('.rm-pages-wrapper')).getPropertyValue('--rm-page-height')};
  let el = target.previousElementSibling;
  for (let i = 0; i < 4 && el; i++, el = el.previousElementSibling) {
    out.prev.push({tag: el.tagName, cls: el.className, style: el.getAttribute('style'), ...r(el), text: (el.textContent || '').slice(0, 25)});
  }
  const t = r(target).top;
  document.querySelectorAll('.breaker').forEach(b => { const x = r(b); if (Math.abs(x.top - t) < 600) out.breakers.push({cls: b.className, ...x}); });
  const spacers = Array.from(pm.querySelectorAll('.intellidocs-page-break')).map(s => ({...r(s), styleH: s.style.height}));
  out.spacerNear = spacers.filter(s => Math.abs(s.top - t) < 1200);
  return out;
}"""

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel="chrome", args=["--font-render-hinting=none"])
    page = browser.new_context(viewport={"width": 1300, "height": 1250}).new_page()
    page.route("**fonts.googleapis.com**", lambda r: r.abort())
    page.route("**fonts.gstatic.com**", lambda r: r.abort())
    page.add_init_script("window.__FIDELITY__ = " + json.dumps(payload))
    page.goto("http://localhost:5173/dev/editor-harness", wait_until="domcontentloaded")
    page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=90000)
    fr.wait_for_layout(page)
    page.evaluate("document.fonts.ready.then(() => true)")
    fr.wait_for_layout(page)
    print(json.dumps(page.evaluate(JS, needle), indent=1))
    browser.close()
