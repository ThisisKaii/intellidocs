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
    ml/venv/Scripts/python tests/e2e/tools/editor_json_reference.py check --doc       # its whole content_json

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


# Differences the JSON writer cannot remove yet: the attribute, and the Stage 2a slice that removes it.
# Empty: the last one (the overlay attribute) went when the page layout pass stopped counting a text
# box's own paragraphs and attached every box to the paragraph it sits in.
KNOWN_DIFFERENCES: dict[str, str] = {}


def compare_allowing_known(reference: Any, ours: Any) -> tuple[str | None, bool]:
    """(first difference, whether it is only known ones). Known attributes are blanked in the reference
    and the WHOLE node compared again, so a known difference never hides a real one behind it."""
    found = first_difference(reference, ours)
    if not found:
        return None, False

    def blank(node: Any) -> Any:
        if isinstance(node, list):
            return [blank(item) for item in node]
        if not isinstance(node, dict):
            return node
        out = {key: blank(value) for key, value in node.items()}
        if isinstance(out.get("attrs"), dict):
            out["attrs"] = {k: (None if k in KNOWN_DIFFERENCES else v) for k, v in out["attrs"].items()}
        return out

    remaining = first_difference(blank(reference), blank(ours))
    return (found, True) if not remaining else (remaining, False)

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


def reference_tables(doc: dict) -> list[dict]:
    """The body's tables in a reference document, in order (not tables nested in tables)."""
    found: list[dict] = []

    def walk(node: dict) -> None:
        if node.get("type") == "table":
            found.append(node)
            return
        for child in node.get("content", []):
            walk(child)

    walk(doc)
    return found


def check_blocks(kind: str, ours: list, theirs: list[dict], not_written: int) -> tuple[dict, list[str]]:
    """Compare whole blocks the writer built (index, node) with the reference's, paired in order by text."""
    counts = {f"{kind} written": 0, f"{kind} same": 0, f"{kind} different": 0, f"{kind} known": 0, f"{kind} not written": not_written, f"{kind} unpaired": 0}
    problems: list[str] = []
    pairs = {}
    matcher = difflib.SequenceMatcher(None, [text_key(deep_text(n)) for _, n in ours], [text_key(deep_text(n)) for n in theirs], autojunk=False)
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            pairs[block.a + offset] = block.b + offset
    for position, (index, node) in enumerate(ours):
        counts[f"{kind} written"] += 1
        match = pairs.get(position)
        if match is None:
            counts[f"{kind} unpaired"] += 1
            problems.append(f"{kind[:-1]} {index} {deep_text(node)[:30]!r} pairs with no reference {kind[:-1]}")
            continue
        found, known = compare_allowing_known(strip_pictures(theirs[match]), strip_pictures(node))
        if known:
            counts[f"{kind} known"] += 1
        elif found:
            counts[f"{kind} different"] += 1
            problems.append(f"{kind[:-1]} {index} {deep_text(node)[:30]!r}: {found}")
        else:
            counts[f"{kind} same"] += 1
    return counts, problems


def check_tables(recorded: list, body: str, reference: dict) -> tuple[dict, list[str]]:
    survivors = {int(n) for n in re.findall(r'data-sink-table="(\d+)"', body)}
    ours = [(i, node) for i, node in enumerate(recorded) if i in survivors and node is not None]
    not_written = sum(1 for i, node in enumerate(recorded) if i in survivors and node is None)
    return check_blocks("tables", ours, reference_tables(reference), not_written)


def check_lists(recorded: list[dict], body: str, reference: dict) -> tuple[dict, list[str]]:
    """Compare the lists the writer built with the reference's, paired in order by their text."""
    survivors = {int(n) for n in re.findall(r'data-sink-list="(\d+)"', body)}
    ours = [(i, entry["node"]) for i, entry in enumerate(recorded) if i in survivors and entry["ok"]]
    not_written = sum(1 for i, entry in enumerate(recorded) if i in survivors and not entry["ok"])
    return check_blocks("lists", ours, reference_lists(reference), not_written)


def check_json(fixture: Path, reference: dict) -> tuple[dict, list[str]]:
    """Compare the converter's paragraph JSON with the reference's paragraphs, paired in order by text."""
    converter._JSON_SINK, converter._JSON_SINK_HTML, converter._JSON_LIST_SINK, converter._JSON_TABLE_SINK = [], [], [], []
    try:
        body = fr.convert(fixture)["html"]
        recorded, recorded_html = list(converter._JSON_SINK), list(converter._JSON_SINK_HTML)
        recorded_lists, recorded_tables = list(converter._JSON_LIST_SINK), list(converter._JSON_TABLE_SINK)
    finally:
        converter._JSON_SINK = converter._JSON_SINK_HTML = converter._JSON_LIST_SINK = converter._JSON_TABLE_SINK = None
    # Measuring must not change the conversion: without its tags the body is the recorded HTML.
    untagged = strip_pictures(re.sub(r' data-sink(?:-list|-table)?="\d+"', "", body))
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
                # Each node is paired by its own text: a split paragraph's first node holds only what came
                # before the split.
                written.append((node_text(node), node))
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
        found, known = compare_allowing_known(strip_pictures(paragraphs[match]), strip_pictures(node))
        if known:
            counts["known"] += 1
        elif found:
            counts["different"] += 1
            problems.append(f"paragraph {match} {text[:30]!r}: {found}")
        else:
            counts["same"] += 1
    list_counts, list_problems = check_lists(recorded_lists, body, reference)
    table_counts, table_problems = check_tables(recorded_tables, body, reference)
    counts.update(list_counts)
    counts.update(table_counts)
    return counts, problems + list_problems + table_problems


def _style_width(style: str) -> float | None:
    """TiptapEditor readStyleWidth: the explicit px width in an image container style."""
    found = re.search(r"(?:^|;)\s*width:\s*([\d.]+)px", style or "", re.I)
    return float(found.group(1)) if found else None


def _with_image_width(style: str, width: int) -> str:
    """TiptapEditor withImageWidth: the style with its width and height replaced by `width`."""
    parts = [part.strip() for part in style.split(";") if part.strip()]
    parts = [part for part in parts if part.split(":")[0].strip().lower() not in ("width", "height")]
    parts += [f"width: {width}px", "height: auto"]
    if not any(part.lower().startswith("cursor") for part in parts):
        parts.append("cursor: pointer")
    return "; ".join(parts) + ";"


def cap_images(ours: object, theirs: object, columns: set[int]) -> object:
    """Our JSON with the editor's image width cap applied where the reference shows it applied.

    The cap (TiptapEditor CenteredImageResize) rewrites an image wider than the text column on the
    first edit after a load, from the column the page layout gives at runtime: the same after an HTML
    or a JSON load, so it is no part of the import. Applied only where the reference width is smaller
    than ours; every width it was applied with is collected, since the editor has one text column."""
    if isinstance(ours, list) and isinstance(theirs, list) and len(ours) == len(theirs):
        return [cap_images(a, b, columns) for a, b in zip(ours, theirs)]
    if not (isinstance(ours, dict) and isinstance(theirs, dict) and ours.get("type") == theirs.get("type")):
        return ours
    if ours.get("type") == "imageResize":
        mine, given = ours.get("attrs") or {}, theirs.get("attrs") or {}
        stored = _style_width(mine.get("containerStyle") or "") or mine.get("width")
        column = _style_width(given.get("containerStyle") or "")
        if stored and column and column < stored and column.is_integer():
            columns.add(int(column))
            capped = {**mine, "containerStyle": _with_image_width(mine.get("containerStyle") or "", int(column))}
            if mine.get("width") is not None:
                capped["width"] = int(column)
            return {**ours, "attrs": capped}
        return ours
    return {key: cap_images(value, theirs.get(key), columns) for key, value in ours.items()}


def check_document(fixture: Path, reference: dict) -> str | None:
    """The first difference between the converter's whole-document JSON and the reference (None: same)."""
    result = fr.convert(fixture)
    ours = result.get("content_json")
    if ours is None:
        return "the converter wrote no document JSON (some content is not written yet)"
    ours = strip_pictures(ours)
    theirs = strip_pictures(reference)
    # The editor's trailing-node extension adds an empty paragraph after a document that does not end
    # with one: a runtime addition after any load, not part of the import.
    empty = {"type": "paragraph", "attrs": converter._write_paragraph_json("", None, [])["attrs"]}
    if (len(theirs["content"]) == len(ours["content"]) + 1 and theirs["content"][-1] == empty
            and ours["content"] and ours["content"][-1]["type"] != "paragraph"):
        theirs = {**theirs, "content": theirs["content"][:-1]}
    columns: set[int] = set()
    ours = cap_images(ours, theirs, columns)
    if len(columns) > 1:
        return f"images capped to different text columns: {sorted(columns)}"
    return first_difference(theirs, ours)


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
    parser.add_argument("--doc", action="store_true", help="compare the converter's whole-document JSON with the references (no browser)")
    args = parser.parse_args(argv)
    if args.doc:
        failed = False
        for fixture in fixtures(args.only):
            reference = json.loads(read_gz(REFERENCES / f"{fixture.name}.json.gz"))
            found = check_document(fixture, reference)
            print(("same          " if found is None else "DIFFERENT     ") + fixture.name + (f"\n    {found}" if found else ""))
            failed = failed or found is not None
        return 1 if failed else 0
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
            known = sum(v for k, v in counts.items() if k == "known" or k.endswith(" known"))
            if known:
                print(f"    {known} known: " + "; ".join(KNOWN_DIFFERENCES.values()))
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
            # The reference is the editor's parse of the HTML: never hand it the converter's own JSON.
            payload = {**fr.to_payload(result), "json": None}
            doc = None if args.html_only else strip_pictures(editor_json(browser, args.web, payload))
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
