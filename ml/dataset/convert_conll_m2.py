"""
Convert an official CoNLL-2014 .m2 file into the JSONL layout download.py reads.

CoNLL-2014 is distributed only by the shared task organisers under an LDC
licence and is not mirrored on the Hugging Face Hub, so it cannot be fetched
automatically. This script is the one-off bridge: point it at the official
.m2 and it writes the JSONL that load_conll2014() consumes.

The parsing itself lives in m2.py, which is shared with the NUCLE loader and is
verified against real M2 files, so both dialects are handled there. Run with
--help for usage.
"""
import argparse
import json
import os
import sys

from m2 import M2ParseError, parse_m2


# Kept in step with preprocess.py so the same JSONL is read from either side.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTPUT_DIR = os.path.join(REPO_ROOT, "ml", "dataset", "raw", "conll2014")


def write_jsonl(records: list[dict[str, str]], path: str) -> None:
    """Write records to a UTF-8 JSONL file, creating the parent directory."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def main() -> None:
    """Convert the given .m2 file into the JSONL layout load_conll2014 reads."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Convert a CoNLL-2014 .m2 file to JSONL")
    parser.add_argument("source", help="path to the official .m2 file")
    parser.add_argument(
        "--out",
        default=os.path.join(OUTPUT_DIR, "train.jsonl"),
        help="output JSONL path (default: ml/dataset/raw/conll2014/train.jsonl)",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.source):
        parser.error(f"no such file: {args.source}")

    try:
        records = parse_m2(args.source)
    except M2ParseError as error:
        parser.error(str(error))

    write_jsonl(records, args.out)

    categories: dict[str, int] = {}
    for record in records:
        categories[record["error_type"]] = categories.get(record["error_type"], 0) + 1

    print(f"Converted {len(records)} sentences -> {args.out}")
    print("Error categories:")
    for name, count in sorted(categories.items(), key=lambda pair: -pair[1]):
        print(f"  {name:20s} {count:>7,}")
    print("\nNext: re-run preprocess.py to fold these into grammar_examples.csv")


if __name__ == "__main__":
    main()
