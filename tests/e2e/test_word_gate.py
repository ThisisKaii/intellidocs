"""The import fidelity gate as a test: paragraphs on Word's page must not fall below the baseline.

Needs only the frontend dev server (the converter runs in-process). Without it the test reports
BLOCKED, never failed, like the rest of this suite. See word_gate.py.
"""

from __future__ import annotations

import requests
import pytest

import word_gate
from harness import WEB


def frontend_up() -> bool:
    try:
        return requests.get(WEB, timeout=3).status_code < 500
    except requests.RequestException:
        return False


@pytest.mark.e2e
@pytest.mark.module("import")
def test_word_gate_paragraphs_stay_on_words_page(tmp_path) -> None:
    if not frontend_up():
        pytest.skip(f"blocked: needs the frontend dev server at {WEB} (cd frontend; npm run dev)")
    code = word_gate.main(["--web", WEB, "--out", str(tmp_path)])
    summary = (tmp_path / "summary.txt").read_text(encoding="utf-8") if (tmp_path / "summary.txt").exists() else ""
    assert code != 2, "the gate could not measure; see its output above"
    assert code == 0, f"import fidelity regressed against word_gate_baseline.json\n{summary}"
