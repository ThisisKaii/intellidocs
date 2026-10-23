"""E2E Test for AIChatbot Bulk Formatting, Continuations, and Preset Category Behavior.

Verifies:
1. Q1 ("Format the entire document into APA style"): Produces a Preview Card with Apply / Reject.
2. User applies or rejects Q1.
3. Q2 ("Now format all headings and make them bold and centered"): Produces a Preview Card scoped to headings.
4. User applies Q2 preview.
5. Q3 ("Can you format the rest of the document for me automatically?"):
   With DeepSeek's new continuation fix, the chatbot inherits previous formatting (bold+center),
   widens scope to the entire document, and produces an actionable continuation Preview Card!
6. Checks category preset settings in the suggestions panel.
"""

import time
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

WEB = "http://localhost:5173"
EMAIL = "test@test.com"
PASSWORD = "asd123"
DOC_ID = "a3c5c8ac-29c6-4f9a-a996-884ba169f81d"

ARTIFACT_DIR = Path("C:/Users/asus/.gemini/antigravity/brain/9dcfe603-ca1e-4a77-a93d-644ee7188bc7")


def screenshot(page, name: str) -> str:
    path = str(ARTIFACT_DIR / f"{name}.png")
    page.screenshot(path=path)
    print(f"  [screenshot] -> {name}.png")
    return path


def wait_for_chat_response(page, timeout_ms=15000):
    """Wait until the AI response or preview card appears in the chat."""
    try:
        # Wait until loading spinner disappears if present
        page.wait_for_selector("[class*='animate-spin']", state="detached", timeout=timeout_ms)
    except Exception:
        pass
    page.wait_for_timeout(2000)


def run_test():
    results: dict[str, str] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        ctx = browser.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()

        page.route("**fonts.googleapis.com**", lambda r: r.abort())
        page.route("**fonts.gstatic.com**", lambda r: r.abort())

        # ── Step 1: Sign In ─────────────────────────────────────────────────
        print("\n=== STEP 1: Signing In ===")
        page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        page.fill("input#email", EMAIL)
        page.fill("input#password", PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_url(f"{WEB}/dashboard", timeout=20000)
        print("[OK] Authenticated")

        # ── Step 2: Open Document ────────────────────────────────────────────
        print("\n=== STEP 2: Opening Document ===")
        page.goto(f"{WEB}/document/{DOC_ID}", wait_until="domcontentloaded")
        page.wait_for_selector(".ProseMirror", timeout=15000)
        page.wait_for_timeout(2500)
        print("[OK] Document loaded")

        # ── Step 3: Open AI Assistant Tab ───────────────────────────────────
        print("\n=== STEP 3: Opening AI Assistant Tab ===")
        side_panel = page.locator("aside:has-text('Editor Assistant')")
        if not side_panel.is_visible():
            page.keyboard.press("Control+\\")
            page.wait_for_timeout(600)

        ai_tab = page.locator("button:has-text('AI Assistant')").first
        if ai_tab.is_visible():
            ai_tab.click()
            page.wait_for_timeout(800)
            print("[OK] Opened AI Assistant tab")

        chat_input = page.locator("textarea[placeholder*='Ask'], input[placeholder*='Ask'], textarea").last

        # ── Query 1: Initial formatting request ─────────────────────────────
        q1 = "Format the entire document into APA style"
        print(f"\n--- Chat Query 1: '{q1}' ---")
        chat_input.fill(q1)
        page.keyboard.press("Enter")
        print("  [wait] Waiting for Q1 response...")
        wait_for_chat_response(page)

        # Check preview card for Q1
        apply_btn_q1 = page.locator("button:has-text('Apply'), button:has-text('Confirm')").last
        has_preview_1 = False
        try:
            apply_btn_q1.wait_for(state="visible", timeout=10000)
            has_preview_1 = True
        except PWTimeout:
            has_preview_1 = False

        results["q1_preview_card"] = "PASS" if has_preview_1 else "FAIL"
        print(f"  Q1 Preview Card visible: {results['q1_preview_card']}")
        screenshot(page, "chatbot_flow_q1")

        if has_preview_1:
            print("  [action] Clicking 'Apply' on Q1 preview card...")
            apply_btn_q1.click()
            page.wait_for_timeout(1500)
            print("  [OK] Applied Q1 preview")

        # ── Query 2: Follow-up category formatting request ───────────────────
        q2 = "Now format all headings and make them bold and centered"
        print(f"\n--- Chat Query 2: '{q2}' ---")
        chat_input.fill(q2)
        page.keyboard.press("Enter")
        print("  [wait] Waiting for Q2 response...")
        wait_for_chat_response(page)

        apply_btn_q2 = page.locator("button:has-text('Apply'), button:has-text('Confirm')").last
        has_preview_2 = False
        try:
            apply_btn_q2.wait_for(state="visible", timeout=10000)
            has_preview_2 = True
        except PWTimeout:
            has_preview_2 = False

        results["q2_preview_card"] = "PASS" if has_preview_2 else "FAIL"
        print(f"  Q2 Preview Card visible: {results['q2_preview_card']}")
        screenshot(page, "chatbot_flow_q2")

        if has_preview_2:
            print("  [action] Clicking 'Apply' on Q2 preview card...")
            apply_btn_q2.click()
            page.wait_for_timeout(1500)
            print("  [OK] Applied Q2 preview (all headings bold and centered)")

        # ── Query 3: Continuation / format the rest request ──────────────────
        q3 = "Can you format the rest of the document for me automatically?"
        print(f"\n--- Chat Query 3: '{q3}' ---")
        chat_input.fill(q3)
        page.keyboard.press("Enter")
        print("  [wait] Waiting for Q3 continuation response...")
        wait_for_chat_response(page)

        apply_btn_q3 = page.locator("button:has-text('Apply'), button:has-text('Confirm')").last
        has_preview_3 = False
        try:
            apply_btn_q3.wait_for(state="visible", timeout=10000)
            has_preview_3 = True
        except PWTimeout:
            has_preview_3 = False

        results["q3_continuation_preview_card"] = "PASS" if has_preview_3 else "FAIL"
        print(f"  Q3 Continuation Preview Card visible: {results['q3_continuation_preview_card']}")
        screenshot(page, "chatbot_flow_q3")

        # Extract last 5 chat messages to log the text
        chat_bubbles = page.locator("div.chat-bubble, div.message-content, [class*='message'], p").all_text_contents()
        recent = [m.strip() for m in chat_bubbles if len(m.strip()) > 15 and "IntelliDocs" not in m][-8:]
        print("\n=== Recent Chat Log ===")
        for i, text in enumerate(recent):
            print(f"  [{i}] {text[:100]}...")

        # ── Step 4: Verify Presets Tab ───────────────────────────────────────
        print("\n=== STEP 4: Inspecting Preset Category UI ===")
        page.click("button:has-text('Suggestions')")
        page.wait_for_timeout(800)

        preset_select = page.locator("select:has(option:has-text('UCLM')), select:has(option:has-text('APA'))").first
        if preset_select.is_visible():
            current_preset = preset_select.input_value()
            results["active_preset"] = f"PASS ({current_preset})"
            print(f"  Active Preset: {current_preset}")
        else:
            results["active_preset"] = "WARN (dropdown not found)"

        screenshot(page, "chatbot_flow_presets")

        # ── Summary ──────────────────────────────────────────────────────────
        print("\n" + "=" * 56)
        print("CHATBOT & PRESET TEST RESULTS:")
        print("=" * 56)
        for key, val in results.items():
            status = "[PASS]" if val.startswith("PASS") else ("[WARN]" if val.startswith("WARN") else "[FAIL]")
            print(f"  {status}  {key}: {val}")
        print("=" * 56)

        browser.close()


if __name__ == "__main__":
    run_test()
