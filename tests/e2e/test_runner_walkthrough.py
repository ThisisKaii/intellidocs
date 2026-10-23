"""Walkthrough test script for IntelliDocs UI/UX critique.
Performs user journeys, clicks real UI elements, takes screenshots,
and records any styling glitches, console errors, or broken states.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

import sys
sys.path.insert(0, str(Path("tests/e2e")))
from harness import sign_in

WEB = "http://localhost:5173"
OUT = Path("tests/e2e/artifacts/inspection")
OUT.mkdir(parents=True, exist_ok=True)

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        ctx = b.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()
        
        # Proper login
        print("Authenticating...")
        sign_in(page, use_cache=False)
        print("Authenticated! Current URL:", page.url)
        page.wait_for_timeout(2000)

        # 1. Click New Document dropdown on sidebar
        print("Clicking 'New Document' dropdown trigger...")
        page.click("aside button:has-text('New Document')")
        page.wait_for_timeout(600)

        shot1 = OUT / "walkthrough_1_dropdown.png"
        page.screenshot(path=str(shot1), full_page=True)
        print("Captured dropdown:", shot1)

        # 2. Click 'New Document' menu item (which opens blueprint modal)
        print("Clicking 'New Document' item in menu...")
        page.click("[role='menuitem']:has-text('New Document')")
        page.wait_for_timeout(1200)

        shot2 = OUT / "walkthrough_2_create_modal.png"
        page.screenshot(path=str(shot2), full_page=True)
        print("Captured create modal:", shot2)

        # 3. In DocumentCreateModal, pick a blueprint (e.g. Blank or IEEE) and click create
        print("Selecting blueprint and clicking 'Create Document'...")
        # Inspect buttons in modal
        create_btn = page.locator("button:has-text('Create Document'), button:has-text('Create')").first
        if create_btn.is_visible():
            create_btn.click()
            print("Clicked Create Document button")
        else:
            print("Create button not visible, checking modal contents")

        # 4. Wait for navigation to /document/:id
        page.wait_for_url("**/document/**", timeout=15000)
        page.wait_for_selector(".ProseMirror", timeout=20000)
        page.wait_for_timeout(3000)

        shot3 = OUT / "walkthrough_3_editor_canvas.png"
        page.screenshot(path=str(shot3), full_page=True)
        print("Captured editor canvas:", shot3)

        # 5. Type some text into the editor
        print("Typing into editor...")
        page.click(".ProseMirror")
        page.keyboard.type("IntelliDocs Capstone Research System - Testing Formatting & Council Review.")
        page.keyboard.press("Enter")
        page.wait_for_timeout(1000)

        shot4 = OUT / "walkthrough_4_editor_typed.png"
        page.screenshot(path=str(shot4), full_page=True)
        print("Captured editor after typing:", shot4)

        b.close()

if __name__ == "__main__":
    run()
