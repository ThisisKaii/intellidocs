"""PDF import repairs: side-by-side signature lines, cells pdf2docx wrongly merged, centred paragraphs."""
import os
import re
import sys

import docx
import pymupdf
from docx.oxml import parse_xml

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))

from converter import (  # noqa: E402
    _centred_line_run,
    _drop_false_vertical_merges,
    convert_pdf_bytes_to_html,
)

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def approval_sheet_pdf() -> bytes:
    """Two people signing side by side, each title on the line under its name."""
    document = pymupdf.open()
    page = document.new_page(width=612, height=792)
    page.insert_text((108, 90), "This study has been examined and is recommended for approval and acceptance.", fontsize=11)
    page.insert_text((108, 140), "RECOMMENDED:", fontsize=11)
    page.insert_text((108, 180), "MS. GIAN S. MAHUSAY", fontsize=11, fontname="Times-Bold")
    page.insert_text((360, 180), "ALEXANDER Y. BUCOL, ED. D.EM", fontsize=11, fontname="Times-Bold")
    page.insert_text((125, 198), "Adviser", fontsize=11)
    page.insert_text((396, 198), "IT Research Coordinator", fontsize=11)
    page.insert_text((108, 260), "APPROVED by the Examining Tribunal on Proposal Hearing.", fontsize=11)
    return document.tobytes()


def text_of(html: str) -> str:
    """Visible text with tabs and line breaks marked."""
    html = re.sub(r"<span data-tab[^>]*></span>", "\t", html)
    html = re.sub(r"<br\s*/?>", "\n", html)
    return re.sub(r"<[^>]+>", "", html)


def test_side_by_side_signatures_keep_their_rows_and_columns() -> None:
    # Whatever pdf2docx does with this simple page, the import keeps names and titles apart.
    text = text_of(convert_pdf_bytes_to_html(approval_sheet_pdf())["html"])
    assert "MAHUSAYALEXANDER" not in text.replace(" ", "")
    assert text.index("IT Research Coordinator") > text.index("Adviser") > text.index("ALEXANDER")


def paragraph_marks(p) -> str:
    """The paragraph's text with <TAB> and <BR> where its tabs and line breaks are."""
    out = []
    for node in p.iter():
        tag = node.tag.split("}")[1]
        if tag == "t":
            out.append(node.text or "")
        elif tag == "tab" and node.getparent().tag.endswith("}r"):
            out.append("<TAB>")
        elif tag == "br":
            out.append("<BR>")
    return "".join(out)


def test_signature_rows_pdf2docx_ran_together_are_rebuilt() -> None:
    """The real thesis case: pdf2docx wrote both printed lines as one, the names run together."""
    from converter import _restore_column_rows_from_pdf

    doc = docx.Document()
    section = doc.sections[0]
    section.left_margin = section.right_margin = 914400  # 1in
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = 457200  # 0.5in: text starts at 108pt, as in the PDF
    for text in ("MS. GIAN S. MAHUSAY", "ALEXANDER Y. BUCOL, ED. D.EM ", None, " Adviser ", None, "IT Research Coordinator "):
        run = p.add_run()
        if text is None:
            run._r.append(parse_xml(f"<w:tab {W}/>"))
        else:
            run.text = text
    assert paragraph_marks(p._p) == "MS. GIAN S. MAHUSAYALEXANDER Y. BUCOL, ED. D.EM <TAB> Adviser <TAB>IT Research Coordinator "

    assert _restore_column_rows_from_pdf(doc, approval_sheet_pdf(), set()) == 1
    assert paragraph_marks(p._p) == "MS. GIAN S. MAHUSAY<TAB>ALEXANDER Y. BUCOL, ED. D.EM <BR> Adviser <TAB>IT Research Coordinator "
    # A tab stop where the right-hand name starts (360pt on the page = 288pt from the margin).
    stops = [int(t.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pos")) for t in p._p.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tab") if t.getparent().tag.endswith("}tabs")]
    assert any(abs(stop - 288 * 20) <= 40 for stop in stops), stops


def test_wrapped_prose_is_left_alone() -> None:
    from converter import _restore_column_rows_from_pdf

    document = pymupdf.open()
    page = document.new_page(width=612, height=792)
    page.insert_text((108, 90), "The ongoing process by which a system refines its formatting", fontsize=11)
    page.insert_text((108, 104), "predictions over time by learning from each user's acceptance.", fontsize=11)
    doc = docx.Document()
    doc.sections[0].left_margin = 914400
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = 457200
    p.add_run("The ongoing process by which a system refines its formatting ")
    p.add_run("predictions over time by learning from each user's acceptance.")
    assert _restore_column_rows_from_pdf(doc, document.tobytes(), set()) == 0
    assert "<BR>" not in paragraph_marks(p._p)


def test_a_continuation_cell_that_holds_text_is_unmerged() -> None:
    doc = docx.Document()
    table = doc.add_table(rows=2, cols=2)
    header, entry = table.rows[0].cells[0], table.rows[1].cells[0]
    header._tc.get_or_add_tcPr().append(parse_xml(f'<w:vMerge {W} w:val="restart"/>'))
    entry._tc.get_or_add_tcPr().append(parse_xml(f"<w:vMerge {W}/>"))
    entry.text = "1"
    empty = table.rows[1].cells[1]
    empty._tc.get_or_add_tcPr().append(parse_xml(f"<w:vMerge {W}/>"))

    assert _drop_false_vertical_merges(doc) == 1
    tags = lambda cell: [child.tag.split("}")[1] for child in cell._tc.tcPr]  # noqa: E731
    assert "vMerge" not in tags(entry)
    assert "vMerge" in tags(empty)  # an empty continuation is a real merge


def test_centred_lines_with_a_first_line_indent_are_centred() -> None:
    # (left gap, right gap) of each printed line: the first sits right by its 36pt indent.
    gaps = [(50.2, 11.6), (5.1, 2.4), (7.2, 4.8), (10.6, 8.4), (90.0, 88.0)]
    assert _centred_line_run(gaps) == 36.0 or abs(_centred_line_run(gaps) - 36.0) < 3


def test_justified_lines_are_not_centred() -> None:
    gaps = [(36.0, 0.4), (0.0, 0.3), (0.0, 0.2), (0.0, 0.5), (0.0, 120.0)]
    assert _centred_line_run(gaps) is None


def test_a_centred_caption_over_a_justified_paragraph_is_not_centred() -> None:
    gaps = [(150.0, 149.0), (36.2, 0.4), (0.1, 0.3), (0.2, 0.2), (0.0, 0.5)]
    assert _centred_line_run(gaps) is None
