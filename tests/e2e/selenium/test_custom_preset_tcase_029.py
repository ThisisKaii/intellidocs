"""TCASE-029 | Module 3: TipTap Editor & Academic Presets | Unit: Custom Preset | Error (Corrupted Preset File)

A user uploads a file that is not a Word document, renamed to .docx. Expected (as the app behaves):
the upload is refused (HTTP 400) and the Preset Manager says why: "This file is not a readable
Word document (.docx). It may be damaged or saved in another format."; no preset is created.
"""

import os

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, open_document, open_preset_manager, sign_in, user_presets, visible


def test_custom_preset_tcase_029(driver, student_api, tmp_path):
    fake = tmp_path / "department_sample.docx"
    fake.write_bytes(os.urandom(4000))
    before = {p["preset_id"] for p in user_presets(student_api)}

    doc_id = student_api.create_document("TCASE-029 Preset Manager", "<h1>Introduction</h1><p>Body.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    open_preset_manager(driver).send_keys(str(fake))

    error = visible(driver, By.XPATH, "//p[@role='alert']", timeout=120)
    print(f"Preset Manager error: {error.text!r}")
    assert "not a readable Word document" in error.text, f"unclear refusal: {error.text!r}"
    assert {p["preset_id"] for p in user_presets(student_api)} == before, "a preset was created from a corrupt file"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v", "-s"]))
