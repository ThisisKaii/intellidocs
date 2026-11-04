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


class TestEditorJson:
    """The JSON writer mirrors the editor's HTML parse rules; editor_json_reference.py check --json holds
    it to the recorded references, these pin the rules themselves."""

    def test_style_rules(self):
        from converter import _cssom_length, _editor_style, _style_value

        assert _editor_style("font-size:11pt; letter-spacing:1pt; text-indent:0;") == "font-size:11pt; text-indent:0"
        assert _editor_style("letter-spacing:1pt") is None
        assert _style_value("color:#000; font-size:9pt; color:#FF0000", "color") == "#FF0000"  # the last one wins
        assert _style_value("font-size:9pt", "color") is None
        assert _cssom_length("11.0pt") == "11pt" and _cssom_length("-0.017pt") == "-0.017pt" and _cssom_length(None) is None

    def test_marks_follow_the_schema_order(self):
        from converter import _run_marks

        marks = _run_marks(RunProps(font_family="Arial", bold=True, underline=True, italic=True, highlight="#FFFF00"))
        assert [m["type"] for m in marks] == ["textStyle", "bold", "italic", "underline", "highlight"]
        assert marks[0]["attrs"] == {"color": "", "fontFamily": "'Arial', Arial, sans-serif", "fontSize": "", "letterSpacing": None}
        assert marks[-1]["attrs"] == {"color": "#FFFF00"}
        assert _run_marks(RunProps()) == []

    def test_whitespace_merging_and_tabs(self):
        from converter import _write_inline_json

        plain, bold = RunProps(), RunProps(bold=True)
        nodes = _write_inline_json([TextRun("  Hello ", plain), TextRun(" world", plain), TextRun("x\ty ", bold)])
        assert nodes == [
            {"type": "text", "text": "\u00a0Hello world"},
            {"type": "text", "text": "x", "marks": [{"type": "bold"}]},
            {"type": "tab", "marks": [{"type": "bold"}]},
            {"type": "text", "text": "y", "marks": [{"type": "bold"}]},
        ]
        assert _write_inline_json([TextRun(" ", plain)]) == []
        assert _write_inline_json([LineBreakLike()]) is None

    def test_paragraph_attributes(self):
        from converter import _write_paragraph_json

        node = _write_paragraph_json("text-align:center; font-size:11pt; margin-left:48.0px; text-indent:0;", ('[["left",96,"none"]]', "48"), [])
        assert node["attrs"]["textAlign"] == "center"
        assert node["attrs"]["indent"] == 2 and isinstance(node["attrs"]["indent"], int)  # JavaScript's 48 / 24
        assert node["attrs"]["style"] == "text-align:center; font-size:11pt; margin-left:48.0px; text-indent:0"
        assert node["attrs"]["tabStops"] == '[["left",96,"none"]]' and node["attrs"]["defaultTab"] == "48"
        assert "content" not in node
        assert _write_paragraph_json("margin-left:2.8px", None, [])["attrs"]["indent"] == 2 / 24  # parseInt drops the fraction


class LineBreakLike:
    """Any inline item the JSON writer does not write yet."""


class TestEditorJsonInline:
    def test_links_take_the_link_extension_defaults_unless_written(self):
        from converter import _write_inline_json
        from docir import Hyperlink

        web, mail = (_write_inline_json([Hyperlink(url, (TextRun("x", RunProps()),))])[0]["marks"][0]["attrs"]
                     for url in ("https://a.org", "mailto:a@b.c"))
        assert web == {"href": "https://a.org", "target": "_blank", "rel": "noopener noreferrer", "class": None, "title": None}
        assert mail["rel"] == "noopener noreferrer nofollow" and mail["target"] == "_blank"

    def test_a_space_after_a_line_break_goes_only_when_the_text_is_bare(self):
        from converter import _write_inline_json
        from docir import LineBreak

        bare = _write_inline_json([TextRun("a", RunProps()), LineBreak(), TextRun(" b", RunProps())])
        assert bare == [{"type": "text", "text": "a"}, {"type": "hardBreak"}, {"type": "text", "text": "b"}]
        styled = _write_inline_json([TextRun("a", RunProps()), LineBreak(), TextRun(" b", RunProps(bold=True))])
        assert styled[-1] == {"type": "text", "text": " b", "marks": [{"type": "bold"}]}

    def test_note_numbers_and_equations(self):
        from converter import _write_inline_json
        from docir import InlineMath, NoteReference

        nodes = _write_inline_json([TextRun("x", RunProps()), NoteReference("endnote", 2, "lowerRoman"), InlineMath("a^2", ""), InlineMath(None, "a+b")])
        assert nodes == [
            {"type": "text", "text": "x"},
            {"type": "text", "text": "ii", "marks": [{"type": "superscript"}]},
            {"type": "inlineMath", "attrs": {"latex": "a^2"}},
            {"type": "text", "text": "a+b"},
        ]

    def test_content_the_writer_does_not_cover_yet_is_left_to_html(self):
        from converter import _write_inline_json
        from docir import DisplayMath, Fragment, PageBreak

        for item in (PageBreak(), DisplayMath("x"), Fragment("pictures", "<img/>")):
            assert _write_inline_json([TextRun("a", RunProps()), item]) is None

    def test_headings_and_their_style_marks(self):
        from converter import _write_paragraph_json

        node = _write_paragraph_json("font-size:14pt; font-weight:bold; font-style:italic; text-indent:0;", None,
                                     [{"type": "text", "text": "A "}, {"type": "text", "text": "B", "marks": [{"type": "bold"}]}], heading_level=2)
        assert node["type"] == "heading" and node["attrs"]["level"] == 2 and "captionKind" not in node["attrs"]
        assert node["content"] == [{"type": "text", "text": "A B", "marks": [{"type": "bold"}, {"type": "italic"}]}]
        light = _write_paragraph_json("font-weight:400", None, [{"type": "text", "text": "x"}], heading_level=1)
        assert light["content"] == [{"type": "text", "text": "x"}]


class TestSplitParagraphs:
    """A page break or display equation inside a paragraph splits it the way the browser parses the
    converter's HTML (editor_json_cases.py checks these against the real editor)."""

    def test_a_paragraph_closes_at_the_break_and_the_rest_loses_its_style(self):
        from converter import _write_split_paragraph_json
        from docir import PageBreak

        nodes = _write_split_paragraph_json([TextRun("A ", RunProps()), PageBreak(), TextRun(" B", RunProps())], "text-align:center;", None, None)
        assert [n["type"] for n in nodes] == ["paragraph", "pageBreak", "paragraph", "paragraph"]
        assert nodes[0]["attrs"]["textAlign"] == "center" and nodes[0]["content"] == [{"type": "text", "text": "A"}]
        assert nodes[2]["attrs"]["style"] is None and nodes[2]["content"] == [{"type": "text", "text": " B"}]  # a leading space stays
        assert "content" not in nodes[3]  # the paragraph's own </p> opens one more, empty

    def test_a_heading_splits_without_the_extra_paragraph_and_keeps_its_style_marks(self):
        from converter import _write_split_paragraph_json
        from docir import PageBreak

        nodes = _write_split_paragraph_json([TextRun("A", RunProps()), PageBreak(), TextRun("B", RunProps())], "font-weight:bold;", None, 2)
        assert [n["type"] for n in nodes] == ["heading", "pageBreak", "paragraph"]
        assert nodes[2]["content"] == [{"type": "text", "text": "B", "marks": [{"type": "bold"}]}]

    def test_nothing_after_the_break_opens_no_paragraph_for_it(self):
        from converter import _write_split_paragraph_json
        from docir import DisplayMath

        nodes = _write_split_paragraph_json([TextRun("A", RunProps()), DisplayMath("x", "2"), TextRun(" ", RunProps())], "", None, None)
        assert [n["type"] for n in nodes] == ["paragraph", "blockMath", "paragraph"]
        # Two spaces keep their width as a non-breaking space: that is content, so it opens a paragraph.
        kept = _write_split_paragraph_json([TextRun("A", RunProps()), DisplayMath("x"), TextRun("  ", RunProps())], "", None, None)
        assert [n["type"] for n in kept] == ["paragraph", "blockMath", "paragraph", "paragraph"]
        assert nodes[1]["attrs"] == {"latex": "x", "number": "2", "span": None}


def test_a_list_item_always_starts_with_a_paragraph():
    from converter import _close_list_item_json, _list_item_json

    empty = _list_item_json({"flat": "1"})
    _close_list_item_json(empty)
    assert [n["type"] for n in empty["content"]] == ["paragraph"] and "content" not in empty["content"][0]
    only_nested = _list_item_json({"flat": "1"})
    only_nested["content"].append({"type": "bulletList", "content": []})
    _close_list_item_json(only_nested)
    assert [n["type"] for n in only_nested["content"]] == ["paragraph", "bulletList"]


class TestTables:
    def _table(self, rows: int):
        from converter import _NOT_WRITTEN, _table

        document = docx.Document()
        table = document.add_table(rows=rows, cols=2)
        for r in range(rows):
            table.cell(r, 0).text = f"r{r}"
        html, node = _table(table, {})
        assert node is not _NOT_WRITTEN
        return html, node

    def test_cells_keep_the_cell_extras_and_an_empty_cell_holds_a_no_break_space(self):
        _, node = self._table(2)
        first, empty = node["content"][0]["content"]
        assert first["type"] == "tableCell" and first["attrs"]["rowspan"] == 1 and first["attrs"]["colspan"] == 1
        assert "padding-left" in first["attrs"]["style"]
        assert empty["content"] == [{"type": "paragraph", "attrs": empty["content"][0]["attrs"], "content": [{"type": "text", "text": "\u00a0"}]}]

    def test_one_row_keeps_its_row_group_and_several_rows_do_not(self):
        assert [n["type"] for n in self._table(1)[1]["content"]] == ["tableRowGroup"]
        assert [n["type"] for n in self._table(3)[1]["content"]] == ["tableRow"] * 3

    def test_table_attributes(self):
        html, node = self._table(2)
        assert node["attrs"] == {"alignment": "center", "columnSize": "50,50", "inset": None, "span": None}
        assert 'data-column-size="50,50"' in html

    def test_a_cell_paragraph_drops_margin_shorthand(self):
        from converter import _editor_style, _EDITOR_CELL_STYLE_PROPS

        assert _editor_style("margin:0; font-size:11pt;") == "font-size:11pt"
        assert _editor_style("padding:2px; min-height:20px; margin:0", _EDITOR_CELL_STYLE_PROPS) == "padding:2px; min-height:20px"


def test_a_box_hangs_on_the_paragraph_it_sits_in_even_after_a_text_box():
    """Regression: a text box's own paragraphs were counted, so later boxes landed on later paragraphs."""
    from converter import _extract_page_art

    textbox = '<page-art data-paragraph="0"><div><p>inside a text box</p><p>more</p></div></page-art>'
    hung = '<page-art data-paragraph="1" data-id="4"><img src="x"/></page-art>'
    html = f"<p>first{textbox}</p><p>second{hung}</p><p>third</p>"
    cleaned, art = _extract_page_art(html)
    assert cleaned == '<p>first</p><p data-overlay="4">second</p><p>third</p>'
    assert len(art) == 2
