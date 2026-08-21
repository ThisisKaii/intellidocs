"""
pytest ML test suite for IntelliDocs.
Tests grammar evaluation, spell checker, and Random Forest formatting model.
"""
import os
import sys
import pickle
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
