"""TCASE-007 | Module 1: Authentication & Access Control | Unit: Login | Non-Error (Valid Login)

Registered user signs in with a valid email and the correct password. Expected (as the app
behaves): a Supabase JWT is issued and stored for the session (localStorage `authToken`), and the
user is redirected to the document dashboard at /dashboard.
"""

import pytest
import requests
from selenium.webdriver.common.by import By

from selenium_helpers import API, STUDENT, open_page, token_claims, visible, wait_for


def test_login_tcase_007(driver):
    open_page(driver, "/login")
    visible(driver, By.ID, "email").send_keys(STUDENT[0])
    driver.find_element(By.ID, "password").send_keys(STUDENT[1])
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    wait_for(driver, lambda d: "/dashboard" in d.current_url, message="not redirected to /dashboard")
    token = driver.execute_script("return localStorage.getItem('authToken')")
    assert token and token.count(".") == 2, "no JWT stored for the session"
    # The token is this user's, and the API accepts it.
    assert token_claims(token).get("email") == STUDENT[0]
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert me.status_code == 200 and me.json().get("role") == "student"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
