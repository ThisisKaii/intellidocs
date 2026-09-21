import json
import os
import pickle
import sys
import time
from contextlib import asynccontextmanager
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

# 24h in-process cache for the base model payload so predictions avoid a
# pickle reload on every request.
_MODEL_CACHE: dict[str, tuple[dict[str, Any], float]] = {}
MODEL_CACHE_TTL_SECONDS = 24 * 60 * 60

# Tier-3 cascade: when the RandomForest confidence drops below this threshold,
# the DistilBERT INT8 ONNX model gets the deciding vote.
TIER3_CONFIDENCE_THRESHOLD = min(
    max(float(os.getenv("TIER3_CONFIDENCE_THRESHOLD", "0.70")), 0.0), 1.0
)
_ONNX_RUNTIME: dict[str, tuple[Any, dict[str, str]]] = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Warm up the Tier-3 ONNX runtime at startup; failures degrade gracefully."""
    try:
        load_onnx_runtime()
    except Exception as exc:  # noqa: BLE001 - graceful degradation on missing artifacts
        print(f"⚠️ ONNX startup warmup skipped: {exc}")
    yield


app = FastAPI(
    title="IntelliDocs ML API",
    description="Machine Learning API for hybrid rule + RandomForest + DistilBERT ONNX formatting prediction and grammar checking",
    version="0.3.0",
    lifespan=lifespan,
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
    # Hierarchical outline context (Phase 2)
    previous_format: Optional[str] = None
    current_heading_level: Optional[int] = None
    is_inside_table: Optional[bool] = None
    is_list_item: Optional[bool] = None
    # Isolation mode controls how the user model contributes (research).

    #   "baseline"  → base model ONLY, no user LSTM adjustment
    #   "isolated"  → user model ONLY, base-model predictions are ignored
    #   "hybrid"    → base model + user LSTM reweighting (default)
    isolation_mode: Optional[str] = None


class PredictResponse(BaseModel):
    predicted_format: str
    confidence: float
    model_path: str
    feature_values: dict[str, float]
    lstm_adjusted: bool = False


class TextCheckRequest(BaseModel):
    text: str


def load_model_payload() -> dict[str, Any]:
    """Load the trained base formatting model from disk, cached for 24h."""
    model_key = os.path.realpath(MODEL_PATH)
    cached = _MODEL_CACHE.get(model_key)
    if cached and (time.time() - cached[1]) < MODEL_CACHE_TTL_SECONDS:
        return cached[0]

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Base model not found: {MODEL_PATH}")

    with open(MODEL_PATH, "rb") as file_handle:
        payload = pickle.load(file_handle)

    if "model" not in payload or "feature_columns" not in payload:
        raise ValueError("Model payload is missing required fields.")

    _MODEL_CACHE[model_key] = (payload, time.time())
    return payload


def compute_lstm_sequence_adjustment(user_id: str, predicted_format: str) -> float:
    """Calculate sequence-level confidence reweighting from user's PyTorch LSTM weights if available."""
    # Prefer the 24h temp cache backed by Supabase Storage; fall back to local dir.
    try:
        from storage import download_user_model

        cached_model = download_user_model(user_id)
    except Exception as exc:
        print(f"Model cache lookup warning for {user_id}: {exc}")
        cached_model = None

    model_file = cached_model or os.path.join(LSTM_DIR, f"user_{user_id}.pt")
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
        if not duckdb_path.startswith("md:") and not os.path.exists(duckdb_path):
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


def predict_with_user_lstm(user_id: str, request: PredictRequest) -> Optional[tuple[str, float]]:
    """Return a (format, confidence) prediction computed ONLY from the user's LSTM model.

    Used by isolation_mode="isolated". Returns None when the user model or
    recent sequence history is unavailable, so the caller can fall back to the
    base-model path instead of failing the request.
    """
    model_file = os.path.join(LSTM_DIR, f"user_{user_id}.pt")
    if not os.path.exists(model_file):
        # Prefer the Supabase Storage cache; the local dir is a fallback.
        try:
            from storage import download_user_model

            cached_model = download_user_model(user_id)
        except Exception as exc:
            print(f"Isolated-model lookup warning for {user_id}: {exc}")
            cached_model = None
        model_file = cached_model or model_file
    if not os.path.exists(model_file):
        return None

    try:
        from training.lstm_trainer import ACTION_TO_IDX, FormattingLSTM

        payload = torch.load(model_file, map_location=torch.device("cpu"))
        model = FormattingLSTM(vocab_size=len(payload["vocab"]))
        model.load_state_dict(payload["state_dict"])
        model.eval()

        duckdb_path = os.getenv("DUCKDB_PATH", "db/duckdb/behavior.duckdb")
        if not duckdb_path.startswith("md:") and not os.path.exists(duckdb_path):
            return None

        import duckdb

        conn = duckdb.connect(duckdb_path)
        df = conn.execute(
            "SELECT action FROM behavior_events WHERE user_id = ? ORDER BY event_ts DESC LIMIT 5",
            [user_id],
        ).fetchdf()
        conn.close()

        if df.empty or len(df) < 5:
            return None

        actions = [
            ACTION_TO_IDX.get(a, 0) for a in reversed(df["action"].tolist())
        ]
        input_tensor = torch.tensor([actions], dtype=torch.long)

        with torch.no_grad():
            logits = model(input_tensor)
            probs = torch.softmax(logits, dim=1)[0]
            best_idx = int(probs.argmax(dim=0))
            best_conf = float(probs[best_idx])

        best_format = next(
            (f for f, i in ACTION_TO_IDX.items() if i == best_idx),
            None,
        )
        if best_format is None:
            return None
        return (best_format, best_conf)
    except Exception as e:
        print(f"⚠️ Isolated LSTM prediction warning for user {user_id}: {e}")
        return None


def resolve_isolation_mode(mode: Optional[str]) -> str:
    """Normalize an isolation-mode string, defaulting to hybrid."""
    normalized = (mode or "hybrid").strip().lower()
    if normalized in ("baseline", "isolated", "hybrid"):
        return normalized
    return "hybrid"


def load_onnx_runtime() -> Optional[tuple[Any, dict[str, str]]]:
    """Lazily download + load the DistilBERT INT8 ONNX session and its label map.

    The model is streamed from the `ml-models` Supabase bucket into the 24h temp
    cache (with a local ml/models fallback). Returns None on any failure so the
    cascade degrades to the RandomForest result instead of erroring.
    """
    cached = _ONNX_RUNTIME.get("runtime")
    if cached is not None:
        return cached

    try:
        import onnxruntime as ort

        from storage import download_base_onnx_model

        onnx_path, labels_path = download_base_onnx_model()
        if not onnx_path or not labels_path:
            return None

        with open(labels_path, "r", encoding="utf-8") as file_handle:
            label_map = json.load(file_handle)
        id2label = label_map.get("id2label", {})
        if not id2label:
            return None

        session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        _ONNX_RUNTIME["runtime"] = (session, id2label)
        print(f"[OK] Tier-3 DistilBERT ONNX loaded from {onnx_path}")
        return (session, id2label)
    except Exception as exc:  # noqa: BLE001 - optional feature
        print(f"⚠️ ONNX load warning: {exc}")
        return None


def predict_with_onnx(text: str) -> Optional[tuple[str, float]]:
    """Return a (format, confidence) prediction from the DistilBERT Tier-3 model.

    Uses CPU inference (~20ms). Falls back to None when the runtime or tokenizer
    is unavailable so callers keep the Tier-2 RandomForest result.
    """
    runtime = load_onnx_runtime()
    if runtime is None:
        return None

    session, id2label = runtime
    try:
        from transformers import AutoTokenizer

        import numpy as np

        tokenizer_dir = os.getenv(
            "DISTILBERT_TOKENIZER_DIR",
            str(ROOT_DIR / "models" / "distilbert_tokenizer"),
        )
        tokenizer = AutoTokenizer.from_pretrained(
            tokenizer_dir if os.path.isdir(tokenizer_dir) else "distilbert-base-uncased"
        )
        inputs = tokenizer(text, return_tensors="np", truncation=True, max_length=128)
        feed = {
            name: inputs[name]
            for name in [inp.name for inp in session.get_inputs()]
            if name in inputs
        }
        logits = session.run(None, feed)[0][0]
        exp = np.exp(logits - np.max(logits))
        probabilities = exp / exp.sum()
        best_index = int(np.argmax(probabilities))
        confidence = float(probabilities[best_index])
    except Exception as exc:  # noqa: BLE001 - optional feature
        print(f"⚠️ ONNX inference warning: {exc}")
        return None

    best_format = id2label.get(str(best_index))
    if best_format is None:
        return None
    return (best_format, confidence)


def build_feature_row(request: PredictRequest) -> pd.DataFrame:
    """Build numeric feature vectors including typographic, academic layout, and hierarchical context attributes."""
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

    # Hierarchical context features (Phase 2)
    prev_fmt = request.previous_format or "none"
    heading_level = request.current_heading_level if request.current_heading_level is not None else 0
    in_table = int(request.is_inside_table) if request.is_inside_table is not None else 0
    in_list = int(request.is_list_item) if request.is_list_item is not None else 0

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
        # Hierarchical context
        "prev_is_heading": int(prev_fmt.startswith("heading")),
        "prev_is_body": int(prev_fmt == "body"),
        "heading_level": heading_level,
        "in_table": in_table,
        "in_list": in_list,
    }
    return pd.DataFrame([features])


@app.get("/")
async def root() -> dict[str, str]:
    """Return a simple welcome payload."""
    return {
        "message": "Welcome to IntelliDocs ML API",
        "version": "0.3.0",
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
    """Predict an APA academic formatting label using hierarchical heuristics + RandomForest + LSTM."""
    import re

    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")

    words = text.split()
    word_count = len(words)
    lower = text.lower()

    prev_fmt = request.previous_format or "none"
    heading_level = request.current_heading_level or 0
    in_table = request.is_inside_table or False
    in_list = request.is_list_item or False

    # Suppress heading predictions inside tables and list items to prevent layout disruption
    if not in_table and not in_list:
        if word_count <= 14 and "\n" not in text:
            heading1_match = (
                lower.startswith("chapter")
                or bool(re.match(r"^(chapter\s+\d+|[ivx]+\.|\d+\.)\s+", lower))
                or lower in [
                    "abstract", "introduction", "methodology", "literature review",
                    "results", "discussion", "conclusion", "references",
                    "table of contents", "acknowledgments", "appendix"
                ]
            )
            # Topological outline rule: a Heading 1 cannot immediately be followed by
            # another Heading 1. When the previous block is already heading1, suppress
            # the suggestion instead of nudging it down.
            if heading1_match and prev_fmt == "heading1":
                heading1_match = False

            if heading1_match:
                # After a title or body → heading1 (confidence 0.98 per spec)
                confidence = 0.98 if prev_fmt in ("none", "body", "title") else 0.95
                return PredictResponse(
                    predicted_format="heading1",
                    confidence=confidence,
                    model_path=MODEL_PATH,
                    feature_values={"word_count": word_count, "academic_heading1_prior": 1.0, "hierarchy_context": 1.0},
                    lstm_adjusted=False,
                )
            heading2_match = bool(re.match(r"^\d+\.\d+\s+", text)) and prev_fmt != "heading2"
            if heading2_match:
                # Under heading1 → heading2 (confidence 0.98 per spec)
                confidence = 0.98 if heading_level == 1 else 0.95
                return PredictResponse(
                    predicted_format="heading2",
                    confidence=confidence,
                    model_path=MODEL_PATH,
                    feature_values={"word_count": word_count, "academic_heading2_prior": 1.0, "hierarchy_context": 1.0},
                    lstm_adjusted=False,
                )
            heading3_match = bool(re.match(r"^\d+\.\d+\.\d+\s+", text)) and prev_fmt != "heading3"
            if heading3_match:
                # Under heading2 → heading3 (confidence 0.98 per spec)
                confidence = 0.98 if heading_level == 2 else 0.95
                return PredictResponse(
                    predicted_format="heading3",
                    confidence=confidence,
                    model_path=MODEL_PATH,
                    feature_values={"word_count": word_count, "academic_heading3_prior": 1.0, "hierarchy_context": 1.0},
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

    # Fast-path heuristics for the three expanded taxonomy labels, checked
    # before the RandomForest so they never get crowded out by the large
    # "paragraph" class.
    if len(text) <= 120 and text == text.upper() and text[0].isalpha():
        return PredictResponse(
            predicted_format="title",
            confidence=0.96,
            model_path=MODEL_PATH,
            feature_values={"word_count": word_count, "uppercase_prior": 1.0},
            lstm_adjusted=False,
        )

    if text.startswith("```") or re.search(
        r"\b(SELECT|INSERT|def |class |function |import )\b", text
    ):
        return PredictResponse(
            predicted_format="code_block",
            confidence=0.97,
            model_path=MODEL_PATH,
            feature_values={"word_count": word_count, "code_keyword_prior": 1.0},
            lstm_adjusted=False,
        )

    if re.match(r"^[A-Z][a-zA-Z'\-]+,\s+[A-Z]\..*\(\d{4}\)", text):
        return PredictResponse(
            predicted_format="reference_entry",
            confidence=0.96,
            model_path=MODEL_PATH,
            feature_values={"word_count": word_count, "citation_prior": 1.0},
            lstm_adjusted=False,
        )

    lstm_adjusted = False
    isolation_mode = resolve_isolation_mode(request.isolation_mode)
    predicted_format: Optional[str] = None
    confidence: float = 0.0

    try:
        # "isolated" → the user model alone decides the formatting label.
        if isolation_mode == "isolated" and request.user_id:
            isolated = predict_with_user_lstm(request.user_id, request)
            if isolated is not None:
                predicted_format, confidence = isolated

        if predicted_format is None:
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

            # Tier-3 cascade: when the Tier-2 RandomForest is unsure, let the
            # DistilBERT INT8 ONNX model vote only if its confidence is higher.
            if rf_confidence < TIER3_CONFIDENCE_THRESHOLD:
                onnx_result = predict_with_onnx(text)
                if onnx_result is not None:
                    onnx_format, onnx_confidence = onnx_result
                    if onnx_confidence > rf_confidence:
                        prediction = onnx_format
                        rf_confidence = onnx_confidence

            predicted_format = str(prediction)

            if request.user_id and isolation_mode == "hybrid":
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

    feature_values: dict[str, float] = {}
    if "feature_columns" in locals() and "ordered_features" in locals():
        feature_values = {
            column: float(ordered_features.iloc[0][column]) for column in feature_columns
        }

    return PredictResponse(
        predicted_format=str(predicted_format),
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
    """Trigger supervised user fine-tuning in a background thread.

    Runs the RandomForest fine-tuner and the LSTM sequence trainer, then uploads
    the LSTM artifact to Supabase Storage so predictions reuse it from cloud.
    """
    import subprocess
    import threading

    fine_tuner_path = ROOT_DIR / "training" / "fine_tuner.py"
    lstm_trainer_path = ROOT_DIR / "training" / "lstm_trainer.py"
    python_exec = sys.executable

    def run_fine_tuner() -> None:
        subprocess.run(
            [python_exec, str(fine_tuner_path), "--user-id", request.user_id],
            cwd=str(ROOT_DIR),
            capture_output=True,
            text=True,
        )
        subprocess.run(
            [python_exec, str(lstm_trainer_path), "--user-id", request.user_id, "--epochs", "8"],
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
