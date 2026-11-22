"""TCASE-054 | Module 7: AI Assistant Grounding | Unit: Assistant Grounding | Error (Unexpanded Acronym Alert)

A user writes "The architecture leverages an ANN." with no earlier definition, selects it and
asks the assistant to refine it.

Expected (as the app behaves): the refinement card lists, under "To check", that "ANN" is used
without its full form and asks the user to spell it out once on first use as "full name (ANN)".
The assistant does not guess the expansion (an acronym can stand for several things), and the
notice changes nothing in the document.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, ask_assistant, open_document, select_paragraph, sign_in, wait_for_card

SENTENCE = "The architecture leverages an ANN."


def test_assistant_grounding_tcase_054(driver, student_api):
    doc_id = student_api.create_document("TCASE-054 Acronym", f"<h1>Methodology</h1><p>{SENTENCE}</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    select_paragraph(driver, "leverages")

    ask_assistant(driver, "Refine this")
    card = wait_for_card(driver, "refine-card")
    text = card.text
    assert "to check" in text.lower(), text
    assert "“ANN” is used without its full form" in text, text
    assert "full name (ANN)" in text, text
    assert "Artificial Neural Network" not in text, "the assistant guessed the expansion"
    assert SENTENCE in driver.find_element(By.CSS_SELECTOR, ".ProseMirror").text


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
