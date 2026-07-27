import os
import pickle
import sys
from pathlib import Path
from typing import Any, Optional

import pandas as pd
import torch
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from grammar.grammar_checker import evaluate_text
from grammar.spell_checker import check_spelling

load_dotenv()

MODEL_PATH = os.getenv("BASE_MODEL_PATH", "models/base_model.pkl")
LSTM_DIR = os.getenv("LSTM_MODEL_DIR", "models/lstm")

app = FastAPI(
    title="IntelliDocs ML API",
    description="Machine Learning API for hybrid RandomForest + LSTM formatting prediction and grammar checking",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    text: str
    user_id: Optional[str] = None


class PredictResponse(BaseModel):
    predicted_format: str
    confidence: float
    model_path: str
    feature_values: dict[str, float]
    lstm_adjusted: bool = False


class TextCheckRequest(BaseModel):
    text: str


def load_model_payload() -> dict[str, Any]:
    """Load the trained base formatting model from disk."""
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Base model not found: {MODEL_PATH}")

    with open(MODEL_PATH, "rb") as file_handle:
        payload = pickle.load(file_handle)

    if "model" not in payload or "feature_columns" not in payload:
        raise ValueError("Model payload is missing required fields.")

    return payload


def compute_lstm_sequence_adjustment(user_id: str, predicted_format: str) -> float:
    """Calculate sequence-level confidence reweighting from user's PyTorch LSTM weights if available."""
    model_file = os.path.join(LSTM_DIR, f"user_{user_id}.pt")
    if not os.path.exists(model_file):
        return 0.0

    try:
        from training.lstm_trainer import ACTION_TO_IDX, FormattingLSTM

        payload = torch.load(model_file, map_location=torch.device("cpu"))
        model = FormattingLSTM(vocab_size=len(payload["vocab"]))
        model.load_state_dict(payload["state_dict"])
        model.eval()

        # Target index
        target_idx = ACTION_TO_IDX.get(predicted_format, 0)
        if target_idx == 0:
            return 0.0

        # Query recent sequence from DuckDB
        duckdb_path = os.getenv("DUCKDB_PATH", "db/duckdb/behavior.duckdb")
        if not os.path.exists(duckdb_path):
            return 0.0

        import duckdb

        conn = duckdb.connect(duckdb_path)
        df = conn.execute(
            "SELECT action FROM behavior_events WHERE user_id = ? ORDER BY event_ts DESC LIMIT 5",
            [user_id],
        ).fetchdf()
        conn.close()

        if df.empty or len(df) < 5:
            return 0.0

        actions = [
            ACTION_TO_IDX.get(a, 0) for a in reversed(df["action"].tolist())
        ]
        input_tensor = torch.tensor([actions], dtype=torch.long)

        with torch.no_grad():
            logits = model(input_tensor)
            probs = torch.softmax(logits, dim=1)[0]
            lstm_prob = float(probs[target_idx])

        return lstm_prob
    except Exception as e:
        print(f"⚠️ LSTM inference warning for user {user_id}: {e}")
        return 0.0


def build_feature_row(text: str) -> pd.DataFrame:
    """Build the numeric features used during base model training."""
    normalized = text.strip()

    heading_depth = 0
    for c in normalized:
        if c == "=":
            heading_depth += 1
        elif c == " " and heading_depth > 0:
            heading_depth += 1
        else:
            break

    features = {
        "char_count": len(normalized),
        "word_count": len(normalized.split()),
        "line_count": max(normalized.count("\n") + 1, 1),
        "uppercase_ratio": (
            sum(1 for char in normalized if char.isupper()) / max(len(normalized), 1)
        ),
        "digit_ratio": (
            sum(1 for char in normalized if char.isdigit()) / max(len(normalized), 1)
        ),
        "punctuation_ratio": (
            sum(1 for char in normalized if not char.isalnum() and not char.isspace())
            / max(len(normalized), 1)
        ),
        "starts_with_marker": int(
            normalized.startswith(("=", "*", "#", ">", "`", "    "))
        ),
        "heading_depth": heading_depth,
        "starts_with_bullet": int(normalized.startswith("* ")),
        "starts_with_number_sign": int(normalized.startswith("# ")),
    }
    return pd.DataFrame([features])


@app.get("/")
async def root() -> dict[str, str]:
    """Return a simple welcome payload."""
    return {
        "message": "Welcome to IntelliDocs ML API",
        "version": "0.2.0",
    }


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Return a health check payload."""
    return {
        "status": "OK",
        "message": "IntelliDocs ML API is running",
        "timestamp": __import__("datetime").datetime.now().isoformat(),
    }


@app.post("/predict", response_model=PredictResponse)
async def predict_format(request: PredictRequest) -> PredictResponse:
    """Predict a formatting label for given text combining RandomForest + LSTM sequence score."""
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")

    lstm_adjusted = False
    try:
        payload = load_model_payload()
        model = payload["model"]
        feature_columns = payload["feature_columns"]

        feature_frame = build_feature_row(text)
        for column in feature_columns:
            if column not in feature_frame.columns:
                feature_frame[column] = 0

        ordered_features = feature_frame[feature_columns]

        has_marker = (
            text.startswith("    ") or
            text.startswith("```") or
            text.startswith(("* ", "- ", "# ", "> ")) or
            (text.startswith("=") and text.endswith("="))
        )

        if not has_marker:
            prediction = "paragraph"
            confidence = 1.0
        else:
            prediction = model.predict(ordered_features)[0]
            probabilities = model.predict_proba(ordered_features)[0]
            rf_confidence = float(max(probabilities))

            # Combine with LSTM sequential prediction if user_id is provided
            if request.user_id:
                lstm_score = compute_lstm_sequence_adjustment(
                    request.user_id, str(prediction)
                )
                if lstm_score > 0:
                    # Hybrid combination: 70% RandomForest + 30% LSTM sequence reweighting
                    confidence = (0.7 * rf_confidence) + (0.3 * lstm_score)
                    lstm_adjusted = True
                else:
                    confidence = rf_confidence
            else:
                confidence = rf_confidence

    except FileNotFoundError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {error}",
        ) from error

    feature_values = {
        column: float(ordered_features.iloc[0][column]) for column in feature_columns
    }

    return PredictResponse(
        predicted_format=str(prediction),
        confidence=round(confidence, 4),
        model_path=MODEL_PATH,
        feature_values=feature_values,
        lstm_adjusted=lstm_adjusted,
    )


@app.post("/grammar/check")
async def grammar_check(request: TextCheckRequest) -> dict[str, Any]:
    """Run the grammar quality checker on the given text."""
    try:
        return evaluate_text(request.text)
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Grammar check failed: {error}",
        ) from error


@app.post("/spelling/check")
async def spelling_check(request: TextCheckRequest) -> dict[str, Any]:
    """Run the spelling checker on the given text."""
    try:
        return check_spelling(request.text)
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Spelling check failed: {error}",
        ) from error


@app.post("/pipeline/aggregate")
async def trigger_aggregation() -> dict[str, str | int]:
    """Flush Redis behavior events into DuckDB (one-shot)."""
    try:
        from aggregator import run_once

        count = run_once()
        return {"status": "ok", "events_inserted": count}
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Aggregation failed: {error}",
        ) from error


@app.post("/pipeline/extract-features")
async def trigger_feature_extraction() -> dict[str, str | int]:
    """Run feature extraction on DuckDB behavior_events table."""
    try:
        import duckdb

        from feature_extractor import ensure_feature_table, extract_features, overwrite_features

        duckdb_path = os.getenv("DUCKDB_PATH", "db/duckdb/behavior.duckdb")
        conn = duckdb.connect(duckdb_path)
        ensure_feature_table(conn)
        rows = extract_features(conn)
        count = overwrite_features(conn, rows)
        conn.close()
        return {"status": "ok", "rows_written": count}
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Feature extraction failed: {error}",
        ) from error


@app.post("/pipeline/export-features")
async def trigger_feature_export() -> dict[str, str]:
    """Export formatting_features table to CSV and Parquet."""
    try:
        import duckdb

        from export_features import ensure_export_dir, export_features, table_exists

        duckdb_path = os.getenv("DUCKDB_PATH", "db/duckdb/behavior.duckdb")
        export_dir = os.getenv("FEATURE_EXPORT_DIR", "db/duckdb/exports")

        ensure_export_dir(export_dir)
        conn = duckdb.connect(duckdb_path)

        if not table_exists(conn, "formatting_features"):
            conn.close()
            raise HTTPException(
                status_code=400,
                detail="formatting_features table does not exist.",
            )

        export_features(conn, export_dir)
        conn.close()
        return {"status": "ok", "export_dir": export_dir}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Feature export failed: {error}",
        ) from error


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )
