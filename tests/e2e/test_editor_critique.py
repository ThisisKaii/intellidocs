"""Visual critique script for the Document Editor view.
Creates/opens a real document and captures screenshots of:
- Full editor canvas & toolbar
- Format dropdowns & popovers
- Right sidebar panels (Grammar, Formatting, Suggestions)
- AI Chatbot modal / popover
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path("tests/e2e")))
from harness import sign_in, Api, open_document, API, WEB

OUT = Path("tests/e2e/artifacts/inspection")
OUT.mkdir(parents=True, exist_ok=True)

def run():
    api = Api()
    api.login()

    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        ctx = b.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()

        console_errors = []
        page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))
        page.on("console", lambda m: console_errors.append(f"[{m.type}] {m.text}") if m.type == "error" else None)

        print("Logging in...")
        sign_in(page)

        # Create a document via API to guarantee immediate readiness
        print("Creating scratch document...")
        doc_id = open_document(page, api, content="""
            <h1>IntelliDocs Academic Research Platform</h1>
            <p>This is a formal academic evaluation document. We are testing typography, line spacing, margins, and inline citation styling across multiple pages.</p>
            <h2>Literature Review & Methodology</h2>
            <p>Recent studies in intelligent formatting demonstrate that hybrid rule-based and neural models significantly reduce cognitive load during manuscript preparation (Smith et al., 2024).</p>
            <p>Below is a second paragraph to evaluate the paragraph separation, text alignment, and typography hierarchy.</p>
        """)

        print(f"Document opened: {WEB}/document/{doc_id}")
        page.wait_for_timeout(3000)

        # 1. Full Editor Canvas Screenshot
        shot1 = OUT / "editor_1_full_canvas.png"
        page.screenshot(path=str(shot1), full_page=True)
        print("Captured full editor canvas:", shot1)

        # 2. Focus on Toolbar
        toolbar = page.locator(".sticky, header, [role='toolbar'], div:has(button[title='Bold'])").first
        if toolbar.is_visible():
            shot2 = OUT / "editor_2_toolbar.png"
            toolbar.screenshot(path=str(shot2))
            print("Captured toolbar:", shot2)

        # 3. Test clicking Formatting Panel / Preset selector
        print("Opening Formatting / Presets menu...")
        preset_btn = page.locator("button:has-text('Preset'), button:has-text('APA'), button:has-text('Format')").first
        if preset_btn.is_visible():
            preset_btn.click()
            page.wait_for_timeout(800)
            shot3 = OUT / "editor_3_preset_panel.png"
            page.screenshot(path=str(shot3), full_page=True)
            print("Captured preset panel:", shot3)

        # 4. Check for Grammar Panel / Button
        grammar_btn = page.locator("button:has-text('Grammar'), button[title*='Grammar'], button:has-text('Proofread')").first
        if grammar_btn.is_visible():
            grammar_btn.click()
            page.wait_for_timeout(1000)
            shot4 = OUT / "editor_4_grammar_panel.png"
            page.screenshot(path=str(shot4), full_page=True)
            print("Captured grammar panel:", shot4)

        # 5. Check for AIChatbot / Council button
        ai_btn = page.locator("button[aria-label*='AI'], button:has-text('AI'), button[title*='Chat'], button:has-text('Council')").first
        if ai_btn.is_visible():
            ai_btn.click()
            page.wait_for_timeout(1000)
            shot5 = OUT / "editor_5_ai_chatbot.png"
            page.screenshot(path=str(shot5), full_page=True)
            print("Captured AI chatbot:", shot5)

        print("\nConsole errors encountered:", len(console_errors))
        for err in console_errors:
            print("  -", err)

        b.close()

if __name__ == "__main__":
    run()
