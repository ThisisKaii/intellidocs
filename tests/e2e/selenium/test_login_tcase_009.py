"""TCASE-009 | Module 1: Authentication & Access Control | Unit: Login | Error (Unregistered Email)

Guest signs in with an email that has no account. Expected: the same generic message as a wrong
password, "Invalid login credentials" (it does not reveal whether the email exists); the guest
stays on the login page.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import open_page, text_appears, unique_email, visible


def test_login_tcase_009(driver):
    open_page(driver, "/login")
    visible(driver, By.ID, "email").send_keys(unique_email("nobody"))
    driver.find_element(By.ID, "password").send_keys("Some-Password-1")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    assert text_appears(driver, "Invalid login credentials"), "unknown email was not rejected generically"
    assert "/login" in driver.current_url


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
