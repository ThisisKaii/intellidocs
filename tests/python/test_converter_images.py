"""Imported pictures are drawn at the size Word draws them; grouped pictures become one image."""
import base64
import io
import re
import sys
from pathlib import Path

import docx
import pymupdf
import pytest
from docx.oxml.ns import qn
from docx.shared import Inches
from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
ML_SRC = ROOT / "ml" / "src"
if str(ML_SRC) not in sys.path:
    sys.path.insert(0, str(ML_SRC))

from converter import _docx_document_to_result, convert_docx_bytes_to_html  # noqa: E402

MEMO = ROOT / "tests" / "fixtures" / "import_baselines" / "documents" / "DM_0440_s_26_SGOD_Conduct-of-World-Teachers-Day.docx"


def _png(width: int = 200, height: int = 100) -> bytes:
    """A solid-colour PNG of the given pixel size."""
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, width, height), False)
    pix.set_rect(pix.irect, (200, 30, 30))
    return pix.tobytes("png")


def _doc_with_picture(width_in: float = 2.0, pixels: tuple = (400, 200)) -> docx.Document:
    document = docx.Document()
    document.add_picture(io.BytesIO(_png(*pixels)), width=Inches(width_in))
    return document


def _img_tags(html: str) -> list:
    return re.findall(r"<img[^>]*>", html)


def _decoded_size(tag: str) -> tuple:
    data = base64.b64decode(re.search(r"base64,([A-Za-z0-9+/=]+)", tag).group(1))
    pix = pymupdf.Pixmap(data)
    return pix.width, pix.height


class TestPictureSize:
    def test_width_is_the_size_word_draws_not_the_pixel_size(self):
        html = _docx_document_to_result(_doc_with_picture(width_in=2.0, pixels=(900, 450)))["html"]
        assert 'width="192"' in _img_tags(html)[0]  # 2in at 96 dpi, not 900px

    def test_a_smaller_picture_is_smaller(self):
        html = _docx_document_to_result(_doc_with_picture(width_in=0.5, pixels=(900, 450)))["html"]
        assert 'width="48"' in _img_tags(html)[0]

    def test_a_cropped_picture_loses_the_cropped_part(self):
        # Cropping 25% off each side of a 400x200 picture leaves 200x200, drawn 1in x 1in.
        document = docx.Document()
        document.add_picture(io.BytesIO(_png(400, 200)), width=Inches(1), height=Inches(1))
        blip_fill = document.element.body.find(".//" + qn("pic:blipFill"))
        crop = etree.SubElement(blip_fill, qn("a:srcRect"))
        crop.set("l", "25000")
        crop.set("r", "25000")
        blip_fill.insert(1, crop)  # srcRect follows the blip
        html = _docx_document_to_result(document)["html"]
        assert _decoded_size(_img_tags(html)[0]) == (200, 200)


@pytest.mark.skipif(not MEMO.exists(), reason="fixture document is not available")
class TestGroupedPictures:
    html = None

    @classmethod
    def _html(cls) -> str:
        if cls.html is None:
            cls.html = convert_docx_bytes_to_html(MEMO.read_bytes())["html"]
        return cls.html

    def test_the_letterhead_group_is_one_image_at_its_frame_width(self):
        first = _img_tags(self._html())[0]
        assert 'width="294"' in first  # 2799080 EMU, the group's frame

    def test_the_group_no_longer_leaves_its_pictures_as_separate_images(self):
        # The memo has 10 pictures in the file; the group's two become one. Pictures that hang
        # beside their paragraph without wrapping text leave the flow as overlays.
        result = convert_docx_bytes_to_html(MEMO.read_bytes())
        overlays = sum(box["html"].count("<img") for box in result["page_art"]["overlays"].values())
        # (a small badge set inside a line of text is dropped: the editor holds pictures as blocks)
        assert len(_img_tags(result["html"])) + overlays == 6

    def test_the_flattened_group_keeps_the_aspect_ratio_of_its_frame(self):
        width, height = _decoded_size(_img_tags(self._html())[0])
        assert width / height == pytest.approx(2799080 / 1398905, rel=0.02)


class TestDrawnAspect:
    def test_a_stretched_thin_rule_keeps_its_drawn_height(self):
        """A 2x5px image that Word draws 6.5in x 0.02in must not become a tall block."""
        document = docx.Document()
        document.add_picture(io.BytesIO(_png(2, 5)), width=Inches(6.5), height=Inches(0.02))
        tag = _img_tags(_docx_document_to_result(document)["html"])[0]
        width, height = _decoded_size(tag)
        assert 'width="624"' in tag
        assert width / height == pytest.approx(624 / 2, rel=0.2)

    def test_a_picture_drawn_at_its_own_aspect_is_not_resampled(self):
        document = _doc_with_picture(width_in=2.0, pixels=(400, 200))
        assert _decoded_size(_img_tags(_docx_document_to_result(document)["html"])[0]) == (400, 200)
