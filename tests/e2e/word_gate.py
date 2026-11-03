"""Import fidelity gate: paragraphs on Word's page, for every Word fixture, against a committed baseline.

Word's own layout of each fixture is committed as golden data (tests/e2e/tools/make_word_golden.ps1,
which needs Word). This gate needs no Word: it converts each fixture with the real converter, lays
it out in the real paged editor (the dev editor harness), pairs paragraphs with Word's, and fails
when any fixture has fewer paragraphs on Word's page than its baseline, or a page count further
from Word's.

Run from the repo root with the frontend dev server up:
    ml/venv/Scripts/python tests/e2e/word_gate.py
    ml/venv/Scripts/python tests/e2e/word_gate.py --update-baseline   # deliberate; review the diff
    ml/venv/Scripts/python tests/e2e/word_gate.py --roundtrip         # also reopen from the saved editor JSON

Exit codes: 0 no regression, 1 regression, 2 the gate could not measure (stale golden, a fixture
that failed to load, frontend down).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))

import fidelity_run as fr  # noqa: E402  (convert, to_payload, wait_for_layout)
from word_alignment import Regression, Score, baseline_from, compare, score, summary_lines  # noqa: E402

FIXTURES = REPO / "tests" / "fixtures" / "import_baselines"
TRUTH_DIR = FIXTURES / "word_truth"
BASELINE = FIXTURES / "word_gate_baseline.json"
DEFAULT_OUT = HERE / "artifacts" / "word_gate"

# Two-column papers are single-column in the editor by design, so Word's pages say nothing about
# the editor's; fidelity_run.py scores them through the IEEE print preview instead.
NOT_GATED = {"ieee_sample_paper"}

# Each top-level text block's page, read from where its first line of text is drawn: the paginator
# draws its page boundary inside the next block's box, so the element's own top is misleading.
# Table cells are left out, as they are on Word's side (see word_alignment).
JS_ROWS = """(pitch) => {
  const pm = document.querySelector('.ProseMirror');
  const top0 = pm.getBoundingClientRect().top;
  const out = [];
  pm.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach(el => {
    if (el.closest('.rm-page-header, .rm-page-footer, .rm-page-break, table')) return;
    const text = (el.textContent || '').trim();
    if (!text) return;
    const range = document.createRange(); range.selectNodeContents(el);
    const first = range.getClientRects()[0];
    if (!first) return;
    out.push({ text: text.slice(0, 80), page: Math.floor((first.top - top0 + 1) / pitch) + 1 });
  });
  return out;
}"""


class GateError(Exception):
    """The gate could not measure: a reason to stop, not a regression."""


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def golden_files(only: str | None) -> list[tuple[str, Path, dict]]:
    """(name, fixture path, truth) for every gated fixture, refusing truth recorded for another file."""
    if not TRUTH_DIR.is_dir():
        raise GateError(f"no golden data in {TRUTH_DIR}: run tests/e2e/tools/make_word_golden.ps1 on a machine with Word")
    chosen = []
    for path in sorted(TRUTH_DIR.glob("*.json")):
        name = path.stem
        if name in NOT_GATED or (only and only.lower() not in name.lower()):
            continue
        truth = json.loads(path.read_text(encoding="utf-8-sig"))
        fixture = FIXTURES / "documents" / f"{name}.docx"
        if not fixture.is_file():
            raise GateError(f"golden {path.name} has no fixture {fixture.name}")
        if truth.get("sha256") != sha256(fixture):
            raise GateError(f"golden {path.name} was recorded for a different {fixture.name}: re-run make_word_golden.ps1")
        chosen.append((name, fixture, truth))
    if not chosen:
        raise GateError("no fixture selected")
    return chosen


# PagedEditor logs this when saved JSON does not fit the editor schema and it falls back to the HTML.
JSON_REJECTED = "Saved editor JSON does not fit the editor schema"


def measure(browser, web: str, payload: dict, keep_json: bool = False) -> tuple[list[dict], int, dict | None]:
    """The editor's rows and page count for one converted fixture, laid out the way the Document page
    does, and (with keep_json) the editor's JSON as autosave would store it."""
    context = browser.new_context(viewport={"width": 1300, "height": 1250})
    page = context.new_page()
    rejected: list[str] = []
    page.on("console", lambda message: rejected.append(message.text) if JSON_REJECTED in message.text else None)
    page.route("**fonts.googleapis.com**", lambda r: r.abort())
    page.route("**fonts.gstatic.com**", lambda r: r.abort())
    page.add_init_script("window.__FIDELITY__ = " + json.dumps(payload))
    try:
        page.goto(f"{web}/dev/editor-harness", wait_until="domcontentloaded")
        page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=90000)
        fr.wait_for_layout(page)
        page.evaluate("document.fonts.ready.then(() => true)")
        layout = fr.wait_for_layout(page)
        rows = page.evaluate(JS_ROWS, layout["pageH"] + 40)
        if rejected:
            raise GateError(f"the saved JSON was rejected on reopen: {rejected[0]}")
        saved = page.evaluate("window.__editor.getJSON()") if keep_json else None
        return rows, int(layout["pages"]), saved
    finally:
        context.close()


def run(web: str, only: str | None, roundtrip: bool = False) -> dict[str, Score]:
    """Measure every selected fixture. With roundtrip, each is also reopened from the editor JSON its
    first open would save, and must score exactly as that first open did (a `name (reopened)` entry)."""
    scores: dict[str, Score] = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome", args=["--font-render-hinting=none"])
        try:
            for name, fixture, truth in golden_files(only):
                print(f"{name} ...", flush=True)
                payload = fr.to_payload(fr.convert(fixture))
                try:
                    rows, pages, saved = measure(browser, web, payload, keep_json=roundtrip)
                    scores[name] = score(truth, rows, pages)
                    if roundtrip:
                        rows, pages, _ = measure(browser, web, {**payload, "json": saved})
                        scores[f"{name} (reopened)"] = score(truth, rows, pages)
                except GateError:
                    raise
                except Exception as error:  # a fixture that cannot load is a gate failure, not a skip
                    raise GateError(f"{name} could not be measured: {type(error).__name__}: {error}") from error
        finally:
            browser.close()
    return scores


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--web", default="http://localhost:5173", help="frontend dev server serving /dev/editor-harness")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--only", help="measure only fixtures whose name contains this text (no baseline update)")
    parser.add_argument("--update-baseline", action="store_true", help="record today's scores as the baseline")
    parser.add_argument(
        "--roundtrip",
        action="store_true",
        help="also reopen every fixture from the editor JSON it would save; it must score as the first open did",
    )
    args = parser.parse_args(argv)
    if args.update_baseline and (args.only or args.roundtrip):
        parser.error("--update-baseline records every fixture's first open; drop --only and --roundtrip")

    try:
        scores = run(args.web, args.only, args.roundtrip)
    except GateError as error:
        print(f"GATE ERROR: {error}")
        return 2

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "summary.json").write_text(json.dumps({n: s.as_dict() for n, s in scores.items()}, indent=1), encoding="utf-8")
    table = "\n".join(summary_lines(scores))
    (args.out / "summary.txt").write_text(table + "\n", encoding="utf-8")
    print("\n" + table)

    if args.update_baseline:
        BASELINE.write_text(json.dumps(baseline_from(scores), indent=1) + "\n", encoding="utf-8")
        print(f"\nbaseline written to {BASELINE.relative_to(REPO)}: review the diff before committing it")
        return 0

    if not BASELINE.is_file():
        print(f"\nGATE ERROR: no baseline at {BASELINE.relative_to(REPO)}: run with --update-baseline")
        return 2
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    reopened = {name: s for name, s in scores.items() if name.endswith(" (reopened)")}
    scores = {name: s for name, s in scores.items() if name not in reopened}
    if args.only:
        baseline = {name: entry for name, entry in baseline.items() if name in scores}
    regressions = compare(scores, baseline)
    for name, again in reopened.items():
        first = scores[name.removesuffix(" (reopened)")]
        if again.as_dict() != first.as_dict():
            regressions.append(Regression(
                name,
                "reopening from the saved JSON changed the layout: paragraphs on Word's page "
                f"{first.same_page} -> {again.same_page}, pages {first.editor_pages} -> {again.editor_pages}",
            ))
    if regressions:
        print("\nREGRESSION")
        for regression in regressions:
            print(f"  {regression.name}: {regression.reason}")
        return 1
    print("\nno regression against the baseline")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
