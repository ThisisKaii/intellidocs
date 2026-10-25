"""Tests for per-block grammar and spelling checks (title pages, headings, body text)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))

from grammar.grammar_checker import detect_block_issues  # noqa: E402
from grammar.blocks import normalize_blocks  # noqa: E402
from grammar.spell_checker import check_spelling  # noqa: E402


def centered(text: str) -> dict:
    """Build a centred paragraph block."""
    return {"text": text, "kind": "paragraph", "align": "center", "centered": True}


def paragraph(text: str) -> dict:
    """Build a left-aligned body paragraph block."""
    return {"text": text, "kind": "paragraph", "align": "left", "centered": False}


TITLE_PAGE = [
    centered("A Proposal Project"),
    centered("presented to the Faculty of the College of Computer Studies,"),
    centered("University of Cebu Lapu-Lapu and Mandaue"),
    centered("In partial Fulfillment of the Requirements"),
    centered("for the Degree of Bachelor of Science in Information Technology"),
    centered("Zurielle Quibranza"),
    centered("Jhoanna Mae Pacatang"),
]


def test_title_page_has_no_grammar_issues() -> None:
    """Staircase title-page lines produce no capitalisation or punctuation issues."""
    assert detect_block_issues(normalize_blocks(TITLE_PAGE)) == []


def test_title_page_names_are_not_spelling_errors() -> None:
    """Centred short lines are skipped by the spell checker."""
    assert check_spelling(TITLE_PAGE)["issues"] == []


def test_continuation_line_is_not_capitalised() -> None:
    """A longer centred line that continues an unfinished one is exempt."""
    blocks = [
        centered("A Proposal Project"),
        centered("presented to the Faculty of the College of Computer Studies and the Graduate School of the University of Cebu System"),
    ]
    assert detect_block_issues(normalize_blocks(blocks)) == []


def test_body_sentence_starting_lowercase_is_flagged() -> None:
    """A normal body paragraph starting lowercase is still flagged."""
    issues = detect_block_issues(normalize_blocks([paragraph("the system stores every document safely.")]))
    assert any("capital" in issue["explanation"] for issue in issues)


def test_headings_and_list_items_are_skipped() -> None:
    """Headings and list items are not treated as sentences."""
    blocks = [
        {"text": "background of the study", "kind": "heading", "align": "left", "centered": False},
        {"text": "collect user data", "kind": "listItem", "align": "left", "centered": False},
    ]
    assert detect_block_issues(normalize_blocks(blocks)) == []


def test_pos_rules_do_not_cross_blocks() -> None:
    """A noun ending one block and a verb starting the next are not read as a pair."""
    joined = detect_block_issues(normalize_blocks([paragraph("The students write papers about the dog."), paragraph("Run quickly to the lab now.")]))
    assert all(issue.get("source") != "pos" for issue in joined)


def test_plain_string_input_still_works() -> None:
    """The old plain-string input is split into one block per line."""
    issues = detect_block_issues(normalize_blocks("the system works well.\nIt is fast."))
    assert any("capital" in issue["explanation"] for issue in issues)
