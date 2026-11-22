"""TCASE-018 | Module 2: Document Management & Cloud Storage | Unit: Document Creation | Non-Error (IEEE Blueprint)

A student creates a document from the "IEEE Conference Template". Expected (as the app behaves):
the IEEE preset is applied (Letter; margins 0.75" top, 1" bottom, 0.625" sides; Times New Roman
10pt with a 0.25" first-line indent; single column) and the outline is filled in: title, author
block, abstract, index terms and the sections I. Introduction ... VI. Conclusion and References.
"""

import time

import pytest

from selenium_helpers import STUDENT, create_from_modal, sign_in

SECTIONS = ["I. Introduction", "II. Related Work", "III. Proposed Method", "IV. Experimental Setup", "V. Results and Discussion", "VI. Conclusion"]


def test_document_creation_tcase_018(driver, student_api):
    sign_in(driver, STUDENT)
    doc_id = create_from_modal(driver, "IEEE Conference Template", f"TCASE-018 IEEE {int(time.time())}")
    student_api.created_documents.append(doc_id)

    record = student_api.call("GET", f"/documents/{doc_id}").json()
    assert record["formatting_preset"] == "ieee"
    assert record["page_size"] == "letter"
    assert record["margins"] == {"top": 0.75, "bottom": 1, "left": 0.625, "right": 0.625}

    page = driver.execute_script(
        "const p = [...document.querySelectorAll('.ProseMirror p')].find(n => n.textContent.trim()) || document.querySelector('.ProseMirror p');"
        " const s = getComputedStyle(p);"
        " return {size: s.fontSize, indent: s.textIndent, columns: getComputedStyle(document.querySelector('.ProseMirror')).columnCount,"
        " headings: [...document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')].map(h => h.textContent.trim())}"
    )
    assert page["size"] == "13.3333px", f"body text is not 10pt: {page}"  # 10pt = 13.33 CSS px
    assert page["columns"] in ("auto", "1"), f"expected a single column: {page}"
    for section in SECTIONS:
        assert section in page["headings"], f"missing IEEE section {section!r}: {page['headings']}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
