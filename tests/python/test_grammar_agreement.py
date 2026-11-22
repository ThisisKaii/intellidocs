"""Subject-verb agreement across a prepositional phrase ("The results of the test shows")."""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))

from grammar.grammar_checker import detect_pos_syntax_issues  # noqa: E402


def pairs(text: str) -> list[tuple[str, str]]:
    return [(issue["original"], issue["suggestion"]) for issue in detect_pos_syntax_issues(text)]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("The results of the test shows positive feedback.", ("results of the test shows", "results of the test show")),
        ("The respondents in the study was asked to answer.", ("respondents in the study was", "respondents in the study were")),
        ("The quality of the modules were reviewed.", ("quality of the modules were", "quality of the modules was")),
    ],
)
def test_flags_the_verb_that_disagrees_with_the_head_noun(text: str, expected: tuple[str, str]) -> None:
    assert expected in pairs(text)


@pytest.mark.parametrize(
    "text",
    [
        "The results of the test show positive feedback.",
        "The effect of the treatments is small.",
        "Data from the survey indicate a trend.",
    ],
)
def test_correct_agreement_is_not_flagged(text: str) -> None:
    assert pairs(text) == []


def test_adjacent_agreement_still_flagged() -> None:
    assert ("students goes", "students go") in pairs("The students goes home.")
