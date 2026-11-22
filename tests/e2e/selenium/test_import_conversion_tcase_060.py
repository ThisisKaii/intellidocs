"""TCASE-060 | Module 8: Import & Conversion | Unit: Import Conversion | Error (Encrypted Password PDF)

A user imports a password-protected (AES-256 encrypted) PDF.

Expected (as the app behaves): the import stops with a clear message that the PDF is password-protected and
must be unlocked (saved without a password) before importing; no document is created.
"""

import pymupdf
import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, choose_import_file, click, import_failure, sign_in


def locked_pdf(path) -> None:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Confidential research protocol.", fontsize=12)
    doc.save(path, encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="secret-123", owner_pw="owner-456")


def test_import_conversion_tcase_060(driver, student_api, tmp_path):
    source = tmp_path / "tcase060_protected.pdf"
    locked_pdf(source)
    assert pymupdf.open(source).needs_pass, "the fixture is not encrypted"
    before = {d["id"] for d in student_api.call("GET", "/documents").json()}

    sign_in(driver, STUDENT)
    dialog = choose_import_file(driver, source)
    click(driver, dialog.find_element(By.XPATH, ".//button[starts-with(normalize-space(), 'Import')]"))
    message = import_failure(driver)
    print(f"import message: {message!r}")

    after = {d["id"] for d in student_api.call("GET", "/documents").json()}
    student_api.created_documents.extend(after - before)
    assert after == before, "a document was created"
    assert "password" in message.lower() and "protected" in message.lower(), f"unclear message: {message!r}"
    assert "\\" not in message and "/tmp" not in message.lower(), f"the message exposes a server path: {message!r}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v", "-s"]))
