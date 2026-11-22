"""TCASE-003 | Module 1: Authentication & Access Control | Unit: Registration | Error (Empty Name)

Guest submits the registration form with the name fields empty. Expected (as the app behaves): the
browser's required-field validation blocks submission ("Please fill out this field.") on the
First name field; no account is created and the guest stays on /register.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import field_validity, open_page, unique_email, visible


def test_registration_tcase_003(driver):
    open_page(driver, "/register")
    first_name = visible(driver, By.ID, "reg-first-name")
    driver.find_element(By.ID, "reg-email").send_keys(unique_email("tcase003"))
    driver.find_element(By.ID, "reg-password").send_keys("Chapter4-Pass!")
    driver.find_element(By.ID, "reg-confirm-password").send_keys("Chapter4-Pass!")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    state = field_validity(driver, first_name)
    assert state["valueMissing"], f"empty name was not flagged as required: {state}"
    assert state["message"], "no validation message on the name field"
    assert "/register" in driver.current_url


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
