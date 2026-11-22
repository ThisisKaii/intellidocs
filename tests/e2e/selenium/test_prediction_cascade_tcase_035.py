"""TCASE-035 | Module 4: ML Prediction Cascade | Unit: Prediction Cascade | Non-Error (Tier 1 Heuristic Regex)

The text "1.0 Introduction" goes to the ML service's /predict. Expected (as the app behaves): the
Tier 1 regex fast path labels it Heading 1 ("1.0" numbers a top-level section, as "1." does)
without running a model (it reports only its 3 rule features, not the RandomForest's 18), with
confidence of at least 0.95, in a few tens of milliseconds over HTTP (the rule itself takes well
under 5 ms; the HTTP round trip is what can be measured here).
"""

import pytest

from selenium_helpers import ml_predict, show_evidence

TEXT = "1.0 Introduction"
LIMIT_MS = 100


def test_prediction_cascade_tcase_035(driver):
    ml_predict("warm-up")  # the first request after a restart loads models; time a warm service
    result, elapsed = ml_predict(TEXT)
    rule_features = sorted(result["feature_values"])
    show_evidence(driver, "TCASE-035 Tier 1 heuristic fast path", [
        ("Input text", TEXT),
        ("Predicted format", result["predicted_format"]),
        ("Confidence", result["confidence"]),
        ("Features reported", ", ".join(rule_features)),
        ("Round trip (HTTP)", f"{elapsed:.1f} ms"),
    ])

    assert len(rule_features) == 3 and "hierarchy_context" in rule_features, f"not the rule fast path: {rule_features}"
    assert result["confidence"] >= 0.95
    assert elapsed < LIMIT_MS, f"fast path took {elapsed:.0f} ms"
    assert result["predicted_format"] == "heading1", f"labelled {result['predicted_format']}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
