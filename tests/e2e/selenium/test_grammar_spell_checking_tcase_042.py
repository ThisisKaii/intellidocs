"""TCASE-042 | Module 5: Grammar & Spell Checking | Unit: Grammar & Spell Checking | Non-Error (Grammar Detection)

A user types "The results of the test shows positive feedback." Expected (as the app behaves): the
subject-verb disagreement ("results ... shows") is flagged with the red grammar underline and
the fix "show".
"""

import pytest

from selenium_helpers import STUDENT, open_document, sign_in, type_paragraph, wait_for_checks

SENTENCE = "The results of the test shows positive feedback."
RED = "rgb(192, 69, 63)"


def test_grammar_spell_checking_tcase_042(driver, student_api):
    doc_id = student_api.create_document("TCASE-042 Grammar", "<h1>Results</h1><p>Findings are summarised below.</p>")
    sign_in(driver, STUDENT)
    editor = open_document(driver, doc_id)
    type_paragraph(driver, editor, SENTENCE)
    found = wait_for_checks(driver)

    flagged = [u for u in found if "shows" in u["text"] and u["kind"] != "spelling"]
    assert flagged, f"the disagreement was not flagged; underlines: {found}"
    assert flagged[0]["color"] == RED, f"not the red grammar underline: {flagged[0]}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
