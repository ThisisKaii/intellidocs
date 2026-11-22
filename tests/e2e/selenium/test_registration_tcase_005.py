"""TCASE-005 | Module 1: Authentication & Access Control | Unit: Registration | Error (Weak Password)

Guest registers with a password shorter than the minimum. Expected (as the app behaves): the
minimum is 6 characters (no symbol rule); a 5-character password (`abc12`) is rejected with
"Password must be at least 6 characters." and no account is created.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import open_page, text_appears, unique_email, visible


def test_registration_tcase_005(driver):
    open_page(driver, "/register")
    visible(driver, By.ID, "reg-first-name").send_keys("Weak")
    driver.find_element(By.ID, "reg-last-name").send_keys("Password")
    driver.find_element(By.ID, "reg-email").send_keys(unique_email("tcase005"))
    driver.find_element(By.ID, "reg-password").send_keys("abc12")
    driver.find_element(By.ID, "reg-confirm-password").send_keys("abc12")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    assert text_appears(driver, "Password must be at least 6 characters."), "short password was not rejected"
    assert "/register" in driver.current_url


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
