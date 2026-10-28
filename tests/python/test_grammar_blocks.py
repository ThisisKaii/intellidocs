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


def grammar_issues(text: str) -> list[dict]:
    """Run the block grammar rules over one body paragraph."""
    return detect_block_issues(normalize_blocks([paragraph(text)]))


def capital_suggestions(text: str) -> list[dict]:
    """Return only the capitalisation issues for one body paragraph."""
    return [issue for issue in grammar_issues(text) if "capital" in issue["explanation"]]


def test_abbreviations_do_not_end_a_sentence() -> None:
    """A period after et al., Fig., e.g., U.S. or Mr. never forces a capital mid-sentence."""
    for text in (
        "Prior work (Smith et al. found similar results) supports this claim.",
        "See Fig. 3 for details about the architecture of the system.",
        "The cost was approx. five dollars, e.g. for the test devices.",
        "The U.S. government funded it for two years.",
        "Mr. santos and Ms. reyes reviewed it.",
    ):
        assert capital_suggestions(text) == [], text


def test_line_break_inside_a_sentence_is_not_a_boundary() -> None:
    """A soft line break in the middle of a sentence does not capitalise the next line."""
    assert capital_suggestions("The model was trained on\nthe dataset and then evaluated on the test set.") == []


def test_real_lowercase_sentence_start_is_still_flagged() -> None:
    """A genuinely lowercase sentence start after a full stop is still reported."""
    issues = capital_suggestions("The result is clear. however, more testing is needed.")
    assert [issue["suggestion"] for issue in issues] == ["However, more testing is needed."]


def test_lowercase_i_is_not_a_singular_subject() -> None:
    """'i think' must not become 'i thinks'."""
    assert all("thinks" not in issue["suggestion"] for issue in grammar_issues("i think the system is good."))


def test_tense_shift_does_not_cross_a_relative_clause() -> None:
    """'used python and react ..., which runs' is not a tense shift, but 'wrote ... and reads' is."""
    assert all(issue.get("source") != "pos" for issue in grammar_issues(
        "We used python and react to build the system, which runs on the cloud."
    ))
    assert any(issue.get("source") == "pos" for issue in grammar_issues("She wrote the report and reads it daily."))


def test_names_and_tech_terms_are_not_spelling_errors() -> None:
    """Capitalised mid-sentence names and mixed-case tech terms are left alone."""
    text = "We used Supabase, DuckDB, TipTap and Redis for the Mandaue campus."
    assert check_spelling(text)["issues"] == []


def test_real_typos_are_still_flagged_with_the_right_fix() -> None:
    """Misspelled ordinary words are reported and a whitelist term is offered as the fix."""
    issues = {issue["word"]: issue["suggestion"] for issue in check_spelling("The studnet recieved the datset.")["issues"]}
    assert issues["studnet"] == "student"
    assert issues["recieved"] == "received"
    assert issues["datset"] == "dataset"


LABELS = [
    "Juan A. Dela Cruz",
    "College of Computer Studies",
    "Room 102, Rizal Building, DepEd Complex, Pasig City 1600",
    "www.deped.gov.ph",
    "Website: www.deped.gov.ph",
    "usec.hrod@deped.gov.ph",
    "Prepared by:",
    "SCHOOLS DIVISION OF MANDAUE CITY",
]


def test_names_addresses_and_web_addresses_get_no_period_or_capital() -> None:
    """Text boxes hold names and links; none of them is a sentence missing its period."""
    for label in LABELS:
        assert grammar_issues(label) == [], label


SHORT_PHRASES = [
    "Members",
    "Group name",
    "Date submitted",
    "Prepared by",
    "Cost per unit",
    "Date of birth",
    "Name of the group leader",
    "Number of group members",
    "total number of respondents",
    "n/a",
]

NUMBERS = ["2", "10", "3.5", "2024", "$1,200", "45%", "2 - 3"]


def test_short_noun_phrases_get_no_period() -> None:
    """A field name or table heading is a phrase, not a sentence missing its period."""
    for phrase in SHORT_PHRASES:
        assert grammar_issues(phrase) == [], phrase


def test_numbers_get_no_period() -> None:
    for number in NUMBERS:
        assert grammar_issues(number) == [], number


def test_table_cell_text_is_never_read_as_prose() -> None:
    """Text in a table cell is a value or label, even when it looks like a short sentence."""
    cell = {"text": "the group meets weekly", "kind": "paragraph", "align": "left", "centered": False, "inCell": True}
    assert detect_block_issues(normalize_blocks([cell])) == []
    outside = {**cell, "inCell": False}
    assert detect_block_issues(normalize_blocks([outside])) != []


def test_short_sentences_are_still_flagged_when_they_have_a_verb() -> None:
    for sentence in ["Data is stored", "The group meets every week", "the report was submitted"]:
        issues = grammar_issues(sentence)
        assert any("punctuation" in issue["explanation"] or "capital" in issue["explanation"] for issue in issues), sentence


def test_a_real_sentence_missing_its_period_is_still_flagged() -> None:
    issues = grammar_issues("The system stores every document safely")
    assert any("punctuation" in issue["explanation"] for issue in issues)


def test_a_lowercase_sentence_with_a_link_is_still_checked() -> None:
    issues = grammar_issues("the report is published at the office website and the full text is free to download")
    assert any("capital" in issue["explanation"] for issue in issues)


def test_web_addresses_are_not_spelling_errors() -> None:
    text = "Visit www.deped.gov.ph or email usec.hrod@deped.gov.ph today."
    assert check_spelling(text)["issues"] == []
    assert check_spelling("www")["issues"] == []


def test_real_typos_next_to_a_link_are_still_flagged() -> None:
    words = {issue["word"] for issue in check_spelling("The studnet visited www.deped.gov.ph yesterday.")["issues"]}
    assert words == {"studnet"}
