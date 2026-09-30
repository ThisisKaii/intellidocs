"""Tests for the hybrid compliance auditor and the training checkpoint markers."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
ML_DIR = REPO_ROOT / "ml"
for candidate in (str(ML_DIR), str(ML_DIR / "training")):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

from grammar import compliance_rules as rules  # noqa: E402
from grammar.compliance_auditor import (  # noqa: E402
    FEATURE_NAMES,
    STYLE_CLASSES,
    audit_document,
    feature_frame,
    map_observed_style,
    score_ml_tier,
    score_rule_tier,
    style_features,
)
from training.checkpoint import (  # noqa: E402
    CHECKPOINT_VERSION,
    STATUS_COMPLETE,
    STATUS_FAILED,
    TrainingCheckpoint,
    list_checkpoints,
)

GOOD_PAGE_SETUP = {
    "margins": {"top": 1.0, "bottom": 1.0, "left": 1.0, "right": 1.0},
    "show_header": True,
    "show_footer": False,
    "header_number_format": "number",
    "footer_number_format": "none",
}

APA_REFERENCES = (
    "<p><strong>References</strong></p>"
    "<p>Doe, A. (2019). Document structure for theses. ACM.</p>"
    "<p>Smith, J. (2020). Formatting prediction in web editors. IEEE.</p>"
)


def compliant_document(extra: str = "") -> str:
    """Build a document that should pass every Tier 1 rule."""
    return (
        "<h1>Introduction</h1>"
        "<p>This study examines formatting prediction in a web based editor "
        "and evaluates the resulting suggestions.</p>"
        "<h2>Related Work</h2>"
        "<p>Earlier systems learn formatting behaviour but never predict it "
        "automatically for the next block of text.</p>"
        + APA_REFERENCES
        + extra
    )


REQUIREMENTS = {
    "mandatory_headings": ["Introduction", "References"],
    "reference_style": "apa",
    "required_margin_inches": 1.0,
}


def find_check(report: dict, check_id: str, name_contains: str = "") -> dict:
    """Return the first check matching an id or a partial name."""
    for check in report["checks"]:
        if check["id"] == check_id and name_contains.lower() in check["name"].lower():
            return check
    for check in report["checks"]:
        if check["id"] == check_id:
            return check
    raise AssertionError(f"no check with id {check_id!r} in {[c['id'] for c in report['checks']]}")


class TestMarginRule:
    """The 1 inch margin rule distinguishes rounding from real deviations."""

    def test_exact_margins_pass(self):
        report = audit_document(compliant_document(), GOOD_PAGE_SETUP, REQUIREMENTS)
        assert find_check(report, "margins")["status"] == "pass"

    def test_missing_margin_fails(self):
        setup = {"margins": {"top": 1.0}, "show_header": True, "header_number_format": "number"}
        report = audit_document(compliant_document(), setup, REQUIREMENTS)
        check = find_check(report, "margins")
        assert check["status"] == "fail"
        assert "missing" in check["detail"]

    def test_small_deviation_warns_but_large_fails(self):
        base = dict(GOOD_PAGE_SETUP)
        base["margins"] = {"top": 1.1, "bottom": 1.0, "left": 1.0, "right": 1.0}
        assert find_check(audit_document(compliant_document(), base, REQUIREMENTS), "margins")["status"] == "warn"

        base["margins"] = {"top": 0.5, "bottom": 0.5, "left": 0.5, "right": 0.5}
        assert find_check(audit_document(compliant_document(), base, REQUIREMENTS), "margins")["status"] == "fail"

    def test_required_margin_is_configurable(self):
        setup = {"margins": {"top": 1.5, "bottom": 1.5, "left": 1.5, "right": 1.5}}
        report = audit_document(
            compliant_document(), setup, {"required_margin_inches": 1.5}
        )
        assert find_check(report, "margins")["status"] == "pass"


class TestPageNumberRule:
    """A page number must be printed, in arabic numerals."""

    def test_arabic_header_passes(self):
        report = audit_document(compliant_document(), GOOD_PAGE_SETUP, REQUIREMENTS)
        assert find_check(report, "page_numbers")["status"] == "pass"

    def test_no_header_or_footer_fails(self):
        setup = {"margins": GOOD_PAGE_SETUP["margins"], "show_header": False, "show_footer": False}
        report = audit_document(compliant_document(), setup, REQUIREMENTS)
        assert find_check(report, "page_numbers")["status"] == "fail"

    def test_roman_numerals_warn(self):
        setup = dict(GOOD_PAGE_SETUP, header_number_format="roman")
        report = audit_document(compliant_document(), setup, REQUIREMENTS)
        check = find_check(report, "page_numbers")
        assert check["status"] == "warn"
        assert "roman" in check["detail"]

    def test_footer_numbering_is_accepted(self):
        setup = {
            "margins": GOOD_PAGE_SETUP["margins"],
            "show_header": False,
            "show_footer": True,
            "footer_number_format": "number",
        }
        report = audit_document(compliant_document(), setup, REQUIREMENTS)
        assert find_check(report, "page_numbers")["status"] == "pass"

    def test_disabled_roman_numbering_does_not_count(self):
        """A roman format on a disabled footer must not satisfy the rule."""
        setup = {
            "margins": GOOD_PAGE_SETUP["margins"],
            "show_header": True,
            "show_footer": False,
            "header_number_format": "none",
            "footer_number_format": "roman",
        }
        report = audit_document(compliant_document(), setup, REQUIREMENTS)
        assert find_check(report, "page_numbers")["status"] == "fail"


class TestHeadingCapitalization:
    """Headings must be title case rather than capitals."""

    def test_title_case_passes(self):
        report = audit_document(compliant_document(), GOOD_PAGE_SETUP, REQUIREMENTS)
        assert find_check(report, "heading_capitalization")["status"] == "pass"

    def test_all_caps_fails(self):
        html = "<h1>INTRODUCTION</h1><p>Body text for the document.</p>"
        report = audit_document(html, GOOD_PAGE_SETUP, REQUIREMENTS)
        check = find_check(report, "heading_capitalization")
        assert check["status"] == "fail"
        assert "capitals" in check["detail"]

    def test_document_without_headings_fails(self):
        report = audit_document("<p>Just one paragraph with no headings at all.</p>", GOOD_PAGE_SETUP, {})
        assert find_check(report, "heading_capitalization")["status"] == "fail"

    def test_mixed_case_warns(self):
        html = "<h1>Introduction</h1><h2>related work</h2><h2>background details</h2>"
        report = audit_document(html, GOOD_PAGE_SETUP, REQUIREMENTS)
        assert find_check(report, "heading_capitalization")["status"] == "warn"

    def test_bold_paragraph_counts_as_a_heading(self):
        """TipTap stores typed section titles as bold paragraphs, not headings."""
        soup = rules.parse_document("<p><strong>Abstract</strong></p><p>Body.</p>")
        assert "Abstract" in rules.collect_headings(soup)

    def test_bold_sentence_is_not_treated_as_a_heading(self):
        soup = rules.parse_document("<p><strong>This is a bolded sentence that runs on.</strong></p>")
        assert rules.collect_headings(soup) == []


class TestTableCaptions:
    """Table captions must be numbered sequentially from Table 1."""

    def test_no_tables_passes(self):
        report = audit_document(compliant_document(), GOOD_PAGE_SETUP, REQUIREMENTS)
        assert find_check(report, "table_captions")["status"] == "pass"

    def test_sequential_captions_pass(self):
        html = (
            compliant_document()
            + "<p>Table 1. First results table.</p><table><tr><td>a</td></tr></table>"
            + "<p>Table 2. Second results table.</p><table><tr><td>b</td></tr></table>"
        )
        report = audit_document(html, GOOD_PAGE_SETUP, REQUIREMENTS)
        assert find_check(report, "table_captions")["status"] == "pass"

    def test_missing_caption_fails(self):
        html = compliant_document() + "<table><tr><td>a</td></tr></table>"
        report = audit_document(html, GOOD_PAGE_SETUP, REQUIREMENTS)
        check = find_check(report, "table_captions")
        assert check["status"] == "fail"
        assert "no 'Table N' caption" in check["detail"]

    def test_gap_in_numbering_warns(self):
        html = (
            compliant_document()
            + "<p>Table 1. First table.</p><table><tr><td>a</td></tr></table>"
            + "<p>Table 3. Third table.</p><table><tr><td>b</td></tr></table>"
        )
        report = audit_document(html, GOOD_PAGE_SETUP, REQUIREMENTS)
        check = find_check(report, "table_captions")
        assert check["status"] == "warn"
        assert "consecutive" in check["detail"]

    def test_duplicate_number_warns(self):
        html = (
            compliant_document()
            + "<p>Table 1. First table.</p><table><tr><td>a</td></tr></table>"
            + "<p>Table 1. Also called first.</p><table><tr><td>b</td></tr></table>"
        )
        report = audit_document(html, GOOD_PAGE_SETUP, REQUIREMENTS)
        check = find_check(report, "table_captions")
        assert check["status"] == "warn"
        assert "duplicated" in check["detail"]


class TestReferenceFormat:
    """The bibliography must exist and use one consistent citation style."""

    def test_sorted_apa_passes(self):
        report = audit_document(compliant_document(), GOOD_PAGE_SETUP, REQUIREMENTS)
        assert find_check(report, "reference_format")["status"] == "pass"

    def test_unsorted_apa_warns(self):
        html = (
            "<p><strong>References</strong></p>"
            "<p>Smith, J. (2020). Formatting prediction. IEEE.</p>"
            "<p>Doe, A. (2019). Document structure. ACM.</p>"
        )
        report = audit_document(html, GOOD_PAGE_SETUP, REQUIREMENTS)
        check = find_check(report, "reference_format")
        assert check["status"] == "warn"
        assert "alphabetised" in check["detail"]

    def test_mixed_styles_fail(self):
        html = (
            "<p><strong>References</strong></p>"
            "<p>Doe, A. (2019). Document structure. ACM.</p>"
            '<p>[2] J. Smith, "Formatting prediction," in Proc. WebDocs, vol. 2, no. 1, pp. 1-9, 2020.</p>'
        )
        report = audit_document(html, GOOD_PAGE_SETUP, REQUIREMENTS)
        check = find_check(report, "reference_format")
        assert check["status"] == "fail"
        assert "mixes" in check["detail"]

    def test_wrong_required_style_fails(self):
        requirements = {**REQUIREMENTS, "reference_style": "ieee"}
        report = audit_document(compliant_document(), GOOD_PAGE_SETUP, requirements)
        check = find_check(report, "reference_format")
        assert check["status"] == "fail"
        assert "requires IEEE" in check["detail"]

    def test_missing_references_fails_when_required(self):
        html = "<h1>Introduction</h1><p>Only a body paragraph, no bibliography.</p>"
        report = audit_document(html, GOOD_PAGE_SETUP, REQUIREMENTS)
        assert find_check(report, "reference_format")["status"] == "fail"

    def test_missing_references_passes_when_not_required(self):
        html = "<h1>Introduction</h1><p>Only a body paragraph, no bibliography.</p>"
        requirements = {**REQUIREMENTS, "references_required": False}
        report = audit_document(html, GOOD_PAGE_SETUP, requirements)
        assert find_check(report, "reference_format")["status"] == "pass"

    def test_reference_style_detection(self):
        assert rules.detect_reference_style("Doe, A. (2019). Title. Publisher.") == "apa"
        assert rules.detect_reference_style(
            '[1] J. Smith, "Title," Journal, vol. 2, no. 1, pp. 1-9, 2020.'
        ) == "ieee"
        assert rules.detect_reference_style("just some words") == "unknown"

    def test_ieee_numbered_bibliography_passes(self):
        html = (
            "<p><strong>References</strong></p>"
            '<p>[1] J. Smith, "Formatting prediction," in Proc. WebDocs, vol. 2, no. 1, pp. 1-9, 2020.</p>'
            '<p>[2] A. Doe, "Document structure," in Proc. Docs, vol. 3, no. 2, pp. 4-8, 2021.</p>'
        )
        report = audit_document(html, GOOD_PAGE_SETUP, {"reference_style": "ieee"})
        assert find_check(report, "reference_format")["status"] == "pass"


class TestRequiredSections:
    """Each mandatory thesis section is reported separately."""

    def test_all_present_passes(self):
        report = audit_document(compliant_document(), GOOD_PAGE_SETUP, REQUIREMENTS)
        section_checks = [c for c in report["checks"] if c["id"] == "required_sections"]
        assert len(section_checks) == 2
        assert all(check["status"] == "pass" for check in section_checks)

    def test_missing_section_fails_with_name(self):
        html = "<h1>Introduction</h1><p>Body text without any references.</p>"
        report = audit_document(html, GOOD_PAGE_SETUP, REQUIREMENTS)
        missing = [c for c in report["checks"] if c["name"] == "Section: References"]
        assert missing and missing[0]["status"] == "fail"

    def test_no_requirements_produces_no_section_checks(self):
        report = audit_document(compliant_document(), GOOD_PAGE_SETUP, {})
        assert [c for c in report["checks"] if c["id"] == "required_sections"] == []


class TestHybridScoring:
    """The aggregate score combines the two tiers and degrades honestly."""

    def test_compliant_document_scores_full_marks(self):
        report = audit_document(compliant_document(), GOOD_PAGE_SETUP, REQUIREMENTS)
        assert report["rule_score"] == 100.0
        assert report["summary"]["failed"] == 0

    def test_aggregate_is_a_weighted_blend_when_ml_is_available(self, monkeypatch):
        import grammar.compliance_auditor as auditor

        monkeypatch.setattr(
            auditor, "score_style_consistency",
            lambda paragraphs: {"score": 50.0, "paragraphs_analyzed": 2},
        )
        monkeypatch.setattr(
            auditor, "score_flow_consistency",
            lambda styles: {"score": 50.0, "transitions": 1},
        )
        report = auditor.audit_document(compliant_document(), GOOD_PAGE_SETUP, REQUIREMENTS)
        assert report["ml"]["available"] is True
        assert report["ml_score"] == 50.0
        assert report["aggregate_score"] == pytest.approx(
            auditor.RULE_WEIGHT * 100.0 + auditor.ML_WEIGHT * 50.0, abs=0.01
        )

    def test_rules_only_when_models_are_missing(self, monkeypatch):
        import grammar.compliance_auditor as auditor

        monkeypatch.setattr(auditor, "load_style_model", lambda: None)
        monkeypatch.setattr(auditor, "load_flow_model", lambda: None)
        report = auditor.audit_document(compliant_document(), GOOD_PAGE_SETUP, REQUIREMENTS)
        assert report["ml"]["available"] is False
        assert report["ml_score"] is None
        assert report["aggregate_score"] == report["rule_score"]
        assert "compliance_trainer" in report["ml"]["unavailable_reason"]

    def test_required_failures_block_readiness(self, monkeypatch):
        import grammar.compliance_auditor as auditor

        monkeypatch.setattr(auditor, "load_style_model", lambda: None)
        monkeypatch.setattr(auditor, "load_flow_model", lambda: None)
        setup = {"margins": {"top": 0.5, "bottom": 0.5, "left": 0.5, "right": 0.5}}
        report = auditor.audit_document(compliant_document(), setup, REQUIREMENTS)
        assert report["ready"] is False
        assert any("Page margins" in name for name in report["blocking_issues"])

    def test_non_required_failure_does_not_block(self, monkeypatch):
        import grammar.compliance_auditor as auditor

        monkeypatch.setattr(auditor, "load_style_model", lambda: None)
        monkeypatch.setattr(auditor, "load_flow_model", lambda: None)
        html = "<h1>INTRODUCTION</h1><p>Body text.</p>" + APA_REFERENCES
        report = auditor.audit_document(html, GOOD_PAGE_SETUP, REQUIREMENTS)
        assert not any("Heading capitalization" in name for name in report["blocking_issues"])

    def test_rule_tier_weights_failures_more_than_warnings(self):
        warn = [{"status": "warn", "weight": 1.0}]
        fail = [{"status": "fail", "weight": 1.0}]
        assert score_rule_tier(warn)["score"] == 50.0
        assert score_rule_tier(fail)["score"] == 0.0
        assert score_rule_tier([])["score"] == 100.0

    def test_ml_tier_returns_none_without_either_model(self):
        assert score_ml_tier(None, None) is None
        assert score_ml_tier({"score": 40.0}, None) == 40.0
        assert score_ml_tier(None, {"score": 70.0}) == 70.0
        assert score_ml_tier({"score": 100.0}, {"score": 0.0}) == pytest.approx(60.0)


class TestStyleFeatures:
    """The feature extractor is shared by training and inference."""

    def test_feature_vector_is_complete_and_numeric(self):
        features = style_features("This is a sample sentence for testing.")
        assert set(features) == set(FEATURE_NAMES)
        assert all(isinstance(value, float) for value in features.values())

    def test_empty_text_is_safe(self):
        features = style_features("")
        assert set(features) == set(FEATURE_NAMES)
        assert features["word_count"] == 0.0

    def test_bullets_and_numbering_are_detected(self):
        assert style_features("- first item")["starts_with_bullet"] == 1.0
        assert style_features("1.2.1 Subsection Title")["starts_with_numbering"] == 1.0

    def test_citations_and_years_are_counted(self):
        features = style_features("Prior work (Smith, 2020) showed results in 2021.")
        assert features["citation_density"] == 1.0
        assert features["has_year"] == 1.0

    def test_capitalisation_flags(self):
        assert style_features("INTRODUCTION TO THE STUDY")["is_all_caps"] == 1.0
        assert style_features("Introduction To The Study")["is_title_case"] == 1.0

    def test_frame_columns_match_feature_order(self):
        frame = feature_frame([{"text": "one two three"}, {"text": "four five six"}])
        assert list(frame.columns) == list(FEATURE_NAMES)
        assert len(frame) == 2

    def test_empty_frame_keeps_columns(self):
        frame = feature_frame([])
        assert frame.empty
        assert list(frame.columns) == list(FEATURE_NAMES)

    @pytest.mark.parametrize(
        "style,expected",
        [
            ("paragraph", "paragraph"),
            ("heading1", "heading1"),
            ("reference_entry", "paragraph"),
            ("caption", "paragraph"),
            ("heading4", "heading3"),
            ("something_unknown", "paragraph"),
        ],
    )
    def test_observed_style_mapping(self, style, expected):
        assert map_observed_style(style) == expected

    def test_every_aliased_style_maps_into_a_trained_class(self):
        for style in ("reference_entry", "caption", "heading6", "unknown_style"):
            assert map_observed_style(style) in STYLE_CLASSES


class TestParagraphCollection:
    """Blocks are collected with the style their markup implies."""

    def test_headings_carry_heading_styles(self):
        soup = rules.parse_document("<h1>Title Here</h1><h3>Deeper Section</h3>")
        styles = [item["style"] for item in rules.collect_paragraphs(soup)]
        assert styles == ["heading1", "heading3"]

    def test_list_items_carry_list_styles(self):
        soup = rules.parse_document(
            '<ul><li>alpha</li></ul><ol><li data-type="ordered">beta</li></ol>'
        )
        styles = [item["style"] for item in rules.collect_paragraphs(soup)]
        assert styles == ["unordered_list", "ordered_list"]

    def test_preformatted_code_is_detected(self):
        soup = rules.parse_document("<pre>SELECT * FROM users</pre>")
        assert [item["style"] for item in rules.collect_paragraphs(soup)] == ["code_block"]

    def test_bibliography_paragraphs_are_labelled(self):
        soup = rules.parse_document("<p>Doe, A. (2019). Document structure. ACM.</p>")
        assert rules.collect_paragraphs(soup)[0]["style"] == "reference_entry"

    def test_ordinary_paragraph_is_body_text(self):
        soup = rules.parse_document("<p>The study evaluates formatting prediction.</p>")
        assert rules.collect_paragraphs(soup)[0]["style"] == "paragraph"

    def test_empty_blocks_are_skipped(self):
        soup = rules.parse_document("<p>   </p><p>real text</p>")
        assert len(rules.collect_paragraphs(soup)) == 1


class TestTrainingCheckpoint:
    """Checkpoint markers must survive interruption and drive resume."""

    @pytest.fixture
    def checkpoint(self, tmp_path):
        return TrainingCheckpoint("unit-test", root=tmp_path)

    def test_absent_marker_reports_no_state(self, checkpoint):
        assert checkpoint.exists() is False
        assert checkpoint.load() is None
        assert "no checkpoint" in checkpoint.status_line()

    def test_save_then_load_round_trips(self, checkpoint):
        checkpoint.save("features", step=500, total_steps=1000, metrics={"rows": 500})
        data = checkpoint.load()
        assert data["stage"] == "features"
        assert data["step"] == 500
        assert data["progress_percent"] == 50.0
        assert data["metrics"] == {"rows": 500}
        assert data["version"] == CHECKPOINT_VERSION

    def test_created_at_is_preserved_across_updates(self, checkpoint):
        checkpoint.save("features", step=1)
        created = checkpoint.load()["created_at"]
        checkpoint.save("style_model", step=2)
        assert checkpoint.load()["created_at"] == created

    def test_done_marks_the_run_complete(self, checkpoint):
        checkpoint.save("flow_model")
        assert checkpoint.is_complete() is False
        checkpoint.done(metrics={"accuracy": 0.9})
        assert checkpoint.is_complete() is True
        assert checkpoint.load()["status"] == STATUS_COMPLETE

    def test_failed_keeps_prior_progress(self, checkpoint):
        checkpoint.save("features", step=800, total_steps=1000)
        checkpoint.failed("features", "disk full")
        data = checkpoint.load()
        assert data["status"] == STATUS_FAILED
        assert data["step"] == 800
        assert "disk full" in data["note"]

    def test_partial_write_does_not_corrupt_the_marker(self, checkpoint):
        checkpoint.save("features", step=10, total_steps=100)
        temp_files = list(checkpoint.root.glob("*.tmp"))
        assert temp_files == [] or all(f.stat().st_size >= 0 for f in temp_files)
        assert checkpoint.load()["step"] == 10

    def test_version_mismatch_is_ignored(self, checkpoint):
        checkpoint.save("features", step=10)
        payload = json.loads(checkpoint.marker_path.read_text(encoding="utf-8"))
        payload["version"] = CHECKPOINT_VERSION + 99
        checkpoint.marker_path.write_text(json.dumps(payload), encoding="utf-8")
        assert checkpoint.load() is None

    def test_corrupt_marker_is_ignored_rather_than_raising(self, checkpoint):
        checkpoint.save("features", step=10)
        checkpoint.marker_path.write_text("{ not json", encoding="utf-8")
        assert checkpoint.load() is None

    def test_clear_removes_marker_and_work_dir(self, checkpoint):
        checkpoint.save("features", step=1)
        checkpoint.work_dir.mkdir(parents=True, exist_ok=True)
        (checkpoint.work_dir / "partial.bin").write_bytes(b"data")
        checkpoint.clear()
        assert checkpoint.exists() is False
        assert not checkpoint.work_dir.exists()

    def test_list_checkpoints_reads_every_marker(self, tmp_path):
        TrainingCheckpoint("alpha", root=tmp_path).save("one")
        TrainingCheckpoint("beta", root=tmp_path).done()
        names = {marker["name"] for marker in list_checkpoints(tmp_path)}
        assert names == {"alpha", "beta"}

    def test_list_checkpoints_on_empty_root(self, tmp_path):
        assert list_checkpoints(tmp_path / "missing") == []


class TestCheckpointedFeatureExtraction:
    """Feature extraction resumes from the flushed partial matrix."""

    def test_interrupted_extraction_resumes(self, tmp_path, monkeypatch):
        import training.compliance_trainer as trainer

        checkpoint = TrainingCheckpoint("feat", root=tmp_path)
        checkpoint.work_dir.mkdir(parents=True, exist_ok=True)

        texts = [f"Sample sentence number {index} for features." for index in range(60)]
        frame = trainer.pd.DataFrame({"text": texts, "label": ["paragraph"] * 60})

        # Simulate a previous run that flushed the first 20 rows.
        partial = frame.head(20)
        import pandas as pd

        features = partial["text"].map(style_features).apply(pd.Series)
        features.to_parquet(checkpoint.work_dir / "features_partial.parquet", index=False)

        calls = {"count": 0}
        original = trainer.style_features

        def counting(text):
            calls["count"] += 1
            return original(text)

        monkeypatch.setattr(trainer, "style_features", counting)
        built = trainer.build_features_resumable(frame, checkpoint, flush_rows=10)

        assert len(built) == 60
        assert calls["count"] == 40, "should only compute the 40 missing rows"
        assert list(built.columns) == list(FEATURE_NAMES)

    def test_completed_partial_matrix_skips_work(self, tmp_path, monkeypatch):
        import training.compliance_trainer as trainer

        checkpoint = TrainingCheckpoint("feat2", root=tmp_path)
        checkpoint.work_dir.mkdir(parents=True, exist_ok=True)
        texts = [f"Row {index} of the sample corpus." for index in range(30)]
        frame = trainer.pd.DataFrame({"text": texts, "label": ["paragraph"] * 30})

        import pandas as pd

        features = frame["text"].map(style_features).apply(pd.Series)
        features.to_parquet(checkpoint.work_dir / "features_partial.parquet", index=False)

        monkeypatch.setattr(
            trainer, "style_features",
            lambda text: pytest.fail("should not recompute a complete cache"),
        )
        built = trainer.build_features_resumable(frame, checkpoint, flush_rows=10)
        assert len(built) == 30

    def test_unreadable_cache_restarts_cleanly(self, tmp_path):
        import training.compliance_trainer as trainer

        checkpoint = TrainingCheckpoint("feat3", root=tmp_path)
        checkpoint.work_dir.mkdir(parents=True, exist_ok=True)
        (checkpoint.work_dir / "features_partial.parquet").write_bytes(b"not a parquet file")

        frame = trainer.pd.DataFrame(
            {"text": ["Only one row here."], "label": ["paragraph"]}
        )
        built = trainer.build_features_resumable(frame, checkpoint, flush_rows=1)
        assert len(built) == 1
        assert built.iloc[0]["word_count"] == 4.0


class TestSequenceHarvest:
    """Style sequences are harvested from the ordered corpus."""

    def test_short_sequences_are_discarded(self):
        import training.compliance_trainer as trainer

        frame = trainer.pd.DataFrame({"label": ["paragraph", "heading1"]})
        assert trainer.harvest_style_sequences(frame, 10) == []

    def test_sequences_are_harvested_and_capped(self):
        import training.compliance_trainer as trainer

        labels = ["paragraph"] * 5 + ["heading1"] * 5 + ["heading2"] * 5 + ["paragraph"] * 5
        frame = trainer.pd.DataFrame({"label": labels})
        sequences = trainer.harvest_style_sequences(frame, 10)
        assert sequences
        assert all(len(sequence) >= 3 for sequence in sequences)
        assert len(sequences) <= 10

    def test_vocabulary_reserves_padding_index(self):
        import training.compliance_trainer as trainer

        vocab = trainer.build_vocabulary([], trainer.STYLE_CLASSES)
        assert vocab["__pad__"] == 0
        assert set(STYLE_CLASSES).issubset(vocab.keys())
        assert len(set(vocab.values())) == len(vocab)

    def test_encoding_produces_padded_pairs(self):
        import training.compliance_trainer as trainer

        vocab = trainer.build_vocabulary([], trainer.STYLE_CLASSES)
        inputs, targets = trainer.encode_sequences([["paragraph"] * 4], vocab)
        assert inputs.shape[0] == 3
        assert inputs.shape[1] == trainer.MAX_SEQUENCE_LENGTH
        assert len(targets) == 3
