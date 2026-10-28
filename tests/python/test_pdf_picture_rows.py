"""Tests that pictures drawn side by side in a PDF import as one row, and stacked ones stay separate."""
import os
import re
import sys

import cv2
import numpy as np
import pymupdf

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))

from converter import convert_pdf_bytes_to_html  # noqa: E402


def picture(width: int, height: int, shade: int) -> bytes:
    """A solid PNG."""
    ok, encoded = cv2.imencode(".png", np.full((height, width, 3), shade, dtype=np.uint8))
    assert ok
    return encoded.tobytes()


def pdf_with(rects: list[tuple[float, float, float, float]]) -> bytes:
    """A one-page PDF with a line of text and one picture per rectangle (points)."""
    document = pymupdf.open()
    page = document.new_page(width=612, height=792)
    page.insert_text((72, 90), "Figures follow below.", fontsize=12)
    for number, rect in enumerate(rects):
        page.insert_image(pymupdf.Rect(*rect), stream=picture(300, 200, 120 + number * 50))
    return document.tobytes()


def image_widths(html: str) -> list[int]:
    """CSS width of every <img>, in order."""
    return [int(width) for width in re.findall(r'<img[^>]*?width="(\d+)"', html)]


def test_pictures_side_by_side_in_the_pdf_become_one_row() -> None:
    html = convert_pdf_bytes_to_html(pdf_with([(100, 200, 280, 320), (320, 205, 500, 325)]))["html"]
    widths = image_widths(html)
    assert len(widths) == 1, widths
    assert abs(widths[0] - round((500 - 100) * 96 / 72)) <= 4  # spans both pictures


def test_pictures_stacked_in_the_pdf_stay_separate() -> None:
    html = convert_pdf_bytes_to_html(pdf_with([(100, 200, 280, 320), (100, 400, 280, 520)]))["html"]
    assert len(image_widths(html)) == 2


def test_a_single_picture_is_unchanged() -> None:
    html = convert_pdf_bytes_to_html(pdf_with([(100, 200, 280, 320)]))["html"]
    assert len(image_widths(html)) == 1
