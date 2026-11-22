"""TCASE-034 | Module 3: TipTap Editor & Academic Presets | Unit: Real-Time Collaboration | Error (Connection Disruption)

The connection drops while a user is editing. Expected (as the app behaves): the editor shows
"Offline — changes buffered locally" and keeps what is typed on the device; when the connection
comes back the indicator clears and the offline edits are saved to the server.
"""

import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import FIGURES, STUDENT, open_document, sign_in, text_appears, wait_for

ONLINE = {"offline": False, "latency": 0, "download_throughput": -1, "upload_throughput": -1}
OFFLINE = {"offline": True, "latency": 0, "download_throughput": 0, "upload_throughput": 0}


def test_realtime_collaboration_tcase_034(driver, student_api):
    doc_id = student_api.create_document("TCASE-034 Offline Draft", "<h1>Introduction</h1><p>Text written before the connection dropped.</p>")
    sign_in(driver, STUDENT)
    editor = open_document(driver, doc_id)

    marker = f"Written-offline-{int(time.time())}"
    driver.set_network_conditions(**OFFLINE)
    try:
        assert text_appears(driver, "Offline — changes buffered locally"), "no offline indicator"
        driver.find_element(By.CSS_SELECTOR, ".ProseMirror p").click()
        editor.send_keys(" " + marker)
        time.sleep(3)
        assert marker in editor.text, "the editor did not keep the text typed offline"
        driver.save_screenshot(str(FIGURES / "test_realtime_collaboration_tcase_034_offline.png"))
    finally:
        driver.set_network_conditions(**ONLINE)

    wait_for(driver, lambda d: "Offline — changes buffered locally" not in d.find_element(By.TAG_NAME, "body").text, timeout=60, message="still offline after reconnecting")
    wait_for(
        driver,
        lambda d: marker in student_api.call("GET", f"/documents/{doc_id}").json().get("content", ""),
        timeout=90,
        message="the offline edit was not saved after reconnecting",
    )


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
