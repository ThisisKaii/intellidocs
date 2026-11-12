"""PDF imports: repairs for what pdf2docx drops or garbles (links, word spacing, layout tables, side lines)."""
from pathlib import Path
import re
import sys

import docx
import pytest
from docx.oxml.ns import qn
from lxml import etree

REPO_ROOT = Path(__file__).resolve().parents[2]
ML_SRC = REPO_ROOT / "ml" / "src"
if str(ML_SRC) not in sys.path:
    sys.path.insert(0, str(ML_SRC))

from converter import (  # noqa: E402
    _flatten_section_marks,
    _keep_blank_pages,
    _merge_split_table_rows,
    _grid_from_cell_widths,
    _space_word_runs,
    _split_at_first_tab,
    _unnest_hyperlinks,
    _unwrap_layout_tables,
    convert_pdf_bytes_to_html,
)

DOCS = REPO_ROOT / "tests" / "fixtures" / "import_baselines" / "documents"
MEMO = DOCS / "DM_0440_s_26_SGOD_Conduct-of-World-Teachers-Day.pdf"
JOURNAL = DOCS / "0200725_[research]_9569504b.pdf"
IEEE = DOCS / "ieee_sample_paper.pdf"


def _run(paragraph, text: str):
    run = paragraph.add_run(text)
    return run._r


def _text(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


# ── unit: hyperlinks nested inside a run ────────────────────────────────────

def test_a_hyperlink_nested_in_a_run_is_lifted_to_the_paragraph() -> None:
    document = docx.Document()
    paragraph = document.add_paragraph("DOI: ")
    run = _run(paragraph, "")
    hyperlink = etree.SubElement(run, qn("w:hyperlink"))
    inner = etree.SubElement(hyperlink, qn("w:r"))
    etree.SubElement(inner, qn("w:t")).text = "https://doi.org/10.5281/x"
    assert _unnest_hyperlinks(document) == 1
    assert hyperlink.getparent() is paragraph._p
    assert run.getparent() is None  # the emptied wrapper run is gone


# ── unit: words drawn one at a time ─────────────────────────────────────────

def test_separate_word_runs_get_their_spaces_back() -> None:
    document = docx.Document()
    paragraph = document.add_paragraph()
    for word in ("b.", "provide", "teachers", "with", "meaningful"):
        _run(paragraph, word)
    _space_word_runs(document)
    assert paragraph.text == "b. provide teachers with meaningful"


def test_a_word_split_across_runs_stays_one_word() -> None:
    document = docx.Document()
    paragraph = document.add_paragraph()
    _run(paragraph, "with")
    _run(paragraph, "in")
    _run(paragraph, " reach")
    _space_word_runs(document)
    assert paragraph.text == "within reach"


def test_a_raised_marker_is_not_spaced_off_its_name() -> None:
    document = docx.Document()
    paragraph = document.add_paragraph()
    _run(paragraph, "Micabalo")
    marker = paragraph.add_run("3")
    marker.font.superscript = True
    _space_word_runs(document)
    assert paragraph.text == "Micabalo3"


# ── unit: layout tables ─────────────────────────────────────────────────────

def _table(document, rows, bordered: bool = False):
    table = document.add_table(rows=len(rows), cols=len(rows[0]))
    if bordered:
        table.style = "Table Grid"
        props = table._tbl.tblPr
        borders = etree.SubElement(props, qn("w:tblBorders"))
        edge = etree.SubElement(borders, qn("w:top"))
        edge.set(qn("w:val"), "single")
    for r, row in enumerate(rows):
        for c, text in enumerate(row):
            table.cell(r, c).text = text
    return table


def test_side_by_side_prose_stays_a_table() -> None:
    # An abstract beside its author sidebar: stacking the two made the page longer than the PDF.
    document = docx.Document()
    prose = ("Student satisfaction has become a vital measure of educational effectiveness, particularly in Junior High "
             "School, where students experience significant academic, social, and personal development.")
    sidebar = "gdeniega@uc.edu.ph University of Cebu Lapu-lapu and Mandaue rbachanicha@uc.edu.ph University of Cebu"
    _table(document, [[sidebar, prose]])
    assert _unwrap_layout_tables(document) == 0
    assert len(document.tables) == 1


def test_a_term_beside_its_definition_stays_a_table() -> None:
    document = docx.Document()
    definition = ("Refers to the technology that enables the system to analyze user inputs, learn individual formatting "
                  "preferences through behavioral learning, and provide intelligent formatting suggestions.")
    _table(document, [["Artificial Intelligence (AI)", definition]])
    assert _unwrap_layout_tables(document) == 0
    assert len(document.tables) == 1


def test_a_single_cell_frame_becomes_its_paragraph() -> None:
    document = docx.Document()
    _table(document, [["ABSTRACT"]])
    assert _unwrap_layout_tables(document) == 1
    assert document.paragraphs[-1].text == "ABSTRACT"


def test_data_tables_and_bordered_tables_are_kept() -> None:
    document = docx.Document()
    _table(document, [["Item", "Mean"], ["Teacher quality", "3.41"], ["Facilities", "2.98"]])
    _table(document, [["To:", "Assistant Schools Division Superintendent and all chiefs of the division offices"]], bordered=True)
    _table(document, [["YES", "NO"]])
    assert _unwrap_layout_tables(document) == 0
    assert len(document.tables) == 3


# ── integration on the fixture PDFs ─────────────────────────────────────────

@pytest.fixture(scope="module")
def memo() -> dict:
    if not MEMO.exists():
        pytest.skip("memo fixture missing")
    return convert_pdf_bytes_to_html(MEMO.read_bytes())


@pytest.fixture(scope="module")
def journal() -> dict:
    if not JOURNAL.exists():
        pytest.skip("journal fixture missing")
    return convert_pdf_bytes_to_html(JOURNAL.read_bytes())


def test_memo_number_written_on_the_blank_stays_on_the_blank(memo: dict) -> None:
    text = _text(memo["html"])
    assert re.search(r"No\. _+0440_+, s\. 2026", text), text[:400]
    assert "2026 0440" not in text


def test_memo_date_sits_on_the_office_line(memo: dict) -> None:
    office = re.search(r"<p[^>]*>(?:(?!</p>).)*Office of the Schools Division(?:(?!</p>).)*</p>", memo["html"], re.S)
    assert office is not None
    assert "September 29, 2026" in office.group(0)
    assert "data-tab" in office.group(0)


def test_memo_list_items_and_justified_words_are_spaced(memo: dict) -> None:
    text = _text(memo["html"])
    assert "a. recognize and celebrate" in text
    assert "b. provide teachers with meaningful opportunities" in text


def test_memo_links_survive(memo: dict) -> None:
    anchors = re.findall(r"<a [^>]*>(.*?)</a>", memo["html"], re.S)
    assert len(anchors) >= 2
    assert "mandaue.city001@deped.gov.ph" in _text(" ".join(anchors))


def test_journal_doi_link_and_affiliation_markers(journal: dict) -> None:
    html = journal["html"]
    assert re.search(r'<a href="https://doi\.org/10\.5281/zenodo\.19175586"', html)
    assert "Micabalo<sup>3</sup>" in re.sub(r"<span[^>]*>|</span>", "", html)


def test_journal_results_tables_keep_their_column_widths(journal: dict) -> None:
    # pdf2docx writes an equal grid; the real widths are on the cells (a narrow bullet column, a wide label column).
    sizes = [[float(v) for v in found.split(",")] for found in re.findall(r'data-column-size="([^"]*)"', journal["html"])]
    four_column = [row for row in sizes if len(row) == 4]
    assert four_column and any(max(row) > 2 * min(row) for row in four_column)


def test_journal_running_header_and_footer_are_kept(journal: dict) -> None:
    parts = journal.get("hf", {}).get("parts", {})
    assert "pdf_header" in parts and "pdf_footer" in parts
    assert "<img" in parts["pdf_header"]["flow"]


def test_two_column_papers_are_recognized() -> None:
    if not IEEE.exists() or not MEMO.exists():
        pytest.skip("fixtures missing")
    assert convert_pdf_bytes_to_html(IEEE.read_bytes()).get("two_column_body") is True
    assert not convert_pdf_bytes_to_html(MEMO.read_bytes()).get("two_column_body")


# ── Definition of Terms and page fit ────────────────────────────────────────

THESIS = DOCS / "V2 INTELLIDOCS (2) (1).pdf"


def _words(text: str) -> list:
    return re.findall(r"[a-z0-9]+", text.lower())


@pytest.mark.parametrize("name", [MEMO.name, JOURNAL.name, IEEE.name, THESIS.name])
def test_pdf_repairs_never_drop_text(name: str) -> None:
    import pymupdf

    path = DOCS / name
    if not path.exists():
        pytest.skip("fixture missing")
    data = path.read_bytes()
    source = _words(" ".join(page.get_text() for page in pymupdf.open(stream=data, filetype="pdf")))
    result = convert_pdf_bytes_to_html(data)
    kept = set(_words(_text(result["html"])))
    for part in (result.get("hf") or {}).get("parts", {}).values():
        kept |= set(_words(_text(part.get("flow", ""))))
    missing = [word for word in source if word not in kept and not word.isdigit()]
    assert len(missing) <= 0.02 * len(source), missing[:30]


def test_thesis_definition_of_terms_is_rebuilt_term_by_term() -> None:
    if not THESIS.exists():
        pytest.skip("thesis fixture missing")
    html = convert_pdf_bytes_to_html(THESIS.read_bytes())["html"]
    paragraphs = [_text(p) for p in re.findall(r"<p\b.*?</p>", html, re.S)]
    entry = next((p for p in paragraphs if p.strip().startswith("Artificial Intelligence (AI)")), None)
    assert entry is not None and "Refers to the technology that enables the system" in entry
    assert any(p.strip().startswith("Bulk Formatting Operations") and "Formatting changes applied" in p for p in paragraphs)
    # The run-in headings of Chapter II stand on their own lines again.
    assert any(p.strip() == "Machine Learning Prediction Engine" for p in paragraphs)


# ── page fit: grids, section marks, run-in headings, floats ─────────────────

def test_a_placeholder_grid_takes_its_cells_widths() -> None:
    document = docx.Document()
    table = document.add_table(rows=2, cols=3)
    for col in table._tbl.tblGrid.iterchildren(qn("w:gridCol")):
        col.set(qn("w:w"), "3000")
    widths = [[680, 5260, 3060], [680, 5260, 3060]]
    for r, row in enumerate(table.rows):
        for c, cell in enumerate(row.cells):
            tc_pr = cell._tc.get_or_add_tcPr()
            width = tc_pr.find(qn("w:tcW"))
            if width is None:
                width = etree.SubElement(tc_pr, qn("w:tcW"))
            width.set(qn("w:w"), str(widths[r][c]))
            width.set(qn("w:type"), "dxa")
    assert _grid_from_cell_widths(document) == 1
    assert [int(col.get(qn("w:w"))) for col in table._tbl.tblGrid.iterchildren(qn("w:gridCol"))] == [680, 5260, 3060]


def test_an_empty_section_mark_takes_no_height() -> None:
    document = docx.Document()
    mark = document.add_paragraph()._p
    etree.SubElement(mark.get_or_add_pPr(), qn("w:sectPr"))
    assert _flatten_section_marks(document, set()) == 1
    spacing = mark.find(qn("w:pPr") + "/" + qn("w:spacing"))
    assert (spacing.get(qn("w:after")), spacing.get(qn("w:line")), spacing.get(qn("w:lineRule"))) == ("0", "20", "exact")


def test_a_run_in_heading_splits_from_its_body() -> None:
    document = docx.Document()
    paragraph = document.add_paragraph()
    paragraph.add_run("Machine Learning Prediction Engine ")
    paragraph.add_run().add_break()
    paragraph.add_run("	The literature strongly supports the integration of machine learning.")
    head = _split_at_first_tab(paragraph._p)
    assert head is not None
    texts = [p.text for p in document.paragraphs]
    assert texts[-2].strip() == "Machine Learning Prediction Engine"
    assert texts[-1].startswith("The literature strongly supports")
    assert head.find(".//" + qn("w:br")) is None


def test_journal_logo_floats_beside_the_masthead(journal: dict) -> None:
    assert re.search(r'containerstyle="[^"]*float: right', journal["html"])


# ── sabotage fixture: blank pages, split rows, centred term lists ───────────

SABOTAGE = DOCS / "V2 INTELLIDOCS sabotage.pdf"


def test_a_page_left_blank_keeps_its_page() -> None:
    from docx.enum.section import WD_SECTION

    document = docx.Document()
    document.add_paragraph("Page one")
    document.add_section(WD_SECTION.NEW_PAGE)  # page two holds only its (stripped) number
    document.add_section(WD_SECTION.NEW_PAGE)
    document.add_paragraph("Page three")
    from converter import _page_break_paragraphs

    breaks = _page_break_paragraphs(document)
    assert _keep_blank_pages(document, breaks) >= 1


def test_rows_split_by_pdf2docx_are_joined() -> None:
    document = docx.Document()
    table = document.add_table(rows=3, cols=3)
    table.cell(0, 2).text = "22"
    table.cell(1, 0).text = "1"
    table.cell(1, 1).text = "COMPARATIVE MATRIX"
    table.cell(2, 0).text = "2"
    table.cell(2, 1).text = "FLOW OF THE STUDY"
    table.cell(2, 2).text = "26"
    assert _merge_split_table_rows(document) == 1
    assert [cell.text for cell in table.rows[0].cells] == ["1", "COMPARATIVE MATRIX", "22"]
    assert len(table.rows) == 2


def test_centred_definition_of_terms_is_rebuilt() -> None:
    if not SABOTAGE.exists():
        pytest.skip("sabotage fixture missing")
    html = convert_pdf_bytes_to_html(SABOTAGE.read_bytes())["html"]
    paragraphs = [_text(p).strip() for p in re.findall(r"<p\b.*?</p>", html, re.S)]
    assert any(p.startswith("Cognitive Load") and "The mental effort a user exerts" in p for p in paragraphs)
