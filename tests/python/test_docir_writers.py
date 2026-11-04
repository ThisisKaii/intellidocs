"""The converter's document model (ml/src/docir.py) and the HTML writers that turn it into the editor's markup.

The fixtures hold the writers byte-identical to the old output (editor_json_reference.py check); these
pin the branches the fixtures may not reach.
"""
import io
import sys
from pathlib import Path

import docx
from docx.shared import Pt

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ml" / "src"))
from converter import (  # noqa: E402
    _read_paragraph_props,
    _read_run,
    _write_font_css,
    _write_indent_css,
    _write_run_html,
    _write_spacing_css,
)
from docir import ParagraphIndent, ParagraphSpacing, RunProps, TextRun  # noqa: E402


class TestSpacing:
    def test_nothing_set_writes_nothing(self):
        assert _write_spacing_css(ParagraphSpacing(), "Arial") == ""

    def test_an_explicit_zero_is_written(self):
        assert _write_spacing_css(ParagraphSpacing(before_twips=0, after_twips=0, unset=False), None) == "margin-top:0; margin-bottom:0"

    def test_lines_count_only_when_twips_are_unset(self):
        css = _write_spacing_css(ParagraphSpacing(before_lines=100, after_twips=120, after_lines=50, unset=False), None)
        assert css == "margin-top:1.2em; margin-bottom:8.0px"

    def test_exact_and_at_least_lines_are_points(self):
        assert _write_spacing_css(ParagraphSpacing(line=280, line_rule="exact", unset=False), "Arial") == "line-height:14.0pt"
        assert _write_spacing_css(ParagraphSpacing(line=240, line_rule="atLeast", unset=False), None) == "line-height:12.0pt"

    def test_auto_lines_scale_by_the_font_natural_height(self):
        assert _write_spacing_css(ParagraphSpacing(line=360, unset=False), "Calibri") == "line-height:1.832"
        assert _write_spacing_css(ParagraphSpacing(line=240, unset=False), "Unknown Font") == "line-height:1.15"


class TestIndent:
    def test_no_indent_still_pins_text_indent(self):
        assert _write_indent_css(ParagraphIndent()) == "text-indent:0"

    def test_first_line_wins_over_hanging_and_sides_are_written(self):
        css = _write_indent_css(ParagraphIndent(left_twips=720, right_twips=360, first_line_twips=360, hanging_twips=200))
        assert css == "margin-left:48.0px; text-indent:24.0px; margin-right:24.0px"

    def test_hanging_is_a_negative_text_indent(self):
        assert _write_indent_css(ParagraphIndent(hanging_twips=360)) == "text-indent:-24.0px"


def test_font_size_drops_a_whole_number_decimal():
    assert _write_font_css(None) == ""
    assert _write_font_css(12.0) == "font-size:12pt"
    assert _write_font_css(10.5) == "font-size:10.5pt"


class TestRuns:
    def test_formatting_wraps_in_word_order(self):
        props = RunProps(size_pt=11.0, color="#ff0000", font_family="Arial", bold=True, italic=True, underline=True, highlight="#ffff00")
        assert _write_run_html(TextRun("Hi", props)) == (
            '<mark style="background-color:#ffff00"><u><em><strong><span style="font-size:11.0pt; color:#ff0000; '
            "font-family:'Arial', Arial, sans-serif\">Hi</span></strong></em></u></mark>"
        )

    def test_tabs_spaces_and_blanks(self):
        assert _write_run_html(TextRun("a\tb  c", RunProps())) == "a<span data-tab></span>b  c"
        assert _write_run_html(TextRun("   ", RunProps(underline=True))) == "<u>   </u>"

    def test_tracking_under_the_threshold_is_dropped(self):
        assert _write_run_html(TextRun("x", RunProps(tracking_pt=0.004))) == "x"
        assert _write_run_html(TextRun("x", RunProps(tracking_pt=-0.1))) == '<span style="letter-spacing:-0.1pt">x</span>'


def test_readers_resolve_a_real_paragraph_and_run():
    document = docx.Document()
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(6)
    paragraph.paragraph_format.left_indent = Pt(36)
    run = paragraph.add_run("Bold text")
    run.bold = True
    run.font.size = Pt(14)
    buffer = io.BytesIO()
    document.save(buffer)
    reopened = docx.Document(io.BytesIO(buffer.getvalue())).paragraphs[0]

    props = _read_paragraph_props(reopened)
    assert props.spacing.before_twips == 120 and props.indent.left_twips == 720
    assert props.style_name == "normal"
    item = _read_run(reopened.runs[0])
    assert item is not None and item.text == "Bold text"
    assert item.props.bold and item.props.size_pt == 14.0


class TestInline:
    def test_breaks_notes_and_equations(self):
        from converter import _COLUMN_MARK, _PAGE_BREAK_HTML, _write_inline_html
        from docir import ColumnBreak, DisplayMath, InlineMath, LineBreak, NoteReference, PageBreak

        html = _write_inline_html([
            LineBreak(), PageBreak(), ColumnBreak(),
            NoteReference("footnote", 3, "decimal"), NoteReference("endnote", 4, "lowerRoman"),
            InlineMath("x^2", ""), InlineMath(None, "a<b"), DisplayMath("E=mc^2", "(1)"),
        ])
        assert html == (
            "<br/>" + _PAGE_BREAK_HTML + _COLUMN_MARK + "<sup>3</sup><sup>iv</sup>"
            '<span data-type="inline-math" data-latex="x^2"></span>a&lt;b'
            '<div data-type="block-math" data-latex="E=mc^2" data-number="(1)"></div>'
        )

    def test_a_link_opens_outside_only_for_web_addresses_and_vanishes_when_empty(self):
        from converter import _write_inline_html
        from docir import Fragment, Hyperlink

        text = TextRun("site", RunProps())
        assert _write_inline_html([Hyperlink("https://x.org", (text,))]) == '<a href="https://x.org" target="_blank" rel="noopener noreferrer">site</a>'
        assert _write_inline_html([Hyperlink("#top", (text,))]) == '<a href="#top">site</a>'
        assert _write_inline_html([Hyperlink("https://x.org", ())]) == ""
        assert _write_inline_html([Fragment("pictures", "<img />")]) == "<img />"

    def test_the_reader_keeps_breaks_links_and_note_numbers_in_order(self):
        from docx.opc.constants import RELATIONSHIP_TYPE as RT
        from docx.oxml import OxmlElement
        from docx.oxml.ns import qn as q
        from converter import _read_inline
        from docir import Hyperlink, LineBreak, NoteReference, PageBreak

        document = docx.Document()
        paragraph = document.add_paragraph("Before")
        run = paragraph.add_run("After breaks")
        for kind in (None, "page"):
            br = OxmlElement("w:br")
            if kind:
                br.set(q("w:type"), kind)
            run._r.insert(0, br)
        link = OxmlElement("w:hyperlink")
        link.set(q("r:id"), paragraph.part.relate_to("https://example.org", RT.HYPERLINK, is_external=True))
        inner = OxmlElement("w:r")
        text = OxmlElement("w:t")
        text.text = "link"
        inner.append(text)
        link.append(inner)
        paragraph._p.append(link)
        noted = paragraph.add_run()
        ref = OxmlElement("w:footnoteReference")
        ref.set(q("w:id"), "7")
        noted._r.append(ref)
        paragraph.part._intellidocs_notes = {"footnote": {}, "endnote": {}}

        items = _read_inline(paragraph, {})
        kinds = [type(item).__name__ for item in items]
        assert kinds == ["TextRun", "LineBreak", "PageBreak", "TextRun", "Hyperlink", "NoteReference"]
        assert isinstance(items[1], LineBreak) and isinstance(items[2], PageBreak)
        assert isinstance(items[4], Hyperlink) and items[4].url == "https://example.org"
        assert isinstance(items[5], NoteReference) and items[5].number == 1
