import os
import pickle
import sys
from pathlib import Path
from typing import Any

import pandas as pd
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

MODEL_PATH = os.getenv("BASE_MODEL_PATH", "ml/models/base_model.pkl")

app = FastAPI(
    title="IntelliDocs ML API",
    description="Machine Learning API for formatting prediction and grammar checking",
    version="0.1.0",
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


class PredictResponse(BaseModel):
    predicted_format: str
    confidence: float
    model_path: str
    feature_values: dict[str, float]


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


def build_feature_row(text: str) -> pd.DataFrame:
    """Build the same numeric features used during base model training."""
    normalized = text.strip()
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
    }
    return pd.DataFrame([features])


@app.get("/")
async def root() -> dict[str, str]:
    """Return a simple welcome payload."""
    return {
        "message": "Welcome to IntelliDocs ML API",
        "version": "0.1.0",
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
    """Predict a formatting label for the given text."""
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")

    try:
        payload = load_model_payload()
        model = payload["model"]
        feature_columns = payload["feature_columns"]

        feature_frame = build_feature_row(text)
        for column in feature_columns:
            if column not in feature_frame.columns:
                feature_frame[column] = 0

        ordered_features = feature_frame[feature_columns]
        prediction = model.predict(ordered_features)[0]
        probabilities = model.predict_proba(ordered_features)[0]
        confidence = float(max(probabilities))
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
        confidence=confidence,
        model_path=MODEL_PATH,
        feature_values=feature_values,
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )
