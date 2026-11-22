"""TCASE-006 | Module 1: Authentication & Access Control | Unit: Registration | Error (Password Mismatch)

Guest enters a valid password but a different "Confirm password". Expected: the form warns
"Passwords do not match" under the field and refuses to submit ("Passwords do not match.").
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import body_text, open_page, text_appears, unique_email, visible


def test_registration_tcase_006(driver):
    open_page(driver, "/register")
    visible(driver, By.ID, "reg-first-name").send_keys("Mismatch")
    driver.find_element(By.ID, "reg-last-name").send_keys("Password")
    driver.find_element(By.ID, "reg-email").send_keys(unique_email("tcase006"))
    driver.find_element(By.ID, "reg-password").send_keys("Chapter4-Pass!")
    driver.find_element(By.ID, "reg-confirm-password").send_keys("Chapter4-Pass?")

    assert text_appears(driver, "Passwords do not match"), "no inline mismatch warning"
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    assert text_appears(driver, "Passwords do not match."), "submission was not refused"
    assert "Account created" not in body_text(driver)
    assert "/register" in driver.current_url


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
