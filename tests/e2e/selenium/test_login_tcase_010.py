"""TCASE-010 | Module 1: Authentication & Access Control | Unit: Login | Error (Empty Credentials)

Guest presses "Sign in" with both fields empty. Expected (as the app behaves): the browser's
required-field validation blocks the form (email and password are both marked missing); nothing is
sent and the guest stays on the login page.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import field_validity, open_page, visible


def test_login_tcase_010(driver):
    open_page(driver, "/login")
    email = visible(driver, By.ID, "email")
    password = driver.find_element(By.ID, "password")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    assert field_validity(driver, email)["valueMissing"], "empty email was not flagged as required"
    assert field_validity(driver, password)["valueMissing"], "empty password was not flagged as required"
    assert "/login" in driver.current_url


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
