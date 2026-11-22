"""TCASE-043 | Module 5: Grammar & Spell Checking | Unit: Grammar & Spell Checking | Non-Error (Quick Fix)

A grammar issue the checker flags ("This are the findings of the study.") is clicked in the
document. Expected (as the app behaves): clicking the red underline opens that issue in the
Suggestions panel with the correction ("this are → this is", "Possible subject-verb agreement
issue") and Accept / Dismiss; Accept replaces the words in one step, keeping the sentence's
capital letter, and a single Undo (Ctrl+Z) restores the original.
"""

import time

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from selenium_helpers import ACCEPT_CARD, FIGURES, STUDENT, click, open_document, sign_in, visible, wait_for

SENTENCE = "This are the findings of the study."


def first_paragraph(driver) -> str:
    return driver.find_elements(By.CSS_SELECTOR, ".ProseMirror p")[0].text


def test_grammar_spell_checking_tcase_043(driver, student_api):
    doc_id = student_api.create_document("TCASE-043 Quick Fix", f"<h1>Results</h1><p>{SENTENCE}</p>")
    sign_in(driver, STUDENT)
    editor = open_document(driver, doc_id)

    issue = visible(driver, By.CSS_SELECTOR, ".ProseMirror .grammar-issue.grammar-kind-grammar", timeout=45)
    assert issue.text == "This are"
    click(driver, issue)

    card = visible(driver, By.XPATH, ACCEPT_CARD)
    assert "this is" in card.text.lower() and "subject-verb" in card.text.lower(), card.text
    click(driver, card.find_element(By.XPATH, ".//button[normalize-space()='Accept']"))

    wait_for(driver, lambda d: first_paragraph(d).startswith("This is the findings"), message="the fix was not applied (or lost the capital letter)")
    assert not driver.find_elements(By.CSS_SELECTOR, ".ProseMirror .grammar-issue.grammar-kind-grammar")
    time.sleep(1)
    driver.save_screenshot(str(FIGURES / "test_grammar_spell_checking_tcase_043_applied.png"))

    editor.send_keys(Keys.CONTROL, "z")
    time.sleep(0.6)
    assert first_paragraph(driver) == SENTENCE, f"one undo did not restore the sentence: {first_paragraph(driver)!r}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
