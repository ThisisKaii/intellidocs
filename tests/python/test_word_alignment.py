"""The 'paragraphs on Word's page' metric behind tests/e2e/word_gate.py."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "e2e"))
from word_alignment import align, baseline_from, compare, key, score, word_rows  # noqa: E402

TEXTS = [f"Paragraph number {n} talks about topic {n} at length" for n in range(1, 9)]


def truth(pages: list[int], extra: list[dict] | None = None) -> dict:
    """Word truth: paragraph i on pages[i]."""
    rows = [{"i": n + 1, "page": page, "y": 72.0, "in_table": False, "text": TEXTS[n]} for n, page in enumerate(pages)]
    return {"name": "doc", "pages": max(pages), "paragraphs": rows + (extra or [])}


def editor(pages: list[int], texts: list[str] | None = None) -> list[dict]:
    return [{"text": text, "page": page} for text, page in zip(texts or TEXTS, pages)]


def test_an_identical_layout_scores_every_paragraph() -> None:
    result = score(truth([1, 1, 2, 2, 3, 3, 4, 4]), editor([1, 1, 2, 2, 3, 3, 4, 4]), 4)
    assert (result.aligned, result.same_page, result.ratio) == (8, 8, 1.0)
    assert result.first_divergence is None
    assert result.page_count_matches


def test_a_one_page_slip_counts_only_the_paragraphs_it_moves() -> None:
    # Paragraphs 3-4 slip to the next page; 5 onward are back on Word's pages.
    result = score(truth([1, 1, 2, 2, 3, 3, 4, 4]), editor([1, 1, 3, 3, 3, 3, 4, 4]), 4)
    assert result.same_page == 6
    assert result.first_divergence == {"text": TEXTS[2], "word_page": 2, "editor_page": 3}
    assert result.page_offsets[2] == 1 and result.page_offsets[3] == 0


def test_a_paragraph_missing_from_the_editor_is_skipped_and_the_rest_still_pair() -> None:
    texts = TEXTS[:3] + TEXTS[4:]
    pages = [1, 1, 2, 3, 3, 4, 4]
    pairs = align(word_rows(truth([1, 1, 2, 2, 3, 3, 4, 4])), editor(pages, texts))
    assert len(pairs) == 7
    assert [w["text"] for w, _ in pairs] == texts


def test_an_extra_editor_paragraph_does_not_shift_the_pairing() -> None:
    texts = TEXTS[:2] + ["An inserted paragraph that Word never had"] + TEXTS[2:]
    pairs = align(word_rows(truth([1] * 8)), editor([1] * 9, texts))
    assert [w["text"] == e["text"] for w, e in pairs] == [True] * 8


def test_empty_short_and_table_paragraphs_are_not_measured() -> None:
    extra = [
        {"i": 90, "page": 1, "y": 0, "in_table": False, "text": ""},
        {"i": 91, "page": 1, "y": 0, "in_table": False, "text": "a."},
        {"i": 92, "page": 1, "y": 0, "in_table": True, "text": "A cell paragraph with plenty of text"},
    ]
    assert len(word_rows(truth([1] * 8, extra))) == 8


def test_keys_ignore_case_punctuation_and_control_characters() -> None:
    assert key("\x0eSeptember 29, 2026") == key("september 29 2026")
    assert key("Figure 3: Talk-To-Your-Slides") == "figure3talktoyourslide"


def test_compare_flags_fewer_paragraphs_on_words_page() -> None:
    before = {"doc": score(truth([1, 1, 2, 2]), editor([1, 1, 2, 2]), 2)}
    after = {"doc": score(truth([1, 1, 2, 2]), editor([1, 2, 2, 2]), 2)}
    regressions = compare(after, baseline_from(before))
    assert [r.reason for r in regressions] == ["paragraphs on Word's page 4 -> 3"]


def test_compare_flags_a_page_count_moving_away_from_words_but_not_one_that_stays_wrong() -> None:
    good = {"doc": score(truth([1, 1, 2, 2]), editor([1, 1, 2, 2]), 2)}
    worse = {"doc": score(truth([1, 1, 2, 2]), editor([1, 1, 2, 2]), 3)}
    assert [r.reason for r in compare(worse, baseline_from(good))] == ["pages 2 -> 3 (Word 2)"]
    assert compare(worse, baseline_from(worse)) == []


def test_compare_reports_a_baselined_file_that_was_not_measured() -> None:
    measured = {"doc": score(truth([1, 1]), editor([1, 1]), 1)}
    baseline = {**baseline_from(measured), "other": {"same_page": 3, "editor_pages": 1, "aligned": 3, "word_pages": 1}}
    assert [(r.name, r.reason) for r in compare(measured, baseline)] == [("other", "not measured")]


def test_improvements_never_count_as_regressions() -> None:
    before = {"doc": score(truth([1, 1, 2, 2]), editor([1, 2, 2, 2]), 3)}
    after = {"doc": score(truth([1, 1, 2, 2]), editor([1, 1, 2, 2]), 2)}
    assert compare(after, baseline_from(before)) == []
