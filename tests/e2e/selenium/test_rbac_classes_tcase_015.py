"""TCASE-015 | Module 1: Authentication & Access Control | Unit: RBAC and Classes | Non-Error (Review Mode)

A professor opens a student's submitted document. Expected (as the app behaves): it opens view-only
("View only — you can read this document, but only its owner can edit it."); the text cannot be
edited, and the document content is shown for review.
"""

import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import PROFESSOR, open_document, seed_class_id, sign_in, text_appears

TEXT = "Submitted methodology chapter for the professor's review."


def test_rbac_classes_tcase_015(driver, professor_api, student_api):
    folder_id = seed_class_id(professor_api)
    doc_id = student_api.create_document(f"TCASE-015 Submission {int(time.time())}", f"<h1>Methodology</h1><p>{TEXT}</p>")
    assert student_api.call("POST", f"/folders/{folder_id}/documents", {"documentId": doc_id}).status_code == 200

    sign_in(driver, PROFESSOR)
    editor = open_document(driver, doc_id)

    assert text_appears(driver, "View only — you can read this document, but only its owner can edit it."), "no view-only banner"
    assert editor.get_attribute("contenteditable") == "false", "the professor can edit the student's text"
    assert TEXT in editor.text, "the submission's content is not shown"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
