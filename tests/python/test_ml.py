"""
pytest ML test suite for IntelliDocs.
Tests grammar evaluation, spell checker, and Random Forest formatting model.
"""
import os
import sys
import pickle
import time
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../ml'))


class TestGrammarChecker:
    """Tests for ml/grammar/grammar_checker.py"""

    def test_evaluate_text_returns_dict(self):
        from grammar.grammar_checker import evaluate_text
        result = evaluate_text("This is a grammatically correct sentence.")
        assert isinstance(result, dict)

    def test_evaluate_text_has_expected_keys(self):
        from grammar.grammar_checker import evaluate_text
        result = evaluate_text("She do not like this format.")
        assert "score" in result
        assert "issues" in result
        assert isinstance(result["issues"], list)


class TestSpellChecker:
    """Tests for ml/grammar/spell_checker.py"""

    def test_check_spelling_returns_dict(self):
        from grammar.spell_checker import check_spelling
        result = check_spelling("Everything is spelled properly here.")
        assert isinstance(result, dict)
        assert "issues" in result
        assert isinstance(result["issues"], list)

    def test_check_spelling_detects_misspelling(self):
        from grammar.spell_checker import check_spelling
        result = check_spelling("Ths sentance has errrs.")
        assert len(result["issues"]) > 0
        assert any(item.get("word") == "sentance" for item in result["issues"])

    def test_check_spelling_whitelists_academic_terms(self):
        """Academic vocabulary should NOT be flagged as misspelled."""
        from grammar.spell_checker import check_spelling
        # These are academic terms that should be whitelisted
        academic_text = "The methodology uses ANOVA with Likert scale items. See et al. for details."
        result = check_spelling(academic_text)
        # None of these academic terms should be flagged
        flagged_words = {issue.get("word", "").lower() for issue in result["issues"]}
        assert "anova" not in flagged_words
        assert "likert" not in flagged_words
        assert "methodology" not in flagged_words
        assert "etal" not in flagged_words


class TestBaseFormattingModel:
    """Tests for the pre-trained APA academic Random Forest model."""

    def test_model_artifact_exists(self):
        model_path = os.path.join(
            os.path.dirname(__file__), "../../ml/models/base_model.pkl"
        )
        assert os.path.exists(model_path), "ml/models/base_model.pkl must exist"

    def test_model_artifact_loads_payload(self):
        model_path = os.path.join(
            os.path.dirname(__file__), "../../ml/models/base_model.pkl"
        )
        with open(model_path, "rb") as handle:
            payload = pickle.load(handle)
        assert "model" in payload
        assert "feature_columns" in payload
        assert len(payload["feature_columns"]) > 0

    def test_model_predicts_valid_label(self):
        model_path = os.path.join(
            os.path.dirname(__file__), "../../ml/models/base_model.pkl"
        )
        with open(model_path, "rb") as handle:
            payload = pickle.load(handle)

        model = payload["model"]
        feature_columns = payload["feature_columns"]

        sample = {col: 0.0 for col in feature_columns}
        sample["word_count"] = 5.0
        sample["char_count"] = 30.0
        sample["is_bold"] = 1.0
        sample["font_size"] = 14.0

        df = pd.DataFrame([sample])
        prediction = model.predict(df)
        assert len(prediction) == 1
        assert isinstance(prediction[0], str)


class TestModelPerformance:
    """Latency and performance stress tests for ML models."""

    def test_grammar_checker_latency(self):
        """Grammar checker should process text within acceptable latency."""
        from grammar.grammar_checker import evaluate_text
        
        test_text = "This is a grammatically correct sentence that should be processed quickly. " * 10
        
        # Warm-up
        evaluate_text("Warm up sentence.")
        
        # Measure latency over multiple runs
        latencies = []
        for _ in range(20):
            start = time.perf_counter()
            evaluate_text(test_text)
            latencies.append(time.perf_counter() - start)
        
        avg_latency = sum(latencies) / len(latencies)
        p95_latency = sorted(latencies)[int(len(latencies) * 0.95)]
        
        # Assert latency requirements (from Phase 4.2: <35ms per request)
        assert avg_latency < 0.035, f"Average latency {avg_latency*1000:.1f}ms exceeds 35ms threshold"
        assert p95_latency < 0.050, f"P95 latency {p95_latency*1000:.1f}ms exceeds 50ms threshold"
        
        print(f"Grammar checker - Avg: {avg_latency*1000:.1f}ms, P95: {p95_latency*1000:.1f}ms")

    def test_spell_checker_latency(self):
        """Spell checker should process text within acceptable latency."""
        from grammar.spell_checker import check_spelling
        
        test_text = "This is a sample text with several words to check for spelling issues. " * 5
        
        # Warm-up
        check_spelling("Warm up.")
        
        # Measure latency
        latencies = []
        for _ in range(20):
            start = time.perf_counter()
            check_spelling(test_text)
            latencies.append(time.perf_counter() - start)
        
        avg_latency = sum(latencies) / len(latencies)
        p95_latency = sorted(latencies)[int(len(latencies) * 0.95)]
        
        # Spell checker should be very fast
        assert avg_latency < 0.020, f"Average latency {avg_latency*1000:.1f}ms exceeds 20ms threshold"
        assert p95_latency < 0.035, f"P95 latency {p95_latency*1000:.1f}ms exceeds 35ms threshold"
        
        print(f"Spell checker - Avg: {avg_latency*1000:.1f}ms, P95: {p95_latency*1000:.1f}ms")

    def test_formatting_model_latency(self):
        """Formatting model prediction should be fast."""
        model_path = os.path.join(
            os.path.dirname(__file__), "../../ml/models/base_model.pkl"
        )
        with open(model_path, "rb") as handle:
            payload = pickle.load(handle)
        
        model = payload["model"]
        feature_columns = payload["feature_columns"]
        
        sample = {col: 0.0 for col in feature_columns}
        sample["word_count"] = 5.0
        sample["char_count"] = 30.0
        sample["is_bold"] = 1.0
        sample["font_size"] = 14.0
        df = pd.DataFrame([sample])
        
        # Warm-up
        model.predict(df)
        
        # Measure latency
        latencies = []
        for _ in range(50):
            start = time.perf_counter()
            model.predict(df)
            latencies.append(time.perf_counter() - start)
        
        avg_latency = sum(latencies) / len(latencies)
        p95_latency = sorted(latencies)[int(len(latencies) * 0.95)]
        
        # Model prediction should be fast (<15ms for this environment)
        assert avg_latency < 0.015, f"Average latency {avg_latency*1000:.1f}ms exceeds 15ms threshold"
        assert p95_latency < 0.025, f"P95 latency {p95_latency*1000:.1f}ms exceeds 25ms threshold"
        
        print(f"Formatting model - Avg: {avg_latency*1000:.1f}ms, P95: {p95_latency*1000:.1f}ms")

    def test_batch_prediction_throughput(self):
        """Test batch prediction throughput for formatting model."""
        model_path = os.path.join(
            os.path.dirname(__file__), "../../ml/models/base_model.pkl"
        )
        with open(model_path, "rb") as handle:
            payload = pickle.load(handle)
        
        model = payload["model"]
        feature_columns = payload["feature_columns"]
        
        # Create batch of 100 samples
        batch_size = 100
        batch = pd.DataFrame([
            {col: 0.0 for col in feature_columns} | {
                "word_count": 5.0, "char_count": 30.0, "is_bold": 1.0, "font_size": 14.0
            }
            for _ in range(batch_size)
        ])
        
        start = time.perf_counter()
        predictions = model.predict(batch)
        elapsed = time.perf_counter() - start
        
        throughput = batch_size / elapsed
        assert len(predictions) == batch_size
        assert throughput > 1000, f"Throughput {throughput:.0f} preds/sec below 1000/sec threshold"
        
        print(f"Batch throughput: {throughput:.0f} predictions/sec")


class TestModelCalibration:
    """Tests for model confidence calibration and accuracy."""

    def test_grammar_score_range(self):
        """Grammar scores should be in valid range [0, 1]."""
        from grammar.grammar_checker import evaluate_text
        
        test_cases = [
            "This is a perfect sentence.",
            "She do not like this.",
            "Ths sentnce has many erors.",
            "",
            "A",
            "This is a very long sentence with many words that should still produce a valid score between zero and one.",
        ]
        
        for text in test_cases:
            result = evaluate_text(text)
            score = result["score"]
            assert 0.0 <= score <= 1.0, f"Score {score} out of range for text: {text[:50]}"

    def test_grammar_calibration_known_samples(self):
        """Grammar scores should correlate with known quality levels."""
        from grammar.grammar_checker import evaluate_text
        
        # Perfect grammar should score high
        good_result = evaluate_text("The methodology chapter describes the experimental design in detail.")
        # Poor grammar should score lower
        poor_result = evaluate_text("She do not like the methodology chapter.")
        
        # If grammar model is not trained, both will return 0.0 - skip assertion in that case
        if good_result["score"] == 0.0 and poor_result["score"] == 0.0:
            pytest.skip("Grammar model not trained - skipping calibration test")
        
        assert good_result["score"] > poor_result["score"], \
            f"Good text score {good_result['score']} not higher than poor text {poor_result['score']}"
        assert good_result["score"] > 0.5, f"Good text score {good_result['score']} too low"
        assert poor_result["score"] < 0.7, f"Poor text score {poor_result['score']} too high"

    def test_spell_checker_no_false_positives_on_whitelist(self):
        """Spell checker should not flag whitelisted academic terms."""
        from grammar.spell_checker import check_spelling
        
        whitelist_samples = [
            "The ANOVA results show significant effects.",
            "We used a Likert scale for the survey.",
            "See et al. for more details.",
            "The methodology employs bootstrap resampling.",
            "Cohen's d effect size was calculated.",
            "The LaTeX document uses BibTeX references.",
        ]
        
        for text in whitelist_samples:
            result = check_spelling(text)
            # Should have zero or very few issues (only genuine typos if any)
            academic_words = {"anova", "likert", "etal", "bootstrap", "cohen", "latex", "bibtex"}
            flagged = {issue.get("word", "").lower() for issue in result["issues"]}
            assert not (flagged & academic_words), f"Whitelisted word flagged in: {text}"

    def test_formatting_model_consistency(self):
        """Model should give consistent predictions for identical inputs."""
        model_path = os.path.join(
            os.path.dirname(__file__), "../../ml/models/base_model.pkl"
        )
        with open(model_path, "rb") as handle:
            payload = pickle.load(handle)
        
        model = payload["model"]
        feature_columns = payload["feature_columns"]
        
        sample = {col: 0.0 for col in feature_columns}
        sample["word_count"] = 5.0
        sample["char_count"] = 30.0
        sample["is_bold"] = 1.0
        sample["font_size"] = 14.0
        df = pd.DataFrame([sample])
        
        # Run multiple predictions
        predictions = [model.predict(df)[0] for _ in range(10)]
        
        # All predictions should be identical
        assert all(p == predictions[0] for p in predictions), \
            "Model predictions not consistent for identical input"

    def test_grammar_confidence_calibration(self):
        """Grammar confidence scores should be well-calibrated."""
        from grammar.grammar_checker import evaluate_text, calibrate_score
        
        # Test calibration function directly
        # Raw scores near 0 should map to low calibrated scores
        assert calibrate_score(0.0, 0) == 0.0
        assert calibrate_score(0.1, 0) < 0.2
        # Raw scores near ceiling should map to high calibrated scores
        assert calibrate_score(0.6, 0) >= 0.9
        # Issues should penalize score
        assert calibrate_score(0.6, 1) < calibrate_score(0.6, 0)
        assert calibrate_score(0.6, 3) < calibrate_score(0.6, 1)
        # Score should never exceed 1.0 or go below 0
        for raw in [0.0, 0.3, 0.6, 1.0]:
            for issues in [0, 1, 5, 10]:
                score = calibrate_score(raw, issues)
                assert 0.0 <= score <= 1.0, f"Calibrated score {score} out of range"
