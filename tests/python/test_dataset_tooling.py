"""
pytest tests for the section 1.1 dataset tooling.

Covers the CoNLL .m2 converter and cleanup.py. The cleanup tests focus on the
safety property: a corpus the user supplied by hand must survive every
combination of flags, because it is the one artifact that cannot be
re-downloaded.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../ml/dataset'))

import cleanup  # noqa: E402
import convert_conll_m2  # noqa: E402
import m2  # noqa: E402

# A representative M2 block: three sentences covering a typed error, a sentence
# with no error, and a sentence whose only error carries the "S" no-op marker.
M2_SAMPLE = """S He go home.
T He goes home.
#0
-\tgo\tgo\t-\t-\t-\t-\t-\t-\tU:SVA
+\tgoes\tgo\t-\t-\t-\t-\t-\t-\tU:SVA
##0
S This are correct.
T This are correct.
#0
-\tare\tbe\t-\t-\t-\t-\t-\t-\tS
+\tare\tbe\t-\t-\t-\t-\t-\t-\tS
##0
S The the cat.
T The cat.
#0
-\tthe\tthe\t-\t-\t-\t-\t-\t-\t-\tU:xxx
+\t__\t_\t-\t-\t-\t-\t-\t-\t-\tU:xxx
##0
"""


@pytest.fixture()
def m2_file(tmp_path):
    """Write the sample M2 text to disk and return its path."""
    path = tmp_path / "official_2014.m2"
    path.write_text(M2_SAMPLE, encoding="utf-8")
    return str(path)


class TestM2Conversion:
    """The converter turns the official scorer file into loader-ready JSONL."""

    def test_extracts_typed_pairs(self, m2_file):
        records = m2.parse_m2(m2_file)
        assert records[0]["sentence"] == "He go home."
        assert records[0]["corrected"] == "He goes home."
        assert records[0]["error_type"] == "agreement"

    def test_unchanged_sentence_dropped(self, m2_file):
        records = m2.parse_m2(m2_file)
        assert all(r["sentence"] != r["corrected"] for r in records)
        assert not any("This are correct." == r["sentence"] for r in records)

    def test_no_op_marker_treated_as_untyped(self, m2_file):
        """An "S" marker carries no category, so that sentence is dropped."""
        records = m2.parse_m2(m2_file)
        assert not any(r["sentence"] == "This are correct." for r in records)

    def test_schema_matches_loader_contract(self, m2_file):
        records = m2.parse_m2(m2_file)
        assert set(records[0].keys()) == {"sentence", "corrected", "error_type"}

    def test_output_is_loadable_jsonl(self, m2_file, tmp_path):
        out = str(tmp_path / "nested" / "train.jsonl")
        convert_conll_m2.write_jsonl(m2.parse_m2(m2_file), out)
        with open(out, encoding="utf-8") as handle:
            rows = [json.loads(line) for line in handle if line.strip()]
        assert len(rows) == len(m2.parse_m2(m2_file))
        assert rows[0]["error_type"] == "agreement"

    def test_categorisable_error_wins_over_leading_others(self, tmp_path):
        """A leading "Others" tag must not discard a sentence with a clear error."""
        path = tmp_path / "others.m2"
        path.write_text(
            "S He go home quickly .\n"
            "T He goes home slowly .\n"
            "#0\n"
            "-\tgo\tgo\t-\t-\t-\t-\t-\t-\tOthers\n"
            "+\tgoes\tgo\t-\t-\t-\t-\t-\tOthers\n"
            "##0\n"
            "#1\n"
            "-\tquickly\tslowly\t-\t-\t-\t-\t-\tU:SVA\n"
            "+\tslowly\tslowly\t-\t-\t-\t-\tU:SVA\n"
            "##1\n",
            encoding="utf-8",
        )
        records = m2.parse_m2(str(path))
        assert records[0]["error_type"] == "agreement"

    def test_all_others_stays_uncategorized(self, tmp_path):
        """When nothing is categorisable the sentence is kept as uncategorized."""
        path = tmp_path / "allothers.m2"
        path.write_text(
            "S He go home .\n"
            "T He goes home .\n"
            "#0\n"
            "-\tgo\tgo\t-\t-\t-\t-\t-\t-\tOthers\n"
            "+\tgoes\tgo\t-\t-\t-\t-\t-\tOthers\n"
            "##0\n",
            encoding="utf-8",
        )
        records = m2.parse_m2(str(path))
        assert records[0]["error_type"] == "uncategorized"

    def test_errant_dialect_replaces_tokens(self, tmp_path):
        """The A-line dialect reconstructs the correction by applying edits."""
        path = tmp_path / "errant.m2"
        path.write_text(
            "S This will caused problems .\n"
            "A 2 3|||Vform|||cause|||REQUIRED|||-NONE-|||0\n"
            "A 1 2|||R:VERB:SVA|||is|||REQUIRED|||-NONE-|||0\n",
            encoding="utf-8",
        )
        records = m2.parse_m2(str(path))
        assert records[0]["corrected"] == "This is cause problems ."
        assert records[0]["error_type"] == "agreement"

    def test_errant_insertion_when_start_equals_end(self, tmp_path):
        """A zero-width span inserts rather than replaces."""
        path = tmp_path / "insert.m2"
        path.write_text("S The cat sat .\nA 1 1|||M:DET|||big|||REQUIRED|||-NONE-|||0\n", encoding="utf-8")
        records = m2.parse_m2(str(path))
        assert records[0]["corrected"] == "The big cat sat ."

    def test_errant_deletion_when_replacement_is_none(self, tmp_path):
        """The -NONE- marker deletes the spanned tokens."""
        path = tmp_path / "delete.m2"
        path.write_text("S The the cat .\nA 1 2|||R:ORTH|||-NONE-|||REQUIRED|||-NONE-|||0\n", encoding="utf-8")
        records = m2.parse_m2(str(path))
        assert records[0]["corrected"] == "The cat ."

    def test_errant_edits_apply_right_to_left(self, tmp_path):
        """Later-index edits must not shift the indices of earlier ones."""
        path = tmp_path / "multi.m2"
        path.write_text(
            "S a b c d e\n"
            "A 0 1|||R:NOUN:NUM|||one|||REQUIRED|||-NONE-|||0\n"
            "A 3 4|||R:PREP|||to|||REQUIRED|||-NONE-|||0\n"
            "A 0 2|||M:DET|||THE|||REQUIRED|||-NONE-|||0\n",
            encoding="utf-8",
        )
        records = m2.parse_m2(str(path))
        # Applying in file order would corrupt the third edit's indices.
        assert records[0]["corrected"] == "THE c to e"

    def test_clean_sentence_is_dropped(self, tmp_path):
        """A sentence with no annotations carries no training signal."""
        path = tmp_path / "clean.m2"
        path.write_text("S Nothing wrong here .\n", encoding="utf-8")
        with pytest.raises(m2.M2ParseError) as excinfo:
            m2.parse_m2(str(path))
        assert "no annotations" in str(excinfo.value)

    def test_non_m2_file_raises(self, tmp_path):
        path = tmp_path / "junk.m2"
        path.write_text("this is not an m2 file\njust prose\n", encoding="utf-8")
        with pytest.raises(m2.M2ParseError) as excinfo:
            m2.parse_m2(str(path))
        assert "No usable records parsed" in str(excinfo.value)

    def test_empty_file_raises(self, tmp_path):
        path = tmp_path / "empty.m2"
        path.write_text("", encoding="utf-8")
        with pytest.raises(m2.M2ParseError):
            m2.parse_m2(str(path))


class TestCleanupReporting:
    """Reporting lists every artifact and marks manual corpora as protected."""

    def _seed(self, root, processed, manual=True):
        os.makedirs(os.path.join(root, "thesis-structural"), exist_ok=True)
        os.makedirs(os.path.join(root, "wikitext-103"), exist_ok=True)
        with open(os.path.join(root, "thesis-structural", "train.jsonl"), "w", encoding="utf-8") as handle:
            handle.write("x" * 5000)
        if manual:
            os.makedirs(os.path.join(root, "conll2014"), exist_ok=True)
            with open(os.path.join(root, "conll2014", "train.jsonl"), "w", encoding="utf-8") as handle:
                handle.write("y" * 3000)
        os.makedirs(processed, exist_ok=True)
        with open(os.path.join(processed, "formatting_examples.csv"), "w", encoding="utf-8") as handle:
            handle.write("z" * 4000)

    def test_corpora_flagged_protected(self, tmp_path):
        raw, processed = str(tmp_path / "raw"), str(tmp_path / "processed")
        self._seed(raw, processed)
        corpora = {c["name"]: c for c in cleanup.list_corpora(raw)}
        assert corpora["conll2014"]["protected"] is True
        assert corpora["thesis-structural"]["protected"] is False

    def test_directory_size_counts_files(self, tmp_path):
        root = str(tmp_path / "raw")
        self._seed(root, str(tmp_path / "processed"))
        sizes = {c["name"]: c["size"] for c in cleanup.list_corpora(root)}
        assert sizes["thesis-structural"] == 5000
        assert sizes["conll2014"] == 3000

    def test_missing_root_reports_empty(self, tmp_path):
        assert cleanup.list_corpora(str(tmp_path / "nope")) == []
        assert cleanup.list_processed(str(tmp_path / "nope")) == []

    def test_report_totals_both_roots(self, tmp_path, capsys):
        raw, processed = str(tmp_path / "raw"), str(tmp_path / "processed")
        self._seed(raw, processed)
        total = cleanup.report(raw, processed)
        out = capsys.readouterr().out
        assert total == 5000 + 3000 + 4000
        assert "protected" in out and "regenerable" in out
        assert "Total on disk" in out

    def test_human_size_formatting(self):
        assert cleanup.human_size(512) == "512 B"
        assert cleanup.human_size(2048) == "2.0 KB"
        assert cleanup.human_size(5 * 1024**3) == "5.0 GB"


class TestCleanupPruning:
    """Pruning reclaims regenerable data and never touches manual corpora."""

    def _seed(self, tmp_path):
        raw, processed = str(tmp_path / "raw"), str(tmp_path / "processed")
        os.makedirs(os.path.join(raw, "thesis-structural"), exist_ok=True)
        os.makedirs(os.path.join(raw, "conll2014"), exist_ok=True)
        os.makedirs(processed, exist_ok=True)
        for path, payload in (
            (os.path.join(raw, "thesis-structural", "train.jsonl"), "x" * 1000),
            (os.path.join(raw, "conll2014", "train.jsonl"), "y" * 1000),
            (os.path.join(processed, "grammar_examples.csv"), "z" * 1000),
        ):
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(payload)
        return raw, processed

    def test_dry_run_deletes_nothing(self, tmp_path):
        raw, processed = self._seed(tmp_path)
        cleanup.prune_raw(confirm=False, raw_root=raw)
        cleanup.prune_processed(confirm=False, processed_root=processed)
        assert os.path.exists(os.path.join(raw, "thesis-structural"))
        assert os.path.exists(os.path.join(raw, "conll2014"))
        assert os.path.exists(os.path.join(processed, "grammar_examples.csv"))

    def test_prune_removes_regenerable_only(self, tmp_path):
        raw, _ = self._seed(tmp_path)
        reclaimed = cleanup.prune_raw(confirm=True, raw_root=raw)
        assert reclaimed == 1000
        assert not os.path.exists(os.path.join(raw, "thesis-structural"))
        assert os.path.exists(os.path.join(raw, "conll2014"))

    def test_prune_processed_reports_bytes(self, tmp_path):
        _, processed = self._seed(tmp_path)
        assert cleanup.prune_processed(confirm=True, processed_root=processed) == 1000
        assert not os.path.exists(os.path.join(processed, "grammar_examples.csv"))

    def test_protection_survives_unknown_corpus(self, tmp_path, monkeypatch):
        """A newly added manual corpus is protected by editing PROTECTED_RAW."""
        raw, _ = self._seed(tmp_path)
        os.makedirs(os.path.join(raw, "my-own-corpus"), exist_ok=True)
        with open(os.path.join(raw, "my-own-corpus", "data.jsonl"), "w", encoding="utf-8") as handle:
            handle.write("q" * 1000)
        monkeypatch.setattr(cleanup, "PROTECTED_RAW", frozenset({"conll2014", "my-own-corpus"}))
        cleanup.prune_raw(confirm=True, raw_root=raw)
        assert os.path.exists(os.path.join(raw, "my-own-corpus"))
        assert not os.path.exists(os.path.join(raw, "thesis-structural"))

    def test_only_selects_single_corpus(self, tmp_path):
        """Targeted pruning drops the big mirror and keeps the small ones."""
        raw = str(tmp_path / "raw")
        for name in ("thesis-structural", "wikitext-103"):
            os.makedirs(os.path.join(raw, name), exist_ok=True)
            with open(os.path.join(raw, name, "t.jsonl"), "w", encoding="utf-8") as handle:
                handle.write("x" * 1000)
        cleanup.prune_raw(confirm=True, raw_root=raw, only={"thesis-structural"})
        assert not os.path.exists(os.path.join(raw, "thesis-structural"))
        assert os.path.exists(os.path.join(raw, "wikitext-103"))

    def test_training_csv_survives_unselected_prune(self, tmp_path):
        """formatting_examples.csv is the training set and must be selectable."""
        processed = str(tmp_path / "processed")
        os.makedirs(processed, exist_ok=True)
        for name in ("formatting_examples.csv", "formatting_examples_merged.csv"):
            with open(os.path.join(processed, name), "w", encoding="utf-8") as handle:
                handle.write("x" * 1000)
        cleanup.prune_processed(confirm=True, processed_root=processed, only={"formatting_examples_merged.csv"})
        assert not os.path.exists(os.path.join(processed, "formatting_examples_merged.csv"))
        assert os.path.exists(os.path.join(processed, "formatting_examples.csv"))
