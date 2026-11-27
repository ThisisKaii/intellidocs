"""Context-aware word confusion checks (e.g., 'hello may name is marjun' -> 'my name is')."""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))

from grammar.grammar_checker import detect_contextual_confusion_issues, detect_issues  # noqa: E402


def context_pairs(text: str) -> list[tuple[str, str]]:
    return [(issue["original"], issue["suggestion"]) for issue in detect_contextual_confusion_issues(text)]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("hello may name is marjun", ("may name is", "my name is")),
        ("May friend is coming over today.", ("May friend is", "My friend is")),
        ("This is may thesis draft.", ("is may thesis", "is my thesis")),
        ("Their is a problem with the build.", ("Their is", "There is")),
        ("They left it in there house.", ("in there house", "in their house")),
        ("It is better then yesterday.", ("better then", "better than")),
        ("Your welcome to join us.", ("Your welcome", "You're welcome")),
        ("Its a great day to test.", ("Its a", "It's a")),
        ("Were are you going?", ("Were are", "Where are")),
        ("I don't no what happened.", ("don't no", "don't know")),
    ],
)
def test_flags_context_dependent_confusions(text: str, expected: tuple[str, str]) -> None:
    assert expected in context_pairs(text)
    full_pairs = [(i["original"], i["suggestion"]) for i in detect_issues(text)]
    assert expected in full_pairs


@pytest.mark.parametrize(
    "text",
    [
        "You may go home early today.",
        "The May report is due tomorrow.",
        "Hello, my name is Marjun.",
        "There is a book on their desk.",
        "First we ate, then we studied.",
        "We were happy with where we stayed.",
        "I have no idea what happened.",
    ],
)
def test_valid_sentences_are_not_flagged(text: str) -> None:
    assert context_pairs(text) == []
