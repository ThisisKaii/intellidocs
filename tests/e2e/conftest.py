"""Shared pytest configuration for the end-to-end suite.

Registers the custom markers used by ``harness.e2e`` so ``-m`` filtering works,
and prints a capability banner so a reader can tell up front which external
services were present for the run.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

# Fixtures must be visible from conftest to be discovered. They are defined in
# harness so the browser helpers and the HTTP client live together.
from harness import (  # noqa: E402,F401
    anon,
    api,
    auth_client,
    browser,
    caps,
    document_id,
    page,
)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "e2e: end-to-end coverage test")
    config.addinivalue_line("markers", "layer(api): exercised over HTTP, no browser")
    config.addinivalue_line("markers", "layer(browser): drives the real editor via Playwright")
    config.addinivalue_line("markers", "module(name): the application module under test")


from harness import supabase_health  # noqa: E402


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Gate the whole suite on Supabase reachability, checked exactly once.

    Every test in this suite authenticates against or reads from Supabase. When
    that provider is slow or down, letting the run continue produces dozens of
    timeouts whose failure text describes the provider rather than the
    application. Blocking the suite once, here, keeps the report honest and the
    run fast.

    The health tests are exempt: their purpose is to describe the outage.
    """
    ok, latency, detail = supabase_health()
    if not ok:
        reason = (
            f"blocked: Supabase unreachable via backend readiness probe "
            f"(latencyMs={latency} detail={detail or 'no detail'}). "
            f"All tests depend on Supabase."
        )
        exempt = ("liveness", "readiness")
        blocked = 0
        for item in items:
            if any(token in item.name for token in exempt):
                continue
            item.add_marker(pytest.mark.skip(reason))
            blocked += 1
        print(f"\n  [gate] {blocked} tests blocked - {reason}\n")
        return

    if latency > 5000:
        print(f"\n  [warning] Supabase latency {latency}ms. "
              f"Transient gateway errors will be retried.\n")


def pytest_report_header(config: pytest.Config) -> list[str]:
    from harness import API, CAPS, WEB

    return [
        f"IntelliDocs E2E | backend={API} | web={WEB}",
        f"capabilities available: {CAPS.describe()}",
    ]


def pytest_terminal_summary(terminalreporter, exitstatus, config) -> None:
    """Append the module-by-module tally to the end of the run.

    pytest's own summary counts tests, not modules. The question that actually
    matters here is "which parts of the product did we verify", so the tally is
    grouped by the ``module`` marker.
    """
    terminalreporter.write_sep("=", "coverage by module")
    stats: dict[str, dict[str, int]] = {}
    for report in terminalreporter.getreports("pytest_runtest_logreport"):
        if report.when != "call" and not (report.when == "setup" and report.skipped):
            continue
        node = getattr(report, "nodeid", "")
        module = "unknown"
        parts = node.split("::")
        if len(parts) > 1:
            module = parts[0].split("\\")[-1].replace(".py", "")
        bucket = stats.setdefault(module, {"passed": 0, "failed": 0, "blocked": 0})
        if report.skipped:
            bucket["blocked"] += 1
        elif report.failed:
            bucket["failed"] += 1
        else:
            bucket["passed"] += 1

    for module in sorted(stats):
        b = stats[module]
        total = b["passed"] + b["failed"] + b["blocked"]
        flag = "FAIL" if b["failed"] else "ok"
        terminalreporter.write_line(
            f"  {flag:4} {module:28} {b['passed']:2}/{total:<2} passed"
            + (f", {b['failed']} failed" if b["failed"] else "")
            + (f", {b['blocked']} blocked" if b["blocked"] else "")
        )


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo) -> None:
    """Capture full-page screenshot and save to artifacts/failures/ on any failed browser test."""
    outcome = yield
    report = outcome.get_result()

    if report.when == "call" and report.failed:
        page = item.funcargs.get("page")
        if not page and "editor" in item.funcargs:
            editor_fixture = item.funcargs.get("editor")
            if isinstance(editor_fixture, tuple) and len(editor_fixture) > 0:
                page = editor_fixture[0]

        if page:
            from harness import ARTIFACTS
            failures_dir = ARTIFACTS / "failures"
            failures_dir.mkdir(parents=True, exist_ok=True)
            safe_name = item.name.replace("/", "_").replace("\\", "_").replace(":", "_").replace('"', "")
            screenshot_path = failures_dir / f"{safe_name}.png"
            try:
                page.screenshot(path=str(screenshot_path), full_page=True)
                print(f"\n[screenshot on failure] Saved to {screenshot_path}")
            except Exception as exc:
                print(f"\n[screenshot capture failed: {exc}]")

