"""TCASE-044 | Module 5: Grammar & Spell Checking | Unit: Grammar & Spell Checking | Non-Error (Academic Term Bypass)

A user types valid academic terms: "p-value", "ANOVA", "heteroscedasticity". Expected (as the app behaves):
the academic vocabulary keeps all three from being flagged.
"""

import pytest

from selenium_helpers import STUDENT, open_document, sign_in, type_paragraph, wait_for_checks

SENTENCE = "The p-value from the ANOVA test indicated heteroscedasticity in the residuals."
TERMS = ("p-value", "anova", "heteroscedasticity")


def test_grammar_spell_checking_tcase_044(driver, student_api):
    doc_id = student_api.create_document("TCASE-044 Academic Terms", "<h1>Results</h1><p>The analysis is reported below.</p>")
    sign_in(driver, STUDENT)
    editor = open_document(driver, doc_id)
    type_paragraph(driver, editor, SENTENCE)
    found = wait_for_checks(driver)

    flagged = [u for u in found if any(part in term for term in TERMS for part in [u["text"].lower()] if part)]
    assert not flagged, f"academic terms flagged: {flagged}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
