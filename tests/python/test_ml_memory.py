"""The ML service stays within a small host's memory: a light tokenizer for Tier 3, models released
before a conversion, and one conversion at a time that never stays locked after a failure."""
import io
import os
import sys

import pytest
from fastapi.testclient import TestClient

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "ml")
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, ROOT)

import main  # noqa: E402

TOKENIZER = os.path.join(ROOT, "models", "distilbert_tokenizer")


@pytest.mark.skipif(not os.path.isfile(os.path.join(TOKENIZER, "tokenizer.json")), reason="tokenizer files not present")
def test_light_tokenizer_encodes_like_transformers():
    transformers = pytest.importorskip("transformers")
    import numpy as np

    light = main.LightTokenizer(os.path.join(TOKENIZER, "tokenizer.json"))
    full = transformers.AutoTokenizer.from_pretrained(TOKENIZER)
    for text in ("Statement of the Problem", "Résumé — café “quotes”", "x" * 900, ""):
        a = light(text, return_tensors="np", truncation=True, max_length=128)
        b = full(text, return_tensors="np", truncation=True, max_length=128)
        for key in ("input_ids", "attention_mask"):
            assert np.array_equal(a[key], b[key]), (text[:20], key)


def test_release_prediction_models_empties_every_cache():
    main._MODEL_CACHE["m"] = ({}, 0.0)
    main._ONNX_RUNTIME["o"] = (object(), {})
    main._TOKENIZER_CACHE["tokenizer"] = object()
    main.release_prediction_models()
    assert not main._MODEL_CACHE and not main._ONNX_RUNTIME and not main._TOKENIZER_CACHE


def test_models_reload_after_a_release():
    main.release_prediction_models()
    assert main.load_model_payload()["model"] is not None


def test_a_failed_conversion_does_not_keep_the_lock(monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("converter crashed")

    monkeypatch.setattr(main, "convert_docx_bytes_to_html", broken)
    client = TestClient(main.app)
    for _ in range(2):  # the second request would hang if the first left the lock held
        answer = client.post("/convert/document", files={"file": ("a.docx", io.BytesIO(b"PK..."), "application/octet-stream")})
        assert answer.status_code == 500
    assert main._CONVERT_LOCK.acquire(blocking=False)
    main._CONVERT_LOCK.release()
