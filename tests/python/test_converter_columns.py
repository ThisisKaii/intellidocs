"""A DOCX whose text is mostly in two-column sections is flagged, so the editor can offer the IEEE view."""
import io
import os
import sys

import docx
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))

from converter import convert_docx_bytes_to_html  # noqa: E402

LONG = "A sentence of ordinary body text that goes on for a while. " * 30  # about 1,700 characters


def build(sections: list[tuple[int, str]]) -> bytes:
    """A document with one section per (column count, text) entry."""
    document = docx.Document()
    for index, (columns, text) in enumerate(sections):
        section = document.sections[0] if index == 0 else document.add_section(WD_SECTION.CONTINUOUS)
        document.add_paragraph(text)
        cols = section._sectPr.find(qn("w:cols"))
        if cols is None:
            cols = OxmlElement("w:cols")
            section._sectPr.append(cols)
        cols.set(qn("w:num"), str(columns))
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def flagged(sections: list[tuple[int, str]]) -> bool:
    return bool(convert_docx_bytes_to_html(build(sections))["two_column_body"])


def test_paper_with_a_two_column_body_is_flagged() -> None:
    assert flagged([(1, "Title and authors"), (2, LONG), (1, "A wide table"), (2, LONG)])


def test_single_column_document_is_not_flagged() -> None:
    assert not flagged([(1, LONG * 2)])


def test_memo_with_a_short_two_column_header_is_not_flagged() -> None:
    assert not flagged([(2, "Office of the Superintendent     September 29"), (1, LONG * 2)])


def test_short_two_column_document_is_not_flagged() -> None:
    assert not flagged([(2, "A little text.")])
