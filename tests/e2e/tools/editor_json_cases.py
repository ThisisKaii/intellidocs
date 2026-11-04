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


def case_numbered_list(d):
    d.add_paragraph("Intro")
    for text in ("first", "second", "third"):
        d.add_paragraph(text, style="List Number")
    d.add_paragraph("After the list")


def case_empty_list_item(d):
    d.add_paragraph("one", style="List Number")
    d.add_paragraph("", style="List Number")
    d.add_paragraph("three", style="List Number")


def case_bullets_nested_in_numbers(d):
    d.add_paragraph("parent one", style="List Number")
    d.add_paragraph("child a", style="List Bullet 2")
    d.add_paragraph("child b", style="List Bullet 2")
    d.add_paragraph("parent two", style="List Number")


def case_formatted_list_item(d):
    p = d.add_paragraph(style="List Bullet")
    p.add_run("bold").bold = True
    p.add_run(" and ")
    p.add_run("italic").italic = True


def case_simple_table(d):
    table = d.add_table(rows=2, cols=3)
    table.style = "Table Grid"
    for r, row in enumerate(table.rows):
        for c, cell in enumerate(row.cells):
            cell.text = f"r{r}c{c}"
    d.add_paragraph("After the table")


def case_merged_and_empty_cells(d):
    table = d.add_table(rows=2, cols=3)
    table.style = "Table Grid"
    table.cell(0, 0).merge(table.cell(0, 1)).text = "spans two columns"
    table.cell(0, 2).text = "right"
    table.cell(1, 0).text = "below"
    d.add_paragraph("After")


def case_numbered_paragraphs_in_a_cell(d):
    table = d.add_table(rows=1, cols=1)
    cell = table.cell(0, 0)
    cell.paragraphs[0].text = "first item"
    cell.paragraphs[0].style = "List Number"
    cell.add_paragraph("second item", style="List Number")
    d.add_paragraph("After")


def case_nested_table(d):
    table = d.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "outer"
    inner = table.cell(0, 1).add_table(rows=1, cols=1)
    inner.cell(0, 0).text = "inner"
    d.add_paragraph("After")


def _shade(cell, fill: str) -> None:
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), fill)
    cell._tc.get_or_add_tcPr().append(shd)


def case_dark_header_cells(d):
    # A dark cell is written white and font-weight:600, which bolds all its text (an empty cell's too).
    table = d.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Header"
    _shade(table.cell(0, 0), "000000")
    _shade(table.cell(0, 1), "1F3864")
    table.cell(1, 0).text = "body"
    d.add_paragraph("After")


def case_nested_table_of_two_rows(d):
    table = d.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "outer"
    inner = table.cell(0, 1).add_table(rows=2, cols=1)
    inner.cell(0, 0).text = "inner one"
    inner.cell(1, 0).text = "inner two"
    d.add_paragraph("After")


def _text_run(paragraph, text: str, bold: bool = False) -> None:
    """A run whose w:t holds `text` as is (python-docx turns a newline into a w:br)."""
    run = paragraph.add_run()
    run.bold = bold
    t = OxmlElement("w:t")
    t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text
    run._r.append(t)


def case_newline_runs(d):
    # TipTap removes a text node that is only a newline before ProseMirror reads the HTML.
    p = d.add_paragraph("before")
    _break(p.add_run(), None)
    _text_run(p, "\n", bold=True)
    p.add_run("after")
    q = d.add_paragraph("mid")
    _text_run(q, "\n", bold=True)
    _text_run(q, " ", bold=True)
    q.add_run("end")


def case_mixed_document(d):
    # Whole-document assembly: blocks of every kind in order (tests/python TestDocumentJson pins it).
    d.add_heading("Title", level=1)
    d.add_paragraph("Intro")
    for text in ("first", "second"):
        d.add_paragraph(text, style="List Number")
    table = d.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "cell"
    d.add_page_break()
    d.add_paragraph("After the break")


def _png(width: int, height: int) -> io.BytesIO:
    """A plain grey PNG of the given size (standard library only)."""
    import struct
    import zlib

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    rows = b"".join(b"\x00" + b"\x80" * width for _ in range(height))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    return io.BytesIO(png)

def case_picture_alone(d):
    d.add_paragraph("Before")
    d.add_paragraph().add_run().add_picture(_png(200, 100))
    d.add_paragraph("After")


def case_picture_between_text(d):
    p = d.add_paragraph("Text before ")
    p.add_run().add_picture(_png(120, 60))
    p.add_run(" and text after")


def case_picture_first_then_caption(d):
    p = d.add_paragraph()
    p.alignment = 1
    p.add_run().add_picture(_png(300, 120))
    p.add_run("Figure 1: a caption")


def case_icon_in_text(d):
    p = d.add_paragraph("Name ")
    p.add_run().add_picture(_png(16, 16))
    p.add_run(" with a small badge")


def case_picture_in_a_cell(d):
    table = d.add_table(rows=2, cols=1)
    table.cell(0, 0).paragraphs[0].add_run().add_picture(_png(80, 40))
    table.cell(1, 0).text = "below"
    d.add_paragraph("After")


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
                converter._JSON_SINK, converter._JSON_SINK_HTML, converter._JSON_LIST_SINK, converter._JSON_TABLE_SINK = [], [], [], []
                try:
                    result = converter.convert_docx_bytes_to_html(build(fn))
                    sink, lists, tables = list(converter._JSON_SINK), list(converter._JSON_LIST_SINK), list(converter._JSON_TABLE_SINK)
                finally:
                    converter._JSON_SINK = converter._JSON_SINK_HTML = converter._JSON_LIST_SINK = converter._JSON_TABLE_SINK = None
                if any(nodes is None for _, nodes in sink) or not all(entry["ok"] for entry in lists) or None in tables:
                    print(f"NOT WRITTEN  {name}")
                    failed += 1
                    continue
                # Paragraphs and lists are recorded apart: compare each in document order.
                ours = [node for _, nodes in sink for node in nodes]
                our_lists = [entry["node"] for entry in lists]
                html = __import__("re").sub(r' data-sink(?:-list|-table)?="\d+"', "", result["html"])
                page = browser.new_page()
                page.add_init_script("window.__FIDELITY__ = " + json.dumps({
                    "html": html, "pageSize": "letter", "margins": {"top": 1, "bottom": 1, "left": 1, "right": 1},
                    "orientation": "portrait", "header": "", "footer": "", "headerNumberFormat": "none",
                    "footerNumberFormat": "none", "pageLayout": None,
                }))
                page.goto("http://localhost:5173/dev/editor-harness")
                page.wait_for_function("() => window.__editor && window.__editor.state.doc.content.size > 2", timeout=60000)
                content = page.evaluate("window.__editor.getJSON().content")
                page.close()
                # The editor's trailing-node extension adds an empty paragraph after a document that ends with
                # something else (a list): a runtime addition after any load, not part of the import.
                trailing = {"type": "paragraph", "attrs": converter._write_paragraph_json("", None, [])["attrs"]}
                if len(content) == len(ours) + len(our_lists) + len(tables) + 1 and content[-2]["type"] != "paragraph" and content[-1] == trailing:
                    content = content[:-1]
                blocks = ("orderedList", "bulletList", "table")
                editor = [node for node in content if node["type"] not in blocks]
                editor_lists = [node for node in content if node["type"] in ("orderedList", "bulletList")]
                editor_tables = [node for node in content if node["type"] == "table"]
                found = first_difference(editor, ours) or first_difference(editor_lists, our_lists) or first_difference(editor_tables, tables)
                # And the whole document as the converter assembles it (content_json).
                document = result.get("content_json")
                if not found:
                    found = "no document JSON" if document is None else first_difference(content, document["content"])
                shape = " ".join(node["type"] for node in ours + our_lists + tables)
                print(("same         " if not found else "DIFFERENT    ") + f"{name:34} {shape}" + (f"\n    {found}" if found else ""))
                failed += bool(found)
        finally:
            browser.close()
    print(f"\n{len(CASES) - failed}/{len(CASES)} cases match the editor")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
