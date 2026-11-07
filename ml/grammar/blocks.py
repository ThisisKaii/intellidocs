import re
from typing import Any

TERMINAL_PUNCTUATION = (".", "!", "?", "\u2026")
SHORT_LINE_MAX_WORDS = 12
# Regions of a document the editor marks: title-page and approval-sheet lines are formal furniture
# (names, institutions, submission clauses), not sentences.
FORMAL_REGIONS = frozenset({"title_page", "approval_sheet"})
# Clauses of a thesis title page, recognised even when the editor sends no region (plain text callers).
TITLE_PAGE_CLAUSE = re.compile(
    r"^(?:presented\s+to|submitted\s+(?:to|by|in)|in\s+partial\s+fulfil+ment|"
    r"for\s+the\s+(?:degree|requirements?)\s+of|requirements?\s+for|"
    r"(?:university|college|department|school|institute)\s+of|"
    r"(?:a|an)\s+(?:thesis|capstone|project|proposal|dissertation|research|study)\b|"
    r"by\s*:|adviser\b|advisor\b|"
    r"(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b)",
    re.IGNORECASE,
)
TITLE_CLAUSE_MAX_WORDS = 20

# A web address or email: "https://x.y", "www.deped.gov.ph", "name@host.tld", or a bare domain.
WEB_ADDRESS_PATTERN = re.compile(
    r"(?:https?://|www\.)\S+"
    r"|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b"
    r"|\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|edu|gov|ph|io|co|info)\b",
    re.IGNORECASE,
)


def has_web_address(text: str) -> bool:
    """Return true when the text contains a URL, a www address, an email or a bare domain."""
    return WEB_ADDRESS_PATTERN.search(text) is not None


def normalize_blocks(source: Any) -> list[dict[str, Any]]:
    """Turn a plain string or a list of block dicts into a clean list of blocks.

    A plain string becomes one paragraph block per non-empty line, so old callers
    keep working. Blocks without usable text are dropped.
    """
    if isinstance(source, str):
        return [
            {"text": line.strip(), "kind": "paragraph", "align": "left", "centered": False}
            for line in source.splitlines()
            if line.strip()
        ]

    blocks: list[dict[str, Any]] = []
    for raw in source or []:
        data = raw if isinstance(raw, dict) else raw.model_dump()
        text = " ".join(str(data.get("text", "")).split())
        if not text:
            continue
        align = str(data.get("align") or "left")
        blocks.append(
            {
                "text": text,
                "kind": data.get("kind") or "paragraph",
                "align": align,
                "centered": bool(data.get("centered")) or align == "center",
                "in_cell": bool(data.get("inCell")),
                "region": data.get("region") if data.get("region") in FORMAL_REGIONS else None,
            }
        )
    return blocks


def ends_sentence(text: str) -> bool:
    """Return true when the text ends with terminal punctuation."""
    return text.rstrip().endswith(TERMINAL_PUNCTUATION)


def is_short_centered_line(block: dict[str, Any]) -> bool:
    """Return true for a short centred line with no terminal punctuation (title-page furniture)."""
    return (
        bool(block["centered"])
        and len(block["text"].split()) <= SHORT_LINE_MAX_WORDS
        and not ends_sentence(block["text"])
    )


def continues_previous(block: dict[str, Any], previous: dict[str, Any] | None) -> bool:
    """Return true when a centred block carries on from an unfinished centred line above it."""
    return (
        previous is not None
        and bool(block["centered"])
        and bool(previous["centered"])
        and not ends_sentence(previous["text"])
    )


def is_title_page_block(block: dict[str, Any]) -> bool:
    """Return true for title-page or approval-sheet furniture.

    The editor marks those regions; without a mark, a short line that opens with a submission
    clause ("presented to the Faculty of ...", "In partial fulfillment ...", "University of ...")
    counts too, so plain-text callers get the same exemption.
    """
    if block.get("region") in FORMAL_REGIONS:
        return True
    text = block["text"].strip()
    return len(text.split()) <= TITLE_CLAUSE_MAX_WORDS and TITLE_PAGE_CLAUSE.match(text) is not None


def is_prose_block(block: dict[str, Any]) -> bool:
    """Return true when sentence-style rules apply (not a heading, list item, title line or title-page clause)."""
    if block["kind"] in ("heading", "listItem"):
        return False
    if is_title_page_block(block):
        return False
    return not is_short_centered_line(block)
