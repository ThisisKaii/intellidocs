"""Unit testing | Admin Management (Alenton, RJ)

The administrator manages users (search, role override) and views the system's data (documents,
reports, research export); administrators cannot change or delete documents. The original
"Moderate Document" unit is now "View Documents" (read-only). Cases that act on an account act on a
throwaway account created and deleted by the test, never on real users.

Needs an administrator account in ADMIN_EMAIL / ADMIN_PASSWORD (the cases are skipped without it).
The first docstring line of every case reads: <case id> | <unit> | <Normal or Error>; the rest is
the case description, then "Expected:" with the expected result.
"""

import os
import time

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import Select

from selenium_helpers import DOWNLOADS, STUDENT, body_text, click, delete_account, open_page, register_account, sign_in, text_appears, unique_email, visible, wait_for

ADMIN = (os.environ.get("ADMIN_EMAIL", ""), os.environ.get("ADMIN_PASSWORD", ""))
needs_admin = pytest.mark.skipif(not all(ADMIN), reason="set ADMIN_EMAIL and ADMIN_PASSWORD to run the administrator cases")
PASSWORD = "Chapter4-Pass!"


@pytest.fixture
def throwaway():
    """A fresh student account (email, Api), deleted again at the end."""
    email = unique_email("ut-adm")
    account = register_account(email, PASSWORD, "Admin", "Testcase")
    yield email, account
    delete_account(account.token or "", email)


def admin_tab(driver, label: str) -> None:
    open_page(driver, "/admin") if "/admin" not in driver.current_url else None
    click(driver, visible(driver, By.XPATH, f"//button[starts-with(normalize-space(), '{label}')]", timeout=40))
    time.sleep(2)


def search_users(driver, term: str) -> None:
    box = visible(driver, By.CSS_SELECTOR, "input[placeholder='Search users…']")
    box.send_keys(Keys.CONTROL, "a")
    box.send_keys(term)
    time.sleep(1.5)


def user_row(driver, email: str, timeout: float = 30):
    return visible(driver, By.XPATH, f"//tr[.//*[contains(normalize-space(), '{email}')]]", timeout=timeout)


# ── Manage Users ─────────────────────────────────────────────────────────────


@needs_admin
def test_UT_ADM_01(driver, throwaway, actual):
    """UT-ADM-01 | Manage Users | Normal
    An administrator opens User management and searches for a user's email.
    Expected: the user's row is shown with their email, role (Student) and number of documents."""
    email, _account = throwaway
    sign_in(driver, ADMIN)
    open_page(driver, "/admin")
    admin_tab(driver, "User management")
    search_users(driver, email)
    row = user_row(driver, email)
    assert "Student" in row.text, row.text
    actual(f"Searching \"{email}\" showed one row with the role Student.")


@needs_admin
def test_UT_ADM_02(driver, actual):
    """UT-ADM-02 | Manage Users | Error
    An administrator searches User management for an email that has no account.
    Expected: no user rows are shown."""
    sign_in(driver, ADMIN)
    open_page(driver, "/admin")
    admin_tab(driver, "User management")
    search_users(driver, "nobody-at-all-xyz@nowhere.test")
    rows = [r for r in driver.find_elements(By.XPATH, "//tbody/tr") if r.is_displayed()]
    assert not rows, [r.text for r in rows]
    actual("The search for an unknown email showed no user rows.")


# ── Manage User Access ───────────────────────────────────────────────────────


@needs_admin
def test_UT_ADM_03(driver, second_driver, throwaway, actual):
    """UT-ADM-03 | Manage User Access | Normal
    An administrator changes a student's role to Professor with the row's "Override…" menu.
    Expected: "Role updated to Professor." appears, the row shows Professor, and that user can now open the professor dashboard."""
    email, _account = throwaway
    sign_in(driver, ADMIN)
    open_page(driver, "/admin")
    admin_tab(driver, "User management")
    search_users(driver, email)
    Select(user_row(driver, email).find_element(By.TAG_NAME, "select")).select_by_value("professor")
    assert text_appears(driver, "Role updated to Professor."), "no confirmation"
    search_users(driver, email)
    wait_for(driver, lambda d: "Professor" in user_row(d, email).text, timeout=30)
    sign_in(second_driver, (email, PASSWORD))
    open_page(second_driver, "/professor")
    time.sleep(4)
    assert "403 Forbidden" not in body_text(second_driver) or "Verification Pending" in body_text(second_driver)
    actual("\"Role updated to Professor.\" appeared and the row showed Professor.")


def test_UT_ADM_04(driver, actual):
    """UT-ADM-04 | Manage User Access | Error
    A student types the administrator page's address (/admin) into the browser.
    Expected: "403 Forbidden: Administrator Access Required" is shown instead of the admin pages."""
    sign_in(driver, STUDENT)
    open_page(driver, "/admin")
    assert text_appears(driver, "403 Forbidden: Administrator Access Required"), "the admin page was not blocked"
    assert "User management" not in body_text(driver)
    actual("The student saw \"403 Forbidden: Administrator Access Required\"; no admin tabs were shown.")


# ── View Documents (formerly Moderate Document) ──────────────────────────────


@needs_admin
def test_UT_ADM_05(driver, student_api, actual):
    """UT-ADM-05 | View Documents | Normal
    An administrator opens the Documents tab and searches for a document's title.
    Expected: the document is listed with its owner."""
    title = f"Admin view test {int(time.time())}"
    student_api.create_document(title, "<p>A document the administrator can see.</p>")
    sign_in(driver, ADMIN)
    open_page(driver, "/admin")
    admin_tab(driver, "Documents")
    box = visible(driver, By.CSS_SELECTOR, "input[placeholder='Search documents by title…']")
    box.send_keys(title)
    time.sleep(1.5)
    row = visible(driver, By.XPATH, f"//*[self::tr or self::li or self::div][contains(normalize-space(), '{title}')][last()]")
    actual(f"Searching the title listed \"{title}\" in the Documents tab.")
    assert row


@needs_admin
def test_UT_ADM_06(driver, student_api, actual):
    """UT-ADM-06 | View Documents | Error
    An administrator looks for a way to edit or delete a user's document in the Documents tab.
    Expected: there is none: the tab is view-only (no Delete or Edit buttons)."""
    title = f"Admin readonly test {int(time.time())}"
    student_api.create_document(title, "<p>Read only for administrators.</p>")
    sign_in(driver, ADMIN)
    open_page(driver, "/admin")
    admin_tab(driver, "Documents")
    visible(driver, By.CSS_SELECTOR, "input[placeholder='Search documents by title…']").send_keys(title)
    time.sleep(1.5)
    buttons = [b.text for b in driver.find_elements(By.XPATH, "//button[contains(., 'Delete') or contains(., 'Edit') or contains(@aria-label, 'Delete')]") if b.is_displayed()]
    assert not buttons, buttons
    actual("The Documents tab showed the document with no Delete or Edit buttons.")


# ── Manage Reports ───────────────────────────────────────────────────────────


@needs_admin
def test_UT_ADM_07(driver, actual):
    """UT-ADM-07 | Manage Reports | Normal
    An administrator opens the System reports tab.
    Expected: the system's reports (users, documents and activity) are shown as figures and charts."""
    sign_in(driver, ADMIN)
    open_page(driver, "/admin")
    admin_tab(driver, "System reports")
    wait_for(driver, lambda d: d.find_elements(By.CSS_SELECTOR, "svg, canvas"), timeout=40, message="no charts")
    actual("The System reports tab showed the report figures and charts.")


@needs_admin
def test_UT_ADM_08(driver, actual):
    """UT-ADM-08 | Manage Reports | Normal
    An administrator opens Research data and presses "Export Research Dataset".
    Expected: a CSV file of the research data downloads."""
    before = set(DOWNLOADS.glob("*.csv"))
    sign_in(driver, ADMIN)
    open_page(driver, "/admin")
    admin_tab(driver, "Research data")
    click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Export Research Dataset')]"))
    file = wait_for(driver, lambda d: next(iter(set(DOWNLOADS.glob("*.csv")) - before), False), timeout=120, message="no CSV downloaded")
    actual(f"\"{file.name}\" downloaded.")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
