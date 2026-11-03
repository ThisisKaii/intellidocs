"""East Asian theme font references resolve the way Word resolves them.

Regression: `w:asciiTheme="minorEastAsia"` used to be read as the Latin minor font, so a table of
contents Word sets in MS Mincho got Cambria's line height. Each line came out 1.2pt short, and every
later page of a 33-page document fell out of step with Word.
"""
import sys
from io import BytesIO
from pathlib import Path

import docx
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ml" / "src"))
from converter import _FONT_LINE_FACTORS, _rfonts_name, _theme_fonts, convert_docx_bytes_to_html  # noqa: E402


def document(language: str | None = "ja-JP") -> docx.Document:
    """A document whose settings name the given East Asian theme language."""
    doc = docx.Document()
    settings = doc.settings.element
    for old in settings.findall(qn("w:themeFontLang")):
        settings.remove(old)
    if language:
        lang = OxmlElement("w:themeFontLang")
        lang.set(qn("w:val"), "en-US")
        lang.set(qn("w:eastAsia"), language)
        settings.append(lang)
    return reloaded(doc)


def reloaded(doc: docx.Document) -> docx.Document:
    """The document as it reads from a saved file, which is how imports see it."""
    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return docx.Document(buffer)


def fonts_element(theme: str) -> OxmlElement:
    element = OxmlElement("w:rFonts")
    element.set(qn("w:asciiTheme"), theme)
    return element


def test_east_asian_reference_uses_the_entry_for_the_documents_language():
    doc = document("ja-JP")
    assert _rfonts_name(fonts_element("minorEastAsia"), doc.part) == "MS Mincho"
    assert _rfonts_name(fonts_element("majorEastAsia"), doc.part) == "MS Gothic"


def test_each_east_asian_language_reads_its_own_entry():
    assert _theme_fonts(document("zh-CN").part)["minorEastAsia"] == "SimSun"
    assert _theme_fonts(document("zh-TW").part)["minorEastAsia"] == "PMingLiU"
    assert _theme_fonts(document("ko-KR").part)["minorEastAsia"] == "Malgun Gothic"


def test_without_a_language_it_falls_back_to_the_latin_theme_font():
    doc = document(None)
    assert _rfonts_name(fonts_element("minorEastAsia"), doc.part) == _theme_fonts(doc.part)["minor"]


def test_latin_references_are_unchanged():
    doc = document("ja-JP")
    assert _rfonts_name(fonts_element("minorHAnsi"), doc.part) == _theme_fonts(doc.part)["minor"]
    assert _rfonts_name(fonts_element("majorHAnsi"), doc.part) == _theme_fonts(doc.part)["major"]


def test_a_mincho_paragraph_gets_words_line_height():
    doc = docx.Document()
    settings = doc.settings.element
    for old in settings.findall(qn("w:themeFontLang")):
        settings.remove(old)
    lang = OxmlElement("w:themeFontLang")
    lang.set(qn("w:eastAsia"), "ja-JP")
    settings.append(lang)
    paragraph = doc.add_paragraph()
    run = paragraph.add_run("Software Engineering Methodology")
    run.font.size = docx.shared.Pt(11)
    run._element.get_or_add_rPr().insert(0, fonts_element("minorEastAsia"))
    paragraph.paragraph_format.line_spacing = 1.5
    buffer = BytesIO()
    doc.save(buffer)

    html = convert_docx_bytes_to_html(buffer.getvalue())["html"]

    assert "MS Mincho" in html
    assert f"line-height:{round(1.5 * _FONT_LINE_FACTORS['ms mincho'], 3)}" in html.replace(" ", "")
