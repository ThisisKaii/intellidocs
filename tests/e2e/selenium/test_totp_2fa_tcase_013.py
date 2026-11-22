"""TCASE-013 | Module 1: Authentication & Access Control | Unit: TOTP 2FA | Error (Invalid 6-Digit Code)

A user with 2FA enabled signs in and enters a wrong 6-digit code at the two-factor challenge.
Expected (as the app behaves): the challenge is rejected with "That code is not correct. Try the
newest one."; the user stays on the challenge and the session is not upgraded (no dashboard).

Uses a throwaway account with 2FA enabled in the test, deleted again at the end.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import (
    click,
    delete_account,
    enroll_totp,
    open_page,
    register_account,
    session_token,
    sign_in,
    text_appears,
    totp,
    unique_email,
    visible,
    wait_for,
)

PASSWORD = "Chapter4-Pass!"


def test_totp_2fa_tcase_013(driver):
    email = unique_email("tcase013")
    register_account(email, PASSWORD)
    secret = ""
    try:
        sign_in(driver, (email, PASSWORD))
        secret = enroll_totp(driver)
        assert text_appears(driver, "2FA has been successfully enabled!")

        # Sign out and back in: the password alone now leads to the two-factor challenge.
        driver.delete_all_cookies()
        driver.execute_script("localStorage.clear(); sessionStorage.clear()")
        open_page(driver, "/login")
        visible(driver, By.ID, "email").send_keys(email)
        driver.find_element(By.ID, "password").send_keys(PASSWORD)
        driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

        code = visible(driver, By.ID, "mfa-code")
        wrong = str((int(totp(secret)) + 1) % 1_000_000).zfill(6)
        code.send_keys(wrong)
        click(driver, driver.find_element(By.XPATH, "//button[contains(., 'Verify and sign in')]"))

        assert text_appears(driver, "That code is not correct. Try the newest one."), "wrong code was not rejected"
        assert "/dashboard" not in driver.current_url
    finally:
        # Finish signing in with the right code, so the account can be deleted with a full session.
        if secret:
            try:
                field = driver.find_element(By.ID, "mfa-code")
                field.clear()
                field.send_keys(totp(secret))
                click(driver, driver.find_element(By.XPATH, "//button[contains(., 'Verify and sign in')]"))
                wait_for(driver, lambda d: "/dashboard" in d.current_url, timeout=20)
            except Exception:
                pass
        token = session_token(driver)
        if token:
            delete_account(token, email)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
