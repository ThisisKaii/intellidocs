#!/usr/bin/env python3
"""
Add manuscript PDFs (legal/school documents) as 'legal_document' type to formatting corpus.

NOTE: These PDFs are scanned/image-based. The current marker pipeline (use_llm=False)
extracts page images as base64. For text extraction, OCR (marker with use_llm=True
or pymupdf_layout) is needed. This script adds placeholder entries with the correct
document_type for schema compatibility; actual text extraction requires OCR enhancement.

Run from repo root:
    python ml/dataset/process_manuscripts.py
"""

import sys
from pathlib import Path

import pandas as pd

# Add ml/src to path for imports
ML_SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(ML_SRC))

from preprocess import compute_features

MANUSCRIPT_DIR = Path(__file__).resolve().parent / "manuscript"
PROCESSED_DIR = Path(__file__).resolve().parent / "processed"
FORMATTING_CSV = PROCESSED_DIR / "formatting_examples.csv"


def main() -> None:
    pdf_files = list(MANUSCRIPT_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"No PDFs found in {MANUSCRIPT_DIR}")
        return

    print(f"Found {len(pdf_files)} manuscript PDFs")

    # Add placeholder rows for each legal document
    all_new_rows = []
    for pdf_path in pdf_files:
        print(f"Adding {pdf_path.name} as legal_document...")
        row = {
            "split": "train",
            "source_dataset": f"manuscript:{pdf_path.stem}",
            "text": f"[Scanned legal document: {pdf_path.name} - requires OCR]",
            "label": "paragraph",
            "section": "body",
            "document_type": "legal_document",
        }
        row.update(compute_features(row["text"]))
        all_new_rows.append(row)

    if not all_new_rows:
        print("No new rows to add")
        return

    # Load existing formatting CSV
    if FORMATTING_CSV.exists():
        existing = pd.read_csv(FORMATTING_CSV)
        print(f"Existing formatting examples: {len(existing)} rows")
        print(f"Existing document_types: {existing['document_type'].value_counts().to_dict()}")
    else:
        existing = pd.DataFrame()
        print("No existing formatting CSV found")

    # Combine
    new_df = pd.DataFrame(all_new_rows)
    combined = pd.concat([existing, new_df], ignore_index=True)

    # Ensure document_type column exists
    if "document_type" not in combined.columns:
        combined["document_type"] = "research_paper"

    # Save
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    combined.to_csv(FORMATTING_CSV, index=False)
    print(f"Saved {len(combined)} total formatting examples to {FORMATTING_CSV}")
    print(f"Updated document_types: {combined['document_type'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()