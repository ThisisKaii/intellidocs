"""TCASE-004 | Module 1: Authentication & Access Control | Unit: Registration | Error (Malformed Email)

Guest registers with an invalid email. Expected (as the app behaves):
- `student_at_domain.com` (no @): the browser's email-field validation blocks the form.
- `student@domain` (no top-level domain): passes the browser, and the server rejects it; the form
  shows "A valid email is required".
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import field_validity, open_page, text_appears, visible


def fill_form(driver, email):
    visible(driver, By.ID, "reg-first-name").send_keys("Malformed")
    driver.find_element(By.ID, "reg-last-name").send_keys("Email")
    field = driver.find_element(By.ID, "reg-email")
    field.send_keys(email)
    driver.find_element(By.ID, "reg-password").send_keys("Chapter4-Pass!")
    driver.find_element(By.ID, "reg-confirm-password").send_keys("Chapter4-Pass!")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    return field


def test_registration_tcase_004(driver):
    open_page(driver, "/register")
    field = fill_form(driver, "student_at_domain.com")
    state = field_validity(driver, field)
    assert state["typeMismatch"], f"'student_at_domain.com' was not flagged as an invalid email: {state}"

    open_page(driver, "/register")
    fill_form(driver, "student@domain")
    assert text_appears(driver, "A valid email is required"), "missing-TLD email was not rejected"
    assert "/register" in driver.current_url


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
