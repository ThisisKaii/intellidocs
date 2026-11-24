"""Fixtures and screenshot hooks for the Chapter 4 unit and integration testing suite.

test_unit_*.py hold the unit cases (one file per module of Table 24) and test_integration.py the
integration cases; each case drives the app as a user does and checks what the user sees.

Screenshots go to docs/manuscript/figures/chapter_4/unit/ and .../integration/:
- `<case id>.png`: the browser at the end of a passing case (its test evidence).
  A failing case saves `<case id>_FAILED.png` instead, so a failure is never filed as evidence.
- With CAPTURE_IDE=1, `tools/capture_ide_test.py` also captures the IDE window (code and the
  terminal's PASSED line) as `<test file>_code_<timestamp>.png`.
The `actual` fixture records what the user saw, for the tables' Actual Result column;
build_testing_tables.py turns a run's JUnit report into the manuscript's tables.

Environment: API_URL, WEB_URL, ML_URL (defaults: localhost 3000 / 5173 / 8001),
SELENIUM_HEADED=1 to watch the browser, CAPTURE_IDE=1 for the IDE figure,
ADMIN_EMAIL / ADMIN_PASSWORD for the administrator cases (skipped without them).
"""

from __future__ import annotations

import importlib.util
import os
import sys
import time
from pathlib import Path
from typing import Iterator

import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

sys.path.insert(0, str(Path(__file__).parent))

from selenium_helpers import DOWNLOADS, FIGURES, PROFESSOR, STUDENT, STUDENT_2, Api  # noqa: E402

FIGURES.mkdir(parents=True, exist_ok=True)


def make_driver() -> webdriver.Chrome:
    options = Options()
    if os.environ.get("SELENIUM_HEADED") != "1":
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1600,1080")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-first-run")
    options.add_argument("--disable-search-engine-choice-screen")
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    options.add_experimental_option("prefs", {"download.default_directory": str(DOWNLOADS), "download.prompt_for_download": False})
    return webdriver.Chrome(options=options)


@pytest.fixture
def driver() -> Iterator[webdriver.Chrome]:
    browser = make_driver()
    browser.set_page_load_timeout(90)
    yield browser
    browser.quit()


@pytest.fixture
def second_driver() -> Iterator[webdriver.Chrome]:
    """A second, separate browser (another person) for the collaboration cases."""
    browser = make_driver()
    browser.set_page_load_timeout(90)
    yield browser
    browser.quit()


def _signed_in(account: tuple[str, str]) -> Iterator[Api]:
    client = Api.sign_in(account)
    yield client
    client.cleanup()


@pytest.fixture
def professor_api() -> Iterator[Api]:
    yield from _signed_in(PROFESSOR)


@pytest.fixture
def student_api() -> Iterator[Api]:
    yield from _signed_in(STUDENT)


@pytest.fixture
def student2_api() -> Iterator[Api]:
    yield from _signed_in(STUDENT_2)


def figure_path(item: pytest.Item, passed: bool) -> Path:
    """docs/manuscript/figures/chapter_4/<unit|integration>/<case id>.png (…_FAILED.png on failure)."""
    folder = FIGURES / ("integration" if "integration" in Path(str(item.fspath)).stem else "unit")
    folder.mkdir(parents=True, exist_ok=True)
    name = item.name.removeprefix("test_")
    return folder / (f"{name}.png" if passed else f"{name}_FAILED.png")


@pytest.fixture
def actual(record_property):
    """Record what the user saw, for the table's Actual Result column: actual("Shows 'Name saved.'")."""
    lines: list[str] = []

    def note(text: str) -> None:
        lines.append(text)
        record_property("actual", " ".join(lines))

    return note


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo) -> Iterator[None]:
    """Save the browser's final state as the case's figure (or as _FAILED on failure)."""
    outcome = yield
    report = outcome.get_result()
    if report.when != "call":
        return
    browser = item.funcargs.get("driver") if hasattr(item, "funcargs") else None
    if browser is None:
        return
    try:
        browser.save_screenshot(str(figure_path(item, report.passed)))
    except Exception as error:  # a closed or crashed browser must not hide the test's own result
        print(f"[screenshot] not saved: {error}")


def _load_capture_tool():
    path = Path(__file__).resolve().parents[3] / "tools" / "capture_ide_test.py"
    spec = importlib.util.spec_from_file_location("capture_ide_test", path)
    if not spec or not spec.loader:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pytest_runtest_logfinish(nodeid: str, location: tuple[str, int | None, str]) -> None:
    """With CAPTURE_IDE=1, capture the IDE window once the test's result is on the terminal."""
    if os.environ.get("CAPTURE_IDE") != "1":
        return
    tool = _load_capture_tool()
    if tool is None:
        return
    time.sleep(0.8)
    try:
        tool.capture_window_native(window_title_keyword=os.environ.get("IDE_WINDOW", "IntelliJ"), output_name=f"{Path(location[0]).stem}_code")
    except Exception as error:
        print(f"[ide capture] not saved: {error}")
