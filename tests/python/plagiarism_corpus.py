"""Fixed corpus for the plagiarism benchmark (tests/fixtures/plagiarism_benchmark/corpus.json,
shared with the server's web-check benchmark): a peer thesis and a submission whose
paragraphs are verbatim copies, light edits, true paraphrases, same-topic originals
and unrelated originals. Each case says what the checker should say.

Labels: "copied" (verbatim or light edit: must be flagged), "paraphrase" (must be
flagged), "original" (must NOT be flagged). The acknowledgement and reference entry
sit under bold-paragraph headings and must not be scanned at all.
"""
import json
from pathlib import Path

_DATA = json.loads(
    (Path(__file__).resolve().parents[1] / "fixtures" / "plagiarism_benchmark" / "corpus.json").read_text(encoding="utf-8")
)

PEER_PARAGRAPHS: dict = _DATA["peer_paragraphs"]
ACK_TEXT: str = _DATA["acknowledgement"]
REFERENCE_ENTRY: str = _DATA["reference_entry"]
# (case id, label, submission paragraph, peer paragraph it derives from or None)
CASES = [(case["id"], case["label"], case["text"], case["source"]) for case in _DATA["cases"]]


def peer_html() -> str:
    """The peer thesis: body paragraphs, then bold-paragraph ACKNOWLEDGEMENT and REFERENCES sections."""
    body = "".join(f"<p>{text}</p>" for text in PEER_PARAGRAPHS.values())
    ack = f"<p><strong>ACKNOWLEDGEMENT</strong></p><p>{ACK_TEXT}</p>"
    refs = f"<p><strong>REFERENCES</strong></p><p>{REFERENCE_ENTRY}</p>"
    return f"<p><strong>CHAPTER 1</strong></p>{body}{ack}{refs}"


def submission_html() -> str:
    """The submission: every case paragraph, with copied acknowledgement and references under bold headings."""
    body = "".join(f"<p>{text}</p>" for (_id, _label, text, _src) in CASES)
    ack = f"<p><strong>ACKNOWLEDGEMENT</strong></p><p>{ACK_TEXT}</p>"
    refs = f"<p><strong>REFERENCES</strong></p><p>{REFERENCE_ENTRY}</p>"
    return f"<p><strong>Introduction</strong></p>{body}{ack}{refs}"
