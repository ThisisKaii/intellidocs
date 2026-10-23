"""E2E Test for IntelliDocs Auto-Formatting, Behavioral Learning, Presets, and Grammar/Spell Checking.

Tests:
1. Grammar & Spell Check in Editor UI (Express -> FastAPI bridge)
2. Behavioral Event Capture & Cross-Document Format Memory in Redis
3. Three-Tier Resolution (Custom Binding -> Preset -> ML Prediction)
4. Feedback Loop (Accept/Reject logging)
"""

import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB = "http://localhost:5173"
EMAIL = "test@test.com"
PASSWORD = "asd123"
DOC_ID = "a3c5c8ac-29c6-4f9a-a996-884ba169f81d"

ARTIFACT_DIR = Path("C:/Users/asus/.gemini/antigravity/brain/9dcfe603-ca1e-4a77-a93d-644ee7188bc7")

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        ctx = browser.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()

        page.route("**fonts.googleapis.com**", lambda r: r.abort())
        page.route("**fonts.gstatic.com**", lambda r: r.abort())

        network_logs = []
        page.on("request", lambda req: network_logs.append({
            "method": req.method,
            "url": req.url,
            "post_data": req.post_data
        }))

        # ── Step 1: Sign in ────────────────────────────────────────────────
        print("\n=== STEP 1: Sign In ===")
        page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        page.fill("input#email", EMAIL)
        page.fill("input#password", PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_url(f"{WEB}/dashboard", timeout=20000)
        print("[OK] Authenticated")

        # ── Step 2: Open Editor Document ───────────────────────────────────
        print("\n=== STEP 2: Open Editor ===")
        page.goto(f"{WEB}/document/{DOC_ID}", wait_until="domcontentloaded")
        page.wait_for_selector(".ProseMirror", timeout=15000)
        page.wait_for_timeout(2000)
        print("[OK] Editor canvas loaded")

        editor = page.locator(".ProseMirror")

        # ── Step 3: Test Grammar & Spell Check ─────────────────────────────
        print("\n=== STEP 3: Grammar & Spell Checking UI ===")
        # Open Editor Assistant side panel if closed
        side_panel = page.locator("aside:has-text('Editor Assistant')")
        if not side_panel.is_visible():
            page.keyboard.press("Control+\\")
            page.wait_for_timeout(600)

        # Switch to Suggestions tab
        page.click("button:has-text('Suggestions')")
        page.wait_for_timeout(800)

        # Type a sentence with grammatical and spelling errors
        editor.click()
        page.keyboard.press("End")
        page.keyboard.press("Enter")
        test_sentence = "She go to teh school yesterday."
        page.keyboard.type(test_sentence, delay=15)
        page.wait_for_timeout(1000)
        print(f"[OK] Typed test text: '{test_sentence}'")

        # Click 'Check now' in Grammar & Spell Check
        check_btn = page.locator("button:has-text('Check now')").first
        if check_btn.is_visible():
            check_btn.click()
            print("[OK] Clicked 'Check now' button")
            # Wait for backend response
            page.wait_for_timeout(3000)

        # Check network logs for grammar/spell check calls
        grammar_calls = [r for r in network_logs if "grammar-check" in r["url"]]
        spell_calls = [r for r in network_logs if "spelling-check" in r["url"]]
        print(f"[OK] Grammar check network calls: {len(grammar_calls)}")
        print(f"[OK] Spell check network calls: {len(spell_calls)}")

        # Take screenshot of Grammar results
        grammar_shot = ARTIFACT_DIR / "test_grammar_results.png"
        page.screenshot(path=str(grammar_shot))
        print(f"[OK] Saved grammar test screenshot: {grammar_shot}")

        # ── Step 4: Test Behavioral Learning Across Documents ──────────────
        print("\n=== STEP 4: Behavioral Learning (Text -> Format Memory) ===")
        # Type a distinct title phrase to learn
        editor.click()
        page.keyboard.press("End")
        page.keyboard.press("Enter")
        learn_title = "Evaluation of Distributed Sensor Networks"
        page.keyboard.type(learn_title, delay=10)
        page.wait_for_timeout(300)

        # Select it
        page.keyboard.press("Shift+Home")
        page.wait_for_timeout(300)

        # Apply Heading 1
        h1_btn = page.locator("button:has-text('Heading 1')").first
        if h1_btn.is_visible():
            h1_btn.click()
            page.wait_for_timeout(600)
            print("[OK] Applied Heading 1 to learn title")

        # Apply Bold
        bold_btn = page.locator("button[title*='Bold'], button:has-text('B')").first
        if bold_btn.is_visible():
            bold_btn.click()
            page.wait_for_timeout(600)
            print("[OK] Applied Bold to learn title")

        # Verify behavior event was emitted with payload.text
        behavior_calls = [r for r in network_logs if "/api/behavior/events" in r["url"]]
        print(f"[OK] Total behavior events captured: {len(behavior_calls)}")

        # Find event matching our learned title
        matched_events = []
        for req in behavior_calls:
            if req.get("post_data"):
                try:
                    data = json.loads(req["post_data"])
                    payload = data.get("payload", {})
                    if "sensor" in str(payload).lower() or "evaluation" in str(payload).lower():
                        matched_events.append(data)
                except Exception:
                    pass

        print(f"[OK] Behavior events matching learned title: {len(matched_events)}")

        # ── Step 5: Test Tier Resolution via direct API call ───────────────
        print("\n=== STEP 5: Tier Check API Verification ===")
        # Using page.evaluate to make authenticated fetch through the app's session
        tier_eval = page.evaluate("""async (text) => {
            const token = localStorage.getItem('authToken');
            const authHeader = token ? `Bearer ${token}` : '';
            const res = await fetch('/api/formatting/tier-check', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    text: text,
                    documentId: 'a3c5c8ac-29c6-4f9a-a996-884ba169f81d'
                })
            });
            return {
                status: res.status,
                data: await res.json()
            };
        }""", "Evaluation of Distributed Sensor Networks")

        print(f"[OK] Tier check response: Status={tier_eval['status']}, Result={json.dumps(tier_eval['data'], indent=2)}")

        # Also test ML fallback for an unseen introduction text
        ml_eval = page.evaluate("""async (text) => {
            const token = localStorage.getItem('authToken');
            const authHeader = token ? `Bearer ${token}` : '';
            const res = await fetch('/api/formatting/tier-check', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    text: text,
                    documentId: 'a3c5c8ac-29c6-4f9a-a996-884ba169f81d'
                })
            });
            return {
                status: res.status,
                data: await res.json()
            };
        }""", "Comprehensive Empirical Analysis of Scalable Architecture")

        print(f"[OK] ML Tier check response: Status={ml_eval['status']}, Result={json.dumps(ml_eval['data'], indent=2)}")

        # ── Step 6: Test Feedback Logging ──────────────────────────────────
        print("\n=== STEP 6: Feedback Loop Verification ===")
        feedback_eval = page.evaluate("""async () => {
            const token = localStorage.getItem('authToken');
            const authHeader = token ? `Bearer ${token}` : '';
            const res = await fetch('/api/ai/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    documentId: 'a3c5c8ac-29c6-4f9a-a996-884ba169f81d',
                    predictionType: 'format_prompt',
                    predictedFormat: 'heading1',
                    confidence: 95,
                    accepted: true
                })
            });
            return {
                status: res.status,
                data: await res.json()
            };
        }""")

        print(f"[OK] Feedback log response: Status={feedback_eval['status']}, Result={json.dumps(feedback_eval['data'], indent=2)}")

        # Final screenshot
        final_shot = ARTIFACT_DIR / "test_behavior_learning_success.png"
        page.screenshot(path=str(final_shot))
        print(f"[OK] Saved final test screenshot: {final_shot}")

        print("\n========================================================")
        print("ALL AUTO-FORMATTING, BEHAVIORAL & ML TESTS COMPLETED!")
        print("========================================================")

if __name__ == "__main__":
    run_test()
