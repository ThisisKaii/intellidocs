"""PDF imports: table cell text flows again instead of keeping every PDF line as a forced break."""
import os
import sys

import docx
from docx.oxml.ns import qn

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))

from converter import _joins_without_space, _reflow_pdf_table_cells  # noqa: E402


def test_a_word_cut_by_a_pdf_line_break_is_joined() -> None:
    assert _joins_without_space("Behavi ", "oral Tracking")
    assert _joins_without_space("Extract", "ion")
    assert _joins_without_space("Barka", "n et al.")
    assert _joins_without_space("learnin", "g")


def test_two_words_on_two_lines_stay_two_words() -> None:
    assert not _joins_without_space("machine ", "learning")
    assert not _joins_without_space("the ", "data")
    assert not _joins_without_space("based ", "on")
    assert not _joins_without_space("& ", "Feature")
    assert not _joins_without_space("(Singh et al., ", "2023)")


def build_pdf_like_table() -> docx.Document:
    """A one-cell table as pdf2docx writes it: forced line breaks, padding-like indent, fake centring."""
    document = docx.Document()
    table = document.add_table(rows=1, cols=1)
    cell = table.cell(0, 0)
    paragraph = cell.paragraphs[0]
    for index, piece in enumerate(["Behavi ", "oral Tracki", "ng & Feature ", "Extraction"]):
        run = paragraph.add_run(piece)
        if index < 3:
            run.add_break()
    paragraph.paragraph_format.left_indent = docx.shared.Pt(7.2)
    paragraph.paragraph_format.space_before = docx.shared.Pt(53)
    row = table.rows[0]
    row.height = docx.shared.Pt(156)
    row.height_rule = docx.enum.table.WD_ROW_HEIGHT_RULE.EXACTLY
    return document


def test_cell_text_flows_and_layout_fakes_are_undone() -> None:
    document = build_pdf_like_table()
    joined = _reflow_pdf_table_cells(document)
    cell = document.tables[0].cell(0, 0)
    paragraph = cell.paragraphs[0]
    assert joined == 3
    assert paragraph.text == "Behavioral Tracking & Feature Extraction"
    assert not list(paragraph._element.iter(qn("w:br")))
    assert paragraph.paragraph_format.left_indent == 0
    assert paragraph.paragraph_format.space_before == 0
    assert cell._tc.find(qn("w:tcPr") + "/" + qn("w:vAlign")).get(qn("w:val")) == "center"
    assert document.tables[0].rows[0].height_rule == docx.enum.table.WD_ROW_HEIGHT_RULE.AT_LEAST
