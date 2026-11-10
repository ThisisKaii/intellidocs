"""Plagiarism benchmark: the peer cross-check must flag copies and paraphrases,
leave same-topic originals alone, and skip front/back matter even when its
heading is a bold paragraph instead of an <h1>.

Run with -s to see the per-case table:  pytest tests/python/test_plagiarism_benchmark.py -s
"""
import os

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")

from triage_filter import TriageFilter  # noqa: E402

from .plagiarism_corpus import ACK_TEXT, CASES, REFERENCE_ENTRY, peer_html, submission_html  # noqa: E402


def run_benchmark():
    triage = TriageFilter()
    flagged = triage._stage1_peer_pre_filter(
        "submission", submission_html(), [{"document_id": "peer", "user_id": "u2", "text": peer_html()}]
    )
    by_text = {item["text"]: item for item in flagged}
    rows = []
    for case_id, label, text, _src in CASES:
        hit = by_text.get(text)
        rows.append((case_id, label, hit["match_type"] if hit else "-", hit["similarity_score"] if hit else 0.0))
    matter_flags = [item for item in flagged if item["text"] in (ACK_TEXT, REFERENCE_ENTRY)]
    return rows, matter_flags


def test_benchmark_detects_copies_and_paraphrases_without_false_positives():
    rows, matter_flags = run_benchmark()
    print("\ncase                              expected    got          score")
    for case_id, label, got, score in rows:
        print(f"{case_id:34}{label:12}{got:13}{score:.3f}")

    missed = [case_id for case_id, label, got, _ in rows if label in ("copied", "paraphrase") and got == "-"]
    false_positives = [case_id for case_id, label, got, _ in rows if label == "original" and got != "-"]
    copies_marked_verbatim = [case_id for case_id, label, got, _ in rows if label == "copied" and case_id.startswith("verbatim") and got != "verbatim"]
    print(f"missed: {missed}\nfalse positives: {false_positives}\nmatter scanned: {len(matter_flags)}")

    assert missed == []
    assert false_positives == []
    assert copies_marked_verbatim == []
    assert matter_flags == [], "acknowledgement/references under bold headings must not be scanned"
