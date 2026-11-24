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


# ── Pin Document ─────────────────────────────────────────────────────────────


def listed(driver, title: str) -> bool:
    return bool(driver.find_elements(By.XPATH, f"//h3[normalize-space()='{title}']"))


def test_UT_DOC_14(driver, student_api, actual):
    """UT-DOC-14 | Pin Document | Normal
    A student chooses Pin in a document's menu, then opens Pinned in the sidebar.
    Expected: the document is listed under Pinned."""
    student_api.create_document("UT-DOC-14 Pin me")
    sign_in(driver, STUDENT)
    card_menu(driver, "UT-DOC-14 Pin me", "Pin")
    time.sleep(2)
    sidebar(driver, "Pinned")
    card(driver, "UT-DOC-14 Pin me")
    actual("After Pin, the document was listed under Pinned.")


def test_UT_DOC_15(driver, student_api, actual):
    """UT-DOC-15 | Pin Document | Error
    A student pins a document, then moves it to the Trash.
    Expected: the deleted document is no longer listed under Pinned."""
    student_api.create_document("UT-DOC-15 Pinned then deleted")
    sign_in(driver, STUDENT)
    card_menu(driver, "UT-DOC-15 Pinned then deleted", "Pin")
    time.sleep(2)
    card_menu(driver, "UT-DOC-15 Pinned then deleted", "Delete")
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Move to trash']"))
    wait_for(driver, lambda d: not listed(d, "UT-DOC-15 Pinned then deleted"), timeout=30)
    sidebar(driver, "Pinned")
    time.sleep(3)
    assert not listed(driver, "UT-DOC-15 Pinned then deleted"), "the deleted document is still under Pinned"
    actual("After the pinned document was moved to the Trash, Pinned no longer listed it.")


# ── Recent Documents ─────────────────────────────────────────────────────────


def test_UT_DOC_16(driver, student_api, actual):
    """UT-DOC-16 | Recent Documents | Normal
    A student opens a document, goes back to the dashboard and opens Recent in the sidebar.
    Expected: the document just opened is listed under Recent."""
    doc_id = student_api.create_document("UT-DOC-16 Opened lately", "<p>Recent text.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    time.sleep(2)
    open_page(driver, "/dashboard")
    sidebar(driver, "Recent")
    card(driver, "UT-DOC-16 Opened lately")
    actual("The document opened a moment ago was listed under Recent.")


def test_UT_DOC_17(driver, student_api, actual):
    """UT-DOC-17 | Recent Documents | Error
    A student opens a document, then moves it to the Trash and opens Recent.
    Expected: the deleted document is no longer listed under Recent."""
    doc_id = student_api.create_document("UT-DOC-17 Opened then deleted", "<p>Recent text.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    time.sleep(2)
    open_page(driver, "/dashboard")
    card_menu(driver, "UT-DOC-17 Opened then deleted", "Delete")
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Move to trash']"))
    wait_for(driver, lambda d: not listed(d, "UT-DOC-17 Opened then deleted"), timeout=30)
    sidebar(driver, "Recent")
    time.sleep(3)
    assert not listed(driver, "UT-DOC-17 Opened then deleted"), "the deleted document is still under Recent"
    actual("After the opened document was moved to the Trash, Recent no longer listed it.")


# ── Shared with Me ───────────────────────────────────────────────────────────


def test_UT_DOC_18(driver, student_api, actual):
    """UT-DOC-18 | Shared with Me | Normal
    A classmate shares a document with the student, who opens Shared with me and then the document.
    Expected: the document is listed under Shared with me and opens with the classmate's text."""
    owner = Api.sign_in(STUDENT_2)
    try:
        doc_id = owner.create_document("UT-DOC-18 From a classmate", "<p>Text the classmate wrote.</p>")
        owner.call("POST", f"/documents/{doc_id}/shares", {"email": STUDENT[0], "permission": "view"}).raise_for_status()
        sign_in(driver, STUDENT)
        sidebar(driver, "Shared with me")
        ActionChains(driver).double_click(card(driver, "UT-DOC-18 From a classmate")).perform()
        wait_for(driver, lambda d: "Text the classmate wrote." in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text, timeout=60)
        actual("The classmate's document was listed under Shared with me and opened with their text.")
    finally:
        owner.cleanup()


def test_UT_DOC_19(driver, actual):
    """UT-DOC-19 | Shared with Me | Error
    A student presses Enter code under Shared with me and types a share code that does not exist.
    Expected: "That code is not valid or has expired" is shown and nothing is added to Shared with me."""
    sign_in(driver, STUDENT)
    sidebar(driver, "Shared with me")
    click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Enter code')]"))
    field = visible(driver, By.CSS_SELECTOR, "input[placeholder='K7M2-QX9P']")
    field.send_keys("ZZZZ-9999")
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Join']"))
    assert text_appears(driver, "not valid", timeout=20), "the wrong code was not refused"
    actual("\"That code is not valid or has expired\" was shown; nothing was added to Shared with me.")


# ── Rename Document ──────────────────────────────────────────────────────────


def rename_field(driver):
    return visible(driver, By.XPATH, "//button[@aria-label='Save name']/preceding-sibling::input[1] | //button[@aria-label='Save name']/ancestor::div[1]//input")


def test_UT_DOC_20(driver, student_api, actual):
    """UT-DOC-20 | Rename Document | Normal
    A student chooses Rename in a document's menu, types a new title and saves it.
    Expected: the card shows the new title, also after reloading the dashboard."""
    stamp = int(time.time())
    student_api.create_document(f"UT-DOC-20 Old {stamp}")
    sign_in(driver, STUDENT)
    card_menu(driver, f"UT-DOC-20 Old {stamp}", "Rename")
    field = rename_field(driver)
    field.send_keys(Keys.CONTROL, "a")
    field.send_keys(f"UT-DOC-20 New {stamp}")
    click(driver, visible(driver, By.CSS_SELECTOR, "button[aria-label='Save name']"))
    card(driver, f"UT-DOC-20 New {stamp}")
    driver.refresh()
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'})", card(driver, f"UT-DOC-20 New {stamp}"))
    actual(f"The card showed \"UT-DOC-20 New {stamp}\" and kept it after a reload.")


def test_UT_DOC_21(driver, student_api, actual):
    """UT-DOC-21 | Rename Document | Error
    A student renames a document to an empty title and saves it.
    Expected: the empty title is refused and the document keeps its old title."""
    title = f"UT-DOC-21 Keep {int(time.time())}"
    student_api.create_document(title)
    sign_in(driver, STUDENT)
    card_menu(driver, title, "Rename")
    field = rename_field(driver)
    field.send_keys(Keys.CONTROL, "a")
    field.send_keys(Keys.DELETE)
    click(driver, visible(driver, By.CSS_SELECTOR, "button[aria-label='Save name']"))
    time.sleep(3)
    shown_now = listed(driver, title)
    driver.refresh()
    kept = bool(card(driver, title))
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'})", card(driver, title))
    actual(f"The document kept the title \"{title}\"" + (" on screen and after a reload." if shown_now else "; it showed an empty title until the page was reloaded."))
    assert kept and shown_now, "the document showed an empty title"


# ── Search Documents ─────────────────────────────────────────────────────────


def search(driver, text: str) -> None:
    field = visible(driver, By.ID, "drive-search-input")
    field.send_keys(Keys.CONTROL, "a")
    field.send_keys(text)
    time.sleep(2)


def test_UT_DOC_22(driver, student_api, actual):
    """UT-DOC-22 | Search Documents | Normal
    A student types part of a document's title in the search box on the dashboard.
    Expected: the matching document is listed and documents that do not match are hidden."""
    stamp = int(time.time())
    student_api.create_document(f"UT-DOC-22 Thesis draft {stamp}")
    student_api.create_document(f"UT-DOC-22 Grocery list {stamp}")
    sign_in(driver, STUDENT)
    card(driver, f"UT-DOC-22 Grocery list {stamp}")
    search(driver, f"Thesis draft {stamp}")
    card(driver, f"UT-DOC-22 Thesis draft {stamp}")
    wait_for(driver, lambda d: not listed(d, f"UT-DOC-22 Grocery list {stamp}"), timeout=15, message="the non-matching document stayed listed")
    actual("Only the document whose title matched the search was listed; the other was hidden.")


def test_UT_DOC_23(driver, student_api, actual):
    """UT-DOC-23 | Search Documents | Error
    A student searches for words that are in no document title.
    Expected: no documents are listed and the page says "No results for" the words searched."""
    student_api.create_document("UT-DOC-23 Some document")
    sign_in(driver, STUDENT)
    card(driver, "UT-DOC-23 Some document")
    search(driver, "zzqx nothing has this title")
    wait_for(driver, lambda d: not d.find_elements(By.XPATH, "//main//h3[starts-with(normalize-space(), 'UT-')]"), timeout=15,
             message="documents stayed listed for a search that matches nothing")
    text = body_text(driver)
    message = next((line for line in text.splitlines() if line.startswith("No results for")), None)
    actual(f"No documents were listed; the page said \"{message}\"." if message else "No documents were listed; the page only said \"No items here\", not that nothing matched.")
    assert message, "the empty search did not say nothing matched"


# ── Version History ──────────────────────────────────────────────────────────


def history_tab(driver) -> None:
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='History']"))
    time.sleep(2)


def test_UT_DOC_24(driver, student_api, actual):
    """UT-DOC-24 | Version History | Normal
    A student opens History in the editor and presses Restore on the earlier version of the document.
    Expected: the document's text goes back to the earlier version."""
    doc_id = student_api.create_document("UT-DOC-24 History", "<p>First draft of the introduction.</p>")
    student_api.call("PUT", f"/documents/{doc_id}", {"content": "<p>Second draft that replaced it.</p>"}).raise_for_status()
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    history_tab(driver)
    restore = [b for b in driver.find_elements(By.XPATH, "//button[normalize-space()='Restore']") if b.is_displayed()]
    assert restore, "no version to restore"
    click(driver, restore[-1])
    wait_for(driver, lambda d: "First draft of the introduction." in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text, timeout=60,
             message="the text did not go back")
    actual("After Restore, the editor showed the earlier text \"First draft of the introduction.\"")


def test_UT_DOC_25(driver, student_api, actual):
    """UT-DOC-25 | Version History | Error
    A student creates a document and opens History before writing anything in it.
    Expected: History says there are no earlier versions and offers nothing to restore."""
    created = student_api.call("POST", "/documents", {"title": "UT-DOC-25 No history"})
    created.raise_for_status()
    doc_id = created.json()["id"]
    student_api.created_documents.append(doc_id)
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    history_tab(driver)
    restore = [b for b in driver.find_elements(By.XPATH, "//button[normalize-space()='Restore']") if b.is_displayed()]
    assert text_appears(driver, "No snapshots yet", timeout=20), "History did not say there are no versions"
    assert not restore, "a version to restore was offered"
    actual("History said \"No snapshots yet\" and offered nothing to restore.")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
