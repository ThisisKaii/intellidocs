import re
from typing import Any

from spellchecker import SpellChecker


SPELL_PATTERN = re.compile(r"\b[a-zA-Z']+\b")
spellchecker = SpellChecker()


def extract_words(text: str) -> list[str]:
    """Extract candidate words from text for spell checking."""
    return SPELL_PATTERN.findall(text)


def build_issue(word: str, suggestion: str | None) -> dict[str, Any]:
    """Build a structured spelling issue payload."""
    return {
        "word": word,
        "suggestion": suggestion,
        "type": "spelling",
    }


def edit_distance(left: str, right: str) -> int:
    """Calculate a small Levenshtein edit distance for correction filtering."""
    previous_row = list(range(len(right) + 1))

    for left_index, left_char in enumerate(left, start=1):
        current_row = [left_index]

        for right_index, right_char in enumerate(right, start=1):
            insert_cost = current_row[right_index - 1] + 1
            delete_cost = previous_row[right_index] + 1
            replace_cost = previous_row[right_index - 1] + int(left_char != right_char)
            current_row.append(min(insert_cost, delete_cost, replace_cost))

        previous_row = current_row

    return previous_row[-1]


def is_reliable_correction(word: str, suggestion: str | None) -> bool:
    """Return true only when a correction is close enough to be actionable."""
    if suggestion is None:
        return False

    normalized_word = word.lower()
    normalized_suggestion = suggestion.lower()

    if normalized_word == normalized_suggestion:
        return False

    if abs(len(normalized_word) - len(normalized_suggestion)) > 1:
        return False

    distance = edit_distance(normalized_word, normalized_suggestion)
    return distance <= 2


def check_spelling(text: str) -> dict[str, Any]:
    """Return spelling issues and summary details for the given text."""
    normalized = text.strip()
    if not normalized:
      return {
          "issues": [],
          "count": 0,
          "message": "Text is required.",
      }

    words = extract_words(normalized)
    misspelled = sorted(spellchecker.unknown(words))

    issues: list[dict[str, Any]] = []
    for word in misspelled:
        correction = spellchecker.correction(word)
        suggestion = correction if is_reliable_correction(word, correction) else None
        issues.append(build_issue(word, suggestion))

    return {
        "issues": issues,
        "count": len(issues),
        "message": (
            "No spelling issues found."
            if not issues
            else f"Found {len(issues)} spelling issue(s)."
        ),
    }


def main() -> None:
    """Run a small local smoke test for the spell checker."""
    sample = "Thiss sentense has a spleling issue."
    result = check_spelling(sample)
    print(result)


if __name__ == "__main__":
    main()
