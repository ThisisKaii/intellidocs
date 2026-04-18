import json
import os
from typing import Any

import pandas as pd


RAW_ROOT = "ml/dataset/raw"
PROCESSED_ROOT = "ml/dataset/processed"


def ensure_directory(path: str) -> None:
    """Create a directory if it does not already exist."""
    os.makedirs(path, exist_ok=True)


def load_jsonl(path: str) -> list[dict[str, Any]]:
    """Load newline-delimited JSON records from disk."""
    rows: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def infer_format_label(text: str) -> str:
    """Infer a coarse formatting label from raw WikiText content."""
    stripped = text.strip()
    if not stripped:
        return "paragraph"
    if stripped.startswith("= ") and stripped.endswith(" ="):
        return "heading1"
    if stripped.startswith("== ") and stripped.endswith(" =="):
        return "heading2"
    if stripped.startswith("=== ") and stripped.endswith(" ==="):
        return "heading3"
    if stripped.startswith("* "):
        return "unordered_list"
    if stripped.startswith("# "):
        return "ordered_list"
    if stripped.startswith("> "):
        return "blockquote"
    if stripped.startswith("```") or stripped.startswith("    "):
        return "code_block"
    return "paragraph"


def build_formatting_rows(records: list[dict[str, Any]], split: str) -> list[dict[str, Any]]:
    """Convert WikiText records into supervised formatting examples."""
    rows: list[dict[str, Any]] = []
    for record in records:
        text = str(record.get("text", "")).strip()
        if not text:
            continue
        label = infer_format_label(text)
        rows.append(
            {
                "split": split,
                "text": text,
                "label": label,
                "char_count": len(text),
                "word_count": len(text.split()),
                "line_count": max(text.count("\n") + 1, 1),
                "uppercase_ratio": (
                    sum(1 for char in text if char.isupper()) / max(len(text), 1)
                ),
                "digit_ratio": (
                    sum(1 for char in text if char.isdigit()) / max(len(text), 1)
                ),
                "punctuation_ratio": (
                    sum(1 for char in text if not char.isalnum() and not char.isspace())
                    / max(len(text), 1)
                ),
                "starts_with_marker": int(
                    text.startswith(("=", "*", "#", ">", "`", "    "))
                ),
            }
        )
    return rows


def build_grammar_rows(records: list[dict[str, Any]], split: str) -> list[dict[str, Any]]:
    """Convert JFLEG records into source-correction training pairs."""
    rows: list[dict[str, Any]] = []
    for record in records:
        source = str(record.get("sentence", "")).strip()
        corrections = record.get("corrections", [])
        if not source or not isinstance(corrections, list):
            continue
        for index, correction in enumerate(corrections):
            target = str(correction).strip()
            if not target:
                continue
            rows.append(
                {
                    "split": split,
                    "source": source,
                    "target": target,
                    "correction_index": index,
                    "source_length": len(source),
                    "target_length": len(target),
                }
            )
    return rows


def preprocess_wikitext() -> pd.DataFrame:
    """Read raw WikiText files and build a formatting training table."""
    rows: list[dict[str, Any]] = []
    for split in ("train", "validation", "test"):
        path = os.path.join(RAW_ROOT, "wikitext-103", f"{split}.jsonl")
        if os.path.exists(path):
            rows.extend(build_formatting_rows(load_jsonl(path), split))
    frame = pd.DataFrame(rows)
    output_path = os.path.join(PROCESSED_ROOT, "formatting_examples.csv")
    frame.to_csv(output_path, index=False)
    return frame


def preprocess_jfleg() -> pd.DataFrame:
    """Read raw JFLEG files and build a grammar correction table."""
    rows: list[dict[str, Any]] = []
    for split in ("validation", "test"):
        path = os.path.join(RAW_ROOT, "jfleg", f"{split}.jsonl")
        if os.path.exists(path):
            rows.extend(build_grammar_rows(load_jsonl(path), split))
    frame = pd.DataFrame(rows)
    output_path = os.path.join(PROCESSED_ROOT, "grammar_examples.csv")
    frame.to_csv(output_path, index=False)
    return frame


def main() -> None:
    """Run preprocessing for both formatting and grammar datasets."""
    ensure_directory(PROCESSED_ROOT)
    formatting = preprocess_wikitext()
    grammar = preprocess_jfleg()
    print(f"✅ Formatting examples: {len(formatting)}")
    print(f"✅ Grammar examples: {len(grammar)}")


if __name__ == "__main__":
    main()