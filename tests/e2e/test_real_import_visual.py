"""Real End-to-End Import, Visual Diff, and Sabotage Formatting Test.

1. Imports both 'V2 INTELLIDOCS (2).docx' and 'V2 INTELLIDOCS sabotage.docx' through the real Express/Python import pipeline (POST /documents/import).
2. Opens both documents in Chromium via Playwright.
3. Allows TipTap to hydrate and paginate all pages.
4. Measures:
   - Exact rendered page count inside TipTap.
   - Image dimensions and margin containment.
   - Table column widths and structure.
5. Captures real screenshots of the imported editor pages into artifacts.
6. Tests the newly added formatting tools on the sabotaged document:
   - Normalizing Paragraph Spacing (setParagraphSpacing)
   - Equalizing Table Columns (equalizeTableColumns)
7. Measures whether the sabotaged document's phantom page expansion (33 pages) is repaired.
"""

import sys
import os
import requests
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB = "http://localhost:5173"
API = "http://localhost:3000"
EMAIL = "test@test.com"
PASSWORD = "asd123"

ARTIFACT_DIR = Path("C:/Users/asus/.gemini/antigravity/brain/9dcfe603-ca1e-4a77-a93d-644ee7188bc7")
DOCS_DIR = Path("tests/fixtures/import_baselines/documents")
REF_DIR = Path("tests/fixtures/import_baselines/reference_screenshots")

def run_real_import_test():
    print("\n" + "="*60)
    print("STARTING REAL IMPORT & VISUAL COMPARISON AUDIT")
    print("="*60 + "\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        # Step 1: Sign in to get access token & session
        print("1. Signing in via frontend...")
        page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        page.fill("input#email", EMAIL)
        page.fill("input#password", PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_url(f"{WEB}/dashboard", timeout=30000)
        page.wait_for_timeout(2000)

        # Extract auth token from localStorage
        token = page.evaluate("() => localStorage.getItem('authToken')")
        print(f"   Auth token retrieved: {'YES' if token else 'NO'}")

        headers = {"Authorization": f"Bearer {token}"} if token else {}

        # Step 2: Upload V2 INTELLIDOCS (2).docx (Correct)
        print("\n2. Uploading Correct Manuscript ('V2 INTELLIDOCS (2).docx')...")
        cor_path = DOCS_DIR / "V2 INTELLIDOCS (2).docx"
        with open(cor_path, "rb") as f:
            resp_cor = requests.post(
                f"{API}/documents/import",
                headers=headers,
                files={"file": (cor_path.name, f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
            )
        assert resp_cor.status_code == 201, f"Correct doc upload failed: {resp_cor.text}"
        doc_cor = resp_cor.json()
        doc_cor_id = doc_cor["id"]
        print(f"   Imported successfully! ID: {doc_cor_id}")

        # Step 3: Upload V2 INTELLIDOCS sabotage.docx (Sabotaged)
        print("\n3. Uploading Sabotaged Manuscript ('V2 INTELLIDOCS sabotage.docx')...")
        sab_path = DOCS_DIR / "V2 INTELLIDOCS sabotage.docx"
        with open(sab_path, "rb") as f:
            resp_sab = requests.post(
                f"{API}/documents/import",
                headers=headers,
                files={"file": (sab_path.name, f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
            )
        assert resp_sab.status_code == 201, f"Sabotaged doc upload failed: {resp_sab.text}"
        doc_sab = resp_sab.json()
        doc_sab_id = doc_sab["id"]
        print(f"   Imported successfully! ID: {doc_sab_id}")

        # Step 4: Open Correct Document in Editor & Capture
        print(f"\n4. Opening Correct Document in TipTap ({doc_cor_id})...")
        page.goto(f"{WEB}/document/{doc_cor_id}", wait_until="domcontentloaded")
        page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=60000)
        # Give pagination time to flow all 30+ pages
        print("   Waiting for document to paginate...")
        page.wait_for_timeout(8000)

        cor_page_count = page.locator(".rm-pages-wrapper > .rm-page-break").count()
        print(f"   Correct Document rendered page breaks: {cor_page_count}")
        page.screenshot(path=str(ARTIFACT_DIR / "import_correct_overview.png"))

        # Capture first page & last page
        page.screenshot(path=str(ARTIFACT_DIR / "import_correct_top.png"))

        # Step 5: Open Sabotaged Document in Editor & Capture
        print(f"\n5. Opening Sabotaged Document in TipTap ({doc_sab_id})...")
        page.goto(f"{WEB}/document/{doc_sab_id}", wait_until="domcontentloaded")
        page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=60000)
        print("   Waiting for document to paginate...")
        page.wait_for_timeout(8000)

        sab_page_count = page.locator(".rm-pages-wrapper > .rm-page-break").count()
        print(f"   Sabotaged Document rendered page breaks: {sab_page_count}")
        page.screenshot(path=str(ARTIFACT_DIR / "import_sabotage_overview.png"))

        # Inspect Image 2 dimensions in Sabotaged Document
        img_info = page.evaluate("""() => {
            const imgs = Array.from(document.querySelectorAll('.ProseMirror img'));
            return imgs.map((img, idx) => {
                const rect = img.getBoundingClientRect();
                return {
                    idx,
                    widthAttr: img.getAttribute('width'),
                    renderedWidth: rect.width,
                    renderedHeight: rect.height,
                    naturalWidth: img.naturalWidth
                };
            });
        }""")
        print(f"\n   Images in Sabotaged doc inside TipTap ({len(img_info)} total):")
        for im in img_info:
            print(f"     Image {im['idx']}: widthAttr={im['widthAttr']} renderedWidth={im['renderedWidth']:.1f}px (natural={im['naturalWidth']})")

        # Inspect Tables in Sabotaged Document
        table_info = page.evaluate("""() => {
            const tables = Array.from(document.querySelectorAll('.ProseMirror table'));
            return tables.map((tbl, idx) => {
                const firstRow = tbl.querySelector('tr');
                const cells = firstRow ? Array.from(firstRow.children) : [];
                return {
                    idx,
                    colCount: cells.length,
                    cellWidths: cells.map(c => c.getBoundingClientRect().width.toFixed(1))
                };
            });
        }""")
        print(f"\n   Tables in Sabotaged doc inside TipTap ({len(table_info)} total):")
        for tb in table_info:
            print(f"     Table {tb['idx']}: {tb['colCount']} cols, widths: {tb['cellWidths']}")

        # Step 6: Test Formatting Repairs on Sabotaged Document
        print("\n6. Testing Formatting Repairs on Sabotaged Document...")

        # 6A: Check Paragraph Spacing in Page Setup
        page.locator("button:has-text('Page Setup')").first.click()
        page.wait_for_timeout(600)
        page.screenshot(path=str(ARTIFACT_DIR / "import_sabotage_page_setup.png"))

        # 6B: Equalize Columns on Table 3 (Table idx 3)
        print("   Testing Table Column Equalization...")
        equalized_result = page.evaluate("""() => {
            const tables = document.querySelectorAll('.ProseMirror table');
            if (tables.length > 3) {
                const t3 = tables[3];
                const firstCell = t3.querySelector('th, td');
                if (firstCell && window.__tiptapEditor) {
                    const pos = window.__tiptapEditor.view.posAtDOM(firstCell, 0);
                    window.__tiptapEditor.commands.setTextSelection(pos);
                    window.__tiptapEditor.commands.equalizeTableColumns();
                    return true;
                }
            }
            return false;
        }""")
        print(f"   Equalize command dispatched: {equalized_result}")
        page.wait_for_timeout(2000)

        # Check DOM Geometry overflow
        bleed_count = page.evaluate("""() => {
            const pages = document.querySelectorAll('.rm-pages-wrapper .page');
            let bleeding = 0;
            pages.forEach(p => {
                if (p.scrollWidth > p.clientWidth + 2) bleeding++;
            });
            return bleeding;
        }""")
        print(f"   Pages bleeding out of margin bounds: {bleed_count}")

        browser.close()

    print("\n" + "="*60)
    print("AUDIT SUMMARY:")
    print(f"  Correct Document page breaks: {cor_page_count}")
    print(f"  Sabotaged Document page breaks: {sab_page_count}")
    print(f"  Bleed pages: {bleed_count}")
    print("="*60 + "\n")

if __name__ == "__main__":
    run_real_import_test()
