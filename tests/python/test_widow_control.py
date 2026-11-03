"""Widow/orphan rules follow the document's own setting.

Word applies them unless a document turns w:widowControl off. Three of the sample files do, and
applying the rules to one of them added two pages; honouring the setting helps the files that use it.
"""
import sys
from io import BytesIO
from pathlib import Path

import docx
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ml" / "src"))
from converter import convert_docx_bytes_to_html  # noqa: E402


def result_for(setting: str | None) -> dict:
    """Convert a document whose default paragraph style has the given w:widowControl value."""
    doc = docx.Document()
    doc.add_paragraph("Body text.")
    style = doc.styles["Normal"].element
    for old in style.iter(qn("w:widowControl")):
        old.getparent().remove(old)
    defaults = doc.styles.element.find(qn("w:docDefaults"))
    for old in list(defaults.iter(qn("w:widowControl"))):
        old.getparent().remove(old)
    if setting is not None:
        element = OxmlElement("w:widowControl")
        element.set(qn("w:val"), setting)
        style.get_or_add_pPr().append(element)
    buffer = BytesIO()
    doc.save(buffer)
    return convert_docx_bytes_to_html(buffer.getvalue())


def test_word_applies_the_rules_unless_told_otherwise() -> None:
    assert result_for(None)["flow_rules"] is True


def test_a_document_that_turns_them_off_does_not_get_them() -> None:
    assert "flow_rules" not in result_for("0")


def test_an_explicit_setting_is_honoured() -> None:
    assert result_for("1")["flow_rules"] is True
