import os
import pickle
import re
from typing import Any, cast

import numpy as np
import pandas as pd
from scipy.sparse import hstack, csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression


MODEL_PATH = os.getenv("GRAMMAR_MODEL_PATH", "models/grammar_model.pkl")
DATASET_PATH = os.getenv(
    "GRAMMAR_DATASET_PATH",
    "dataset/processed/grammar_examples.csv",
)

COMMON_ARTICLES = {"a", "an", "the"}
VOWELS = {"a", "e", "i", "o", "u"}
SUBJECT_VERB_ERRORS = {
    "he go", "she go", "it go",
    "he have", "she have", "it have",
    "this are", "that are",
    "they goes", "we goes", "you goes",
    "i is", "i has",
}

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


def extract_grammar_features(text: str) -> list[float]:
    """Compute structural grammar features for a single text."""
    words = WORD_PATTERN.findall(text)
    word_count = max(len(words), 1)
    stripped = text.strip()
    lower_words = [w.lower() for w in words]

    # 1. Starts with uppercase letter
    first_alpha = next((c for c in stripped if c.isalpha()), "")
    starts_upper = float(first_alpha.isupper()) if first_alpha else 0.0

    # 2. Ends with terminal punctuation
    ends_punct = float(stripped.endswith((".", "!", "?"))) if stripped else 0.0

    # 3. Average word length (very short = fragments, very long = nonsense)
    avg_word_len = sum(len(w) for w in words) / word_count if words else 0.0
    avg_word_len_norm = min(avg_word_len / 10.0, 1.0)

    # 4. Ratio of repeated adjacent words
    repeats = sum(
        1 for i in range(len(lower_words) - 1)
        if lower_words[i] == lower_words[i + 1]
    )
    repeat_ratio = repeats / word_count

    # 5. Article-noun agreement errors (a + vowel, an + consonant)
    article_errors = 0
    for i in range(len(lower_words) - 1):
        art = lower_words[i]
        nxt = lower_words[i + 1]
        if art == "a" and nxt and nxt[0] in VOWELS:
            article_errors += 1
        elif art == "an" and nxt and nxt[0] not in VOWELS:
            article_errors += 1
    article_error_ratio = article_errors / word_count

    # 6. Subject-verb disagreement count
    joined = " ".join(lower_words)
    sv_errors = sum(1 for pat in SUBJECT_VERB_ERRORS if pat in joined)
    sv_error_ratio = sv_errors / word_count

    # 7. Punctuation density (well-formed prose has moderate punctuation)
    punct_count = sum(1 for c in stripped if not c.isalnum() and not c.isspace())
    punct_ratio = punct_count / max(len(stripped), 1)

    # 8. Capitalization ratio (overcapitalized text = quality issue)
    upper_count = sum(1 for c in stripped if c.isupper())
    upper_ratio = upper_count / max(len(stripped), 1)

    return [
        starts_upper,
        ends_punct,
        avg_word_len_norm,
        repeat_ratio,
        article_error_ratio,
        sv_error_ratio,
        punct_ratio,
        upper_ratio,
    ]


GRAMMAR_FEATURE_NAMES = [
    "starts_upper", "ends_punct", "avg_word_len_norm",
    "repeat_ratio", "article_error_ratio", "sv_error_ratio",
    "punct_ratio", "upper_ratio",
]


def build_training_frame(dataframe: pd.DataFrame) -> pd.DataFrame:
    """Build a binary grammar-quality dataset from source and corrected text."""
    positive_rows = pd.DataFrame(
        {
            "text": dataframe["target"].astype(str),
            "label": 1,
        }
    )
    negative_rows = pd.DataFrame(
        {
            "text": dataframe["source"].astype(str),
            "label": 0,
        }
    )

    training_frame = pd.concat([positive_rows, negative_rows], ignore_index=True)
    training_frame = training_frame.dropna(subset=["text"])
    training_frame["text"] = training_frame["text"].astype(str).str.strip()
    filtered_frame = training_frame[training_frame["text"] != ""].copy()
    return cast(pd.DataFrame, filtered_frame)


def build_structural_matrix(texts: pd.Series) -> csr_matrix:
    """Compute structural grammar features for all training texts."""
    rows = [extract_grammar_features(t) for t in texts]
    return csr_matrix(np.array(rows, dtype=np.float64))


def train_model(dataframe: pd.DataFrame) -> dict[str, Any]:
    """Train a grammar quality classifier using TF-IDF and structural features."""
    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        max_features=12000,
    )
    tfidf_features = vectorizer.fit_transform(dataframe["text"])
    structural_features = build_structural_matrix(dataframe["text"])
    combined = hstack([tfidf_features, structural_features])
    labels = dataframe["label"]

    model = LogisticRegression(max_iter=1000, random_state=42, C=0.5)
    model.fit(combined, labels)

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

    tfidf_features = vectorizer.transform([text])
    structural_features = csr_matrix(
        np.array([extract_grammar_features(text)], dtype=np.float64)
    )
    combined = hstack([tfidf_features, structural_features])
    probability = model.predict_proba(combined)[0][1]
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
        # Use word boundaries to avoid false positives like
        # "she goes" matching the "he go" pattern.
        pattern = r"\b" + re.escape(original) + r"\b"
        if re.search(pattern, normalized):
            issues.append(
                build_issue(
                    "grammar",
                    original,
                    suggestion,
                    "Possible subject-verb agreement issue.",
                )
            )

    return issues


def detect_sentence_boundary_issues(text: str) -> list[dict[str, str]]:
    """Detect sentence capitalization and punctuation as grouped issues."""
    issues: list[dict[str, str]] = []
    normalized = text.strip()
    if not normalized:
        return issues

    sentences = [segment.strip() for segment in SENTENCE_SPLIT_PATTERN.split(normalized)]
    if not sentences:
        sentences = [normalized]

    needs_terminal_punctuation = not normalized.endswith((".", "!", "?"))
    final_sentence = sentences[-1] if sentences else normalized
    found_boundary_issue = False

    for sentence in sentences:
        if not sentence:
            continue

        first_alpha = next((char for char in sentence if char.isalpha()), "")
        if not first_alpha or not first_alpha.islower():
            continue

        first_alpha_index = sentence.index(first_alpha)
        suggestion = (
            sentence[:first_alpha_index]
            + first_alpha.upper()
            + sentence[first_alpha_index + 1 :]
        )
        explanation = "Sentences should usually start with a capital letter."

        if sentence == final_sentence and needs_terminal_punctuation:
            suggestion = f"{suggestion}."
            explanation = (
                "Sentence should start with a capital letter and end with punctuation."
            )

        found_boundary_issue = True
        issues.append(
            build_issue(
                "grammar",
                sentence,
                suggestion,
                explanation,
            )
        )

    if needs_terminal_punctuation and not found_boundary_issue:
        issues.append(
            build_issue(
                "grammar",
                final_sentence,
                f"{final_sentence}.",
                "Sentence may be missing ending punctuation.",
            )
        )

    return issues


def detect_issues(text: str) -> list[dict[str, str]]:
    """Run the baseline rule-based grammar checks."""
    issues: list[dict[str, str]] = []
    issues.extend(detect_repeated_words(text))
    issues.extend(detect_article_mismatch(text))
    issues.extend(detect_subject_verb_mismatch(text))
    issues.extend(detect_sentence_boundary_issues(text))

    deduped: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for issue in issues:
        key = (issue["type"], issue["original"], issue["suggestion"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(issue)

    return deduped


def calibrate_score(raw_score: float, issue_count: int) -> float:
    """Map the raw model probability to an intuitive 0-1 quality score.

    The JFLEG-trained model outputs probabilities in a narrow band
    (roughly 0.0-0.6 for most inputs). This function rescales to
    fill the full 0-1 range and penalizes detected rule-based issues.
    """
    # Rescale: model floor ~0.0, ceiling ~0.60
    floor = 0.0
    ceiling = 0.60
    stretched = (raw_score - floor) / max(ceiling - floor, 0.01)
    stretched = max(0.0, min(1.0, stretched))

    # Penalize for detected rule-based issues
    if issue_count > 0:
        penalty = min(issue_count * 0.15, 0.6)
        stretched = max(0.0, stretched - penalty)

    return round(stretched, 4)


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
        raw_score = score_text(normalized, model_path)
    except Exception as scoring_error:
        print(f"[grammar_checker] score_text failed: {scoring_error}")
        raw_score = 0.0

    score = calibrate_score(raw_score, len(issues))

    if issues:
        status = "issues"
        message = f"Found {len(issues)} grammar issue(s)."
    elif score >= 0.8:
        status = "clean"
        message = "No grammar issues found."
    elif score >= 0.55:
        status = "review"
        message = "No grammar issues found, but the sentence may need review."
    else:
        status = "review"
        message = "No grammar issues found, but the sentence quality looks weak."

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