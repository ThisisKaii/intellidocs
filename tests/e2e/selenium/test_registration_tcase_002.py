"""TCASE-002 | Module 1: Authentication & Access Control | Unit: Registration | Error (Duplicate Email)

Guest registers with an email that already belongs to a registered user. Expected (as the app
behaves): registration is rejected and the form shows Supabase's message "User already registered";
the guest stays on /register.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, open_page, text_appears, visible


def test_registration_tcase_002(driver):
    open_page(driver, "/register")
    visible(driver, By.ID, "reg-first-name").send_keys("Duplicate")
    driver.find_element(By.ID, "reg-last-name").send_keys("Student")
    driver.find_element(By.ID, "reg-email").send_keys(STUDENT[0])
    driver.find_element(By.ID, "reg-password").send_keys("Another-Pass-123")
    driver.find_element(By.ID, "reg-confirm-password").send_keys("Another-Pass-123")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    assert text_appears(driver, "User already registered"), "duplicate email was not rejected with 'User already registered'"
    assert "/register" in driver.current_url


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
