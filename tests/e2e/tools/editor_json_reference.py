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
    ml/venv/Scripts/python tests/e2e/tools/editor_json_reference.py check --json      # the converter's own JSON

References live in tests/fixtures/import_baselines/editor_json/, gzipped, with every embedded picture
replaced by a hash of its data (the pictures are what make them large, and a changed picture still
shows). The manifest ties each to the SHA-256 of its fixture.
"""

from __future__ import annotations

import argparse
import difflib
import gzip
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Optional

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import fidelity_run as fr  # noqa: E402
import converter  # noqa: E402  (the same module fidelity_run converts with)

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


# Differences the JSON writer cannot remove yet, by path, with the Stage 2a slice that removes them.
KNOWN_DIFFERENCES = {
    "/attrs/overlay": "anchors slice: a later pass over the HTML tags the paragraph a box hangs beside",
}

# Paragraphs inside these are written by other parts of the converter (tables, lists, quotes).
_OTHER_CONTAINERS = {"table", "listItem", "blockquote", "bulletList", "orderedList"}


def reference_paragraphs(doc: dict) -> list[dict]:
    """The body paragraphs and headings of a reference document, in order (not those in tables, lists or quotes)."""
    found: list[dict] = []

    def walk(node: dict) -> None:
        if node.get("type") in _OTHER_CONTAINERS:
            return
        if node.get("type") in ("paragraph", "heading"):
            found.append(node)
            return
        for child in node.get("content", []):
            walk(child)

    walk(doc)
    return found


def text_key(text: str) -> str:
    """Text with all whitespace removed."""
    return re.sub(r"\s+", "", text)


def html_style(html: str) -> Optional[str]:
    """The editor's style attribute for a paragraph's HTML (frontend filterStyle), to pair it with its node."""
    found = re.match(r'<(?:p|h[1-6])\b[^>]*?\sstyle="([^"]*)"', html)
    return converter._editor_style(found.group(1)) if found else None


def node_text(node: dict) -> str:
    return "".join(child.get("text", "") for child in node.get("content", []))


def deep_text(node: dict) -> str:
    """All the text inside a node, at any depth."""
    return node.get("text", "") + "".join(deep_text(child) for child in node.get("content", []))


def reference_lists(doc: dict) -> list[dict]:
    """The top-level lists of a reference document, in order (not those nested in lists or in tables)."""
    found: list[dict] = []

    def walk(node: dict) -> None:
        if node.get("type") in ("orderedList", "bulletList"):
            found.append(node)
            return
        if node.get("type") in ("table", "blockquote"):
            return
        for child in node.get("content", []):
            walk(child)

    walk(doc)
    return found


def check_lists(recorded: list[dict], body: str, reference: dict) -> tuple[dict, list[str]]:
    """Compare the lists the writer built with the reference's, paired in order by their text."""
    survivors = {int(n) for n in re.findall(r'data-sink-list="(\d+)"', body)}
    counts = {"lists written": 0, "lists same": 0, "lists different": 0, "lists not written": 0, "lists unpaired": 0}
    problems: list[str] = []
    ours = [(i, entry["node"]) for i, entry in enumerate(recorded) if i in survivors and entry["ok"]]
    counts["lists not written"] = sum(1 for i, entry in enumerate(recorded) if i in survivors and not entry["ok"])
    theirs = reference_lists(reference)
    pairs = {}
    matcher = difflib.SequenceMatcher(None, [text_key(deep_text(n)) for _, n in ours], [text_key(deep_text(n)) for n in theirs], autojunk=False)
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            pairs[block.a + offset] = block.b + offset
    for position, (index, node) in enumerate(ours):
        counts["lists written"] += 1
        match = pairs.get(position)
        if match is None:
            counts["lists unpaired"] += 1
            problems.append(f"list {index} {deep_text(node)[:30]!r} pairs with no reference list")
            continue
        found = first_difference(strip_pictures(theirs[match]), strip_pictures(node))
        if found:
            counts["lists different"] += 1
            problems.append(f"list {index} {deep_text(node)[:30]!r}: {found}")
        else:
            counts["lists same"] += 1
    return counts, problems


def check_json(fixture: Path, reference: dict) -> tuple[dict, list[str]]:
    """Compare the converter's paragraph JSON with the reference's paragraphs, paired in order by text."""
    converter._JSON_SINK, converter._JSON_SINK_HTML, converter._JSON_LIST_SINK = [], [], []
    try:
        body = fr.convert(fixture)["html"]
        recorded, recorded_html = list(converter._JSON_SINK), list(converter._JSON_SINK_HTML)
        recorded_lists = list(converter._JSON_LIST_SINK)
    finally:
        converter._JSON_SINK, converter._JSON_SINK_HTML, converter._JSON_LIST_SINK = None, None, None
    # Measuring must not change the conversion: without its tags the body is the recorded HTML.
    untagged = strip_pictures(re.sub(r' data-sink(?:-list)?="\d+"', "", body))
    if untagged != read_gz(REFERENCES / f"{fixture.name}.html.gz"):
        raise SystemExit(f"{fixture.name}: measuring changed the converter's HTML; the JSON check would be meaningless")
    paragraphs = reference_paragraphs(reference)
    counts = {"written": 0, "same": 0, "different": 0, "known": 0, "not written": 0, "unpaired": 0, "unpaired written": 0, "moved out": 0}
    problems: list[str] = []
    # Keep the written paragraphs that end up in the body: later passes lift text-box content into page
    # overlays and drop blank lines before a page break, after they were recorded. The converter tags
    # each recorded paragraph (data-sink) while measuring; the tags still in the body are the survivors.
    survivors = {int(n) for n in re.findall(r'data-sink="(\d+)"', body)}
    # One Word paragraph can become several editor nodes; each paragraph or heading among them is
    # paired on its own. The first one is keyed by the style its HTML carries, the rest by their own.
    written, written_html, recorded_index = [], [], []
    for index, ((text, nodes), html) in enumerate(zip(recorded, recorded_html)):
        if nodes is None:
            counts["not written"] += 1
        elif index not in survivors:
            counts["moved out"] += 1
        else:
            for position, node in enumerate(nodes):
                if node["type"] not in ("paragraph", "heading"):
                    continue
                written.append((node_text(node) or text if position == 0 else node_text(node), node))
                written_html.append(html if position == 0 else None)
                recorded_index.append(index)
    # Pair by text and style (empty paragraphs differ only in style), aligning the two sequences.
    ours = [
        (text_key(text), html_style(html) if html is not None else (node.get("attrs") or {}).get("style"))
        for (text, node), html in zip(written, written_html)
    ]
    theirs = [(text_key(node_text(node)), (node.get("attrs") or {}).get("style")) for node in paragraphs]
    pairs = {}
    for block in difflib.SequenceMatcher(None, ours, theirs, autojunk=False).get_matching_blocks():
        for offset in range(block.size):
            pairs[block.a + offset] = block.b + offset
    for index, (text, node) in enumerate(written):
        match = pairs.get(index)
        if match is None:
            # A written paragraph that pairs with nothing would go unchecked: it fails the check.
            counts["unpaired written" if node is not None else "unpaired"] += 1
            if node is not None:
                problems.append(f"recorded paragraph {recorded_index[index]} {text[:30]!r} pairs with no reference paragraph")
            continue
        if node is None:
            counts["not written"] += 1
            continue
        counts["written"] += 1
        found = first_difference(strip_pictures(paragraphs[match]), strip_pictures(node))
        known = next((why for path, why in KNOWN_DIFFERENCES.items() if found and found.startswith(path + ":")), None)
        if known:
            counts["known"] += 1
        elif found:
            counts["different"] += 1
            problems.append(f"paragraph {match} {text[:30]!r}: {found}")
        else:
            counts["same"] += 1
    list_counts, list_problems = check_lists(recorded_lists, body, reference)
    counts.update(list_counts)
    return counts, problems + list_problems


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
    parser.add_argument("--json", action="store_true", help="compare the converter's own JSON with the references (no browser)")
    args = parser.parse_args(argv)
    if args.json:
        if args.mode != "check":
            parser.error("--json only checks")
        failed = False
        for fixture in fixtures(args.only):
            if fixture.suffix != ".docx":
                continue
            reference = json.loads(read_gz(REFERENCES / f"{fixture.name}.json.gz"))
            counts, problems = check_json(fixture, reference)
            print(f"{fixture.name[:44]:44} " + ", ".join(f"{k} {v}" for k, v in counts.items()))
            if counts["known"]:
                print(f"    {counts['known']} known: " + "; ".join(KNOWN_DIFFERENCES.values()))
            for problem in problems[:6]:
                print("   ", problem)
            failed = failed or bool(problems)
        return 1 if failed else 0

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
