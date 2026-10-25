import json
import os
import pickle
import sys
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, Optional

# Ensure the src/ directory is on sys.path so sibling modules (converter, grammar) resolve
_SRC_DIR = str(Path(__file__).resolve().parent)
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

# pandas, torch and the sklearn-backed grammar checker cost ~8s to import, so
# they are imported inside the functions that use them and pre-loaded by a
# background thread (see _warm_up_heavy_modules) once the server is listening.
if TYPE_CHECKING:
    import pandas as pd

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from converter import convert_docx_bytes_to_html, convert_pdf_bytes_to_html

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from grammar.compliance_auditor import audit_document
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
_TOKENIZER_CACHE: dict[str, Any] = {}


def _warm_up_heavy_modules() -> None:
    """Pre-load the slow imports and models off the request path.

    Covers the heavy modules, the base RandomForest payload, the Tier-3 ONNX
    runtime and its tokenizer. Runs in a daemon thread so the port opens
    immediately; a request that arrives before this finishes simply loads what
    it needs itself (Python's import lock makes that safe). Each step is best
    effort, so a missing artifact never blocks the rest.
    """
    import importlib

    for module_name in ("pandas", "torch", "grammar.grammar_checker"):
        try:
            importlib.import_module(module_name)
        except Exception as exc:  # noqa: BLE001 - warm-up is best effort
            print(f"⚠️ Warm-up import of {module_name} skipped: {exc}")
    for step_name, step in (
        ("base model", load_model_payload),
        ("ONNX runtime", load_onnx_runtime),
        ("tokenizer", load_tokenizer),
    ):
        try:
            step()
        except Exception as exc:  # noqa: BLE001 - graceful degradation on missing artifacts
            print(f"⚠️ Startup warm-up of {step_name} skipped: {exc}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Start the background warm-up; the server does not wait for it."""
    threading.Thread(target=_warm_up_heavy_modules, name="ml-warmup", daemon=True).start()
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


class TextBlock(BaseModel):
    """One editor text block with the layout hints the grammar rules need."""

    text: str
    kind: Literal["paragraph", "heading", "listItem"] = "paragraph"
    align: str = "left"
    centered: bool = False


class TextCheckRequest(BaseModel):
    """Plain text, or per-block text with layout metadata (blocks win when present)."""

    text: str = ""
    blocks: list[TextBlock] | None = None


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
        import torch
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
        import duckdb_store

        conn = duckdb_store.connect_duckdb(read_only=True).conn
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
        import torch
        from training.lstm_trainer import ACTION_TO_IDX, FormattingLSTM

        payload = torch.load(model_file, map_location=torch.device("cpu"))
        model = FormattingLSTM(vocab_size=len(payload["vocab"]))
        model.load_state_dict(payload["state_dict"])
        model.eval()

        import duckdb_store

        conn = duckdb_store.connect_duckdb(read_only=True).conn
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


def load_tokenizer() -> Any:
    """Return the DistilBERT tokenizer, building it once and reusing it.

    `transformers` costs seconds to import and the tokenizer was previously
    rebuilt on every prediction; it is now cached for the process lifetime.
    """
    cached = _TOKENIZER_CACHE.get("tokenizer")
    if cached is not None:
        return cached

    from transformers import AutoTokenizer

    tokenizer_dir = os.getenv(
        "DISTILBERT_TOKENIZER_DIR",
        str(ROOT_DIR / "models" / "distilbert_tokenizer"),
    )
    tokenizer = AutoTokenizer.from_pretrained(
        tokenizer_dir if os.path.isdir(tokenizer_dir) else "distilbert-base-uncased"
    )
    _TOKENIZER_CACHE["tokenizer"] = tokenizer
    return tokenizer


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
        import numpy as np

        tokenizer = load_tokenizer()
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


def build_feature_row(request: PredictRequest) -> "pd.DataFrame":
    """Build numeric feature vectors including typographic, academic layout, and hierarchical context attributes."""
    import pandas as pd

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
        # 'primary' normally; 'fallback' while the main DuckDB is locked or unreachable.
        "duckdb": __import__("duckdb_store").active_store(),
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
        from grammar.grammar_checker import evaluate_text

        return evaluate_text(
            request.blocks if request.blocks is not None else request.text
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Grammar check failed: {error}",
        ) from error


@app.post("/spelling/check")
async def spelling_check(request: TextCheckRequest) -> dict[str, Any]:
    """Run the spelling checker on the given text."""
    try:
        return check_spelling(
            request.blocks if request.blocks is not None else request.text
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Spelling check failed: {error}",
        ) from error


class MarginsInput(BaseModel):
    """Page margins in inches, as stored on the document."""

    top: float = 1.0
    bottom: float = 1.0
    left: float = 1.0
    right: float = 1.0


class PageSetupInput(BaseModel):
    """Page layout and header/footer state used by the layout compliance rules."""

    margins: MarginsInput = MarginsInput()
    page_size: Optional[str] = None
    orientation: Optional[str] = None
    show_header: bool = False
    show_footer: bool = False
    header_number_format: Optional[str] = None
    footer_number_format: Optional[str] = None


class ComplianceRequirements(BaseModel):
    """The template rules a document is audited against."""

    mandatory_headings: list[str] = []
    reference_style: str = "apa"
    required_margin_inches: float = 1.0
    references_required: bool = True


class ComplianceAuditRequest(BaseModel):
    """A document plus the template it must satisfy."""

    content: str
    page_setup: PageSetupInput = PageSetupInput()
    requirements: ComplianceRequirements = ComplianceRequirements()


@app.post("/audit/compliance")
async def audit_compliance(request: ComplianceAuditRequest) -> dict[str, Any]:
    """
    Run the hybrid compliance auditor over one document.

    Tier 1 deterministic rules always run. Tier 2 style and flow models are
    used when their artifacts are installed; otherwise the response reports
    `ml.available` as false so the caller can show that style was not
    measured rather than presenting a rules-only score as a full audit.
    """
    if not request.content.strip():
        raise HTTPException(status_code=400, detail="Document content is required.")

    try:
        return audit_document(
            request.content,
            request.page_setup.model_dump(),
            request.requirements.model_dump(),
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Compliance audit failed: {error}",
        ) from error


@app.post("/convert/document")
def convert_document(file: UploadFile = File(...)) -> dict[str, Any]:
    """Convert uploaded .docx or .pdf file into high-fidelity HTML.

    Returns {"html", "page_setup", "header", "footer", "header_number_format",
    "footer_number_format", "page_art", "hf"} so the server can persist page
    size/margins, header/footer text, the page-number format read from a PAGE
    field, pictures pinned to pages, and per-section headers/footers/numbering.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is missing.")

    filename_lower = file.filename.lower()
    content_bytes = file.file.read()

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
        import duckdb_store

        from feature_extractor import ensure_feature_table, extract_features, overwrite_features

        conn = duckdb_store.connect_duckdb().conn
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
        import duckdb_store

        from export_features import ensure_export_dir, export_features, table_exists

        export_dir = os.getenv("FEATURE_EXPORT_DIR", "db/duckdb/exports")

        ensure_export_dir(export_dir)
        conn = duckdb_store.connect_duckdb(read_only=True).conn

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


# ─── AI Council plagiarism scan (peer documents supplied by the server) ───


class CouncilPeer(BaseModel):
    """One peer document to compare the scanned document against."""

    document_id: str
    user_id: str
    text: str


class CouncilAIProfile(BaseModel):
    """One AI backend for the council (comma-separated keys rotate within it)."""

    provider: str
    api_key: str
    model: str


class CouncilAIConfig(BaseModel):
    """Per-request AI configuration from the server's environment.

    `profiles` + `assignments` (judge role -> profile index) is the current
    shape; the single provider/api_key/model triple is still accepted.
    """

    profiles: list[CouncilAIProfile] = []
    assignments: dict[str, int] = {}
    provider: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None


class CouncilScanRequest(BaseModel):
    document_id: str
    user_id: str
    folder_id: str
    text: str
    peers: list[CouncilPeer] = []
    # Raw behavior events (action, timestamp, char_count, position, …) used by
    # the timeline forensics engine.
    timeline: list[dict] = []
    ai: Optional[CouncilAIConfig] = None
    # Review only the N strongest flagged paragraphs with the AI judges (0 = all).
    max_matches: int = 0


class CouncilScanMatch(BaseModel):
    paragraph_index: int
    char_start: int
    char_end: int
    matched_document_id: Optional[str] = None
    matched_student_id: Optional[str] = None
    similarity_score: float
    match_type: str
    match_severity: str
    source_excerpt: Optional[str] = None
    target_excerpt: Optional[str] = None
    flagged_text: str
    council_verdict: Optional[dict] = None
    # Timeline forensics: verdict, evidence, and composition metrics.
    forensics: Optional[dict] = None


class CouncilScanResponse(BaseModel):
    matches: list[CouncilScanMatch]
    transcript: list[dict]
    active_judges: int
    quorum_reached: bool
    peer_similarity_score: float
    overall_originality_score: float
    processing_time_ms: float


class OriginalityPeer(BaseModel):
    """One of the student's other documents to compare against."""

    document_id: str
    title: str = ''
    text: str


class OriginalityRequest(BaseModel):
    text: str
    peers: list[OriginalityPeer] = []


class OriginalityPassage(BaseModel):
    paragraph_index: int
    text: str
    similarity: float
    match_type: str
    peer_document_id: str
    peer_title: str
    peer_excerpt: str


class OriginalityResponse(BaseModel):
    overlap_percent: float
    passages: list[OriginalityPassage]


@app.post('/originality/check', response_model=OriginalityResponse)
async def originality_check(request: OriginalityRequest) -> OriginalityResponse:
    """
    Student self-check: lexical (difflib) paragraph matching against the
    student's own other documents. Reuses the council's stage-1 pre-filter and
    never runs the council or any AI judge.
    """
    try:
        from triage_filter import TriageFilter, extract_paragraphs

        triage = TriageFilter()
        flagged = triage._stage1_peer_pre_filter(
            'self-check',
            request.text,
            [{'document_id': p.document_id, 'user_id': '', 'text': p.text} for p in request.peers],
        )
        titles = {p.document_id: p.title for p in request.peers}
        total_chars = sum(
            len(text) for (_i, text, _s, _e) in extract_paragraphs(request.text, triage.config.min_paragraph_length)
        )
        flagged_chars = sum(len(item['text']) for item in flagged)
        overlap = round(100.0 * flagged_chars / total_chars, 1) if total_chars else 0.0

        passages = [
            OriginalityPassage(
                paragraph_index=item['paragraph_index'],
                text=item['text'],
                similarity=round(item['similarity_score'] * 100, 1),
                match_type=item['match_type'],
                peer_document_id=item['matched_document_id'],
                peer_title=titles.get(item['matched_document_id'], ''),
                peer_excerpt=item['source_excerpt'],
            )
            for item in flagged
        ]
        return OriginalityResponse(overlap_percent=min(overlap, 100.0), passages=passages)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Originality check failed: {exc}')


@app.post('/council/scan', response_model=CouncilScanResponse)
async def council_scan(request: CouncilScanRequest) -> CouncilScanResponse:
    """
    Run the 3-stage triage (lexical pre-filter → context windows → 5-judge
    council) for one document against peer documents supplied by the server.
    """
    try:
        from council_pipeline import configure_ai
        from timeline_forensics import TimelineForensics, build_composition_events
        from triage_filter import TriageConfig, run_full_triage_with_peers

        if request.ai and request.ai.profiles:
            configure_ai(
                profiles=[profile.model_dump() for profile in request.ai.profiles],
                assignments=request.ai.assignments,
            )
        elif request.ai and (request.ai.provider or request.ai.api_key or request.ai.model):
            configure_ai(
                provider=request.ai.provider,
                api_key=request.ai.api_key,
                model=request.ai.model,
            )

        peers = [peer.model_dump() for peer in request.peers]
        triage_config = TriageConfig(max_flagged_paragraphs=request.max_matches) if request.max_matches > 0 else None
        result = await run_full_triage_with_peers(
            document_id=request.document_id,
            html_content=request.text,
            user_id=request.user_id,
            folder_id=request.folder_id,
            peers=peers,
            config=triage_config,
        )

        # Timeline forensics: resolve a concrete authorship verdict per match
        # from the client's composition events (no DOCX in this flow).
        composition_events = build_composition_events(request.timeline)
        forensics_engine = TimelineForensics()
        forensics_by_match: dict[str, dict[str, Any]] = {}
        for flagged in result.flagged_clusters:
            para = asdict(flagged) if hasattr(flagged, '__dataclass_fields__') else dict(flagged)
            analysis = await forensics_engine.analyze_composition(
                document_id=request.document_id,
                user_id=request.user_id,
                target_text=str(para.get('text', '')),
                char_start=int(para.get('char_start', 0)),
                char_end=int(para.get('char_end', 0)),
                timeline_events=composition_events,
                document_length=len(request.text),
            )
            summary = (
                forensics_engine.get_timeline_summary(analysis.timeline_events)
                if analysis.timeline_events
                else None
            )
            forensics_by_match[str(para.get('match_id', ''))] = {
                'timeline_verdict': analysis.verdict.value,
                'confidence': round(float(analysis.confidence), 3),
                'evidence': analysis.evidence,
                'priority_author': analysis.priority_author,
                'priority_timestamp': (
                    analysis.priority_timestamp.isoformat()
                    if analysis.priority_timestamp
                    else None
                ),
                'composition': summary,
                'doc_metadata': None,
            }

        verdicts_by_match: dict[str, dict[str, Any]] = {}
        transcript: list[dict[str, Any]] = []
        active_judges = 0
        quorum_reached = True

        for verdict in result.council_verdicts:
            payload = asdict(verdict) if hasattr(verdict, '__dataclass_fields__') else dict(verdict)
            verdicts_by_match[str(payload.get('match_id', ''))] = payload
            transcript.append(payload)
            active_judges = max(active_judges, int(payload.get('active_judges') or 0))
            quorum_reached = quorum_reached and bool(payload.get('quorum_reached'))

        matches: list[CouncilScanMatch] = []
        peer_similarity = 0.0
        for flagged in result.flagged_clusters:
            para = asdict(flagged) if hasattr(flagged, '__dataclass_fields__') else dict(flagged)
            similarity_percent = round(float(para.get('similarity_score', 0.0)) * 100, 2)
            peer_similarity = max(peer_similarity, similarity_percent)
            matches.append(CouncilScanMatch(
                paragraph_index=int(para.get('paragraph_index', 0)),
                char_start=int(para.get('char_start', 0)),
                char_end=int(para.get('char_end', 0)),
                matched_document_id=para.get('matched_document_id'),
                matched_student_id=para.get('matched_student_id'),
                similarity_score=similarity_percent,
                match_type=str(para.get('match_type', 'verbatim')),
                match_severity=str(para.get('match_severity', 'medium')),
                source_excerpt=para.get('source_excerpt'),
                target_excerpt=para.get('target_excerpt'),
                flagged_text=str(para.get('text', ''))[:2000],
                council_verdict=verdicts_by_match.get(str(para.get('match_id', ''))),
                forensics=forensics_by_match.get(str(para.get('match_id', ''))),
            ))

        peer_similarity = round(min(peer_similarity, 100.0), 2)
        originality = round(max(0.0, 100.0 - peer_similarity), 2)

        return CouncilScanResponse(
            matches=matches,
            transcript=transcript,
            active_judges=active_judges,
            quorum_reached=quorum_reached,
            peer_similarity_score=peer_similarity,
            overall_originality_score=originality,
            processing_time_ms=round(float(result.processing_time_ms), 2),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Council scan failed: {exc}') from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8001")),
        log_level="info",
    )



class ParseDocumentResponse(BaseModel):
    html: str
    title: str | None = None
    word_count: int = 0
    detected_template: str = 'generic'
    reading_order_applied: bool = False


@app.post('/parse/document', response_model=ParseDocumentResponse)
async def parse_document(file: UploadFile = File(...)) -> ParseDocumentResponse:
    content = await file.read()
    suffix = Path(file.filename or '').suffix.lower()
    try:
        html = None
        # Try marker first (best for complex layouts)
        try:
            from marker.converters.pdf import PdfConverter  # type: ignore
            from marker.models import create_model_dict  # type: ignore
            from marker.output import text_from_rendered  # type: ignore
            from marker.renderers.markdown import MarkdownRenderer  # type: ignore
            converter = PdfConverter(
                artifact_dict=create_model_dict(),
                renderer=MarkdownRenderer(),
                use_llm=False,
            )
            rendered = converter(content)
            marker_html = text_from_rendered(rendered)
            # Ensure marker returns a string (some versions return dict)
            if isinstance(marker_html, str):
                html = marker_html
            elif isinstance(marker_html, dict) and 'text' in marker_html:
                html = marker_html['text']
            elif isinstance(marker_html, dict) and 'markdown' in marker_html:
                html = marker_html['markdown']
        except Exception:
            html = None
        # Fallback to existing converters
        if not html:
            if suffix == '.pdf':
                html = convert_pdf_bytes_to_html(content)
            elif suffix in ('.docx', '.doc'):
                html = convert_docx_bytes_to_html(content)
            else:
                raise HTTPException(status_code=400, detail='Unsupported file type')
        # Ensure html is a string
        if not isinstance(html, str):
            html = str(html)
        word_count = len(html.split()) if html else 0
        title = None
        import re
        m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.IGNORECASE | re.DOTALL)
        if m:
            title = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        return ParseDocumentResponse(
            html=html or '',
            title=title,
            word_count=word_count,
            detected_template='generic',
            reading_order_applied=True,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Document parse failed: {exc}') from exc

