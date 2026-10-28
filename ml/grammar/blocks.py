import re
from typing import Any

TERMINAL_PUNCTUATION = (".", "!", "?")
SHORT_LINE_MAX_WORDS = 12

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


def is_prose_block(block: dict[str, Any]) -> bool:
    """Return true when sentence-style rules apply (not a heading, list item or title line)."""
    if block["kind"] in ("heading", "listItem"):
        return False
    return not is_short_centered_line(block)
