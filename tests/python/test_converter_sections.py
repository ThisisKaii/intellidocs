"""Section breaks carry the properties of the section they start (frontend/src/lib/sectionProps.ts)."""
import html
import io
import json
import re
import sys
from pathlib import Path

import docx
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ml" / "src"))
from converter import convert_docx_bytes_to_html  # noqa: E402

TAG = re.compile(r'<(?:hr class="page-break"|div class="intellidocs-section-mark")[^>]*>')


def three_sections() -> bytes:
    """Section 0 (1in margins), section 1 on a new page (0.5in left), section 2 continuous in two columns."""
    document = docx.Document()
    document.add_paragraph("First section.")
    narrow = document.add_section(WD_SECTION.NEW_PAGE)
    narrow.left_margin = Inches(0.5)
    narrow.top_margin = Inches(0.75)
    document.add_paragraph("Second section, on its own page.")
    columns = document.add_section(WD_SECTION.CONTINUOUS)
    columns.left_margin = Inches(0.5)
    cols = columns._sectPr.find(qn("w:cols"))  # the default template already has one
    if cols is None:
        cols = OxmlElement("w:cols")
        columns._sectPr.append(cols)
    cols.set(qn("w:num"), "2")
    cols.set(qn("w:space"), "360")
    document.add_paragraph("Third section, in two columns.")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def breaks(result: dict) -> list[tuple[str, dict]]:
    out = []
    for tag in TAG.findall(result["html"]):
        props = re.search(r'data-section-props="([^"]+)"', tag)
        out.append((tag, json.loads(html.unescape(props.group(1))) if props else {}))
    return out


def test_a_new_page_section_break_carries_its_section_properties():
    tag, props = breaks(convert_docx_bytes_to_html(three_sections()))[0]
    assert tag.startswith('<hr class="page-break"') and 'data-section="1"' in tag
    assert props["kind"] == "nextPage"
    assert props["margins"]["left"] == 48.0  # 0.5in
    assert props["margins"]["top"] == 72.0
    assert props["page"] == {"width": 816.0, "height": 1056.0}
    assert props["orientation"] == "portrait"
    assert props["columns"] == {"count": 1, "gap": 48.0, "widths": None}
    assert set(props["headers"]) == {"default", "first", "even"}
    assert props["numbering"] == {"start": None, "format": "decimal"}


def test_a_continuous_section_gets_a_mark_with_its_columns():
    result = convert_docx_bytes_to_html(three_sections())
    tag, props = breaks(result)[1]
    assert tag.startswith('<div class="intellidocs-section-mark"') and 'data-section="2"' in tag
    assert props["kind"] == "continuous"
    assert props["columns"]["count"] == 2
    assert props["columns"]["gap"] == 24.0  # 360 twips
    # The mark sits at the section's start, at the top level, before its first block.
    html_text = result["html"]
    assert html_text.index("intellidocs-section-mark") < html_text.index("Third section")
    assert html_text.index("intellidocs-section-mark") > html_text.index("Second section")


def test_a_one_section_document_has_no_section_breaks():
    document = docx.Document()
    document.add_paragraph("Only one section.")
    buffer = io.BytesIO()
    document.save(buffer)
    assert breaks(convert_docx_bytes_to_html(buffer.getvalue())) == []
