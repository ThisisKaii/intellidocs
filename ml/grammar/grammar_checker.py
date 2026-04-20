import os
import pickle
import re
from typing import Any

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression


MODEL_PATH = os.getenv("GRAMMAR_MODEL_PATH", "ml/models/grammar_model.pkl")
DATASET_PATH = os.getenv(
    "GRAMMAR_DATASET_PATH",
    "ml/dataset/processed/grammar_examples.csv",
)

SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?])\s+")
WORD_PATTERN = re.compile(r"\b[\w']+\b", re.UNICODE)


def load_dataset(csv_path: str) -> pd.DataFrame:
    """Load the processed grammar dataset from disk."""
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Grammar dataset not found: {csv_path}")

    dataframe = pd.read_csv(csv_path)
    if dataframe.empty:
        raise ValueError("Grammar dataset is empty.")

    required_columns = {"source", "target"}
    if not required_columns.issubset(dataframe.columns):
        raise ValueError("Grammar dataset must contain 'source' and 'target' columns.")

    return dataframe


def build_training_frame(dataframe: pd.DataFrame) -> pd.DataFrame:
    """Build a binary grammar-quality dataset from source and corrected text."""
    positive_rows = dataframe[["target"]].copy()
    positive_rows["label"] = 1
    positive_rows = positive_rows.rename(columns={"target": "text"})

    negative_rows = dataframe[["source"]].copy()
    negative_rows["label"] = 0
    negative_rows = negative_rows.rename(columns={"source": "text"})

    training_frame = pd.concat([positive_rows, negative_rows], ignore_index=True)
    training_frame = training_frame.dropna()
    training_frame["text"] = training_frame["text"].astype(str).str.strip()
    training_frame = training_frame[training_frame["text"] != ""]
    return training_frame


def train_model(dataframe: pd.DataFrame) -> dict[str, Any]:
    """Train a simple grammar quality classifier."""
    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        max_features=12000,
    )
    features = vectorizer.fit_transform(dataframe["text"])
    labels = dataframe["label"]

    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(features, labels)

    return {
        "vectorizer": vectorizer,
        "model": model,
    }


def save_model(payload: dict[str, Any], output_path: str) -> None:
    """Save the grammar model payload to disk."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "wb") as file_handle:
        pickle.dump(payload, file_handle)


def load_model(model_path: str = MODEL_PATH) -> dict[str, Any]:
    """Load the grammar model payload from disk."""
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Grammar model not found: {model_path}")

    with open(model_path, "rb") as file_handle:
        payload = pickle.load(file_handle)

    if "vectorizer" not in payload or "model" not in payload:
        raise ValueError("Grammar model payload is invalid.")

    return payload


def score_text(text: str, model_path: str = MODEL_PATH) -> float:
    """Score text for grammar quality from 0.0 to 1.0."""
    payload = load_model(model_path)
    vectorizer: TfidfVectorizer = payload["vectorizer"]
    model: LogisticRegression = payload["model"]

    features = vectorizer.transform([text])
    probability = model.predict_proba(features)[0][1]
    return float(probability)


def build_issue(
    issue_type: str,
    original: str,
    suggestion: str,
    explanation: str,
) -> dict[str, str]:
    """Build a structured grammar issue payload."""
    return {
        "type": issue_type,
        "original": original,
        "suggestion": suggestion,
        "explanation": explanation,
    }


def detect_repeated_words(text: str) -> list[dict[str, str]]:
    """Detect repeated adjacent words."""
    issues: list[dict[str, str]] = []
    words = WORD_PATTERN.findall(text)

    for index in range(len(words) - 1):
        left = words[index]
        right = words[index + 1]
        if left.lower() == right.lower():
            issues.append(
                build_issue(
                    "grammar",
                    f"{left} {right}",
                    left,
                    "Repeated word detected.",
                )
            )

    return issues


def detect_article_mismatch(text: str) -> list[dict[str, str]]:
    """Detect simple a/an article mismatches."""
    issues: list[dict[str, str]] = []
    words = WORD_PATTERN.findall(text)

    for index in range(len(words) - 1):
        article = words[index].lower()
        noun = words[index + 1]
        if article not in {"a", "an"}:
            continue

        starts_with_vowel = noun[:1].lower() in {"a", "e", "i", "o", "u"}
        if article == "a" and starts_with_vowel:
            issues.append(
                build_issue(
                    "grammar",
                    f"{words[index]} {noun}",
                    f"an {noun}",
                    "Use 'an' before words that begin with a vowel sound.",
                )
            )
        elif article == "an" and not starts_with_vowel:
            issues.append(
                build_issue(
                    "grammar",
                    f"{words[index]} {noun}",
                    f"a {noun}",
                    "Use 'a' before words that begin with a consonant sound.",
                )
            )

    return issues


def detect_subject_verb_mismatch(text: str) -> list[dict[str, str]]:
    """Detect a few high-signal subject-verb agreement errors."""
    issues: list[dict[str, str]] = []
    normalized = " ".join(text.lower().split())

    pattern_map = {
        "this are": "this is",
        "that are": "that is",
        "he go": "he goes",
        "she go": "she goes",
        "it go": "it goes",
        "he have": "he has",
        "she have": "she has",
        "it have": "it has",
        "they goes": "they go",
        "we goes": "we go",
        "you goes": "you go",
    }

    for original, suggestion in pattern_map.items():
        if original in normalized:
            issues.append(
                build_issue(
                    "grammar",
                    original,
                    suggestion,
                    "Possible subject-verb agreement issue.",
                )
            )

    return issues


def detect_sentence_capitalization(text: str) -> list[dict[str, str]]:
    """Detect sentences that start with a lowercase letter."""
    issues: list[dict[str, str]] = []
    sentences = [segment.strip() for segment in SENTENCE_SPLIT_PATTERN.split(text.strip())]
    if not sentences:
        sentences = [text.strip()]

    for sentence in sentences:
        if not sentence:
            continue

        first_alpha = next((char for char in sentence if char.isalpha()), "")
        if first_alpha and first_alpha.islower():
            issues.append(
                build_issue(
                    "grammar",
                    sentence[: min(len(sentence), 40)],
                    first_alpha.upper() + sentence[sentence.index(first_alpha) + 1 :],
                    "Sentences should usually start with a capital letter.",
                )
            )

    return issues


def detect_missing_terminal_punctuation(text: str) -> list[dict[str, str]]:
    """Detect text that appears to be missing ending punctuation."""
    normalized = text.strip()
    if not normalized:
        return []

    if normalized.endswith((".", "!", "?")):
        return []

    return [
        build_issue(
            "grammar",
            normalized[-40:] if len(normalized) > 40 else normalized,
            f"{normalized}.",
            "Sentence may be missing ending punctuation.",
        )
    ]


def detect_issues(text: str) -> list[dict[str, str]]:
    """Run the baseline rule-based grammar checks."""
    issues: list[dict[str, str]] = []
    issues.extend(detect_repeated_words(text))
    issues.extend(detect_article_mismatch(text))
    issues.extend(detect_subject_verb_mismatch(text))
    issues.extend(detect_sentence_capitalization(text))
    issues.extend(detect_missing_terminal_punctuation(text))

    deduped: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for issue in issues:
        key = (issue["type"], issue["original"], issue["suggestion"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(issue)

    return deduped


def evaluate_text(text: str, model_path: str = MODEL_PATH) -> dict[str, Any]:
    """Return a grammar assessment payload with structured issues."""
    normalized = text.strip()
    if not normalized:
        return {
            "score": 0.0,
            "status": "empty",
            "message": "Text is required.",
            "issues": [],
        }

    issues = detect_issues(normalized)

    try:
        score = score_text(normalized, model_path)
    except Exception:
        score = 0.0

    if issues:
        status = "issues"
        message = f"Found {len(issues)} grammar issue(s)."
    elif score >= 0.8:
        status = "clean"
        message = "No grammar issues found by the baseline rules."
    elif score >= 0.55:
        status = "review"
        message = "No baseline grammar issues found, but the sentence may need review."
    else:
        status = "review"
        message = "No baseline grammar issues found, but the sentence quality looks weak."

    return {
        "score": score,
        "status": status,
        "message": message,
        "issues": issues,
    }


def main() -> None:
    """Train and save the grammar quality model."""
    dataframe = load_dataset(DATASET_PATH)
    training_frame = build_training_frame(dataframe)
    payload = train_model(training_frame)
    save_model(payload, MODEL_PATH)
    print(f"✅ Grammar model trained and saved to: {MODEL_PATH}")


if __name__ == "__main__":
    main()