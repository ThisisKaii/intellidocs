"""TCASE-039 | Module 4: ML Prediction Cascade | Unit: Prediction Cascade | Error (ML Microservice Offline)

The FastAPI ML service (port 8001) is stopped while a user is editing. The test stops it, checks
the editor and the server's suggestion endpoint, then starts the service again.

Expected (as the app behaves): the editor keeps working with no freeze (typing still lands at once), and the
server's suggestion check (/formatting/tier-check) answers quickly from what it can still use
(the document's preset and the genre's base rules) instead of failing.
"""

import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, click, ml_is_up, open_document, show_evidence, sign_in, start_ml_service, stop_ml_service

TEXT = "Statement of the Problem"
TYPING_LIMIT_MS = 500
ANSWER_LIMIT_MS = 5000


def test_prediction_cascade_tcase_039(driver, student_api, tmp_path):
    assert ml_is_up(), "the ML service must be running before this case stops it"
    doc_id = student_api.create_document("TCASE-039 ML Offline", "<h1>Introduction</h1><p>Text before the service stopped.</p>")
    sign_in(driver, STUDENT)
    editor = open_document(driver, doc_id)

    stop_ml_service()
    try:
        assert not ml_is_up(timeout=2), "the ML service is still answering"

        # The editor keeps working: a keystroke appears without delay.
        click(driver, driver.find_element(By.CSS_SELECTOR, ".ProseMirror p"))
        started = time.perf_counter()
        editor.send_keys(" Typed while offline.")
        driver.execute_script("return document.querySelector('.ProseMirror').textContent")
        typing_ms = (time.perf_counter() - started) * 1000
        assert "Typed while offline." in editor.text
        errors = [e.text for e in driver.find_elements(By.CSS_SELECTOR, "[role=alertdialog]") if e.text.strip()]

        # The server's suggestion check with no ML service behind it.
        started = time.perf_counter()
        answer = student_api.call("POST", "/formatting/tier-check", {"text": TEXT, "documentId": doc_id})
        answer_ms = (time.perf_counter() - started) * 1000
        body = answer.text[:200]
        driver.save_screenshot(str(tmp_path / "editor_offline.png"))
    finally:
        start_ml_service(tmp_path / "ml_restart.log")

    show_evidence(driver, "TCASE-039 ML microservice offline", [
        ("ML service", "stopped by the test, then restarted"),
        ("Typing while offline", f"{typing_ms:.0f} ms for 21 keystrokes; text kept"),
        ("Error dialogs in the editor", errors or "none"),
        ("tier-check status", answer.status_code),
        ("tier-check answer", body),
        ("tier-check time", f"{answer_ms:.0f} ms"),
    ])
    assert typing_ms < TYPING_LIMIT_MS * 21, f"typing took {typing_ms:.0f} ms"
    assert not errors, f"error dialog shown: {errors}"
    assert answer_ms < ANSWER_LIMIT_MS, f"tier-check took {answer_ms:.0f} ms"
    assert answer.status_code == 200, f"tier-check failed with {answer.status_code}: {body}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
