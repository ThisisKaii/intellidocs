"""TCASE-045 | Module 5: Grammar & Spell Checking | Unit: Grammar & Spell Checking | Error (True Typographical Error)

A user types "The algoritm was evaluated." Expected (as the app behaves): the spelling checker
underlines "algoritm" in amber (spelling, distinct from the red grammar underline), and clicking
it opens its entry in the Suggestions panel, which offers "algorithm".
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import ACCEPT_CARD, STUDENT, click, open_document, sign_in, type_paragraph, visible, wait_for_checks

SENTENCE = "The algoritm was evaluated."
AMBER = "rgb(181, 119, 43)"


def test_grammar_spell_checking_tcase_045(driver, student_api):
    doc_id = student_api.create_document("TCASE-045 Typo", "<h1>Methodology</h1><p>The procedure is described below.</p>")
    sign_in(driver, STUDENT)
    editor = open_document(driver, doc_id)
    type_paragraph(driver, editor, SENTENCE)
    found = wait_for_checks(driver)

    typo = [u for u in found if u["text"] == "algoritm"]
    assert typo, f"the typo was not underlined: {found}"
    assert typo[0]["kind"] == "spelling" and typo[0]["color"] == AMBER, typo[0]

    click(driver, driver.find_element(By.XPATH, "//*[contains(@class,'grammar-issue') and normalize-space()='algoritm']"))
    card = visible(driver, By.XPATH, ACCEPT_CARD)
    assert "algorithm" in card.text, card.text


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
