import os
import pickle
import sys
from pathlib import Path
from typing import Any, Optional

# Ensure the src/ directory is on sys.path so sibling modules (converter, grammar) resolve
_SRC_DIR = str(Path(__file__).resolve().parent)
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

import pandas as pd
import torch
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from converter import convert_docx_bytes_to_html, convert_pdf_bytes_to_html

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from grammar.grammar_checker import evaluate_text
from grammar.spell_checker import check_spelling

load_dotenv()

DEFAULT_MODEL_PATH = str(ROOT_DIR / "models" / "base_model.pkl")
MODEL_PATH = os.getenv("BASE_MODEL_PATH", DEFAULT_MODEL_PATH)
if not os.path.isabs(MODEL_PATH) and not os.path.exists(MODEL_PATH):
    MODEL_PATH = DEFAULT_MODEL_PATH

DEFAULT_LSTM_DIR = str(ROOT_DIR / "models" / "lstm")
LSTM_DIR = os.getenv("LSTM_MODEL_DIR", DEFAULT_LSTM_DIR)

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
    font_size: Optional[float] = None
    font_size_delta: Optional[float] = None
    is_bold: Optional[bool] = None
    is_italic: Optional[bool] = None
    x_position: Optional[float] = None


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


def build_feature_row(request: PredictRequest) -> pd.DataFrame:
    """Build numeric feature vectors including typographic & academic layout attributes."""
    normalized = request.text.strip()
    words = normalized.split()
    word_count = len(words)
    char_count = len(normalized)

    font_size = request.font_size if request.font_size is not None else 12.0
    font_size_delta = request.font_size_delta if request.font_size_delta is not None else (font_size - 12.0)
    is_bold = int(request.is_bold) if request.is_bold is not None else int(
        word_count <= 14 and (normalized.isupper() or normalized.lower().startswith("chapter"))
    )
    is_italic = int(request.is_italic) if request.is_italic is not None else 0
    x_pos = request.x_position if request.x_position is not None else 0.0

    features = {
        "char_count": char_count,
        "word_count": word_count,
        "line_count": max(normalized.count("\n") + 1, 1),
        "font_size": font_size,
        "font_size_delta": font_size_delta,
        "is_bold": is_bold,
        "is_italic": is_italic,
        "x_position": x_pos,
        "y_position": 0.0,
        "page_number": 1,
        "page_type_code": 5,
        "uppercase_ratio": (
            sum(1 for char in normalized if char.isupper()) / max(char_count, 1)
        ),
        "digit_ratio": (
            sum(1 for char in normalized if char.isdigit()) / max(char_count, 1)
        ),
        "punctuation_ratio": (
            sum(1 for char in normalized if not char.isalnum() and not char.isspace())
            / max(char_count, 1)
        ),
        "starts_with_marker": int(
            normalized.startswith(("=", "*", "#", ">", "`", "    ", "-", "•", "+"))
        ),
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
    """Predict an APA academic formatting label using RandomForest + LSTM confidence adjustment."""
    import re

    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")

    words = text.split()
    word_count = len(words)
    lower = text.lower()

    # Hybrid academic structural heuristics
    if word_count <= 14 and "\n" not in text:
        if (
            lower.startswith("chapter")
            or bool(re.match(r"^(chapter\s+\d+|[ivx]+\.|\d+\.)\s+", lower))
            or lower in [
                "abstract", "introduction", "methodology", "literature review",
                "results", "discussion", "conclusion", "references",
                "table of contents", "acknowledgments", "appendix"
            ]
        ):
            return PredictResponse(
                predicted_format="heading1",
                confidence=0.96,
                model_path=MODEL_PATH,
                feature_values={"word_count": word_count, "academic_heading1_prior": 1.0},
                lstm_adjusted=False,
            )
        if bool(re.match(r"^\d+\.\d+\s+", text)):
            return PredictResponse(
                predicted_format="heading2",
                confidence=0.95,
                model_path=MODEL_PATH,
                feature_values={"word_count": word_count, "academic_heading2_prior": 1.0},
                lstm_adjusted=False,
            )
        if bool(re.match(r"^\d+\.\d+\.\d+\s+", text)):
            return PredictResponse(
                predicted_format="heading3",
                confidence=0.94,
                model_path=MODEL_PATH,
                feature_values={"word_count": word_count, "academic_heading3_prior": 1.0},
                lstm_adjusted=False,
            )

    if text.startswith(("- ", "• ", "* ", "— ", "– ")) and word_count <= 25:
        return PredictResponse(
            predicted_format="unordered_list",
            confidence=0.93,
            model_path=MODEL_PATH,
            feature_values={"word_count": word_count, "bullet_marker": 1.0},
            lstm_adjusted=False,
        )

    lstm_adjusted = False
    try:
        payload = load_model_payload()
        model = payload["model"]
        feature_columns = payload["feature_columns"]

        feature_frame = build_feature_row(request)
        for column in feature_columns:
            if column not in feature_frame.columns:
                feature_frame[column] = 0

        ordered_features = feature_frame[feature_columns]

        prediction = model.predict(ordered_features)[0]
        probabilities = model.predict_proba(ordered_features)[0]
        rf_confidence = float(max(probabilities))

        if request.user_id:
            lstm_score = compute_lstm_sequence_adjustment(
                request.user_id, str(prediction)
            )
            if lstm_score > 0:
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


@app.post("/convert/document")
async def convert_document(file: UploadFile = File(...)) -> dict[str, Any]:
    """Convert uploaded .docx or .pdf file into high-fidelity HTML.

    Returns {"html", "page_setup", "header", "footer"} so the server can persist
    page size/margins and header/footer content for the imported document.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is missing.")

    filename_lower = file.filename.lower()
    content_bytes = await file.read()

    try:
        if filename_lower.endswith(".docx"):
            result = convert_docx_bytes_to_html(content_bytes)
        elif filename_lower.endswith(".pdf"):
            result = convert_pdf_bytes_to_html(content_bytes)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format for high-fidelity conversion.")

        return result
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Document conversion failed: {error}") from error


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


class FineTuneRequest(BaseModel):
    user_id: str


class FineTuneResponse(BaseModel):
    status: str
    message: str
    user_id: str


@app.post("/fine-tune", response_model=FineTuneResponse)
async def trigger_fine_tune(request: FineTuneRequest) -> FineTuneResponse:
    """Trigger supervised user fine-tuning in a background thread."""
    import subprocess
    import threading

    fine_tuner_path = ROOT_DIR / "training" / "fine_tuner.py"
    python_exec = sys.executable

    def run_fine_tuner() -> None:
        subprocess.run(
            [python_exec, str(fine_tuner_path), "--user-id", request.user_id],
            cwd=str(ROOT_DIR),
            capture_output=True,
            text=True,
        )

    thread = threading.Thread(target=run_fine_tuner, daemon=True)
    thread.start()

    return FineTuneResponse(
        status="started",
        message=f"Fine-tuning started for user {request.user_id}",
        user_id=request.user_id,
    )



if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8001")),
        log_level="info",
    )
