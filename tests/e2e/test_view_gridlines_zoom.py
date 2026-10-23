"""E2E test for the View controls in Page Setup (gridlines + canvas zoom).

Scope note: the original "Multi-Page grid / Two-Page spread" milestone was
re-scoped to gridlines + zoom because re-gridding tiptap-pagination-plus's
page-break markers feeds the wrapper height back into the extension's
page-count math and explodes pagination on multi-page documents (proven with
563 phantom pages on a 2-page doc). Zoom and gridlines are pure CSS and do
not touch pagination geometry.

Verifies:
1. Page Setup -> View section exposes Gridlines toggle and 50/75/100% zoom.
2. The removed Two-Page / Multi-Page layout buttons are gone.
3. 50% zoom applies (computed zoom = 0.5) and typing does NOT change the page
   count (the regression guard for the old feedback loop).
4. Gridlines paint a non-printing alignment grid on the page markers and
   toggling Off removes it.
5. Back to 100% restores computed zoom 1.
6. No relevant console errors.
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

WEB = "http://localhost:5173"
EMAIL = "test@test.com"
PASSWORD = "asd123"
DOC_ID = "a3c5c8ac-29c6-4f9a-a996-884ba169f81d"

ARTIFACT_DIR = Path("C:/Users/asus/.gemini/antigravity/brain/9dcfe603-ca1e-4a77-a93d-644ee7188bc7")

NOISE = (
    "vite",
    "react devtools",
    "autocomplete",
    "favicon",
    "fonts.googleapis",
    "fonts.gstatic",
    "harper_wasm_bg.wasm",
    "download the react",
    "eruda",
)


def is_noise(text: str) -> bool:
    lowered = text.lower()
    return any(fragment in lowered for fragment in NOISE)


def screenshot(page, name: str) -> None:
    page.screenshot(path=str(ARTIFACT_DIR / f"{name}.png"))
    print(f"  [screenshot] -> {name}.png")


def run_test() -> None:
    results: dict[str, str] = {}
    console_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        ctx = browser.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: console_errors.append(str(exc)))

        # ── Step 1: Sign in and open the document ────────────────────────────
        print("\n=== STEP 1: Signing In ===")
        page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        page.fill("input#email", EMAIL)
        page.fill("input#password", PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_url(f"{WEB}/dashboard", timeout=30000)

        print("\n=== STEP 2: Opening Document ===")
        page.goto(f"{WEB}/document/{DOC_ID}", wait_until="domcontentloaded")
        page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=40000)
        page.wait_for_timeout(3000)

        def break_count() -> int:
            return page.locator(".rm-pages-wrapper > .rm-page-break").count()

        initial_breaks = break_count()
        print(f"  Pages at load: {initial_breaks}")

        # ── Step 3: View controls present, layout buttons gone ───────────────
        print("\n=== STEP 3: View Controls ===")
        page.locator("button:has-text('Page Setup')").first.click()
        page.wait_for_timeout(600)

        gridlines_toggle = page.get_by_role("button", name="Off", exact=True).first
        zoom_50 = page.locator("button:has-text('50%')").first
        zoom_100 = page.locator("button:has-text('100%')").first
        have_controls = all(el.is_visible() for el in (gridlines_toggle, zoom_50, zoom_100))
        results["view_controls_present"] = "PASS" if have_controls else "FAIL"
        print(f"  Gridlines + zoom controls visible: {results['view_controls_present']}")

        removed_layout_buttons = page.locator("button:text-is('Multi-Page')").count()
        results["grid_layout_buttons_removed"] = "PASS" if removed_layout_buttons == 0 else "FAIL"
        print(f"  Multi-Page button absent: {results['grid_layout_buttons_removed']}")
        screenshot(page, "view_controls_page_setup")

        # ── Step 4: Zoom applies; typing does not disturb pagination ─────────
        print("\n=== STEP 4: Zoom ===")
        zoom_50.click()
        page.wait_for_timeout(1000)
        zoom_value = page.eval_on_selector(
            ".intellidocs-page-editor", "el => getComputedStyle(el).zoom"
        )
        results["zoom_applied"] = (
            "PASS" if str(zoom_value).startswith("0.5") else f"FAIL ({zoom_value})"
        )
        print(f"  Zoom applied: {results['zoom_applied']} (zoom={zoom_value})")

        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        page.locator(".ProseMirror > p").first.click()
        page.keyboard.type("x")
        page.wait_for_timeout(1800)
        breaks_after_typing = break_count()
        typing_ok = breaks_after_typing == initial_breaks
        results["pagination_stable_under_zoom"] = "PASS" if typing_ok else "FAIL"
        print(
            f"  Page count stable under zoom + typing: {results['pagination_stable_under_zoom']} "
            f"({initial_breaks} -> {breaks_after_typing})"
        )
        page.keyboard.press("Control+z")
        page.wait_for_timeout(800)
        screenshot(page, "view_zoom_50")

        # ── Step 5: Gridlines on/off ─────────────────────────────────────────
        print("\n=== STEP 5: Gridlines ===")
        page.locator("button:has-text('Page Setup')").first.click()
        page.wait_for_timeout(600)
        page.get_by_role("button", name="Off", exact=True).first.click()
        page.wait_for_timeout(800)
        gridlines_bg = page.eval_on_selector(
            ".rm-pages-wrapper > .rm-page-break > .page",
            "el => getComputedStyle(el, '::after').backgroundImage",
        )
        has_gridlines = "linear-gradient" in (gridlines_bg or "")
        results["gridlines_rendered"] = "PASS" if has_gridlines else "FAIL"
        print(f"  Gridlines painted: {results['gridlines_rendered']}")
        screenshot(page, "view_gridlines_on")

        page.get_by_role("button", name="On", exact=True).first.click()
        page.wait_for_timeout(800)
        gridlines_bg_off = page.eval_on_selector(
            ".rm-pages-wrapper > .rm-page-break > .page",
            "el => getComputedStyle(el, '::after').backgroundImage",
        )
        removed = gridlines_bg_off in (None, "", "none")
        results["gridlines_toggled_off"] = "PASS" if removed else "FAIL"
        print(f"  Gridlines toggled off: {results['gridlines_toggled_off']}")

        # ── Step 6: Back to 100% ─────────────────────────────────────────────
        print("\n=== STEP 6: Restore Zoom ===")
        zoom_100.click()
        page.wait_for_timeout(800)
        zoom_back = page.eval_on_selector(
            ".intellidocs-page-editor", "el => getComputedStyle(el).zoom"
        )
        results["zoom_restored"] = (
            "PASS" if str(zoom_back) in ("1", "1.0", "normal") else f"FAIL ({zoom_back})"
        )
        print(f"  Zoom restored: {results['zoom_restored']} (zoom={zoom_back})")

        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        final_breaks = break_count()
        results["pagination_intact"] = "PASS" if final_breaks == initial_breaks else "FAIL"
        print(f"  Pagination intact: {results['pagination_intact']} ({final_breaks} pages)")

        relevant_errors = [e for e in console_errors if not is_noise(e)]
        results["no_console_errors"] = "PASS" if not relevant_errors else "FAIL"
        if relevant_errors:
            for err in relevant_errors[:5]:
                print(f"    [console] {err[:160]}")
        print(f"  Console errors: {results['no_console_errors']} ({len(relevant_errors)} relevant)")

        # ── Summary ──────────────────────────────────────────────────────────
        print("\n" + "=" * 56)
        print("VIEW GRIDLINES & ZOOM TEST RESULTS:")
        print("=" * 56)
        for key, val in results.items():
            status = "[PASS]" if val.startswith("PASS") else "[FAIL]"
            print(f"  {status}  {key}: {val}")
        print("=" * 56)

        browser.close()

    if any(v.startswith("FAIL") for v in results.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    run_test()
