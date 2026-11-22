"""TCASE-036 | Module 4: ML Prediction Cascade | Unit: Prediction Cascade | Non-Error (Tier 2 RandomForest)

A block no regex rule matches goes to /predict, so the Tier 2 RandomForest scores it from 18
extracted syntactic features. Expected (as the app behaves): for a full body sentence the
RandomForest is confident (at or above the 0.70 Tier 3 threshold) and answers on its own,
"paragraph", without consulting DistilBERT (checked in-process by wrapping the Tier 3 call).

Note: for short unnumbered subheadings such as "Statement of the Problem" the RandomForest's
confidence stays below 0.70, so those are decided by Tier 3 (TCASE-037), not by Tier 2.
"""

import asyncio

import pytest

from selenium_helpers import ml_in_process, ml_predict, show_evidence

TEXT = "This chapter presents the research design, respondents, instruments and data analysis."
TIER3_THRESHOLD = 0.70


def test_prediction_cascade_tcase_036(driver, monkeypatch):
    # In-process: is Tier 3 consulted for this block?
    main = ml_in_process("main")
    tier3_calls: list[str] = []
    real_onnx = main.predict_with_onnx
    monkeypatch.setattr(main, "predict_with_onnx", lambda text: (tier3_calls.append(text), real_onnx(text))[1])
    asyncio.run(main.predict_format_core(main.PredictRequest(text=TEXT, genre="general")))

    # Over HTTP: the running service's answer.
    ml_predict("warm-up sentence for the model")
    result, elapsed = ml_predict(TEXT)
    show_evidence(driver, "TCASE-036 Tier 2 RandomForest", [
        ("Input text", TEXT),
        ("Predicted format", result["predicted_format"]),
        ("Confidence", result["confidence"]),
        ("Feature count", len(result["feature_values"])),
        ("Features", ", ".join(f"{k}={v:g}" for k, v in sorted(result["feature_values"].items()))),
        ("Tier 3 consulted", "yes" if tier3_calls else "no"),
        ("Round trip (HTTP)", f"{elapsed:.1f} ms"),
    ])

    assert len(result["feature_values"]) == 18, f"expected the RandomForest's 18 features, got {len(result['feature_values'])}"
    assert not tier3_calls, "the RandomForest handed this block to Tier 3"
    assert result["predicted_format"] == "paragraph", f"labelled {result['predicted_format']}"
    assert result["confidence"] >= TIER3_THRESHOLD


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
