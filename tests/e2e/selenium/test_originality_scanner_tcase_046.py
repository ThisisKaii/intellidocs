"""TCASE-046 | Module 6: Originality Scanner | Unit: Originality Scanner | Non-Error (Lexical Pre-Filter)

A student checks a draft against their own previous drafts. The second draft repeats a paragraph
of the first word for word.

Expected (as the app behaves): the self-check (/plagiarism/self-check) reports the copied
paragraph as a 100% "verbatim" match naming the earlier draft, and the overlap share of the
document. The lexical difflib comparison itself (the ML service's /originality/check) runs in
under 500 ms; the whole request takes a few seconds locally because it first loads the student's
documents from the database.

The self-check has no button in the current interface (the editor's originality button runs
the online check), so this case is checked through the API and shown as an evidence page.
"""

import time

import pytest
import requests

from selenium_helpers import COPIED_PARAGRAPH, ML, show_evidence

LEXICAL_LIMIT_MS = 500
REQUEST_LIMIT_MS = 15000


def test_originality_scanner_tcase_046(driver, student_api):
    earlier = student_api.create_document("TCASE-046 Draft 1", f"<h1>Introduction</h1><p>{COPIED_PARAGRAPH}</p><p>A closing sentence about the school calendar.</p>")
    later = student_api.create_document("TCASE-046 Draft 2", f"<h1>Background</h1><p>New opening words written for this draft only.</p><p>{COPIED_PARAGRAPH}</p>")

    started = time.perf_counter()
    response = student_api.call("POST", "/plagiarism/self-check", {"documentId": later})
    request_ms = (time.perf_counter() - started) * 1000
    assert response.status_code == 200, response.text[:300]
    result = response.json()

    # The lexical step alone, with the same text and the earlier draft as the only peer.
    lexical = {"text": f"New opening words written for this draft only.\n\n{COPIED_PARAGRAPH}",
               "peers": [{"document_id": earlier, "title": "TCASE-046 Draft 1", "text": f"{COPIED_PARAGRAPH}\n\nA closing sentence about the school calendar."}]}
    requests.post(f"{ML}/originality/check", json=lexical, timeout=60)  # warm
    started = time.perf_counter()
    direct = requests.post(f"{ML}/originality/check", json=lexical, timeout=60)
    lexical_ms = (time.perf_counter() - started) * 1000
    direct.raise_for_status()

    passage = next((p for p in result["passages"] if p["peer_document_id"] == earlier), None)
    show_evidence(driver, "TCASE-046 Self-check against own drafts", [
        ("Checked draft", "TCASE-046 Draft 2"),
        ("Compared with", f"{result['compared_documents']} of the student's other documents"),
        ("Overlap", f"{result['overlap_percent']}%"),
        ("Matched passage", passage["text"][:120] + "…" if passage else "none"),
        ("Match", f"{passage['similarity']}% {passage['match_type']} in “{passage['peer_title']}”" if passage else "none"),
        ("difflib comparison (ML service)", f"{lexical_ms:.0f} ms"),
        ("Whole self-check request", f"{request_ms:.0f} ms"),
    ])

    assert passage is not None, f"the copied paragraph was not found: {result}"
    assert passage["similarity"] == 100 and passage["match_type"] == "verbatim"
    assert lexical_ms < LEXICAL_LIMIT_MS, f"the lexical comparison took {lexical_ms:.0f} ms"
    assert request_ms < REQUEST_LIMIT_MS


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
