"""TCASE-024 | Module 2: Document Management & Cloud Storage | Unit: Storage and Media | Error (Destructive Save Guard)

A faulty client sends an empty body with the default "Untitled Document" title over a renamed,
non-empty document (the signature of a page that saved before it finished loading). Expected:
the server's guard (`isDestructiveBlankOverwrite`) refuses the save with HTTP 409 "Refusing to
replace a non-empty document with an empty, untitled one"; the document keeps its title and text,
as reopening it in the editor shows. (Clearing a document while keeping its title still saves.)
"""

import pytest

from selenium_helpers import STUDENT, open_document, sign_in, text_appears

TITLE = "TCASE-024 Long Thesis Draft"
CHAPTER = "<h1>CHAPTER {n}</h1><p>" + "Chapter text that must never be lost to an empty save. " * 40 + "</p>"


def test_storage_media_tcase_024(driver, student_api):
    content = "".join(CHAPTER.format(n=n) for n in range(1, 6))
    doc_id = student_api.create_document(TITLE, content)

    refused = student_api.call("PUT", f"/documents/{doc_id}", {"title": "Untitled Document", "content": "<p></p>"})
    assert refused.status_code == 409, f"{refused.status_code} {refused.text[:200]}"
    assert "Refusing to replace a non-empty document with an empty, untitled one" in refused.text

    kept = student_api.call("GET", f"/documents/{doc_id}").json()
    assert kept["title"] == TITLE
    assert "Chapter text that must never be lost" in kept["content"]

    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    assert text_appears(driver, "CHAPTER 5"), "the document's text is not intact in the editor"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
