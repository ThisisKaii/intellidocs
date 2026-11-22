"""TCASE-038 | Module 4: ML Prediction Cascade | Unit: Prediction Cascade | Non-Error (Per-User LSTM)

A user who consistently formats terms bold, then italic. Their formatting history (alternating
bold → italic events) is placed in their behavior partition in DuckDB, the real LSTM trainer
(ml/training/lstm_trainer.py) trains their personal model, and /predict is asked in "isolated"
mode, where the user's model alone decides.

Expected (as the app behaves): after the history bold, italic, bold, italic, bold the personal
PyTorch LSTM predicts the next step, italic, and the response reports that the user's own model
was used (genre_partition_hit). The test user is synthetic; its DuckDB rows, local model file
and stored model are deleted afterwards.
"""

import os
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from selenium_helpers import ML_DIR, REPO, ml_in_process, ml_predict, show_evidence

GENRE = "general"
HISTORY = ["bold", "italic"] * 30 + ["bold"]  # ends on bold → the habit says italic comes next


def test_prediction_cascade_tcase_038(driver):
    user_id = str(uuid.uuid4())
    duckdb_store = ml_in_process("duckdb_store")
    aggregator = ml_in_process("aggregator")
    storage = ml_in_process("storage")
    model_file = ML_DIR / "models" / "lstm" / f"user_{user_id}__{GENRE}.pt"

    start = datetime.now(timezone.utc) - timedelta(hours=1)
    rows = [
        (user_id, "tcase-038", action, (start + timedelta(seconds=i)).replace(tzinfo=None), (start + timedelta(seconds=i)).isoformat(), "tcase-038", None, None, GENRE)
        for i, action in enumerate(HISTORY)
    ]
    store = duckdb_store.connect_duckdb()
    try:
        aggregator.ensure_schema(store.conn)
        store.conn.executemany(
            "INSERT INTO behavior_events (user_id, document_id, action, event_ts, event_ts_raw, source_key, payload, block_id, genre) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
    finally:
        store.conn.close()

    try:
        training = subprocess.run(
            [sys.executable, str(ML_DIR / "training" / "lstm_trainer.py"), "--user-id", user_id, "--genre", GENRE, "--epochs", "60"],
            cwd=str(REPO), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        assert model_file.exists(), f"the trainer did not save a model:\n{training.stdout[-800:]}\n{training.stderr[-800:]}"

        personal, _ = ml_predict("emphasised key term", genre=GENRE, user_id=user_id, isolation_mode="isolated")
        show_evidence(driver, "TCASE-038 Per-user LSTM", [
            ("User", f"synthetic test user {user_id}"),
            ("Formatting history", f"{len(HISTORY)} events, alternating bold → italic; last five: {', '.join(HISTORY[-5:])}"),
            ("Trainer output", training.stdout.strip().splitlines()[-1] if training.stdout.strip() else "(none)"),
            ("Predicted next format", personal["predicted_format"]),
            ("Confidence", personal["confidence"]),
            ("User's own model used", personal.get("genre_partition_hit")),
        ])
        assert personal.get("genre_partition_hit") is True, "the user's LSTM was not used"
        assert personal["predicted_format"] == "italic", f"predicted {personal['predicted_format']}"
    finally:
        store = duckdb_store.connect_duckdb()
        try:
            store.conn.execute("DELETE FROM behavior_events WHERE user_id = ?", [user_id])
        finally:
            store.conn.close()
        model_file.unlink(missing_ok=True)
        try:
            storage._client().storage.from_(storage.BUCKET).remove([storage.user_model_object(user_id, GENRE)])
        except Exception as error:  # the stored copy is best-effort cleanup
            print(f"stored model not removed: {error}")
        storage._cache_path(storage.user_model_object(user_id, GENRE)).unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
