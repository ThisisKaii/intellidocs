"""TCASE-021 | Module 2: Document Management & Cloud Storage | Unit: Tab Management | Error (Delete Active Only Tab)

A student tries to delete the only tab of a document. Expected (as the app behaves): the tab's
"Delete tab" option is disabled while it is the only tab, and the server refuses the deletion with
HTTP 409 "A document keeps at least one tab. Merge the tabs instead."; the tab stays.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, click, create_tabbed_document, open_document, sign_in, visible

TAB = "Chapter 1: Introduction"


def test_tab_management_tcase_021(driver, student_api):
    doc_id = create_tabbed_document(student_api, "TCASE-021 Single Tab", [(TAB, "<h1>CHAPTER 1</h1><p>The only chapter of this document.</p>")])
    tabs = student_api.call("GET", f"/documents/{doc_id}/tabs").json()["tabs"]
    assert len(tabs) == 1

    refused = student_api.call("DELETE", f"/documents/{doc_id}/tabs/{tabs[0]['tab_id']}")
    assert refused.status_code == 409 and "A document keeps at least one tab" in refused.text, refused.text

    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    click(driver, visible(driver, By.CSS_SELECTOR, f"button[aria-label='More for {TAB}']"))
    delete = visible(driver, By.XPATH, "//button[contains(., 'Delete tab')]")
    assert not delete.is_enabled(), "'Delete tab' is offered for the only tab"
    assert len(student_api.call("GET", f"/documents/{doc_id}/tabs").json()["tabs"]) == 1


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
