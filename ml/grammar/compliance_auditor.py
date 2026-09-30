"""
Hybrid compliance auditor: deterministic rules plus machine-learned style.

Tier 1 lives in compliance_rules.py and decides objective, checkable
requirements (margins, page numbers, heading capitalisation, table captions,
reference format). This module adds Tier 2, which asks two learned questions
that rules cannot answer:

  1. Does each block carry the style the author probably intended?
     (RandomForest paragraph-style classifier)
  2. Do the styles follow the flow a thesis is expected to have?
     (LSTM sequence model over the style sequence)

The two tier scores are combined into one thesis-readiness score. Both models
are optional: when their artifacts are missing the ML tier reports itself as
unavailable and the aggregate score falls back to the rule tier alone, rather
than failing the request or inventing a number.
"""
from __future__ import annotations

import os
import pickle
import re
import sys
import time
from pathlib import Path
from typing import Any, Optional

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from grammar.compliance_rules import STATUS_FAIL, run_rule_checks

ML_DIR = str(ROOT_DIR / "models" / "compliance")
STYLE_MODEL_PATH = os.getenv("COMPLIANCE_STYLE_MODEL", os.path.join(ML_DIR, "style_model.pkl"))
FLOW_MODEL_PATH = os.getenv("COMPLIANCE_FLOW_MODEL", os.path.join(ML_DIR, "flow_model.pt"))

# The rule tier carries most of the weight because it is objective; the ML tier
# breaks ties on stylistic consistency, which no rule can measure.
RULE_WEIGHT = min(max(float(os.getenv("COMPLIANCE_RULE_WEIGHT", "0.65")), 0.0), 1.0)
ML_WEIGHT = 1.0 - RULE_WEIGHT
STYLE_FLOW_SPLIT = 0.6
READINESS_THRESHOLD = min(max(float(os.getenv("COMPLIANCE_READY_THRESHOLD", "80")), 0.0), 100.0)

STATUS_SCORE = {"pass": 1.0, "warn": 0.5, STATUS_FAIL: 0.0}

# Styles the RandomForest was trained on.
STYLE_CLASSES = (
    "paragraph",
    "heading1",
    "heading2",
    "heading3",
    "title",
    "unordered_list",
    "ordered_list",
    "code_block",
    "blockquote",
)

# Editor styles with no trained counterpart are scored as their nearest analogue
# instead of being skipped, so they can still contribute to consistency.
STYLE_ALIASES = {
    "reference_entry": "paragraph",
    "caption": "paragraph",
    "table": "paragraph",
    "heading4": "heading3",
    "heading5": "heading3",
    "heading6": "heading3",
}

# Numeric features describing one text block. The trainer imports this function
# so training and inference can never drift apart.
FEATURE_NAMES = (
    "word_count",
    "char_count",
    "avg_word_length",
    "digit_ratio",
    "uppercase_ratio",
    "punctuation_ratio",
    "sentence_count",
    "avg_sentence_length",
    "is_all_caps",
    "is_title_case",
    "starts_with_bullet",
    "starts_with_numbering",
    "starts_with_code_marker",
    "ends_with_colon",
    "ends_with_period",
    "has_year",
    "citation_density",
    "colons_in_text",
)

_WORD_PATTERN = re.compile(r"\b[\w']+\b", re.UNICODE)
_SENTENCE_PATTERN = re.compile(r"[.!?]+(?:\s|$)")
_BULLET_PATTERN = re.compile(r"^\s*([-*•·‣–—]|\d+[.)])\s+")
_CODE_MARKER_PATTERN = re.compile(r"^\s*(```|def |class |import |function |SELECT |INSERT )")
_YEAR_PATTERN = re.compile(r"\b(19|20)\d{2}\b")
_CITATION_PATTERN = re.compile(r"\(\s*[A-Z][^)]*,\s*\d{4}|\[\d+\]")
_MAJOR_WORDS = frozenset({
    "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor",
    "of", "on", "or", "the", "to", "up", "via", "with",
})

# Artifacts are immutable once trained, so a process-lifetime cache is enough.
_ARTIFACT_CACHE: dict[str, tuple[Any, float]] = {}
_ARTIFACT_TTL_SECONDS = 24 * 60 * 60


def style_features(text: str) -> dict[str, float]:
    """Return the numeric feature vector describing one block of text."""
    raw = text or ""
    stripped = raw.strip()
    words = _WORD_PATTERN.findall(stripped)
    letters = [char for char in stripped if char.isalpha()]
    digits = [char for char in stripped if char.isdigit()]
    word_count = len(words)
    char_count = len(stripped) or 1
    sentences = [item for item in _SENTENCE_PATTERN.split(stripped) if item.strip()]
    significant = [word for word in words if word.lower() not in _MAJOR_WORDS]

    return {
        "word_count": float(word_count),
        "char_count": float(char_count),
        "avg_word_length": (
            float(sum(len(word) for word in words) / word_count) if word_count else 0.0
        ),
        "digit_ratio": len(digits) / char_count,
        "uppercase_ratio": (
            sum(1 for char in stripped if char.isupper()) / len(letters) if letters else 0.0
        ),
        "punctuation_ratio": (
            sum(1 for char in stripped if not char.isalnum() and not char.isspace()) / char_count
        ),
        "sentence_count": float(len(sentences)),
        "avg_sentence_length": float(word_count / len(sentences)) if sentences else 0.0,
        "is_all_caps": 1.0 if (len(letters) >= 4 and all(c.isupper() for c in letters)) else 0.0,
        "is_title_case": (
            1.0 if (significant and all(word[:1].isupper() for word in significant)) else 0.0
        ),
        "starts_with_bullet": 1.0 if _BULLET_PATTERN.match(stripped) else 0.0,
        "starts_with_numbering": 1.0 if re.match(r"^\s*\d+(\.\d+)+\s+\S", stripped) else 0.0,
        "starts_with_code_marker": 1.0 if _CODE_MARKER_PATTERN.match(stripped) else 0.0,
        "ends_with_colon": 1.0 if stripped.endswith(":") else 0.0,
        "ends_with_period": 1.0 if stripped.endswith((".", "!", "?")) else 0.0,
        "has_year": 1.0 if _YEAR_PATTERN.search(stripped) else 0.0,
        "citation_density": float(len(_CITATION_PATTERN.findall(stripped))),
        "colons_in_text": float(stripped.count(":")),
    }


def feature_frame(paragraphs: list[dict[str, Any]]):
    """Build the ordered feature matrix the style classifier consumes."""
    import pandas as pd

    columns = list(FEATURE_NAMES)
    if not paragraphs:
        return pd.DataFrame(columns=columns)
    rows = [style_features(paragraph["text"]) for paragraph in paragraphs]
    return pd.DataFrame(rows, columns=columns)


def map_observed_style(style: str) -> str:
    """Map an editor style label onto the nearest trained class."""
    if style in STYLE_CLASSES:
        return style
    return STYLE_ALIASES.get(style, "paragraph")


def load_style_model() -> Optional[tuple[Any, list[str]]]:
    """Load the RandomForest paragraph-style model, or None when unavailable."""
    key = f"style::{os.path.realpath(STYLE_MODEL_PATH)}"
    cached = _ARTIFACT_CACHE.get(key)
    if cached and (time.time() - cached[1]) < _ARTIFACT_TTL_SECONDS:
        return cached[0]

    if not os.path.exists(STYLE_MODEL_PATH):
        return None

    try:
        with open(STYLE_MODEL_PATH, "rb") as handle:
            payload = pickle.load(handle)
        model = payload["model"]
        classes = [str(item) for item in payload.get("classes", STYLE_CLASSES)]
    except Exception as exc:  # noqa: BLE001 - optional artifact, degrade not fail
        print(f"⚠️ Compliance style model unavailable: {exc}")
        return None

    result = (model, classes)
    _ARTIFACT_CACHE[key] = (result, time.time())
    return result


def load_flow_model() -> Optional[tuple[Any, dict[str, int]]]:
    """Load the LSTM document-flow model, or None when unavailable."""
    import torch

    key = f"flow::{os.path.realpath(FLOW_MODEL_PATH)}"
    cached = _ARTIFACT_CACHE.get(key)
    if cached and (time.time() - cached[1]) < _ARTIFACT_TTL_SECONDS:
        return cached[0]

    if not os.path.exists(FLOW_MODEL_PATH):
        return None

    try:
        from training.compliance_trainer import ComplianceLSTM

        payload = torch.load(FLOW_MODEL_PATH, map_location=torch.device("cpu"))
        vocab = {str(key_): int(value) for key_, value in payload["vocab"].items()}
        model = ComplianceLSTM(
            vocab_size=len(vocab),
            hidden_size=int(payload.get("hidden_size", 64)),
            num_layers=int(payload.get("num_layers", 1)),
        )
        model.load_state_dict(payload["state_dict"])
        model.eval()
    except Exception as exc:  # noqa: BLE001 - optional artifact, degrade not fail
        print(f"⚠️ Compliance flow model unavailable: {exc}")
        return None

    result = (model, vocab)
    _ARTIFACT_CACHE[key] = (result, time.time())
    return result


def score_style_consistency(paragraphs: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """
    Score how well each block's markup matches its predicted style.

    Returns None when no model is installed so the caller can report the ML tier
    as unavailable rather than substituting a default.
    """
    loaded = load_style_model()
    if loaded is None or not paragraphs:
        return None

    model, classes = loaded
    frame = feature_frame(paragraphs)
    if frame.empty:
        return None

    predictions = model.predict(frame)
    probabilities = model.predict_proba(frame)

    agreements = 0
    mismatches: list[dict[str, str]] = []
    confidence_total = 0.0

    for index, paragraph in enumerate(paragraphs):
        predicted = str(predictions[index])
        observed = map_observed_style(paragraph["style"])
        confidence_total += float(max(probabilities[index]))
        if predicted == observed:
            agreements += 1
        elif len(mismatches) < 8:
            mismatches.append({
                "text": paragraph["text"][:80],
                "observed": observed,
                "predicted": predicted,
            })

    total = len(paragraphs)
    return {
        "score": round(100.0 * agreements / total, 2),
        "paragraphs_analyzed": total,
        "agreements": agreements,
        "mean_confidence": round(confidence_total / total, 4),
        "classes": classes,
        "mismatches": mismatches,
    }


def score_flow_consistency(styles: list[str]) -> Optional[dict[str, Any]]:
    """
    Score how well the observed style sequence follows the learned flow.

    For every position the model predicts a distribution over the next style;
    the score is the mean probability it assigned to the style actually used.
    """
    loaded = load_flow_model()
    if loaded is None or len(styles) < 2:
        return None

    import torch

    model, vocab = loaded
    index_to_style = {index: style for style, index in vocab.items()}
    indices = [vocab.get(style, 0) for style in styles]

    window = min(len(indices) - 1, 64)
    history = indices[len(indices) - 1 - window:len(indices) - 1]
    if not history:
        return None

    with torch.no_grad():
        logits = model(torch.tensor([history], dtype=torch.long))
        probabilities = torch.softmax(logits[0], dim=0)

    target_index = indices[-1]
    predicted_index = int(probabilities.argmax(dim=0))
    predicted_style = index_to_style.get(predicted_index, "paragraph")

    return {
        "score": round(100.0 * float(probabilities[target_index]), 2),
        "transitions": len(indices) - 1,
        "window": window,
        "expected_next": predicted_style,
        "observed_next": styles[-1],
        "agrees": predicted_style == styles[-1],
    }


def score_rule_tier(checks: list[dict[str, Any]]) -> dict[str, Any]:
    """Turn Tier 1 check statuses into a weighted 0-100 compliance score."""
    if not checks:
        return {"score": 100.0, "passed": 0, "warned": 0, "failed": 0}

    earned = 0.0
    total_weight = 0.0
    passed = warned = failed = 0

    for check in checks:
        weight = float(check.get("weight", 1.0))
        total_weight += weight
        status = str(check.get("status", STATUS_FAIL))
        earned += weight * STATUS_SCORE.get(status, 0.0)
        if status == "pass":
            passed += 1
        elif status == "warn":
            warned += 1
        else:
            failed += 1

    return {
        "score": round(100.0 * earned / total_weight, 2) if total_weight else 100.0,
        "passed": passed,
        "warned": warned,
        "failed": failed,
    }


def score_ml_tier(
    style_result: Optional[dict[str, Any]], flow_result: Optional[dict[str, Any]]
) -> Optional[float]:
    """Blend the paragraph-style and document-flow scores into one ML score."""
    if style_result is None and flow_result is None:
        return None
    if style_result is None:
        return float(flow_result["score"])
    if flow_result is None:
        return float(style_result["score"])
    return round(
        STYLE_FLOW_SPLIT * float(style_result["score"])
        + (1 - STYLE_FLOW_SPLIT) * float(flow_result["score"]),
        2,
    )


def audit_document(
    content: str,
    page_setup: Optional[dict[str, Any]] = None,
    requirements: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Audit one document and return the hybrid compliance report.

    Tier 1 always runs. Tier 2 runs only when its models are installed; when
    they are not, `ml.available` is false and the aggregate score is the rule
    score, so the caller can tell "no style problems" apart from "style was
    never measured".
    """
    checks, paragraphs = run_rule_checks(content, page_setup or {}, requirements or {})
    rule_tier = score_rule_tier(checks)

    style_result = score_style_consistency(paragraphs)
    flow_result = score_flow_consistency(
        [map_observed_style(paragraph["style"]) for paragraph in paragraphs]
    )
    ml_score = score_ml_tier(style_result, flow_result)

    if ml_score is None:
        aggregate = rule_tier["score"]
    else:
        aggregate = round(RULE_WEIGHT * rule_tier["score"] + ML_WEIGHT * ml_score, 2)

    blocking = [
        str(check["name"])
        for check in checks
        if check.get("required") and check.get("status") == STATUS_FAIL
    ]

    return {
        "aggregate_score": aggregate,
        "rule_score": rule_tier["score"],
        "ml_score": ml_score,
        "rule_weight": RULE_WEIGHT,
        "ml_weight": ML_WEIGHT,
        "ready": aggregate >= READINESS_THRESHOLD and not blocking,
        "readiness_threshold": READINESS_THRESHOLD,
        "blocking_issues": blocking,
        "checks": checks,
        "summary": {
            "passed": rule_tier["passed"],
            "warned": rule_tier["warned"],
            "failed": rule_tier["failed"],
            "paragraphs": len(paragraphs),
        },
        "ml": {
            "available": ml_score is not None,
            "score": ml_score,
            "style": style_result,
            "flow": flow_result,
            "unavailable_reason": None if ml_score is not None else (
                "No compliance model is installed. Run ml/training/compliance_trainer.py "
                "to train the style and flow models; until then the audit uses rules only."
            ),
        },
    }
