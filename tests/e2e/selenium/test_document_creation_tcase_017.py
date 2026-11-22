"""TCASE-017 | Module 2: Document Management & Cloud Storage | Unit: Document Creation | Non-Error (Blank Document)

A student creates a document from the "Blank Document" template. Expected (as the app behaves):
the document is created with the default page setup, Short bond (8.5" x 13"), portrait, margins
1" top/right/bottom and 1.5" left, no academic preset, and body text in Times New Roman 11pt;
the editor opens on it.
"""

import time

import pytest

from selenium_helpers import STUDENT, create_from_modal, sign_in


def test_document_creation_tcase_017(driver, student_api):
    sign_in(driver, STUDENT)
    doc_id = create_from_modal(driver, "Blank Document", f"TCASE-017 Blank {int(time.time())}")
    student_api.created_documents.append(doc_id)

    record = student_api.call("GET", f"/documents/{doc_id}").json()
    assert record["page_size"] == "short"
    assert record["orientation"] == "portrait"
    assert record["margins"] == {"top": 1, "right": 1, "bottom": 1, "left": 1.5}
    assert record.get("formatting_preset") is None

    body = driver.execute_script(
        "const s = getComputedStyle(document.querySelector('.ProseMirror p') || document.querySelector('.ProseMirror'));"
        " return {font: s.fontFamily, size: s.fontSize}"
    )
    assert "Times New Roman" in body["font"], body
    assert body["size"] == "14.6667px", f"body text is not 11pt: {body}"  # 11pt = 14.67 CSS px


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
