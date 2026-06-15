import os
import pickle
import re
from typing import Any, cast

import numpy as np
import pandas as pd
from scipy.sparse import hstack, csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
import nltk


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
        ngram_range=(1, 3),
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


def detect_pos_syntax_issues(text: str) -> list[dict[str, str]]:
    """Detect subject-verb mismatch and tense shifts using NLTK POS tagging."""
    issues: list[dict[str, str]] = []

    VERB_TO_SINGULAR = {
        "have": "has", "go": "goes", "do": "does", "run": "runs", "write": "writes",
        "read": "reads", "make": "makes", "say": "says", "want": "wants", "need": "needs",
        "think": "thinks", "find": "finds", "give": "gives", "tell": "tells", "work": "works",
        "call": "calls", "try": "tries", "ask": "asks", "feel": "feels", "leave": "leaves",
        "keep": "keeps", "seem": "seems", "show": "shows", "know": "knows", "take": "takes",
        "come": "comes", "are": "is", "were": "was",
    }
    VERB_TO_PLURAL = {v: k for k, v in VERB_TO_SINGULAR.items() if k != "were"}
    VERB_TO_PLURAL.update({"is": "are", "was": "were"})

    PAST_TO_PRESENT = {
        "ran": "runs", "played": "plays", "wrote": "writes", "read": "reads", "made": "makes",
        "said": "says", "wanted": "wants", "needed": "needs", "thought": "thinks", "found": "finds",
        "gave": "gives", "told": "tells", "worked": "works", "called": "calls", "tried": "tries",
        "asked": "asks", "felt": "feels", "left": "leaves", "kept": "keeps", "seemed": "seems",
        "showed": "shows", "knew": "knows", "took": "takes", "came": "comes", "was": "is",
        "were": "are", "went": "goes", "did": "does", "had": "has",
    }
    PRESENT_TO_PAST = {v: k for k, v in PAST_TO_PRESENT.items()}
    PAST_TO_PRESENT_PLURAL = {
        "ran": "run", "played": "play", "wrote": "write", "read": "read", "made": "make",
        "said": "say", "wanted": "want", "needed": "need", "thought": "think", "found": "find",
        "gave": "give", "told": "tell", "worked": "work", "called": "call", "tried": "try",
        "asked": "ask", "felt": "feel", "left": "leave", "kept": "keep", "seemed": "seem",
        "showed": "show", "knew": "know", "took": "take", "came": "come", "was": "were",
        "were": "are", "went": "go", "did": "do", "had": "have",
    }

    try:
        tokens = nltk.word_tokenize(text)
        tagged = nltk.pos_tag(tokens)
    except Exception as e:
        print(f"[grammar_checker] NLTK tokenization/tagging failed: {e}")
        return issues

    # 1. Subject-verb agreement
    for i in range(len(tagged) - 1):
        w1, t1 = tagged[i]
        w2, t2 = tagged[i+1]
        w1_lower = w1.lower()
        w2_lower = w2.lower()

        # Singular subject + Plural/Base Verb
        if (t1 in {"NN", "NNP"} or (t1 == "PRP" and w1_lower in {"he", "she", "it"})) and (t2 in {"VBP", "VB"}):
            if w2_lower in VERB_TO_SINGULAR:
                sug_verb = VERB_TO_SINGULAR[w2_lower]
                if w2.istitle():
                    sug_verb = sug_verb.capitalize()
                issue = build_issue(
                    "grammar",
                    f"{w1} {w2}",
                    f"{w1} {sug_verb}",
                    f"Subject '{w1}' is singular; verb '{w2}' should be singular."
                )
                issue["source"] = "pos"
                issues.append(issue)

        # Plural subject + Singular Verb
        elif (t1 in {"NNS", "NNPS"} or (t1 == "PRP" and w1_lower in {"they", "we", "you"})) and (t2 == "VBZ"):
            if w2_lower in VERB_TO_PLURAL:
                sug_verb = VERB_TO_PLURAL[w2_lower]
                if w2.istitle():
                    sug_verb = sug_verb.capitalize()
                issue = build_issue(
                    "grammar",
                    f"{w1} {w2}",
                    f"{w1} {sug_verb}",
                    f"Subject '{w1}' is plural; verb '{w2}' should be plural."
                )
                issue["source"] = "pos"
                issues.append(issue)

    # 2. Coordinate structures tense shifts (e.g. "he ran and plays")
    # 2. Coordinate structures tense shifts (e.g. "he ran and plays")
    is_verb = lambda t: t in {"VBD", "VBZ", "VBP"}
    for cc_idx in range(len(tagged)):
        w_cc, t_cc = tagged[cc_idx]
        if t_cc == "CC":
            # Search backward for a verb (up to 8 tokens back, stop at sentence boundary or another CC)
            v1_info = None
            for j in range(cc_idx - 1, max(-1, cc_idx - 9), -1):
                w_j, t_j = tagged[j]
                if w_j in {".", ";", "?", "!"} or t_j == "CC":
                    break
                if is_verb(t_j):
                    v1_info = (w_j, t_j, j)
                    break
            
            # Search forward for a verb (up to 8 tokens forward, stop at sentence boundary or another CC)
            v2_info = None
            for j in range(cc_idx + 1, min(len(tagged), cc_idx + 9)):
                w_j, t_j = tagged[j]
                if w_j in {".", ";", "?", "!"} or t_j == "CC":
                    break
                if is_verb(t_j):
                    v2_info = (w_j, t_j, j)
                    break
            
            if v1_info and v2_info:
                w1, t1, idx1 = v1_info
                w3, t3, idx3 = v2_info
                
                # Inconsistent past/present shift
                if (t1 == "VBD" and t3 in {"VBZ", "VBP"}) or (t1 in {"VBZ", "VBP"} and t3 == "VBD"):
                    w3_lower = w3.lower()
                    sug_verb = None
                    if t1 == "VBD": # Suggest changing second to past
                        if w3_lower in PRESENT_TO_PAST:
                            sug_verb = PRESENT_TO_PAST[w3_lower]
                    else: # Suggest changing second to present (match t1 singular/plural)
                        if t1 == "VBZ":
                            if w3_lower in PAST_TO_PRESENT:
                                sug_verb = PAST_TO_PRESENT[w3_lower]
                        else:
                            if w3_lower in PAST_TO_PRESENT_PLURAL:
                                sug_verb = PAST_TO_PRESENT_PLURAL[w3_lower]
                    
                    if sug_verb:
                        if w3.istitle():
                            sug_verb = sug_verb.capitalize()
                        
                        original_phrase = " ".join([tagged[k][0] for k in range(idx1, idx3 + 1)])
                        suggestion_phrase = " ".join([tagged[k][0] if k != idx3 else sug_verb for k in range(idx1, idx3 + 1)])
                        
                        issue = build_issue(
                            "grammar",
                            original_phrase,
                            suggestion_phrase,
                            f"Inconsistent tense shift: '{w3}' should match the tense of '{w1}'."
                        )
                        issue["source"] = "pos"
                        issues.append(issue)

    return issues


def detect_issues(text: str) -> list[dict[str, str]]:
    """Run the baseline rule-based grammar checks."""
    issues: list[dict[str, str]] = []
    issues.extend(detect_repeated_words(text))
    issues.extend(detect_article_mismatch(text))
    issues.extend(detect_subject_verb_mismatch(text))
    issues.extend(detect_pos_syntax_issues(text))
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

    # Separate POS and baseline rule issues
    pos_issues = [iss for iss in issues if iss.get("source") == "pos"]
    rule_issues = [iss for iss in issues if iss.get("source") != "pos"]

    # N-gram score stretched to 0-1
    floor = 0.0
    ceiling = 0.60
    ngram_score = (raw_score - floor) / max(ceiling - floor, 0.01)
    ngram_score = max(0.0, min(1.0, ngram_score))

    # Penalties
    rule_penalty = len(rule_issues) * 0.12
    pos_penalty = len(pos_issues) * 0.18

    # Composite score
    score = max(0.0, ngram_score - rule_penalty - pos_penalty)
    score = round(score, 4)

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