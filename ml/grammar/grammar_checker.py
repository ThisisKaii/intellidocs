import os
import pickle
import re
import threading
from typing import Any, cast

import numpy as np
import pandas as pd
from scipy.sparse import hstack, csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
import nltk

from grammar.blocks import (
    continues_previous,
    has_web_address,
    is_prose_block,
    normalize_blocks,
)


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

SENTENCE_END_PATTERN = re.compile(r"(?<=[.!?])\s+")
DOTTED_ABBREVIATION_PATTERN = re.compile(r"[A-Za-z]{1,3}(?:\.[A-Za-z]{1,3})+\.?")
# Words whose trailing period does not end a sentence ("et al.", "Fig. 3", "Dr. Santos").
NON_TERMINAL_ABBREVIATIONS = frozenset({
    "al", "etc", "vs", "fig", "figs", "eq", "eqs", "no", "vol", "pp", "ch", "sec",
    "approx", "ca", "cf", "dr", "mr", "mrs", "ms", "prof", "st", "jr", "sr", "inc", "ltd",
})
# Words that open a clause and end the reach of the tense-shift search.
CLAUSE_BOUNDARY_WORDS = frozenset({
    "which", "that", "who", "whom", "whose", "because", "although",
})
WORD_PATTERN = re.compile(r"\b[\w']+\b", re.UNICODE)

# A block this short and capitalised like a name is an address, title or label, not a sentence.
LABEL_MAX_WORDS = 12
# Lowercase words that may sit inside a Title Case name or title ("College of Computer Studies").
LABEL_CONNECTORS = frozenset({"of", "and", "the", "for", "in", "on", "at", "to", "a", "an", "de", "la", "del", "y", "&"})

# A line this long reads as a sentence; a shorter one needs a verb to count as one.
SENTENCE_MIN_WORDS = 6
SHORT_PHRASE_MAX_WORDS = 3
# Helping and linking verbs: with one of these even a short line is a sentence ("Data is stored").
AUXILIARY_VERBS = frozenset({
    "is", "are", "was", "were", "be", "been", "being", "am",
    "has", "have", "had", "do", "does", "did",
    "will", "would", "can", "could", "shall", "should", "may", "might", "must",
})
# NLTK tags for a verb that can head a sentence.
VERB_TAGS = frozenset({"VB", "VBD", "VBP", "VBZ", "MD"})

ACADEMIC_KEYWORDS = frozenset({
    "abstract", "introduction", "methodology", "literature review",
    "results", "discussion", "conclusion", "references",
    "table of contents", "acknowledgments", "appendix", "appendices",
    "background", "related work", "future work", "summary",
    "chapter", "section", "appendix",
})


def is_academic_structural_block(text: str) -> bool:
    """Detect if a text block is an academic structural element (heading, title, TOC entry).

    Returns True for short lines that are chapter headings, numbered sections,
    or known academic section titles — even if they lack terminal punctuation.
    These blocks should NOT trigger grammar fragment or missing-period warnings.
    """
    lower = text.lower().strip()
    words = lower.split()
    if len(words) > 12 or lower.endswith((".", "!", "?")):
        return False

    # Chapter headings: "Chapter 1 Introduction", "Chapter Two"
    if lower.startswith("chapter"):
        return True

    # Numbered section headings: "1.0", "1.1", "1.1.1", "2.3.1", etc.
    if re.match(r"^(\d+(\.\d+)*)\s+", lower):
        return True

    # Roman numeral headings: "I.", "II.", "III.", "IV.", etc.
    if re.match(r"^(i{1,3}|iv|v|vi{0,3}|ix|x)\.\s*", lower):
        return True

    # Known academic section titles
    if lower in ACADEMIC_KEYWORDS:
        return True

    return False


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


# Loaded grammar models by path: unpickled once per process, then shared (read-only) by every request.
_CACHED_GRAMMAR_MODEL: dict[str, dict[str, Any]] = {}
_MODEL_LOCK = threading.Lock()


def load_model(model_path: str = MODEL_PATH) -> dict[str, Any]:
    """The grammar model payload, read from disk on first use and cached for the process."""
    cached = _CACHED_GRAMMAR_MODEL.get(model_path)
    if cached is not None:
        return cached
    with _MODEL_LOCK:
        cached = _CACHED_GRAMMAR_MODEL.get(model_path)
        if cached is None:
            cached = _read_model(model_path)
            _CACHED_GRAMMAR_MODEL[model_path] = cached
    return cached


def _read_model(model_path: str) -> dict[str, Any]:
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
    """Detect repeated adjacent words.

    Only words separated by spaces count: a hyphenated reduplication ("Lapu-Lapu", "so-so") is one word.
    """
    issues: list[dict[str, str]] = []
    matches = list(WORD_PATTERN.finditer(text))

    for index in range(len(matches) - 1):
        left = matches[index].group()
        right = matches[index + 1].group()
        between = text[matches[index].end():matches[index + 1].start()]
        if left.lower() == right.lower() and between.strip() == "":
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


def ends_with_abbreviation(segment: str) -> bool:
    """Return True when the segment's last word is an abbreviation, initial or dotted acronym."""
    words = segment.split()
    if not words or not words[-1].endswith("."):
        return False
    last_word = words[-1].lstrip("([{\"'“‘")
    core = last_word[:-1].lower()
    return (
        core in NON_TERMINAL_ABBREVIATIONS
        or (len(core) == 1 and core.isalpha())
        or bool(DOTTED_ABBREVIATION_PATTERN.fullmatch(last_word))
    )


def split_sentences(text: str) -> list[str]:
    """Split text into sentences without breaking on abbreviations or line wraps."""
    pieces = SENTENCE_END_PATTERN.split(" ".join(text.split()))
    sentences: list[str] = []
    for piece in pieces:
        if sentences and ends_with_abbreviation(sentences[-1]):
            sentences[-1] = f"{sentences[-1]} {piece}"
        else:
            sentences.append(piece)
    return [sentence.strip() for sentence in sentences]


# Characters that render as nothing; a line ending in "." followed by one of these still ends in ".".
INVISIBLE_TRAILING = "\u200b\u200c\u200d\u2060\ufeff\u00ad"
TERMINAL_MARKS = (".", "!", "?", "\u2026")
# A line ending in one of these is unfinished: the mark is replaced by a period, never followed by one.
REPLACEABLE_ENDINGS = (",", ";", ":")


def with_terminal_period(text: str) -> str:
    """The text ended with a period: a trailing comma, semicolon or colon is replaced, never doubled."""
    trimmed = text.rstrip()
    if trimmed.endswith(TERMINAL_MARKS):
        return trimmed
    if trimmed.endswith(REPLACEABLE_ENDINGS):
        return f"{trimmed[:-1].rstrip()}."
    return f"{trimmed}."


def detect_sentence_boundary_issues(text: str) -> list[dict[str, str]]:
    """Detect sentence capitalization and punctuation as grouped issues."""
    issues: list[dict[str, str]] = []
    normalized = text.strip().rstrip(INVISIBLE_TRAILING).strip()
    if not normalized:
        return issues

    sentences = split_sentences(normalized)
    if not sentences:
        sentences = [normalized]

    needs_terminal_punctuation = not normalized.endswith(TERMINAL_MARKS)
    final_sentence = sentences[-1] if sentences else normalized
    found_boundary_issue = False

    for sentence in sentences:
        if not sentence:
            continue

        # A segment that opens with a number ("3 for details") is a continuation.
        if sentence.lstrip("([{\"'“‘ ")[:1].isdigit():
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
            suggestion = with_terminal_period(suggestion)
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
                with_terminal_period(final_sentence),
                "Sentence may be missing ending punctuation.",
            )
        )

    return issues


_PHRASE_PREPOSITIONS = {"of", "in", "for", "from", "on", "with", "among", "about", "at", "by", "under", "within"}
# Tags allowed inside the prepositional phrase between the head noun and its verb.
_PHRASE_TAGS = {"DT", "JJ", "JJR", "JJS", "NN", "NNS", "NNP", "NNPS", "CD", "PRP$", "POS"}


def _object_of_preposition(tagged: list[tuple[str, str]], index: int) -> bool:
    """True when the noun at `index` ends a prepositional phrase ("of the treatments")."""
    position = index - 1
    while position >= 0 and tagged[position][1] in _PHRASE_TAGS:
        position -= 1
    return 0 <= position < index and tagged[position][0].lower() in _PHRASE_PREPOSITIONS


def _agreement_across_phrase(
    text: str, tagged: list[tuple[str, str]], to_singular: dict[str, str], to_plural: dict[str, str]
) -> list[dict[str, str]]:
    """Head noun + prepositional phrase + verb that disagrees with the head noun."""
    issues: list[dict[str, str]] = []
    for head in range(len(tagged) - 3):
        word, tag = tagged[head]
        if tag not in {"NN", "NNS", "NNP", "NNPS"}:
            continue
        before = tagged[head - 1][1] if head > 0 else None
        before_that = tagged[head - 2][0].lower() if head > 1 else None
        subject_position = head == 0 or (before in {"DT", "JJ", "PRP$", "CD"} and before_that not in _PHRASE_PREPOSITIONS)
        if not subject_position or tagged[head + 1][0].lower() not in _PHRASE_PREPOSITIONS:
            continue
        end = head + 2
        while end < len(tagged) and tagged[end][1] in _PHRASE_TAGS:
            end += 1
        if end >= len(tagged) or end == head + 2:
            continue
        verb, verb_tag = tagged[end]
        lowered = verb.lower()
        plural_head = tag in {"NNS", "NNPS"}
        past_be = verb_tag == "VBD" and lowered in {"was", "were"}
        if plural_head and (verb_tag == "VBZ" or past_be) and lowered in to_plural:
            fixed, message = to_plural[lowered], f"Subject '{word}' is plural; verb '{verb}' should be plural."
        elif not plural_head and (verb_tag in {"VBP", "VB"} or past_be) and lowered in to_singular:
            fixed, message = to_singular[lowered], f"Subject '{word}' is singular; verb '{verb}' should be singular."
        else:
            continue
        # The span as written in the text, from the head noun to the verb.
        pattern = r"\b" + r"\s+".join(re.escape(token) for token, _ in tagged[head:end + 1]) + r"\b"
        found = re.search(pattern, text)
        if not found:
            continue
        original = found.group(0)
        suggestion = original[: len(original) - len(verb)] + (fixed.capitalize() if verb.istitle() else fixed)
        issue = build_issue("grammar", original, suggestion, message)
        issue["source"] = "pos"
        issues.append(issue)
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
        if _object_of_preposition(tagged, i):
            continue  # "the effect of the treatments is": the verb agrees with "effect" (rule 1b)

        # Singular subject + Plural/Base Verb
        # NLTK tags a lowercase "i" as a noun; "i think" is not a singular subject.
        if ((t1 in {"NN", "NNP"} and w1_lower != "i") or (t1 == "PRP" and w1_lower in {"he", "she", "it"})) and (t2 in {"VBP", "VB"}):
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

    # 1b. Agreement across a prepositional phrase: "The results of the test shows" (the verb agrees
    # with "results", not with "test"). Only a noun in subject position (sentence start or after a
    # determiner/adjective that does not itself follow a preposition) is taken as the head.
    issues.extend(_agreement_across_phrase(text, tagged, VERB_TO_SINGULAR, VERB_TO_PLURAL))

    # 2. Coordinate structures tense shifts (e.g. "he ran and plays")
    is_verb = lambda t: t in {"VBD", "VBZ", "VBP"}
    for cc_idx in range(len(tagged)):
        w_cc, t_cc = tagged[cc_idx]
        if t_cc == "CC":
            # Search backward for a verb (up to 8 tokens back, stop at sentence boundary or another CC)
            v1_info = None
            for j in range(cc_idx - 1, max(-1, cc_idx - 9), -1):
                w_j, t_j = tagged[j]
                if w_j in {".", ";", "?", "!", ","} or t_j == "CC" or w_j.lower() in CLAUSE_BOUNDARY_WORDS:
                    break
                if is_verb(t_j):
                    v1_info = (w_j, t_j, j)
                    break
            
            # Search forward for a verb (up to 8 tokens forward, stop at sentence boundary or another CC)
            v2_info = None
            for j in range(cc_idx + 1, min(len(tagged), cc_idx + 9)):
                w_j, t_j = tagged[j]
                if w_j in {".", ";", "?", "!", ","} or t_j == "CC" or w_j.lower() in CLAUSE_BOUNDARY_WORDS:
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


def dedupe_issues(issues: list[dict[str, str]]) -> list[dict[str, str]]:
    """Drop repeated issues that share a type, original text and suggestion."""
    deduped: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for issue in issues:
        key = (issue["type"], issue["original"], issue["suggestion"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(issue)
    return deduped


def has_sentence_evidence(text: str) -> bool:
    """Return true when the text reads as a sentence rather than a noun phrase or a label.

    A line of six or more words is treated as a sentence. A shorter one needs a helping verb
    ("Data is stored"), or, at four or five words, a verb after its first word as tagged by NLTK
    ("Students submit their drafts"). Up to three words with no helping verb ("Group name",
    "Date submitted") is a label. If tagging fails the line is given the benefit of the doubt.
    """
    words = text.split()
    if len(words) >= SENTENCE_MIN_WORDS:
        return True
    lowered = {word.strip(".,;:!?()[]\"'“”‘’").lower() for word in words}
    if lowered & AUXILIARY_VERBS:
        return True
    if len(words) <= SHORT_PHRASE_MAX_WORDS:
        return False
    try:
        tagged = nltk.pos_tag(nltk.word_tokenize(text))
    except Exception:
        return True
    return any(tag in VERB_TAGS for _, tag in tagged[1:])


def looks_like_label(text: str) -> bool:
    """Return true for a name, number, address, web address, title or caption fragment: not a sentence.

    Text boxes, table cells and title blocks hold lines like "Juan A. Dela Cruz", "Group name", "2",
    "www.deped.gov.ph" or "Room 102, Rizal Building"; telling the writer to capitalise or end them
    with a period is wrong. A line counts when it has no letters at all, or is short and is a web
    address, ends with a colon, is all capitals or has every word capitalised (small connectors like
    "of" aside), or when it shows no sign of being a sentence (see has_sentence_evidence). Ordinary
    sentences have lowercase words and a verb, so they are never taken for labels.
    """
    stripped = text.strip()
    words = stripped.split()
    if not words:
        return False
    if not any(char.isalpha() for char in stripped):
        return True
    if len(words) <= LABEL_MAX_WORDS:
        if stripped.endswith(":") or has_web_address(stripped):
            return True
        lettered = [word for word in words if any(char.isalpha() for char in word)]
        if stripped.isupper() or all(
            word[0].isupper() or word.lower() in LABEL_CONNECTORS for word in lettered if word[0].isalpha()
        ):
            return True
    return not has_sentence_evidence(stripped)


_LINKING_OR_FINITE_VERBS = frozenset({
    "is", "was", "are", "were", "has", "have", "had",
    "will", "would", "can", "could", "did", "does",
    "looks", "look", "feels", "feel", "seems", "seem",
    "sounds", "sound", "became", "becomes", "got", "gets",
    "came", "went", "means", "mean",
})
_MONTH_EVENT_NOUNS = frozenset({
    "break", "class", "classes", "day", "deadline", "edition", "event",
    "exam", "holiday", "issue", "meeting", "month", "report", "results",
    "sale", "schedule", "session", "trip", "weather",
})
_POSSESSIVE_CONTEXT_NOUNS = frozenset({
    "adviser", "advisor", "answer", "bag", "book", "brother", "car",
    "classmate", "code", "dad", "document", "draft", "eyes", "family",
    "father", "fault", "friend", "friends", "goal", "groupmate", "hand",
    "head", "house", "idea", "laptop", "life", "mistake", "mom", "mother",
    "name", "opinion", "paper", "partner", "phone", "plan", "problem",
    "professor", "project", "question", "report", "research", "room",
    "sister", "study", "teacher", "thesis", "time", "turn", "work",
})
_PRECEDING_TRANSITIVE_OR_LINKING = frozenset({
    "are", "ask", "asked", "bought", "brought", "called", "checked",
    "closed", "did", "forgot", "found", "gave", "got", "hate", "helped",
    "is", "like", "lost", "love", "met", "need", "opened", "read", "saw",
    "see", "sent", "showed", "told", "took", "used", "visited", "want",
    "was", "were", "wrote",
})
_PREPOSITIONS = frozenset({
    "about", "at", "by", "for", "from", "in", "of", "on", "to", "with",
})
_COMPARATIVE_WORDS = frozenset({
    "better", "bigger", "easier", "faster", "fewer", "greater", "harder",
    "higher", "less", "longer", "lower", "more", "newer", "older",
    "other", "rather", "shorter", "slower", "smaller", "worse",
})
_CLAUSE_START_PREV = frozenset({".", "!", "?", ",", ";", ":", "that", "because", "if", "when", "since", "think", "know", "said"})


def _match_case(source_word: str, replacement: str) -> str:
    """Preserve title-case or all-caps when substituting a confused word."""
    if source_word.isupper() and len(source_word) > 1:
        return replacement.upper()
    if source_word[:1].isupper():
        return replacement.capitalize()
    return replacement


def _find_span_regex(text: str, words: list[str]) -> str | None:
    """Return the exact substring in `text` matching `words` separated by whitespace."""
    pattern = r"\b" + r"\s+".join(re.escape(w) for w in words) + r"\b"
    found = re.search(pattern, text)
    return found.group(0) if found else None


def detect_contextual_confusion_issues(text: str) -> list[dict[str, str]]:
    """Detect context-dependent word confusions (e.g., 'may name is' -> 'my name is')."""
    issues: list[dict[str, str]] = []
    try:
        tokens = nltk.word_tokenize(text)
        tagged = nltk.pos_tag(tokens)
    except Exception:
        return issues

    n = len(tagged)
    for i in range(n):
        w, _tag = tagged[i]
        wl = w.lower()
        prev_w = tagged[i - 1][0] if i > 0 else ""
        prev_wl = prev_w.lower()

        # 1. 'may' mistyped for possessive 'my'
        if wl == "may" and i + 1 < n:
            next_w, next_tag = tagged[i + 1]
            next_wl = next_w.lower()
            # Pattern A: "may <noun> <linking/finite verb>" (e.g., "hello may name is marjun")
            if i + 2 < n:
                third_w, _ = tagged[i + 2]
                third_wl = third_w.lower()
                is_noun_like = next_tag in {"NN", "NNS", "NNP", "NNPS"} or next_wl in _POSSESSIVE_CONTEXT_NOUNS
                month_phrase = w[0].isupper() and next_wl in _MONTH_EVENT_NOUNS
                if is_noun_like and third_wl in _LINKING_OR_FINITE_VERBS and not month_phrase and not next_w.isdigit():
                    original = _find_span_regex(text, [w, next_w, third_w])
                    if original:
                        sug_may = _match_case(w, "my")
                        suggestion = f"{sug_may} {next_w} {third_w}"
                        issue = build_issue(
                            "grammar",
                            original,
                            suggestion,
                            f"Use possessive '{sug_may}' before '{next_w}' instead of '{w}'.",
                        )
                        issue["source"] = "context"
                        issues.append(issue)
                        continue

            # Pattern B: "<linking/transitive verb | preposition> may <possessive noun>"
            # Require lowercase 'may' to avoid month phrases like "in May report".
            if (
                w == "may"
                and next_wl in _POSSESSIVE_CONTEXT_NOUNS
                and (prev_wl in _PRECEDING_TRANSITIVE_OR_LINKING or prev_wl in _PREPOSITIONS)
            ):
                original = _find_span_regex(text, [prev_w, w, next_w])
                if original:
                    suggestion = f"{prev_w} my {next_w}"
                    issue = build_issue(
                        "grammar",
                        original,
                        suggestion,
                        f"Use possessive 'my' before '{next_w}' instead of 'may'.",
                    )
                    issue["source"] = "context"
                    issues.append(issue)
                    continue

        # 2. 'their' vs 'there'
        if wl == "their" and i + 1 < n:
            next_w, _ = tagged[i + 1]
            if next_w.lower() in {"is", "are", "was", "were"}:
                original = _find_span_regex(text, [w, next_w])
                if original:
                    sug = _match_case(w, "there")
                    issue = build_issue(
                        "grammar",
                        original,
                        f"{sug} {next_w}",
                        f"Use '{sug}' before '{next_w}' instead of possessive '{w}'.",
                    )
                    issue["source"] = "context"
                    issues.append(issue)

        elif wl == "there" and i + 1 < n:
            next_w, next_tag = tagged[i + 1]
            next_wl = next_w.lower()
            if next_wl == "own" or (prev_wl in _PREPOSITIONS and next_tag in {"NN", "NNS"}):
                original = _find_span_regex(text, [prev_w, w, next_w]) if prev_wl in _PREPOSITIONS else _find_span_regex(text, [w, next_w])
                if original:
                    sug = _match_case(w, "their")
                    suggestion = f"{prev_w} {sug} {next_w}" if prev_wl in _PREPOSITIONS else f"{sug} {next_w}"
                    issue = build_issue(
                        "grammar",
                        original,
                        suggestion,
                        f"Use possessive '{sug}' before '{next_w}' instead of '{w}'.",
                    )
                    issue["source"] = "context"
                    issues.append(issue)

        # 3. 'your' vs 'you're'
        if wl == "your" and i + 1 < n:
            next_w, _ = tagged[i + 1]
            if next_w.lower() == "welcome":
                original = _find_span_regex(text, [w, next_w])
                if original:
                    sug = _match_case(w, "you're")
                    issue = build_issue(
                        "grammar",
                        original,
                        f"{sug} {next_w}",
                        f"Use '{sug}' (you are) instead of possessive '{w}'.",
                    )
                    issue["source"] = "context"
                    issues.append(issue)

        # 4. 'its' vs 'it's'
        if wl == "its" and i + 1 < n and (i == 0 or prev_wl in _CLAUSE_START_PREV):
            next_w, _ = tagged[i + 1]
            if next_w.lower() in {"a", "an", "not", "been", "going"}:
                original = _find_span_regex(text, [w, next_w])
                if original:
                    sug = _match_case(w, "it's")
                    issue = build_issue(
                        "grammar",
                        original,
                        f"{sug} {next_w}",
                        f"Use '{sug}' (it is/has) instead of possessive '{w}'.",
                    )
                    issue["source"] = "context"
                    issues.append(issue)

        elif wl == "it's" and i + 1 < n and tagged[i + 1][0].lower() == "own":
            next_w = tagged[i + 1][0]
            original = _find_span_regex(text, [w, next_w])
            if original:
                sug = _match_case(w, "its")
                issue = build_issue(
                    "grammar",
                    original,
                    f"{sug} {next_w}",
                    f"Use possessive '{sug}' before 'own' instead of '{w}'.",
                )
                issue["source"] = "context"
                issues.append(issue)

        # 5. 'then' after a comparative ('more then', 'better then', etc.)
        if wl == "then" and prev_wl in _COMPARATIVE_WORDS:
            original = _find_span_regex(text, [prev_w, w])
            if original:
                issue = build_issue(
                    "grammar",
                    original,
                    f"{prev_w} than",
                    f"Use 'than' for comparisons after '{prev_w}' instead of 'then'.",
                )
                issue["source"] = "context"
                issues.append(issue)

        # 6. 'were' mistyped for 'where' at clause start ("were are you", "were is the")
        if wl == "were" and i + 1 < n and (i == 0 or prev_wl in _CLAUSE_START_PREV):
            next_w, _ = tagged[i + 1]
            if next_w.lower() in {"is", "are", "was", "were", "did", "do", "does", "can", "could", "will", "would"}:
                original = _find_span_regex(text, [w, next_w])
                if original:
                    sug = _match_case(w, "where")
                    issue = build_issue(
                        "grammar",
                        original,
                        f"{sug} {next_w}",
                        f"Use '{sug}' for a question/location instead of '{w}'.",
                    )
                    issue["source"] = "context"
                    issues.append(issue)

        # 7. 'no' mistyped for 'know' ("I no that", "don't no")
        if wl == "no":
            if prev_wl == "n't" and i >= 2 and tagged[i - 2][0].lower() in {"do", "did", "does"}:
                contracted = f"{tagged[i - 2][0]}n't"
                original = _find_span_regex(text, [contracted, w])
                if original:
                    issue = build_issue(
                        "grammar",
                        original,
                        f"{contracted} know",
                        "Use the verb 'know' instead of 'no'.",
                    )
                    issue["source"] = "context"
                    issues.append(issue)
            elif prev_wl in {"i", "we", "you", "they", "not"} and (
                prev_wl == "not"
                or (i + 1 < n and tagged[i + 1][0].lower() in {"that", "what", "how", "why", "where", "when", "who", "if", "whether"})
            ):
                original = _find_span_regex(text, [prev_w, w])
                if original:
                    issue = build_issue(
                        "grammar",
                        original,
                        f"{prev_w} know",
                        "Use the verb 'know' instead of 'no'.",
                    )
                    issue["source"] = "context"
                    issues.append(issue)

    return issues


def detect_issues(text: str, check_boundaries: bool = True) -> list[dict[str, str]]:
    """Run the baseline rule-based grammar checks on one block of text.

    Academic structural blocks (chapter headings, numbered sections, etc.)
    bypass sentence boundary and fragment checks, and so do names, addresses and
    web addresses (see looks_like_label). Callers pass check_boundaries=False for
    lines that continue the block above.
    """
    issues: list[dict[str, str]] = []
    issues.extend(detect_repeated_words(text))
    issues.extend(detect_article_mismatch(text))
    issues.extend(detect_subject_verb_mismatch(text))
    issues.extend(detect_pos_syntax_issues(text))
    issues.extend(detect_contextual_confusion_issues(text))

    if check_boundaries and not is_academic_structural_block(text) and not looks_like_label(text):
        issues.extend(detect_sentence_boundary_issues(text))

    return dedupe_issues(issues)


def detect_block_issues(blocks: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Run the grammar rules block by block so nothing crosses a block boundary.

    Headings, list items and short centred lines are skipped, and a centred
    line that continues an unfinished centred line above it (staircase title
    pages) is exempt from capitalisation and punctuation checks.
    """
    issues: list[dict[str, str]] = []
    previous: dict[str, Any] | None = None
    for block in blocks:
        if is_prose_block(block):
            issues.extend(
                detect_issues(
                    block["text"],
                    check_boundaries=not continues_previous(block, previous) and not block.get("in_cell"),
                )
            )
        previous = block
    return dedupe_issues(issues)


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


def evaluate_text(source: Any, model_path: str = MODEL_PATH) -> dict[str, Any]:
    """Return a grammar assessment payload with structured issues.

    The source is either plain text (one block per line) or a list of
    {text, kind, align, centered} blocks.
    """
    blocks = normalize_blocks(source)
    normalized = "\n".join(block["text"] for block in blocks)
    if not normalized:
        return {
            "score": 0.0,
            "status": "empty",
            "message": "Text is required.",
            "issues": [],
        }

    issues = detect_block_issues(blocks)

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