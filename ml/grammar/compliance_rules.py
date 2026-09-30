"""
Tier 1 deterministic compliance heuristics for thesis documents.

Every function here is a pure rule: it inspects the document HTML plus the
stored page setup and returns a list of compliance checks. No model, no I/O, no
network. The rules are deliberately literal about the requirements called out
in the implementation plan: 1 inch margins, page numbers, heading
capitalization, table caption numbering, and reference list format.

Each check is a plain dict so the FastAPI layer can serialise it directly.
"""
from __future__ import annotations

import re
from typing import Any

from bs4 import BeautifulSoup

# A margin this far from the target is a rounding artefact, not a real deviation.
MARGIN_EPSILON_INCHES = 0.01
# Beyond this the margin is treated as a hard failure rather than a warning.
MARGIN_FAIL_INCHES = 0.25
DEFAULT_REQUIRED_MARGIN_INCHES = 1.0

STATUS_PASS = "pass"
STATUS_WARN = "warn"
STATUS_FAIL = "fail"

CATEGORY_LAYOUT = "layout"
CATEGORY_STRUCTURE = "structure"
CATEGORY_STYLE = "style"
CATEGORY_REFERENCES = "references"
CATEGORY_CONTENT = "content"

# Weight reflects how heavily a university compliance office treats the rule.
CHECK_WEIGHTS: dict[str, float] = {
    "margins": 3.0,
    "page_numbers": 2.0,
    "heading_capitalization": 1.5,
    "table_captions": 1.0,
    "reference_format": 3.0,
    "required_sections": 2.0,
}

# Rules whose failure alone blocks "thesis ready" regardless of the score.
REQUIRED_CHECK_IDS = frozenset({"margins", "page_numbers", "reference_format"})

HEADING_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6")
# A short, fully-bold paragraph counts as a heading in academic writing.
MAX_PSEUDO_HEADING_WORDS = 12
BOLD_COVERAGE_RATIO = 0.9
HEADING_TO_STYLE = {
    "h1": "heading1",
    "h2": "heading2",
    "h3": "heading3",
    "h4": "heading4",
    "h5": "heading5",
    "h6": "heading6",
}
# Styles the editor emits that have no trained model class, mapped to the
# nearest comparable class so they are scored rather than ignored.
OBSERVED_STYLE_ALIASES = {
    "reference_entry": "paragraph",
    "caption": "paragraph",
    "table": "paragraph",
    "blockquote": "paragraph",
    "ordered_list": "ordered_list",
}

REFERENCE_HEADING_PATTERN = re.compile(
    r"^\s*(references|bibliography|works\s+cited|literature\s+cited)\s*:?\s*$",
    re.IGNORECASE,
)
TABLE_CAPTION_PATTERN = re.compile(r"^\s*table\s+(\d+)\s*[.:：-]?\s", re.IGNORECASE)
FIGURE_CAPTION_PATTERN = re.compile(r"^\s*figure\s+(\d+)\s*[.:：-]?\s", re.IGNORECASE)

# APA 7th: "Author, A. A. (2020). Title of work. Publisher."
APA_ENTRY_PATTERN = re.compile(r"\(\d{4}[a-z]?\)\s*\.")
# IEEE: 'A. A. Author, "Title," Journal, vol. 3, no. 1, pp. 1-9, 2020.'
IEEE_ENTRY_PATTERN = re.compile(r"\bvol\.\s*\d+|\bpp\.\s*\d+|\bno\.\s*\d+", re.IGNORECASE)
IEEE_NUMBERED_PATTERN = re.compile(r"^\s*\[(\d+)\]\s*")


def make_check(
    check_id: str,
    name: str,
    category: str,
    status: str,
    detail: str,
    suggestion: str = "",
) -> dict[str, Any]:
    """Build one compliance check payload shared by every Tier 1 rule."""
    return {
        "id": check_id,
        "name": name,
        "category": category,
        "status": status,
        "detail": detail,
        "suggestion": suggestion,
        "weight": CHECK_WEIGHTS.get(check_id, 1.0),
        "required": check_id in REQUIRED_CHECK_IDS,
    }


def parse_document(content: str) -> BeautifulSoup:
    """Parse editor HTML into a soup once so every rule reuses the same tree."""
    return BeautifulSoup(content or "", "html.parser")


def check_margins(page_setup: dict[str, Any], required_inches: float) -> dict[str, Any]:
    """Verify every page margin matches the required measurement."""
    margins = (page_setup or {}).get("margins") or {}
    target = required_inches or DEFAULT_REQUIRED_MARGIN_INCHES

    measured: list[str] = []
    deviations: list[float] = []
    for side in ("top", "bottom", "left", "right"):
        raw = margins.get(side)
        try:
            value = float(raw)
        except (TypeError, ValueError):
            measured.append(f"{side}=missing")
            deviations.append(MARGIN_FAIL_INCHES + 1)
            continue
        measured.append(f"{side}={value:g}\"")
        deviations.append(abs(value - target))

    worst = max(deviations) if deviations else MARGIN_FAIL_INCHES + 1
    detail = (
        f"Required {target:g}\" on all sides; measured "
        f"{', '.join(measured)}."
    )

    if worst <= MARGIN_EPSILON_INCHES:
        return make_check(
            "margins", f"Page margins ({target:g}\")", CATEGORY_LAYOUT,
            STATUS_PASS, detail,
        )

    if worst <= MARGIN_FAIL_INCHES:
        return make_check(
            "margins", f"Page margins ({target:g}\")", CATEGORY_LAYOUT,
            STATUS_WARN, detail,
            f"Adjust page setup so all four margins are exactly {target:g}\".",
        )

    return make_check(
        "margins", f"Page margins ({target:g}\")", CATEGORY_LAYOUT,
        STATUS_FAIL, detail,
        f"Set every margin to {target:g}\"; the largest deviation is {worst:.2f}\".",
    )


def check_page_numbers(page_setup: dict[str, Any]) -> dict[str, Any]:
    """Verify a page number is printed and uses the arabic format."""
    show_header = bool((page_setup or {}).get("show_header"))
    show_footer = bool((page_setup or {}).get("show_footer"))
    header_format = (page_setup or {}).get("header_number_format")
    footer_format = (page_setup or {}).get("footer_number_format")

    if not show_header and not show_footer:
        return make_check(
            "page_numbers", "Page numbers", CATEGORY_LAYOUT, STATUS_FAIL,
            "Neither the header nor the footer is enabled, so no page number is printed.",
            "Enable the header or footer and set the number format to arabic numerals.",
        )

    active = []
    if show_header:
        active.append(f"header ({header_format})")
    if show_footer:
        active.append(f"footer ({footer_format})")

    # Only the formats that are actually switched on can satisfy the rule.
    enabled_formats = set()
    if show_header:
        enabled_formats.add(header_format)
    if show_footer:
        enabled_formats.add(footer_format)

    if "number" in enabled_formats:
        return make_check(
            "page_numbers", "Page numbers", CATEGORY_LAYOUT, STATUS_PASS,
            f"Arabic page numbers are enabled via {', '.join(active)}.",
        )

    if "roman" in enabled_formats:
        return make_check(
            "page_numbers", "Page numbers", CATEGORY_LAYOUT, STATUS_WARN,
            f"Page numbering uses roman numerals via {', '.join(active)}. "
            "Roman numerals are conventional for front matter only.",
            "Use arabic numerals for the body of the thesis.",
        )

    return make_check(
        "page_numbers", "Page numbers", CATEGORY_LAYOUT, STATUS_FAIL,
        f"Page numbering is enabled via {', '.join(active)} but no number format is set.",
        "Set the page number format to arabic numerals.",
    )


def is_all_caps(text: str) -> bool:
    """Return True when the text is shouted in capitals."""
    letters = [char for char in text if char.isalpha()]
    if len(letters) < 4:
        return False
    return all(char.isupper() for char in letters)


def is_title_case(text: str) -> bool:
    """Return True when every significant word in the text starts with a capital."""
    words = [word for word in re.split(r"\s+", text.strip()) if word]
    if not words:
        return False
    # Small connective words stay lowercase in both title and sentence case.
    minor = {"a", "an", "and", "as", "at", "but", "by", "for", "in", "nor",
             "of", "on", "or", "the", "to", "up", "via", "with"}
    significant = [
        word for word in words
        if word.lower().strip(".,:;") not in minor
    ]
    if not significant:
        return False
    return all(word[:1].isupper() for word in significant)


def check_heading_capitalization(headings: list[str]) -> dict[str, Any]:
    """Verify headings follow title case and are not written in capitals."""
    if not headings:
        return make_check(
            "heading_capitalization", "Heading capitalization", CATEGORY_STYLE,
            STATUS_FAIL, "The document contains no headings to check.",
            "Add titled sections so the document structure can be verified.",
        )

    shouted = [heading for heading in headings if is_all_caps(heading)]
    if shouted:
        preview = ", ".join(f'"{item}"' for item in shouted[:3])
        return make_check(
            "heading_capitalization", "Heading capitalization", CATEGORY_STYLE,
            STATUS_FAIL,
            f"{len(shouted)} of {len(headings)} headings are in all capitals: {preview}.",
            "Rewrite headings in title case (APA 7th) or sentence case, not capitals.",
        )

    titled = sum(1 for heading in headings if is_title_case(heading))
    ratio = titled / len(headings)

    if ratio >= 0.8:
        return make_check(
            "heading_capitalization", "Heading capitalization", CATEGORY_STYLE,
            STATUS_PASS,
            f"{titled} of {len(headings)} headings use title case.",
        )

    return make_check(
        "heading_capitalization", "Heading capitalization", CATEGORY_STYLE,
        STATUS_WARN,
        f"Only {titled} of {len(headings)} headings use title case; the rest mix styles.",
        "Standardise every heading to title case (APA 7th) or sentence case.",
    )


def collect_caption_numbers(blocks: list[str], pattern: re.Pattern[str]) -> list[int]:
    """Pull caption ordinals out of the text blocks that match a caption pattern."""
    numbers: list[int] = []
    for block in blocks:
        match = pattern.match(block)
        if match:
            numbers.append(int(match.group(1)))
    return numbers


def check_table_captions(soup: BeautifulSoup) -> dict[str, Any]:
    """Verify every table is captioned and captions are numbered sequentially."""
    table_count = len(soup.find_all("table"))
    if table_count == 0:
        return make_check(
            "table_captions", "Table caption numbering", CATEGORY_STRUCTURE,
            STATUS_PASS, "The document contains no tables to caption.",
        )

    blocks = [
        block.get_text(" ", strip=True)
        for block in soup.find_all(["p", "figcaption", "caption", "div", "h1", "h2", "h3", "h4"])
    ]
    numbers = collect_caption_numbers(blocks, TABLE_CAPTION_PATTERN)

    if not numbers:
        return make_check(
            "table_captions", "Table caption numbering", CATEGORY_STRUCTURE,
            STATUS_FAIL,
            f"The document has {table_count} table(s) but no 'Table N' caption was found.",
            "Add a caption above or below each table, numbered Table 1, Table 2, ...",
        )

    expected = list(range(1, len(numbers) + 1))
    duplicates = sorted({number for number in numbers if numbers.count(number) > 1})

    if numbers == expected:
        return make_check(
            "table_captions", "Table caption numbering", CATEGORY_STRUCTURE,
            STATUS_PASS,
            f"All {len(numbers)} caption(s) are numbered sequentially from Table 1.",
        )

    problems = []
    if duplicates:
        problems.append(f"duplicated number(s) {', '.join(map(str, duplicates))}")
    if sorted(numbers) != expected:
        problems.append("caption numbers are not consecutive from Table 1")
    if len(numbers) < table_count:
        problems.append(
            f"{table_count - len(numbers)} of {table_count} table(s) have no caption"
        )

    return make_check(
        "table_captions", "Table caption numbering", CATEGORY_STRUCTURE,
        STATUS_WARN, "Table captions need attention: " + "; ".join(problems) + ".",
        "Number every table sequentially as Table 1, Table 2, Table 3 with no gaps.",
    )


def detect_reference_style(entry: str) -> str:
    """Classify one bibliography entry as apa, ieee, or unknown."""
    if IEEE_NUMBERED_PATTERN.match(entry):
        return "ieee"
    if IEEE_ENTRY_PATTERN.search(entry):
        return "ieee"
    if APA_ENTRY_PATTERN.search(entry):
        return "apa"
    return "unknown"


def first_author_sort_key(entry: str) -> str:
    """Build a sort key for the first author surname of a bibliography entry."""
    text = IEEE_NUMBERED_PATTERN.sub("", entry.strip())
    if not text:
        return ""
    first = text.split(",")[0].split(".")[0].strip()
    return first.lower()


def check_reference_format(
    soup: BeautifulSoup, expected_style: str, required: bool
) -> dict[str, Any]:
    """Verify the bibliography exists and consistently uses APA 7th or IEEE."""
    entries: list[str] = []
    found_heading = False

    for block in soup.find_all(["p", "h1", "h2", "h3", "h4", "div"]):
        text = block.get_text(" ", strip=True)
        if REFERENCE_HEADING_PATTERN.match(text):
            found_heading = True
            continue
        if found_heading and text:
            entries.append(text)

    if not found_heading or not entries:
        if not required:
            return make_check(
                "reference_format", "Reference list format", CATEGORY_REFERENCES,
                STATUS_PASS, "No reference list is required for this template.",
            )
        return make_check(
            "reference_format", "Reference list format", CATEGORY_REFERENCES,
            STATUS_FAIL,
            "No references section was found, so the bibliography cannot be verified.",
            "Add a References heading followed by one entry per cited work.",
        )

    styles = [detect_reference_style(entry) for entry in entries]
    counts: dict[str, int] = {}
    for style in styles:
        counts[style] = counts.get(style, 0) + 1

    apa_count = counts.get("apa", 0)
    ieee_count = counts.get("ieee", 0)
    unknown_count = counts.get("unknown", 0)
    dominant = "apa" if apa_count >= ieee_count else "ieee"

    if unknown_count > len(entries) / 2:
        return make_check(
            "reference_format", "Reference list format", CATEGORY_REFERENCES,
            STATUS_WARN,
            f"Only {len(entries) - unknown_count} of {len(entries)} reference entries "
            "match a recognisable APA 7th or IEEE pattern.",
            f"Rewrite every entry in {expected_style.upper()} style, including the "
            "publication year and a trailing full stop.",
        )

    if apa_count and ieee_count:
        return make_check(
            "reference_format", "Reference list format", CATEGORY_REFERENCES,
            STATUS_FAIL,
            f"The bibliography mixes {apa_count} APA and {ieee_count} IEEE entries.",
            f"Pick one style ({expected_style.upper()}) and convert every entry to it.",
        )

    if dominant != expected_style:
        return make_check(
            "reference_format", "Reference list format", CATEGORY_REFERENCES,
            STATUS_FAIL,
            f"The bibliography is written in {dominant.upper()} style but the "
            f"template requires {expected_style.upper()}.",
            f"Convert all {len(entries)} entries to {expected_style.upper()}.",
        )

    if dominant == "apa":
        keys = [first_author_sort_key(entry) for entry in entries if first_author_sort_key(entry)]
        if keys != sorted(keys):
            return make_check(
                "reference_format", "Reference list format", CATEGORY_REFERENCES,
                STATUS_WARN,
                f"All {len(entries)} entries are APA but they are not alphabetised by author.",
                "Sort the reference list alphabetically by first author surname.",
            )

    return make_check(
        "reference_format", f"Reference list format ({expected_style.upper()})",
        CATEGORY_REFERENCES, STATUS_PASS,
        f"All {len(entries)} reference entries are consistent {expected_style.upper()} entries.",
    )


def check_required_sections(
    headings: list[str], mandatory_headings: list[str]
) -> list[dict[str, Any]]:
    """Verify each mandatory thesis section is present, one check per section."""
    if not mandatory_headings:
        return []

    normalized = [heading.strip().lower() for heading in headings]
    checks: list[dict[str, Any]] = []
    for required_heading in mandatory_headings:
        wanted = required_heading.strip().lower()
        present = any(wanted in heading for heading in normalized)
        checks.append(
            make_check(
                "required_sections", f"Section: {required_heading}",
                CATEGORY_CONTENT, STATUS_PASS if present else STATUS_FAIL,
                f'Found the "{required_heading}" section.'
                if present
                else f'No "{required_heading}" section was found in the document.',
                "" if present
                else f'Add a "{required_heading}" section required by the template.',
            )
        )
    return checks


def collect_headings(soup: BeautifulSoup) -> list[str]:
    """
    Collect heading text, including bold standalone paragraphs.

    TipTap stores a section title as <h1> when the author picks a heading
    style, but authors also type "References" into a plain paragraph and make
    it bold. Those act as headings to a reader and to a compliance officer, so
    a short, fully-bold paragraph that does not read as a sentence is treated
    as one too.
    """
    headings = [
        tag.get_text(" ", strip=True)
        for tag in soup.find_all(HEADING_TAGS)
        if tag.get_text(" ", strip=True)
    ]

    for paragraph in soup.find_all("p"):
        text = paragraph.get_text(" ", strip=True)
        if not text or len(text.split()) > MAX_PSEUDO_HEADING_WORDS:
            continue
        if text.endswith((".", ",", ";", ":")):
            continue
        if not is_bold_paragraph(paragraph, text):
            continue
        headings.append(text)

    return headings


def is_bold_paragraph(paragraph: Any, text: str) -> bool:
    """Return True when every character of the paragraph is inside a bold tag."""
    bold = paragraph.find_all(["strong", "b"])
    if not bold:
        return False
    bolded = "".join(tag.get_text(" ", strip=True) for tag in bold)
    return len(bolded.strip()) >= len(text.strip()) * BOLD_COVERAGE_RATIO


def run_rule_checks(
    content: str,
    page_setup: dict[str, Any],
    requirements: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Run every Tier 1 rule and return (checks, paragraph_records).

    Paragraph records carry the observed style label for each block so Tier 2
    can score ML predictions against the markup the author actually used.
    """
    soup = parse_document(content)
    requirements = requirements or {}

    headings = collect_headings(soup)

    checks: list[dict[str, Any]] = [
        check_margins(page_setup, float(requirements.get("required_margin_inches")
                                        or DEFAULT_REQUIRED_MARGIN_INCHES)),
        check_page_numbers(page_setup),
        check_heading_capitalization(headings),
        check_table_captions(soup),
        check_reference_format(
            soup,
            str(requirements.get("reference_style") or "apa").strip().lower(),
            bool(requirements.get("references_required", True)),
        ),
    ]
    checks.extend(
        check_required_sections(headings, list(requirements.get("mandatory_headings") or []))
    )

    return checks, collect_paragraphs(soup)


def collect_paragraphs(soup: BeautifulSoup) -> list[dict[str, Any]]:
    """Extract every text block with the style label implied by its markup."""
    paragraphs: list[dict[str, Any]] = []

    for tag in soup.find_all(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "pre", "blockquote"]):
        text = tag.get_text(" ", strip=True)
        if not text:
            continue
        if tag.name in HEADING_TAGS:
            style = HEADING_TO_STYLE[tag.name]
        elif tag.name == "li":
            style = "ordered_list" if tag.get("data-type") == "ordered" else "unordered_list"
        elif tag.name == "pre":
            style = "code_block"
        elif tag.name == "blockquote":
            style = "blockquote"
        else:
            style = guess_reference_style(text)
        paragraphs.append({"text": text, "style": style, "tag": tag.name})

    return paragraphs


REFERENCE_ENTRY_PATTERN = re.compile(
    r"^\s*(?:\[\d+\]\s*)?(?:[A-Z][\w'’-]+,\s*(?:[A-Z]\.\s*){1,3}"
    r"|[A-Z][\w'’-]+,\s*[A-Z][\w'’-]+,)"
)


def guess_reference_style(text: str) -> str:
    """Label body text that is actually a bibliography entry."""
    if REFERENCE_ENTRY_PATTERN.match(text) and (
        APA_ENTRY_PATTERN.search(text) or IEEE_ENTRY_PATTERN.search(text)
    ):
        return "reference_entry"
    return "paragraph"
