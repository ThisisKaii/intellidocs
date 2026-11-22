"""TCASE-025 | Module 3: TipTap Editor & Academic Presets | Unit: Presets | Non-Error (Apply IEEE Preset)

A user picks "IEEE Conference" from the Styles tab's presets. Expected (as the app behaves): the
editor confirms "Applied IEEE Conference: margins 0.75in top, 1in bottom, 0.63in left, 0.63in
right · Times New Roman 10pt · 1.15 line spacing · 0.25in first-line indent."; the page's side
margins change to 0.625"; after "Apply to existing paragraphs", body text is Times New Roman 10pt
with 1.15 line spacing and a 0.25" first-line indent, and headings are in small capitals. The
preset's page setup is saved with the document: after a reload the margins are still the IEEE ones.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, apply_preset_from_ribbon, click, open_document, page_and_text, sign_in, text_appears, visible, wait_for

IEEE_MARGINS = {"top": 0.75, "bottom": 1, "left": 0.625, "right": 0.625}

CONTENT = "<h1>Introduction</h1><p>Body paragraph of the study, long enough to show the indent and spacing.</p><h2>Related Work</h2><p>Second paragraph.</p>"


def test_presets_tcase_025(driver, student_api):
    doc_id = student_api.create_document("TCASE-025 IEEE Preset", CONTENT)
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    apply_preset_from_ribbon(driver, "IEEE Conference")

    assert text_appears(driver, "Applied IEEE Conference: margins 0.75in top, 1in bottom, 0.63in left, 0.63in right"), "no confirmation"
    assert text_appears(driver, "Times New Roman 10pt")
    click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Apply to existing paragraphs')]"))

    page = page_and_text(driver)
    assert page["left"] == "60px" and page["right"] == "60px", f"side margins are not 0.625in: {page}"  # 0.625in = 60px
    assert "Times New Roman" in page["font"] and page["size"] == "13.3333px", f"body is not TNR 10pt: {page}"
    assert page["line"] == "15.3333px", f"line spacing is not 1.15: {page}"  # 1.15 x 10pt
    assert page["indent"] == "24px", f"first-line indent is not 0.25in: {page}"
    assert page["headingCaps"] == "small-caps", f"headings are not small caps: {page}"

    # The page setup is saved, not only shown.
    wait_for(driver, lambda d: student_api.call("GET", f"/documents/{doc_id}").json().get("margins") == IEEE_MARGINS,
             timeout=60, message="the preset's margins were not saved")
    open_document(driver, doc_id)
    reopened = page_and_text(driver)
    assert reopened["left"] == "60px" and reopened["right"] == "60px", f"margins after reloading: {reopened}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
