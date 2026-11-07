"""Title-page clauses, names and punctuation in the grammar and spelling checks (school-lab report)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))

from grammar import grammar_checker  # noqa: E402
from grammar.grammar_checker import detect_block_issues, with_terminal_period  # noqa: E402
from grammar.blocks import normalize_blocks  # noqa: E402
from grammar.spell_checker import check_spelling  # noqa: E402


def block(text: str, region: str | None = None, centered: bool = False) -> dict:
    """A paragraph block as the editor sends it."""
    return {"text": text, "kind": "paragraph", "align": "center" if centered else "left", "centered": centered, "region": region}


def issues(*blocks: dict) -> list[dict]:
    return detect_block_issues(normalize_blocks(list(blocks)))


def test_title_page_clauses_are_not_sentences() -> None:
    for text in (
        "presented to the Faculty of the College of Computer Studies.",
        "In partial Fulfillment of the Requirements",
        "for the Degree of Bachelor of Science in Information Technology",
        "University of Cebu Lapu-Lapu and Mandaue",
        "A Proposal Project",
    ):
        assert issues(block(text)) == [], text


def test_lines_the_editor_marks_as_title_page_or_approval_sheet_are_exempt() -> None:
    assert issues(block("recommended for approval and acceptance", region="approval_sheet")) == []
    assert issues(block("presented to the faculty", region="title_page")) == []


def test_ordinary_body_sentences_are_still_checked() -> None:
    found = issues(block("research shows that the students submit their drafts late"))
    assert [issue["suggestion"] for issue in found] == ["Research shows that the students submit their drafts late."]


def test_a_trailing_comma_becomes_a_period_instead_of_gaining_one() -> None:
    found = issues(block("They thanked the College of Computer Studies,"))
    assert [issue["suggestion"] for issue in found] == ["They thanked the College of Computer Studies."]
    assert with_terminal_period("Studies;") == "Studies."
    assert with_terminal_period("Studies.") == "Studies."


def test_an_ellipsis_or_invisible_character_never_gets_another_period() -> None:
    for text in ("the students waited for the results of the survey…", "the students waited for the results of the survey.​"):
        for issue in issues(block(text)):
            assert not issue["suggestion"].rstrip("​").endswith(("….", "..")), issue


def test_hyphenated_reduplication_is_not_a_repeated_word() -> None:
    assert issues(block("They visited Lapu-Lapu City and Mandaue last week to meet them.")) == []
    found = issues(block("They visited the the city last week to meet the adviser."))
    assert any(issue["original"] == "the the" for issue in found)


def test_student_and_adviser_names_are_not_spelling_errors() -> None:
    names = ["Amamence, Marjun A.", "Asingua, Joshua", "Alenton, Rj", "Dagupan, Christian Paulo", "Ms. Gian S. Mahusay", "By:", "Adviser"]
    assert check_spelling([block(name) for name in names])["issues"] == []
    assert check_spelling([block("Amamence Asingua", region="title_page")])["issues"] == []


def test_lowercase_typos_in_name_lines_and_body_text_are_still_found() -> None:
    assert [issue["word"] for issue in check_spelling([block("Amamence, Marjun A. teh leader")])["issues"]] == ["teh"]
    assert [issue["word"] for issue in check_spelling([block("The adviser, Ms. Gian Mahusay, approvd the plan.")])["issues"]] == ["approvd"]


def test_the_grammar_model_is_read_from_disk_once(monkeypatch) -> None:
    grammar_checker._CACHED_GRAMMAR_MODEL.clear()
    reads = []
    real = grammar_checker._read_model
    monkeypatch.setattr(grammar_checker, "_read_model", lambda path: reads.append(path) or real(path))
    model_path = os.path.join(os.path.dirname(__file__), "..", "..", "ml", "models", "grammar_model.pkl")
    first = grammar_checker.load_model(model_path)
    second = grammar_checker.load_model(model_path)
    assert first is second and len(reads) == 1
