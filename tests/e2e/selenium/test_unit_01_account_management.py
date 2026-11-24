"""Unit testing | Account Management (Amamence, Marjun)

Each case drives the app the way a user does and checks what the user sees. The first docstring
line of every case reads: <case id> | <unit> | <Normal or Error>; the rest is the case
description, then "Expected:" with the expected result.
"""

import time

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from selenium_helpers import (
    STUDENT,
    STUDENT_2,
    Api,
    body_text,
    click,
    delete_account,
    field_validity,
    open_page,
    sign_in,
    text_appears,
    unique_email,
    visible,
    wait_for,
)

PASSWORD = "Chapter4-Pass!"


def fill_registration(driver, first: str, last: str, email: str, password: str, confirm: str) -> None:
    open_page(driver, "/register")
    visible(driver, By.ID, "reg-first-name").send_keys(first)
    driver.find_element(By.ID, "reg-last-name").send_keys(last)
    driver.find_element(By.ID, "reg-email").send_keys(email)
    driver.find_element(By.ID, "reg-password").send_keys(password)
    driver.find_element(By.ID, "reg-confirm-password").send_keys(confirm)


# ── Registration ─────────────────────────────────────────────────────────────


def test_UT_ACC_01(driver, actual):
    """UT-ACC-01 | Registration | Normal
    A guest fills in the sign-up form with a first and last name, a new email and matching passwords.
    Expected: "Account created" appears and the dashboard opens for the new account."""
    email = unique_email("ut-acc-01")
    fill_registration(driver, "Unit", "Tester", email, PASSWORD, PASSWORD)
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    try:
        assert text_appears(driver, "Account created"), "no 'Account created' message"
        wait_for(driver, lambda d: "/dashboard" in d.current_url, message="the dashboard did not open")
        visible(driver, By.XPATH, "//*[contains(normalize-space(), 'My documents')]")
        actual("\"Account created\" appeared and the dashboard (My documents) opened for the new account.")
    finally:
        try:
            delete_account(Api.sign_in((email, PASSWORD)).token or "", email)
        except Exception:
            pass


def test_UT_ACC_02(driver, actual):
    """UT-ACC-02 | Registration | Error
    A guest signs up with an email that already has an account.
    Expected: the form shows "User already registered" and stays on the sign-up page."""
    fill_registration(driver, "Unit", "Tester", STUDENT[0], PASSWORD, PASSWORD)
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    assert text_appears(driver, "already registered"), "the duplicate email was not refused"
    assert "/register" in driver.current_url
    actual("\"User already registered\" was shown and the page stayed on sign-up.")


def test_UT_ACC_03(driver, actual):
    """UT-ACC-03 | Registration | Error
    A guest types two different passwords in "Password" and "Confirm password".
    Expected: "Passwords do not match" appears under the field and the form is not sent."""
    fill_registration(driver, "Unit", "Tester", unique_email("ut-acc-03"), PASSWORD, "Chapter4-Pass?")
    assert text_appears(driver, "Passwords do not match"), "no mismatch warning"
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    time.sleep(1.5)
    assert "Account created" not in body_text(driver) and "/register" in driver.current_url
    actual("\"Passwords do not match\" appeared and no account was created.")


def test_UT_ACC_04(driver, actual):
    """UT-ACC-04 | Registration | Error
    A guest chooses a 5-character password.
    Expected: "Password must be at least 6 characters." is shown and no account is created."""
    fill_registration(driver, "Unit", "Tester", unique_email("ut-acc-04"), "abc12", "abc12")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    assert text_appears(driver, "at least 6 characters"), "the short password was accepted"
    assert "/register" in driver.current_url
    actual("\"Password must be at least 6 characters.\" was shown; the page stayed on sign-up.")


# ── Login ────────────────────────────────────────────────────────────────────


def test_UT_ACC_05(driver, actual):
    """UT-ACC-05 | Login | Normal
    A registered user signs in with the correct email and password.
    Expected: the dashboard opens and shows the user's documents and their account button."""
    sign_in(driver, STUDENT)
    visible(driver, By.XPATH, "//*[contains(normalize-space(), 'My documents')]")
    visible(driver, By.CSS_SELECTOR, "button[aria-label='Account']")
    actual("The dashboard opened on My documents with the account button at the top right.")


def test_UT_ACC_06(driver, actual):
    """UT-ACC-06 | Login | Error
    A registered user signs in with a wrong password.
    Expected: "Invalid login credentials" is shown and the user stays on the sign-in page."""
    open_page(driver, "/login")
    visible(driver, By.ID, "email").send_keys(STUDENT[0])
    driver.find_element(By.ID, "password").send_keys("not-the-password")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    assert text_appears(driver, "Invalid login credentials"), "the wrong password was not refused"
    assert "/login" in driver.current_url
    actual("\"Invalid login credentials\" was shown; the user stayed on the sign-in page.")


def test_UT_ACC_07(driver, actual):
    """UT-ACC-07 | Login | Error
    A guest presses "Sign in" with the email and password left empty.
    Expected: the browser asks to fill in the email field and nothing is sent."""
    open_page(driver, "/login")
    email = visible(driver, By.ID, "email")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    state = field_validity(driver, email)
    assert state["valueMissing"], "the empty email was not flagged"
    assert "/login" in driver.current_url
    actual(f"The browser flagged the empty email (\"{state['message']}\"); the page stayed on sign-in.")


# ── Logout ───────────────────────────────────────────────────────────────────


def log_out(driver) -> None:
    click(driver, visible(driver, By.CSS_SELECTOR, "button[aria-label='Account']"))
    click(driver, visible(driver, By.XPATH, "//button[@role='menuitem' and contains(normalize-space(), 'Logout')]"))


def test_UT_ACC_08(driver, actual):
    """UT-ACC-08 | Logout | Normal
    A signed-in user opens the account menu and chooses "Logout".
    Expected: the sign-in page opens."""
    sign_in(driver, STUDENT)
    log_out(driver)
    wait_for(driver, lambda d: "/login" in d.current_url, message="the sign-in page did not open")
    visible(driver, By.ID, "email")
    actual("The sign-in page opened after choosing Logout.")


def test_UT_ACC_09(driver, actual):
    """UT-ACC-09 | Logout | Error
    After logging out, the user goes back to the dashboard's address.
    Expected: the documents are not shown; the app sends the user to the sign-in page."""
    sign_in(driver, STUDENT)
    log_out(driver)
    wait_for(driver, lambda d: "/login" in d.current_url)
    open_page(driver, "/dashboard")
    wait_for(driver, lambda d: "/login" in d.current_url, timeout=20, message="the dashboard opened without signing in")
    assert "My documents" not in body_text(driver)
    actual("Opening /dashboard after logout went to the sign-in page; no documents were shown.")


# ── Update Profile ───────────────────────────────────────────────────────────


def open_profile(driver):
    open_page(driver, "/settings?section=profile")
    return visible(driver, By.ID, "first-name"), visible(driver, By.ID, "last-name")


def retype(field, text: str) -> None:
    field.send_keys(Keys.CONTROL, "a")
    field.send_keys(Keys.DELETE)
    if text:
        field.send_keys(text)


def test_UT_ACC_10(driver, actual):
    """UT-ACC-10 | Update Profile | Normal
    A user changes their first and last name in Settings > Profile and presses "Save name".
    Expected: "Name saved." appears and the new name is still there after reloading the page."""
    sign_in(driver, STUDENT_2)
    first, last = open_profile(driver)
    before = (first.get_attribute("value"), last.get_attribute("value"))
    try:
        retype(first, "Renamed")
        retype(last, "Student")
        click(driver, visible(driver, By.XPATH, "//button[@type='submit' and contains(., 'Save name')]"))
        assert text_appears(driver, "Name saved."), "no 'Name saved.' message"
        first, last = open_profile(driver)
        wait_for(driver, lambda d: first.get_attribute("value") == "Renamed", timeout=20)
        assert last.get_attribute("value") == "Student"
        actual("\"Name saved.\" appeared; after a reload the profile showed Renamed Student.")
    finally:
        first, last = open_profile(driver)
        retype(first, before[0] or "e2e")
        retype(last, before[1] or "student-2")
        save = driver.find_elements(By.XPATH, "//button[@type='submit' and contains(., 'Save name')]")
        if save and save[0].is_enabled():
            click(driver, save[0])
            text_appears(driver, "Name saved.", timeout=15)


def test_UT_ACC_11(driver, actual):
    """UT-ACC-11 | Update Profile | Error
    A user clears their first name in Settings > Profile.
    Expected: "Enter your first name." appears and "Save name" cannot be pressed."""
    sign_in(driver, STUDENT_2)
    first, _last = open_profile(driver)
    retype(first, "")
    assert text_appears(driver, "Enter your first name."), "no message for the empty first name"
    save = visible(driver, By.XPATH, "//button[@type='submit' and contains(., 'Save name')]")
    assert not save.is_enabled(), "Save name could still be pressed"
    actual("\"Enter your first name.\" appeared and the Save name button was disabled.")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
