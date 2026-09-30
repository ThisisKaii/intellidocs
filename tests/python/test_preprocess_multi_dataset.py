"""
pytest tests for the section 1.1 unified preprocessing.

Writes synthetic raw corpora, runs the preprocessing end to end, and asserts
the combined CSVs carry the unified schema with every corpus represented.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../ml/dataset'))

import preprocess  # noqa: E402

WIKITEXT_ROWS = [
    {"text": "= Main Title =\n"},
    {"text": "== Background ==\n"},
    {"text": "A plain body paragraph with several words in it.\n"},
    {"text": "* bullet one\n"},
    {"text": "  indented code line\n"},
    {"text": ""},
]

THESIS_ROWS = [
    {
        "text": "Abstract We propose a novel approach to the problem domain that reduces error rates.",
        "section": "abstract",
    },
    {
        "text": "2. Methodology We evaluate the approach on three public benchmarks using cross validation.",
        "section": "methodology",
    },
    {
        "text": "Some unlabelled body prose that continues the argument here.",
        "section": "body",
    },
    # Shorter than preprocess.THESIS_MIN_CHARS, so it must be dropped: a bare
    # heading carries no formatting signal.
    {"text": "3. Results\n", "section": "body"},
]

JFLEG_ROWS = [
    {"sentence": "This are wrong.", "corrections": ["This is wrong.", "These is wrong."]},
    {"sentence": "Same.", "corrections": ["Same."]},
]

CONLL_ROWS = [
    {"sentence": "He go home.", "corrected": "He goes home.", "error_type": "agreement"},
    {"sentence": "I saw a dog.", "corrected": "I saw the dog.", "error_type": "article"},
    {"sentence": "The the cat.", "corrected": "The cat.", "error_type": "spelling"},
    {"sentence": "No diff.", "corrected": "No diff.", "error_type": "uncategorized"},
]


def write_raw(root, slug, split, rows):
    """Write synthetic raw JSONL for one corpus split."""
    directory = os.path.join(root, slug)
    os.makedirs(directory, exist_ok=True)
    with open(os.path.join(directory, f"{split}.jsonl"), "w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")


@pytest.fixture()
def roots(tmp_path, monkeypatch):
    """Redirect the raw and processed roots into a temp directory."""
    raw = str(tmp_path / "raw")
    processed = str(tmp_path / "processed")
    monkeypatch.setattr(preprocess, "RAW_ROOT", raw)
    monkeypatch.setattr(preprocess, "PROCESSED_ROOT", processed)
    return raw, processed


@pytest.fixture()
def populated(roots):
    """Raw roots containing all four synthetic corpora."""
    raw, processed = roots
    write_raw(raw, "wikitext-103", "train", WIKITEXT_ROWS)
    write_raw(raw, "thesis-structural", "train", THESIS_ROWS)
    write_raw(raw, "jfleg", "validation", JFLEG_ROWS)
    write_raw(raw, "conll2014", "test", CONLL_ROWS)
    return raw, processed


class TestFormattingCombine:
    """formatting_examples.csv merges structure, thesis and synthetic data."""

    @pytest.fixture()
    def frame(self, populated):
        return preprocess.preprocess_formatting()

    def test_wikitext_contributes(self, frame):
        assert (frame["source_dataset"] == "wikitext-103").sum() == 5

    def test_thesis_contributes(self, frame):
        assert (frame["source_dataset"] == "thesis-structural").sum() == 3

    def test_thesis_drops_tiny_passages(self, frame):
        """A bare heading is below THESIS_MIN_CHARS and must not become a row."""
        thesis = frame[frame["source_dataset"] == "thesis-structural"]
        assert "3. Results" not in set(thesis["text"])
        assert all(len(str(t)) >= preprocess.THESIS_MIN_CHARS for t in thesis["text"])

    def test_thesis_text_is_truncated(self, populated):
        """Long passages are clipped so one paper cannot dominate the dataset."""
        long_text = "word " * 5000
        write_raw(
            populated[0],
            "thesis-structural",
            "validation",
            [{"text": long_text, "section": "body"}],
        )
        rows = preprocess.build_thesis_rows_streamed(
            iter([{"text": long_text, "section": "body"}]), "validation", 10
        )
        assert len(rows[0]["text"]) == preprocess.THESIS_SNIPPET_CHARS

    def test_thesis_row_cap_enforced(self):
        """The row cap bounds the contribution of a very large corpus."""
        records = [{"text": f"Body sentence number {i} with a few more words in it.", "section": "body"} for i in range(50)]
        rows = preprocess.build_thesis_rows_streamed(iter(records), "train", 10)
        assert len(rows) == 10

    def test_synthetic_backfills(self, frame):
        assert (frame["source_dataset"] == "synthetic").sum() > 0

    def test_sections_present(self, frame):
        sections = set(frame["section"].dropna().unique())
        assert {"body", "abstract", "methodology"} <= sections

    def test_wikitext_rows_are_body(self, frame):
        wiki = frame[frame["source_dataset"] == "wikitext-103"]
        assert set(wiki["section"]) == {"body"}

    def test_features_retained(self, frame):
        assert "word_count" in frame.columns
        assert "char_count" in frame.columns

    def test_blank_text_dropped(self, frame):
        assert frame["text"].str.len().gt(0).all()

    def test_unified_columns_present(self, frame):
        for column in preprocess.FORMATTING_COLUMNS:
            assert column in frame.columns, column

    def test_csv_written(self, populated):
        _, processed = populated
        preprocess.preprocess_formatting()
        assert os.path.exists(os.path.join(processed, "formatting_examples.csv"))


class TestGrammarCombine:
    """grammar_examples.csv merges fluency and categorized corrections."""

    @pytest.fixture()
    def frame(self, populated):
        return preprocess.preprocess_grammar()

    def test_jfleg_contributes(self, frame):
        assert (frame["source_dataset"] == "jfleg").sum() == 2

    def test_conll_contributes(self, frame):
        assert (frame["source_dataset"] == "conll2014").sum() == 3

    def test_jfleg_labelled_fluency(self, frame):
        jfleg = frame[frame["source_dataset"] == "jfleg"]
        assert set(jfleg["error_type"]) == {"fluency"}

    def test_conll_categories_preserved(self, frame):
        conll = frame[frame["source_dataset"] == "conll2014"]
        assert set(conll["error_type"]) == {"agreement", "article", "spelling"}

    def test_identical_pairs_dropped(self, frame):
        assert not (frame["source"] == frame["target"]).any()

    def test_unified_columns_present(self, frame):
        for column in preprocess.GRAMMAR_COLUMNS:
            assert column in frame.columns, column

    def test_error_type_never_null(self, frame):
        assert frame["error_type"].notna().all()

    def test_correction_index_recorded(self, frame):
        jfleg = frame[frame["source_dataset"] == "jfleg"]
        assert sorted(jfleg["correction_index"]) == [0, 1]

    def test_csv_written(self, populated):
        _, processed = populated
        preprocess.preprocess_grammar()
        assert os.path.exists(os.path.join(processed, "grammar_examples.csv"))


class TestGracefulDegradation:
    """A corpus that was never downloaded must not break preprocessing."""

    def test_missing_corpora_still_produce_formatting(self, roots):
        frame = preprocess.preprocess_formatting()
        _, processed = roots
        assert os.path.exists(os.path.join(processed, "formatting_examples.csv"))
        assert len(frame) > 0

    def test_missing_grammar_writes_empty_frame_with_schema(self, roots):
        frame = preprocess.preprocess_grammar()
        assert len(frame) == 0
        assert list(frame.columns)[: len(preprocess.GRAMMAR_COLUMNS)] == preprocess.GRAMMAR_COLUMNS

    def test_synthetic_survive_missing_raw(self, roots):
        frame = preprocess.preprocess_formatting()
        assert (frame["source_dataset"] == "synthetic").sum() > 0

    def test_read_raw_returns_empty_for_missing_file(self, roots):
        assert preprocess.read_raw("does-not-exist", "train") == []


class TestPathResolution:
    """Roots resolve from __file__ so both scripts agree from any cwd."""

    def test_raw_root_points_at_ml_dataset(self):
        assert preprocess.RAW_ROOT.replace("\\", "/").endswith("ml/dataset/raw")

    def test_processed_root_points_at_ml_dataset(self):
        assert preprocess.PROCESSED_ROOT.replace("\\", "/").endswith("ml/dataset/processed")

    def test_roots_are_absolute(self):
        assert os.path.isabs(preprocess.RAW_ROOT)
        assert os.path.isabs(preprocess.PROCESSED_ROOT)
