"""TCASE-008 | Module 1: Authentication & Access Control | Unit: Login | Error (Incorrect Password)

Registered user enters a valid email with an incorrect password. Expected: authentication is
rejected with "Invalid login credentials" and the user stays on the login page.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, open_page, text_appears, visible


def test_login_tcase_008(driver):
    open_page(driver, "/login")
    visible(driver, By.ID, "email").send_keys(STUDENT[0])
    driver.find_element(By.ID, "password").send_keys("not-the-password")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    assert text_appears(driver, "Invalid login credentials"), "wrong password was not rejected"
    assert "/login" in driver.current_url
    assert driver.execute_script("return localStorage.getItem('authToken')") is None


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
