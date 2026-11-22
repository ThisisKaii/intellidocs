"""TCASE-027 | Module 3: TipTap Editor & Academic Presets | Unit: Presets | Error (Restricted Institutional Preset)

A basic (not yet verified) account tries to use the "UCLM Capstone (Thesis)" preset. Expected (as
the app behaves): the preset stays off; the editor explains "Thesis presets are part of verified
student access." with an "Apply for verification" link, its chip is marked "(Verified Students
only)", and the server refuses it (HTTP 403 "Thesis presets require verified student status.").
The document keeps no preset.

Uses a throwaway basic account, deleted at the end.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import apply_preset_from_ribbon, delete_account, open_document, register_account, sign_in, text_appears, unique_email, visible

PASSWORD = "Chapter4-Pass!"


def test_presets_tcase_027(driver):
    email = unique_email("tcase027")
    account = register_account(email, PASSWORD)
    try:
        refused = account.call("POST", "/documents", {"title": "Thesis", "formatting_preset": "uclm_capstone"})
        assert refused.status_code == 403 and "Thesis presets require verified student status." in refused.text, refused.text

        doc_id = account.create_document("TCASE-027 Thesis", "<h1>Introduction</h1><p>Body.</p>")
        sign_in(driver, (email, PASSWORD))
        open_document(driver, doc_id)
        chip = None
        apply_preset_from_ribbon(driver, "UCLM Capstone (Thesis)")
        chip = driver.find_element(By.XPATH, "//button[contains(normalize-space(), 'UCLM Capstone (Thesis)')]")
        assert "(Verified Students only)" in (chip.get_attribute("title") or ""), "the chip is not marked as locked"

        assert text_appears(driver, "Thesis presets are part of verified student access."), "no explanation of the lock"
        visible(driver, By.XPATH, "//a[contains(., 'Apply for verification')]")
        assert account.call("GET", f"/documents/{doc_id}").json().get("formatting_preset") is None
    finally:
        delete_account(account.token or "", email)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
