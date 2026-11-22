"""TCASE-022 | Module 2: Document Management & Cloud Storage | Unit: Storage and Media | Non-Error (Media Upload)

A student inserts a 3 MB methodology diagram (Insert → Insert Image). Expected (as the app
behaves): the file is uploaded to cloud storage (Cloudflare R2 when the R2_* settings are present,
otherwise Supabase Storage) and the picture's public URL, not an embedded data URL, is placed in
the image node. The editor uploads the file as it is: it is not resized on upload (pictures in
imported documents are, see TCASE-057). The picture is stored as that document's: it counts
toward the account's storage, and deleting the document for good gives the space back.

Uses a throwaway account (deleted at the end with its pictures), so repeated runs never fill a
shared test account's storage.
"""

import time

import pytest
import requests
from selenium.webdriver.common.by import By

from selenium_helpers import FIGURES, delete_account, open_document, register_account, sign_in, unique_email, upload_into_editor, wait_for, write_png

PASSWORD = "Chapter4-Pass!"
WIDTH, HEIGHT = 1400, 750  # 1400 x 750 x 3 bytes = 3.0 MB of random pixels


def used_bytes(account, settled, attempts: int = 10) -> int:
    """The account's storage use, read until `settled` holds (or the attempts run out)."""
    used = 0
    for _ in range(attempts):
        used = account.call("GET", "/auth/storage").json()["usedBytes"]
        if settled(used):
            return used
        time.sleep(3)
    return used


def test_storage_media_tcase_022(driver, tmp_path):
    email = unique_email("tcase022")
    account = register_account(email, PASSWORD)
    diagram = write_png(tmp_path / "methodology_diagram.png", WIDTH, HEIGHT)
    size_mb = diagram.stat().st_size / 1024 / 1024
    assert 2.9 <= size_mb <= 3.2, f"test picture is {size_mb:.2f} MB"
    try:
        doc_id = account.create_document("TCASE-022 Methodology", "<h1>Methodology</h1><p>The research design is shown below.</p>")
        used_before = used_bytes(account, lambda used: used > 0)
        sign_in(driver, (email, PASSWORD))
        open_document(driver, doc_id)
        driver.find_element(By.CSS_SELECTOR, ".ProseMirror p").click()
        upload_into_editor(driver, diagram)

        src = wait_for(
            driver,
            lambda d: d.execute_script("const i = document.querySelector('.ProseMirror img'); return i && i.complete && i.naturalWidth ? i.src : null"),
            timeout=90,
            message="the picture was not inserted",
        )
        assert src.startswith("https://") and not src.startswith("data:"), f"the picture was embedded, not uploaded: {src[:80]}"
        assert ("/storage/v1/object/public/" in src) or (".r2." in src or "r2.dev" in src), f"not a cloud storage URL: {src}"
        assert requests.get(src, timeout=60).status_code == 200, "the uploaded picture cannot be fetched"
        natural = driver.execute_script("return document.querySelector('.ProseMirror img').naturalWidth")
        assert natural == WIDTH, f"the picture was changed on upload ({natural}px wide)"
        time.sleep(1)

        # The picture counts toward storage, and goes with its document.
        picture_bytes = diagram.stat().st_size
        # The summary reads 0 for a moment when its database query fails: poll it.
        used_with_picture = used_bytes(account, lambda used: used - used_before >= picture_bytes * 0.95)
        assert used_with_picture - used_before >= picture_bytes * 0.95, f"the picture is not counted ({used_before} -> {used_with_picture} bytes)"
        driver.save_screenshot(str(FIGURES / "test_storage_media_tcase_022_uploaded.png"))
        account.call("DELETE", f"/documents/{doc_id}").raise_for_status()
        account.call("DELETE", f"/documents/{doc_id}/permanent").raise_for_status()
        account.created_documents.clear()
        used_after = used_bytes(account, lambda used: used < used_with_picture - picture_bytes * 0.95)
        assert used_after < used_with_picture - picture_bytes * 0.95, f"deleting the document kept the picture's space ({used_after} bytes)"
        # Asked past the CDN's cached copy (a public file can stay cached for a while after deletion).
        gone = requests.get(f"{src}?deleted-check={int(time.time())}", timeout=60, headers={"Cache-Control": "no-cache"})
        assert gone.status_code in (400, 403, 404), f"the deleted document's picture is still stored ({gone.status_code})"
    finally:
        delete_account(account.token or "", email)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
