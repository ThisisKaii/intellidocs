"""
Reclaim disk used by generated dataset artifacts.

The thesis mirrors expand to over 13 GB of raw JSONL and the combined
formatting table is close to 1 GB, which is a real cost on a 16 GB machine.
Everything under raw/ and processed/ is gitignored and reproducible by
re-running download.py and preprocess.py, so it can be deleted freely - with
one exception.

CoNLL-2014 is NOT on the Hugging Face Hub and has to be supplied by hand, so
its raw directory is protected and never removed, whatever flags are passed.

Deleting is opt-in twice: the script only reports sizes unless a --prune flag
is given, and the flag alone still requires --yes to actually unlink anything.
"""
import argparse
import os
import shutil
import sys


# Resolve roots from this file so the script finds the same directories that
# download.py and preprocess.py use, regardless of the working directory.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW_ROOT = os.path.join(REPO_ROOT, "ml", "dataset", "raw")
PROCESSED_ROOT = os.path.join(REPO_ROOT, "ml", "dataset", "processed")

# Corpora the user supplied by hand. These cannot be re-downloaded, so they are
# never deleted. Adding a manual corpus here is the only step needed to make
# cleanup.py safe for it.
PROTECTED_RAW = frozenset({"conll2014"})


def directory_size(path: str) -> int:
    """Return the total size in bytes of every file under a directory."""
    total = 0
    for folder, _dirs, files in os.walk(path):
        for name in files:
            file_path = os.path.join(folder, name)
            if os.path.isfile(file_path):
                total += os.path.getsize(file_path)
    return total


def human_size(num_bytes: int) -> str:
    """Format a byte count using binary units for readability."""
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{size:.1f} TB"


def list_corpora(raw_root: str = RAW_ROOT) -> list[dict[str, object]]:
    """Describe each raw corpus directory with its size and protected flag."""
    if not os.path.isdir(raw_root):
        return []
    corpora: list[dict[str, object]] = []
    for name in sorted(os.listdir(raw_root)):
        path = os.path.join(raw_root, name)
        if not os.path.isdir(path):
            continue
        corpora.append(
            {
                "name": name,
                "path": path,
                "size": directory_size(path),
                "protected": name in PROTECTED_RAW,
            }
        )
    return corpora


def list_processed(processed_root: str = PROCESSED_ROOT) -> list[dict[str, object]]:
    """Describe each generated CSV under the processed root with its size."""
    if not os.path.isdir(processed_root):
        return []
    files: list[dict[str, object]] = []
    for name in sorted(os.listdir(processed_root)):
        path = os.path.join(processed_root, name)
        if os.path.isfile(path) and name.endswith(".csv"):
            files.append({"name": name, "path": path, "size": os.path.getsize(path)})
    return files


def report(raw_root: str = RAW_ROOT, processed_root: str = PROCESSED_ROOT) -> int:
    """Print a size breakdown and return the total reclaimable bytes."""
    print("Raw corpora (ml/dataset/raw):")
    raw_total = 0
    for corpus in list_corpora(raw_root):
        raw_total += int(corpus["size"])
        flag = "protected" if corpus["protected"] else "regenerable"
        print(f"  {corpus['name']:24s} {human_size(int(corpus['size'])):>10s}  ({flag})")
    if not list_corpora(raw_root):
        print("  (none)")
    print("\nProcessed tables (ml/dataset/processed):")
    processed_total = 0
    for item in list_processed(processed_root):
        processed_total += int(item["size"])
        print(f"  {item['name']:24s} {human_size(int(item['size'])):>10s}")
    if not list_processed(processed_root):
        print("  (none)")

    total = raw_total + processed_total
    print(f"\nTotal on disk: {human_size(total)}")
    return total


def prune_raw(
    confirm: bool = False,
    raw_root: str = RAW_ROOT,
    only: set[str] | None = None,
) -> int:
    """
    Delete regenerable raw corpora, never the manually supplied ones.

    Returns the number of bytes reclaimed. With confirm=False the corpora that
    would be removed are only listed, so a dry run is the default. When only is
    given, just those corpora are considered, which is how the multi-gigabyte
    thesis mirror is dropped without also losing WikiText-103.
    """
    removed = 0
    for corpus in list_corpora(raw_root):
        name = str(corpus["name"])
        size = int(corpus["size"])
        if corpus["protected"]:
            print(f"  keep        {name} ({human_size(size)}) - supplied by hand")
            continue
        if only is not None and name not in only:
            print(f"  keep        {name} ({human_size(size)}) - not selected")
            continue
        if not confirm:
            print(f"  would remove {name} ({human_size(size)})")
            continue
        shutil.rmtree(str(corpus["path"]))
        removed += size
        print(f"  removed     {name} ({human_size(size)})")
    return removed


def prune_processed(
    confirm: bool = False,
    processed_root: str = PROCESSED_ROOT,
    only: set[str] | None = None,
) -> int:
    """
    Delete generated CSVs, returning the number of bytes reclaimed.

    When only is given, just those filenames are removed. This matters because
    formatting_examples.csv is the training set: a blanket prune would delete
    the data base_trainer.py needs and force a full re-preprocess.
    """
    removed = 0
    for item in list_processed(processed_root):
        name = str(item["name"])
        size = int(item["size"])
        if only is not None and name not in only:
            print(f"  keep        {name} ({human_size(size)}) - not selected")
            continue
        if not confirm:
            print(f"  would remove {name} ({human_size(size)})")
            continue
        os.remove(str(item["path"]))
        removed += size
        print(f"  removed     {name} ({human_size(size)})")
    return removed


def main() -> None:
    """Report dataset disk usage and optionally reclaim it."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--prune-raw", action="store_true", help="delete regenerable raw corpora")
    parser.add_argument("--prune-processed", action="store_true", help="delete generated CSVs")
    parser.add_argument(
        "--corpus",
        action="append",
        help="limit --prune-raw to this corpus (repeatable); default is all regenerable",
    )
    parser.add_argument(
        "--file",
        action="append",
        help="limit --prune-processed to this CSV (repeatable); default is all CSVs",
    )
    parser.add_argument("--yes", action="store_true", help="actually delete (otherwise dry run)")
    args = parser.parse_args()

    # Windows consoles default to a legacy code page and cannot print the
    # checkmark used in preprocess.py summaries.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    report()

    if not args.prune_raw and not args.prune_processed:
        print("\nNothing deleted. Add --prune-raw or --prune-processed to reclaim space.")
        print("Manually supplied corpora are always kept.")
        return

    confirm = args.yes
    reclaimed = 0
    if args.prune_raw:
        print("\nRaw corpora:")
        reclaimed += prune_raw(confirm=confirm, only=set(args.corpus) if args.corpus else None)
    if args.prune_processed:
        print("\nProcessed tables:")
        reclaimed += prune_processed(confirm=confirm, only=set(args.file) if args.file else None)

    if not confirm:
        print("\nDry run only. Re-run with --yes to actually delete.")
    else:
        print(f"\nReclaimed {human_size(reclaimed)}.")


if __name__ == "__main__":
    main()
