"""TCASE-058 | Module 8: Import & Conversion | Unit: Import Conversion | Non-Error (PDF Survey Repair)

A user imports a dense survey questionnaire PDF whose lines are drawn word by word with no space
characters (the way justified PDF text is often written), with each numbered question's label
("1.") glued to its first word, followed by a rating row "[1] [2] [3] [4]".

Expected (as the app behaves): the PDF is normalised to Word structure (pdf2docx) and repaired:
the spaces between words are restored (dictionary check: "provide teachers with", never
"provideteacherswith"), every enumeration label is separated from its question ("1. I use ..."),
each question stays its own paragraph, and the rating row "[1] [2] [3] [4]" stays on its own
line below the question, as in the PDF (the converter keeps it in the question's paragraph and
reproduces the PDF's line break with the paragraph's right indent).
"""

import pymupdf
import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, import_through_dashboard, sign_in

QUESTIONS = [
    "I use online modules to provide teachers with meaningful feedback every week.",
    "The school provides stable internet access for teachers and learners.",
    "I can submit learning reports on time using the online platform.",
    "Training sessions helped me design assessments for remote learners.",
]


def survey_pdf(path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 72), "TEACHER SURVEY QUESTIONNAIRE", fontsize=13, fontname="tibo")
    page.insert_text((72, 96), "Directions: Rate each statement from 1 (Strongly Disagree) to 4 (Strongly Agree).", fontsize=10, fontname="tiro")
    y = 130
    for number, question in enumerate(QUESTIONS, 1):
        x = 72
        for token in [f"{number}."] + question.split():  # one text object per word, no space glyphs
            page.insert_text((x, y), token, fontsize=11, fontname="tiro")
            x += pymupdf.get_text_length(token, fontname="tiro", fontsize=11) + 3.2
        page.insert_text((72, y + 16), "[1]  [2]  [3]  [4]", fontsize=10, fontname="tiro")
        y += 44
    doc.save(path)


def test_import_conversion_tcase_058(driver, student_api, tmp_path):
    source = tmp_path / "tcase058_survey_questionnaire.pdf"
    survey_pdf(source)
    # The PDF's own glyphs (plain-text extraction would invent spaces from the gaps).
    glyphs = [c["c"] for block in pymupdf.open(source)[0].get_text("rawdict", flags=pymupdf.TEXT_INHIBIT_SPACES)["blocks"] for line in block.get("lines", [])
              for span in line["spans"] if span["origin"][1] > 120 and "[" not in "".join(ch["c"] for ch in span["chars"]) for c in span["chars"]]
    assert glyphs and " " not in glyphs, "the question lines should be drawn without space glyphs"

    sign_in(driver, STUDENT)
    doc_id, _ = import_through_dashboard(driver, source)
    student_api.created_documents.append(doc_id)
    paragraphs = [p.text.strip() for p in driver.find_elements(By.CSS_SELECTOR, ".ProseMirror p, .ProseMirror li") if p.text.strip()]
    print(paragraphs)

    for number, question in enumerate(QUESTIONS, 1):
        expected = f"{number}. {question}"
        assert any(p.replace(" ", " ").startswith(expected[:-1]) for p in paragraphs), f"{expected!r} not found as its own paragraph"
    assert not any("provideteachers" in p or "1.I" in p for p in paragraphs), "fused words were not repaired"
    on_own_line = driver.execute_script("""return [...document.querySelectorAll('.ProseMirror p')].filter(p => p.textContent.includes('[1]')).map(p => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let node, first = null, rating = null;
        while ((node = walker.nextNode())) { if (!first && node.textContent.trim()) first = node; if (node.textContent.includes('[1]')) { rating = node; break } }
        const top = n => { const r = document.createRange(); r.selectNodeContents(n); return r.getClientRects()[0].top };
        const at = document.createRange(); const i = rating.textContent.indexOf('[1]'); at.setStart(rating, i); at.setEnd(rating, i + 3);
        return at.getClientRects()[0].top > top(first) + 4;
    })""")
    assert on_own_line == [True] * len(QUESTIONS), f"rating rows not on their own line below the questions: {on_own_line}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v", "-s"]))
