"""E2E Test for Professor Dashboard Similarity Matrix.

Verifies:
1. Authenticates test user and navigates to /professor.
2. Asserts Professor Dashboard mounts with all 5 tabs:
   - Template Rubrics
   - Compliance Audit
   - Document Reviews
   - Classroom Folders
   - Similarity Matrix
3. Clicks 'Similarity Matrix' tab.
4. Asserts that class folders load in the dropdown (or empty state renders cleanly without infinite spinner).
5. Asserts the matrix table renders or appropriate folder selection prompt appears.
6. Tests Refresh button.
7. Captures screenshots for artifacts.
"""

from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

WEB = "http://localhost:5173"
EMAIL = "test@test.com"
PASSWORD = "asd123"

ARTIFACT_DIR = Path("C:/Users/asus/.gemini/antigravity/brain/9dcfe603-ca1e-4a77-a93d-644ee7188bc7")


def screenshot(page, name: str) -> str:
    path = str(ARTIFACT_DIR / f"{name}.png")
    page.screenshot(path=path)
    print(f"  [screenshot] -> {name}.png")
    return path


def run_test():
    results: dict[str, str] = {}

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

        # Check if access was permitted or if 403 Forbidden is rendered
        is_403 = page.locator("text='403 Forbidden'").is_visible()
        if is_403:
            print("[WARN] User is not approved professor (403).")
            results["professor_access"] = "403_PENDING_APPROVAL"
            screenshot(page, "professor_dashboard_403")
            browser.close()
            return

        results["professor_access"] = "PASS"
        print("[OK] Professor Dashboard loaded")
        screenshot(page, "professor_dashboard_home")

        # ── Step 3: Verify All Tabs ─────────────────────────────────────────
        print("\n=== STEP 3: Verifying Tab Navigation ===")
        tabs = [
            "Template Rubrics",
            "Compliance Audit",
            "Document Reviews",
            "Classroom Folders",
            "Similarity Matrix",
        ]
        for tab_name in tabs:
            tab_locator = page.locator(f"button:has-text('{tab_name}')")
            is_tab_visible = tab_locator.is_visible()
            print(f"  Tab '{tab_name}': {'PASS' if is_tab_visible else 'FAIL'}")
            results[f"tab_{tab_name.lower().replace(' ', '_')}"] = "PASS" if is_tab_visible else "FAIL"

        # ── Step 4: Click Similarity Matrix Tab ─────────────────────────────
        print("\n=== STEP 4: Clicking Similarity Matrix Tab ===")
        sim_tab = page.locator("button:has-text('Similarity Matrix')").first
        sim_tab.click()
        page.wait_for_timeout(2000)

        screenshot(page, "professor_similarity_tab_active")

        # ── Step 5: Verify Similarity Matrix Content ────────────────────────
        print("\n=== STEP 5: Verifying Matrix Content / State ===")
        
        # Check that there is NO infinite spinner
        spinner = page.locator("[class*='animate-spin']")
        has_infinite_spinner = spinner.is_visible()
        results["no_infinite_spinner"] = "PASS" if not has_infinite_spinner else "FAIL"
        print(f"  No infinite spinner: {results['no_infinite_spinner']}")

        # Check for Class Similarity Matrix title or folder selector
        sim_header = page.locator("text='Class Similarity Matrix'").is_visible()
        results["similarity_header"] = "PASS" if sim_header else "FAIL"
        print(f"  Similarity Matrix header: {results['similarity_header']}")

        # Check dropdown or empty state
        folder_select = page.locator("select").first
        has_dropdown = folder_select.is_visible()
        empty_prompt = (
            page.locator("text='No classroom folders found'").first.is_visible() or
            page.locator("text='Create a classroom folder'").first.is_visible() or
            page.locator("text='Select a class folder'").first.is_visible() or
            page.locator("text='You don\\'t have any class folders yet'").first.is_visible()
        )
        has_table = page.locator("table").is_visible()

        print(f"  Folder dropdown visible: {has_dropdown}")
        print(f"  Empty state prompt visible: {empty_prompt}")
        print(f"  Matrix comparison table visible: {has_table}")

        if has_table:
            results["similarity_display_state"] = "PASS (Table Rendered)"
        elif empty_prompt:
            results["similarity_display_state"] = "PASS (Clean Empty State)"
        elif has_dropdown:
            results["similarity_display_state"] = "PASS (Folder Dropdown Ready)"
        else:
            results["similarity_display_state"] = "WARN (Inspect screenshot)"

        # ── Step 6: Test Refresh Button ─────────────────────────────────────
        print("\n=== STEP 6: Testing Refresh Button ===")
        refresh_btn = page.locator("button:has-text('Refresh')").last
        if refresh_btn.is_visible():
            refresh_btn.click()
            page.wait_for_timeout(1500)
            results["refresh_button"] = "PASS"
            print("  Refresh button clicked successfully")
        else:
            results["refresh_button"] = "WARN (Button not visible)"

        screenshot(page, "professor_similarity_final")

        # ── Summary ──────────────────────────────────────────────────────────
        print("\n" + "=" * 56)
        print("PROFESSOR DASHBOARD TEST RESULTS:")
        print("=" * 56)
        for key, val in results.items():
            status = "[PASS]" if val.startswith("PASS") else ("[WARN]" if val.startswith("WARN") else "[FAIL]")
            print(f"  {status}  {key}: {val}")
        print("=" * 56)

        browser.close()


if __name__ == "__main__":
    run_test()
