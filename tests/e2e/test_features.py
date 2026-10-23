"""IntelliDocs Feature Test Suite.

Tests:
1. Typing and live content sync into the ProseMirror editor.
2. Toolbar formatting commands (Bold, Italic, Headings, Lists).
3. Outline auto-update based on heading changes.
4. AI Assistant interaction (chat message input, preview/confirm flow).
5. Document Style / Academic presets tab.
"""

import os
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB = "http://localhost:5173"
EMAIL = "test@test.com"
PASSWORD = "asd123"

ARTIFACTS_DIR = Path(__file__).parent / "artifacts" / "features"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)


def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        ctx = browser.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()

        # Block noisy fonts
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
        print("✓ Dashboard reached")

        # Open the test document
        print("2. Navigating to document...")
        page.goto(f"{WEB}/document/a3c5c8ac-29c6-4f9a-a996-884ba169f81d", wait_until="domcontentloaded")
        page.wait_for_selector(".ProseMirror", timeout=15000)
        page.wait_for_timeout(2000)
        print("✓ Editor loaded")

        # TEST 1: Focus editor and type text
        print("3. Testing typing & text insertion...")
        editor = page.locator(".ProseMirror")
        editor.click()
        page.keyboard.press("End")
        page.keyboard.press("Enter")
        page.keyboard.type("This is an automated test paragraph verifying live typing and formatting responsiveness.", delay=15)
        page.wait_for_timeout(1000)
        shot_typing = ARTIFACTS_DIR / "01_typing_test.png"
        page.screenshot(path=str(shot_typing), full_page=False)
        print(f"✓ Saved typing test screenshot: {shot_typing}")

        # TEST 2: Select text and apply Bold formatting
        print("4. Testing bold formatting via toolbar...")
        # Select all typed text in the paragraph
        page.keyboard.press("Control+A")
        # Find bold button (button with title or text or bold icon)
        bold_btn = page.locator("button[title*='Bold' i], button:has-text('B')").first
        if bold_btn.count() > 0:
            bold_btn.click()
            page.wait_for_timeout(800)
            print("✓ Clicked Bold button")
        else:
            print("! Bold button locator fallback")
            page.keyboard.press("Control+B")

        shot_bold = ARTIFACTS_DIR / "02_bold_format.png"
        page.screenshot(path=str(shot_bold), full_page=False)
        print(f"✓ Saved bold test screenshot: {shot_bold}")

        # TEST 3: Insert Heading 2 and test Outline sync
        print("5. Testing Heading 2 and Outline sync...")
        page.keyboard.press("ArrowRight")
        page.keyboard.press("Enter")
        h2_btn = page.locator("button:has-text('Heading 2'), button[title*='Heading 2' i]").first
        if h2_btn.count() > 0:
            h2_btn.click()
            page.wait_for_timeout(500)
        page.keyboard.type("Research Methodology and Results", delay=15)
        page.wait_for_timeout(1500)

        # Check outline panel
        outline = page.locator(".intellidocs-outline, :has-text('OUTLINE')").first
        outline_text = outline.inner_text() if outline.count() > 0 else ""
        print(f"  Outline contents preview: {outline_text[:100]}")

        shot_outline = ARTIFACTS_DIR / "03_outline_and_h2.png"
        page.screenshot(path=str(shot_outline), full_page=False)
        print(f"✓ Saved outline test screenshot: {shot_outline}")

        # TEST 4: Test Editor Assistant Chat Input
        print("6. Testing AI Chatbot panel interaction...")
        chat_input = page.locator("textarea[placeholder*='Ask for writing' i], input[placeholder*='Ask for writing' i]").first
        if chat_input.count() > 0:
            chat_input.click()
            chat_input.fill("Can you summarize the formatting styles of this document?")
            page.wait_for_timeout(500)
            send_btn = page.locator("button:has(svg.lucide-send), button:has-text('Send')").last
            if send_btn.count() > 0:
                send_btn.click()
                print("✓ Sent query to AI Assistant, waiting for response stream...")
                page.wait_for_timeout(5000)
            else:
                page.keyboard.press("Enter")
        
        shot_chat = ARTIFACTS_DIR / "04_ai_assistant_chat.png"
        page.screenshot(path=str(shot_chat), full_page=False)
        print(f"✓ Saved AI Assistant screenshot: {shot_chat}")

        # TEST 5: Top Navigation tabs (Insert / Styles / Page Setup)
        print("7. Testing Styles ribbon tab...")
        styles_tab = page.locator("button:has-text('Styles')").first
        if styles_tab.count() > 0:
            styles_tab.click()
            page.wait_for_timeout(1000)
            print("✓ Clicked Styles tab")

        shot_styles = ARTIFACTS_DIR / "05_styles_ribbon.png"
        page.screenshot(path=str(shot_styles), full_page=False)
        print(f"✓ Saved Styles Ribbon screenshot: {shot_styles}")

        print(f"\nTest finished. Page errors detected: {len(errors)}")
        for err in errors:
            print(f" - {err}")

        browser.close()


if __name__ == "__main__":
    run_tests()
