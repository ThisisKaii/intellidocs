"""TCASE-049 | Module 6: Originality Scanner | Unit: Originality Scanner | Error (Zero Word Count Document)

A professor starts a council scan on a submission with no text. Expected (as the app behaves): the scan is
refused (400) with a clear message that the document is too short to scan, and no scan is
started.
"""

import pytest

from selenium_helpers import seed_class_id, show_evidence


def test_originality_scanner_tcase_049(driver, professor_api, student2_api):
    folder = seed_class_id(professor_api)
    empty = student2_api.create_document("TCASE-049 Empty Submission", "<p></p>")
    student2_api.call("POST", f"/folders/{folder}/documents", {"documentId": empty}).raise_for_status()

    response = professor_api.call("POST", "/plagiarism/scans", {"documentId": empty, "folderId": folder, "scope": "local"})
    show_evidence(driver, "TCASE-049 Council scan of an empty document", [
        ("Submission", "TCASE-049 Empty Submission (0 words)"),
        ("Response status", response.status_code),
        ("Response", response.text[:300]),
    ])
    assert response.status_code == 400, f"the empty document was accepted with {response.status_code}"
    assert "words" in response.json().get("error", "").lower()


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
