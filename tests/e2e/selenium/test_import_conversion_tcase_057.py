"""TCASE-057 | Module 8: Import & Conversion | Unit: Import Conversion | Non-Error (Image Downsampling)

A user imports a .docx holding a 4,000 × 2,500 px photograph stored as an uncompressed-size PNG.

Expected (as the app behaves): the converter shrinks every raster picture to at most 1,000 px
wide (height in proportion; about 150 dpi across a 6.3 in text column) and stores the smallest
of PNG / JPEG (quality 85) / WebP; the picture in the editor is ≤ 1,000 px wide and its stored
file is less than half the original's size, while it is still displayed at the size the .docx
gives it.
"""

import io

import numpy as np
import pymupdf
import pytest
from docx import Document
from docx.shared import Inches
from selenium.webdriver.common.by import By

from selenium_helpers import FIGURES, STUDENT, import_through_dashboard, show_evidence, sign_in, visible

WIDTH, HEIGHT = 4000, 2500
MAX_WIDTH = 1000

PICTURE = """const img = [...document.querySelectorAll('.ProseMirror img')].find(i => !i.classList.contains('ProseMirror-separator'));
const done = arguments[arguments.length - 1];
if (!img) { done(null); return }
const finish = () => fetch(img.currentSrc || img.src).then(r => r.blob()).then(b => done({naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, bytes: b.size, type: b.type, shownWidth: Math.round(img.getBoundingClientRect().width)})).catch(e => done({error: String(e)}));
if (img.complete && img.naturalWidth) finish(); else img.addEventListener('load', finish, {once: true});"""


def photo_png() -> bytes:
    """A photo-like picture (smooth gradients with fine grain), saved as PNG."""
    y, x = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
    rgb = np.stack([(x / WIDTH) * 255, (y / HEIGHT) * 255, ((x + y) / (WIDTH + HEIGHT)) * 200 + 30], axis=-1)
    rgb += np.random.default_rng(7).normal(0, 6, rgb.shape)
    samples = np.clip(rgb, 0, 255).astype(np.uint8).tobytes()
    return pymupdf.Pixmap(pymupdf.csRGB, WIDTH, HEIGHT, samples, 0).tobytes("png")


def test_import_conversion_tcase_057(driver, student_api, tmp_path):
    original = photo_png()
    document = Document()
    document.add_heading("Figures", level=1)
    document.add_paragraph("The site photograph is shown below.")
    document.add_picture(io.BytesIO(original), width=Inches(6))
    document.add_paragraph("Figure 1. Research site")
    source = tmp_path / "tcase057_large_picture.docx"
    document.save(source)

    sign_in(driver, STUDENT)
    doc_id, seconds = import_through_dashboard(driver, source)
    student_api.created_documents.append(doc_id)
    visible(driver, By.CSS_SELECTOR, ".ProseMirror img:not(.ProseMirror-separator)", timeout=60)
    driver.set_script_timeout(60)
    picture = driver.execute_async_script(PICTURE)
    assert picture and "error" not in picture, picture
    driver.execute_script("document.querySelector('.ProseMirror img:not(.ProseMirror-separator)').scrollIntoView({block: 'center'})")
    driver.save_screenshot(str(FIGURES / "test_import_conversion_tcase_057_editor.png"))

    saving = 1 - picture["bytes"] / len(original)
    show_evidence(driver, "TCASE-057 Picture downsampling on import", [
        ("Original picture", f"{WIDTH} × {HEIGHT} px PNG, {len(original) / 1e6:.1f} MB"),
        ("Picture in the editor", f"{picture['naturalWidth']} × {picture['naturalHeight']} px {picture['type']}, {picture['bytes'] / 1e3:.0f} KB"),
        ("Size reduction", f"{saving:.1%}"),
        ("Shown on the page at", f"{picture['shownWidth']} px wide"),
        ("Import time", f"{seconds:.0f} s"),
    ])
    assert picture["naturalWidth"] <= MAX_WIDTH, f"stored {picture['naturalWidth']} px wide"
    assert abs(picture["naturalWidth"] / picture["naturalHeight"] - WIDTH / HEIGHT) < 0.02, "the proportions changed"
    assert saving > 0.5, f"only {saving:.0%} smaller"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
