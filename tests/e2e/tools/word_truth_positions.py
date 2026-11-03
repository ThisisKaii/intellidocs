"""Add each paragraph's vertical position on its page to Word truth, from Word's own exported PDF.

usage: ml/venv/Scripts/python tests/e2e/tools/word_truth_positions.py <name.word.json> <name.word.pdf>

word_truth.ps1 already knows each paragraph's page (from Word). Its first line is looked for only on
that page, in order, so a phrase repeated elsewhere cannot be mistaken for it. A paragraph whose
first line cannot be found keeps `y: null` rather than a guessed value. `y` is the top of that line
in points from the top of the page, as Word's own vertical position is.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

# Characters of a paragraph's opening compared with a PDF line: enough to tell lines apart, and
# few enough to fit on a first line even when Word hyphenates or the line is short.
PREFIX_CHARS = 12
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def norm(text: str) -> str:
    return _NON_ALNUM.sub("", text.lower())


def page_lines(pdf: fitz.Document) -> list[list[tuple[float, str]]]:
    """Every text line of every page, top to bottom, as (top in pt, normalised text)."""
    pages = []
    for page in pdf:
        lines = []
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                text = norm("".join(span["text"] for span in line["spans"]))
                if text:
                    lines.append((round(line["bbox"][1], 1), text))
        lines.sort(key=lambda item: item[0])
        pages.append(lines)
    return pages


def add_positions(truth: dict, pdf_path: Path) -> tuple[int, int]:
    """Fill in `y` for every paragraph whose first line is found; returns (found, looked for)."""
    with fitz.open(pdf_path) as pdf:
        lines = page_lines(pdf)
    used: dict[int, set[int]] = {}
    found = wanted = 0
    for paragraph in truth["paragraphs"]:
        paragraph["y"] = None
        prefix = norm(paragraph.get("text", ""))[:PREFIX_CHARS]
        page = paragraph.get("page", 0)
        if len(prefix) < 4 or not 1 <= page <= len(lines):
            continue
        wanted += 1
        taken = used.setdefault(page, set())
        for index, (top, text) in enumerate(lines[page - 1]):
            if index not in taken and text.startswith(prefix):
                paragraph["y"] = top
                taken.add(index)
                found += 1
                break
    return found, wanted


def main() -> None:
    json_path, pdf_path = Path(sys.argv[1]), Path(sys.argv[2])
    truth = json.loads(json_path.read_text(encoding="utf-8-sig"))
    found, wanted = add_positions(truth, pdf_path)
    json_path.write_text(json.dumps(truth, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{truth['name']}: positions for {found} of {wanted} paragraphs with text")


if __name__ == "__main__":
    main()
