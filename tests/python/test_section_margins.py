"""Tests that every Word section keeps its own left/right margins in the imported HTML."""
import io
import os
import sys

import docx
from docx.enum.section import WD_SECTION
from docx.shared import Inches

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))

from converter import convert_docx_bytes_to_html  # noqa: E402


def build_document(left_margins: list[float]) -> bytes:
    """A DOCX with one section per entry, each holding one paragraph and its own left margin (inches)."""
    document = docx.Document()
    for index, left in enumerate(left_margins):
        section = document.sections[0] if index == 0 else document.add_section(WD_SECTION.NEW_PAGE)
        section.left_margin = Inches(left)
        section.right_margin = Inches(1)
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        document.add_paragraph(f"Paragraph of section {index}")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def paragraph_tag(html: str, text: str) -> str:
    """The opening <p ...> tag of the paragraph holding the given text."""
    end = html.index(text)
    return html[html.rindex("<p", 0, end):end]


def test_odd_section_is_shifted_by_its_margin_difference() -> None:
    """Sections that share the document-wide margin stay put; the odd one moves by the difference."""
    html = convert_docx_bytes_to_html(build_document([1.0, 2.0, 1.0]))["html"]
    assert "margin-left:96px" in paragraph_tag(html, "Paragraph of section 1")
    assert "margin-left:96px" not in paragraph_tag(html, "Paragraph of section 0")
    assert "margin-left:96px" not in paragraph_tag(html, "Paragraph of section 2")


def test_later_section_is_shifted_not_only_the_first() -> None:
    """A narrower margin in the last section is applied too (negative shift)."""
    html = convert_docx_bytes_to_html(build_document([1.0, 1.0, 0.5]))["html"]
    assert "margin-left:-48px" in paragraph_tag(html, "Paragraph of section 2")
