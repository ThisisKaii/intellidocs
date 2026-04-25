"""Extract formatting examples from completed academic/capstone paper PDFs.

This script reads PDF files with PyMuPDF, extracts line-level formatting metadata,
classifies each page, infers coarse formatting labels, and optionally merges the
new academic-paper examples with the existing WikiText formatting dataset.
"""

from __future__ import annotations

import argparse
import os
import re
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Iterable, cast

import pandas as pd


DEFAULT_INPUT_DIR = "ml/dataset/raw/academic-papers"
DEFAULT_FORMATTING_CSV = "ml/dataset/processed/formatting_examples.csv"
DEFAULT_ACADEMIC_OUTPUT = "ml/dataset/processed/academic_paper_formatting_examples.csv"
DEFAULT_MERGED_OUTPUT = "ml/dataset/processed/formatting_examples_merged.csv"

PAGE_TYPE_CODES = {
    "title": 1,
    "signature": 2,
    "toc": 3,
    "chapter_start": 4,
    "body": 5,
    "bibliography": 6,
}

BULLET_PATTERN = re.compile(r"^(\u2022|\u25cf|\u25e6|\u25aa|[-*])\s+")
ORDERED_PATTERN = re.compile(r"^(\d+|[A-Za-z]|[ivxlcdmIVXLCDM]+)[.)]\s+")
CHAPTER_PATTERN = re.compile(r"^(chapter|section)\s+([0-9ivxlcdm]+|one|two|three|four|five)", re.I)
BIBLIOGRAPHY_PATTERN = re.compile(r"^(references|bibliography|works cited|literature cited)\b", re.I)
TOC_PATTERN = re.compile(r"^(table of contents|contents)\b", re.I)
SIGNATURE_PATTERN = re.compile(r"(approval sheet|signature|panel|adviser|chairperson|accepted by)", re.I)


@dataclass(frozen=True)
class ExtractedLine:
    """Store one extracted document line with formatting metadata."""

    source_file: str
    page_number: int
    page_type: str
    text: str
    font_size: float
    is_bold: int
    is_italic: int
    x0: float
    y0: float


@dataclass(frozen=True)
class TrainingRow:
    """Store one supervised formatting example for model training."""

    split: str
    source: str
    source_file: str
    page_number: int
    page_type: str
    page_type_code: int
    text: str
    context: str
    label: str
    font_size: float
    font_size_delta: float
    is_bold: int
    is_italic: int
    x_position: float
    y_position: float
    char_count: int
    word_count: int
    line_count: int
    uppercase_ratio: float
    digit_ratio: float
    punctuation_ratio: float
    starts_with_marker: int


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments for the academic extraction pipeline."""
    parser = argparse.ArgumentParser(
        description="Extract academic-paper formatting metadata from PDFs."
    )
    parser.add_argument(
        "--input-dir",
        default=DEFAULT_INPUT_DIR,
        help="Directory containing academic/capstone PDF files.",
    )
    parser.add_argument(
        "--formatting-csv",
        default=DEFAULT_FORMATTING_CSV,
        help="Existing WikiText formatting_examples.csv path.",
    )
    parser.add_argument(
        "--academic-output",
        default=DEFAULT_ACADEMIC_OUTPUT,
        help="Output CSV path for academic-paper examples.",
    )
    parser.add_argument(
        "--merged-output",
        default=DEFAULT_MERGED_OUTPUT,
        help="Output CSV path for merged WikiText + academic examples.",
    )
    parser.add_argument(
        "--no-merge",
        action="store_true",
        help="Only write the academic-paper CSV and skip dataset merge.",
    )
    return parser.parse_args()


def ensure_parent_directory(path: str) -> None:
    """Create the parent directory for a file path if it is missing."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)


def normalize_whitespace(text: str) -> str:
    """Collapse repeated whitespace while preserving readable text content."""
    return re.sub(r"\s+", " ", text).strip()


def safe_ratio(count: int, total: int) -> float:
    """Return a zero-safe ratio for feature extraction."""
    if total <= 0:
        return 0.0
    return count / total


def iter_pdf_paths(input_dir: str) -> list[Path]:
    """Return all PDF paths in stable sorted order."""
    root = Path(input_dir)
    if not root.exists():
        raise FileNotFoundError(f"Academic paper input directory not found: {input_dir}")

    pdf_paths = sorted(path for path in root.rglob("*.pdf") if path.is_file())
    if not pdf_paths:
        raise FileNotFoundError(f"No PDF files found under: {input_dir}")

    return pdf_paths


def is_bold_font(font_name: str, flags: int) -> bool:
    """Infer bold styling from a PyMuPDF font name and span flags."""
    normalized = font_name.lower()
    return bool(flags & 16) or any(
        marker in normalized
        for marker in ("bold", "black", "heavy", "demi", "semibold", "semi-bold")
    )


def is_italic_font(font_name: str, flags: int) -> bool:
    """Infer italic styling from a PyMuPDF font name and span flags."""
    normalized = font_name.lower()
    return bool(flags & 2) or any(
        marker in normalized for marker in ("italic", "oblique", "slanted")
    )


def classify_page_type(page_text: str, page_index: int) -> str:
    """Classify a PDF page into a coarse academic-paper page type."""
    normalized = normalize_whitespace(page_text).lower()

    if page_index == 0:
        return "title"

    first_lines = "\n".join(page_text.splitlines()[:12])
    if SIGNATURE_PATTERN.search(normalized):
        return "signature"

    if TOC_PATTERN.search(first_lines):
        return "toc"

    if BIBLIOGRAPHY_PATTERN.search(first_lines):
        return "bibliography"

    if CHAPTER_PATTERN.search(first_lines):
        return "chapter_start"

    return "body"


def extract_line_from_spans(
    spans: list[dict[str, object]],
    source_file: str,
    page_number: int,
    page_type: str,
    bbox: Iterable[float],
) -> ExtractedLine | None:
    """Build one line record from PyMuPDF span dictionaries."""
    pieces: list[str] = []
    weighted_size_total = 0.0
    weighted_bold_total = 0
    weighted_italic_total = 0
    char_total = 0

    for span in spans:
        text = normalize_whitespace(str(span.get("text", "")))
        if not text:
            continue

        font_name = str(span.get("font", ""))
        flags = int(cast(int, span.get("flags", 0)))
        font_size = float(cast(float, span.get("size", 0.0)))
        char_count = max(len(text), 1)

        pieces.append(text)
        weighted_size_total += font_size * char_count
        weighted_bold_total += int(is_bold_font(font_name, flags)) * char_count
        weighted_italic_total += int(is_italic_font(font_name, flags)) * char_count
        char_total += char_count

    line_text = normalize_whitespace(" ".join(pieces))
    if not line_text:
        return None

    box = list(bbox)
    font_size = weighted_size_total / max(char_total, 1)
    is_bold = int(weighted_bold_total >= char_total / 2)
    is_italic = int(weighted_italic_total >= char_total / 2)

    return ExtractedLine(
        source_file=source_file,
        page_number=page_number,
        page_type=page_type,
        text=line_text,
        font_size=font_size,
        is_bold=is_bold,
        is_italic=is_italic,
        x0=float(box[0]) if len(box) > 0 else 0.0,
        y0=float(box[1]) if len(box) > 1 else 0.0,
    )


def extract_pdf_lines(pdf_path: Path) -> list[ExtractedLine]:
    """Extract line-level formatting records from one PDF."""
    import fitz  # type: ignore[import-not-found]

    rows: list[ExtractedLine] = []

    with fitz.open(pdf_path) as document:
        for page_index, page in enumerate(document):
            page_text = page.get_text("text")
            page_type = classify_page_type(page_text, page_index)
            page_dict = page.get_text("dict")

            for block in page_dict.get("blocks", []):
                if not isinstance(block, dict):
                    continue

                for line in block.get("lines", []):
                    if not isinstance(line, dict):
                        continue

                    spans = line.get("spans", [])
                    if not isinstance(spans, list):
                        continue

                    extracted = extract_line_from_spans(
                        spans=spans,
                        source_file=pdf_path.name,
                        page_number=page_index + 1,
                        page_type=page_type,
                        bbox=cast(Iterable[float], line.get("bbox", [0.0, 0.0, 0.0, 0.0])),
                    )
                    if extracted is not None:
                        rows.append(extracted)

    return rows


def estimate_body_font_size(lines: list[ExtractedLine]) -> float:
    """Estimate the body font size from extracted academic-paper lines."""
    candidate_sizes = [
        line.font_size
        for line in lines
        if line.page_type == "body" and len(line.text.split()) >= 6
    ]

    if not candidate_sizes:
        candidate_sizes = [line.font_size for line in lines if line.font_size > 0]

    if not candidate_sizes:
        return 12.0

    return float(median(candidate_sizes))


def infer_format_label(line: ExtractedLine, body_font_size: float) -> str:
    """Infer a coarse formatting label from academic-paper metadata."""
    text = line.text.strip()
    words = text.split()
    font_delta = line.font_size - body_font_size

    if BULLET_PATTERN.match(text):
        return "unordered_list"

    if ORDERED_PATTERN.match(text):
        return "ordered_list"

    if line.page_type == "title" and (font_delta >= 2.0 or line.is_bold):
        return "heading1"

    if line.page_type == "chapter_start":
        if CHAPTER_PATTERN.match(text) or font_delta >= 2.0 or line.is_bold:
            return "heading1"

    if BIBLIOGRAPHY_PATTERN.match(text):
        return "heading1"

    if TOC_PATTERN.match(text):
        return "heading1"

    if len(words) <= 12 and line.is_bold and font_delta >= 1.5:
        return "heading2"

    if len(words) <= 12 and (line.is_bold or font_delta >= 1.0):
        return "heading3"

    if text.startswith(("“", '"')) and text.endswith(("”", '"')):
        return "blockquote"

    return "paragraph"


def build_context(lines: list[ExtractedLine], index: int) -> str:
    """Build nearby text context for one extracted line."""
    previous_text = lines[index - 1].text if index > 0 else ""
    current_text = lines[index].text
    next_text = lines[index + 1].text if index + 1 < len(lines) else ""

    context_parts = [
        f"previous: {previous_text}" if previous_text else "",
        f"current: {current_text}",
        f"next: {next_text}" if next_text else "",
    ]

    return " | ".join(part for part in context_parts if part)


def build_training_row(
    lines: list[ExtractedLine],
    index: int,
    body_font_size: float,
) -> TrainingRow:
    """Convert one extracted line into a training row."""
    line = lines[index]
    text = line.text
    label = infer_format_label(line, body_font_size)
    char_count = len(text)
    word_count = len(text.split())
    uppercase_count = sum(1 for char in text if char.isupper())
    digit_count = sum(1 for char in text if char.isdigit())
    punctuation_count = sum(1 for char in text if not char.isalnum() and not char.isspace())

    return TrainingRow(
        split="academic",
        source="academic_paper",
        source_file=line.source_file,
        page_number=line.page_number,
        page_type=line.page_type,
        page_type_code=PAGE_TYPE_CODES.get(line.page_type, 0),
        text=text,
        context=build_context(lines, index),
        label=label,
        font_size=line.font_size,
        font_size_delta=line.font_size - body_font_size,
        is_bold=line.is_bold,
        is_italic=line.is_italic,
        x_position=line.x0,
        y_position=line.y0,
        char_count=char_count,
        word_count=word_count,
        line_count=1,
        uppercase_ratio=safe_ratio(uppercase_count, char_count),
        digit_ratio=safe_ratio(digit_count, char_count),
        punctuation_ratio=safe_ratio(punctuation_count, char_count),
        starts_with_marker=int(text.startswith(("=", "*", "#", ">", "`", "    ", "-", "•"))),
    )


def extract_academic_examples(input_dir: str) -> pd.DataFrame:
    """Extract academic-paper formatting examples from every PDF in a directory."""
    all_lines: list[ExtractedLine] = []

    for pdf_path in iter_pdf_paths(input_dir):
        extracted_lines = extract_pdf_lines(pdf_path)
        all_lines.extend(extracted_lines)
        print(f"Extracted {len(extracted_lines)} lines from {pdf_path.name}")

    if not all_lines:
        raise ValueError("No academic-paper lines were extracted.")

    body_font_size = estimate_body_font_size(all_lines)
    rows = [
        build_training_row(all_lines, index, body_font_size).__dict__
        for index in range(len(all_lines))
    ]

    frame = pd.DataFrame(rows)
    filtered_frame = frame[frame["text"].astype(str).str.strip() != ""].copy()
    return cast(pd.DataFrame, filtered_frame)


def normalize_for_merge(frame: pd.DataFrame, all_columns: list[str]) -> pd.DataFrame:
    """Ensure a dataset has every merge column and numeric nulls are filled."""
    normalized = frame.copy()

    for column in all_columns:
        if column not in normalized.columns:
            normalized[column] = 0 if column not in {"text", "label", "split"} else ""

    normalized = normalized[all_columns]

    for column in normalized.columns:
        if pd.api.types.is_numeric_dtype(normalized[column]):
            normalized[column] = cast(pd.Series, normalized[column]).fillna(0)

    return cast(pd.DataFrame, normalized)


def merge_with_wikitext(
    academic_frame: pd.DataFrame,
    formatting_csv: str,
) -> pd.DataFrame:
    """Merge academic examples with the existing WikiText formatting dataset."""
    if not os.path.exists(formatting_csv):
        raise FileNotFoundError(f"Existing formatting CSV not found: {formatting_csv}")

    wikitext_frame = pd.read_csv(formatting_csv)
    all_columns = sorted(set(wikitext_frame.columns) | set(academic_frame.columns))

    normalized_wikitext = normalize_for_merge(wikitext_frame, all_columns)
    normalized_academic = normalize_for_merge(academic_frame, all_columns)

    merged = pd.concat([normalized_wikitext, normalized_academic], ignore_index=True)
    merged = merged.dropna(subset=["text", "label"])
    merged = merged[merged["text"].astype(str).str.strip() != ""].copy()

    for column in merged.columns:
        if pd.api.types.is_numeric_dtype(merged[column]):
            merged[column] = cast(pd.Series, merged[column]).fillna(0)

    return cast(pd.DataFrame, merged)


def write_csv(frame: pd.DataFrame, output_path: str) -> None:
    """Write a dataframe to CSV after ensuring its parent directory exists."""
    ensure_parent_directory(output_path)
    frame.to_csv(output_path, index=False)


def main() -> None:
    """Run academic-paper extraction and optional merge with WikiText examples."""
    args = parse_args()

    academic_frame = extract_academic_examples(args.input_dir)
    write_csv(academic_frame, args.academic_output)
    print(f"✅ Academic paper formatting examples: {len(academic_frame)}")
    print(f"Saved academic examples to: {args.academic_output}")

    if args.no_merge:
        return

    merged_frame = merge_with_wikitext(academic_frame, args.formatting_csv)
    write_csv(merged_frame, args.merged_output)
    print(f"✅ Merged formatting examples: {len(merged_frame)}")
    print(f"Saved merged dataset to: {args.merged_output}")


if __name__ == "__main__":
    main()