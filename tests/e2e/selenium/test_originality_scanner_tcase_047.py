"""TCASE-047 | Module 6: Originality Scanner | Unit: Originality Scanner | Non-Error (Async 5-Judge Council)

A professor starts an integrity scan on a class submission (two classmates; the second copied a
paragraph from the first).

Expected (as the app behaves): POST /plagiarism/scans answers 202 Accepted with the scan
"running" (a few seconds locally; most of it loading the submission and class from the
database), the five-judge council works in the background (the page polls the scan), the scan
completes with quorum and the copied passage as a verbatim match, and an "Originality Scan
Complete" notification is created for the professor. (Notifications are stored and served by
the API; the current interface does not list them, so this is checked through the API.)
"""

import time

import pytest

from selenium_helpers import STUDENT, show_evidence, submit_copied_pair, wait_for_scan

ACCEPT_LIMIT_MS = 5000


def test_originality_scanner_tcase_047(driver, professor_api, student_api, student2_api):
    folder, original, copy = submit_copied_pair(professor_api, student_api, student2_api, "TCASE-047")

    started = time.perf_counter()
    response = professor_api.call("POST", "/plagiarism/scans", {"documentId": copy, "folderId": folder, "scope": "local"})
    accept_ms = (time.perf_counter() - started) * 1000
    assert response.status_code == 202, response.text[:300]
    assert response.json()["status"] == "running"
    scan_id = response.json()["scanId"]

    started = time.time()
    detail = wait_for_scan(professor_api, scan_id)
    council_s = time.time() - started
    scan = detail["scan"]
    notices = [n for n in professor_api.call("GET", "/notifications").json()
               if n.get("type") == "plagiarism_scan_complete" and (n.get("metadata") or {}).get("scanId") == scan_id]

    show_evidence(driver, "TCASE-047 Asynchronous five-judge council", [
        ("POST /plagiarism/scans", f"{response.status_code} Accepted in {accept_ms:.0f} ms (status: running)"),
        ("Council finished after", f"{council_s:.0f} s of polling"),
        ("Scan status", scan["scan_status"]),
        ("Judges / quorum", f"{scan.get('active_judges_count')} judges, quorum {'reached' if scan.get('quorum_reached') else 'not reached'}"),
        ("Peer similarity", f"{scan.get('peer_similarity_score')}%"),
        ("Matches", "; ".join(f"{m['similarity_score']}% {m['match_type']} ({m['match_severity']})" for m in detail.get("matches", []))),
        ("Notification", notices[0]["message"] if notices else "none"),
    ])

    assert accept_ms < ACCEPT_LIMIT_MS, f"202 took {accept_ms:.0f} ms"
    assert scan["scan_status"] == "completed" and scan.get("quorum_reached"), scan["scan_status"]
    assert scan.get("active_judges_count") == 5
    assert any(m["matched_document_id"] == original and m["match_type"] == "verbatim" for m in detail["matches"])
    assert notices and notices[0]["title"] == "Originality Scan Complete"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
