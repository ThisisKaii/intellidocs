"""TCASE-053 | Module 7: AI Assistant Grounding | Unit: Assistant Grounding | Non-Error (Tone Refinement)

A user selects an informal sentence and asks the assistant to make it more academic.

Expected (as the app behaves): the assistant shows a "Suggested revisions" card in which each
change is a before/after pair (the original struck through, the revision beside it, with a
reason) and changes nothing until "Apply revision" is clicked. Applying one revision replaces
only those words in the document, and a single Undo (Ctrl+Z) restores the sentence.
"""

import time

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from selenium_helpers import STUDENT, ask_assistant, click, open_document, select_paragraph, sign_in, wait_for, wait_for_card

INFORMAL = "So basically the results were kinda good and we think the model works pretty well."


def paragraph_text(driver) -> str:
    return next(p.text for p in driver.find_elements(By.CSS_SELECTOR, ".ProseMirror p") if "results were" in p.text)


def test_assistant_grounding_tcase_053(driver, student_api):
    doc_id = student_api.create_document("TCASE-053 Tone", f"<h1>Discussion</h1><p>{INFORMAL}</p>")
    sign_in(driver, STUDENT)
    editor = open_document(driver, doc_id)
    select_paragraph(driver, "results were")

    ask_assistant(driver, "Make this more academic")
    card = wait_for_card(driver, "refine-card")
    assert "suggested revisions" in card.text.lower()
    struck = card.find_elements(By.XPATH, ".//span[contains(@style, 'line-through')]")
    assert struck, "no before/after pairs shown"
    first_original = struck[0].text
    assert first_original in INFORMAL
    assert paragraph_text(driver) == INFORMAL, "the text changed before Apply"

    click(driver, card.find_elements(By.XPATH, ".//button[normalize-space()='Apply revision']")[0])
    wait_for(driver, lambda d: paragraph_text(d) != INFORMAL, message="Apply revision changed nothing")
    applied = paragraph_text(driver)
    assert first_original not in applied, f"{first_original!r} is still there: {applied!r}"

    click(driver, driver.find_element(By.CSS_SELECTOR, ".ProseMirror p"))
    editor.send_keys(Keys.CONTROL, "z")
    time.sleep(0.6)
    assert paragraph_text(driver) == INFORMAL, f"one undo did not restore the sentence: {paragraph_text(driver)!r}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
