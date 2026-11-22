"""TCASE-012 | Module 1: Authentication & Access Control | Unit: TOTP 2FA | Non-Error (Enrollment)

A signed-in user enables the authenticator app in Settings → Security, reads the QR code's secret
and enters the matching 6-digit code. Expected (as the app behaves): the factor is verified, the
session is upgraded to AAL2, and Settings reports "2FA has been successfully enabled!" with the
authenticator app shown as active. (No backup recovery codes are issued.)

Uses a throwaway account, deleted again at the end.
"""

import pytest

from selenium_helpers import delete_account, enroll_totp, register_account, session_token, sign_in, text_appears, token_claims, unique_email

PASSWORD = "Chapter4-Pass!"


def test_totp_2fa_tcase_012(driver):
    email = unique_email("tcase012")
    register_account(email, PASSWORD)
    try:
        sign_in(driver, (email, PASSWORD))
        enroll_totp(driver)

        assert text_appears(driver, "2FA has been successfully enabled!"), "enrollment was not confirmed"
        assert text_appears(driver, "Authenticator App is currently active")
        token = session_token(driver)
        assert token and token_claims(token).get("aal") == "aal2", "session was not upgraded to AAL2"
    finally:
        token = session_token(driver)
        if token:
            delete_account(token, email)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
