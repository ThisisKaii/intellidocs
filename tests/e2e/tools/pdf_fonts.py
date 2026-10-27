"""List the fonts and sizes a PDF really uses for lines containing some text.

usage: ml/venv/Scripts/python tests/e2e/tools/pdf_fonts.py <pdf> <text> [--pages 1-9]
Use the PDF Word exported (word_truth.ps1) to see which font Word actually drew.
"""
import argparse

import fitz  # PyMuPDF

ap = argparse.ArgumentParser()
ap.add_argument("pdf")
ap.add_argument("text")
ap.add_argument("--pages", default="")
a = ap.parse_args()

with fitz.open(a.pdf) as pdf:
    for number, page in enumerate(pdf, start=1):
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                text = "".join(span["text"] for span in line["spans"])
                if a.text.lower() in text.lower():
                    for span in line["spans"]:
                        print(f"p{number} y={line['bbox'][1]:.1f}-{line['bbox'][3]:.1f} "
                              f"font={span['font']} size={span['size']:.1f} {span['text'][:40]!r}")
