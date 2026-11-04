"""The converter's document model: what a Word file says, resolved, before it is written out.

The converter reads a DOCX into these types, then writes them as HTML (and, from Stage 2a.3, as the
editor's own JSON). Values are resolved down Word's inheritance chain (run, paragraph style, document
defaults) and kept in Word's own units, unrounded; every presentation decision (CSS units, rounding,
fallback fonts, non-breaking spaces) belongs to a writer. Bump IR_VERSION when a type changes meaning.

Built up type by type (docs/architecture/document-import-architecture.md, Stage 2a); the HTML the
writers produce is held byte-identical to the recorded references
(tests/e2e/tools/editor_json_reference.py check --html-only).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

IR_VERSION = 1


@dataclass(frozen=True)
class RunProps:
    """Character formatting of a run, resolved."""

    # Font size in points, as Word stores it (None: inherited from the paragraph, not set on the run).
    size_pt: Optional[float] = None
    # Text colour as #rrggbb, or None for automatic.
    color: Optional[str] = None
    # Extra space between characters in points: w:spacing plus the tracking that imitates w:w scaling.
    tracking_pt: float = 0.0
    # The font's family name as the document names it (subset prefixes and style suffixes removed).
    font_family: Optional[str] = None
    bold: bool = False
    italic: bool = False
    underline: bool = False
    strike: bool = False
    subscript: bool = False
    superscript: bool = False
    # Highlight colour as a CSS colour, or None.
    highlight: Optional[str] = None


@dataclass(frozen=True)
class TextRun:
    """A run of text with one formatting. Tabs stay as '\\t' characters; spaces stay as typed."""

    text: str
    props: RunProps


@dataclass(frozen=True)
class ParagraphSpacing:
    """Space around and between a paragraph's lines, resolved down the style chain (Word's units)."""

    # Space before/after in twips (1/1440 in); 0 is an explicit "none", None means set nowhere.
    before_twips: Optional[int] = None
    after_twips: Optional[int] = None
    # Space before/after in hundredths of a line, used only when the twips value is set nowhere.
    before_lines: Optional[int] = None
    after_lines: Optional[int] = None
    # Line spacing: 240ths of a line (auto) or twips (exact/atLeast); None when set nowhere or 0.
    line: Optional[int] = None
    line_rule: str = "auto"
    # True when the document sets no spacing at all for the paragraph (not even 0).
    unset: bool = True


@dataclass(frozen=True)
class ParagraphIndent:
    """Indents in twips, resolved; None (or 0 in Word) means none."""

    left_twips: Optional[int] = None
    right_twips: Optional[int] = None
    first_line_twips: Optional[int] = None
    hanging_twips: Optional[int] = None


@dataclass(frozen=True)
class ParagraphProps:
    """A paragraph's own formatting, resolved."""

    alignment: str = "left"  # left, center, right or justify
    # The paragraph's base font size in points (its style chain), when the document sets one.
    font_size_pt: Optional[float] = None
    # The font that decides Word's "single" line height for the paragraph.
    font_name: Optional[str] = None
    spacing: ParagraphSpacing = ParagraphSpacing()
    indent: ParagraphIndent = ParagraphIndent()
    # The paragraph style's name, lower-cased (decides title, subtitle and heading levels).
    style_name: str = ""
