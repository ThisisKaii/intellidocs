"""How closely the editor lays out an imported file the way Word does: paragraphs on Word's page.

Pure functions, no browser and no Word, so the metric itself is unit tested.

Word's truth (tests/e2e/tools/word_truth.ps1) gives each paragraph's page. The editor's rows
give each top-level block's page. Paragraphs are paired by their opening text in document
order, and the score is how many paired paragraphs sit on the page Word puts them on.

Unlike a page-by-page image comparison, one early slip does not fail every later page: a
paragraph only counts as wrong while it really is on a different page.

Excluded on purpose:
- Empty and very short paragraphs: their opening text cannot be matched reliably.
- Table-cell paragraphs: the editor measures top-level blocks, so cells would never pair.
Only the page is compared, never the vertical position: measuring the first text line in the
editor against Word's line top carries a constant offset of about 3pt.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Sequence

# A paragraph needs at least this many key characters to be matched.
MIN_KEY_CHARS = 4
# Key length used for matching: long enough to tell paragraphs apart, short enough to survive
# small text differences further along a paragraph.
KEY_CHARS = 22
# How far ahead in the editor's rows a Word paragraph is searched for, so a gap (a paragraph
# one side lacks) is skipped without pairing distant look-alike text.
LOOKAHEAD = 40

_CONTROL = re.compile(r"[\x00-\x1f\x7f​﻿]")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def key(text: str) -> str:
    """Comparable form of a paragraph's opening text: lower-case letters and digits only."""
    return _NON_ALNUM.sub("", _CONTROL.sub(" ", text).lower())[:KEY_CHARS]


def word_rows(truth: dict) -> list[dict]:
    """The Word paragraphs the metric uses: matchable text, outside tables."""
    return [
        p for p in truth.get("paragraphs", [])
        if not p.get("in_table") and len(key(p.get("text", ""))) >= MIN_KEY_CHARS
    ]


def align(word: Sequence[dict], editor: Sequence[dict]) -> list[tuple[dict, dict]]:
    """Pair Word paragraphs with editor rows in document order, resyncing across gaps.

    Each Word paragraph takes the first editor row ahead of the last pairing with the same key,
    looking at most LOOKAHEAD rows ahead. A paragraph with no partner is left unpaired.
    """
    pairs: list[tuple[dict, dict]] = []
    keys = [key(row.get("text", "")) for row in editor]
    pointer = 0
    for paragraph in word:
        wanted = key(paragraph.get("text", ""))
        if len(wanted) < MIN_KEY_CHARS:
            continue
        for j in range(pointer, min(len(editor), pointer + LOOKAHEAD)):
            if keys[j] == wanted:
                pairs.append((paragraph, editor[j]))
                pointer = j + 1
                break
    return pairs


@dataclass
class Score:
    """The metric for one file."""

    word_paragraphs: int
    aligned: int
    same_page: int
    word_pages: int
    editor_pages: int
    first_divergence: dict | None = None
    # Editor page minus Word's, at the first paired paragraph of each Word page.
    page_offsets: dict[int, int] = field(default_factory=dict)

    @property
    def ratio(self) -> float:
        """Share of paired paragraphs on Word's page (0 when nothing paired)."""
        return self.same_page / self.aligned if self.aligned else 0.0

    @property
    def page_count_matches(self) -> bool:
        return self.word_pages == self.editor_pages

    def as_dict(self) -> dict:
        return {
            "word_paragraphs": self.word_paragraphs,
            "aligned": self.aligned,
            "same_page": self.same_page,
            "ratio": round(self.ratio, 4),
            "word_pages": self.word_pages,
            "editor_pages": self.editor_pages,
            "page_count_matches": self.page_count_matches,
            "first_divergence": self.first_divergence,
            "page_offsets": {str(page): offset for page, offset in sorted(self.page_offsets.items())},
        }


def score(truth: dict, editor: Sequence[dict], editor_pages: int) -> Score:
    """Score the editor's rows against Word's truth for one file."""
    word = word_rows(truth)
    pairs = align(word, editor)
    first: dict | None = None
    offsets: dict[int, int] = {}
    same = 0
    for paragraph, row in pairs:
        offset = row["page"] - paragraph["page"]
        offsets.setdefault(paragraph["page"], offset)
        if offset == 0:
            same += 1
        elif first is None:
            first = {"text": paragraph.get("text", "")[:60], "word_page": paragraph["page"], "editor_page": row["page"]}
    return Score(
        word_paragraphs=len(word),
        aligned=len(pairs),
        same_page=same,
        word_pages=int(truth.get("pages", 0)),
        editor_pages=editor_pages,
        first_divergence=first,
        page_offsets=offsets,
    )


@dataclass
class Regression:
    """One way a file got worse than its baseline."""

    name: str
    reason: str


def compare(scores: dict[str, Score], baseline: dict[str, dict]) -> list[Regression]:
    """Regressions against a baseline of {name: {"same_page": n, "editor_pages": n}}.

    A file regresses when fewer paragraphs sit on Word's page than the baseline records, or when
    its page count moves away from Word's (a page count that was wrong and stays as wrong is
    not a regression). A baselined file that was not measured is reported too: silently
    skipping a fixture would let the gate pass on less.
    """
    found: list[Regression] = []
    for name, expected in sorted(baseline.items()):
        current = scores.get(name)
        if current is None:
            found.append(Regression(name, "not measured"))
            continue
        if current.same_page < expected["same_page"]:
            found.append(Regression(name, f"paragraphs on Word's page {expected['same_page']} -> {current.same_page}"))
        before = abs(expected["editor_pages"] - current.word_pages)
        after = abs(current.editor_pages - current.word_pages)
        if after > before:
            found.append(Regression(name, f"pages {expected['editor_pages']} -> {current.editor_pages} (Word {current.word_pages})"))
    return found


def baseline_from(scores: dict[str, Score]) -> dict[str, dict]:
    """The baseline that records today's scores."""
    return {name: {"same_page": s.same_page, "aligned": s.aligned, "editor_pages": s.editor_pages, "word_pages": s.word_pages}
            for name, s in sorted(scores.items())}


def summary_lines(scores: dict[str, Score]) -> Iterable[str]:
    """A readable table of every file's score."""
    yield f"{'file':<52} {'on Word page':>14} {'ratio':>7} {'pages ed/Word':>14}  first divergence"
    for name, s in sorted(scores.items()):
        first = s.first_divergence
        where = f"{first['text'][:32]!r} Word p{first['word_page']} -> p{first['editor_page']}" if first else "none"
        yield f"{name[:52]:<52} {s.same_page:>6}/{s.aligned:<7} {s.ratio:>6.1%} {s.editor_pages:>6}/{s.word_pages:<7}  {where}"
