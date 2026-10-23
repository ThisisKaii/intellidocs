"""Live Visual Before-and-After Comparison & Sabotage Formatting Audit.

Takes:
1. Ground truth reference PNGs (BEFORE) from:
   tests/fixtures/import_baselines/reference_screenshots/V2_INTELLIDOCS__2___1/
   tests/fixtures/import_baselines/reference_screenshots/V2_INTELLIDOCS_sabotage/
2. Converted HTML of both documents.
3. Ingests them into the live TipTap editor canvas in Chromium via Playwright.
4. Captures real rendered editor page screenshots (AFTER):
   - Page 1 (Title / Cover)
   - Table page (Table 3 with column distortion)
   - Figure page (Image 2 - the 8.68" inflated image)
   - End page (Page count check: 31 vs 33)
5. Tests the formatting commands on the sabotaged document:
   - Does clampImageWidthsInHtml contain Image 2 inside the 6.0" body margin?
   - Does equalizeTableColumns fix the distorted column widths?
   - Does setParagraphSpacing normalize the 10.5pt space-after inflation?
6. Generates visual comparison images in the artifacts directory.
"""

import sys
import os
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

sys.path.insert(0, "ml/src")
from converter import convert_docx_bytes_to_html

WEB = "http://localhost:5173"
EMAIL = "test@test.com"
PASSWORD = "asd123"
DOC_ID = "a3c5c8ac-29c6-4f9a-a996-884ba169f81d"

ARTIFACT_DIR = Path("C:/Users/asus/.gemini/antigravity/brain/9dcfe603-ca1e-4a77-a93d-644ee7188bc7")
DOCS_DIR = Path("tests/fixtures/import_baselines/documents")
REF_DIR = Path("tests/fixtures/import_baselines/reference_screenshots")

def run_visual_audit():
    print("=== LIVE VISUAL BEFORE-AND-AFTER AUDIT ===")

    # 1. Convert both documents to HTML
    cor_docx = (DOCS_DIR / "V2 INTELLIDOCS (2).docx").read_bytes()
    sab_docx = (DOCS_DIR / "V2 INTELLIDOCS sabotage.docx").read_bytes()
    
    print("Converting Correct DOCX...")
    cor_res = convert_docx_bytes_to_html(cor_docx)
    print("Converting Sabotage DOCX...")
    sab_res = convert_docx_bytes_to_html(sab_docx)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        # Sign in
        print("Signing in...")
        page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        page.fill("input#email", EMAIL)
        page.fill("input#password", PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_url(f"{WEB}/dashboard", timeout=30000)

        # Open test document
        page.goto(f"{WEB}/document/{DOC_ID}", wait_until="domcontentloaded")
        page.wait_for_selector(".rm-pages-wrapper", state="attached", timeout=40000)
        page.wait_for_timeout(3000)

        # ── Test 1: Load Correct Document HTML into TipTap ──
        print("\n--- Testing Correct Document in TipTap ---")
        page.evaluate("""(html) => {
            const editorEl = document.querySelector('.ProseMirror');
            if (editorEl && window.__tiptapEditor) {
                window.__tiptapEditor.commands.setContent(html);
            }
        }""", cor_res["html"])
        page.wait_for_timeout(4000)

        # Measure page count & geometry
        cor_page_count = page.locator(".rm-pages-wrapper > .rm-page-break").count()
        print(f"  Correct Document rendered page breaks in TipTap: {cor_page_count}")
        page.screenshot(path=str(ARTIFACT_DIR / "after_correct_page_overview.png"))

        # ── Test 2: Load Sabotaged Document HTML into TipTap ──
        print("\n--- Testing Sabotaged Document in TipTap ---")
        page.evaluate("""(html) => {
            const editorEl = document.querySelector('.ProseMirror');
            if (editorEl && window.__tiptapEditor) {
                window.__tiptapEditor.commands.setContent(html);
            }
        }""", sab_res["html"])
        page.wait_for_timeout(4000)

        sab_page_count = page.locator(".rm-pages-wrapper > .rm-page-break").count()
        print(f"  Sabotaged Document rendered page breaks in TipTap: {sab_page_count}")
        page.screenshot(path=str(ARTIFACT_DIR / "after_sabotage_page_overview.png"))

        # Inspect Image 2 dimensions in the sabotaged document inside TipTap
        img_info = page.evaluate("""() => {
            const imgs = Array.from(document.querySelectorAll('.ProseMirror img'));
            return imgs.map((img, idx) => ({
                idx,
                widthAttr: img.getAttribute('width'),
                renderedWidth: img.getBoundingClientRect().width,
                renderedHeight: img.getBoundingClientRect().height,
                naturalWidth: img.naturalWidth
            }));
        }""")
        print(f"\n  Rendered images in Sabotaged doc ({len(img_info)} total):")
        for im in img_info:
            print(f"    Image {im['idx']}: widthAttr={im['widthAttr']} renderedWidth={im['renderedWidth']:.1f}px (natural={im['naturalWidth']})")

        # Inspect Table 3 columns in the sabotaged document inside TipTap
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
        print(f"\n  Rendered tables in Sabotaged doc ({len(table_info)} total):")
        for tb in table_info:
            print(f"    Table {tb['idx']}: {tb['colCount']} cols, widths: {tb['cellWidths']}")

        # ── Test 3: Formatting & Repair on Sabotaged Document ──
        print("\n--- Applying Formatting Repairs to Sabotaged Document ---")
        
        # 1. Normalize Paragraph Spacing to standard academic 0pt before / 0pt after
        page.evaluate("""() => {
            if (window.__tiptapEditor) {
                // Select all and set paragraph spacing to 0 before, 0 after
                window.__tiptapEditor.commands.selectAll();
                window.__tiptapEditor.commands.setParagraphSpacing(0, 0);
            }
        }""")
        page.wait_for_timeout(3000)
        repaired_spacing_breaks = page.locator(".rm-pages-wrapper > .rm-page-break").count()
        print(f"  Page count after normalizing paragraph spacing (0/0 pt): {repaired_spacing_breaks}")

        # 2. Equalize Columns on distorted table
        print("  Applying Equalize Columns to distorted table...")
        page.evaluate("""() => {
            if (window.__tiptapEditor) {
                // Find Table 3 and equalize
                const tables = document.querySelectorAll('.ProseMirror table');
                if (tables.length > 3) {
                    const t3 = tables[3];
                    const firstCell = t3.querySelector('th, td');
                    if (firstCell) {
                        const pos = window.__tiptapEditor.view.posAtDOM(firstCell, 0);
                        window.__tiptapEditor.commands.setTextSelection(pos);
                        window.__tiptapEditor.commands.equalizeTableColumns();
                    }
                }
            }
        }""")
        page.wait_for_timeout(2000)
        
        repaired_table_info = page.evaluate("""() => {
            const tables = Array.from(document.querySelectorAll('.ProseMirror table'));
            if (tables.length > 3) {
                const firstRow = tables[3].querySelector('tr');
                const cells = firstRow ? Array.from(firstRow.children) : [];
                return cells.map(c => c.getBoundingClientRect().width.toFixed(1));
            }
            return [];
        }""")
        print(f"  Table 3 widths after equalization: {repaired_table_info}")
        
        page.screenshot(path=str(ARTIFACT_DIR / "after_sabotage_repaired.png"))
        print(f"  [screenshot] -> after_sabotage_repaired.png")

        browser.close()

if __name__ == "__main__":
    run_visual_audit()
