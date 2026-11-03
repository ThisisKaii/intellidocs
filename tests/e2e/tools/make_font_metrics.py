"""Write frontend/src/styles/wordFontAliases.css: each Word font name drawn by a free stand-in, everywhere.

usage (repo root, needs the Word fonts installed, i.e. Windows with Office):
    ml/venv/Scripts/python tests/e2e/tools/make_font_metrics.py           # write the CSS
    ml/venv/Scripts/python tests/e2e/tools/make_font_metrics.py --check   # exit 1 if the CSS is stale

The CSS declares an @font-face per Word font name (for example 'Times New Roman') whose file is the
stand-in (Tinos), so every computer draws the same font whatever is installed, while documents,
exports and the toolbar keep the Word name. Widths match (the stand-ins are metric-compatible; Cambria's
is not, so an installed Cambria is used first);
the line metrics may not (TeX Gyre Bonum is 1.337 em tall, Bookman Old Style 1.174), so each face gets
ascent-override / descent-override / line-gap-override with the Word font's own values.

Those values are measured in Chrome, not read from the font tables: Chrome on Windows picks between
the hhea, typo and win metrics itself, and the layout the Word gate scores was drawn with whatever it
picked. Each stand-in is then measured again with its overrides and must reproduce the Word font.
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[3]
FRONTEND = REPO / "frontend"
OUT = FRONTEND / "src" / "styles" / "wordFontAliases.css"
FONTSOURCE = FRONTEND / "node_modules" / "@fontsource"
PUBLIC_FONTS = FRONTEND / "public" / "fonts"

# (weight, style, file-name key) for the four faces a Word font has.
STYLES = [(400, "normal", 0), (700, "normal", 1), (400, "italic", 2), (700, "italic", 3)]

# Fonts shipped as plain files in public/fonts: one file per face, in STYLES order.
FILE_FACES = {
    "bonum": [f"tex-gyre-bonum/texgyrebonum-{n}.otf" for n in ("regular", "bold", "italic", "bolditalic")],
    "liberation-narrow": [
        f"liberation-sans-narrow/LiberationSansNarrow-{n}.ttf" for n in ("Regular", "Bold", "Italic", "BoldItalic")
    ],
}

# Emoji and symbol fonts per platform. Their glyphs differ, but the line they make never will.
SYMBOL_SOURCES = ["Segoe UI Symbol", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Noto Sans Symbols 2"]


@dataclass(frozen=True)
class Alias:
    name: str  # the family name documents use
    metrics_from: str  # the installed Word font whose line metrics it takes
    stand_in: str  # a @fontsource package, a FILE_FACES key, or "symbols"
    # Use the installed Word font when there is one. Only for a stand-in whose widths differ: Caladea
    # matches the original Cambria, not the Cambria 6.99 that Windows ships (e is 44.1 vs 48.8 em/100),
    # so forcing it would rewrap every Cambria paragraph on Windows. Elsewhere the stand-in draws,
    # with the Word font's line metrics.
    prefer_local: bool = False


ALIASES = [
    Alias("Times New Roman", "Times New Roman", "tinos"),
    Alias("Times", "Times New Roman", "tinos"),
    Alias("Arial", "Arial", "arimo"),
    Alias("Helvetica", "Arial", "arimo"),
    Alias("Calibri", "Calibri", "carlito"),
    Alias("Cambria", "Cambria", "caladea", prefer_local=True),
    Alias("Courier New", "Courier New", "cousine"),
    Alias("Courier", "Courier New", "cousine"),
    Alias("Bookman Old Style", "Bookman Old Style", "bonum"),
    Alias("Bookman", "Bookman Old Style", "bonum"),
    Alias("Arial Narrow", "Arial Narrow", "liberation-narrow"),
    Alias("Segoe UI Symbol", "Segoe UI Symbol", "symbols"),
]

# Full and PostScript name suffixes of each face, in STYLES order, for local() sources.
LOCAL_SUFFIXES = [("", ""), (" Bold", "-Bold"), (" Italic", "-Italic"), (" Bold Italic", "-BoldItalic")]


def local_src(name: str, index: int) -> str:
    full, postscript = LOCAL_SUFFIXES[index]
    names = dict.fromkeys([f"{name}{full}", f"{name.replace(' ', '')}{postscript}"])
    return "".join(f"local('{n}'), " for n in names)


# Measured at a large size so a pixel is a tenth of a percent of the em.
PROBE_PX = 1000
JS_MEASURE = """(family) => {
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;top:0;left:0;white-space:nowrap;line-height:normal;font-size:%dpx;font-family:${family}`;
  box.innerHTML = '<span class="t">Hxgy\\u00c9\\u00e7 the quick brown fox</span><span class="b" style="display:inline-block;width:0;height:0;vertical-align:baseline"></span>';
  document.body.appendChild(box);
  const t = box.querySelector('.t').getBoundingClientRect();
  const baseline = box.querySelector('.b').getBoundingClientRect().bottom;
  const out = { ascent: baseline - t.top, descent: t.bottom - baseline, line: box.getBoundingClientRect().height, width: t.width };
  box.remove();
  return out;
}""" % PROBE_PX


def fontsource_faces(package: str, weight: int, style: str) -> list[tuple[str, str]]:
    """(file name, unicode-range) for every subset of one face of a @fontsource package."""
    css = (FONTSOURCE / package / f"{weight}{'-italic' if style == 'italic' else ''}.css").read_text(encoding="utf-8")
    faces = []
    for block in re.findall(r"@font-face\s*{([^}]*)}", css):
        file = re.search(r"url\(\./files/([^)]+\.woff2)\)", block)
        ranges = re.search(r"unicode-range:\s*([^;]+);", block)
        if file and ranges:
            faces.append((file.group(1), ranges.group(1).strip()))
    if not faces:
        raise SystemExit(f"no faces found in @fontsource/{package} {weight} {style}")
    return faces


def probe_src(alias: Alias, weight: int, style: str, index: int) -> str:
    """A src for measuring the stand-in from disk."""
    if alias.stand_in == "symbols":
        return ", ".join(f"local('{name}')" for name in SYMBOL_SOURCES)
    if alias.stand_in in FILE_FACES:
        return f"url('{(PUBLIC_FONTS / FILE_FACES[alias.stand_in][index]).as_uri()}')"
    latin = f"{alias.stand_in}-latin-{weight}-{style}.woff2"  # basic Latin (latin-ext lacks it)
    return f"url('{(FONTSOURCE / alias.stand_in / 'files' / latin).as_uri()}')"


def overrides(metrics: dict) -> str:
    pct = lambda px: f"{px / PROBE_PX * 100:.2f}%"  # noqa: E731
    return (
        f"ascent-override: {pct(metrics['ascent'])}; descent-override: {pct(metrics['descent'])}; "
        f"line-gap-override: {pct(max(0.0, metrics['line'] - metrics['ascent'] - metrics['descent']))};"
    )


def measure_all() -> dict[tuple[str, int, str], dict]:
    """Line metrics of every Word font face as Chrome draws it here, checked against its stand-in."""
    faces = []
    css = []
    for alias in ALIASES:
        for weight, style, index in STYLES:
            if alias.stand_in == "symbols" and (weight, style) != (400, "normal"):
                continue
            key = f"s{len(faces)}"
            faces.append((alias, weight, style, index, key))
            css.append(f"@font-face {{ font-family: '{key}'; font-weight: {weight}; font-style: {style}; "
                       f"src: {probe_src(alias, weight, style, index)}; }}")
    results: dict[tuple[str, int, str], dict] = {}
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", args=["--allow-file-access-from-files", "--font-render-hinting=none"])
        page = browser.new_page()

        def load(extra_css: str) -> None:
            html = Path(tmp) / "probe.html"
            html.write_text(f"<!doctype html><style>{extra_css}</style><body>", encoding="utf-8")
            page.goto(html.as_uri())
            for alias, weight, style, _, key in faces:
                page.evaluate(f"document.fonts.load(\"{style} {weight} 20px '{key}'\")")
            page.evaluate("document.fonts.ready.then(() => true)")

        def run(family: str, weight: int, style: str) -> dict:
            return page.evaluate(JS_MEASURE.replace("font-family:${family}", f"font-weight:{weight};font-style:{style};font-family:${{family}}"), family)

        load("\n".join(css))
        word = {}
        for alias, weight, style, _, key in faces:
            word[key] = run(f"'{alias.metrics_from}'", weight, style)
            stand_in = run(f"'{key}', monospace", weight, style)
            results[(alias.name, weight, style)] = {**word[key], "stand_in_width": stand_in["width"]}

        # Check: the stand-in with its overrides must reproduce the Word font's line.
        checked = [line[:-2] + f" {overrides(word[f[4]])} }}" for line, f in zip(css, faces)]
        load("\n".join(checked))
        for alias, weight, style, _, key in faces:
            again = run(f"'{key}', monospace", weight, style)
            want = word[key]
            for field in ("ascent", "descent", "line"):
                if abs(again[field] - want[field]) > 1.0:
                    raise SystemExit(f"{alias.name} {weight} {style}: {field} {again[field]:.1f}px with overrides, Word {want[field]:.1f}px")
        browser.close()
    return results


def css_text(results: dict[tuple[str, int, str], dict]) -> str:
    lines = [
        "/* GENERATED by tests/e2e/tools/make_font_metrics.py: do not edit by hand.",
        "   Each Word font name is drawn by a free stand-in on every computer, with the Word font's line",
        "   metrics (measured in Chrome on Windows with the Word fonts installed). Documents, exports and the",
        "   toolbar keep the Word name. Cambria uses an installed Cambria first (Caladea is not width-exact). Licences: each folder in public/fonts, and the @fontsource packages. */",
        "",
    ]
    for alias in ALIASES:
        for weight, style, index in STYLES:
            key = (alias.name, weight, style)
            if key not in results:
                continue
            metric = overrides(results[key])
            head = f"font-family: '{alias.name}'; font-style: {style}; font-weight: {weight}; font-display: swap"
            local = local_src(alias.metrics_from, index) if alias.prefer_local else ""
            if alias.stand_in == "symbols":
                src = ", ".join(f"local('{name}')" for name in SYMBOL_SOURCES)
                lines.append(f"@font-face {{ {head}; src: {src}; {metric} }}")
            elif alias.stand_in in FILE_FACES:
                file = FILE_FACES[alias.stand_in][index]
                fmt = "opentype" if file.endswith(".otf") else "truetype"
                lines.append(f"@font-face {{ {head}; src: {local}url('/fonts/{file}') format('{fmt}'); {metric} }}")
            else:
                for file, ranges in fontsource_faces(alias.stand_in, weight, style):
                    lines.append(
                        f"@font-face {{ {head}; src: {local}url('@fontsource/{alias.stand_in}/files/{file}') format('woff2'); "
                        f"unicode-range: {ranges}; {metric} }}"
                    )
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="exit 1 when the committed CSS differs from a fresh measurement")
    args = parser.parse_args(argv)
    results = measure_all()
    for (name, weight, style), m in results.items():
        width = f"width {m['stand_in_width'] / m['width'] * 100 - 100:+.2f}%" if m["width"] else ""
        print(f"{name:18} {weight} {style:6}  ascent {m['ascent'] / 10:6.2f}%  descent {m['descent'] / 10:6.2f}%  "
              f"line {m['line'] / 10:6.2f}%  stand-in {width}")
    text = css_text(results)
    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.is_file() else ""
        if current != text:
            print(f"\n{OUT.relative_to(REPO)} is stale: run without --check")
            return 1
        print(f"\n{OUT.relative_to(REPO)} is up to date")
        return 0
    OUT.write_text(text, encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
