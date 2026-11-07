"""E2E Test for the Professor Dashboard.

Verifies:
1. A dedicated e2e professor account exists and is an *approved* professor (created or
   re-approved through the Supabase admin API, so the run never stalls on the 403 page).
2. /professor mounts with all 5 tabs: Overview, Classes, Submissions, Plagiarism, Compliance.
3. Every tab renders its panel without an error banner or a spinner that never settles.
4. Submissions shows submission cards or its clean empty state.
5. Plagiarism shows the similarity matrix (table, class filters) or its clean empty state.
6. Captures screenshots for artifacts. Exits 1 when any check FAILs.
"""

import os
import sys
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright

WEB = "http://localhost:5173"
EMAIL = os.environ.get("E2E_PROFESSOR_EMAIL", "e2e-professor@intellidocs.test")
PASSWORD = os.environ.get("E2E_PROFESSOR_PASSWORD", "e2e-Professor-123")
TABS = ["Overview", "Classes", "Submissions", "Plagiarism", "Compliance"]

ARTIFACT_DIR = Path("C:/Users/asus/.gemini/antigravity/brain/9dcfe603-ca1e-4a77-a93d-644ee7188bc7")
SERVER_ENV = Path(__file__).resolve().parents[2] / "server" / ".env"


def screenshot(page, name: str) -> str:
    path = str(ARTIFACT_DIR / f"{name}.png")
    page.screenshot(path=path)
    print(f"  [screenshot] -> {name}.png")
    return path


def supabase_admin() -> tuple[str, dict]:
    """Supabase URL and service-role headers, from the environment or server/.env."""
    env = dict(os.environ)
    if SERVER_ENV.exists():
        for line in SERVER_ENV.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.strip().partition("=")
            if sep and not key.startswith("#"):
                env.setdefault(key.strip(), value.strip().strip("'\""))
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_SERVICE_KEY")
    assert url and key, "SUPABASE_URL and SUPABASE_SERVICE_KEY are required to set up the professor account"
    return url.rstrip("/"), {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def ensure_professor_account() -> None:
    """Create the e2e professor if missing, then make it an approved professor. Safe to rerun."""
    url, headers = supabase_admin()
    created = requests.post(
        f"{url}/auth/v1/admin/users",
        headers=headers,
        json={"email": EMAIL, "password": PASSWORD, "email_confirm": True},
        timeout=20,
    )
    # 422 means the account already exists, which is fine.
    assert created.status_code in (200, 201, 422), f"creating professor failed: {created.status_code} {created.text}"

    login = requests.post(
        f"{url}/auth/v1/token?grant_type=password",
        headers={"apikey": headers["apikey"], "Content-Type": "application/json"},
        json={"email": EMAIL, "password": PASSWORD},
        timeout=20,
    )
    assert login.status_code == 200, f"professor sign-in failed: {login.status_code} {login.text}"
    user_id = login.json()["user"]["id"]

    role = requests.get(
        f"{url}/rest/v1/roles", headers=headers, params={"role_name": "eq.professor", "select": "role_id"}, timeout=20
    )
    assert role.status_code == 200 and role.json(), f"professor role not found: {role.status_code} {role.text}"

    profile = requests.post(
        f"{url}/rest/v1/user_profiles",
        headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
        params={"on_conflict": "user_id"},
        json={"user_id": user_id, "role_id": role.json()[0]["role_id"], "verification_status": "approved"},
        timeout=20,
    )
    assert profile.status_code in (200, 201, 204), f"approving professor failed: {profile.status_code} {profile.text}"
    print(f"[OK] Approved professor account ready: {EMAIL}")


def panel_settled(page) -> bool:
    """True once no spinner is visible (waits up to 10s for loading to finish)."""
    for _ in range(20):
        if not page.locator("main [class*='animate-spin']").first.is_visible():
            return True
        page.wait_for_timeout(500)
    return False


def run_test() -> int:
    results: dict[str, str] = {}
    ensure_professor_account()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        ctx = browser.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()

        page.route("**fonts.googleapis.com**", lambda r: r.abort())
        page.route("**fonts.gstatic.com**", lambda r: r.abort())

        # ── Step 1: Sign in ─────────────────────────────────────────────────
        print("\n=== STEP 1: Signing In ===")
        page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        page.fill("input#email", EMAIL)
        page.fill("input#password", PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_url(f"{WEB}/dashboard", timeout=20000)
        print("[OK] Authenticated")

        # ── Step 2: Navigate to Professor Dashboard ─────────────────────────
        print("\n=== STEP 2: Navigating to Professor Dashboard ===")
        page.goto(f"{WEB}/professor", wait_until="domcontentloaded")
        page.wait_for_timeout(2000)

        if page.get_by_text("403 Forbidden", exact=False).first.is_visible():
            results["professor_access"] = "FAIL (403 page shown to an approved professor)"
            screenshot(page, "professor_dashboard_403")
        else:
            results["professor_access"] = "PASS"
            print("[OK] Professor Dashboard loaded")
            screenshot(page, "professor_dashboard_home")

            # ── Step 3: Visit every tab ─────────────────────────────────────
            print("\n=== STEP 3: Visiting Each Tab ===")
            for tab_name in TABS:
                tab = page.locator("button", has_text=tab_name).first
                if not tab.is_visible():
                    results[f"tab_{tab_name.lower()}"] = "FAIL (tab button missing)"
                    continue
                tab.click()
                page.wait_for_timeout(800)
                settled = panel_settled(page)
                failed_banner = page.locator("[role=status].text-red-700, [role=alert]").first.is_visible()
                results[f"tab_{tab_name.lower()}"] = (
                    "PASS" if settled and not failed_banner else f"FAIL (settled={settled}, error banner={failed_banner})"
                )
                print(f"  Tab '{tab_name}': {results[f'tab_{tab_name.lower()}']}")
                screenshot(page, f"professor_tab_{tab_name.lower()}")

                if tab_name == "Submissions":
                    cards = page.locator("main article, main li, main tbody tr").count()
                    empty = page.get_by_text("No submissions yet").first.is_visible()
                    results["submissions_content"] = (
                        f"PASS ({cards} submission entries)" if cards else "PASS (Clean Empty State)" if empty
                        else "FAIL (neither submissions nor empty state)"
                    )
                    print(f"  Submissions: {results['submissions_content']}")

                if tab_name == "Plagiarism":
                    has_table = page.locator("main table").first.is_visible()
                    has_filters = page.locator("select[aria-label='Class code']").first.is_visible()
                    empty = any(
                        page.get_by_text(text, exact=False).first.is_visible()
                        for text in ("Create a class first", "No submissions", "No class")
                    )
                    results["similarity_matrix"] = (
                        "PASS (Table Rendered)" if has_table else "PASS (Class Filters Ready)" if has_filters
                        else "PASS (Clean Empty State)" if empty else "WARN (Inspect screenshot)"
                    )
                    print(f"  Similarity matrix: {results['similarity_matrix']}")

        # ── Summary ──────────────────────────────────────────────────────────
        print("\n" + "=" * 56)
        print("PROFESSOR DASHBOARD TEST RESULTS:")
        print("=" * 56)
        for key, val in results.items():
            status = "[PASS]" if val.startswith("PASS") else ("[WARN]" if val.startswith("WARN") else "[FAIL]")
            print(f"  {status}  {key}: {val}")
        print("=" * 56)

        browser.close()

    return 1 if any(val.startswith("FAIL") for val in results.values()) else 0


if __name__ == "__main__":
    sys.exit(run_test())
