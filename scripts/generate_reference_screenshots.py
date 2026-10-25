"""
IntelliDocs — Automated Baseline Reference Screenshot Generator
Renders ground-truth PDF pages into crisp high-res PNG screenshots for visual regression testing.
"""

import os
import re
from pathlib import Path
import fitz  # PyMuPDF

DOCS_DIR = Path("tests/fixtures/import_baselines/documents")
OUTPUT_BASE = Path("tests/fixtures/import_baselines/reference_screenshots")


def sanitize_folder_name(name: str) -> str:
    cleaned = re.sub(r"[^\w\-.]", "_", name)
    return cleaned.strip("_")


def main():
    OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
    pdf_files = sorted(list(DOCS_DIR.glob("*.pdf")))

    print(f"Found {len(pdf_files)} PDF baseline documents to process.\n")
    print(f"{'Document Name':<45} | {'Pages':<6} | {'Status'}")
    print("-" * 70)

    total_pages_rendered = 0

    for pdf_path in pdf_files:
        stem = pdf_path.stem
        subfolder = OUTPUT_BASE / sanitize_folder_name(stem)
        subfolder.mkdir(parents=True, exist_ok=True)

        try:
            doc = fitz.open(str(pdf_path))
            num_pages = len(doc)
            # Render at 150 DPI (zoom 150/72 = ~2.083x) for crisp layout & text readability
            zoom = 150 / 72.0
            matrix = fitz.Matrix(zoom, zoom)

            for page_idx in range(num_pages):
                page = doc[page_idx]
                pix = page.get_pixmap(matrix=matrix, alpha=False)
                out_path = subfolder / f"page_{page_idx + 1:03d}.png"
                pix.save(str(out_path))
                total_pages_rendered += 1

            doc.close()
            print(f"{stem[:43]:<45} | {num_pages:<6} | OK -> {subfolder.name}/")
        except Exception as e:
            print(f"{stem[:43]:<45} | ERROR  | {e}")

    print("-" * 70)
    print(f"\nAll done! Successfully rendered {total_pages_rendered} total reference pages.")
    print(f"Screenshots saved under: {OUTPUT_BASE.resolve()}")


if __name__ == "__main__":
    main()
