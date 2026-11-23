"""A short two-column section opened by a page break (a chapter's title block) keeps its columns."""

import io
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_BREAK
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml" / "src"))

from converter import convert_docx_bytes_to_html  # noqa: E402


def two_columns(section) -> None:
    cols = section._sectPr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        section._sectPr.append(cols)
    cols.set(qn("w:num"), "2")


def chapter_docx() -> bytes:
    document = Document()
    document.add_paragraph("Last line of the front matter.")
    # A new page, in two columns: the left column's text, a column break, the right column's title.
    opening = document.add_section(WD_SECTION.NEW_PAGE)
    two_columns(opening)
    document.add_paragraph("Rationale of the Study")
    title = document.add_paragraph()
    title.add_run().add_break(WD_BREAK.COLUMN)
    title.add_run("CHAPTER I INTRODUCTION")
    # Back to one column for the chapter's text.
    body = document.add_section(WD_SECTION.CONTINUOUS)
    body._sectPr.remove(body._sectPr.find(qn("w:cols"))) if body._sectPr.find(qn("w:cols")) is not None else None
    document.add_paragraph("Document creation is a cornerstone of academic work.")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_a_next_page_column_section_becomes_side_by_side_columns() -> None:
    html = convert_docx_bytes_to_html(chapter_docx())["html"]
    start = html.find('<div class="intellidocs-columns"')
    assert start >= 0, "the two-column chapter opening was flattened into one column"
    block = html[start:html.find("Document creation")]
    assert "Rationale of the Study" in block and "CHAPTER I INTRODUCTION" in block
    assert block.count('class="intellidocs-column"') == 2
    assert "page-break" not in block, "the section's opening page break went inside the columns"
    assert html.find('class="page-break"') < start, "the page break must stay in front of the columns"


def test_every_tab_of_a_split_manuscript_opens_on_whole_blocks() -> None:
    """A two-column section straddling a tab boundary (IntelliDocs (2): "Rationale of the Study" and
    the "CHAPTER I" title) stays one column: wrapped, it put the tab marker inside a column, and the
    Chapter 1 tab opened on a stray "</div>" that the editor read as an empty document."""
    import re

    fixture = ROOT / "tests" / "fixtures" / "import_baselines" / "documents" / "IntelliDocs (2).docx"
    html = convert_docx_bytes_to_html(fixture.read_bytes(), split_tabs=True, build_json=False)["html"]
    parts = re.split(r'<div data-tab-break="" data-tab-id="" data-title="[^"]*"></div>', html)
    assert len(parts) > 3
    for index, part in enumerate(parts):
        assert not part.lstrip().startswith("</"), f"tab {index} opens inside a block"
        assert part.count("<div") == part.count("</div"), f"tab {index} has unbalanced blocks"
    chapter_one = next(part for part in parts if "CHAPTER I INTRODUCTION" in part)
    assert "Document creation is a cornerstone" in chapter_one
