"""The fidelity helpers must score matching pages high and different pages low."""
import os
import sys

import cv2
import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../e2e'))

import fidelity_lib as fl  # noqa: E402


def _page(text_rows=(100, 140, 180), shift=0, width=600, height=800):
    """A white page with black bars standing in for lines of text."""
    img = np.full((height, width, 3), 255, dtype=np.uint8)
    for y in text_rows:
        img[y + shift:y + shift + 12, 60:540] = 20
    return img


class TestWords:
    def test_normalises_case_punctuation_and_spacing(self):
        assert fl.normalize_words("Hello,   WORLD! 2026-10") == ["hello", "world", "2026", "10"]

    def test_identical_sequences_score_one_and_empty_pages_match(self):
        assert fl.sequence_ratio(["a", "b"], ["a", "b"]) == 1.0
        assert fl.sequence_ratio([], []) == 1.0

    def test_a_missing_page_scores_zero(self):
        assert fl.sequence_ratio(["a", "b"], []) == 0.0

    def test_a_shifted_word_lowers_the_score(self):
        assert fl.sequence_ratio(list("abcdefghij"), list("abcdefghiX")) == pytest.approx(0.9)


class TestPageEdges:
    def test_same_start_and_end_matches(self):
        assert fl.page_edges_match(list("abcdefgh"), list("abcxxfgh"))

    def test_a_page_that_starts_elsewhere_does_not_match(self):
        assert not fl.page_edges_match(list("abcdefgh"), list("defgh"))

    def test_a_printed_page_number_is_not_page_content(self):
        assert fl.page_edges_match(["5", "table", "of", "contents", "x", "y", "z"], ["table", "of", "contents", "x", "y", "z"])
        assert fl.page_edges_match(["intro", "text", "here", "end", "of", "page", "12"], ["intro", "text", "here", "end", "of", "page"])


class TestLayoutSimilarity:
    def test_identical_pages_score_one(self):
        assert fl.layout_similarity(_page(), _page()) == pytest.approx(1.0, abs=1e-3)

    def test_the_same_page_at_another_scale_still_matches(self):
        big = cv2.resize(_page(), (1200, 1600), interpolation=cv2.INTER_LINEAR)
        assert fl.layout_similarity(_page(), big) > 0.95

    def test_a_few_pixels_of_shift_do_not_matter(self):
        assert fl.layout_similarity(_page(), _page(shift=6)) > 0.9

    def test_content_in_another_place_scores_low(self):
        assert fl.layout_similarity(_page(), _page(shift=200)) < 0.3

    def test_a_blank_page_scores_low_against_a_full_one(self):
        assert fl.layout_similarity(_page(), np.full((800, 600, 3), 255, dtype=np.uint8)) < 0.3

    def test_extra_content_on_one_page_is_penalised(self):
        assert fl.layout_similarity(_page(), _page(text_rows=(100, 140, 180, 300, 340, 380, 420))) < 0.85

    def test_two_blank_pages_match(self):
        blank = np.full((800, 600, 3), 255, dtype=np.uint8)
        assert fl.layout_similarity(blank, blank.copy()) == 1.0

    def test_glyph_level_noise_does_not_hide_a_matching_layout(self):
        """What a pixel SSIM got wrong: the same lines drawn with slightly different glyph rendering."""
        rng = np.random.default_rng(1)
        noisy = _page().astype(np.int16)
        noisy[100:112, 60:540] += rng.integers(-60, 60, size=(12, 480, 1))
        noisy = np.clip(noisy, 0, 255).astype(np.uint8)
        assert fl.layout_similarity(_page(), noisy) > 0.9


class TestComparePages:
    def test_matching_pages_pass_and_a_missing_page_fails(self):
        ref = [_page(), _page(text_rows=(300, 340))]
        words = [["a", "b", "c"], ["d", "e", "f"]]
        results = fl.compare_pages(ref, words, ref[:1], words[:1])
        assert results[0].ok
        assert not results[1].ok and results[1].layout == 0.0

    def test_document_ok_needs_equal_page_counts(self):
        doc = fl.DocumentResult("x", reference_pages=2, imported_pages=3,
                                pages=[fl.PageResult(1, 1.0, 1.0, True), fl.PageResult(2, 1.0, 1.0, True)])
        assert not doc.ok


def test_side_by_side_has_a_caption_and_both_pages():
    out = fl.side_by_side(_page(), _page(), "page 1")
    assert out.shape[1] == 600 * 2 + 8
    assert out.shape[0] == 28 + 800


def test_summary_table_lists_each_document():
    doc = fl.DocumentResult("memo.docx", 2, 2, [fl.PageResult(1, 1.0, 0.95, True), fl.PageResult(2, 0.9, 0.5, False)])
    table = fl.summary_table([doc])
    assert "memo.docx" in table and "1/2" in table
