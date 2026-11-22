"""TCASE-037 | Module 4: ML Prediction Cascade | Unit: Prediction Cascade | Non-Error (Tier 3 DistilBERT ONNX)

An unnumbered subheading ("Statement of the Problem") the RandomForest is unsure about
(confidence below 0.70). Runs the ML service's own prediction code in this process, with the
DistilBERT call wrapped so the test can see whether Tier 3 ran.

Expected (as the app behaves): Tier 3 runs only when the RandomForest is below 0.70; the CPU
INT8 ONNX DistilBERT model classifies the block, and its answer replaces the RandomForest's only
when it is more confident. Here DistilBERT resolves the subheading as "title" (a heading) with
high confidence. A block the RandomForest is sure about never reaches Tier 3.
"""

import asyncio

import pytest

from selenium_helpers import ml_in_process, show_evidence

AMBIGUOUS = "Statement of the Problem"
CONFIDENT = "This chapter presents the research design, respondents, instruments and data analysis."


def test_prediction_cascade_tcase_037(driver, monkeypatch):
    main = ml_in_process("main")
    calls: list[tuple[str, tuple[str, float] | None]] = []
    real_onnx = main.predict_with_onnx

    def recording_onnx(text: str):
        answer = real_onnx(text)
        calls.append((text, answer))
        return answer

    monkeypatch.setattr(main, "predict_with_onnx", recording_onnx)

    def predict(text: str):
        return asyncio.run(main.predict_format_core(main.PredictRequest(text=text, genre="general")))

    confident = predict(CONFIDENT)
    assert not calls, f"Tier 3 ran for a confident block: {calls}"

    ambiguous = predict(AMBIGUOUS)
    assert len(calls) == 1 and calls[0][1] is not None, "Tier 3 (DistilBERT ONNX) did not run for the ambiguous block"
    onnx_format, onnx_confidence = calls[0][1]

    show_evidence(driver, "TCASE-037 Tier 3 DistilBERT ONNX", [
        ("Confident block", f"{CONFIDENT!r} → {confident.predicted_format} ({confident.confidence:.3f}); Tier 3 not called"),
        ("Ambiguous block", AMBIGUOUS),
        ("Tier 3 threshold", main.TIER3_CONFIDENCE_THRESHOLD),
        ("Tier 3 ran", "yes"),
        ("DistilBERT ONNX answer", f"{onnx_format} ({onnx_confidence:.3f})"),
        ("Final answer", f"{ambiguous.predicted_format} ({ambiguous.confidence:.3f})"),
        ("Decided by", "DistilBERT (more confident)" if ambiguous.predicted_format == onnx_format and abs(ambiguous.confidence - onnx_confidence) < 1e-4 else "RandomForest (DistilBERT less confident)"),
    ])

    # The cascade keeps whichever of the two is more confident.
    if onnx_confidence > ambiguous.confidence + 1e-4:
        pytest.fail(f"DistilBERT was more confident ({onnx_confidence:.3f}) but the RandomForest answer was kept")
    assert (ambiguous.predicted_format, round(ambiguous.confidence, 4)) == (onnx_format, round(onnx_confidence, 4)), "DistilBERT did not decide the block"
    assert ambiguous.predicted_format == "title" and ambiguous.confidence >= 0.9, f"resolved as {ambiguous.predicted_format} ({ambiguous.confidence:.3f})"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
