"""Where a long manuscript is split into document tabs on import.

A manuscript over SPLIT_MIN_PAGES opens one tab at a time instead of laying out every page. It is
split at its chapters (front matter, one tab per chapter, each back-matter section), with the same
rules the editor's split offer uses (frontend/src/lib/chapters.ts, lib/documentTabs.ts). A tab still
over MAX_TAB_PAGES is split again at its next heading level, merging small neighbours back together,
and one with no headings left is cut at paragraph boundaries into parts.

Pages are estimated (the converter does not paginate): about CHARS_PER_PAGE characters of text a
page, plus a share of a page per picture, table row and paragraph. On a 1,447-page thesis the
estimate comes to within a few percent of Word's count, which is all the size limits need.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

SPLIT_MIN_PAGES = 100
MAX_TAB_PAGES = 60
# A piece smaller than this (a chapter's title line before its first heading) joins a neighbour.
MIN_TAB_PAGES = 3
CHARS_PER_PAGE = 1800
PICTURE_PAGES = 0.35
TABLE_ROW_PAGES = 1 / 30
PARAGRAPH_PAGES = 1 / 45
MAX_TITLE_CHARS = 60

_WORD_NUMBERS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
}
_CHAPTER_LINE = re.compile(
    r"^chapter\s+(\d+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\b\s*[:.\-–—]?\s*(.*)$",
    re.IGNORECASE,
)
_BACK_MATTER = re.compile(r"^(references|bibliography|works cited|literature cited|appendix|appendices|curriculum vitae)\b", re.IGNORECASE)
_MAX_LABEL_CHARS = 80
# Captions are often styled as headings; they never name a tab.
_CAPTION = re.compile(r"^(?:(?:figure|table|chart|plate|exhibit)\b|fig\.?\s*\d)", re.IGNORECASE)
_APPENDIX = re.compile(r"^(?i:appendix)\s+([A-Z0-9]{1,3})(?![a-z])")
_SMALL_WORDS = {"a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"}


@dataclass
class Block:
    """One top-level block of the body, as the converter walks it."""

    text: str
    # Heading level from the paragraph style (1-6), or None for body text and tables.
    heading: Optional[int] = None
    # The text holds a tab character (a contents line), so it is never a chapter label.
    has_tab: bool = False
    pictures: int = 0
    table_rows: int = 0
    is_paragraph: bool = True

    def pages(self) -> float:
        return (
            len(self.text) / CHARS_PER_PAGE
            + self.pictures * PICTURE_PAGES
            + self.table_rows * TABLE_ROW_PAGES
            + (PARAGRAPH_PAGES if self.is_paragraph else 0)
        )


def _roman(text: str) -> int:
    values = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}
    lower = text.lower()
    total = 0
    for index, char in enumerate(lower):
        value = values.get(char, 0)
        following = values.get(lower[index + 1], 0) if index + 1 < len(lower) else 0
        total += -value if value < following else value
    return total


def _label(block: Block) -> Optional[str]:
    if not block.is_paragraph or block.has_tab:
        return None
    text = re.sub(r"\s+", " ", block.text).strip()
    return text if text and len(text) <= _MAX_LABEL_CHARS else None


def chapter_opening(block: Block) -> Optional[Tuple[int, str]]:
    """(number, title after the number) when a block opens a chapter ("CHAPTER I: INTRODUCTION")."""
    text = _label(block)
    match = _CHAPTER_LINE.match(text) if text else None
    if not match:
        return None
    rest = match.group(2).strip()
    if re.search(r"\d\s*$", rest):  # a contents line ends in its page number
        return None
    raw = match.group(1).lower()
    number = int(raw) if raw.isdigit() else _WORD_NUMBERS.get(raw) or _roman(raw)
    return (number, rest) if number > 0 else None


def back_matter_opening(block: Block) -> Optional[str]:
    text = _label(block)
    if not text or re.search(r"\d\s*$", text):
        return None
    return text if _BACK_MATTER.match(text) else None


def title_case(text: str) -> str:
    """"REVIEW OF RELATED LITERATURE" → "Review of Related Literature"; mixed case is kept."""
    if text != text.upper():
        return text
    words = text.lower().split()
    return " ".join(word if index and word in _SMALL_WORDS else word[:1].upper() + word[1:] for index, word in enumerate(words))


def _short(title: str) -> str:
    title = re.sub(r"\s+", " ", title).strip()
    return title if len(title) <= MAX_TITLE_CHARS else title[: MAX_TITLE_CHARS - 1].rstrip() + "…"


def _following_title(blocks: List[Block], index: int) -> str:
    """The chapter's title from the line after "CHAPTER I", when it is a short heading-like line."""
    for following in range(index + 1, min(len(blocks), index + 3)):
        block = blocks[following]
        text = re.sub(r"\s+", " ", block.text).strip()
        if not text:
            continue
        title_like = block.heading is not None or (re.search(r"[A-Z]", text) is not None and text == text.upper())
        if title_like and len(text) <= 80 and not re.search(r"[.!?]$", text) and chapter_opening(block) is None:
            return text
        return ""
    return ""


def _chapter_tabs(blocks: List[Block]) -> Optional[List[Tuple[int, str]]]:
    """(start, title) of each tab of a chapter split, or None without two chapters."""
    chapters: List[Tuple[int, int, str]] = []
    for index, block in enumerate(blocks):
        opening = chapter_opening(block)
        if opening and all(number != opening[0] for _, number, _ in chapters):
            chapters.append((index, opening[0], opening[1] or _following_title(blocks, index)))
    if len(chapters) < 2:
        return None
    tabs: List[Tuple[int, str]] = []
    if any(block.text.strip() or block.pictures for block in blocks[: chapters[0][0]]):
        tabs.append((0, "Front matter"))
    for order, (index, number, title) in enumerate(chapters):
        start = 0 if order == 0 and not tabs else index
        tabs.append((start, f"Chapter {number}: {title_case(title)}" if title else f"Chapter {number}"))
    for index in range(chapters[-1][0] + 1, len(blocks)):
        label = back_matter_opening(blocks[index])
        if label:
            tabs.append((index, title_case(label)))
    return [tab for position, tab in enumerate(tabs) if position == 0 or tab[0] > tabs[position - 1][0]]


def _section_title(text: str) -> Optional[str]:
    """A heading's text when it names a section ("3.2 Data Analysis"), else None (a caption, a sentence)."""
    text = re.sub(r"\s+", " ", text).strip()
    if not text or len(text) > MAX_TITLE_CHARS or len(text.split()) > 10 or text.endswith(".") or _CAPTION.match(text):
        return None
    return title_case(text)


def _merge_appendices(blocks: List[Block], weights: List[float], tabs: List[Tuple[int, str]]) -> List[Tuple[int, str]]:
    """Neighbouring appendices share a tab while one of them is a stub: "Appendices A–C"."""
    out: List[Tuple[int, str, List[str]]] = []
    for position, (start, title) in enumerate(tabs):
        end = tabs[position + 1][0] if position + 1 < len(tabs) else len(blocks)
        letter = _APPENDIX.match(re.sub(r"\s+", " ", blocks[start].text).strip())
        if letter and out and out[-1][2]:
            first = out[-1][0]
            before = sum(weights[first:start])
            own = sum(weights[start:end])
            if (before < MIN_TAB_PAGES or own < MIN_TAB_PAGES) and before + own <= MAX_TAB_PAGES:
                letters = out[-1][2] + [letter.group(1)]
                out[-1] = (first, f"Appendices {letters[0]}–{letters[-1]}", letters)
                continue
        out.append((start, title, [letter.group(1)] if letter else []))
    return [(start, title) for start, title, _ in out]


def _by_size(blocks: List[Block], weights: List[float], start: int, end: int) -> List[Tuple[int, Optional[str]]]:
    """Parts of about MAX_TAB_PAGES, cut at paragraph boundaries (untitled: numbered by plan_tabs)."""
    total = sum(weights[start:end])
    parts = max(2, round(total / MAX_TAB_PAGES + 0.49))
    target = total / parts
    cuts = [start]
    running = 0.0
    for index in range(start, end):
        if running >= target and blocks[index].is_paragraph and len(cuts) < parts:
            cuts.append(index)
            running = 0.0
        running += weights[index]
    return [(cut, None) for cut in cuts]


def _split(
    blocks: List[Block], weights: List[float], start: int, end: int, title: Optional[str], level: int
) -> List[Tuple[int, Optional[str]]]:
    """A tab, split again while it is over MAX_TAB_PAGES. A piece is titled by the section heading it
    starts with, or left untitled (None) for plan_tabs to number as a part of its chapter."""
    if sum(weights[start:end]) <= MAX_TAB_PAGES:
        return [(start, title)]
    cuts: List[int] = []
    while level <= 6 and not cuts:
        cuts = [i for i in range(start + 1, end) if blocks[i].heading == level and blocks[i].text.strip()]
        level += 1
    if not cuts:
        pieces = _by_size(blocks, weights, start, end)
        return [(pieces[0][0], title)] + pieces[1:]

    bounds = [start] + cuts + [end]
    # Neighbours that fit in one tab together stay together, and a stub (a title line before the
    # first heading, a short closing section) always joins its neighbour.
    merged: List[Tuple[int, int]] = []
    for piece in zip(bounds, bounds[1:]):
        if merged:
            before = sum(weights[merged[-1][0]:merged[-1][1]])
            own = sum(weights[piece[0]:piece[1]])
            together = before + own
            if together <= MAX_TAB_PAGES or before < MIN_TAB_PAGES or (own < MIN_TAB_PAGES and together <= MAX_TAB_PAGES + MIN_TAB_PAGES):
                merged[-1] = (merged[-1][0], piece[1])
                continue
        merged.append(piece)
    out: List[Tuple[int, Optional[str]]] = []
    for number, (piece_start, piece_end) in enumerate(merged):
        piece_title = title if number == 0 else _section_title(blocks[piece_start].text)
        out.extend(_split(blocks, weights, piece_start, piece_end, piece_title, level))
    return out


def plan_tabs(blocks: List[Block]) -> Dict[int, str]:
    """{block index: tab title} for each tab a long manuscript starts; {} for one left whole."""
    weights = [block.pages() for block in blocks]
    if sum(weights) < SPLIT_MIN_PAGES:
        return {}
    tabs = _merge_appendices(blocks, weights, _chapter_tabs(blocks) or [(0, "Document")])
    planned: Dict[int, str] = {}
    for position, (start, title) in enumerate(tabs):
        end = tabs[position + 1][0] if position + 1 < len(tabs) else len(blocks)
        pieces = _split(blocks, weights, start, end, title, 1)
        # A chapter cut into untitled parts reads "Chapter 3: Methods (part 1)", "(part 2)", …
        numbered = len(pieces) > 1 and any(piece_title is None for _, piece_title in pieces)
        for number, (piece_start, piece_title) in enumerate(pieces):
            if numbered and (piece_title is None or piece_title == title):
                piece_title = f"{_short(title)} (part {number + 1})"
            planned[piece_start] = _short(piece_title or title)
    return planned if len(planned) >= 2 else {}
