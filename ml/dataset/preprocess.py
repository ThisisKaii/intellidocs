import json
import os
from typing import Any

import pandas as pd


RAW_ROOT = "dataset/raw"
PROCESSED_ROOT = "dataset/processed"


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
    if stripped.startswith("```") or stripped.startswith("    "):
        return "code_block"
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
        row: dict[str, Any] = {"split": split, "text": text, "label": label}
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
            row: dict[str, Any] = {"split": "synthetic", "text": pattern, "label": "heading2"}
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
            row = {"split": "synthetic", "text": pattern, "label": "heading3"}
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
        row = {"split": "synthetic", "text": quote, "label": "blockquote"}
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
        row = {"split": "synthetic", "text": code, "label": "code_block"}
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
        row = {"split": "synthetic", "text": item, "label": "unordered_list"}
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
        row = {"split": "synthetic", "text": item, "label": "ordered_list"}
        row.update(compute_features(item))
        rows.append(row)

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

    # Add synthetic examples for underrepresented classes
    rows.extend(generate_synthetic_examples())

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