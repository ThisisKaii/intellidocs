"""TCASE-056 | Module 8: Import & Conversion | Unit: Import Conversion | Non-Error (Long Manuscript Tab Split)

A user imports the 180 MB DATASENSEI manuscript (about 1,400 pages) from the dashboard.

Expected: the converter splits it into chapter tabs at its headings, none longer than 60 pages
(the converter's MAX_TAB_PAGES; a longer chapter is split again at its next heading level), and
opening the imported document shows its first tab within 3 s of clicking "Open document".
The tab count and each tab's page count are read from /documents/:id/tabs.

Slow by nature (uploading and converting 180 MB): allow up to 40 minutes.
"""

import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import DOCUMENTS, FIGURES, PROFESSOR, choose_import_file, click, document_id_from_url, show_evidence, sign_in, visible, wait_for

SOURCE = DOCUMENTS / "DATASENSEI (REVISION WEEK) (1).docx"
MAX_TAB_PAGES = 60
OPEN_LIMIT_S = 3.0
# Stored size of the import: about 90 MB of shrunk pictures and about 15 MB of text, with headroom.
NEEDED_BYTES = 130_000_000


@pytest.mark.skipif(not SOURCE.exists(), reason="the 180 MB DATASENSEI fixture is not committed; place it in tests/fixtures/import_baselines/documents")
def test_import_conversion_tcase_056(driver, professor_api):
    # About 90 MB of pictures after shrinking plus the text: more than a student's 100 MB allows,
    # so the case runs as the professor (250 MB), with room checked first.
    storage = professor_api.call("GET", "/auth/storage").json()
    free = (storage.get("quotaBytes") or 0) - storage.get("usedBytes", 0)
    if storage.get("quotaBytes") is not None and free < NEEDED_BYTES:
        pytest.skip(f"the professor test account has {free / 1e6:.0f} MB free; the import needs about {NEEDED_BYTES / 1e6:.0f} MB")
    sign_in(driver, PROFESSOR)
    dialog = choose_import_file(driver, SOURCE)
    started = time.time()
    click(driver, dialog.find_element(By.XPATH, ".//button[starts-with(normalize-space(), 'Import')]"))
    outcome = wait_for(
        driver,
        lambda d: (d.find_elements(By.XPATH, "//*[@role='status']//button[normalize-space()='Open document']")
                   or d.find_elements(By.XPATH, "//*[@role='status']//p[contains(@style, 'var(--error)')]")),
        timeout=40 * 60,
        message="the import neither finished nor failed within 40 minutes",
    )[0]
    import_s = time.time() - started
    assert outcome.tag_name == "button", f"the import failed after {import_s / 60:.1f} min: {outcome.text}"
    opener = outcome

    click(driver, opener)
    opened = time.time()
    wait_for(driver, lambda d: "/document/" in d.current_url, timeout=60)
    wait_for(driver, lambda d: len(d.find_element(By.CSS_SELECTOR, ".ProseMirror").text.strip()) > 200, timeout=120, message="the first tab never showed its text")
    open_s = time.time() - opened
    doc_id = document_id_from_url(driver)
    professor_api.created_documents.append(doc_id)
    driver.save_screenshot(str(FIGURES / "test_import_conversion_tcase_056_first_tab.png"))

    tabs = professor_api.call("GET", f"/documents/{doc_id}/tabs").json()
    tabs = tabs.get("tabs", tabs) if isinstance(tabs, dict) else tabs
    pages = [int(t.get("page_count") or 0) for t in tabs]
    show_evidence(driver, "TCASE-056 Long manuscript split into tabs", [
        ("File", f"{SOURCE.name} ({SOURCE.stat().st_size / 1e6:.0f} MB)"),
        ("Import (upload + conversion)", f"{import_s / 60:.1f} min"),
        ("Tabs", len(tabs)),
        ("Total pages", sum(pages)),
        ("Longest tab", f"{max(pages)} pages"),
        ("First tab shown after Open document", f"{open_s:.2f} s"),
        ("Tabs (title: pages)", "; ".join(f"{t.get('title')}: {p}" for t, p in zip(tabs, pages))[:1500]),
    ])

    assert len(tabs) >= 2, "the manuscript was not split into tabs"
    assert max(pages) <= MAX_TAB_PAGES, f"a tab has {max(pages)} pages"
    assert open_s <= OPEN_LIMIT_S, f"the first tab took {open_s:.1f} s to show"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v", "-s"]))
