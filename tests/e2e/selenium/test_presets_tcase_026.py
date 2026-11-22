"""TCASE-026 | Module 3: TipTap Editor & Academic Presets | Unit: Presets | Non-Error (Apply APA 7th Preset)

A user picks "APA 7th Edition" from the Styles tab's presets. Expected (as the app behaves): the
editor confirms "Applied APA 7th Edition: 1in margins · Times New Roman 12pt · double spacing ·
0.5in first-line indent."; the page margins change to 1"; after "Apply to existing paragraphs",
body text is Times New Roman 12pt, double-spaced (2.0), with a 0.5" first-line indent.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, apply_preset_from_ribbon, click, open_document, page_and_text, sign_in, text_appears, visible

CONTENT = "<h1>Introduction</h1><p>Body paragraph of the study, long enough to show the indent and spacing.</p><p>Second paragraph.</p>"


def test_presets_tcase_026(driver, student_api):
    doc_id = student_api.create_document("TCASE-026 APA Preset", CONTENT)
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    apply_preset_from_ribbon(driver, "APA 7th Edition")

    assert text_appears(driver, "Applied APA 7th Edition: 1in margins"), "no confirmation"
    assert text_appears(driver, "Times New Roman 12pt")
    click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Apply to existing paragraphs')]"))

    page = page_and_text(driver)
    assert page["left"] == "96px" and page["right"] == "96px", f"margins are not 1in: {page}"  # 1in = 96px
    assert "Times New Roman" in page["font"] and page["size"] == "16px", f"body is not TNR 12pt: {page}"
    assert page["line"] == "32px", f"body is not double-spaced: {page}"  # 2.0 x 12pt
    assert page["indent"] == "48px", f"first-line indent is not 0.5in: {page}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
