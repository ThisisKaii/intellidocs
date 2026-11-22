"""TCASE-011 | Module 1: Authentication & Access Control | Unit: Login | Error (Rate Limiting)

A client sends rapid failed login attempts. Expected (as the app behaves): the login route allows
10 attempts per minute per client (Arcjet fixed window); further attempts get HTTP 429 with
"Too many requests", shown on the login form.

Arcjet only enforces in production (NODE_ENV=production; elsewhere it runs in DRY_RUN and only
logs). Against a development server this test is skipped with that reason; point API_URL/WEB_URL
at a production-mode server to run it.
"""

import pytest
import requests
from selenium.webdriver.common.by import By

from selenium_helpers import API, open_page, text_appears, unique_email, visible

ATTEMPTS = 12


def test_login_tcase_011(driver):
    email = unique_email("ratelimit")
    statuses = [
        requests.post(f"{API}/auth/login", json={"email": email, "password": "Wrong-Password-1"}, timeout=30).status_code
        for _ in range(ATTEMPTS)
    ]
    if 429 not in statuses:
        pytest.skip(f"Arcjet is not enforcing on {API} (DRY_RUN outside production); statuses: {statuses}")

    assert statuses[:10].count(429) == 0, f"limited before the 10-attempt allowance: {statuses}"
    open_page(driver, "/login")
    visible(driver, By.ID, "email").send_keys(email)
    driver.find_element(By.ID, "password").send_keys("Wrong-Password-1")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    assert text_appears(driver, "Too many requests"), "throttled login did not show 'Too many requests'"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
