"""TCASE-055 | Module 8: Import & Conversion | Unit: Import Conversion | Non-Error (Standard DOCX Import)

A user imports a university thesis manuscript (.docx; 31 pages in Microsoft Word) from the
dashboard: New document → Import from file.

Expected (as the app behaves): the document opens in the editor laid out like Word: the same
page count as Word (within one page), the body font of the .docx (Times New Roman), the page
margins of the .docx (left 1.5 in = 144 px, right 1 in = 96 px), the table borders exactly where
the .docx draws them (the bordered comparison table keeps every cell border; the borderless
lists of tables, figures and terms stay borderless), and the chapter headings as headings.
The Word figures come from tests/fixtures/import_baselines/word_truth (measured in Word).
"""

import json
import re
import zipfile

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import DOCUMENTS, FIXTURES, STUDENT, import_through_dashboard, settled_page_count, sign_in

NAME = "V2 INTELLIDOCS (2)"
SOURCE = DOCUMENTS / f"{NAME}.docx"
WORD = json.loads((FIXTURES / "import_baselines" / "word_truth" / f"{NAME}.json").read_text(encoding="utf-8"))

FACTS = """const pm = document.querySelector('.ProseMirror'); const s = getComputedStyle(pm); const fonts = {};
pm.querySelectorAll('p').forEach(p => { if (p.closest('table')) return; const f = getComputedStyle(p).fontFamily.split(',')[0].replace(/"/g, '').trim(); fonts[f] = (fonts[f] || 0) + p.textContent.length });
return {fonts, padLeft: s.paddingLeft, padRight: s.paddingRight,
  tables: [...pm.querySelectorAll('table')].map(t => [...t.querySelectorAll('td, th')].filter(c => { const b = getComputedStyle(c); return b.borderTopStyle !== 'none' && parseFloat(b.borderTopWidth) > 0 }).length),
  headings: [...pm.querySelectorAll('h1')].map(h => h.textContent.trim())};"""


def bordered_cells_in_docx() -> list[int]:
    """Per table, how many cells the .docx draws with a visible border."""
    xml = zipfile.ZipFile(SOURCE).read("word/document.xml").decode("utf-8")
    counts = []
    for table in re.findall(r"<w:tbl>.*?</w:tbl>", xml, re.S):
        table_borders = re.search(r"<w:tblBorders>(.*?)</w:tblBorders>", table, re.S)
        visible_table = bool(table_borders and re.search(r'w:val="(?!nil|none)', table_borders.group(1)))
        cells = re.findall(r"<w:tc>.*?</w:tc>", table, re.S)
        def bordered(cell: str) -> bool:
            own = re.search(r"<w:tcBorders>(.*?)</w:tcBorders>", cell, re.S)
            if own:
                return bool(re.search(r'<w:(?:top|left|bottom|right) w:val="(?!nil|none)', own.group(1)))
            return visible_table

        counts.append(sum(1 for cell in cells if bordered(cell)))
    return counts


def test_import_conversion_tcase_055(driver, student_api):
    sign_in(driver, STUDENT)
    doc_id, seconds = import_through_dashboard(driver, SOURCE)
    student_api.created_documents.append(doc_id)
    pages = settled_page_count(driver)
    facts = driver.execute_script(FACTS)
    body_font = max(facts["fonts"], key=facts["fonts"].get)
    print(f"imported in {seconds:.0f} s; {pages} pages (Word {WORD['pages']}); font {body_font}; margins {facts['padLeft']} / {facts['padRight']}; bordered cells {facts['tables']}")

    assert abs(pages - WORD["pages"]) <= 1, f"{pages} pages in the editor, {WORD['pages']} in Word"
    assert body_font == "Times New Roman", facts["fonts"]
    assert (facts["padLeft"], facts["padRight"]) == ("144px", "96px"), (facts["padLeft"], facts["padRight"])
    assert facts["tables"] == bordered_cells_in_docx(), f"bordered cells per table: editor {facts['tables']}, docx {bordered_cells_in_docx()}"
    for heading in ("CHAPTER I", "INTRODUCTION", "CHAPTER II", "REVIEW OF RELATED LITERATURE AND STUDIES"):
        assert heading in facts["headings"], f"{heading!r} is not a heading: {facts['headings'][:12]}"
    driver.execute_script("document.querySelector('.ProseMirror h1').scrollIntoView({block: 'start'})")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v", "-s"]))
