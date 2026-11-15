"""Large-document benchmark in a real browser.

Opens frontend/bench/large-document.html (the paged editor alone, no sign-in or server) from a
Vite dev server, loads a document repeated N times and reports how long it takes to open (until the
pages stop changing), each keystroke's time to the next frame, and how long autosave's serialising
takes.

    cd frontend && npx vite --port 5199 --strictPort      # in another shell
    ml/venv/Scripts/python tests/e2e/large_document_bench.py --copies 1,7,32
    ml/venv/Scripts/python tests/e2e/large_document_bench.py --source "Friend thesis.docx" --copies 1

`--source` names a converted document in tests/fixtures/import_baselines/editor_json (its
.html.gz), or a path to an .html file.
"""
import argparse
import gzip
import json
import statistics
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
BASELINES = ROOT / "tests" / "fixtures" / "import_baselines" / "editor_json"


def read_source(source: str) -> str:
    path = Path(source)
    if path.suffix.lower() in (".html", ".htm") and path.exists():
        return path.read_text(encoding="utf-8")
    return gzip.decompress((BASELINES / f"{source}.html.gz").read_bytes()).decode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:5199/bench/large-document.html")
    parser.add_argument("--source", default="V2 INTELLIDOCS (2).docx")
    parser.add_argument("--copies", default="1,7,32")
    parser.add_argument("--keys", type=int, default=40)
    args = parser.parse_args()

    html = read_source(args.source)
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        for copies in [int(c) for c in args.copies.split(",")]:
            page = browser.new_page(viewport={"width": 1400, "height": 900})
            page.goto(args.url)
            page.wait_for_function("() => window.__bench !== undefined")
            loaded = page.evaluate("(html) => window.__bench.load(html)", html * copies)
            keys = page.evaluate("(n) => window.__bench.type(n)", args.keys)
            serialised = page.evaluate("() => window.__bench.serialise()")
            keys_sorted = sorted(keys)
            result = {
                "copies": copies,
                "pages": loaded["pages"],
                "open_s": round(loaded["ms"] / 1000, 1),
                "key_median_ms": statistics.median(keys_sorted),
                "key_p90_ms": keys_sorted[int(len(keys_sorted) * 0.9)],
                "key_max_ms": keys_sorted[-1],
                "get_html_ms": serialised["htmlMs"],
                "get_json_ms": serialised["jsonMs"],
            }
            print(json.dumps(result), flush=True)
            results.append(result)
            page.close()
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
