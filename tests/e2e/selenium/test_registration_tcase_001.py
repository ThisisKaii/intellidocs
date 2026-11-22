"""TCASE-001 | Module 1: Authentication & Access Control | Unit: Registration | Non-Error (Happy Path)

Guest submits the registration form with a first and last name, a unique email and a valid
password. Expected (as the app behaves): the account is created in Supabase Auth, the user is
signed in at once ("Account created. Redirecting…") and lands on the dashboard (/dashboard).
There is no separate verification-email screen.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import Api, delete_account, open_page, text_appears, unique_email, visible, wait_for

PASSWORD = "Chapter4-Pass!"


def test_registration_tcase_001(driver):
    email = unique_email("tcase001")
    open_page(driver, "/register")
    visible(driver, By.ID, "reg-first-name").send_keys("Chapter")
    driver.find_element(By.ID, "reg-last-name").send_keys("Four")
    driver.find_element(By.ID, "reg-email").send_keys(email)
    driver.find_element(By.ID, "reg-password").send_keys(PASSWORD)
    driver.find_element(By.ID, "reg-confirm-password").send_keys(PASSWORD)
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    try:
        assert text_appears(driver, "Account created"), "no 'Account created' confirmation"
        wait_for(driver, lambda d: "/dashboard" in d.current_url, message="not redirected to /dashboard")
        # The account really exists: it can sign in through the API.
        created = Api.sign_in((email, PASSWORD))
        assert created.user_id
    finally:
        try:
            delete_account(Api.sign_in((email, PASSWORD)).token or "", email)
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
