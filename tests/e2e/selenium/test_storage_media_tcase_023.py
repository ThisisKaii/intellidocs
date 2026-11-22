"""TCASE-023 | Module 2: Document Management & Cloud Storage | Unit: Storage and Media | Error (Storage Quota Exceeded)

A user at their storage cap tries to save more. Expected (as the app behaves): a basic account
holds 25 MB of document text (students 100 MB, professors 250 MB); a save that would pass the cap
is refused with HTTP 413 `storage_quota_exceeded` ("Storage full. Delete documents or empty the
trash to keep saving."), and the editor shows "Storage full" with the tooltip "Your storage is
full. Delete documents or empty the Trash to keep saving; your edits are kept on this device."

Uses a throwaway basic account, filled through the API with incompressible text in 3 MB documents
(large writes are kept at 3 MB), then deleted at the end with everything in it.
"""

import base64
import os
import time

import pytest
import requests
from selenium.webdriver.common.by import By

from selenium_helpers import Api, click, delete_account, open_document, register_account, sign_in, unique_email, visible, wait_for

PASSWORD = "Chapter4-Pass!"


def filler(size: int) -> str:
    return "<p>" + base64.b64encode(os.urandom(size * 3 // 4)).decode("ascii") + "</p>"


def reliable(account: Api, method: str, path: str, body: dict) -> requests.Response:
    """A call that survives a slow link to the database: a timed-out write (5xx) or a session check
    that timed out (401) is retried with a fresh sign-in. Only the app's real answer comes back."""
    response = account.call(method, path, body, timeout=300)
    for _ in range(3):
        if response.status_code < 500 and response.status_code != 401:
            break
        time.sleep(5)
        if response.status_code == 401:
            account.token = Api.sign_in((account_email(account), PASSWORD)).token
        response = account.call(method, path, body, timeout=300)
    return response


EMAILS: dict[int, str] = {}


def account_email(account: Api) -> str:
    return EMAILS[id(account)]


def fill_storage(account: Api) -> str:
    """Fill the account to within 10 KB of its cap: save documents of one size until that size is
    refused, then step down to the next smaller size. Returns the last saved document's id."""
    last = ""
    for size in (3_000_000, 1_000_000, 300_000, 100_000, 30_000, 10_000):
        for _ in range(40):
            created = reliable(account, "POST", "/documents", {"title": "Filler"})
            assert created.status_code in (200, 201), created.text[:200]
            doc_id = created.json()["id"]
            saved = reliable(account, "PUT", f"/documents/{doc_id}", {"content": filler(size)})
            if saved.status_code == 413:
                assert saved.json().get("code") == "storage_quota_exceeded", saved.text[:200]
                break
            assert saved.status_code == 200, f"{saved.status_code} {saved.text[:200]}"
            last = doc_id
    return last


def test_storage_media_tcase_023(driver):
    email = unique_email("tcase023")
    account = register_account(email, PASSWORD)
    EMAILS[id(account)] = email
    try:
        storage = account.call("GET", "/auth/storage").json()
        assert storage.get("quotaBytes") == 25 * 1024 * 1024, f"a basic account's cap is not 25 MB: {storage}"
        target = fill_storage(account)
        assert target, "no document was saved before the cap"

        # New text in a new document (replacing a larger document's text would free space instead).
        extra = reliable(account, "POST", "/documents", {"title": "One more chapter"}).json()["id"]
        refused = reliable(account, "PUT", f"/documents/{extra}", {"content": filler(50_000)})
        assert refused.status_code == 413 and refused.json()["code"] == "storage_quota_exceeded"
        assert "Storage full" in refused.json()["error"]

        sign_in(driver, (email, PASSWORD))
        editor = open_document(driver, target)
        click(driver, editor)
        editor.send_keys(" More text the user types after the cap. " * 200)
        status = wait_for(
            driver,
            lambda d: next((s for s in d.find_elements(By.CSS_SELECTOR, "span[role=status]") if "Storage full" in s.text), None),
            timeout=60,
            message="the editor did not report 'Storage full'",
        )
        assert "Your storage is full" in (status.get_attribute("title") or "")
        visible(driver, By.CSS_SELECTOR, "span[role=status]")
    finally:
        delete_account(account.token or "", email)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
