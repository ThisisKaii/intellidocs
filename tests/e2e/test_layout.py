"""E2E Test for Editor Centering & Outline Open/Close UX."""

import os
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB = "http://localhost:5173"
EMAIL = "test@test.com"
PASSWORD = "asd123"

ARTIFACT_DIR = Path("C:/Users/asus/.gemini/antigravity/brain/9dcfe603-ca1e-4a77-a93d-644ee7188bc7")

def test_layout():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        ctx = browser.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()

        page.route("**fonts.googleapis.com**", lambda r: r.abort())
        page.route("**fonts.gstatic.com**", lambda r: r.abort())

        errors = []
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

        print("1. Signing in...")
        page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        page.wait_for_timeout(1000)
        page.fill("input#email", EMAIL)
        page.fill("input#password", PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_url(f"{WEB}/dashboard", timeout=20000)
        print("[OK] Dashboard reached")

        print("2. Opening document...")
        page.goto(f"{WEB}/document/a3c5c8ac-29c6-4f9a-a996-884ba169f81d", wait_until="domcontentloaded")
        page.wait_for_selector(".ProseMirror", timeout=15000)
        page.wait_for_timeout(2000)
        print("[OK] Editor loaded")

        outline_aside = page.locator("aside.left-panel")
        editor_container = page.locator(".intellidocs-page-editor")

        # ── State A: Outline OPEN (280px), Right Panel OPEN (380px) ──
        print("\n--- Testing State A: Both Sidebars Open ---")
        assert outline_aside.is_visible(), "Outline panel should be open by default"
        box_a = editor_container.bounding_box()
        # Workspace = 1600 - 280 - 380 = 940px. Margin = (940 - 816) / 2 = 62px.
        # x = 280 + 62 = 342px.
        print(f"State A: x={box_a['x']:.1f} (expected ~342px, margins 62px / 62px)")
        assert 330 <= box_a['x'] <= 355, f"Canvas should be centered between sidebars, got x={box_a['x']}"
        screenshot_a = ARTIFACT_DIR / "layout_state_a_both_open.png"
        page.screenshot(path=str(screenshot_a), full_page=False)
        print(f"[OK] Saved screenshot: {screenshot_a}")

        # ── State B: Outline CLOSED (0px), Right Panel OPEN (380px) ──
        print("\n--- Testing State B: Outline Closed, Right Panel Open ---")
        close_btn = page.locator("aside.left-panel button[aria-label='Close outline']")
        assert close_btn.is_visible(), "Outline close button should be visible"
        close_btn.click()
        page.wait_for_timeout(600)
        assert not outline_aside.is_visible(), "Outline panel should now be hidden"
        box_b = editor_container.bounding_box()
        # Workspace = 1600 - 380 = 1220px. Margin = (1220 - 816) / 2 = 202px.
        # x = 202px.
        print(f"State B: x={box_b['x']:.1f} (expected ~202px, margins 202px / 202px)")
        assert 190 <= box_b['x'] <= 215, f"Canvas should be centered in 1220px workspace, got x={box_b['x']}"
        screenshot_b = ARTIFACT_DIR / "layout_state_b_outline_closed.png"
        page.screenshot(path=str(screenshot_b), full_page=False)
        print(f"[OK] Saved screenshot: {screenshot_b}")

        # ── Re-open via top nav button ──
        print("\n--- Testing Top Nav Outline Toggle ---")
        header_toggle = page.locator("button[aria-label='Show outline']").first
        assert header_toggle.is_visible(), "Header outline toggle button should be visible"
        header_toggle.click()
        page.wait_for_timeout(600)
        assert outline_aside.is_visible(), "Outline panel should be open again"
        print("[OK] Re-opened outline via header toggle")

        # ── State C: Outline OPEN (280px), Right Panel CLOSED (0px) ──
        print("\n--- Testing State C: Outline Open, Right Panel Closed ---")
        page.keyboard.press("Control+\\")
        page.wait_for_timeout(600)
        box_c = editor_container.bounding_box()
        # Workspace = 1600 - 280 = 1320px. Margin = (1320 - 816) / 2 = 252px.
        # x = 280 + 252 = 532px.
        print(f"State C: x={box_c['x']:.1f} (expected ~532px, margins 252px / 252px)")
        assert 520 <= box_c['x'] <= 545, f"Canvas should be centered in 1320px workspace, got x={box_c['x']}"
        screenshot_c = ARTIFACT_DIR / "layout_state_c_right_closed.png"
        page.screenshot(path=str(screenshot_c), full_page=False)
        print(f"[OK] Saved screenshot: {screenshot_c}")

        # ── State D: Full Zen Mode — Both CLOSED (0px / 0px) ──
        print("\n--- Testing State D: Full Zen Mode (Both Closed) ---")
        page.keyboard.press("Control+Shift+\\")
        page.wait_for_timeout(600)
        assert not outline_aside.is_visible(), "Outline should be closed"
        box_d = editor_container.bounding_box()
        # Workspace = 1600px. Margin = (1600 - 816) / 2 = 392px.
        # x = 392px.
        print(f"State D: x={box_d['x']:.1f} (expected ~392px, margins 392px / 392px)")
        assert 380 <= box_d['x'] <= 405, f"Canvas should be centered in full 1600px viewport, got x={box_d['x']}"
        screenshot_d = ARTIFACT_DIR / "layout_state_d_zen_mode.png"
        page.screenshot(path=str(screenshot_d), full_page=False)
        print(f"[OK] Saved screenshot: {screenshot_d}")

        print("\n==============================================")
        print("ALL 4 VIEWPORT COMBINATIONS VERIFIED & PERFECT!")
        print("==============================================")

if __name__ == "__main__":
    test_layout()
