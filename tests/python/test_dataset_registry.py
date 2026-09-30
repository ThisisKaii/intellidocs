"""
pytest tests for the section 1.1 multi-dataset registry.

Covers registry wiring, CoNLL error-category mapping, thesis section labelling
and the download success/failure paths. Loader functions are stubbed so no
network access is required.
"""
import dataclasses
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../ml/dataset'))

import download  # noqa: E402
import m2  # noqa: E402


class FakeSplit:
    """
    Minimal stand-in for a datasets Split backed by a list of dicts.

    map() mirrors the real library's batched behaviour - a batched function
    receives column-wise lists and its list results are concatenated - because
    that is the only way datasets supports expanding one record into several.
    """

    def __init__(self, rows):
        self.rows = rows
        self.column_names = list(rows[0].keys()) if rows else []

    def map(self, fn, batched=False, remove_columns=None):
        """Apply fn to every row or to column-wise batches, returning a FakeSplit."""
        if not batched:
            return FakeSplit([fn(row) for row in self.rows])
        columns = list(self.rows[0].keys()) if self.rows else []
        batch = {column: [row[column] for row in self.rows] for column in columns}
        result = fn(batch)
        size = len(result[list(result.keys())[0]]) if result else 0
        rows = [{key: result[key][i] for key in result} for i in range(size)]
        if remove_columns:
            rows = [{k: v for k, v in row.items() if k not in remove_columns} for row in rows]
        return FakeSplit(rows)

    def filter(self, fn):
        """Keep rows matching fn, returning a new FakeSplit."""
        return FakeSplit([row for row in self.rows if fn(row)])

    def to_json(self, path, **kwargs):
        """Write the rows as JSONL."""
        with open(path, "w", encoding="utf-8") as handle:
            for row in self.rows:
                handle.write(json.dumps(row) + "\n")


class FakeDatasetDict(dict):
    """Minimal stand-in for datasets.DatasetDict."""


CONLL_RAW = {
    "train": FakeSplit(
        [
            {"sentence": "He go home.", "corrected": "He goes home.", "error_type": "U:SVA"},
            {"sentence": "The the cat.", "corrected": "The cat.", "error_type": "U:xxx"},
            {"sentence": "No change here.", "corrected": "No change here.", "error_type": "S"},
        ]
    )
}


def conll_normalized():
    """Normalize the CoNLL stub rows the way the loader does."""
    return download.DatasetDict(
        {
            "train": download.LocalSplit(
                [download.normalize_conll_record(r) for r in CONLL_RAW["train"].rows if download.normalize_conll_record(r)]
            )
        }
    )

THESIS_RAW = {"train": FakeSplit([{"article": "Abstract We propose a new model."}])}


class TestRegistry:
    """The registry must describe every planned corpus."""

    def test_all_corpora_registered(self):
        slugs = {spec.slug for spec in download.DATASETS}
        assert slugs == {
            "wikitext-103",
            "jfleg",
            "nucle",
            "conll2014",
            "thesis-structural",
        }

    def test_nucle_is_not_labelled_as_conll2014(self):
        """NUCLE is a different corpus and must keep its own identity."""
        slugs = {spec.slug for spec in download.DATASETS}
        assert "nucle" in slugs
        assert "conll2014" in slugs
        nucle = next(spec for spec in download.DATASETS if spec.slug == "nucle")
        assert nucle.loader is not download.load_conll2014

    def test_slugs_are_unique(self):
        slugs = [spec.slug for spec in download.DATASETS]
        assert len(slugs) == len(set(slugs))

    def test_every_spec_has_loader_and_description(self):
        for spec in download.DATASETS:
            assert callable(spec.loader), spec.slug
            assert spec.description, spec.slug
            assert spec.tags, spec.slug

    def test_required_corpora(self):
        """WikiText-103 and JFLEG are mandatory for the dean's pre-training rule."""
        required = {spec.slug for spec in download.DATASETS if spec.required}
        assert required == {"wikitext-103", "jfleg"}

    def test_optional_corpora_can_be_skipped(self):
        optional = {spec.slug for spec in download.DATASETS if not spec.required}
        assert optional == {"nucle", "conll2014", "thesis-structural"}


class TestConllCategories:
    """CoNLL MISC annotations map to the categories the plan calls out."""

    @pytest.mark.parametrize(
        "annotation,expected",
        [
            ("Morfparsik", "morphology"),
            ("Morfsyn", "morphology"),
            ("U:Prep", "preposition"),
            ("U:Adp", "preposition"),
            ("U:Art", "article"),
            ("U:SVA", "agreement"),
            ("U:Agr", "agreement"),
            ("U:Punc", "punctuation"),
            ("U:Cap", "capitalization"),
            ("U:xxx", "spelling"),
            ("U:Word", "word_choice"),
        ],
    )
    def test_known_annotations(self, annotation, expected):
        assert m2.classify_error_type(annotation) == expected

    @pytest.mark.parametrize(
        "annotation,expected",
        [
            # The 28 CoNLL-2014 tags, as used by the NUCLE shared-task release.
            ("ArtOrDet", "article"),
            ("SVA", "agreement"),
            ("Prep", "preposition"),
            ("Mec", "spelling"),
            ("Spar", "spelling"),
            ("Vform", "morphology"),
            ("Vt", "morphology"),
            ("Wci", "word_choice"),
            ("Trans", "part_of_speech"),
            ("Others", "uncategorized"),
            # ERRANT-style codes from the BEA 2019 gold file.
            ("R:VERB:SVA", "agreement"),
            ("M:DET", "article"),
            ("U:PREP", "preposition"),
            ("R:ORTH", "spelling"),
            ("R:MORPH", "morphology"),
            ("M:PUNCT", "punctuation"),
            ("R:OTHER", "uncategorized"),
            ("UNK", "uncategorized"),
        ],
    )
    def test_taxonomy_coverage(self, annotation, expected):
        assert m2.classify_error_type(annotation) == expected

    @pytest.mark.parametrize("annotation", ["spelling", "agreement", "morphology"])
    def test_classifier_is_idempotent(self, annotation):
        """An already-broadened label must survive a second pass."""
        assert m2.classify_error_type(annotation) == annotation

    @pytest.mark.parametrize("annotation", ["S", "-", "", "totally_unknown"])
    def test_unrecognised_annotations(self, annotation):
        assert m2.classify_error_type(annotation) == "uncategorized"

    def test_every_co2014_tag_maps_to_a_known_category(self):
        """No CoNLL tag may map to a category outside the declared set."""
        for tag, category in m2.CO2014_ERROR_TYPES.items():
            assert category in m2.ERROR_CATEGORIES, tag


class TestThesisSections:
    """Thesis passages are labelled with the section they resemble."""

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("Abstract", "abstract"),
            ("abstract", "abstract"),
            ("ABSTRACT", "abstract"),
            ("Methodology", "methodology"),
            ("Materials and Methods", "methodology"),
            ("Results", "results"),
            ("Discussion", "results"),
            ("Conclusion", "conclusion"),
            ("References", "references"),
            ("Bibliography", "references"),
        ],
    )
    def test_plain_headings(self, text, expected):
        assert download.classify_thesis_section(text) == expected

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("2. Methodology", "methodology"),
            ("3.2 Results", "results"),
            ("IV. CONCLUSION", "conclusion"),
            ("CHAPTER 3: RESULTS", "results"),
        ],
    )
    def test_numbered_headings(self, text, expected):
        """Theses number their sections, so the numbering must be stripped."""
        assert download.classify_thesis_section(text) == expected

    def test_body_text_is_body(self):
        assert download.classify_thesis_section("This paragraph continues.") == "body"

    def test_unknown_numbered_heading_is_body(self):
        assert download.classify_thesis_section("2.1 Experimental Setup") == "body"


class TestNormalization:
    """Record normalizers flatten corpus-specific fields into one schema."""

    def test_conll_pairs_classified(self):
        rows = [download.normalize_conll_record(r) for r in CONLL_RAW["train"].rows]
        rows = [r for r in rows if r]
        assert [r["error_type"] for r in rows] == ["agreement", "spelling"]

    def test_conll_drops_unchanged_pairs(self):
        rows = [download.normalize_conll_record(r) for r in CONLL_RAW["train"].rows]
        rows = [r for r in rows if r]
        assert all(r["sentence"] != r["corrected"] for r in rows)

    def test_conll_schema_is_flat(self):
        row = download.normalize_conll_record(CONLL_RAW["train"].rows[0])
        assert set(row.keys()) == {"sentence", "corrected", "error_type"}

    def test_conll_rejects_non_dict(self):
        assert download.normalize_conll_record(["not", "a", "dict"]) is None

    def test_conll_rejects_blank_pair(self):
        assert download.normalize_conll_record({"sentence": "  ", "corrected": "x"}) is None

    def test_conll_rejects_identical_pair(self):
        assert download.normalize_conll_record({"sentence": "Same.", "corrected": "Same."}) is None

    def test_conll_broadens_pre_broadened_label(self):
        row = download.normalize_conll_record(
            {"sentence": "a b", "corrected": "a the b", "error_type": "spelling"}
        )
        assert row["error_type"] == "spelling"

    def test_thesis_section_recorded(self):
        rows = download._normalize_thesis_splits(FakeDatasetDict(THESIS_RAW))["train"].rows
        assert rows[0]["section"] == "abstract"
        assert rows[0]["text"].startswith("Abstract")

    def test_thesis_expands_abstract_and_body(self):
        """A paper must yield both an abstract row and a body row."""
        raw = FakeDatasetDict(
            {
                "train": FakeSplit(
                    [
                        {
                            "abstract": "A short abstract sentence for the paper.",
                            "article": "The body of the paper runs on for a while.",
                        }
                    ]
                )
            }
        )
        rows = download._normalize_thesis_splits(raw)["train"].rows
        assert [r["section"] for r in rows] == ["abstract", "body"]
        assert rows[0]["text"] == "A short abstract sentence for the paper."
        assert rows[1]["text"] == "The body of the paper runs on for a while."

    def test_thesis_uses_summary_field(self):
        """The summarization mirror names the abstract column "summary"."""
        raw = FakeDatasetDict(
            {"train": FakeSplit([{"summary": "Summary text of the document.", "article": "Body text."}])}
        )
        rows = download._normalize_thesis_splits(raw)["train"].rows
        assert [r["section"] for r in rows] == ["abstract", "body"]
        assert rows[0]["text"] == "Summary text of the document."

    def test_thesis_drops_paper_with_no_text(self):
        raw = FakeDatasetDict({"train": FakeSplit([{"abstract": "  ", "article": ""}])})
        assert download._normalize_thesis_splits(raw)["train"].rows == []

    def test_thesis_drops_empty_text(self):
        raw = FakeDatasetDict({"train": FakeSplit([{"article": "   "}])})
        assert download._normalize_thesis_splits(raw)["train"].rows == []


class TestConllLocalLoader:
    """CoNLL-2014 is user-supplied JSONL, since it is absent from the Hub."""

    def _write(self, tmp_path, filename, lines):
        directory = tmp_path / "raw" / "conll2014"
        directory.mkdir(parents=True, exist_ok=True)
        with open(directory / filename, "w", encoding="utf-8") as handle:
            for line in lines:
                handle.write(line + "\n")
        return str(tmp_path / "raw")

    def test_reads_jsonl_splits(self, tmp_path, monkeypatch):
        root = self._write(
            tmp_path,
            "train.jsonl",
            [
                json.dumps({"sentence": "He go home.", "corrected": "He goes home.", "error_type": "U:SVA"}),
                json.dumps({"sentence": "The the cat.", "corrected": "The cat.", "error_type": "U:xxx"}),
            ],
        )
        monkeypatch.setattr(download, "RAW_ROOT", root)
        dataset = download.load_conll2014()
        assert "train" in dataset
        assert len(dataset["train"].rows) == 2
        assert [r["error_type"] for r in dataset["train"].rows] == ["agreement", "spelling"]

    def test_multiple_splits_loaded(self, tmp_path, monkeypatch):
        self._write(
            tmp_path,
            "train.jsonl",
            [json.dumps({"sentence": "A b", "corrected": "A the b", "error_type": "U:Art"})],
        )
        root = self._write(
            tmp_path,
            "test.jsonl",
            [json.dumps({"sentence": "C d", "corrected": "C the d", "error_type": "U:Prep"})],
        )
        monkeypatch.setattr(download, "RAW_ROOT", root)
        dataset = download.load_conll2014()
        assert set(dataset.keys()) == {"train", "test"}

    def test_invalid_json_lines_skipped(self, tmp_path, monkeypatch, capsys):
        root = self._write(
            tmp_path,
            "train.jsonl",
            [
                json.dumps({"sentence": "He go.", "corrected": "He goes.", "error_type": "U:SVA"}),
                "{not valid json",
                json.dumps({"sentence": "Same.", "corrected": "Same.", "error_type": "S"}),
            ],
        )
        monkeypatch.setattr(download, "RAW_ROOT", root)
        dataset = download.load_conll2014()
        assert len(dataset["train"].rows) == 1
        assert "skipping invalid JSON" in capsys.readouterr().out

    def test_missing_data_raises_with_manual_instructions(self, tmp_path, monkeypatch):
        monkeypatch.setattr(download, "RAW_ROOT", str(tmp_path / "raw"))
        with pytest.raises(RuntimeError) as excinfo:
            download.load_conll2014()
        message = str(excinfo.value)
        assert "Hugging Face" in message
        assert "sentence" in message and "error_type" in message

    def test_non_jsonl_files_ignored(self, tmp_path, monkeypatch):
        directory = tmp_path / "raw" / "conll2014"
        directory.mkdir(parents=True)
        (directory / "notes.txt").write_text("ignore me", encoding="utf-8")
        monkeypatch.setattr(download, "RAW_ROOT", str(tmp_path / "raw"))
        with pytest.raises(RuntimeError):
            download.load_conll2014()


class TestDownloadFlow:
    """Download reporting, metadata and failure handling."""

    @pytest.fixture()
    def isolated_root(self, tmp_path, monkeypatch):
        """Point the registry at a temporary raw directory."""
        monkeypatch.setattr(download, "RAW_ROOT", str(tmp_path / "raw"))
        return str(tmp_path / "raw")

    def _stubbed_registry(self, conll, thesis):
        """Registry whose loaders return pre-normalized stub data."""
        def make_loader(slug):
            if slug == "conll2014":
                return lambda: conll
            if slug == "thesis-structural":
                return lambda: thesis
            return lambda: FakeDatasetDict({"train": FakeSplit([{"text": "x"}])})

        return tuple(dataclasses.replace(s, loader=make_loader(s.slug)) for s in download.DATASETS)

    def test_all_datasets_download(self, isolated_root, monkeypatch):
        conll = download.DatasetDict({"train": download.LocalSplit([r for r in (download.normalize_conll_record(x) for x in CONLL_RAW["train"].rows) if r])})
        thesis = download._normalize_thesis_splits(FakeDatasetDict(THESIS_RAW))
        monkeypatch.setattr(download, "DATASETS", self._stubbed_registry(conll, thesis))

        results = download.download_all()
        assert all(results.values()), results
        for slug in ("wikitext-103", "jfleg", "conll2014", "thesis-structural"):
            assert os.path.exists(os.path.join(isolated_root, slug, "train.jsonl"))

    def test_metadata_records_provenance(self, isolated_root, monkeypatch):
        conll = download.DatasetDict({"train": download.LocalSplit([r for r in (download.normalize_conll_record(x) for x in CONLL_RAW["train"].rows) if r])})
        thesis = download._normalize_thesis_splits(FakeDatasetDict(THESIS_RAW))
        monkeypatch.setattr(download, "DATASETS", self._stubbed_registry(conll, thesis))
        download.download_all()

        with open(os.path.join(isolated_root, "conll2014", "README.txt"), encoding="utf-8") as handle:
            readme = handle.read()
        assert "dataset=CoNLL-2014" in readme
        assert "categorized" in readme

    def test_required_failure_raises(self, isolated_root):
        def boom():
            raise RuntimeError("network down")

        spec = download.DatasetSpec(slug="req", label="Req", loader=boom, required=True)
        with pytest.raises(RuntimeError):
            download.download_dataset(spec)

    def test_optional_failure_is_skipped(self, isolated_root, capsys):
        def boom():
            raise RuntimeError("network down")

        spec = download.DatasetSpec(slug="opt", label="Opt", loader=boom, required=False)
        assert download.download_dataset(spec) is False
        assert "SKIPPED" in capsys.readouterr().out

    def test_optional_failure_leaves_no_partial_output(self, isolated_root):
        def boom():
            raise RuntimeError("network down")

        spec = download.DatasetSpec(slug="opt", label="Opt", loader=boom, required=False)
        download.download_dataset(spec)
        assert not os.path.exists(os.path.join(isolated_root, "opt", "train.jsonl"))

    def test_unknown_slug_rejected(self):
        with pytest.raises(ValueError, match="Unknown dataset slug"):
            download.download_all(slugs=["not-a-dataset"])

    def test_empty_slug_list_is_noop(self, isolated_root, monkeypatch):
        def boom():
            raise AssertionError("should not download anything")

        stubbed = tuple(
            dataclasses.replace(s, loader=boom) for s in download.DATASETS
        )
        monkeypatch.setattr(download, "DATASETS", stubbed)
        assert download.download_all(slugs=[]) == {}

    def test_single_slug_selection(self, isolated_root, monkeypatch):
        conll = download.DatasetDict({"train": download.LocalSplit([r for r in (download.normalize_conll_record(x) for x in CONLL_RAW["train"].rows) if r])})
        thesis = download._normalize_thesis_splits(FakeDatasetDict(THESIS_RAW))
        monkeypatch.setattr(download, "DATASETS", self._stubbed_registry(conll, thesis))
        results = download.download_all(slugs=["jfleg"])
        assert list(results.keys()) == ["jfleg"]
