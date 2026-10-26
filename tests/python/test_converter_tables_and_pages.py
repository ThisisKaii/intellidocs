"""Tables, page ends, fonts and drawn lines are rebuilt from the source document, not invented."""
import re
import sys
from pathlib import Path

import docx
import pytest
from docx.enum.text import WD_BREAK
from docx.oxml.ns import qn
from docx.shared import Pt
from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
ML_SRC = ROOT / "ml" / "src"
if str(ML_SRC) not in sys.path:
    sys.path.insert(0, str(ML_SRC))

from converter import (  # noqa: E402
    _clean_font_name,
    _docx_document_to_result,
    _generic_family,
    _snap_right_tabs,
    _trim_page_ends,
)


def _html(document: docx.Document) -> str:
    return _docx_document_to_result(document)["html"]


def _set_borders(table: docx.table.Table, value: str) -> None:
    """Give a table a tblBorders element with the same Word border value on every edge."""
    tbl_pr = table._element.tblPr
    borders = etree.SubElement(tbl_pr, qn("w:tblBorders"))
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = etree.SubElement(borders, qn(f"w:{edge}"))
        element.set(qn("w:val"), value)
        element.set(qn("w:sz"), "8")
        element.set(qn("w:color"), "FF0000")


class TestTables:
    def test_a_borderless_table_has_no_borders_or_header_shading(self):
        document = docx.Document()
        table = document.add_table(rows=2, cols=2)
        _set_borders(table, "nil")
        html = _html(document)
        assert "border-top:none" in html
        assert "var(--border)" not in html and "var(--secondary)" not in html

    def test_table_borders_come_from_the_source(self):
        document = docx.Document()
        table = document.add_table(rows=1, cols=1)
        _set_borders(table, "single")
        html = _html(document)
        assert "border-top:1pt solid #FF0000" in html

    def test_cell_padding_is_written_as_longhands_the_editor_keeps(self):
        document = docx.Document()
        table = document.add_table(rows=1, cols=1)
        tc_pr = table.cell(0, 0)._tc.get_or_add_tcPr()
        mar = etree.SubElement(tc_pr, qn("w:tcMar"))
        for side, twips in (("top", "100"), ("left", "120")):
            element = etree.SubElement(mar, qn(f"w:{side}"))
            element.set(qn("w:w"), twips)
            element.set(qn("w:type"), "dxa")
        html = _html(document)
        assert "padding-left:8px" in html and "padding-top:6.66667px" in html
        assert "padding:" not in html

    def test_vertical_alignment_follows_the_cell(self):
        document = docx.Document()
        table = document.add_table(rows=1, cols=1)
        tc_pr = table.cell(0, 0)._tc.get_or_add_tcPr()
        etree.SubElement(tc_pr, qn("w:vAlign")).set(qn("w:val"), "center")
        assert "vertical-align:middle" in _html(document)

    def test_cell_text_keeps_its_own_size_and_spacing(self):
        document = docx.Document()
        table = document.add_table(rows=1, cols=1)
        paragraph = table.cell(0, 0).paragraphs[0]
        run = paragraph.add_run("small")
        run.font.size = Pt(9)
        html = _html(document)
        assert "font-size:9pt" in html
        assert "line-height:1.35" not in html


class TestPageEnds:
    def test_blank_lines_before_a_page_break_are_dropped(self):
        spacer = '<p class="empty-spacer" style="x"></p>'
        html = f'<p>text</p>\n{spacer}\n{spacer}\n<hr class="page-break" data-page-break="true" />\n<p>next</p>'
        assert "empty-spacer" not in _trim_page_ends(html)

    def test_a_trailing_line_break_before_a_page_break_is_dropped(self):
        html = '<p>text<br/></p>\n<hr class="page-break" data-page-break="true" />'
        assert "<br" not in _trim_page_ends(html)

    def test_a_page_that_is_blank_on_purpose_keeps_its_lines(self):
        spacer = '<p class="empty-spacer"></p>'
        html = f'<hr class="page-break" />\n{spacer}\n<hr class="page-break" />'
        assert "empty-spacer" in _trim_page_ends(html)

    def test_a_document_with_a_hard_break_still_breaks_the_page(self):
        document = docx.Document()
        document.add_paragraph("one")
        document.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        document.add_paragraph("two")
        assert "page-break" in _html(document)


class TestFonts:
    @pytest.mark.parametrize(
        "raw, clean",
        [
            ("Times New Roman,Bold", "Times New Roman"),
            ("ABCDEF+Arial-BoldMT", "Arial-BoldMT"),
            ("Arial-Bold", "Arial"),
            ("Times New Roman", "Times New Roman"),
        ],
    )
    def test_pdf_font_names_lose_their_style_suffix(self, raw, clean):
        assert _clean_font_name(raw) == clean

    def test_unavailable_sans_fonts_fall_back_to_sans(self):
        assert _generic_family("Arial") == "Arimo, sans-serif"
        assert _generic_family("Times New Roman") == "Tinos, serif"
        assert _generic_family("Courier New") == "Cousine, monospace"

    def test_a_run_without_a_font_uses_the_document_default(self):
        document = docx.Document()
        document.add_paragraph("plain text")
        rpr_default = document.styles.element.find(qn("w:docDefaults") + "/" + qn("w:rPrDefault") + "/" + qn("w:rPr"))
        fonts = rpr_default.find(qn("w:rFonts"))
        if fonts is None:
            fonts = etree.SubElement(rpr_default, qn("w:rFonts"))
        for attribute in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme"):
            fonts.attrib.pop(qn(f"w:{attribute}"), None)
        fonts.set(qn("w:ascii"), "Verdana")
        fonts.set(qn("w:hAnsi"), "Verdana")
        assert "font-family:'Verdana', sans-serif" in _html(document)


class TestTabs:
    def test_a_left_stop_at_the_right_margin_becomes_a_right_stop(self):
        document = docx.Document()
        paragraph = document.add_paragraph("Chapter 1\t24")
        width = int((document.sections[0].page_width - document.sections[0].left_margin - document.sections[0].right_margin) / 635)
        tabs = etree.SubElement(paragraph._p.get_or_add_pPr(), qn("w:tabs"))
        tab = etree.SubElement(tabs, qn("w:tab"))
        tab.set(qn("w:val"), "left")
        tab.set(qn("w:pos"), str(width - 200))
        _snap_right_tabs(document)
        assert tab.get(qn("w:val")) == "right"
        assert int(tab.get(qn("w:pos"))) == width

    def test_a_stop_in_the_middle_of_the_line_is_left_alone(self):
        document = docx.Document()
        paragraph = document.add_paragraph("a\tb")
        tabs = etree.SubElement(paragraph._p.get_or_add_pPr(), qn("w:tabs"))
        tab = etree.SubElement(tabs, qn("w:tab"))
        tab.set(qn("w:val"), "left")
        tab.set(qn("w:pos"), "2000")
        _snap_right_tabs(document)
        assert tab.get(qn("w:val")) == "left"


class TestLists:
    def test_lettered_lists_keep_their_letters(self):
        document = docx.Document()
        numbering = document.part.numbering_part.element
        abstract = etree.SubElement(numbering, qn("w:abstractNum"))
        abstract.set(qn("w:abstractNumId"), "90")
        level = etree.SubElement(abstract, qn("w:lvl"))
        level.set(qn("w:ilvl"), "0")
        etree.SubElement(level, qn("w:numFmt")).set(qn("w:val"), "lowerLetter")
        num = etree.SubElement(numbering, qn("w:num"))
        num.set(qn("w:numId"), "90")
        etree.SubElement(num, qn("w:abstractNumId")).set(qn("w:val"), "90")
        paragraph = document.add_paragraph("first")
        num_pr = etree.SubElement(paragraph._p.get_or_add_pPr(), qn("w:numPr"))
        etree.SubElement(num_pr, qn("w:ilvl")).set(qn("w:val"), "0")
        etree.SubElement(num_pr, qn("w:numId")).set(qn("w:val"), "90")
        assert re.search(r'<ol type="a">', _html(document))
