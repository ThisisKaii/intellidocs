"""Approval-sheet and front-matter furniture: typed page numbers, signature tab stops, filled-bar rules."""

import io
import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Twips

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml" / "src"))

from converter import _mark_static_page_numbers, convert_docx_bytes_to_html  # noqa: E402


def _header_with_number(section, text: str) -> None:
    header = section.header
    header.is_linked_to_previous = False
    header.paragraphs[0].text = text


def numbered_docx() -> bytes:
    document = Document()
    document.add_paragraph("Title page")
    front = document.add_section(WD_SECTION.NEW_PAGE)
    start = parse_xml(f'<w:pgNumType {nsdecls("w")} w:start="2"/>')
    front._sectPr.append(start)
    _header_with_number(front, "viii")
    document.add_paragraph("APPROVAL SHEET")
    document.add_section(WD_SECTION.NEW_PAGE)
    document.add_paragraph("ABSTRACT")
    return _save(document)


def _save(document) -> bytes:
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_a_typed_header_number_becomes_the_page_number():
    result = convert_docx_bytes_to_html(numbered_docx())
    sections = result["hf"]["sections"]
    key = sections[1]["header"]
    assert key is not None
    part = result["hf"]["parts"][key]
    assert "{page}" in part["flow"] + part["art"]
    assert "viii" not in part["flow"] + part["art"]
    # Roman numerals from the typed number, restarting where the section says, carried into the next section.
    assert sections[1]["number_format"] == "lowerRoman"
    assert sections[1]["number_start"] == 2
    assert sections[2]["number_format"] == "lowerRoman"
    # Parts the editor reads keep only their HTML.
    assert set(part) == {"flow", "art"}


def test_only_a_lone_number_is_a_page_number():
    xml = (
        f'<w:hdr {nsdecls("w")}>'
        "<w:p><w:r><w:t>Chapter 4 Results</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>2026</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>civil</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>Page 12</w:t></w:r></w:p>"
        "</w:hdr>"
    )
    element = parse_xml(xml)
    assert _mark_static_page_numbers(element) == "decimal"
    texts = ["".join(t.text or "" for t in p.iter(qn("w:t"))) for p in element.iter(qn("w:p"))]
    assert texts == ["Chapter 4 Results", "2026", "civil", "Page {page}"]


def signature_docx() -> bytes:
    document = Document()
    document.add_paragraph("APPROVAL SHEET")
    names = document.add_paragraph(style="Heading 3")
    names.paragraph_format.tab_stops.add_tab_stop(Twips(5401))
    names.add_run("GIAN S. MAHUSAY")
    names.add_run("\t")
    names.add_run("ALEXANDER Y. BUCOL")
    date = document.add_paragraph()
    date.add_run("Date:")
    blank = date.add_run("\t")
    blank.underline = True
    # A rule drawn as a thin filled rectangle (Google Docs / PDF exports), anchored to an empty paragraph.
    rule = document.add_paragraph()
    rule._p.append(parse_xml(
        f'<w:r {nsdecls("w", "wp", "a")} xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
        '<w:drawing><wp:anchor behindDoc="0" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" locked="0" layoutInCell="1" allowOverlap="1">'
        '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>205422</wp:posOffset></wp:positionH>'
        '<wp:positionV relativeFrom="paragraph"><wp:posOffset>183198</wp:posOffset></wp:positionV>'
        '<wp:extent cx="5533390" cy="27940"/><wp:wrapTopAndBottom/><wp:docPr id="5" name="rule"/>'
        '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp>'
        '<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5523865" cy="18415"/></a:xfrm>'
        '<a:custGeom><a:pathLst><a:path w="5523865" h="18415"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="5523865" y="0"/></a:lnTo>'
        '<a:lnTo><a:pt x="5523865" y="18415"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom>'
        '<a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:ln><a:noFill/></a:ln></wps:spPr>'
        '<wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>'
    ))
    document.add_paragraph("APPROVED by the Examining Tribunal")
    return _save(document)


def _blocks(node, found):
    if isinstance(node, dict):
        if node.get("type") in ("paragraph", "heading"):
            found.append(node)
        for value in node.values():
            _blocks(value, found)
    elif isinstance(node, list):
        for value in node:
            _blocks(value, found)
    return found


def test_signature_heading_keeps_its_tab_stop():
    result = convert_docx_bytes_to_html(signature_docx())
    assert re.search(r'<h3[^>]*data-tab-stops="[^"]*360\.1', result["html"])
    heading = next(block for block in _blocks(result["content_json"], []) if "MAHUSAY" in str(block))
    assert heading["type"] == "heading"
    assert "360.1" in heading["attrs"]["tabStops"]


def test_underlined_blank_and_filled_bar_rule():
    result = convert_docx_bytes_to_html(signature_docx())
    date = next(block for block in _blocks(result["content_json"], []) if "Date:" in str(block))
    tab = next(child for child in date["content"] if child["type"] == "tab")
    assert {"type": "underline"} in tab["marks"]
    rules = re.findall(r'<p class="rule-line" style="([^"]*)"', result["html"])
    assert len(rules) == 1
    assert "border-bottom:1.45pt solid #000000" in rules[0]
    assert "margin-left:21.6px" in rules[0]
