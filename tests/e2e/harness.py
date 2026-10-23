"""Shared harness for the IntelliDocs end-to-end suite.

Two layers are supported:

  * API layer   - direct HTTP against the Express backend. Fast, deterministic,
                  and covers every route module including the ones with no UI.
  * Browser layer - Playwright driving the real editor. Used for anything whose
                  correctness lives in the DOM (formatting, panels, navigation).

Every test declares its preconditions with ``requires``. A test whose
preconditions are unmet is reported as BLOCKED, never as a failure, so a
missing external service is never mistaken for broken application code.

Run with:
    pytest tests/e2e -v
    pytest tests/e2e -m api -v
    pytest tests/e2e -m browser -v
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import pytest
import requests

# The Express backend mounts routes at the root; the Vite dev proxy is what
# adds the /api prefix. API tests therefore talk to the backend directly.
API = os.environ.get("API_URL", "http://localhost:3000").rstrip("/")
WEB = os.environ.get("WEB_URL", "http://localhost:5173").rstrip("/")

EMAIL = os.environ.get("TEST_EMAIL", "test@test.com")
PASSWORD = os.environ.get("TEST_PASSWORD", "asd123")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

ARTIFACTS = Path(os.environ.get("E2E_ARTIFACTS", Path(__file__).parent / "artifacts"))
# ML runs on 8000 in the compose file, but the dev backend logs ECONNREFUSED
# on 8001, so both are probed before declaring the ML service present.
ML_PORTS = (8000, 8001)

# Observed Supabase latency during development reached ~20s and degraded to
# Cloudflare 522, so request budgets are generous and transient upstream
# failures are retried rather than surfaced as application defects.
TIMEOUT = 90
RETRIES = 2
BACKOFF_SECONDS = 3

# 502/503/504 are gateway/availability errors and 522 is Cloudflare failing to
# reach the origin. None of them indicate a bug in this application.
TRANSIENT_STATUS = {502, 503, 504, 522}

# Bearer tokens are cached across tests so the suite performs roughly one login
# per hour instead of one per test.
_TOKEN_CACHE: dict[str, dict[str, Any]] = {}


def supabase_health() -> tuple[bool, int, str]:
    """Ask the backend's readiness probe whether Supabase is reachable.

    The probe is used rather than a direct call so the harness never has to hold
    the service key. Returns (ok, latency_ms, detail).
    """
    try:
        r = requests.get(f"{API}/health/ready", timeout=45)
        body = r.json()
        check = (body.get("checks") or {}).get("supabase") or {}
        return bool(check.get("ok")), int(check.get("latencyMs") or 0), str(check.get("detail") or "")
    except Exception as exc:  # noqa: BLE001 - reported, never raised
        return False, 0, f"{type(exc).__name__}: {exc}"


def _request_with_retry(method: str, url: str, **kw: Any) -> requests.Response:
    """Issue a request, retrying only on transient upstream failures."""
    last: Exception | None = None
    for attempt in range(RETRIES + 1):
        try:
            r = requests.request(method, url, timeout=TIMEOUT, **kw)
            if r.status_code not in TRANSIENT_STATUS or attempt == RETRIES:
                return r
        except (requests.Timeout, requests.ConnectionError) as exc:
            last = exc
            if attempt == RETRIES:
                raise
        time.sleep(BACKOFF_SECONDS * (attempt + 1))
    raise last if last else RuntimeError("unreachable")


# ---------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------


class Requires:
    """Named preconditions a test can depend on."""

    ML = "ml-service"
    ADMIN = "admin-credentials"
    GOOGLE_OAUTH = "google-oauth"
    AI_PROVIDER = "ai-provider-key"
    BROWSER = "browser-chrome"


@dataclass
class Caps:
    """Resolved capability flags for the current run."""

    ml: bool = False
    admin: bool = False
    ai: bool = False
    browser: bool = False

    def describe(self) -> str:
        on = [n for n, v in (("ml", self.ml), ("admin", self.admin),
                             ("ai", self.ai), ("browser", self.browser)) if v]
        return ", ".join(on) if on else "none"


def probe_capabilities() -> Caps:
    """Check which external services and credentials are actually available.

    Anything probed here is a hard external dependency. Absence is recorded, not
    raised, so the report can distinguish BLOCKED from FAILED.

    The browser is deliberately not probed here. Probing it would launch Chrome
    once during collection and again in the fixture, so instead the ``browser``
    fixture skips itself if the launch fails.
    """
    caps = Caps()

    for port in ML_PORTS:
        try:
            r = requests.get(f"http://localhost:{port}/health", timeout=3)
            if r.status_code < 500:
                caps.ml = True
                break
        except requests.RequestException:
            continue

    caps.admin = bool(ADMIN_EMAIL and ADMIN_PASSWORD)

    return caps


CAPS = probe_capabilities()


def unmet(requirements: tuple[str, ...]) -> list[str]:
    """Return the subset of requirements that are not satisfied right now."""
    mapping = {
        Requires.ML: CAPS.ml,
        Requires.ADMIN: CAPS.admin,
        Requires.AI_PROVIDER: CAPS.ai,
        Requires.GOOGLE_OAUTH: False,
        Requires.BROWSER: CAPS.browser,
    }
    return [r for r in requirements if not mapping.get(r, False)]


# ---------------------------------------------------------------------------
# API client
# ---------------------------------------------------------------------------


@dataclass
class Api:
    """Thin authenticated HTTP client for the Express backend."""

    token: str | None = None
    user_id: str | None = None

    def headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if extra:
            h.update(extra)
        return h

    def get(self, path: str, **kw: Any) -> requests.Response:
        return _request_with_retry("GET", API + path, headers=self.headers(kw.pop("headers", None)), **kw)

    def post(self, path: str, data: Any = None, **kw: Any) -> requests.Response:
        return _request_with_retry("POST", API + path,
                                   data=json.dumps(data) if data is not None else None,
                                   headers=self.headers(kw.pop("headers", None)), **kw)

    def put(self, path: str, data: Any = None, **kw: Any) -> requests.Response:
        return _request_with_retry("PUT", API + path,
                                   data=json.dumps(data) if data is not None else None,
                                   headers=self.headers(kw.pop("headers", None)), **kw)

    def patch(self, path: str, data: Any = None, **kw: Any) -> requests.Response:
        return _request_with_retry("PATCH", API + path,
                                   data=json.dumps(data) if data is not None else None,
                                   headers=self.headers(kw.pop("headers", None)), **kw)

    def delete(self, path: str, **kw: Any) -> requests.Response:
        return _request_with_retry("DELETE", API + path,
                                   headers=self.headers(kw.pop("headers", None)), **kw)

    def login(self, email: str = EMAIL, password: str = PASSWORD) -> None:
        """Authenticate and retain the bearer token plus user id.

        Tokens are cached per credential pair. Logging in once per test looks
        harmless but hammers Supabase Auth, which starts returning
        ``UND_ERR_HEADERS_TIMEOUT`` under rapid-fire sign-in and turns a working
        backend into a wall of 30s read timeouts.
        """
        cached = _TOKEN_CACHE.get(email)
        if cached and cached["expires_at"] - time.time() > 120:
            self.token = cached["token"]
            self.user_id = cached["user_id"]
            return

        r = requests.post(f"{API}/auth/login",
                          data=json.dumps({"email": email, "password": password}),
                          headers={"Content-Type": "application/json"}, timeout=60)
        r.raise_for_status()
        body = r.json()
        self.token = body["session"]["access_token"]
        self.user_id = body["user"]["id"]
        _TOKEN_CACHE[email] = {
            "token": self.token,
            "user_id": self.user_id,
            "expires_at": time.time() + body["session"].get("expires_in", 3600),
        }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def caps() -> Caps:
    return CAPS


@pytest.fixture(scope="session")
def anon() -> Api:
    """Unauthenticated client, for negative auth tests."""
    return Api()


@pytest.fixture(scope="session")
def api() -> Api:
    """Authenticated client for the standard test user."""
    client = Api()
    client.login()
    return client


@pytest.fixture
def auth_client() -> Api:
    """Fresh authenticated client so state mutations cannot leak across tests."""
    client = Api()
    client.login()
    return client


@pytest.fixture
def document_id(auth_client: Api) -> str:
    """Create a throwaway document for read/write tests to operate on.

    Function scoped so each test owns its own document; nothing leaks between
    tests that mutate or trash state.
    """
    r = auth_client.post("/documents", {"title": "e2e harness scratch"})
    assert r.status_code in (200, 201), f"could not create document: {r.status_code} {r.text[:200]}"
    return r.json()["id"]


# ---------------------------------------------------------------------------
# Test decorator
# ---------------------------------------------------------------------------


def e2e(module: str, requires: tuple[str, ...] = (), layer: str = "api"):
    """Mark a test with its owning module, preconditions, and layer.

    Tests whose preconditions are unmet are skipped with an explicit reason so
    the summary distinguishes a missing dependency from a real defect.
    """

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        missing = unmet(requires)
        if missing:
            reason = f"blocked: needs {', '.join(missing)}"
            return pytest.mark.skip(reason)(fn)
        marks = [
            pytest.mark.e2e,
            pytest.mark.layer(layer),
            pytest.mark.module(module),
        ]
        for m in marks:
            fn = m(fn)
        fn.__e2e_module__ = module  # type: ignore[attr-defined]
        fn.__e2e_requires__ = requires  # type: ignore[attr-defined]
        return fn

    return decorator


# ---------------------------------------------------------------------------
# Browser helpers
# ---------------------------------------------------------------------------


AUTH_STATE_PATH = ARTIFACTS / "auth_state.json"


@pytest.fixture(scope="session")
def browser():
    """System Chrome/Edge with fallback and headed mode support."""
    from playwright.sync_api import sync_playwright

    is_headed = os.environ.get("HEADED", "").lower() in ("1", "true", "yes") or \
                os.environ.get("PW_HEADED", "").lower() in ("1", "true", "yes")
    slow_mo = int(os.environ.get("SLOWMO", "0"))

    with sync_playwright() as p:
        b = None
        launch_err = None
        for channel in ("chrome", None, "msedge"):
            try:
                kw: dict[str, Any] = {"headless": not is_headed, "slow_mo": slow_mo}
                if channel:
                    kw["channel"] = channel
                b = p.chromium.launch(**kw)
                break
            except Exception as exc:
                launch_err = exc
                continue

        if b is None:
            pytest.skip(f"blocked: could not launch browser ({launch_err})")
        CAPS.browser = True
        yield b
        b.close()


@pytest.fixture
def page(browser):
    """A page with categorized console and network failure capture wired up."""
    ctx = browser.new_context(viewport={"width": 1600, "height": 950})
    pg = ctx.new_page()
    pg.e2e_errors: list[str] = []  # type: ignore[attr-defined]
    pg.console_errors: list[str] = []  # type: ignore[attr-defined]
    pg.console_warnings: list[str] = []  # type: ignore[attr-defined]
    pg.network_failures: list[str] = []  # type: ignore[attr-defined]
    pg.console_logs: list[str] = []  # type: ignore[attr-defined]

    def _on_console(m: Any) -> None:
        msg = f"[{m.type}] {m.text}"
        pg.e2e_errors.append(msg)
        if m.type == "error":
            pg.console_errors.append(m.text)
        elif m.type == "warning":
            pg.console_warnings.append(m.text)
        else:
            pg.console_logs.append(m.text)

    def _on_pageerror(e: Any) -> None:
        msg = f"PAGEERROR: {e}"
        pg.e2e_errors.append(msg)
        pg.console_errors.append(msg)

    def _on_req_failed(r: Any) -> None:
        msg = f"[requestfailed] {r.failure} {r.url[:120]}"
        pg.e2e_errors.append(msg)
        pg.network_failures.append(msg)

    pg.on("pageerror", _on_pageerror)
    pg.on("console", _on_console)
    pg.on("requestfailed", _on_req_failed)
    yield pg
    ctx.close()


def safe_action(page, action_fn: Callable[[], Any], description: str = "action", max_retries: int = 3, timeout_ms: int = 5000) -> Any:
    """Execute an action with retry and freeze detection.
    
    If the UI is unresponsive or freezes, retries up to max_retries before raising
    a descriptive TimeoutError.
    """
    last_err: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            page.set_default_timeout(timeout_ms)
            res = action_fn()
            page.set_default_timeout(30000)
            return res
        except Exception as exc:
            last_err = exc
            page.wait_for_timeout(800)
    page.set_default_timeout(30000)
    raise TimeoutError(f"Freeze detected on {description} after {max_retries} attempts: {last_err}")


def sign_in(page, use_cache: bool = True) -> None:
    """Log in through the real UI with optional state caching to avoid throttling."""
    if use_cache and AUTH_STATE_PATH.exists():
        try:
            with open(AUTH_STATE_PATH, "r", encoding="utf-8") as f:
                state = json.load(f)
            if state.get("origins"):
                page.context.add_cookies(state.get("cookies", []))
                page.goto(f"{WEB}/dashboard", wait_until="domcontentloaded")
                page.wait_for_timeout(1000)
                if "/dashboard" in page.url:
                    return
        except Exception:
            pass

    page.goto(f"{WEB}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    page.fill("input#email", EMAIL)
    page.fill("input#password", PASSWORD)
    page.click("button[type=submit]")
    page.wait_for_url(f"{WEB}/dashboard", timeout=20000)
    page.wait_for_timeout(1500)

    try:
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        page.context.storage_state(path=str(AUTH_STATE_PATH))
    except Exception:
        pass


def open_first_document(page, title: str = "Untitled document") -> None:
    """Open a document from the dashboard and wait for the editor to mount."""
    row = page.get_by_text(title).first
    row.dblclick()
    page.wait_for_selector(".ProseMirror", timeout=25000)
    page.wait_for_timeout(1500)


def editor_state(page) -> dict[str, Any]:
    """Read back formatting-relevant DOM state from the editor."""
    return page.evaluate(
        """() => {
            const pm = document.querySelector('.ProseMirror');
            if (!pm) return { mounted: false };
            const sel = window.getSelection();
            return {
                mounted: true,
                html: pm.innerHTML.slice(0, 400),
                text: (pm.innerText || '').slice(0, 200),
                tags: Array.from(new Set(
                    Array.from(pm.querySelectorAll('h1,h2,h3,strong,em,u,s,sub,sup,ul,ol,blockquote,table'))
                        .map(e => e.tagName.toLowerCase()))),
                bold: !!pm.querySelector('strong,b'),
                italic: !!pm.querySelector('em,i'),
                underline: !!pm.querySelector('u'),
                strike: !!pm.querySelector('s,del,strike'),
                align: (() => {
                    const el = pm.querySelector('[style*=text-align]');
                    return el ? el.getAttribute('style') : null;
                })(),
                selectionText: sel ? String(sel) : '',
            };
        }"""
    )


def select_last_paragraph(page) -> None:
    """Put the caret at the end of the document and select the current line."""
    page.click(".ProseMirror")
    page.wait_for_timeout(300)
    page.keyboard.press("Control+End")
    page.wait_for_timeout(200)
    page.keyboard.press("Home")
    page.keyboard.down("Shift")
    page.keyboard.press("End")
    page.keyboard.up("Shift")
    page.wait_for_timeout(300)


def press_toolbar(page, title: str, settle: int = 900) -> None:
    """Click a toolbar button addressed by its accessible name."""
    page.click(f'button[title^="{title}"]')
    page.wait_for_timeout(settle)


def screenshot(page, name: str) -> Path:
    """Save a screenshot. Useful for humans; the suite itself asserts on text."""
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    path = ARTIFACTS / f"{name}.png"
    try:
        page.screenshot(path=str(path), full_page=True)
    except Exception:
        pass
    return path


def block_by_text(page, needle: str) -> dict[str, Any] | None:
    """Read computed formatting for the editor block containing ``needle``.

    Locating the block by its text is deliberate. Clicking a toolbar button
    moves focus off the ProseMirror surface, so ``window.getSelection()`` is
    empty afterwards even though ProseMirror still holds the selection
    internally. Keying off the probe text that each test typed is stable and
    also proves the text landed where the test intended.
    """
    return page.evaluate(
        """(needle) => {
            const pm = document.querySelector('.ProseMirror');
            if (!pm) return null;
            const blocks = Array.from(
                pm.querySelectorAll('p,h1,h2,h3,li,blockquote,pre'));
            const el = blocks.find(b => (b.innerText || '').includes(needle));
            if (!el) return { missing: true, blocks: blocks.map(b => b.tagName.toLowerCase()) };
            const cs = getComputedStyle(el);
            return {
                found: true,
                tag: el.tagName.toLowerCase(),
                text: (el.innerText || '').slice(0, 120),
                fontWeight: cs.fontWeight,
                fontStyle: cs.fontStyle,
                textDecoration: cs.textDecorationLine,
                textAlign: cs.textAlign,
                hasStrong: !!el.querySelector('strong,b'),
                hasEm: !!el.querySelector('em,i'),
                hasU: !!el.querySelector('u'),
                hasStrike: !!el.querySelector('s,del,strike'),
                inList: !!el.closest('ul,ol'),
                listTag: el.closest('ul') ? 'ul' : el.closest('ol') ? 'ol' : null,
                html: el.innerHTML.slice(0, 200),
            };
        }""",
        needle,
    )


def open_document(page, api: Api, content: str = "<p>e2e scratch document</p>") -> str:
    """Create a document over the API and open it in the editor.

    Browser tests get their own document rather than reusing one of the user's,
    so a formatting test can never damage real content.
    """
    created = api.post("/documents", {"title": "e2e browser scratch"})
    assert created.status_code in (200, 201), created.text[:200]
    doc_id = created.json()["id"]
    api.put(f"/documents/{doc_id}", {"content": content})

    page.goto(f"{WEB}/document/{doc_id}", wait_until="domcontentloaded")
    page.wait_for_selector(".ProseMirror", timeout=25000)
    page.wait_for_timeout(1200)
    return doc_id


def filter_console_noise(page) -> list[str]:
    """Drop console lines that are environmental rather than app defects.

    Google Fonts is blocked on this network, the missing ML service produces
    connection errors on every prediction call, and the Vite dev server plus
    Chrome produce their own debug chatter. All are reported separately by the
    capability probe rather than counted as application failures.
    """
    noise = (
        "fonts.googleapis.com",
        "ECONNREFUSED",
        "ERR_BLOCKED_BY_ORB",
        # Dev-server / browser noise that can never be an application defect.
        "[vite]",
        "React DevTools",
        "autocomplete attributes",
        # React StrictMode mounts the editor twice in dev; tearing down the
        # first Harper worker aborts its in-flight WASM fetch.
        "harper_wasm_bg.wasm",
    )
    return [e for e in page.e2e_errors if not any(n in e for n in noise)]  # type: ignore[attr-defined]
