"""IntelliDocs Automated UI/UX Tester Agent.

Drives the real application via Playwright as an end-user, captures screenshots,
records console errors/network anomalies, and detects freezes.

Usage:
    python tests/e2e/test_agent.py --inspect login
    python tests/e2e/test_agent.py --inspect dashboard
    python tests/e2e/test_agent.py --inspect editor [doc_id]
    python tests/e2e/test_agent.py --url http://localhost:5173/some-path
    python tests/e2e/test_agent.py --headed --inspect dashboard
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:5173").rstrip("/")
API = os.environ.get("API_URL", "http://localhost:3000").rstrip("/")
EMAIL = os.environ.get("TEST_EMAIL", "test@test.com")
PASSWORD = os.environ.get("TEST_PASSWORD", "asd123")

INSPECTION_DIR = Path(__file__).parent / "artifacts" / "inspection"
AUTH_STATE = Path(__file__).parent / "artifacts" / "auth_state.json"


class UserTester:
    def __init__(self, headed: bool = False, slow_mo: int = 0):
        self.headed = headed
        self.slow_mo = slow_mo
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.network_fails: list[str] = []
        INSPECTION_DIR.mkdir(parents=True, exist_ok=True)

    def start(self):
        self.playwright = sync_playwright().start()
        # Fallback through chrome -> default chromium -> msedge
        b = None
        for channel in ("chrome", None, "msedge"):
            try:
                kw = {"headless": not self.headed, "slow_mo": self.slow_mo}
                if channel:
                    kw["channel"] = channel
                b = self.playwright.chromium.launch(**kw)
                break
            except Exception:
                continue

        if not b:
            raise RuntimeError("Failed to launch any browser (chrome, chromium, msedge).")

        self.browser = b
        self.context = self.browser.new_context(viewport={"width": 1600, "height": 950})
        self.page = self.context.new_page()

        self.page.on("pageerror", lambda e: self.errors.append(f"PAGEERROR: {e}"))
        self.page.on("console", self._handle_console)
        self.page.on("requestfailed", lambda r: self.network_fails.append(f"[FAIL] {r.failure} {r.url[:120]}"))

    def _handle_console(self, msg):
        text = msg.text
        # Ignore noisy external font warnings if any
        if "fonts.googleapis.com" in text:
            return
        if msg.type == "error":
            self.errors.append(text)
        elif msg.type == "warning":
            self.warnings.append(text)

    def snap(self, name: str, full_page: bool = True) -> Path:
        timestamp = int(time.time())
        path = INSPECTION_DIR / f"{name}_{timestamp}.png"
        self.page.screenshot(path=str(path), full_page=full_page, timeout=15000)
        return path

    def safe_action(self, fn, description: str = "action", max_retries: int = 3, timeout_ms: int = 5000):
        last_err = None
        for attempt in range(1, max_retries + 1):
            try:
                self.page.set_default_timeout(timeout_ms)
                res = fn()
                self.page.set_default_timeout(30000)
                return res
            except Exception as exc:
                last_err = exc
                self.page.wait_for_timeout(800)
        self.page.set_default_timeout(30000)
        raise TimeoutError(f"UI froze on '{description}' after {max_retries} attempts: {last_err}")

    def sign_in(self):
        # Try auth state cache first
        if AUTH_STATE.exists():
            try:
                with open(AUTH_STATE, "r", encoding="utf-8") as f:
                    state = json.load(f)
                if state.get("origins"):
                    self.context.add_cookies(state.get("cookies", []))
                    self.page.goto(f"{WEB}/dashboard", wait_until="domcontentloaded")
                    self.page.wait_for_timeout(1000)
                    if "/dashboard" in self.page.url:
                        return
            except Exception:
                pass

        self.page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        self.page.wait_for_timeout(1200)
        self.page.fill("input#email", EMAIL)
        self.page.fill("input#password", PASSWORD)
        self.page.click("button[type=submit]")
        self.page.wait_for_url(f"{WEB}/dashboard", timeout=20000)
        self.page.wait_for_timeout(1200)

        try:
            self.context.storage_state(path=str(AUTH_STATE))
        except Exception:
            pass

    def inspect_login(self) -> dict[str, Any]:
        self.page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        self.page.wait_for_timeout(1200)
        shot = self.snap("login_view")
        title = self.page.title()
        has_email = self.page.query_selector("input#email") is not None
        has_password = self.page.query_selector("input#password") is not None
        has_submit = self.page.query_selector("button[type=submit]") is not None
        return {
            "view": "login",
            "url": self.page.url,
            "title": title,
            "elements": {
                "email_input": has_email,
                "password_input": has_password,
                "submit_button": has_submit,
            },
            "screenshot": str(shot),
            "errors": self.errors,
            "network_failures": self.network_fails,
        }

    def inspect_dashboard(self) -> dict[str, Any]:
        self.sign_in()
        self.page.wait_for_timeout(1500)
        shot = self.snap("dashboard_view")
        body_text = self.page.inner_text("body")
        cards = len(self.page.query_selector_all("[data-testid=doc-card], tr, .document-card"))
        return {
            "view": "dashboard",
            "url": self.page.url,
            "document_rows_detected": cards,
            "has_new_doc_button": bool(self.page.get_by_text("New Document", exact=False).count() or self.page.query_selector("button:has-text('New')")),
            "screenshot": str(shot),
            "errors": self.errors,
            "network_failures": self.network_fails,
        }

    def inspect_editor(self, doc_id: str | None = None) -> dict[str, Any]:
        self.sign_in()

        # Block Google Fonts CDN to prevent document.fonts.ready hang
        self.page.route("**fonts.googleapis.com**", lambda r: r.abort())
        self.page.route("**fonts.gstatic.com**", lambda r: r.abort())

        if not doc_id:
            import requests
            try:
                lr = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
                token = lr.json()["session"]["access_token"]
                cr = requests.post(
                    f"{API}/documents",
                    json={"title": "Automated Tester Evaluation Manuscript", "content": "<h1>Automated Testing Manuscript</h1><p>Testing academic typography, formatting tools, and council review.</p>"},
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    timeout=30
                )
                doc_id = cr.json()["id"]
            except Exception as e:
                self.errors.append(f"Failed creating scratch doc via API: {e}")

        if doc_id:
            self.page.goto(f"{WEB}/document/{doc_id}", wait_until="domcontentloaded")
            self.page.wait_for_timeout(3000)

        # Wait for editor
        try:
            self.page.wait_for_selector(".ProseMirror", timeout=15000)
        except Exception:
            pass

        self.page.wait_for_timeout(1500)
        # Viewport-only screenshot (full_page times out on paginated editor)
        shot = self.snap("editor_view", full_page=False)

        has_pm = self.page.query_selector(".ProseMirror") is not None
        toolbar_buttons = len(self.page.query_selector_all("button[title]"))
        page_breaks = len(self.page.query_selector_all(".rm-page-break, .page-break"))
        div_count = self.page.evaluate("document.querySelectorAll('div').length")
        return {
            "view": "editor",
            "url": self.page.url,
            "prosemirror_mounted": has_pm,
            "toolbar_buttons_count": toolbar_buttons,
            "page_break_count": page_breaks,
            "total_div_count": div_count,
            "freeze_likely": page_breaks > 20 or div_count > 2000,
            "screenshot": str(shot),
            "errors": self.errors,
            "network_failures": self.network_fails,
        }

    def inspect_url(self, url: str) -> dict[str, Any]:
        self.page.goto(url, wait_until="domcontentloaded")
        self.page.wait_for_timeout(1500)
        shot = self.snap("custom_url")
        return {
            "view": "custom_url",
            "url": self.page.url,
            "title": self.page.title(),
            "screenshot": str(shot),
            "errors": self.errors,
            "network_failures": self.network_fails,
        }

    def close(self):
        if self.context:
            self.context.close()
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()


def main():
    parser = argparse.ArgumentParser(description="IntelliDocs UI/UX Tester")
    parser.add_argument("--inspect", choices=["login", "dashboard", "editor"], help="Predefined view to inspect")
    parser.add_argument("--doc-id", help="Document ID for editor inspection")
    parser.add_argument("--url", help="Direct URL to navigate and inspect")
    parser.add_argument("--headed", action="store_true", help="Launch visible browser window")
    parser.add_argument("--slowmo", type=int, default=0, help="Slow down Playwright actions in ms")
    args = parser.parse_args()

    tester = UserTester(headed=args.headed, slow_mo=args.slowmo)
    try:
        tester.start()
        res = {}
        if args.inspect == "login":
            res = tester.inspect_login()
        elif args.inspect == "dashboard":
            res = tester.inspect_dashboard()
        elif args.inspect == "editor":
            res = tester.inspect_editor(args.doc_id)
        elif args.url:
            res = tester.inspect_url(args.url)
        else:
            parser.print_help()
            sys.exit(1)

        print("\n=== INSPECTION REPORT ===")
        print(json.dumps(res, indent=2))
    finally:
        tester.close()


if __name__ == "__main__":
    main()
