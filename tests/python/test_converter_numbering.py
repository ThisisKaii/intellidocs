"""Numbered items whose marker the editor's own counter cannot draw are written out as literal text."""
import os
import re
import sys
from typing import List, Optional, Tuple

import docx
from lxml import etree

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))

from converter import _docx_document_to_result  # noqa: E402

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

# One level: (ilvl, numFmt, lvlText, extra XML such as <w:isLgl/> or <w:lvlRestart .../>, start)
Level = Tuple[int, str, str, str, int]

LEGAL: List[Level] = [
    (0, "decimal", "%1.", "", 1),
    (1, "decimal", "%1.%2", "", 1),
    (2, "decimal", "%1.%2.%3", "", 1),
]


def build(levels: List[Level], items: List[int], start_override: Optional[Tuple[int, int]] = None, num_id: int = 90) -> str:
    """HTML of a document with one list defined by `levels` and one paragraph per entry of `items` (its ilvl)."""
    document = docx.Document()
    numbering = document.part.numbering_part.element
    body = "".join(
        f'<w:lvl w:ilvl="{ilvl}"><w:start w:val="{start}"/><w:numFmt w:val="{fmt}"/>{extra}'
        f'<w:lvlText w:val="{text}"/><w:pPr><w:ind w:left="{720 * (ilvl + 1)}" w:hanging="360"/></w:pPr></w:lvl>'
        for ilvl, fmt, text, extra, start in levels
    )
    numbering.insert(0, etree.fromstring(f'<w:abstractNum xmlns:w="{W}" w:abstractNumId="{num_id}">{body}</w:abstractNum>'))
    override = ""
    if start_override:
        override = f'<w:lvlOverride w:ilvl="{start_override[0]}"><w:startOverride w:val="{start_override[1]}"/></w:lvlOverride>'
    numbering.append(etree.fromstring(f'<w:num xmlns:w="{W}" w:numId="{num_id}"><w:abstractNumId w:val="{num_id}"/>{override}</w:num>'))
    for index, ilvl in enumerate(items):
        paragraph = document.add_paragraph(f"Item {index}")
        paragraph._p.get_or_add_pPr().append(
            etree.fromstring(f'<w:numPr xmlns:w="{W}"><w:ilvl w:val="{ilvl}"/><w:numId w:val="{num_id}"/></w:numPr>')
        )
    return _docx_document_to_result(document)["html"]


def markers(html: str) -> List[Optional[str]]:
    """The literal marker of every list item, in order (None for an item drawn by the list's counter)."""
    return [m.group(1) if m else None for m in (re.search(r'data-marker="([^"]*)"', li) for li in re.findall(r"<li\b[^>]*>", html))]


def test_a_legal_outline_numbers_each_level_from_the_ones_above() -> None:
    html = build(LEGAL, [0, 1, 1, 2, 2, 0, 1, 2])
    # Level 0 is a plain "1." the list's counter draws; levels 1 and 2 are written out.
    assert markers(html) == [None, "1.1", "1.2", "1.2.1", "1.2.2", None, "2.1", "2.1.1"]


def test_a_deeper_counter_restarts_when_a_higher_level_advances() -> None:
    html = build(LEGAL, [0, 1, 1, 1, 0, 1])
    assert markers(html)[-1] == "2.1"


def test_a_level_set_to_keep_counting_does_not_restart() -> None:
    levels: List[Level] = [(0, "decimal", "%1.", "", 1), (1, "decimal", "%1.%2", '<w:lvlRestart w:val="0"/>', 1)]
    html = build(levels, [0, 1, 1, 0, 1])
    assert markers(html) == [None, "1.1", "1.2", None, "2.3"]


def test_a_list_restarted_at_a_number_starts_there() -> None:
    levels: List[Level] = [(0, "decimal", "%1.", "", 1)]
    html = build(levels, [0, 0], start_override=(0, 5))
    assert markers(html) == ["5.", "6."]


def test_a_list_that_starts_above_one_starts_there() -> None:
    levels: List[Level] = [(0, "decimal", "%1)", "", 3)]
    html = build(levels, [0, 0])
    assert markers(html) == ["3)", "4)"]


def test_a_legal_level_shows_the_levels_above_as_digits() -> None:
    levels: List[Level] = [(0, "upperRoman", "%1.", "", 1), (1, "decimal", "%1.%2", "<w:isLgl/>", 1)]
    html = build(levels, [0, 0, 1])
    assert markers(html)[-1] == "2.1"  # not "II.1"


def test_levels_in_letters_and_roman_numerals_are_written_in_those_formats() -> None:
    levels: List[Level] = [(0, "upperLetter", "%1.", "", 1), (1, "lowerRoman", "%1.%2", "", 1)]
    html = build(levels, [0, 0, 1, 1, 1, 1])
    assert markers(html)[2:] == ["B.i", "B.ii", "B.iii", "B.iv"]


def test_a_plain_list_still_uses_the_lists_own_counter() -> None:
    levels: List[Level] = [(0, "decimal", "%1.", "", 1), (1, "lowerLetter", "%2.", "", 1)]
    html = build(levels, [0, 1, 1, 0])
    assert markers(html) == [None, None, None, None]
    assert 'data-mx="' in html  # the geometry path is unchanged


def test_a_marker_that_is_not_plain_text_falls_back_to_the_lists_counter() -> None:
    levels: List[Level] = [(0, "decimal", "%1.", "", 1), (1, "decimal", "&quot;%1.%2&quot;", "", 1)]
    html = build(levels, [0, 1])
    assert markers(html) == [None, None]
