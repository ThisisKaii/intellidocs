"""
Modular dataset registry for IntelliDocs pre-training.

Each corpus is a self-contained DatasetSpec so a new benchmark can be added by
appending one entry to DATASETS rather than editing the download flow. Every
loader is allowed to fail: a corpus that is unavailable locally is reported and
skipped so the rest of the suite still downloads. The one exception is a corpus
the plan requires for pre-training (WikiText-103), which is treated as fatal.
"""
import json
import os
import re
import traceback
from dataclasses import dataclass, field
from typing import Callable

from datasets import DatasetDict, load_dataset

from m2 import classify_error_type, parse_m2


RAW_ROOT = "ml/dataset/raw"


class LocalSplit:
    """Minimal split wrapper for corpora parsed from local files."""

    def __init__(self, rows: list[dict[str, str]]):
        self.rows = rows


def ensure_directory(path: str) -> None:
    """Create a directory if it does not already exist."""
    os.makedirs(path, exist_ok=True)


def _list_to_split(rows: list[dict[str, str]]) -> "LocalSplit":
    """Wrap plain dict rows in the small split interface used by the writers."""
    return LocalSplit(rows)


def save_dataset_dict(dataset: DatasetDict, output_dir: str) -> None:
    """Save each split in a dataset dictionary as JSONL files.

    Handles both real datasets splits and the LocalSplit wrapper used for
    corpora parsed locally from files rather than downloaded from the Hub.
    """
    ensure_directory(output_dir)
    for split_name, split_data in dataset.items():
        output_path = os.path.join(output_dir, f"{split_name}.jsonl")
        if hasattr(split_data, "to_json"):
            split_data.to_json(output_path, orient="records", lines=True, force_ascii=False)
        else:
            with open(output_path, "w", encoding="utf-8") as handle:
                for row in split_data.rows:
                    handle.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"Saved {split_name} split to {output_path}")


def write_metadata(path: str, lines: list[str]) -> None:
    """Write simple metadata about the downloaded dataset."""
    with open(path, "w", encoding="utf-8") as metadata_file:
        metadata_file.write("\n".join(lines) + "\n")


@dataclass(frozen=True)
class DatasetSpec:
    """One corpus in the pre-training registry.

    slug: directory name under ml/dataset/raw.
    loader: callable that downloads the corpus and returns a DatasetDict.
    required: when True a download failure aborts the run. The plan requires
        WikiText-103 for base-model pre-training, so that corpus is mandatory.
    description: recorded in the per-dataset README.
    tags: free-form labels recorded in metadata for provenance.
    """

    slug: str
    label: str
    loader: Callable[[], DatasetDict]
    required: bool = False
    description: str = ""
    tags: list[str] = field(default_factory=list)


# ─── Loaders ────────────────────────────────────────────────────────────────


def load_wikitext() -> DatasetDict:
    """Load WikiText-103 raw, the structural text-hierarchy corpus."""
    return load_dataset("Salesforce/wikitext", "wikitext-103-raw-v1")


def load_jfleg() -> DatasetDict:
    """Load JFLEG, the holistic grammar fluency corpus."""
    return load_dataset("jhu-clsp/jfleg")


CONLL_LOCAL_DIR = "conll2014"

# CoNLL-2014 itself is distributed only by the shared task organisers under an
# LDC licence, so it cannot be downloaded. The registry reads a user-supplied
# JSONL file per split instead, with the schema preprocess.py consumes. The
# official .m2 needs a one-off conversion, which ml/dataset/convert_conll_m2.py
# performs; it is kept here only so the loader can describe the format.
CONLL_REQUIRED_FIELDS = ("sentence", "corrected", "error_type")


def normalize_conll_record(record: dict) -> dict[str, str] | None:
    """
    Validate and normalize one user-supplied CoNLL row.

    Returns None when the row cannot contribute a training pair so callers can
    drop it. The error type goes through the shared classifier so raw MISC
    annotations and already-broadened labels normalize identically.
    """
    if not isinstance(record, dict):
        return None

    source = str(record.get("sentence", "")).strip()
    target = str(record.get("corrected", "")).strip()
    if not source or not target or source == target:
        return None

    return {
        "sentence": source,
        "corrected": target,
        "error_type": classify_error_type(str(record.get("error_type", ""))),
    }


def load_conll2014() -> DatasetDict:
    """
    Load CoNLL-2014 from a manually supplied JSONL file.

    CoNLL-2014 is not published on the Hugging Face Hub, so it cannot be
    fetched here. Convert the official .m2 with convert_conll_m2.py and place
    the result in ml/dataset/raw/conll2014/, one file per split, with each line
    containing sentence, corrected and error_type. When no usable file is
    present this raises so the registry reports the corpus as skipped rather
    than silently yielding an empty grammar set.
    """
    directory = os.path.join(RAW_ROOT, CONLL_LOCAL_DIR)
    splits: dict[str, list[dict[str, str]]] = {}

    if os.path.isdir(directory):
        for name in sorted(os.listdir(directory)):
            if not name.lower().endswith(".jsonl"):
                continue
            split = os.path.splitext(name)[0]
            rows: list[dict[str, str]] = []
            with open(os.path.join(directory, name), "r", encoding="utf-8") as handle:
                for line_number, line in enumerate(handle, start=1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                    except json.JSONDecodeError as error:
                        print(f"  {name}:{line_number}: skipping invalid JSON ({error.msg})")
                        continue
                    normalized = normalize_conll_record(record)
                    if normalized is not None:
                        rows.append(normalized)
            if rows:
                splits[split] = rows

    if not splits:
        raise RuntimeError(
            "No CoNLL-2014 data found. This corpus is not on the Hugging Face Hub: "
            f"convert the official .m2 to JSONL and place it in {CONLL_LOCAL_DIR}/ "
            "with one file per split, each line containing "
            f"{', '.join(CONLL_REQUIRED_FIELDS)}. Note that the NUCLE corpus "
            "(nusnlp/NUCLE) is a different dataset and does not substitute for it."
        )

    total = sum(len(rows) for rows in splits.values())
    print(f"  loaded {total} CoNLL-2014 pairs from {', '.join(sorted(splits))}")
    return DatasetDict({split: _list_to_split(rows) for split, rows in splits.items()})


# NUCLE is the NUS Corpus of Learner English. It is NOT CoNLL-2014: it is a
# separate collection of essays, distributed by NUS with its own licence. What
# makes it useful here is that its shared-task release annotates the essays with
# the 28 CoNLL-2014 error types, so it supplies the categorised grammar data
# that CoNLL-2014 itself would. It is registered as its own corpus so the
# source_dataset column never misattributes NUCLE rows to CoNLL.
NUCLE_REPO_ID = "nusnlp/NUCLE"
NUCLE_M2_FILE = "data/conll14st-preprocessed.m2"


def load_nucle() -> DatasetDict:
    """
    Load NUCLE with CoNLL-2014-style error categories from the Hub.

    The corpus ships as an M2 file rather than a datasets-parseable format, so
    it is fetched with huggingface_hub and converted by the shared M2 parser.
    The shared-task release is preferred over the BEA 2019 gold file because it
    carries the 28 CoNLL-2014 category names, and both describe the same
    sentences.
    """
    from huggingface_hub import hf_hub_download

    path = hf_hub_download(repo_id=NUCLE_REPO_ID, repo_type="dataset", filename=NUCLE_M2_FILE)
    records = parse_m2(path)
    if not records:
        raise RuntimeError(f"NUCLE file {NUCLE_M2_FILE} produced no usable records.")
    return DatasetDict({"train": _list_to_split(records)})



def load_thesis_structural() -> DatasetDict:
    """
    Load a thesis/arxiv-derived corpus for realistic academic structure.

    WikiText-103 covers prose hierarchy but not thesis-specific sections, so a
    small arXiv-derived slice is pulled for abstract, methodology and
    bibliography formatting. The mirror list is tried in order and the caller
    degrades gracefully when none resolve.
    """
    mirrors = (
        "armanc/scientific_papers",
        "ccdv/arxiv-summarization",
    )
    last_error: Exception | None = None
    for name in mirrors:
        try:
            raw = load_dataset(name)
        except Exception as error:  # noqa: BLE001 - try the next mirror
            last_error = error
            continue
        return _normalize_thesis_splits(raw)

    raise RuntimeError(f"No thesis corpus mirror available: {last_error}")


THESIS_SECTION_PATTERNS = (
    ("abstract", ("abstract",)),
    ("methodology", ("methodology", "methods", "method", "materials and methods", "approach")),
    ("results", ("results", "findings", "discussion")),
    ("conclusion", ("conclusion", "concluding remarks", "conclusions")),
    ("references", ("references", "bibliography", "works cited")),
)

# Theses number their sections: "2. Methodology", "2.1 Experimental Setup",
# "CHAPTER 3: RESULTS", "IV. CONCLUSION". Strip that scaffolding before
# matching so a numbered heading is still recognised.
THESIS_HEADING_PREFIX = re.compile(
    r"^\s*(?:chapter\s+|section\s+)?(?:\d+(?:\.\d+)*\.?|[ivxlcdm]+\.?)?\s*[:.\-]?\s*",
    re.IGNORECASE,
)


def classify_thesis_section(text: str) -> str:
    """Label a thesis passage with the section heading it resembles."""
    lowered = (text or "").strip().lower()
    for section, markers in THESIS_SECTION_PATTERNS:
        for marker in markers:
            if lowered.startswith(marker) or lowered == marker:
                return section

    stripped = THESIS_HEADING_PREFIX.sub("", lowered)
    if stripped != lowered:
        for section, markers in THESIS_SECTION_PATTERNS:
            for marker in markers:
                if stripped.startswith(marker) or stripped == marker:
                    return section
    return "body"


# The arXiv mirrors expose the abstract and the body as separate columns. Both
# carry formatting signal - an abstract is written in a deliberately different
# register from a methodology section - so both are emitted as their own rows
# rather than collapsing each paper into a single body passage.
THESIS_ABSTRACT_FIELDS = ("abstract", "summary")
THESIS_BODY_FIELDS = ("article", "text", "document")


def _expand_thesis_example(example: dict, columns: list[str]) -> list[dict]:
    """Expand one paper into its abstract and body rows."""
    rows: list[dict] = []

    def first_text(keys: tuple[str, ...]) -> str:
        for key in keys:
            if key in columns and example.get(key):
                return str(example[key]).strip()
        return ""

    abstract = first_text(THESIS_ABSTRACT_FIELDS)
    if abstract:
        rows.append({"text": abstract, "section": "abstract"})

    body = first_text(THESIS_BODY_FIELDS)
    if body:
        # Body text rarely opens with a heading, but when it does the heading
        # is a stronger label than the default "body".
        rows.append({"text": body, "section": classify_thesis_section(body)})

    return rows


def _normalize_thesis_splits(raw: DatasetDict) -> DatasetDict:
    """
    Project thesis columns onto one text-plus-section row per section.

    A single paper expands into at most two rows: its abstract and its body.
    Taking only the first available column, as an earlier version did, always
    picked the body and silently discarded every abstract in the corpus.

    Expansion uses map(batched=True) rather than flat_map, which datasets does
    not provide: a batched map whose function returns lists is how the library
    flattens one input record into several output records.
    """
    normalized: DatasetDict = {}
    for split_name, split_data in raw.items():
        columns = list(split_data.column_names)

        def expand_batch(batch: dict, columns: list[str] = columns) -> dict[str, list]:
            """Expand a batch of papers into abstract and body rows."""
            batch_size = len(batch[columns[0]])
            texts: list[str] = []
            sections: list[str] = []
            for index in range(batch_size):
                example = {column: batch[column][index] for column in columns}
                for row in _expand_thesis_example(example, columns):
                    texts.append(row["text"])
                    sections.append(row["section"])
            return {"text": texts, "section": sections}

        normalized[split_name] = split_data.map(
            expand_batch, batched=True, remove_columns=columns
        )
    return normalized


# ─── Registry ───────────────────────────────────────────────────────────────


DATASETS: tuple[DatasetSpec, ...] = (
    DatasetSpec(
        slug="wikitext-103",
        label="WikiText-103",
        loader=load_wikitext,
        required=True,
        description="Structural text hierarchy: headings, paragraphs, lists, quotes.",
        tags=["formatting", "structure"],
    ),
    DatasetSpec(
        slug="jfleg",
        label="JFLEG",
        loader=load_jfleg,
        required=True,
        description="Holistic grammar fluency and correction pairs.",
        tags=["grammar", "fluency"],
    ),
    DatasetSpec(
        slug="nucle",
        label="NUCLE (NUS Corpus of Learner English)",
        loader=load_nucle,
        description=(
            "Learner essays annotated with the 28 CoNLL-2014 error categories. "
            "Not CoNLL-2014 itself, but supplies the same kind of categorised data."
        ),
        tags=["grammar", "error_detection", "categorized", "learner_essays"],
    ),
    DatasetSpec(
        slug="conll2014",
        label="CoNLL-2014",
        loader=load_conll2014,
        description="Grammatical error detection with category-specific tags.",
        tags=["grammar", "error_detection", "categorized", "manual_source"],
    ),
    DatasetSpec(
        slug="thesis-structural",
        label="Academic Thesis / arXiv subset",
        loader=load_thesis_structural,
        description="Realistic thesis sections: abstracts, methodology, references.",
        tags=["formatting", "academic_structure"],
    ),
)


def download_dataset(spec: DatasetSpec) -> bool:
    """Download one corpus, reporting success or a skippable failure."""
    output_dir = os.path.join(RAW_ROOT, spec.slug)
    print(f"Downloading {spec.label}...")
    try:
        dataset = spec.loader()
    except Exception as error:  # noqa: BLE001 - surface then decide
        if spec.required:
            print(f"FAILED required dataset {spec.label}: {error}")
            traceback.print_exc()
            raise
        print(f"SKIPPED {spec.label}: {error}")
        print("        Continuing without it; see the manual steps list to source it manually.")
        return False

    save_dataset_dict(dataset, output_dir)
    write_metadata(
        os.path.join(output_dir, "README.txt"),
        [
            f"dataset={spec.label}",
            f"slug={spec.slug}",
            f"description={spec.description}",
            f"tags={', '.join(spec.tags)}",
            f"splits={', '.join(dataset.keys())}",
        ],
    )
    return True


def download_all(slugs: list[str] | None = None) -> dict[str, bool]:
    """Download the requested corpora and report which ones succeeded.

    slugs=None downloads the whole registry. An explicit list downloads only
    those corpora, so an empty list is a no-op rather than "everything".
    """
    ensure_directory(RAW_ROOT)
    known = {spec.slug for spec in DATASETS}
    unknown = set(slugs or []) - known
    if unknown:
        raise ValueError(f"Unknown dataset slug(s): {', '.join(sorted(unknown))}")

    selected = list(DATASETS) if slugs is None else [spec for spec in DATASETS if spec.slug in slugs]

    results: dict[str, bool] = {}
    for spec in selected:
        results[spec.slug] = download_dataset(spec)
    return results


def main() -> None:
    """Download every corpus in the registry."""
    print("Downloading IntelliDocs pre-training corpora...\n")
    results = download_all()
    print("\nDownload summary:")
    for slug, ok in results.items():
        print(f"  {'ok  ' if ok else 'skip'}  {slug}")
    if not all(results.values()):
        print(
            "\nSome corpora were skipped. Formatting and grammar pre-training still "
            "works, but error categories and thesis structure will be absent."
        )
    print("\nDataset download complete.")


if __name__ == "__main__":
    main()
