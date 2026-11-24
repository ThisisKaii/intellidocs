"""Render a Mermaid figure source (.mmd) to SVG and a print-resolution PNG beside it.

usage: ml/venv/Scripts/python docs/manuscript/figures/chapter_3/render_figure.py <figure.mmd> [--scale 4] [--layout elk|dagre]

Draws in black and white with Times New Roman, as the manuscript prints. Mermaid and its ELK layout
are loaded from the jsDelivr CDN at pinned versions, so the run needs internet access.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs"
ELK = "https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0.1.7/dist/mermaid-layout-elk.esm.min.mjs"

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#fff} #out{display:inline-block;padding:24px;background:#fff}</style></head>
<body><div id="out"></div>
<script type="module">
import mermaid from '%(mermaid)s';
import elkLayouts from '%(elk)s';
mermaid.registerLayoutLoaders(elkLayouts);
mermaid.initialize({
  startOnLoad: false,
  layout: %(layout)s,
  theme: 'base',
  themeVariables: {
    fontFamily: '"Times New Roman", Times, serif',
    fontSize: '15px',
    primaryColor: '#ffffff', primaryBorderColor: '#000000', primaryTextColor: '#000000',
    lineColor: '#000000', secondaryColor: '#ffffff', tertiaryColor: '#ffffff',
    attributeBackgroundColorOdd: '#ffffff', attributeBackgroundColorEven: '#f2f2f2',
  },
  er: { useMaxWidth: false, layoutDirection: 'TB', entityPadding: 10, minEntityWidth: 120 },
});
try {
  const { svg } = await mermaid.render('figure', %(source)s);
  document.getElementById('out').innerHTML = svg;
  window.__done = 'ok';
} catch (error) { window.__done = 'error: ' + error; }
</script></body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--scale", type=float, default=4.0, help="device pixels per CSS pixel (4 is about 384 dpi at 96 dpi CSS)")
    parser.add_argument("--layout", default="elk", choices=["elk", "dagre"])
    args = parser.parse_args()

    text = args.source.read_text(encoding="utf-8")
    html = PAGE % {"mermaid": MERMAID, "elk": ELK, "layout": json.dumps(args.layout), "source": json.dumps(text)}
    page_file = args.source.with_suffix(".render.html")
    page_file.write_text(html, encoding="utf-8")
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, channel="chrome")
            page = browser.new_context(viewport={"width": 1600, "height": 1200}, device_scale_factor=args.scale).new_page()
            page.goto(page_file.resolve().as_uri())
            page.wait_for_function("window.__done !== undefined", timeout=120000)
            status = page.evaluate("window.__done")
            if status != "ok":
                raise SystemExit(f"Mermaid could not render {args.source.name}: {status}")
            page.evaluate("document.fonts.ready.then(() => true)")
            svg = page.inner_html("#out")
            args.source.with_suffix(".svg").write_text(svg, encoding="utf-8")
            box = page.locator("#out").bounding_box()
            page.set_viewport_size({"width": int(box["width"]) + 2, "height": int(box["height"]) + 2})
            page.locator("#out").screenshot(path=str(args.source.with_suffix(".png")))
            print(f"{args.source.stem}: {int(box['width'])}x{int(box['height'])} CSS px, PNG at {args.scale:g}x")
            browser.close()
    finally:
        page_file.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
