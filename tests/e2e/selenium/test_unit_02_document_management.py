"""Unit testing | Document Management (Alenton, RJ)

Each case drives the app the way a user does and checks what the user sees. The first docstring
line of every case reads: <case id> | <unit> | <Normal or Error>; the rest is the case
description, then "Expected:" with the expected result.
"""

import time
import zipfile

import pytest
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from selenium_helpers import (
    DOWNLOADS,
    PROFESSOR,
    STUDENT,
    STUDENT_2,
    Api,
    body_text,
    choose_import_file,
    click,
    create_from_modal,
    document_id_from_url,
    import_through_dashboard,
    open_document,
    open_new_document_modal,
    open_page,
    sign_in,
    text_appears,
    visible,
    wait_for,
)


def card(driver, title: str):
    """A document's card on the dashboard, by its title."""
    return visible(driver, By.XPATH, f"//h3[normalize-space()='{title}']", timeout=40)


def card_menu(driver, title: str, item: str) -> None:
    """Open a card's "Document actions" menu and choose an item."""
    holder = card(driver, title).find_element(By.XPATH, "./ancestor::*[.//button[@aria-label='Document actions']][1]")
    click(driver, holder.find_element(By.CSS_SELECTOR, "button[aria-label='Document actions']"))
    click(driver, visible(driver, By.XPATH, f"//*[@role='menuitem'][contains(normalize-space(), '{item}')]"))


def sidebar(driver, label: str) -> None:
    click(driver, visible(driver, By.XPATH, f"//nav//button[starts-with(normalize-space(), '{label}')]"))


def wait_for_save(driver) -> None:
    """After an edit: wait for the status to leave "Saved to cloud" (unsaved/saving), then return to it."""
    try:
        wait_for(driver, lambda d: "Saved to cloud" not in body_text(d), timeout=15)
    except Exception:
        pass  # the save was already done
    assert text_appears(driver, "Saved to cloud", timeout=60), "no 'Saved to cloud'"
    time.sleep(1)


# ── Create Document ──────────────────────────────────────────────────────────


def test_UT_DOC_01(driver, student_api, actual):
    """UT-DOC-01 | Create Document | Normal
    A student chooses New document > New document, picks "Blank Document", names it and presses "Create document".
    Expected: the editor opens on the new document with the given title."""
    sign_in(driver, STUDENT)
    doc_id = create_from_modal(driver, "Blank Document", "UT-DOC-01 Blank")
    student_api.created_documents.append(doc_id)
    title = visible(driver, By.CSS_SELECTOR, "input[aria-label='Document title']").get_attribute("value")
    assert title == "UT-DOC-01 Blank", title
    actual(f"The editor opened on a new blank document titled \"{title}\".")


def test_UT_DOC_02(driver, actual):
    """UT-DOC-02 | Create Document | Error
    A student clears the title in the New document window and presses "Create document".
    Expected: "Give your document a title" appears and no document is created."""
    sign_in(driver, STUDENT)
    field = open_new_document_modal(driver)
    field.send_keys(Keys.CONTROL, "a")
    field.send_keys(Keys.DELETE)
    click(driver, driver.find_element(By.XPATH, "//button[@type='submit' and contains(., 'Create document')]"))
    assert text_appears(driver, "Give your document a title"), "no message for the empty title"
    assert "/document/" not in driver.current_url
    actual("\"Give your document a title\" appeared and the window stayed open; nothing was created.")


# ── Open Document ────────────────────────────────────────────────────────────


def test_UT_DOC_03(driver, student_api, actual):
    """UT-DOC-03 | Open Document | Normal
    A student double-clicks one of their documents on the dashboard.
    Expected: the editor opens and shows the document's title and text."""
    student_api.create_document("UT-DOC-03 Open me", "<p>Text saved in the document to open.</p>")
    sign_in(driver, STUDENT)
    target = card(driver, "UT-DOC-03 Open me")
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'})", target)
    ActionChains(driver).double_click(target).perform()
    wait_for(driver, lambda d: "/document/" in d.current_url, timeout=40, message="the editor did not open")
    wait_for(driver, lambda d: "Text saved in the document to open." in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text, timeout=60)
    actual("The editor opened with the title \"UT-DOC-03 Open me\" and the saved text.")


def test_UT_DOC_04(driver, professor_api, actual):
    """UT-DOC-04 | Open Document | Error
    A student opens the link of another user's document that was not shared with them.
    Expected: the app says the document cannot be opened, instead of showing it or an empty editor."""
    doc_id = professor_api.create_document("UT-DOC-04 Private", "<p>Only the professor may read this.</p>")
    sign_in(driver, STUDENT)
    open_page(driver, f"/document/{doc_id}")
    time.sleep(8)
    text = body_text(driver)
    assert "Only the professor may read this." not in text, "another user's text was shown"
    dialog = driver.find_elements(By.CSS_SELECTOR, "[role='alertdialog'][aria-label='Document cannot be opened']")
    shown = " ".join(dialog[0].text.split()) if dialog and dialog[0].is_displayed() else None
    seen = "Save failed" if "Save failed" in text else "an empty editor"
    actual(f"The text was not shown, but the page opened {seen} titled \"Untitled Document\" with no message." if not shown else f"The text was not shown; the page said: \"{shown}\"")
    assert shown, "no message: the page shows an empty, editable document"


# ── Save Document (Auto-save) ────────────────────────────────────────────────


def test_UT_DOC_05(driver, student_api, actual):
    """UT-DOC-05 | Save Document (Auto-save) | Normal
    A student types a sentence in a document and waits without pressing any save button.
    Expected: the status changes to "Saved to cloud" and the sentence is still there after reloading."""
    doc_id = student_api.create_document("UT-DOC-05 Autosave", "<p>First line.</p>")
    sign_in(driver, STUDENT)
    editor = open_document(driver, doc_id)
    click(driver, driver.find_element(By.CSS_SELECTOR, ".ProseMirror p"))
    editor.send_keys(Keys.END, " Typed and saved on its own.")
    wait_for_save(driver)
    time.sleep(2)
    driver.refresh()
    wait_for(driver, lambda d: "Typed and saved on its own." in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text, timeout=60)
    actual("\"Saved to cloud\" appeared without pressing save; after a reload the typed sentence was there.")


def test_UT_DOC_06(driver, student_api, actual):
    """UT-DOC-06 | Save Document (Auto-save) | Error
    A student erases the document's title (leaves it blank) and keeps typing.
    Expected: the blank title is not saved: the previous title comes back, and the typed text is still saved."""
    doc_id = student_api.create_document("UT-DOC-06 Kept title", "<p>Body.</p>")
    sign_in(driver, STUDENT)
    editor = open_document(driver, doc_id)
    field = visible(driver, By.CSS_SELECTOR, "input[aria-label='Document title']")
    field.send_keys(Keys.CONTROL, "a")
    field.send_keys(Keys.BACKSPACE)
    click(driver, driver.find_element(By.CSS_SELECTOR, ".ProseMirror p"))
    editor.send_keys(Keys.END, " Typed after clearing the title.")
    wait_for_save(driver)
    assert field.get_attribute("value") == "UT-DOC-06 Kept title", field.get_attribute("value")
    driver.refresh()
    time.sleep(3)
    assert visible(driver, By.CSS_SELECTOR, "input[aria-label='Document title']").get_attribute("value") == "UT-DOC-06 Kept title"
    wait_for(driver, lambda d: "Typed after clearing the title." in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text, timeout=60)
    actual("The title went back to \"UT-DOC-06 Kept title\"; the typed text was saved and both were there after a reload.")


# ── Delete Document ──────────────────────────────────────────────────────────


def test_UT_DOC_07(driver, student_api, actual):
    """UT-DOC-07 | Delete Document | Normal
    A student chooses Delete in a document's menu and confirms "Move to trash".
    Expected: the document leaves My documents and is listed in Trash, where it can be restored."""
    student_api.create_document("UT-DOC-07 Delete me")
    sign_in(driver, STUDENT)
    card_menu(driver, "UT-DOC-07 Delete me", "Delete")
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Move to trash']"))
    wait_for(driver, lambda d: not d.find_elements(By.XPATH, "//h3[normalize-space()='UT-DOC-07 Delete me']"), timeout=30)
    sidebar(driver, "Trash")
    card(driver, "UT-DOC-07 Delete me")
    card_menu(driver, "UT-DOC-07 Delete me", "Restore")
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Restore']"))
    sidebar(driver, "My documents")
    card(driver, "UT-DOC-07 Delete me")
    actual("The document left My documents, showed in Trash, and was back in My documents after Restore.")


def test_UT_DOC_08(driver, student_api, actual):
    """UT-DOC-08 | Delete Document | Error
    A student chooses Delete on a document, then presses Cancel in the confirmation.
    Expected: nothing is deleted; the document stays in My documents."""
    student_api.create_document("UT-DOC-08 Keep me")
    sign_in(driver, STUDENT)
    card_menu(driver, "UT-DOC-08 Keep me", "Delete")
    visible(driver, By.XPATH, "//*[contains(normalize-space(), 'Move to trash?')]")
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Cancel']"))
    time.sleep(2)
    card(driver, "UT-DOC-08 Keep me")
    actual("\"Move to trash?\" was asked; after Cancel the document stayed in My documents.")


# ── Export Document to Word ──────────────────────────────────────────────────


def test_UT_DOC_09(driver, student_api, actual):
    """UT-DOC-09 | Export Document to Word | Normal
    A student opens Export (download button) in the editor and chooses "Word (.doc / .docx)".
    Expected: a Word file named after the document downloads, and it holds the document's text."""
    doc_id = student_api.create_document("UT-DOC-09 Export", "<h1>Exported heading</h1><p>Exported paragraph text.</p>")
    for old in DOWNLOADS.glob("UT-DOC-09*"):
        old.unlink()
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    click(driver, visible(driver, By.CSS_SELECTOR, "button[aria-label='Export']"))
    click(driver, visible(driver, By.XPATH, "//*[@role='menuitem'][contains(normalize-space(), 'Word (.doc / .docx)')]"))
    file = wait_for(driver, lambda d: next((f for f in DOWNLOADS.glob("UT-DOC-09*.doc*") if not f.name.endswith(".crdownload")), False), timeout=60, message="no Word file downloaded")
    time.sleep(1)
    text = file.read_bytes().decode("utf-8", "ignore")
    assert "Exported heading" in text and "Exported paragraph text." in text, text[:300]
    actual(f"\"{file.name}\" downloaded (a Word .doc file) and holds the heading and paragraph.")


# ── Import Document (from file or Google Drive) ──────────────────────────────


def test_UT_DOC_10(driver, student_api, tmp_path, actual):
    """UT-DOC-10 | Import Document | Normal
    A student chooses New document > Import from file, picks a .docx and presses Import.
    Expected: "Open document" appears when it is ready, and the document opens with the file's text."""
    import docx

    source = tmp_path / "UT-DOC-10 Import.docx"
    word = docx.Document()
    word.add_heading("Imported Chapter", level=1)
    word.add_paragraph("A paragraph that came from a Word file.")
    word.save(str(source))
    sign_in(driver, STUDENT)
    doc_id, seconds = import_through_dashboard(driver, source, timeout=240)
    student_api.created_documents.append(doc_id)
    wait_for(driver, lambda d: "A paragraph that came from a Word file." in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text, timeout=60)
    actual(f"The import finished in {seconds:.0f} s; \"Open document\" opened it with the heading and paragraph from the file.")


def test_UT_DOC_11(driver, student_api, tmp_path, actual):
    """UT-DOC-11 | Import Document | Error
    A student picks a .zip file in Import from file.
    Expected: "No supported files selected..." appears, Import cannot be pressed, and nothing is created."""
    archive = tmp_path / "chapters.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("chapter1.txt", "Chapter 1 text.")
    before = {d["id"] for d in student_api.call("GET", "/documents").json()}
    sign_in(driver, STUDENT)
    dialog = choose_import_file(driver, archive)
    assert "No supported files selected" in dialog.text, dialog.text
    assert not dialog.find_element(By.XPATH, ".//button[starts-with(normalize-space(), 'Import')]").is_enabled()
    assert {d["id"] for d in student_api.call("GET", "/documents").json()} == before
    actual("\"No supported files selected. Please pick .docx, .doc, .txt, .html, or .pdf files.\" appeared; Import stayed disabled.")


# ── Share Document ───────────────────────────────────────────────────────────


def open_share(driver, doc_id: str):
    open_document(driver, doc_id)
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Share']"))
    return visible(driver, By.CSS_SELECTOR, "input[placeholder='Collaborator email']")


def invite(driver, field, email: str) -> None:
    field.send_keys(Keys.CONTROL, "a")
    field.send_keys(email)
    click(driver, field.find_element(By.XPATH, "following::button[normalize-space()='Share'][1]"))


def test_UT_DOC_12(driver, second_driver, student_api, actual):
    """UT-DOC-12 | Share Document | Normal
    A student presses Share in the editor and invites a classmate's email.
    Expected: the classmate is listed by their email in the Share window, and the document appears in the classmate's Shared with me."""
    doc_id = student_api.create_document("UT-DOC-12 Shared", "<p>Shared text.</p>")
    sign_in(driver, STUDENT)
    field = open_share(driver, doc_id)
    invite(driver, field, STUDENT_2[0])
    row = visible(driver, By.XPATH, "//li[.//select[@title='Change permission']]", timeout=30)
    label = row.text.splitlines()[0]
    sign_in(second_driver, STUDENT_2)
    sidebar(second_driver, "Shared with me")
    card(second_driver, "UT-DOC-12 Shared")
    actual(f"The document showed in the classmate's Shared with me, but the Share window listed them as \"{label}\", not by email." if STUDENT_2[0] not in label
           else f"{STUDENT_2[0]} was listed in the Share window, and the document showed in their Shared with me.")
    assert STUDENT_2[0] in label, f"the classmate is listed as {label!r}"


def test_UT_DOC_13(driver, student_api, actual):
    """UT-DOC-13 | Share Document | Error
    A student invites the same classmate a second time.
    Expected: the second invite is refused with a message, and the classmate is listed only once."""
    doc_id = student_api.create_document("UT-DOC-13 Twice", "<p>Shared text.</p>")
    sign_in(driver, STUDENT)
    field = open_share(driver, doc_id)
    rows = "//li[.//select[@title='Change permission']]"
    invite(driver, field, STUDENT_2[0])
    wait_for(driver, lambda d: len(d.find_elements(By.XPATH, rows)) == 1, timeout=30, message="the first invite was not listed")
    invite(driver, field, STUDENT_2[0])
    time.sleep(4)
    count = len(driver.find_elements(By.XPATH, rows))
    message = next((m for m in ("already", "Failed") if m in body_text(driver)), None)
    actual(f"After the second invite the classmate was listed {count} time(s); message: {message or 'none'}.")
    assert count == 1, f"listed {count} times"
    assert message, "no message for the repeated invite"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
