"""The editor JSON each fixture imports as today: the target the converter's own JSON writer must match.

Stage 2a moves the converter onto an intermediate model and has it write the editor's JSON directly,
instead of HTML the editor parses. Two references keep that move honest:
- the converter's HTML, which must stay byte-identical while code moves between the old writers and
  the model;
- the editor JSON the real import path produces from that HTML (dev editor harness, the same load
  path as the Document page), which the new JSON writer must reproduce.

usage (repo root; `record` and `check` need the frontend dev server on 5173):
    ml/venv/Scripts/python tests/e2e/tools/editor_json_reference.py record            # write the references
    ml/venv/Scripts/python tests/e2e/tools/editor_json_reference.py check             # exit 1 on any difference
    ml/venv/Scripts/python tests/e2e/tools/editor_json_reference.py check --html-only # no browser needed

References live in tests/fixtures/import_baselines/editor_json/, gzipped, with every embedded picture
replaced by a hash of its data (the pictures are what make them large, and a changed picture still
shows). The manifest ties each to the SHA-256 of its fixture.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import fidelity_run as fr  # noqa: E402

FIXTURES = HERE.parents[1] / "fixtures" / "import_baselines" / "documents"
REFERENCES = HERE.parents[1] / "fixtures" / "import_baselines" / "editor_json"
MANIFEST = REFERENCES / "manifest.json"

_DATA_URI = re.compile(r"data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)")


def _picture_hash(match: re.Match) -> str:
    return f"data:{match.group(1)};sha256,{hashlib.sha256(match.group(2).encode()).hexdigest()[:16]}"


def strip_pictures(value: Any) -> Any:
    """Replace every base64 data URI with its type and a hash of its data, anywhere in a value."""
    if isinstance(value, str):
        return _DATA_URI.sub(_picture_hash, value)
    if isinstance(value, list):
        return [strip_pictures(item) for item in value]
    if isinstance(value, dict):
        return {key: strip_pictures(item) for key, item in value.items()}
    return value


def fixtures(only: str | None) -> list[Path]:
    chosen = [f for f in sorted(FIXTURES.iterdir()) if f.suffix in (".docx", ".pdf")]
    return [f for f in chosen if not only or only in f.name]


def editor_json(browser, web: str, payload: dict) -> dict:
    """The document the editor holds right after importing a converted fixture."""
    context = browser.new_context(viewport={"width": 1300, "height": 1250})
    page = context.new_page()
    page.route("**fonts.googleapis.com**", lambda r: r.abort())
    page.route("**fonts.gstatic.com**", lambda r: r.abort())
    page.add_init_script("window.__FIDELITY__ = " + json.dumps(payload))
    try:
        page.goto(f"{web}/dev/editor-harness", wait_until="domcontentloaded")
        page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=90000)
        page.wait_for_function("() => window.__editor && window.__editor.state.doc.content.size > 2", timeout=90000)
        return page.evaluate("window.__editor.getJSON()")
    finally:
        context.close()


def first_difference(a: Any, b: Any, path: str = "") -> str | None:
    """A JSON-pointer-like path to the first place two values differ, with both values; None if equal."""
    if type(a) is not type(b):
        return f"{path or '/'}: {type(a).__name__} vs {type(b).__name__}"
    if isinstance(a, dict):
        for key in sorted(set(a) | set(b)):
            if key not in a or key not in b:
                return f"{path}/{key}: {'missing' if key not in a else repr(a[key])[:80]} vs {'missing' if key not in b else repr(b[key])[:80]}"
            found = first_difference(a[key], b[key], f"{path}/{key}")
            if found:
                return found
        return None
    if isinstance(a, list):
        for index, (x, y) in enumerate(zip(a, b)):
            found = first_difference(x, y, f"{path}/{index}")
            if found:
                return found
        return None if len(a) == len(b) else f"{path}: {len(a)} items vs {len(b)}"
    return None if a == b else f"{path}: {repr(a)[:80]} vs {repr(b)[:80]}"


def read_gz(path: Path) -> str:
    return gzip.decompress(path.read_bytes()).decode("utf-8")


def write_gz(path: Path, text: str) -> None:
    # mtime=0: the same content always gives the same bytes, so an unchanged reference is no git change.
    path.write_bytes(gzip.compress(text.encode("utf-8"), mtime=0))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=("record", "check"))
    parser.add_argument("--web", default="http://localhost:5173")
    parser.add_argument("--only", help="only fixtures whose file name contains this text")
    parser.add_argument("--html-only", action="store_true", help="check the converter HTML only (no browser)")
    args = parser.parse_args(argv)

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.is_file() else {}
    REFERENCES.mkdir(parents=True, exist_ok=True)
    differences = 0
    browser = playwright = None
    if not args.html_only:
        from playwright.sync_api import sync_playwright

        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(headless=True, channel="chrome")
    try:
        for fixture in fixtures(args.only):
            digest = hashlib.sha256(fixture.read_bytes()).hexdigest()
            result = fr.convert(fixture)
            html = strip_pictures(result["html"])
            doc = None if args.html_only else strip_pictures(editor_json(browser, args.web, fr.to_payload(result)))
            html_file, json_file = REFERENCES / f"{fixture.name}.html.gz", REFERENCES / f"{fixture.name}.json.gz"

            if args.mode == "record":
                write_gz(html_file, html)
                write_gz(json_file, json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
                manifest[fixture.name] = {"fixture_sha256": digest}
                print(f"recorded {fixture.name}: html {len(html):,} chars, editor JSON {json_file.stat().st_size:,} bytes gzipped")
                continue

            entry = manifest.get(fixture.name)
            if not entry or not html_file.is_file() or not json_file.is_file():
                print(f"NO REFERENCE  {fixture.name}: run record")
                differences += 1
                continue
            if entry["fixture_sha256"] != digest:
                print(f"STALE         {fixture.name}: the fixture changed since its reference was recorded")
                differences += 1
                continue
            problems = []
            if read_gz(html_file) != html:
                old = read_gz(html_file)
                at = next((i for i, (x, y) in enumerate(zip(old, html)) if x != y), min(len(old), len(html)))
                problems.append(f"converter HTML differs at char {at}: {old[max(0, at - 40):at + 40]!r} vs {html[max(0, at - 40):at + 40]!r}")
            if doc is not None:
                found = first_difference(json.loads(read_gz(json_file)), doc)
                if found:
                    problems.append(f"editor JSON differs at {found}")
            print(("same          " if not problems else "DIFFERENT     ") + fixture.name)
            for problem in problems:
                print("   ", problem)
            differences += bool(problems)
    finally:
        if browser:
            browser.close()
        if playwright:
            playwright.stop()

    if args.mode == "record":
        MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        return 0
    return 1 if differences else 0


if __name__ == "__main__":
    sys.exit(main())
