"""A short two-column section opened by a page break (a chapter's title block) keeps its columns."""

import io
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_BREAK
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Pt

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
    # The subheading on the chapter's first page opens the chapter's tab, not the end of the one before.
    assert "Rationale of the Study" in chapter_one


def _two_column_section_after(document, space_twips: int, width_twips: int) -> None:
    """A continuous two-column section from here on, with columns of their own widths and gap."""
    section = document.add_section(WD_SECTION.CONTINUOUS)
    cols = section._sectPr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        section._sectPr.append(cols)
    for name in ("w:space", "w:num", "w:equalWidth"):
        cols.attrib.pop(qn(name), None)
    cols.set(qn("w:num"), "2")
    cols.set(qn("w:equalWidth"), "0")
    for _ in range(2):
        col = OxmlElement("w:col")
        col.set(qn("w:w"), str(width_twips))
        col.set(qn("w:space"), str(space_twips))
        cols.append(col)


def definitions_docx() -> bytes:
    """A glossary page: a one-column title, then a term and its definition side by side."""
    document = Document()
    document.add_paragraph("DEFINITION OF TERMS")
    _two_column_section_after(document, space_twips=143, width_twips=4608)
    # The paragraph that carries the break into the columns is empty but has its own size and spacing.
    carrier = document.paragraphs[-1]
    carrier.paragraph_format.space_before = Pt(2.25)
    carrier.add_run().font.size = Pt(10)
    document.add_paragraph("Artificial Intelligence (AI)")
    definition = document.add_paragraph()
    definition.add_run().add_break(WD_BREAK.COLUMN)
    definition.add_run("Refers to the technology that enables the system to analyze user inputs.")
    body = document.add_section(WD_SECTION.CONTINUOUS)
    if body._sectPr.find(qn("w:cols")) is not None:
        body._sectPr.remove(body._sectPr.find(qn("w:cols")))
    document.add_paragraph("Behavioral Tracking")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_columns_keep_the_gap_word_gives_each_column() -> None:
    """Columns of their own widths carry the gap on each w:col (143 twips here), not on w:cols: read
    as Word's default half inch, the definitions sat 18 px off Word's."""
    import re

    html = convert_docx_bytes_to_html(definitions_docx())["html"]
    block = re.search(r'<div class="intellidocs-columns"[^>]*>', html)
    assert block, "the term and its definition were not put side by side"
    assert 'data-gap="9.5"' in block.group(0)


def test_the_empty_paragraph_that_switches_to_columns_takes_no_line() -> None:
    """Word draws the empty paragraph that carries a continuous break into another number of columns
    on the line above it; as a blank line it pushed the glossary 27 px down the page."""
    import re

    html = convert_docx_bytes_to_html(definitions_docx())["html"]
    between = html[html.find("DEFINITION OF TERMS"):html.find('<div class="intellidocs-columns"')]
    assert "<p " not in between and "<p>" not in between, between
