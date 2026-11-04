"""Every Word section keeps its own margins in the import.

Since Stage 3 a section's margins travel on the section break that opens it (`sectionProps` on a page
break or section mark); the editor's section decorations move the section's blocks from those. The
blocks themselves carry no shift: the converter used to bake one into each paragraph, table
(`data-inset`) and list marker (_shift_sections, removed).
"""
import html as html_lib
import io
import json
import os
import re
import sys

import docx
from docx.enum.section import WD_SECTION
from docx.shared import Inches

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))

from converter import convert_docx_bytes_to_html  # noqa: E402


def build_document(left_margins: list[float], blocks: bool = False) -> bytes:
    """A DOCX with one section per entry, each with its own left margin (inches) and a paragraph; with
    `blocks`, also a one-cell table and a numbered item."""
    document = docx.Document()
    for index, left in enumerate(left_margins):
        section = document.sections[0] if index == 0 else document.add_section(WD_SECTION.NEW_PAGE)
        section.left_margin = Inches(left)
        section.right_margin = Inches(1)
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        document.add_paragraph(f"Paragraph of section {index}")
        if blocks:
            document.add_table(rows=1, cols=1).cell(0, 0).text = f"Cell of section {index}"
            document.add_paragraph(f"Item of section {index}", style="List Number")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def html_left_margins(html: str) -> dict[int, float]:
    """Each section's left margin (px) as its break in the HTML states it."""
    found = {}
    for match in re.finditer(r'data-section="(\d+)" data-section-props="([^"]*)"', html):
        found[int(match.group(1))] = json.loads(html_lib.unescape(match.group(2)))["margins"]["left"]
    return found


def json_left_margins(doc: dict) -> dict[int, float]:
    """Each section's left margin (px) as its break in the editor JSON states it."""
    return {
        node["attrs"]["section"]: node["attrs"]["sectionProps"]["margins"]["left"]
        for node in doc["content"]
        if node["type"] in ("pageBreak", "sectionMark")
    }


def test_each_section_break_carries_its_own_margins() -> None:
    result = convert_docx_bytes_to_html(build_document([1.0, 2.0, 1.0]))
    assert html_left_margins(result["html"]) == {0: 96, 1: 192, 2: 96}
    assert json_left_margins(result["content_json"]) == {0: 96, 1: 192, 2: 96}


def test_a_narrower_later_section_is_described_too() -> None:
    result = convert_docx_bytes_to_html(build_document([1.0, 1.0, 0.5]))
    assert html_left_margins(result["html"]) == {0: 96, 1: 96, 2: 48}
    assert json_left_margins(result["content_json"]) == {0: 96, 1: 96, 2: 48}


def test_blocks_carry_no_baked_in_shift() -> None:
    """The editor moves a section's blocks from its break; a shift in the blocks would apply twice."""
    html = convert_docx_bytes_to_html(build_document([1.0, 2.0, 1.0], blocks=True))["html"]
    assert "data-inset" not in html
    assert "margin-left:96px" not in html and "margin-left:-" not in html
    # List markers sit at the same x in every section.
    marker_x = re.findall(r'data-mx="([\d.]+)"', html)
    assert len(marker_x) == 3 and len(set(marker_x)) == 1
