"""Word's character scale (w:w) gives a run the same line width through letter spacing.

Word stretches the glyphs of a run scaled to, say, 110%. Ignoring that made the lines of two sample memos
(449 and 4,500+ scaled runs) wrap late. Each run's extra width is worked out from its own text in its own
font, because one figure for all text put bold and regular lines out in opposite directions.
"""
import re
import sys
from io import BytesIO
from pathlib import Path

import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ml" / "src"))
from converter import _JUSTIFIED_TRACKING, _text_width_em, convert_docx_bytes_to_html  # noqa: E402

TEXT = "The Department of Education"


def tracking(scale: str | None, bold: bool = False, justified: bool = False, spacing: str | None = None) -> float:
    """The letter spacing (pt) of a one-run document, 0 when it has none."""
    doc = docx.Document()
    paragraph = doc.add_paragraph()
    if justified:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    run = paragraph.add_run(TEXT)
    run.font.name = "Bookman Old Style"
    run.font.size = Pt(11)
    run.bold = bold
    r_pr = run._element.get_or_add_rPr()
    if scale:
        element = OxmlElement("w:w")
        element.set(qn("w:val"), scale)
        r_pr.append(element)
    if spacing:
        element = OxmlElement("w:spacing")
        element.set(qn("w:val"), spacing)
        r_pr.append(element)
    buffer = BytesIO()
    doc.save(buffer)
    found = re.search(r"letter-spacing:(-?[\d.]+)pt", convert_docx_bytes_to_html(buffer.getvalue())["html"])
    return float(found.group(1)) if found else 0.0


def test_a_run_gets_the_extra_width_of_its_scale_across_its_characters() -> None:
    natural = _text_width_em(TEXT, "Bookman Old Style", False, False) * 11
    assert abs(tracking("110") * len(TEXT) - natural * 0.10) < 0.05


def test_full_scale_adds_nothing() -> None:
    assert tracking("100") == 0.0
    assert tracking(None) == 0.0


def test_bold_text_is_measured_as_bold() -> None:
    assert tracking("110", bold=True) > tracking("110")


def test_a_narrowed_run_gets_negative_spacing() -> None:
    assert tracking("90") < 0


def test_character_spacing_adds_to_it() -> None:
    assert abs(tracking("110", spacing="20") - (tracking("110") + 1.0)) < 0.01


def test_justified_text_is_set_tighter_for_justification_to_widen() -> None:
    assert abs(tracking("110", justified=True) - tracking("110") * _JUSTIFIED_TRACKING) < 0.01


def test_an_unknown_font_still_gets_a_width() -> None:
    assert _text_width_em("abc", "No Such Font", False, False) > 0
    assert _text_width_em("日本", "Arial", False, False) == 1.0  # outside the table: half an em each
