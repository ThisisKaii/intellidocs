"""Tests that pictures Word lays side by side (anchored to one paragraph) import as one row, not a stack."""
import io
import os
import re
import sys

import cv2
import docx
import numpy as np
from docx.oxml import parse_xml
from docx.shared import Inches

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))

from converter import convert_docx_bytes_to_html  # noqa: E402

WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
EMU_PER_INCH = 914400


def png(width: int, height: int) -> io.BytesIO:
    """A small solid PNG."""
    ok, encoded = cv2.imencode(".png", np.full((height, width, 3), 180, dtype=np.uint8))
    assert ok
    return io.BytesIO(encoded.tobytes())


def anchor(inline, x_in: float, y_in: float, wrap: str = "wrapTopAndBottom") -> None:
    """Turn a python-docx inline picture into a floating one at (x_in, y_in) from the page and paragraph."""
    ns = f'xmlns:wp="{WP}"'
    shell = parse_xml(
        f'<wp:anchor {ns} distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" '
        f'behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">'
        f'<wp:simplePos x="0" y="0"/>'
        f'<wp:positionH relativeFrom="page"><wp:posOffset>{int(x_in * EMU_PER_INCH)}</wp:posOffset></wp:positionH>'
        f'<wp:positionV relativeFrom="paragraph"><wp:posOffset>{int(y_in * EMU_PER_INCH)}</wp:posOffset></wp:positionV>'
        f'<wp:{wrap}/></wp:anchor>'
    )
    for child in list(inline):
        if child.tag.endswith("}extent"):
            shell.insert(3, child)  # after simplePos, positionH, positionV
        elif not child.tag.endswith("}effectExtent"):
            shell.append(child)
    inline.getparent().replace(inline, shell)


def build(pictures: list[tuple[float, float, float, float]], wrap: str = "wrapTopAndBottom") -> str:
    """Convert a DOCX whose one paragraph holds anchored pictures given as (x_in, y_in, w_in, h_in)."""
    document = docx.Document()
    for section in document.sections:  # a known 624px text column on an 816px page
        section.left_margin = section.right_margin = section.top_margin = section.bottom_margin = Inches(1)
    paragraph = document.add_paragraph()
    for x, y, w, h in pictures:
        run = paragraph.add_run()
        run.add_picture(png(int(w * 100), int(h * 100)), width=Inches(w), height=Inches(h))
    for inline, (x, y, _w, _h) in zip(list(paragraph._p.iter(f"{{{WP}}}inline")), pictures):
        anchor(inline, x, y, wrap)
    document.add_paragraph("after")
    buffer = io.BytesIO()
    document.save(buffer)
    return convert_docx_bytes_to_html(buffer.getvalue())["html"]


def image_widths(html: str) -> list[int]:
    """The CSS width of every <img>, in order."""
    return [int(width) for width in re.findall(r'<img[^>]*?width="(\d+)"', html)]


def test_two_pictures_side_by_side_become_one_row_picture() -> None:
    # 2.5in and 2.4in wide, 0.2in apart, one band: Word draws them on one line.
    html = build([(1.4, 0.2, 2.5, 3.0), (4.4, 0.25, 2.4, 3.0)])
    widths = image_widths(html)
    assert len(widths) == 1, widths
    assert abs(widths[0] - round((4.4 + 2.4 - 1.4) * 96)) <= 2  # spans both pictures


def test_pictures_on_different_lines_stay_separate() -> None:
    html = build([(1.4, 0.2, 2.5, 1.0), (1.4, 3.0, 2.5, 1.0)])  # same x, far apart vertically
    assert len(image_widths(html)) == 2


def test_overlapping_pictures_stay_separate() -> None:
    html = build([(1.0, 0.2, 3.0, 2.0), (2.5, 0.2, 3.0, 2.0)])  # they overlap sideways
    assert len(image_widths(html)) == 2


def test_a_single_floating_picture_is_unchanged() -> None:
    html = build([(1.4, 0.2, 2.5, 3.0)])
    assert image_widths(html) == [240]


def test_pictures_that_wrap_square_are_not_merged() -> None:
    """Square wrapping lets text sit between pictures, so they are not a row."""
    html = build([(1.4, 0.2, 2.5, 3.0), (4.4, 0.25, 2.4, 3.0)], wrap="wrapSquare")
    assert len(image_widths(html)) == 2
