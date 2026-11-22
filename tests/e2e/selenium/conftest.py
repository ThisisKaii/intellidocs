"""Fixtures and screenshot hooks for the Chapter 4 Selenium suite.

Screenshots go to docs/manuscript/figures/chapter_4/:
- `<test file>_system.png`: the browser at the end of a passing test (Figure X, the system).
  A failing test saves `<test file>_FAILED.png` instead, so a failure is never filed as a figure.
- With CAPTURE_IDE=1, `tools/capture_ide_test.py` also captures the IDE window (code and the
  terminal's PASSED line) as `<test file>_code_<timestamp>.png` (Figure Y).

Environment: API_URL, WEB_URL, ML_URL (defaults: localhost 3000 / 5173 / 8001),
SELENIUM_HEADED=1 to watch the browser, CAPTURE_IDE=1 for the IDE figure.
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

from selenium_helpers import FIGURES, PROFESSOR, STUDENT, STUDENT_2, Api  # noqa: E402

FIGURES.mkdir(parents=True, exist_ok=True)


def make_driver() -> webdriver.Chrome:
    options = Options()
    if os.environ.get("SELENIUM_HEADED") != "1":
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1600,950")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-first-run")
    options.add_argument("--disable-search-engine-choice-screen")
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


def _stem(item: pytest.Item) -> str:
    return Path(str(item.fspath)).stem


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo) -> Iterator[None]:
    """Save the browser's final state as the test's system figure (or as _FAILED on failure)."""
    outcome = yield
    report = outcome.get_result()
    if report.when != "call":
        return
    browser = item.funcargs.get("driver") if hasattr(item, "funcargs") else None
    if browser is None:
        return
    suffix = "system" if report.passed else "FAILED"
    try:
        browser.save_screenshot(str(FIGURES / f"{_stem(item)}_{suffix}.png"))
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
