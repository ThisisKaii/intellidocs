"""The converter's JSON writer against the real editor, on constructed Word documents.

The fixtures (editor_json_reference.py check --json) hold the writer to how real documents import, but
they do not hold every shape: no fixture breaks a page inside a line of text, for one. Each case here
is a small DOCX built with python-docx; its converted HTML is loaded in the dev editor harness (Chrome,
the import path) and the editor's JSON must equal the nodes the converter's JSON writer produced.

usage (repo root, frontend dev server on 5173):
    ml/venv/Scripts/python tests/e2e/tools/editor_json_cases.py
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path
from typing import Callable

import docx
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[2] / "ml" / "src"))
import converter  # noqa: E402
from editor_json_reference import first_difference  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


def _break(run, kind: str | None = "page") -> None:
    br = OxmlElement("w:br")
    if kind:
        br.set(qn("w:type"), kind)
    run._r.append(br)


def _math(paragraph, text: str) -> None:
    """A display equation (m:oMathPara) inside the paragraph, after what is already there."""
    para = OxmlElement("m:oMathPara")
    omath = OxmlElement("m:oMath")
    run = OxmlElement("m:r")
    t = OxmlElement("m:t")
    t.text = text
    run.append(t)
    omath.append(run)
    para.append(omath)
    paragraph._p.append(para)


def case_text_break_text(d):
    p = d.add_paragraph()
    p.alignment = 1
    p.add_run("Before the break")
    run = p.add_run()
    _break(run)
    p.add_run("after the break")


def case_break_first(d):
    p = d.add_paragraph()
    run = p.add_run()
    _break(run)
    p.add_run("Text that starts the new page").bold = True
    p.add_run(" and continues")


def case_break_last(d):
    p = d.add_paragraph("Last line of the page")
    _break(p.add_run())
    d.add_paragraph("Next page")


def case_two_breaks(d):
    p = d.add_paragraph("one")
    _break(p.add_run())
    p.add_run("two")
    _break(p.add_run())
    p.add_run("three")


def case_heading_break(d):
    h = d.add_heading("Heading before", level=2)
    _break(h.add_run())
    h.add_run("heading after")


def case_display_math_mid_paragraph(d):
    p = d.add_paragraph("Energy is ")
    _math(p, "E=mc2")
    p.add_run(" as shown")


def case_break_then_one_space(d):
    p = d.add_paragraph("A")
    _break(p.add_run())
    p.add_run(" ")


def case_break_then_two_spaces(d):
    p = d.add_paragraph("A")
    _break(p.add_run())
    p.add_run("  ")


def case_column_break(d):
    p = d.add_paragraph("left column")
    _break(p.add_run(), "column")
    p.add_run("right column")


def case_line_break_and_spaces(d):
    p = d.add_paragraph("a ")
    _break(p.add_run(), None)
    p.add_run(" b  c ")


CASES: dict[str, Callable] = {name[5:]: fn for name, fn in globals().items() if name.startswith("case_")}


def build(fn: Callable) -> bytes:
    document = docx.Document()
    fn(document)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def main() -> int:
    failed = 0
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome")
        try:
            for name, fn in CASES.items():
                converter._JSON_SINK, converter._JSON_SINK_HTML = [], []
                try:
                    result = converter.convert_docx_bytes_to_html(build(fn))
                    sink = list(converter._JSON_SINK)
                finally:
                    converter._JSON_SINK = converter._JSON_SINK_HTML = None
                if any(nodes is None for _, nodes in sink):
                    print(f"NOT WRITTEN  {name}")
                    failed += 1
                    continue
                ours = [node for _, nodes in sink for node in nodes]
                html = __import__("re").sub(r' data-sink="\d+"', "", result["html"])
                page = browser.new_page()
                page.add_init_script("window.__FIDELITY__ = " + json.dumps({
                    "html": html, "pageSize": "letter", "margins": {"top": 1, "bottom": 1, "left": 1, "right": 1},
                    "orientation": "portrait", "header": "", "footer": "", "headerNumberFormat": "none",
                    "footerNumberFormat": "none", "pageLayout": None,
                }))
                page.goto("http://localhost:5173/dev/editor-harness")
                page.wait_for_function("() => window.__editor && window.__editor.state.doc.content.size > 2", timeout=60000)
                editor = page.evaluate("window.__editor.getJSON().content")
                page.close()
                found = first_difference(editor, ours)
                shape = " ".join(node["type"] for node in ours)
                print(("same         " if not found else "DIFFERENT    ") + f"{name:34} {shape}" + (f"\n    {found}" if found else ""))
                failed += bool(found)
        finally:
            browser.close()
    print(f"\n{len(CASES) - failed}/{len(CASES)} cases match the editor")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
