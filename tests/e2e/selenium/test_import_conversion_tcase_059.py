"""TCASE-059 | Module 8: Import & Conversion | Unit: Import Conversion | Error (Unsupported File Type)

A user picks an unsupported file (.zip) in the import dialog.

Expected (as the app behaves): the dialog refuses it before anything is uploaded, showing
"No supported files selected. Please pick .docx, .doc, .txt, .html, or .pdf files.", the Import
button stays disabled, and no document is created.
"""

import zipfile

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, choose_import_file, sign_in

MESSAGE = "No supported files selected. Please pick .docx, .doc, .txt, .html, or .pdf files."


def test_import_conversion_tcase_059(driver, student_api, tmp_path):
    archive = tmp_path / "chapter_files.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("chapter1.txt", "Chapter 1 text.")
    before = {d["id"] for d in student_api.call("GET", "/documents").json()}

    sign_in(driver, STUDENT)
    dialog = choose_import_file(driver, archive)
    assert MESSAGE in dialog.text, dialog.text
    button = dialog.find_element(By.XPATH, ".//button[starts-with(normalize-space(), 'Import')]")
    assert not button.is_enabled(), "the Import button accepts the .zip"

    after = {d["id"] for d in student_api.call("GET", "/documents").json()}
    assert after == before, "a document was created"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
