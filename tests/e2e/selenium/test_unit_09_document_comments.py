"""Unit testing | Document Comments (Dagupan, Christian Paulo)

A professor comments on a student's submitted document from the professor dashboard, and the
student reads the comments in the document's Feedback tab. (Replying to and deleting comments,
listed in the original module plan, are not part of the app: comments go from the professor to the
student.) The first docstring line of every case reads: <case id> | <unit> | <Normal or Error>; the
rest is the case description, then "Expected:" with the expected result.
"""

import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import PROFESSOR, STUDENT, click, open_document, open_page, seed_class_id, sign_in, text_appears, visible, wait_for


@pytest.fixture
def submission(professor_api, student_api):
    """A student's document handed in to the professor's seeded class: (document id, title)."""
    folder_id = seed_class_id(professor_api)
    title = f"Comments unit test {int(time.time())}"
    doc_id = student_api.create_document(title, "<h1>Introduction</h1><p>A draft handed in for review.</p>")
    student_api.call("POST", f"/folders/{folder_id}/documents", {"documentId": doc_id}).raise_for_status()
    return doc_id, title


def open_review(driver, title: str):
    """Professor dashboard → Submissions → the submission's Review button; returns the drawer."""
    sign_in(driver, PROFESSOR)
    open_page(driver, "/professor?tab=submissions")
    row = visible(driver, By.XPATH, f"//tr[.//*[contains(normalize-space(), '{title}')]]", timeout=60)
    click(driver, row.find_element(By.XPATH, ".//button[normalize-space()='Review']"))
    drawer = visible(driver, By.CSS_SELECTOR, "[role='dialog'][aria-label='Grade submission']")
    visible(driver, By.CSS_SELECTOR, "textarea[aria-label='New comment']", timeout=60)  # the drawer has loaded
    return drawer


def add_comment(driver, drawer, text: str) -> None:
    box = drawer.find_element(By.CSS_SELECTOR, "textarea[aria-label='New comment']")
    box.send_keys(text)
    click(driver, drawer.find_element(By.XPATH, ".//button[normalize-space()='Add comment']"))


# ── Add Comment ──────────────────────────────────────────────────────────────


def test_UT_CMT_01(driver, submission, actual):
    """UT-CMT-01 | Add Comment | Normal
    A professor opens a submission's Review drawer, writes a comment and presses "Add comment".
    Expected: the comment is listed under Comments with the professor's name and the time."""
    _doc_id, title = submission
    drawer = open_review(driver, title)
    add_comment(driver, drawer, "Please cite your sources in Chapter 1.")
    item = visible(driver, By.XPATH, "//*[@data-testid='feedback-comment'][contains(., 'Please cite your sources in Chapter 1.')]", timeout=30)
    author = item.text.splitlines()[0]
    actual(f"The comment was listed under Comments with \"{author}\".")


def test_UT_CMT_02(driver, submission, actual):
    """UT-CMT-02 | Add Comment | Error
    A professor leaves the comment box empty (or only spaces).
    Expected: "Add comment" cannot be pressed and nothing is added."""
    _doc_id, title = submission
    drawer = open_review(driver, title)
    box = drawer.find_element(By.CSS_SELECTOR, "textarea[aria-label='New comment']")
    box.send_keys("   ")
    button = drawer.find_element(By.XPATH, ".//button[normalize-space()='Add comment']")
    assert not button.is_enabled(), "an empty comment could be added"
    assert not drawer.find_elements(By.CSS_SELECTOR, "[data-testid='feedback-comment']")
    actual("With only spaces in the box, \"Add comment\" stayed disabled and no comment was added.")


# ── View Comments ────────────────────────────────────────────────────────────


def test_UT_CMT_03(driver, professor_api, student_api, submission, actual):
    """UT-CMT-03 | View Comments | Normal
    After the professor comments, the student opens their document and the Feedback tab.
    Expected: the student sees the professor's comment."""
    doc_id, _title = submission
    professor_api.call("POST", "/professor/comments", {"documentId": doc_id, "comment": "Good start; expand the scope section."}).raise_for_status()
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'Feedback')]", timeout=30))
    visible(driver, By.XPATH, "//*[@data-testid='feedback-comment'][contains(., 'Good start; expand the scope section.')]")
    actual("The Feedback tab showed the professor's comment \"Good start; expand the scope section.\"")


def test_UT_CMT_04(driver, submission, actual):
    """UT-CMT-04 | View Comments | Error
    A student opens a submitted document that has no comments or grade yet.
    Expected: no Feedback tab is shown (there is nothing to read yet); the document opens normally."""
    doc_id, _title = submission
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    time.sleep(4)
    tabs = [b for b in driver.find_elements(By.XPATH, "//button[starts-with(normalize-space(), 'Feedback')]") if b.is_displayed()]
    assert not tabs, "a Feedback tab is shown with nothing in it"
    actual("No Feedback tab appeared before the professor left feedback; the document opened normally.")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
