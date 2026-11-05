"""The ML /predict path must consult only the request's genre partition.

A user with an IEEE model and no thesis model must get no personal contribution
on a thesis request: the IEEE model is never loaded as a substitute.
"""
import asyncio
import os
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../ml/src'))

import main  # noqa: E402
import storage  # noqa: E402


@pytest.fixture()
def ieee_only_models(tmp_path, monkeypatch):
    """A local LSTM dir holding only the user's IEEE model; cloud storage has nothing."""
    (tmp_path / "user_u1__ieee.pt").write_bytes(b"not-a-real-model")
    monkeypatch.setattr(main, "LSTM_DIR", str(tmp_path))
    requested = []

    def fake_download(user_id, genre):
        requested.append((user_id, genre))
        return None

    monkeypatch.setattr(storage, "download_user_model", fake_download)
    return requested


def test_predict_request_requires_genre():
    with pytest.raises(ValidationError):
        main.PredictRequest(text="Introduction")


def test_predict_request_rejects_unknown_genre():
    with pytest.raises(ValidationError):
        main.PredictRequest(text="Introduction", genre="legacy")


def test_isolated_prediction_never_borrows_another_genre(ieee_only_models):
    assert main.predict_with_user_lstm("u1", "thesis") is None
    assert ieee_only_models == [("u1", "thesis")]


def test_hybrid_adjustment_never_borrows_another_genre(ieee_only_models):
    assert main.compute_lstm_sequence_adjustment("u1", "thesis", "heading1") == 0.0
    assert ieee_only_models == [("u1", "thesis")]


def test_lstm_path_is_genre_scoped(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "LSTM_DIR", str(tmp_path))
    assert main.user_lstm_path("u1", "memo").endswith("user_u1__memo.pt")


def test_storage_object_is_genre_scoped():
    assert storage.user_model_object("u1", "thesis") == "u1/thesis.pt"


def test_heuristic_response_reports_genre_and_no_partition_hit():
    request = main.PredictRequest(text="Chapter 1 Introduction", user_id="u1", genre="thesis")
    response = asyncio.run(main.predict_format(request))
    assert response.genre == "thesis"
    assert response.genre_partition_hit is False
