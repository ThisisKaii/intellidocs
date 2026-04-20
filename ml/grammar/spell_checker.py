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
        suggestion = spellchecker.correction(word)
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
