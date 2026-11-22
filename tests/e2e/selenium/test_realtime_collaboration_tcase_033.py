"""TCASE-033 | Module 3: TipTap Editor & Academic Presets | Unit: Real-Time Collaboration | Non-Error (Multi-User Cursors)

Two people open the same document in separate browsers (the owner, and a classmate it is shared
with for editing). Expected (as the app behaves): each sees the other's cursor as a coloured caret
with the person's initials (full name on hover), and text typed in one browser appears in the
other through the live connection, without reloading. The test measures that delay and prints it
(it allows up to 2 s; on a local server it is typically well under a second).
"""

import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, STUDENT_2, click, open_document, sign_in, text_appears, visible, wait_for

OWNER_NAME = "Ana Reyes"
LIMIT_MS = 2000

SEEN_AT = """
const done = arguments[arguments.length - 1];
const needle = arguments[0];
const started = Date.now();
const check = () => {
  const editor = document.querySelector('.ProseMirror');
  if (editor && editor.textContent.includes(needle)) { done(Date.now()); return }
  if (Date.now() - started > 20000) { done(-1); return }
  requestAnimationFrame(check);
};
check();
"""


def test_realtime_collaboration_tcase_033(driver, second_driver, student_api):
    doc_id = student_api.create_document("TCASE-033 Shared Draft", "<h1>Introduction</h1><p>Shared paragraph for both authors.</p>")
    shared = student_api.call("POST", f"/documents/{doc_id}/shares", {"email": STUDENT_2[0], "permission": "edit"})
    assert shared.status_code in (200, 201), shared.text[:200]

    sign_in(driver, STUDENT)
    owner_editor = open_document(driver, doc_id)
    # Live editing needs the editor's saved JSON (a document saved only as HTML opens solo), so
    # the owner edits and saves once, the way any document written in the editor already is.
    click(driver, driver.find_element(By.CSS_SELECTOR, ".ProseMirror p"))
    owner_editor.send_keys(" Draft.")
    assert text_appears(driver, "Saved to cloud", timeout=60), "the owner's edit was not saved"
    wait_for(driver, lambda d: student_api.call("GET", f"/documents/{doc_id}").json().get("content_json"), timeout=60, message="no editor JSON saved")
    owner_editor = open_document(driver, doc_id)
    sign_in(second_driver, STUDENT_2)
    open_document(second_driver, doc_id)
    second_driver.set_script_timeout(30)

    # The owner's cursor appears in the classmate's editor with the owner's initials.
    click(driver, driver.find_element(By.CSS_SELECTOR, ".ProseMirror p"))
    caret = visible(second_driver, By.CSS_SELECTOR, ".collab-caret__label", timeout=30)
    assert caret.get_attribute("title") == OWNER_NAME and caret.text == "AR", f"remote caret: {caret.text!r} / {caret.get_attribute('title')!r}"

    # Text typed by the owner reaches the classmate's editor.
    marker = f"Synced-{int(time.time())}"
    driver.find_element(By.CSS_SELECTOR, ".ProseMirror p").click()
    typed_at = driver.execute_script("return Date.now()")
    owner_editor.send_keys(" " + marker)
    seen_at = second_driver.execute_async_script(SEEN_AT, marker)
    assert seen_at > 0, "the typed text never reached the second browser"
    delay = seen_at - typed_at
    print(f"edit seen by the collaborator after {delay} ms")
    assert delay <= LIMIT_MS, f"syncing took {delay} ms"
    wait_for(second_driver, lambda d: marker in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v", "-s"]))
