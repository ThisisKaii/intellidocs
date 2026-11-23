"""Word's own table placement and pictures inside nested drawing groups."""

import base64
import io
import re
import struct
import sys
import zlib
from pathlib import Path

from docx import Document
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Twips

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml" / "src"))

from converter import _table_inset, convert_docx_bytes_to_html  # noqa: E402


def _save(document) -> bytes:
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _table_with(width_twips: int, indent_twips: int, jc: str | None = None):
    document = Document()
    section = document.sections[0]
    section.left_margin = section.right_margin = Twips(1440)
    table = document.add_table(rows=1, cols=2)
    props = table._tbl.tblPr
    for tag in ("w:tblW", "w:tblInd", "w:jc"):
        for old in props.findall(qn(tag)):
            props.remove(old)
    props.append(parse_xml(f'<w:tblW {nsdecls("w")} w:w="{width_twips}" w:type="dxa"/>'))
    props.append(parse_xml(f'<w:tblInd {nsdecls("w")} w:w="{indent_twips}" w:type="dxa"/>'))
    if jc:
        props.append(parse_xml(f'<w:jc {nsdecls("w")} w:val="{jc}"/>'))
    document.add_paragraph("after")
    return document, table


def test_an_indented_narrower_table_keeps_words_place():
    document, table = _table_with(width_twips=8000, indent_twips=360)
    column = (document.sections[0].page_width - document.sections[0].left_margin - document.sections[0].right_margin) / 635
    inset = _table_inset(table._tbl, column / 15)
    left, right, top = (float(part) for part in inset.split(","))
    assert left == 24.0
    assert abs(left + right + 8000 / 15 - column / 15) < 0.2
    assert top == 0
    html = convert_docx_bytes_to_html(_save(document))["html"]
    assert 'data-inset="24,' in html


def test_a_centered_table_and_a_full_width_one():
    document, table = _table_with(width_twips=6000, indent_twips=0, jc="center")
    column = (document.sections[0].page_width - document.sections[0].left_margin - document.sections[0].right_margin) / 635 / 15
    left, right, _ = (float(part) for part in _table_inset(table._tbl, column).split(","))
    assert abs(left - right) < 0.2
    full, wide = _table_with(width_twips=int(column * 15), indent_twips=0)
    assert _table_inset(wide._tbl, column) is None


def _png(width: int, height: int) -> bytes:
    """A small opaque PNG."""
    raw = b"".join(b"\x00" + b"\x80\x80\x80" * width for _ in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def test_a_picture_in_a_nested_group_is_drawn_inside_the_frame():
    """Google Docs nests a drawing's picture in an inner group whose child space starts at 0,0,
    while the outer group's child space starts far from the origin."""
    document = Document()
    run = document.add_paragraph().add_run()
    image_part = document.part.package.image_parts.get_or_add_image_part(io.BytesIO(_png(20, 20)))
    rel = document.part.relate_to(image_part, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image")
    cx, cy, ox, oy = 2540000, 2540000, 3453675, 1706700
    run._r.append(parse_xml(f"""
<w:drawing {nsdecls("w", "wp", "a", "pic", "r")} xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">
 <wp:inline><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="1" name="g"/>
  <a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"><wpg:wgp>
   <wpg:grpSpPr><a:xfrm><a:off x="{ox}" y="{oy}"/><a:ext cx="{cx}" cy="{cy}"/><a:chOff x="{ox}" y="{oy}"/><a:chExt cx="{cx}" cy="{cy}"/></a:xfrm></wpg:grpSpPr>
   <wpg:grpSp><wpg:grpSpPr><a:xfrm><a:off x="{ox}" y="{oy}"/><a:ext cx="{cx}" cy="{cy}"/><a:chOff x="0" y="0"/><a:chExt cx="{cx}" cy="{cy}"/></a:xfrm></wpg:grpSpPr>
    <pic:pic><pic:nvPicPr><pic:cNvPr id="2" name="p"/><pic:cNvPicPr/></pic:nvPicPr>
     <pic:blipFill><a:blip r:embed="{rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
     <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic>
   </wpg:grpSp>
  </wpg:wgp></a:graphicData></a:graphic></wp:inline></w:drawing>"""))
    html = convert_docx_bytes_to_html(_save(document))["html"]
    found = re.search(r'src="data:image/png;base64,([^"]+)"', html)
    assert found, "the group is drawn as one picture"
    import pymupdf

    pix = pymupdf.Pixmap(base64.b64decode(found.group(1)))
    # The grey picture fills the frame: its centre is grey, not transparent (it used to land ~3.5in to the left).
    centre = pix.pixel(pix.width // 2, pix.height // 2)
    assert centre[:3] == (128, 128, 128)
