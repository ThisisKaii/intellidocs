"""Integration testing: one user action that passes from one module to another, checked where the
user sees the result.

Every case's docstring reads:
    <case id> | <Module 1> -> <Module 2> | <Normal or Error>
    Process: what the user does that carries over from Module 1 to Module 2.
    Precondition: what must already be true.
    Expected: what the user sees in Module 2.
"""

import os
import re
import time

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import Select

from selenium_helpers import (
    DOWNLOADS,
    PROFESSOR,
    STUDENT,
    STUDENT_2,
    ACCEPT_CARD,
    Api,
    body_text,
    click,
    create_from_modal,
    delete_account,
    import_through_dashboard,
    open_issue,
    open_document,
    open_page,
    register_account,
    seed_class_id,
    select_paragraph,
    sign_in,
    text_appears,
    type_paragraph,
    unique_email,
    visible,
    wait_for,
)

PASSWORD = "Chapter4-Pass!"
ADMIN = (os.environ.get("ADMIN_EMAIL", ""), os.environ.get("ADMIN_PASSWORD", ""))

DRAG = """
const [source, target] = arguments;
const data = new DataTransfer();
for (const [el, type] of [[source, 'dragstart'], [target, 'dragenter'], [target, 'dragover'], [target, 'drop'], [source, 'dragend']])
  el.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: data}));
"""


def editor_html(driver) -> str:
    return driver.find_element(By.CSS_SELECTOR, ".ProseMirror").get_attribute("innerHTML")


def wait_saved(driver) -> None:
    try:
        wait_for(driver, lambda d: "Saved to cloud" not in body_text(d), timeout=15)
    except Exception:
        pass
    assert text_appears(driver, "Saved to cloud", timeout=60)
    time.sleep(1)


def draggable(driver, title: str):
    return visible(driver, By.XPATH, f"//h3[@title='{title}' or normalize-space()='{title}']/ancestor::*[@draggable][1]", timeout=40)


# ── Normal flows ─────────────────────────────────────────────────────────────


def test_IT_01(driver, actual):
    """IT-01 | Account Management -> Document Management | Normal
    Process: a guest registers, lands on the dashboard and creates their first document.
    Precondition: the email has no account yet.
    Expected: the new account opens the dashboard, and the document it creates is saved and listed in its My documents."""
    email = unique_email("it-01")
    open_page(driver, "/register")
    visible(driver, By.ID, "reg-first-name").send_keys("Integration")
    driver.find_element(By.ID, "reg-last-name").send_keys("Tester")
    driver.find_element(By.ID, "reg-email").send_keys(email)
    driver.find_element(By.ID, "reg-password").send_keys(PASSWORD)
    driver.find_element(By.ID, "reg-confirm-password").send_keys(PASSWORD)
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    try:
        wait_for(driver, lambda d: "/dashboard" in d.current_url, timeout=60)
        create_from_modal(driver, "Blank Document", "IT-01 First paper")
        open_page(driver, "/dashboard")
        visible(driver, By.XPATH, "//h3[normalize-space()='IT-01 First paper']", timeout=40)
        actual("The new account reached the dashboard; its new document \"IT-01 First paper\" was listed in My documents.")
    finally:
        try:
            delete_account(Api.sign_in((email, PASSWORD)).token or "", email)
        except Exception:
            pass


def test_IT_02(driver, student_api, actual):
    """IT-02 | Document Editor -> Document Management | Normal
    Process: a student makes a sentence bold in the editor; auto-save stores it; they reopen the document from the dashboard.
    Precondition: the student has a document with one plain paragraph.
    Expected: after reopening, the sentence is still bold (the editor's formatting is saved with the document)."""
    doc_id = student_api.create_document("IT-02 Saved formatting", "<p>Formatting that must survive saving.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    select_paragraph(driver, "must survive")
    click(driver, visible(driver, By.CSS_SELECTOR, "button[title='Bold (Ctrl+B)']"))
    wait_saved(driver)
    open_page(driver, "/dashboard")
    open_document(driver, doc_id)
    assert "<strong" in editor_html(driver), "the bold was not saved"
    actual("After auto-save and reopening, the sentence was still bold.")


def test_IT_03(driver, student_api, tmp_path, actual):
    """IT-03 | Document Management -> Document Editor | Normal
    Process: a student imports a Word file with headings from the dashboard and opens it.
    Precondition: a .docx with a Heading 1 and a Heading 2.
    Expected: the editor shows the file's headings as headings, listed in the Outline."""
    import docx

    source = tmp_path / "IT-03 Imported headings.docx"
    word = docx.Document()
    word.add_heading("Chapter One", level=1)
    word.add_paragraph("Opening paragraph.")
    word.add_heading("Background of the Study", level=2)
    word.add_paragraph("Second paragraph.")
    word.save(str(source))
    sign_in(driver, STUDENT)
    doc_id, _ = import_through_dashboard(driver, source, timeout=240)
    student_api.created_documents.append(doc_id)
    heads = driver.execute_script("return [...document.querySelectorAll('.ProseMirror h1, .ProseMirror h2')].map(h => h.textContent.trim())")
    assert "Chapter One" in heads and "Background of the Study" in heads, heads
    actual(f"The imported document opened with the headings {heads} in the editor.")


def test_IT_04(driver, student_api, actual):
    """IT-04 | Folder Management -> Document Management | Normal
    Process: a student drags a document into a folder, opens the folder, then opens the document from there.
    Precondition: the student has a folder and a document.
    Expected: the document is listed in the folder and opens in the editor from it."""
    folder = f"IT-04 Folder {int(time.time())}"
    folder_id = student_api.call("POST", "/folders", {"name": folder}).json()["folder_id"]
    title = f"{folder} paper"
    student_api.create_document(title, "<p>Inside the folder.</p>")
    try:
        sign_in(driver, STUDENT)
        driver.execute_script(DRAG, draggable(driver, title), draggable(driver, folder))
        time.sleep(2)
        from selenium.webdriver.common.action_chains import ActionChains
        target = visible(driver, By.XPATH, f"//h3[@title='{folder}']")
        ActionChains(driver).double_click(target).perform()
        card = visible(driver, By.XPATH, f"//h3[normalize-space()='{title}']", timeout=30)
        ActionChains(driver).double_click(card).perform()
        wait_for(driver, lambda d: "/document/" in d.current_url, timeout=30)
        wait_for(driver, lambda d: "Inside the folder." in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text, timeout=60)
        actual("The document was listed in the folder and opened in the editor from it.")
    finally:
        student_api.call("DELETE", f"/folders/{folder_id}")


def test_IT_05(driver, student_api, actual):
    """IT-05 | Document Editor -> Formatting Prediction | Normal
    Process: a student types a new line "2.0 Methodology" in the editor.
    Precondition: formatting suggestions are on.
    Expected: the new line gets a heading suggestion in the Suggestions tab."""
    doc_id = student_api.create_document("IT-05 Typed heading", "<p>An opening paragraph of the study for context.</p>")
    sign_in(driver, STUDENT)
    editor = open_document(driver, doc_id)
    type_paragraph(driver, editor, "2.0 Methodology")
    editor.send_keys(Keys.ENTER, "The study used a survey of students in two schools.")
    click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'Suggestions')]"))
    card = visible(driver, By.XPATH, "//*[@data-review-card][contains(normalize-space(), '2.0 Methodology')]", timeout=90)
    actual(f"The typed line was suggested as \"{card.text.splitlines()[0]}\" in the Suggestions tab.")


def test_IT_06(driver, student_api, actual):
    """IT-06 | Formatting Prediction -> Behavioral Learning | Normal
    Process: a student accepts a formatting suggestion, then opens Settings > Editor.
    Precondition: the document is not isolated.
    Expected: the learning progress in Settings counts the accepted suggestion."""
    def counts():
        open_page(driver, "/settings?section=editor")
        wait_for(driver, lambda d: "accepted ·" in body_text(d) or "progress will show up here" in body_text(d), timeout=40)
        m = re.search(r"accepted · (\d+) of (\d+)", body_text(driver))
        return (int(m.group(1)), int(m.group(2))) if m else (0, 0)

    sign_in(driver, STUDENT)
    before = counts()
    doc_id = student_api.create_document("IT-06 Learning", "<p>1.0 Introduction</p><p>This study looks at how students format their papers in class.</p>")
    open_document(driver, doc_id)
    click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'Suggestions')]"))
    card = visible(driver, By.XPATH, "//*[@data-review-card][contains(normalize-space(), '1.0 Introduction')]", timeout=60)
    click(driver, card.find_element(By.XPATH, ".//button[@aria-expanded]"))
    accept = "//*[@data-review-card][contains(normalize-space(), '1.0 Introduction')]//button[contains(normalize-space(), 'Accept')]"
    wait_for(driver, lambda d: d.find_element(By.XPATH, accept).is_enabled(), timeout=30)
    click(driver, driver.find_element(By.XPATH, accept))
    time.sleep(4)
    after = wait_for(driver, lambda d: (lambda c: c if c[0] > before[0] else False)(counts()), timeout=60, message="not counted")
    actual(f"Settings > Editor went from {before[0]} of {before[1]} to {after[0]} of {after[1]} accepted.")


def test_IT_07(driver, student_api, actual):
    """IT-07 | Grammar and Spelling -> Document Management | Normal
    Process: a student accepts the spelling fix for "algoritm"; the document auto-saves; they reload it.
    Precondition: the document contains the misspelled word.
    Expected: after reloading, the document reads "algorithm" (the fix was saved)."""
    doc_id = student_api.create_document("IT-07 Spelling saved", "<h1>Methods</h1><p>The algoritm was evaluated.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    open_issue(driver, "algoritm")
    time.sleep(1.5)
    click(driver, visible(driver, By.XPATH, ACCEPT_CARD + "//button[normalize-space()='Accept']"))
    wait_saved(driver)
    driver.refresh()
    wait_for(driver, lambda d: "The algorithm was evaluated." in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text, timeout=60, message="the fix was not saved")
    actual("After the fix and a reload, the document read \"The algorithm was evaluated.\"")


def test_IT_08(driver, student_api, actual):
    """IT-08 | AI Chat Overlay -> Document Editor | Normal
    Process: a student asks the assistant "Make all headings bold", presses Apply, and reloads the document.
    Precondition: the document has two headings.
    Expected: both headings are bold in the editor, also after reloading."""
    doc_id = student_api.create_document("IT-08 Assistant change", "<h1>Introduction</h1><p>Body.</p><h2>Methodology</h2><p>More.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Assistant']"))
    box = visible(driver, By.CSS_SELECTOR, "textarea[aria-label='Message the assistant']")
    box.send_keys("Make all headings bold")
    click(driver, driver.find_element(By.CSS_SELECTOR, "button[aria-label='Send message']"))
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Apply']", timeout=120))
    bold = "return [...document.querySelectorAll('.ProseMirror h1, .ProseMirror h2')].every(h => h.querySelector('strong'))"
    wait_for(driver, lambda d: d.execute_script(bold), timeout=20)
    wait_saved(driver)
    driver.refresh()
    visible(driver, By.CSS_SELECTOR, ".ProseMirror h1", timeout=60)
    assert driver.execute_script(bold), "the change was not saved"
    actual("Apply made both headings bold, and they were still bold after a reload.")


def test_IT_09(driver, second_driver, professor_api, student_api, actual):
    """IT-09 | Folder Management -> Document Review | Normal
    Process: a student drags a document onto their class folder; the professor grades it from the professor dashboard.
    Precondition: the student is enrolled in the professor's class.
    Expected: the professor sees the submission, and after grading, the student sees the grade in the document's Feedback tab."""
    folder_id = seed_class_id(professor_api)
    title = f"IT-09 Hand-in {int(time.time())}"
    doc_id = student_api.create_document(title, "<h1>Introduction</h1><p>Handed in.</p>")
    sign_in(driver, STUDENT)
    driver.execute_script(DRAG, draggable(driver, title), visible(driver, By.XPATH, "//h3[@title='E2E Seed Class']/ancestor::*[@draggable][1]"))
    wait_for(driver, lambda d: doc_id in [x["id"] for x in professor_api.call("GET", f"/folders/{folder_id}/documents").json()], timeout=30)
    sign_in(second_driver, PROFESSOR)
    open_page(second_driver, "/professor?tab=submissions")
    row = visible(second_driver, By.XPATH, f"//tr[.//*[contains(normalize-space(), '{title}')]]", timeout=60)
    click(second_driver, row.find_element(By.XPATH, ".//button[normalize-space()='Review']"))
    drawer = visible(second_driver, By.CSS_SELECTOR, "[role='dialog'][aria-label='Grade submission']")
    visible(second_driver, By.CSS_SELECTOR, "textarea[aria-label='New comment']", timeout=60)
    drawer.find_element(By.ID, "grade-value").send_keys("95")
    click(second_driver, drawer.find_element(By.XPATH, ".//button[contains(normalize-space(), 'Save grade')]"))
    wait_for(second_driver, lambda d: "95" in d.find_element(By.XPATH, f"//tr[.//*[contains(normalize-space(), '{title}')]]").text, timeout=30)
    open_document(driver, doc_id)
    click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'Feedback')]", timeout=30))
    assert "95" in visible(driver, By.CSS_SELECTOR, "[data-testid='feedback-grade']").text
    actual("The professor saw the hand-in and graded it 95; the student's Feedback tab then showed 95.")


def test_IT_10(driver, second_driver, professor_api, student_api, actual):
    """IT-10 | Document Comments -> Document Editor | Normal
    Process: the professor adds a comment on a submission; the student opens the document.
    Precondition: the document was handed in to the professor's class.
    Expected: the student's editor shows a Feedback tab with the professor's comment."""
    folder_id = seed_class_id(professor_api)
    title = f"IT-10 Commented {int(time.time())}"
    doc_id = student_api.create_document(title, "<h1>Introduction</h1><p>Handed in.</p>")
    student_api.call("POST", f"/folders/{folder_id}/documents", {"documentId": doc_id}).raise_for_status()
    sign_in(second_driver, PROFESSOR)
    open_page(second_driver, "/professor?tab=submissions")
    row = visible(second_driver, By.XPATH, f"//tr[.//*[contains(normalize-space(), '{title}')]]", timeout=60)
    click(second_driver, row.find_element(By.XPATH, ".//button[normalize-space()='Review']"))
    drawer = visible(second_driver, By.CSS_SELECTOR, "[role='dialog'][aria-label='Grade submission']")
    visible(second_driver, By.CSS_SELECTOR, "textarea[aria-label='New comment']", timeout=60)
    drawer.find_element(By.CSS_SELECTOR, "textarea[aria-label='New comment']").send_keys("Tighten the problem statement.")
    click(second_driver, drawer.find_element(By.XPATH, ".//button[normalize-space()='Add comment']"))
    visible(second_driver, By.XPATH, "//*[@data-testid='feedback-comment'][contains(., 'Tighten the problem statement.')]", timeout=30)
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'Feedback')]", timeout=30))
    visible(driver, By.XPATH, "//*[@data-testid='feedback-comment'][contains(., 'Tighten the problem statement.')]")
    actual("The comment the professor added appeared in the student's Feedback tab.")


def test_IT_11(driver, second_driver, student_api, actual):
    """IT-11 | Document Management -> Document Editor | Normal
    Process: a student shares a document with a classmate (View); the classmate opens it from Shared with me.
    Precondition: both have accounts.
    Expected: the classmate's editor opens the document's text in view-only mode."""
    title = f"IT-11 Shared {int(time.time())}"
    doc_id = student_api.create_document(title, "<p>Text the classmate may read.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Share']"))
    field = visible(driver, By.CSS_SELECTOR, "input[placeholder='Collaborator email']")
    field.send_keys(STUDENT_2[0])
    click(driver, field.find_element(By.XPATH, "following::button[normalize-space()='Share'][1]"))
    visible(driver, By.XPATH, "//li[.//select[@title='Change permission']]", timeout=30)
    sign_in(second_driver, STUDENT_2)
    click(second_driver, visible(second_driver, By.XPATH, "//nav//button[starts-with(normalize-space(), 'Shared with me')]"))
    from selenium.webdriver.common.action_chains import ActionChains
    card = visible(second_driver, By.XPATH, f"//h3[normalize-space()='{title}']", timeout=40)
    ActionChains(second_driver).double_click(card).perform()
    wait_for(second_driver, lambda d: "Text the classmate may read." in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text, timeout=60)
    editable = second_driver.find_element(By.CSS_SELECTOR, ".ProseMirror").get_attribute("contenteditable")
    assert editable == "false", f"contenteditable={editable}"
    actual("The classmate opened the shared document from Shared with me and saw its text, view-only.")


@pytest.mark.skipif(not all(ADMIN), reason="set ADMIN_EMAIL and ADMIN_PASSWORD to run the administrator case")
def test_IT_12(driver, second_driver, actual):
    """IT-12 | Admin Management -> Account Management | Normal
    Process: an administrator changes a student's role to Professor; that user signs in again.
    Precondition: a student account exists.
    Expected: the user now has the professor's menu item and can open the professor dashboard area."""
    email = unique_email("it-12")
    account = register_account(email, PASSWORD, "Role", "Change")
    try:
        sign_in(driver, ADMIN)
        open_page(driver, "/admin")
        click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'User management')]", timeout=40))
        box = visible(driver, By.CSS_SELECTOR, "input[placeholder='Search users…']")
        box.send_keys(email)
        time.sleep(1.5)
        row = visible(driver, By.XPATH, f"//tr[.//*[contains(normalize-space(), '{email}')]]")
        Select(row.find_element(By.TAG_NAME, "select")).select_by_value("professor")
        assert text_appears(driver, "Role updated to Professor.")
        sign_in(second_driver, (email, PASSWORD))
        click(second_driver, visible(second_driver, By.CSS_SELECTOR, "button[aria-label='Account']"))
        assert text_appears(second_driver, "Professor dashboard"), "no professor menu item"
        actual("After the role change, the user's account menu offered \"Professor dashboard\".")
    finally:
        delete_account(account.token or "", email)


def test_IT_13(driver, student_api, actual):
    """IT-13 | Document Editor -> Document Management | Normal
    Process: a student makes a heading and bold text in the editor, then exports the document to Word.
    Precondition: the document has a paragraph.
    Expected: the downloaded Word file holds the heading and the bold text."""
    doc_id = student_api.create_document("IT-13 Export formatting", "<p>Results Heading</p><p>Key finding sentence.</p>")
    for old in DOWNLOADS.glob("IT-13*"):
        old.unlink()
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    select_paragraph(driver, "Results Heading")
    click(driver, visible(driver, By.XPATH, "//*[@role='group' and @aria-label='Styles']//button[contains(normalize-space(), 'Heading 1')]"))
    select_paragraph(driver, "Key finding")
    click(driver, visible(driver, By.CSS_SELECTOR, "button[title='Bold (Ctrl+B)']"))
    time.sleep(1)
    click(driver, visible(driver, By.CSS_SELECTOR, "button[aria-label='Export']"))
    click(driver, visible(driver, By.XPATH, "//*[@role='menuitem'][contains(normalize-space(), 'Word (.doc / .docx)')]"))
    file = wait_for(driver, lambda d: next((f for f in DOWNLOADS.glob("IT-13*.doc*") if not f.name.endswith(".crdownload")), False), timeout=60)
    time.sleep(1)
    text = file.read_bytes().decode("utf-8", "ignore")
    assert re.search(r"<h1[^>]*>Results Heading", text) and re.search(r"<strong>Key finding sentence\.</strong>", text), text[:400]
    actual(f"\"{file.name}\" held \"Results Heading\" as a heading and the bold sentence.")


# ── Error flows ──────────────────────────────────────────────────────────────


def test_IT_14(driver, second_driver, student_api, actual):
    """IT-14 | Document Management -> Document Editor | Error
    Process: a classmate who was given View access tries to type in the shared document.
    Precondition: the document is shared with the classmate as View.
    Expected: the classmate cannot change the text ("View only")."""
    title = f"IT-14 View only {int(time.time())}"
    doc_id = student_api.create_document(title, "<p>Do not change this text.</p>")
    student_api.call("POST", f"/documents/{doc_id}/shares", {"email": STUDENT_2[0], "permission": "view"}).raise_for_status()
    sign_in(second_driver, STUDENT_2)
    open_document(second_driver, doc_id)
    editor = second_driver.find_element(By.CSS_SELECTOR, ".ProseMirror")
    try:
        editor.click()
        editor.send_keys(" typed by the classmate")
    except Exception:
        pass
    time.sleep(2)
    assert "typed by the classmate" not in editor.text
    assert "Do not change this text." in student_api.call("GET", f"/documents/{doc_id}").json().get("content", "")
    actual("The classmate's typing did not change the text; the document stayed as the owner wrote it.")


def test_IT_15(driver, student_api, actual):
    """IT-15 | Account Management -> Document Management | Error
    Process: a student logs out, then opens the address of one of their documents.
    Precondition: the student has a document.
    Expected: the document is not shown; the app asks them to sign in."""
    doc_id = student_api.create_document("IT-15 After logout", "<p>Private after logout.</p>")
    sign_in(driver, STUDENT)
    click(driver, visible(driver, By.CSS_SELECTOR, "button[aria-label='Account']"))
    click(driver, visible(driver, By.XPATH, "//button[@role='menuitem' and contains(normalize-space(), 'Logout')]"))
    wait_for(driver, lambda d: "/login" in d.current_url)
    open_page(driver, f"/document/{doc_id}")
    wait_for(driver, lambda d: "/login" in d.current_url, timeout=20, message="the document opened without signing in")
    assert "Private after logout." not in body_text(driver)
    actual("Opening the document's address after logout went to the sign-in page; the text was not shown.")


def test_IT_16(driver, student_api, actual):
    """IT-16 | Behavioral Learning -> Formatting Prediction | Error
    Process: a student isolates a document, then accepts a formatting suggestion in it.
    Precondition: the document is not shared and has a heading-like line.
    Expected: suggestions still work in the document, but the decision is not counted in Settings > Editor."""
    def counts():
        open_page(driver, "/settings?section=editor")
        wait_for(driver, lambda d: "accepted ·" in body_text(d) or "progress will show up here" in body_text(d), timeout=40)
        m = re.search(r"accepted · (\d+) of (\d+)", body_text(driver))
        return (int(m.group(1)), int(m.group(2))) if m else (0, 0)

    sign_in(driver, STUDENT)
    before = counts()
    doc_id = student_api.create_document("IT-16 Isolated", "<p>1.0 Introduction</p><p>This study looks at how students format their papers in class.</p>")
    open_document(driver, doc_id)
    click(driver, visible(driver, By.XPATH, "//button[starts-with(@title, 'Document is NOT isolated')]"))
    wait_for(driver, lambda d: d.find_elements(By.XPATH, "//button[starts-with(@title, 'Document is isolated')]"), timeout=15)
    click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'Suggestions')]"))
    card = visible(driver, By.XPATH, "//*[@data-review-card][contains(normalize-space(), '1.0 Introduction')]", timeout=60)
    click(driver, card.find_element(By.XPATH, ".//button[@aria-expanded]"))
    accept = "//*[@data-review-card][contains(normalize-space(), '1.0 Introduction')]//button[contains(normalize-space(), 'Accept')]"
    wait_for(driver, lambda d: d.find_element(By.XPATH, accept).is_enabled(), timeout=30)
    click(driver, driver.find_element(By.XPATH, accept))
    time.sleep(8)
    after = counts()
    actual(f"The suggestion was applied, and Settings > Editor stayed at {after[0]} of {after[1]}." if after == before
           else f"The suggestion was applied but still counted: {before[0]} of {before[1]} became {after[0]} of {after[1]}.")
    assert after == before, (before, after)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
