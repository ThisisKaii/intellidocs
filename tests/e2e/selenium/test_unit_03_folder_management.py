"""Unit testing | Folder Management (Dagupan, Christian Paulo)

Each case drives the app the way a user does and checks what the user sees. The first docstring
line of every case reads: <case id> | <unit> | <Normal or Error>; the rest is the case
description, then "Expected:" with the expected result.
"""

import time
import uuid

import pytest
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from selenium_helpers import STUDENT, body_text, click, open_page, sign_in, text_appears, visible, wait_for


@pytest.fixture
def folders(student_api):
    """Names of folders a case creates; they are deleted again afterwards."""
    names: list[str] = []
    yield names
    for folder in student_api.call("GET", "/folders").json():
        if folder.get("name") in names or any(folder.get("name", "").startswith(n) for n in names):
            student_api.call("DELETE", f"/folders/{folder['folder_id']}")


def unique(label: str) -> str:
    return f"{label} {uuid.uuid4().hex[:4]}"


def folder_card(driver, name: str, timeout: float = 30):
    return visible(driver, By.XPATH, f"//h3[@title='{name}']", timeout=timeout)


def folder_menu(driver, name: str, item: str) -> None:
    holder = folder_card(driver, name).find_element(By.XPATH, "./ancestor::*[.//button[@aria-label='Folder actions']][1]")
    click(driver, holder.find_element(By.CSS_SELECTOR, "button[aria-label='Folder actions']"))
    click(driver, visible(driver, By.XPATH, f"//*[@role='menuitem'][contains(normalize-space(), '{item}')]"))


def open_new_folder(driver):
    open_page(driver, "/dashboard")
    visible(driver, By.XPATH, "//button[contains(normalize-space(), 'New document')]").click()
    click(driver, visible(driver, By.XPATH, "//*[@role='menuitem'][contains(normalize-space(), 'New folder')]"))
    return visible(driver, By.ID, "folder-name")


def make_folder(student_api, name: str) -> str:
    created = student_api.call("POST", "/folders", {"name": name})
    created.raise_for_status()
    return created.json()["folder_id"]


def rename_field(driver):
    return visible(driver, By.XPATH, "//button[@aria-label='Save name']/preceding-sibling::input[1] | //button[@aria-label='Save name']/ancestor::div[1]//input")


# ── Create Folder ────────────────────────────────────────────────────────────


def test_UT_FLD_01(driver, folders, actual):
    """UT-FLD-01 | Create Folder | Normal
    A student chooses New document > New folder, types a folder name and presses "Create folder".
    Expected: the new folder appears among the folders on the dashboard."""
    name = unique("UT-FLD-01 Drafts")
    folders.append(name)
    sign_in(driver, STUDENT)
    field = open_new_folder(driver)
    field.send_keys(name)
    click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Create folder')]"))
    try:
        folder_card(driver, name, timeout=20)
        shown = True
    except Exception:
        shown = False
    if not shown:
        driver.refresh()
        folder_card(driver, name, timeout=40)
        actual(f"The folder \"{name}\" was created but only appeared on the dashboard after reloading the page.")
    else:
        actual(f"The folder \"{name}\" appeared on the dashboard.")
    assert shown, "the new folder did not appear until the page was reloaded"


def test_UT_FLD_02(driver, actual):
    """UT-FLD-02 | Create Folder | Error
    A student presses "Create folder" with the folder name left empty.
    Expected: "Give the folder a name" appears and no folder is created."""
    sign_in(driver, STUDENT)
    open_new_folder(driver)
    click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Create folder')]"))
    assert text_appears(driver, "Give the folder a name"), "no message for the empty name"
    actual("\"Give the folder a name\" appeared and no folder was created.")


# ── Rename Folder ────────────────────────────────────────────────────────────


def test_UT_FLD_03(driver, student_api, folders, actual):
    """UT-FLD-03 | Rename Folder | Normal
    A student chooses Rename in a folder's menu, types a new name and saves it.
    Expected: the folder shows the new name, also after reloading the dashboard."""
    old, new = unique("UT-FLD-03 Old"), unique("UT-FLD-03 New")
    folders.extend([old, new])
    make_folder(student_api, old)
    sign_in(driver, STUDENT)
    folder_menu(driver, old, "Rename")
    field = rename_field(driver)
    field.send_keys(Keys.CONTROL, "a")
    field.send_keys(new)
    click(driver, visible(driver, By.CSS_SELECTOR, "button[aria-label='Save name']"))
    folder_card(driver, new)
    driver.refresh()
    folder_card(driver, new, timeout=40)
    actual(f"The folder showed \"{new}\" and kept that name after a reload.")


def test_UT_FLD_04(driver, student_api, folders, actual):
    """UT-FLD-04 | Rename Folder | Error
    A student renames a folder to an empty name and saves it.
    Expected: the empty name is refused and the folder keeps its old name."""
    old = unique("UT-FLD-04 Keep")
    folders.append(old)
    make_folder(student_api, old)
    sign_in(driver, STUDENT)
    folder_menu(driver, old, "Rename")
    field = rename_field(driver)
    field.send_keys(Keys.CONTROL, "a")
    field.send_keys(Keys.DELETE)
    click(driver, visible(driver, By.CSS_SELECTOR, "button[aria-label='Save name']"))
    time.sleep(3)
    shown_now = bool(driver.find_elements(By.XPATH, f"//h3[@title='{old}']"))
    driver.refresh()
    kept = bool(folder_card(driver, old, timeout=40))
    actual(f"The folder kept the name \"{old}\"" + (" on screen and after a reload." if shown_now else "; it showed an empty name until the page was reloaded."))
    assert kept and shown_now, "the folder showed an empty name"


# ── Delete Folder ────────────────────────────────────────────────────────────


def test_UT_FLD_05(driver, student_api, folders, actual):
    """UT-FLD-05 | Delete Folder | Normal
    A student chooses Delete in a folder's menu and confirms "Delete folder".
    Expected: the folder disappears; documents that were inside it are not deleted."""
    name = unique("UT-FLD-05 Remove")
    folders.append(name)
    folder_id = make_folder(student_api, name)
    doc_id = student_api.create_document(f"{name} doc")
    student_api.call("POST", f"/folders/{folder_id}/documents", {"documentId": doc_id}).raise_for_status()
    sign_in(driver, STUDENT)
    folder_menu(driver, name, "Delete")
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Delete folder']"))
    wait_for(driver, lambda d: not d.find_elements(By.XPATH, f"//h3[@title='{name}']"), timeout=30, message="the folder is still shown")
    assert student_api.call("GET", f"/documents/{doc_id}").ok, "the document inside was deleted"
    actual("The folder disappeared; the document that was inside it was still there.")


def test_UT_FLD_06(driver, student_api, folders, actual):
    """UT-FLD-06 | Delete Folder | Error
    A student chooses Delete on a folder, then presses Cancel in the confirmation.
    Expected: the folder is not deleted."""
    name = unique("UT-FLD-06 Stay")
    folders.append(name)
    make_folder(student_api, name)
    sign_in(driver, STUDENT)
    folder_menu(driver, name, "Delete")
    visible(driver, By.XPATH, "//*[contains(normalize-space(), 'Delete folder?')]")
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Cancel']"))
    time.sleep(2)
    folder_card(driver, name)
    actual("\"Delete folder?\" was asked; after Cancel the folder stayed.")


# ── Move Document to Folder ──────────────────────────────────────────────────

# HTML5 drag and drop: the same dragstart / dragover / drop events a mouse drag fires, with one
# DataTransfer carried between them (WebDriver's own drag cannot start an HTML5 drag).
DRAG = """
const [source, target] = arguments;
const data = new DataTransfer();
source.dispatchEvent(new DragEvent('dragstart', {bubbles: true, cancelable: true, dataTransfer: data}));
target.dispatchEvent(new DragEvent('dragenter', {bubbles: true, cancelable: true, dataTransfer: data}));
target.dispatchEvent(new DragEvent('dragover', {bubbles: true, cancelable: true, dataTransfer: data}));
target.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: data}));
source.dispatchEvent(new DragEvent('dragend', {bubbles: true, cancelable: true, dataTransfer: data}));
"""


def card_box(driver, title: str):
    """The draggable card (or drop target) that holds a title."""
    return visible(driver, By.XPATH, f"//h3[@title='{title}' or normalize-space()='{title}']/ancestor::*[@draggable][1]", timeout=30)


def test_UT_FLD_07(driver, student_api, folders, actual):
    """UT-FLD-07 | Move Document to Folder | Normal
    A student drags a document card onto a folder on the dashboard, then opens the folder.
    Expected: the document is listed inside the folder."""
    name = unique("UT-FLD-07 Target")
    folders.append(name)
    make_folder(student_api, name)
    title = f"{name} paper"
    student_api.create_document(title)
    sign_in(driver, STUDENT)
    driver.execute_script(DRAG, card_box(driver, title), card_box(driver, name))
    time.sleep(2)
    folder = folder_card(driver, name)
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'})", folder)
    ActionChains(driver).double_click(folder).perform()
    visible(driver, By.XPATH, f"//h1[contains(normalize-space(), '{name}')]", timeout=20)
    visible(driver, By.XPATH, f"//h3[normalize-space()='{title}']", timeout=30)
    actual(f"After dropping it on \"{name}\", the document was listed inside that folder.")


def test_UT_FLD_08(driver, student_api, folders, actual):
    """UT-FLD-08 | Move Document to Folder | Error
    A student drops a document card onto another document instead of a folder.
    Expected: nothing is moved; both documents stay where they were."""
    first, second = unique("UT-FLD-08 A"), unique("UT-FLD-08 B")
    student_api.create_document(first)
    second_id = student_api.create_document(second)
    sign_in(driver, STUDENT)
    driver.execute_script(DRAG, card_box(driver, first), card_box(driver, second))
    time.sleep(2)
    visible(driver, By.XPATH, f"//h3[normalize-space()='{first}']")
    visible(driver, By.XPATH, f"//h3[normalize-space()='{second}']")
    assert student_api.call("GET", f"/documents/{second_id}").ok
    actual("Nothing moved: both documents stayed in My documents.")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
