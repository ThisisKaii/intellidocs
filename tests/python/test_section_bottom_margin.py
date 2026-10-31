"""The editor's single page setup takes the smallest bottom margin of the document's sections."""
import io
import os
import sys

import docx
from docx.enum.section import WD_SECTION
from docx.shared import Inches

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))

from converter import convert_docx_bytes_to_html  # noqa: E402


def build_document(bottoms: list[float]) -> bytes:
    """A DOCX with one section per entry, each holding one paragraph and its own bottom margin (inches)."""
    document = docx.Document()
    for index, bottom in enumerate(bottoms):
        section = document.sections[0] if index == 0 else document.add_section(WD_SECTION.NEW_PAGE)
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(bottom)
        document.add_paragraph(f"Paragraph of section {index}")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def bottom_of(bottoms: list[float]) -> float:
    """The bottom margin the converter reports for a document with these section bottoms."""
    return convert_docx_bytes_to_html(build_document(bottoms))["page_setup"]["margins"]["bottom"]


def test_equal_sections_keep_their_margin() -> None:
    """Nothing changes for a document whose sections agree."""
    assert bottom_of([1.0, 1.0, 1.0]) == 1.0


def test_smallest_bottom_margin_wins_over_the_common_one() -> None:
    """A cover page with a small bottom margin must still fit its last line (most sections use 0.81)."""
    assert bottom_of([0.25, 0.8, 0.8, 0.8]) == 0.25


def test_zero_bottom_margin_is_floored() -> None:
    """A zero margin would collapse the footer zone, so it is raised to the floor."""
    assert bottom_of([0.0, 1.0, 1.0]) == 0.19


def test_single_section_is_untouched() -> None:
    """A one-section document keeps exactly its own margin."""
    assert bottom_of([0.6]) == 0.6
