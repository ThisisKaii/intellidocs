import json
import os
import re
import sys
from typing import Any

import pandas as pd


# Resolve roots from this file so preprocessing finds the same files that
# download.py writes, regardless of the current working directory. AGENTS.md
# runs both scripts from the repo root, where a bare "dataset/raw" would resolve
# to <repo>/dataset/raw instead of <repo>/ml/dataset/raw.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW_ROOT = os.path.join(REPO_ROOT, "ml", "dataset", "raw")
PROCESSED_ROOT = os.path.join(REPO_ROOT, "ml", "dataset", "processed")

# Unified schema columns shared by every contributing corpus, so the combined
# tables are homogeneous and a new corpus only has to supply these fields.
GRAMMAR_COLUMNS = [
    "split",
    "source_dataset",
    "source",
    "target",
    "correction_index",
    "source_length",
    "target_length",
    "error_type",
]

FORMATTING_COLUMNS = [
    "split",
    "source_dataset",
    "text",
    "label",
    "section",
]


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


def iter_jsonl(path: str):
    """
    Yield newline-delimited JSON records without holding the file in memory.

    The thesis mirrors are over 13 GB, so they must be streamed rather than
    loaded, otherwise preprocessing exhausts RAM before the row cap applies.
    """
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def infer_format_label(text: str) -> str:
    """Infer a coarse formatting label from raw WikiText content."""
    stripped = text.strip()
    if not stripped:
        return "paragraph"
    # Title: short ALL-CAPS or Title Case line at document start
    if len(stripped) <= 120 and stripped == stripped.upper() and stripped[0].isalpha():
        return "title"

    # Code block: fenced or 4-space indented or contains code keywords
    if (
        stripped.startswith("```")
        or stripped.startswith("    ")
        or re.match(r"\b(def |class |SELECT |INSERT |import |function |return )\b", stripped)
    ):
        return "code_block"

    # Reference entry: APA "Author, A. (2024)." or IEEE "[1] Author"
    if re.match(r"^[A-Z][a-zA-Z'\-]+,\s+[A-Z]\..*\(\d{4}\)", stripped) or re.match(
        r"^\[\d+\]\s+[A-Z]", stripped
    ):
        return "reference_entry"

    # Order matters: check longer/more-specific markers first
    if stripped.startswith("= = = ") and stripped.endswith(" = = ="):
        return "heading3"
    if stripped.startswith("= = ") and stripped.endswith(" = ="):
        return "heading2"
    if stripped.startswith("=== ") and stripped.endswith(" ==="):
        return "heading3"
    if stripped.startswith("== ") and stripped.endswith(" =="):
        return "heading2"
    if stripped.startswith("= ") and stripped.endswith(" ="):
        return "heading1"
    if stripped.startswith("* "):
        return "unordered_list"
    if stripped.startswith("# "):
        return "ordered_list"
    if stripped.startswith("> "):
        return "blockquote"
    return "paragraph"


def compute_features(text: str) -> dict[str, Any]:
    """Compute the numeric features for a single text sample."""
    stripped = text.strip()

    # Count leading '=' characters to distinguish heading depth
    heading_depth = 0
    for c in stripped:
        if c == "=":
            heading_depth += 1
        elif c == " " and heading_depth > 0:
            heading_depth += 1
        else:
            break

    return {
        "char_count": len(text),
        "word_count": len(text.split()),
        "line_count": max(text.count("\n") + 1, 1),
        "uppercase_ratio": (
            sum(1 for c in text if c.isupper()) / max(len(text), 1)
        ),
        "digit_ratio": (
            sum(1 for c in text if c.isdigit()) / max(len(text), 1)
        ),
        "punctuation_ratio": (
            sum(1 for c in text if not c.isalnum() and not c.isspace())
            / max(len(text), 1)
        ),
        "starts_with_marker": int(
            text.startswith(("=", "*", "#", ">", "`", "    "))
        ),
        "heading_depth": heading_depth,
        "starts_with_bullet": int(stripped.startswith("* ")),
        "starts_with_number_sign": int(stripped.startswith("# ")),
    }


def build_formatting_rows(records: list[dict[str, Any]], split: str) -> list[dict[str, Any]]:
    """Convert WikiText records into supervised formatting examples."""
    rows: list[dict[str, Any]] = []
    for record in records:
        text = str(record.get("text", "")).strip()
        if not text:
            continue
        label = infer_format_label(text)
        row: dict[str, Any] = {
            "split": split,
            "source_dataset": "wikitext-103",
            "text": text,
            "label": label,
            "section": "body",
        }
        row.update(compute_features(text))
        rows.append(row)
    return rows


def generate_synthetic_examples() -> list[dict[str, Any]]:
    """Generate synthetic training examples for underrepresented format classes."""
    rows: list[dict[str, Any]] = []

    # Heading 2 examples
    h2_titles = [
        "Background", "Methods", "Results", "Discussion", "Conclusion",
        "Literature Review", "Data Analysis", "Implementation", "Related Work",
        "System Design", "Experimental Setup", "Performance Evaluation",
        "User Study", "Technical Approach", "Problem Statement",
        "Future Work", "Acknowledgements", "Evaluation Metrics",
    ]
    for title in h2_titles:
        for pattern in [f"== {title} ==", f"= = {title} = ="]:
            row: dict[str, Any] = {"split": "synthetic", "source_dataset": "synthetic", "text": pattern, "label": "heading2", "section": "body"}
            row.update(compute_features(pattern))
            rows.append(row)

    # Heading 3 examples
    h3_titles = [
        "Data Collection", "Preprocessing", "Feature Engineering",
        "Model Training", "Hyperparameters", "Baseline Comparison",
        "Statistical Analysis", "Error Analysis", "Ablation Study",
        "Qualitative Results", "Quantitative Results", "Limitations",
        "Ethical Considerations", "Runtime Performance", "Memory Usage",
    ]
    for title in h3_titles:
        for pattern in [f"=== {title} ===", f"= = = {title} = = ="]:
            row = {"split": "synthetic", "source_dataset": "synthetic", "text": pattern, "label": "heading3", "section": "body"}
            row.update(compute_features(pattern))
            rows.append(row)

    # Blockquote examples
    quotes = [
        "> The only way to do great work is to love what you do.",
        "> In the beginning there was nothing, which exploded.",
        "> Research is what I'm doing when I don't know what I'm doing.",
        "> The best way to predict the future is to invent it.",
        "> Not everything that counts can be counted.",
        "> The important thing is not to stop questioning.",
        "> Science is organized knowledge; wisdom is organized life.",
        "> To err is human; to forgive, divine.",
        "> Knowledge speaks, but wisdom listens.",
        "> The measure of intelligence is the ability to change.",
        "> Education is not the filling of a pail, but the lighting of a fire.",
        "> The only true wisdom is in knowing you know nothing.",
    ]
    for quote in quotes:
        row = {"split": "synthetic", "source_dataset": "synthetic", "text": quote, "label": "blockquote", "section": "body"}
        row.update(compute_features(quote))
        rows.append(row)

    # Code block examples
    code_samples = [
        "```python\ndef hello():\n    print('Hello')\n```",
        "```javascript\nconst x = 42;\nconsole.log(x);\n```",
        "    def train_model(data):",
        "    for item in dataset:",
        "    return result.to_dict()",
        "```\nnpm install express\n```",
        "    const server = express()",
        "    import pandas as pd",
        "```bash\npython main.py --train\n```",
        "    model.fit(X_train, y_train)",
    ]
    for code in code_samples:
        row = {"split": "synthetic", "source_dataset": "synthetic", "text": code, "label": "code_block", "section": "body"}
        row.update(compute_features(code))
        rows.append(row)

    # Extra unordered list examples
    ul_items = [
        "* Install dependencies with npm install",
        "* Configure environment variables",
        "* Run the development server",
        "* Check the test results",
        "* Review the pull request",
        "* Update documentation",
        "* Fix broken imports",
        "* Add error handling",
        "* Implement caching layer",
        "* Write unit tests",
        "* Deploy to staging",
        "* Monitor performance metrics",
    ]
    for item in ul_items:
        row = {"split": "synthetic", "source_dataset": "synthetic", "text": item, "label": "unordered_list", "section": "body"}
        row.update(compute_features(item))
        rows.append(row)

    # Extra ordered list examples
    ol_items = [
        "# Clone the repository",
        "# Install required packages",
        "# Set up the database",
        "# Configure the application",
        "# Run the migration scripts",
        "# Start the development server",
        "# Run the test suite",
        "# Build for production",
        "# Deploy to the cloud",
        "# Verify the deployment",
        "# Monitor the logs",
        "# Update the changelog",
    ]
    for item in ol_items:
        row = {"split": "synthetic", "source_dataset": "synthetic", "text": item, "label": "ordered_list", "section": "body"}
        row.update(compute_features(item))
        rows.append(row)

    return rows


def build_grammar_rows(records: list[dict[str, Any]], split: str) -> list[dict[str, Any]]:
    """
    Convert JFLEG records into source-correction training pairs.

    JFLEG is a fluency corpus: it supplies multiple candidate rewrites per
    sentence with no error category, so error_type stays "fluency".
    """
    rows: list[dict[str, Any]] = []
    for record in records:
        source = str(record.get("sentence", "")).strip()
        corrections = record.get("corrections", [])
        if not source or not isinstance(corrections, list):
            continue
        for index, correction in enumerate(corrections):
            target = str(correction).strip()
            if not target or target == source:
                continue
            rows.append(
                {
                    "split": split,
                    "source_dataset": "jfleg",
                    "source": source,
                    "target": target,
                    "correction_index": index,
                    "source_length": len(source),
                    "target_length": len(target),
                    "error_type": "fluency",
                }
            )
    return rows


def build_conll_rows(
    records: list[dict[str, Any]],
    split: str,
    slug: str = "conll2014",
) -> list[dict[str, Any]]:
    """
    Convert categorised error-annotation records into correction pairs.

    CoNLL-2014 and NUCLE share the sentence/corrected/error_type schema, so one
    builder serves both and the source_dataset column records which corpus each
    row actually came from. Rows that carry no category are kept as
    "uncategorized" rather than discarded so the corpus still contributes
    volume.
    """
    rows: list[dict[str, Any]] = []
    for record in records:
        source = str(record.get("sentence", "")).strip()
        target = str(record.get("corrected", "")).strip()
        if not source or not target or source == target:
            continue
        error_type = str(record.get("error_type", "uncategorized")).strip() or "uncategorized"
        rows.append(
            {
                "split": split,
                "source_dataset": slug,
                "source": source,
                "target": target,
                "correction_index": 0,
                "source_length": len(source),
                "target_length": len(target),
                "error_type": error_type,
            }
        )
    return rows


# The thesis corpora store whole papers, one article per row (the raw arXiv
# mirror is over 13 GB). The plan needs thesis *structure* - abstracts,
# methodology, references - not full article bodies, so passages are truncated
# to a snippet before featurisation and the total contribution is capped. This
# keeps formatting_examples.csv in the same size range WikiText-103 produces.
THESIS_SNIPPET_CHARS = 4000
THESIS_MIN_CHARS = 20
THESIS_MAX_ROWS = 20000


def build_thesis_rows(
    records,
    split: str,
    max_rows: int = THESIS_MAX_ROWS,
) -> list[dict[str, Any]]:
    """
    Convert thesis passages into formatting examples carrying their section.

    Passages are truncated to THESIS_SNIPPET_CHARS and rows shorter than
    THESIS_MIN_CHARS are dropped, because a bare heading such as "Abstract"
    teaches nothing about formatting. Section labels are the point of this
    corpus: it teaches the model that an abstract, a methodology section and a
    reference list are formatted differently from ordinary body prose.
    """
    return build_thesis_rows_streamed(records, split, max_rows)


def read_raw(slug: str, split: str) -> list[dict[str, Any]]:
    """Read one raw split for a corpus, returning an empty list when absent.

    A corpus that failed to download must not break preprocessing, so missing
    files degrade to no rows rather than raising.
    """
    path = os.path.join(RAW_ROOT, slug, f"{split}.jsonl")
    if not os.path.exists(path):
        return []
    return load_jsonl(path)


def stream_raw(slug: str, split: str):
    """Yield records from a raw split without materialising the whole file."""
    path = os.path.join(RAW_ROOT, slug, f"{split}.jsonl")
    if not os.path.exists(path):
        return
    yield from iter_jsonl(path)


def build_thesis_rows_streamed(records, split: str, max_rows: int) -> list[dict[str, Any]]:
    """Build thesis rows from a record iterator, stopping at the row cap."""
    rows: list[dict[str, Any]] = []
    for record in records:
        if len(rows) >= max_rows:
            break
        text = " ".join(str(record.get("text", "")).split())[:THESIS_SNIPPET_CHARS]
        if len(text) < THESIS_MIN_CHARS:
            continue
        row: dict[str, Any] = {
            "split": split,
            "source_dataset": "thesis-structural",
            "text": text,
            "label": infer_format_label(text),
            "section": str(record.get("section", "body")).strip() or "body",
        }
        row.update(compute_features(text))
        rows.append(row)
    return rows


def _write_frame(rows: list[dict[str, Any]], columns: list[str], filename: str) -> pd.DataFrame:
    """Write rows to CSV with a stable column order, creating the frame if empty."""
    ensure_directory(PROCESSED_ROOT)
    if rows:
        frame = pd.DataFrame(rows)
        for column in columns:
            if column not in frame.columns:
                frame[column] = pd.NA
        extras = [c for c in frame.columns if c not in columns]
        frame = frame[columns + extras]
    else:
        frame = pd.DataFrame(columns=columns)
    frame.to_csv(os.path.join(PROCESSED_ROOT, filename), index=False)
    return frame


def preprocess_formatting() -> pd.DataFrame:
    """
    Combine every structural corpus into formatting_examples.csv.

    WikiText-103 supplies the bulk of the hierarchy signal, the thesis corpus
    adds section labels, and synthetic examples backfill rare classes. The
    source_dataset and section columns keep each contribution traceable.
    """
    rows: list[dict[str, Any]] = []
    for split in ("train", "validation", "test"):
        rows.extend(build_formatting_rows(read_raw("wikitext-103", split), split))
        # Streamed because the thesis mirrors are far too large to load whole.
        rows.extend(
            build_thesis_rows_streamed(
                stream_raw("thesis-structural", split), split, THESIS_MAX_ROWS
            )
        )

    rows.extend(generate_synthetic_examples())
    return _write_frame(rows, FORMATTING_COLUMNS, "formatting_examples.csv")


def preprocess_grammar() -> pd.DataFrame:
    """
    Combine every grammar corpus into grammar_examples.csv.

    JFLEG provides multiple fluency rewrites per sentence, while NUCLE and
    CoNLL-2014 provide one categorised correction each. Keeping all three in one
    table with an error_type column lets the checker train on category-specific
    errors and fall back to holistic fluency corrections. NUCLE is included
    ahead of CoNLL-2014 because it is downloadable, while CoNLL-2014 is
    optional and skipped when the user has not supplied it.
    """
    rows: list[dict[str, Any]] = []
    for split in ("train", "validation", "test"):
        rows.extend(build_grammar_rows(read_raw("jfleg", split), split))
        for slug in ("nucle", "conll2014"):
            rows.extend(build_conll_rows(read_raw(slug, split), split, slug=slug))
    return _write_frame(rows, GRAMMAR_COLUMNS, "grammar_examples.csv")


def summarize(frame: pd.DataFrame, name: str) -> None:
    """Print row counts per contributing corpus and error category."""
    print(f"✅ {name}: {len(frame)} rows")
    if len(frame) and "source_dataset" in frame.columns:
        counts = frame["source_dataset"].value_counts().to_dict()
        for dataset, count in sorted(counts.items(), key=lambda item: -item[1]):
            print(f"    {dataset}: {count}")
    if len(frame) and "error_type" in frame.columns:
        categories = frame["error_type"].value_counts().to_dict()
        print(f"    error categories: {len(categories)} ({', '.join(sorted(categories))})")


def main() -> None:
    """Run preprocessing for both formatting and grammar datasets."""
    # Windows consoles default to cp1252, which cannot encode the summary
    # markers, so force UTF-8 output with replacement instead of crashing.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ensure_directory(PROCESSED_ROOT)
    formatting = preprocess_formatting()
    grammar = preprocess_grammar()
    summarize(formatting, "Formatting examples")
    summarize(grammar, "Grammar examples")


if __name__ == "__main__":
    main()