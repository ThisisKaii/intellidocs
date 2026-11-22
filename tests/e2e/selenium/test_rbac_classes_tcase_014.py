"""TCASE-014 | Module 1: Authentication & Access Control | Unit: RBAC and Classes | Non-Error (Class Submission)

A student hands a finished draft in to their professor's class folder. Expected (as the app
behaves): the document is linked to the class folder, and the professor's dashboard (Submissions)
lists it with the student's name. (The dashboard shows names; there is no School ID field.)

The hand-in uses the same API call the dashboard makes when a student drags a document onto the
class folder (Selenium cannot drive HTML5 drag-and-drop reliably); the professor's view is checked
in the browser.
"""

import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import PROFESSOR, click, open_page, seed_class_id, sign_in, text_appears, visible

STUDENT_NAME = "Ana Reyes"


def test_rbac_classes_tcase_014(driver, professor_api, student_api):
    folder_id = seed_class_id(professor_api)
    title = f"TCASE-014 Thesis Draft {int(time.time())}"
    doc_id = student_api.create_document(title, "<h1>Introduction</h1><p>A finished thesis draft handed in for review.</p>")

    handed_in = student_api.call("POST", f"/folders/{folder_id}/documents", {"documentId": doc_id})
    assert handed_in.status_code == 200, f"hand-in failed: {handed_in.status_code} {handed_in.text[:200]}"
    in_class = [doc["id"] for doc in professor_api.call("GET", f"/folders/{folder_id}/documents").json()]
    assert doc_id in in_class, "the document is not linked to the class folder"

    sign_in(driver, PROFESSOR)
    open_page(driver, "/professor")
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Submissions' or .//span[normalize-space()='Submissions']]"))
    assert text_appears(driver, title, timeout=45), "the submission is not listed on the professor dashboard"
    row = visible(driver, By.XPATH, f"//tr[.//*[contains(normalize-space(), '{title}')]]")
    assert STUDENT_NAME in row.text, f"the submission row does not name the student: {row.text!r}"
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'})", row)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
