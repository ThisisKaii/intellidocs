"""TCASE-028 | Module 3: TipTap Editor & Academic Presets | Unit: Custom Preset | Non-Error (Upload Thesis DOCX)

A user uploads a sample .docx in the Preset Manager ("Make a preset from a document"). Expected (as
the app behaves): the converter reads the document's page setup and styles (margins, font sizes,
line spacing, heading styles) and adds a reusable preset tile named after the file under
"Presets from your documents".
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import FIXTURES, STUDENT, open_document, open_preset_manager, sign_in, text_appears, user_presets, visible

SAMPLE = FIXTURES / "import_baselines" / "documents" / "ieee_sample_paper.docx"
NAME = "ieee_sample_paper"


def test_custom_preset_tcase_028(driver, student_api):
    before = {p["preset_id"] for p in user_presets(student_api)}
    doc_id = student_api.create_document("TCASE-028 Preset Manager", "<h1>Introduction</h1><p>Body.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    open_preset_manager(driver).send_keys(str(SAMPLE))

    try:
        assert text_appears(driver, NAME, timeout=180), "no preset tile for the uploaded document"
        added = [p for p in user_presets(student_api) if p["preset_id"] not in before]
        assert len(added) == 1, f"expected one new preset, got {added}"
        preset = added[0]
        assert preset["name"] == NAME
        blueprint = preset.get("blueprint") or {}
        assert blueprint.get("margins") and blueprint.get("baseFontSize") and blueprint.get("headings"), f"styles not extracted: {blueprint}"
        visible(driver, By.XPATH, "//h4[contains(., 'Presets from your documents')]")
    finally:
        for preset in user_presets(student_api):
            if preset["preset_id"] not in before:
                student_api.call("DELETE", f"/formatting/user-presets/{preset['preset_id']}")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
