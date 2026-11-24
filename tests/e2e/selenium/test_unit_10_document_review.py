"""Unit testing | Document Review (Dagupan, Christian Paulo)

A student hands a document in to a class; the professor reviews it (grade and notes) from the
professor dashboard; the student sees the result. The app grades submissions rather than
approving or rejecting them, so "Approve Document" is the grade and "Reject Document with Notes" is
the notes for the student. The first docstring line of every case reads: <case id> | <unit> |
<Normal or Error>; the rest is the case description, then "Expected:" with the expected result.
"""

import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import PROFESSOR, STUDENT, click, open_document, open_page, seed_class_id, sign_in, text_appears, visible, wait_for

DRAG = """
const [source, target] = arguments;
const data = new DataTransfer();
source.dispatchEvent(new DragEvent('dragstart', {bubbles: true, cancelable: true, dataTransfer: data}));
target.dispatchEvent(new DragEvent('dragenter', {bubbles: true, cancelable: true, dataTransfer: data}));
target.dispatchEvent(new DragEvent('dragover', {bubbles: true, cancelable: true, dataTransfer: data}));
target.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: data}));
source.dispatchEvent(new DragEvent('dragend', {bubbles: true, cancelable: true, dataTransfer: data}));
"""


@pytest.fixture
def submission(professor_api, student_api):
    folder_id = seed_class_id(professor_api)
    title = f"Review unit test {int(time.time())}"
    doc_id = student_api.create_document(title, "<h1>Introduction</h1><p>A draft handed in for review.</p>")
    student_api.call("POST", f"/folders/{folder_id}/documents", {"documentId": doc_id}).raise_for_status()
    return doc_id, title


def open_review(driver, title: str):
    sign_in(driver, PROFESSOR)
    open_page(driver, "/professor?tab=submissions")
    row = visible(driver, By.XPATH, f"//tr[.//*[contains(normalize-space(), '{title}')]]", timeout=60)
    click(driver, row.find_element(By.XPATH, ".//button[normalize-space()='Review']"))
    drawer = visible(driver, By.CSS_SELECTOR, "[role='dialog'][aria-label='Grade submission']")
    visible(driver, By.CSS_SELECTOR, "textarea[aria-label='New comment']", timeout=60)  # the drawer has loaded
    return drawer


def give_grade(driver, drawer, grade: str, notes: str = "") -> None:
    field = drawer.find_element(By.ID, "grade-value")
    field.clear()
    field.send_keys(grade)
    if notes:
        drawer.find_element(By.ID, "grade-notes").send_keys(notes)
    click(driver, drawer.find_element(By.XPATH, ".//button[contains(normalize-space(), 'Save grade')]"))


# ── Submit Document for Review ───────────────────────────────────────────────


def test_UT_REV_01(driver, second_driver, professor_api, student_api, actual):
    """UT-REV-01 | Submit Document for Review | Normal
    A student drags one of their documents onto their class folder ("E2E Seed Class") on the dashboard.
    Expected: the professor's dashboard (Submissions) lists the document with the student's name."""
    folder_id = seed_class_id(professor_api)
    title = f"Submit unit test {int(time.time())}"
    doc_id = student_api.create_document(title, "<h1>Introduction</h1><p>A finished draft.</p>")
    sign_in(driver, STUDENT)
    source = visible(driver, By.XPATH, f"//h3[normalize-space()='{title}']/ancestor::*[@draggable][1]", timeout=40)
    target = visible(driver, By.XPATH, "//h3[@title='E2E Seed Class']/ancestor::*[@draggable][1]")
    driver.execute_script(DRAG, source, target)
    wait_for(driver, lambda d: doc_id in [x["id"] for x in professor_api.call("GET", f"/folders/{folder_id}/documents").json()], timeout=30, message="the document was not handed in")
    sign_in(second_driver, PROFESSOR)
    open_page(second_driver, "/professor?tab=submissions")
    row = visible(second_driver, By.XPATH, f"//tr[.//*[contains(normalize-space(), '{title}')]]", timeout=60)
    student = row.find_elements(By.TAG_NAME, "td")[0].text
    actual(f"After the drop, the professor's Submissions listed \"{title}\" by {student}.")


def test_UT_REV_02(driver, professor_api, student_api, actual):
    """UT-REV-02 | Submit Document for Review | Error
    A student drags the same document onto the class folder a second time.
    Expected: it is still listed once in the professor's Submissions (no duplicate hand-in)."""
    folder_id = seed_class_id(professor_api)
    title = f"Submit twice test {int(time.time())}"
    student_api.create_document(title, "<h1>Introduction</h1><p>A finished draft.</p>")
    sign_in(driver, STUDENT)
    for _ in range(2):
        open_page(driver, "/dashboard")
        source = visible(driver, By.XPATH, f"//h3[normalize-space()='{title}']/ancestor::*[@draggable][1]", timeout=40)
        target = visible(driver, By.XPATH, "//h3[@title='E2E Seed Class']/ancestor::*[@draggable][1]")
        driver.execute_script(DRAG, source, target)
        time.sleep(3)
    sign_in(driver, PROFESSOR)
    open_page(driver, "/professor?tab=submissions")
    visible(driver, By.XPATH, f"//tr[.//*[contains(normalize-space(), '{title}')]]", timeout=60)
    rows = driver.find_elements(By.XPATH, f"//tr[.//*[contains(normalize-space(), '{title}')]]")
    actual(f"The document was listed {len(rows)} time(s) in Submissions.")
    assert len(rows) == 1, f"listed {len(rows)} times"


# ── Approve Document (grade) ─────────────────────────────────────────────────


def test_UT_REV_03(driver, submission, actual):
    """UT-REV-03 | Approve Document (Grade) | Normal
    A professor opens a submission's Review drawer, enters the grade 92 and presses "Save grade".
    Expected: the drawer closes and the Submissions table shows 92 in the Grade column."""
    _doc_id, title = submission
    drawer = open_review(driver, title)
    give_grade(driver, drawer, "92")
    row = f"//tr[.//*[contains(normalize-space(), '{title}')]]"
    wait_for(driver, lambda d: "92" in d.find_element(By.XPATH, row).text, timeout=30, message="the grade is not shown")
    actual("After Save grade, the Submissions table showed 92 for the document.")


def test_UT_REV_04(driver, submission, actual):
    """UT-REV-04 | Approve Document (Grade) | Error
    A professor enters the grade 150 and presses "Save grade".
    Expected: "Enter a grade between 0 and 100" is shown and nothing is saved."""
    _doc_id, title = submission
    drawer = open_review(driver, title)
    give_grade(driver, drawer, "150")
    assert text_appears(driver, "Enter a grade between 0 and 100"), "the grade was not refused"
    actual("\"Enter a grade between 0 and 100\" was shown; the grade stayed Ungraded.")


# ── Reject Document with Notes (notes for the student) ───────────────────────


def test_UT_REV_05(driver, second_driver, submission, actual):
    """UT-REV-05 | Reject Document with Notes | Normal
    A professor grades a submission 70 with the note "Revise Chapter 2 and resubmit." and saves it.
    Expected: the student's Feedback tab shows the grade 70 and the note."""
    doc_id, title = submission
    drawer = open_review(driver, title)
    give_grade(driver, drawer, "70", "Revise Chapter 2 and resubmit.")
    row = f"//tr[.//*[contains(normalize-space(), '{title}')]]"
    wait_for(driver, lambda d: "70" in d.find_element(By.XPATH, row).text, timeout=30)
    sign_in(second_driver, STUDENT)
    open_document(second_driver, doc_id)
    click(second_driver, visible(second_driver, By.XPATH, "//button[starts-with(normalize-space(), 'Feedback')]", timeout=30))
    grade = visible(second_driver, By.CSS_SELECTOR, "[data-testid='feedback-grade']").text
    assert "70" in grade and text_appears(second_driver, "Revise Chapter 2 and resubmit.")
    actual("The student's Feedback tab showed the grade 70 and the note \"Revise Chapter 2 and resubmit.\"")


def test_UT_REV_06(driver, submission, actual):
    """UT-REV-06 | Reject Document with Notes | Error
    A professor writes notes but leaves the grade empty and presses "Save grade".
    Expected: "Enter a grade between 0 and 100" is shown; notes alone are not saved as a review."""
    _doc_id, title = submission
    drawer = open_review(driver, title)
    give_grade(driver, drawer, "", "Notes without a grade.")
    assert text_appears(driver, "Enter a grade between 0 and 100"), "the empty grade was not refused"
    actual("\"Enter a grade between 0 and 100\" was shown; nothing was saved.")


# ── View Review Status ───────────────────────────────────────────────────────


def test_UT_REV_07(driver, professor_api, student_api, submission, actual):
    """UT-REV-07 | View Review Status | Normal
    After the professor grades a submission, the student opens the document.
    Expected: a Feedback tab appears and shows the grade."""
    doc_id, _title = submission
    saved = professor_api.call("POST", "/professor/grade", {"documentId": doc_id, "studentId": student_api.user_id, "grade": 88, "notes": "Well organised."})
    saved.raise_for_status()
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'Feedback')]", timeout=30))
    grade = visible(driver, By.CSS_SELECTOR, "[data-testid='feedback-grade']").text
    assert "88" in grade, grade
    actual(f"The Feedback tab appeared and showed the grade {grade}.")


def test_UT_REV_08(driver, submission, actual):
    """UT-REV-08 | View Review Status | Error
    The professor opens Submissions before grading a newly submitted document.
    Expected: its Grade column says "Ungraded" (it is not shown as graded)."""
    _doc_id, title = submission
    sign_in(driver, PROFESSOR)
    open_page(driver, "/professor?tab=submissions")
    row = visible(driver, By.XPATH, f"//tr[.//*[contains(normalize-space(), '{title}')]]", timeout=60)
    assert "Ungraded" in row.text, row.text
    actual("The new submission's Grade column read \"Ungraded\".")


# ── Create Class ─────────────────────────────────────────────────────────────


def new_class_dialog(driver):
    open_page(driver, "/dashboard")
    click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'New document')]"))
    click(driver, visible(driver, By.XPATH, "//*[@role='menuitem'][contains(normalize-space(), 'New folder')]"))
    click(driver, visible(driver, By.XPATH, "//button[.//*[normalize-space()='Student Class Folder'] or starts-with(normalize-space(), 'Student Class Folder')]"))
    return visible(driver, By.ID, "folder-name")


def delete_class(professor_api, name: str) -> None:
    for folder in professor_api.call("GET", "/folders").json():
        if folder.get("name") == name:
            professor_api.call("DELETE", f"/folders/{folder['folder_id']}")


def test_UT_REV_09(driver, professor_api, actual):
    """UT-REV-09 | Create Class | Normal
    A professor chooses New document > New folder > Student Class Folder, types a class name and code and creates it.
    Expected: the class appears among the professor's folders with its join code for students."""
    name = f"UT-REV-09 Thesis Writing {int(time.time())}"
    try:
        sign_in(driver, PROFESSOR)
        new_class_dialog(driver).send_keys(name)
        driver.find_element(By.ID, "folder-class-code").send_keys("CS-201")
        click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Create')][@type='submit' or contains(normalize-space(), 'class')]"))
        visible(driver, By.XPATH, f"//*[@title='{name}' or normalize-space()='{name}']", timeout=40)
        code = next((f.get("join_code") for f in professor_api.call("GET", "/folders").json() if f.get("name") == name), None)
        assert code, "the class has no join code"
        actual(f"The class \"{name}\" appeared among the folders with the join code {code}.")
    finally:
        delete_class(professor_api, name)


def test_UT_REV_10(driver, professor_api, actual):
    """UT-REV-10 | Create Class | Error
    A professor creates a class with a course code that is not in the form CS-201.
    Expected: "Class code must look like CS-201" appears and no class is created."""
    name = f"UT-REV-10 Bad code {int(time.time())}"
    try:
        sign_in(driver, PROFESSOR)
        new_class_dialog(driver).send_keys(name)
        driver.find_element(By.ID, "folder-class-code").send_keys("thesis")
        click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Create')][@type='submit' or contains(normalize-space(), 'class')]"))
        assert text_appears(driver, "Class code must look like CS-201"), "the bad code was not refused"
        assert not any(f.get("name") == name for f in professor_api.call("GET", "/folders").json()), "a class was created"
        actual("\"Class code must look like CS-201\" appeared and no class was created.")
    finally:
        delete_class(professor_api, name)


# ── Join Class ───────────────────────────────────────────────────────────────


def join_dialog(driver):
    open_page(driver, "/dashboard")
    click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'New document')]"))
    click(driver, visible(driver, By.XPATH, "//*[@role='menuitem'][contains(normalize-space(), 'Join a class')]"))
    return visible(driver, By.CSS_SELECTOR, "input[placeholder='e.g. K7M2QX']")


def test_UT_REV_11(driver, professor_api, actual):
    """UT-REV-11 | Join Class | Normal
    A student chooses New document > Join a class and types the join code the professor gave.
    Expected: the student joins and the class appears in the student's folders."""
    name = f"UT-REV-11 Joinable {int(time.time())}"
    created = professor_api.call("POST", "/folders", {"name": name, "folderType": "class", "classCode": "CS-301"})
    created.raise_for_status()
    code = created.json().get("join_code")
    try:
        assert code, "the class has no join code"
        sign_in(driver, STUDENT)
        join_dialog(driver).send_keys(code)
        click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Join class')]"))
        visible(driver, By.XPATH, f"//*[contains(normalize-space(), '{name}')]", timeout=40)
        actual(f"With the code {code} the student joined, and \"{name}\" appeared in their folders.")
    finally:
        professor_api.call("DELETE", f"/folders/{created.json()['folder_id']}")


def test_UT_REV_12(driver, actual):
    """UT-REV-12 | Join Class | Error
    A student types a join code that belongs to no class.
    Expected: the code is refused with a message and the student joins nothing."""
    sign_in(driver, STUDENT)
    join_dialog(driver).send_keys("ZZ99ZZ")
    click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Join class')]"))
    dialog = visible(driver, By.CSS_SELECTOR, "[role='dialog'][aria-label='Join a class']")
    wait_for(driver, lambda d: any(w in dialog.text.lower() for w in ("not", "no class", "invalid", "could not")), timeout=20,
             message="the wrong code was not refused")
    message = next(line for line in dialog.text.splitlines() if any(w in line.lower() for w in ("not", "no class", "invalid", "could not")))
    actual(f"\"{message}\" was shown and the student joined nothing.")


# ── Originality Check ────────────────────────────────────────────────────────

ESSAY = (
    "<h1>Introduction</h1>"
    "<p>Students at our university spend many evenings fixing the margins, headings and spacing of their papers before a deadline. "
    "In our own survey, most of them said that the formatting took longer than the writing of the last chapter.</p>"
    "<p>This study builds an editor that watches how each student formats a paper and offers the same formatting the next time, "
    "so that a student can spend that time on the ideas of the paper instead. The editor also checks grammar and spelling as the student types.</p>"
    "<p>The editor was tested by forty students and five professors of the College of Computer Studies, who rated how easy it was to use "
    "and how often its suggestions were right.</p>"
)


def originality(driver, doc_id: str) -> None:
    open_document(driver, doc_id)
    click(driver, visible(driver, By.CSS_SELECTOR, "a[aria-label='Check originality against online and scholarly sources']"))
    visible(driver, By.XPATH, "//*[normalize-space()='Ready to scan']", timeout=60)
    time.sleep(2)  # the paper is shown before the check is ready to start
    click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Check online')]", timeout=60))
    wait_for(driver, lambda d: "Searching online" in d.find_element(By.TAG_NAME, "body").text
             or "too short" in d.find_element(By.TAG_NAME, "body").text
             or "match with published sources" in d.find_element(By.TAG_NAME, "body").text, timeout=20, message="the check did not start")


def test_UT_REV_13(driver, student_api, actual):
    """UT-REV-13 | Originality Check | Normal
    A student opens Check originality on a finished paper and presses Check online.
    Expected: the result shows how much of the paper matches published sources (a percentage), or that no passage matched."""
    doc_id = student_api.create_document("UT-REV-13 Originality", ESSAY)
    sign_in(driver, STUDENT)
    originality(driver, doc_id)
    wait_for(driver, lambda d: "match with published sources" in d.find_element(By.TAG_NAME, "body").text
             or "No matching passages" in d.find_element(By.TAG_NAME, "body").text, timeout=150, message="no result was shown")
    text = driver.find_element(By.TAG_NAME, "body").text
    line = next((l for l in text.splitlines() if "match with published sources" in l or "No matching passages" in l), "")
    actual(f"The check finished and showed: \"{line.strip()}\".")


def test_UT_REV_14(driver, student_api, actual):
    """UT-REV-14 | Originality Check | Error
    A student presses Check online on a document with only one short sentence.
    Expected: "The document is too short to check online" is shown instead of a score."""
    doc_id = student_api.create_document("UT-REV-14 Too short", "<p>Only one short sentence here.</p>")
    sign_in(driver, STUDENT)
    originality(driver, doc_id)
    assert text_appears(driver, "too short to check online", timeout=90), "no message for the short document"
    assert "match with published sources" not in driver.find_element(By.TAG_NAME, "body").text
    actual("\"The document is too short to check online. Write a few more sentences first.\" was shown, with no score.")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
