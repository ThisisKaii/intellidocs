"""A long manuscript is split into document tabs on import: by chapter, then again where a tab is long."""
import io
import re
import sys
from pathlib import Path

import docx
from docx.enum.text import WD_BREAK

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml" / "src"))

import tab_plan  # noqa: E402
from tab_plan import Block  # noqa: E402
from converter import convert_docx_bytes_to_html  # noqa: E402

PAGE = "x" * tab_plan.CHARS_PER_PAGE


def body(pages: int) -> list:
    return [Block(PAGE) for _ in range(pages)]


def titles(plan: dict) -> list:
    return [plan[start] for start in sorted(plan)]


def test_a_short_document_is_left_whole():
    blocks = [Block("CHAPTER I")] + body(40) + [Block("CHAPTER II")] + body(40)
    assert tab_plan.plan_tabs(blocks) == {}


def test_a_long_thesis_splits_into_front_matter_chapters_and_back_matter():
    blocks = (
        [Block("Title page")] + body(5)
        + [Block("CHAPTER I", heading=1), Block("INTRODUCTION", heading=1)] + body(50)
        + [Block("CHAPTER II", heading=1), Block("REVIEW OF RELATED LITERATURE", heading=1)] + body(50)
        + [Block("CHAPTER III: METHODS", heading=1)] + body(50)
        + [Block("REFERENCES", heading=1)] + body(5)
    )
    plan = tab_plan.plan_tabs(blocks)
    assert titles(plan) == [
        "Front matter",
        "Chapter 1: Introduction",
        "Chapter 2: Review of Related Literature",
        "Chapter 3: Methods",
        "References",
    ]
    assert sorted(plan)[1] == 6


def test_contents_lines_do_not_open_chapters():
    contents = [Block("CHAPTER I\tINTRODUCTION", has_tab=True), Block("CHAPTER II: METHODS 12")]
    blocks = contents + [Block("CHAPTER I")] + body(55) + [Block("CHAPTER II")] + body(55) + [Block("CHAPTER III")] + body(55)
    assert titles(tab_plan.plan_tabs(blocks)) == ["Front matter", "Chapter 1", "Chapter 2", "Chapter 3"]


def test_a_long_chapter_splits_again_at_its_section_headings():
    sections = []
    for number in range(1, 5):
        sections += [Block(f"3.{number} Section {number}", heading=2)] + body(40)
    blocks = [Block("CHAPTER I")] + body(20) + [Block("CHAPTER II")] + body(10) + [Block("CHAPTER III")] + body(1) + sections
    plan = tab_plan.plan_tabs(blocks)
    assert titles(plan)[2:] == ["Chapter 3", "3.2 Section 2", "3.3 Section 3", "3.4 Section 4"]
    assert all(sum(b.pages() for b in blocks[s:e]) <= tab_plan.MAX_TAB_PAGES + tab_plan.MIN_TAB_PAGES
               for s, e in zip(sorted(plan), sorted(plan)[1:] + [len(blocks)]))


def test_small_sections_are_merged_and_a_title_line_never_stands_alone():
    sections = []
    for number in range(1, 9):
        sections += [Block(f"Section {number}", heading=2)] + body(19)
    blocks = [Block("CHAPTER I")] + body(20) + [Block("CHAPTER II"), Block("RESULTS", heading=1)] + sections
    plan = tab_plan.plan_tabs(blocks)
    pages = [sum(b.pages() for b in blocks[s:e]) for s, e in zip(sorted(plan), sorted(plan)[1:] + [len(blocks)])]
    assert min(pages) >= tab_plan.MIN_TAB_PAGES
    # Chapter 1, then chapter 2's eight 19-page sections three to a tab; the title line joins the first.
    assert titles(plan) == ["Chapter 1", "Chapter 2: Results", "Section 4", "Section 7"]


def test_a_chapter_without_headings_is_cut_into_numbered_parts():
    blocks = [Block("CHAPTER I")] + body(10) + [Block("CHAPTER II")] + body(10) + [Block("APPENDIX D")] + body(170)
    plan = tab_plan.plan_tabs(blocks)
    assert titles(plan) == ["Chapter 1", "Chapter 2", "Appendix D (part 1)", "Appendix D (part 2)", "Appendix D (part 3)"]


def test_captions_styled_as_headings_never_name_a_tab():
    sections = []
    for number in range(1, 4):
        sections += [Block(f"Figure {number}: Screen {number}", heading=2)] + body(55)
    blocks = [Block("CHAPTER I")] + body(10) + [Block("CHAPTER II")] + body(1) + sections
    assert titles(tab_plan.plan_tabs(blocks))[1:] == ["Chapter 2 (part 1)", "Chapter 2 (part 2)", "Chapter 2 (part 3)"]


def test_neighbouring_stub_appendices_share_a_tab():
    blocks = [Block("CHAPTER I")] + body(55) + [Block("CHAPTER II")] + body(55) + [Block("CHAPTER III")] + body(55)
    for letter in "ABC":
        blocks += [Block(f"APPENDIX {letter}")] + body(1)
    blocks += [Block("APPENDIX D")] + body(20)
    assert titles(tab_plan.plan_tabs(blocks))[3:] == ["Appendices A–C", "Appendix D"]


def test_a_long_document_without_chapters_splits_by_size():
    plan = tab_plan.plan_tabs(body(200))
    assert titles(plan) == [f"Document (part {n})" for n in range(1, 5)]


# ─── Through the converter ────────────────────────────────────────────────────

FILLER = "This sentence fills the chapter with enough text to count as a page of a thesis. " * 22


def thesis_docx() -> bytes:
    d = docx.Document()
    d.add_paragraph("A THESIS")
    for number, title in [("I", "INTRODUCTION"), ("II", "LITERATURE"), ("III", "METHODS")]:
        d.paragraphs[-1].add_run().add_break(WD_BREAK.PAGE)
        d.add_paragraph(f"CHAPTER {number}", style="Heading 1")
        d.add_paragraph(title, style="Heading 1")
        d.add_paragraph("A list item", style="List Bullet")
        for _ in range(55):
            d.add_paragraph(FILLER)
    d.paragraphs[-1].add_run().add_break(WD_BREAK.PAGE)
    d.add_paragraph("REFERENCES", style="Heading 1")
    d.add_paragraph("Author, A. (2020). A book.")
    buffer = io.BytesIO()
    d.save(buffer)
    return buffer.getvalue()


def test_the_converter_marks_the_same_tabs_in_its_html_and_json():
    data = thesis_docx()
    result = convert_docx_bytes_to_html(data, split_tabs=True)
    html_titles = re.findall(r'<div data-tab-break="" data-tab-id="" data-title="([^"]*)"></div>', result["html"])
    nodes = result["content_json"]["content"]
    json_titles = [node["attrs"]["title"] for node in nodes if node["type"] == "tabBreak"]
    assert html_titles == json_titles == [
        "Front matter", "Chapter 1: Introduction", "Chapter 2: Literature", "Chapter 3: Methods", "References",
    ]
    # Each chapter's own page break is inside its tab: the marker comes first.
    for title in html_titles[1:]:
        at = result["html"].index(f'data-title="{title}"')
        assert result["html"][at:at + 200].count('<hr class="page-break"') == 1
    assert nodes[0]["type"] == "tabBreak"
    # Without the option the document is unchanged.
    assert "data-tab-break" not in convert_docx_bytes_to_html(data)["html"]
