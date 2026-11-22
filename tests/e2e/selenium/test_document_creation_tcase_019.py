"""TCASE-019 | Module 2: Document Management & Cloud Storage | Unit: Document Creation | Error (Blank Title Rename)

A student clears the document title (whitespace only) and keeps typing in the document.
Expected (as the app behaves): a blank title is not saved: the previous valid title is kept (the
server ignores a blank title, and the title field shows the kept title again when the student
leaves it), while the rest of the save goes through, so text typed meanwhile is saved
("Saved to cloud"). After a reload the document shows the kept title and the new text.
"""

import time

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from selenium_helpers import FIGURES, STUDENT, click, open_document, sign_in, text_appears, visible, wait_for

TITLE = "TCASE-019 Valid Title"
TYPED = "Text typed while the title was blank."


def test_document_creation_tcase_019(driver, student_api):
    doc_id = student_api.create_document(TITLE)
    kept = student_api.call("PUT", f"/documents/{doc_id}", {"title": "   ", "content": "<p>Saved alongside a blank title.</p>"})
    assert kept.status_code == 200, kept.text[:200]
    assert kept.json()["title"] == TITLE

    sign_in(driver, STUDENT)
    editor = open_document(driver, doc_id)
    field = visible(driver, By.CSS_SELECTOR, "input[aria-label='Document title']")
    field.send_keys(Keys.CONTROL, "a")
    field.send_keys(Keys.BACKSPACE)
    field.send_keys("   ")
    click(driver, driver.find_element(By.CSS_SELECTOR, ".ProseMirror p"))
    editor.send_keys(Keys.END, " " + TYPED)

    assert field.get_attribute("value") == TITLE, "the title field did not go back to the kept title"
    assert text_appears(driver, "Saved to cloud", timeout=60), "the save did not go through"
    saved = student_api.call("GET", f"/documents/{doc_id}").json()
    assert saved["title"] == TITLE and TYPED in saved["content"], "the kept title or the typed text was not saved"
    driver.save_screenshot(str(FIGURES / "test_document_creation_tcase_019_kept.png"))

    driver.refresh()
    time.sleep(3)
    assert visible(driver, By.CSS_SELECTOR, "input[aria-label='Document title']").get_attribute("value") == TITLE
    wait_for(driver, lambda d: TYPED in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
