import os
from typing import Iterable

from datasets import DatasetDict, load_dataset


WIKITEXT_NAME = "Salesforce/wikitext"
WIKITEXT_CONFIG = "wikitext-103-raw-v1"
JFLEG_NAME = "jhu-clsp/jfleg"
RAW_ROOT = "ml/dataset/raw"


def ensure_directory(path: str) -> None:
    """Create a directory if it does not already exist."""
    os.makedirs(path, exist_ok=True)


def save_dataset_dict(dataset: DatasetDict, output_dir: str) -> None:
    """Save each split in a dataset dictionary as JSONL files."""
    ensure_directory(output_dir)
    for split_name, split_data in dataset.items():
        output_path = os.path.join(output_dir, f"{split_name}.jsonl")
        split_data.to_json(output_path, orient="records", lines=True, force_ascii=False)
        print(f"Saved {split_name} split to {output_path}")


def write_metadata(path: str, lines: Iterable[str]) -> None:
    """Write simple metadata about the downloaded datasets."""
    with open(path, "w", encoding="utf-8") as metadata_file:
        metadata_file.write("\n".join(lines) + "\n")


def download_wikitext() -> None:
    """Download WikiText-103 raw and save it locally."""
    print("Downloading WikiText-103...")
    dataset = load_dataset(WIKITEXT_NAME, WIKITEXT_CONFIG)
    output_dir = os.path.join(RAW_ROOT, "wikitext-103")
    save_dataset_dict(dataset, output_dir)
    write_metadata(
        os.path.join(output_dir, "README.txt"),
        [
            f"dataset={WIKITEXT_NAME}",
            f"config={WIKITEXT_CONFIG}",
            f"splits={', '.join(dataset.keys())}",
        ],
    )


def download_jfleg() -> None:
    """Download JFLEG and save it locally."""
    print("Downloading JFLEG...")
    dataset = load_dataset(JFLEG_NAME)
    output_dir = os.path.join(RAW_ROOT, "jfleg")
    save_dataset_dict(dataset, output_dir)
    write_metadata(
        os.path.join(output_dir, "README.txt"),
        [
            f"dataset={JFLEG_NAME}",
            f"splits={', '.join(dataset.keys())}",
        ],
    )


def main() -> None:
    """Download all datasets required for Phase 3."""
    ensure_directory(RAW_ROOT)
    download_wikitext()
    download_jfleg()
    print("Dataset download complete.")


if __name__ == "__main__":
    main()