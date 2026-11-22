"""Import guards: files the converter cannot import are refused clearly; PDF line breaks survive."""

import io
import sys
from pathlib import Path

import pymupdf
import pytest
from docx import Document

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml" / "src"))

from converter import UnreadableDocumentError, convert_docx_bytes_to_html, convert_pdf_bytes_to_html  # noqa: E402


def pdf_bytes(**save_options) -> bytes:
    doc = pymupdf.open()
    doc.new_page().insert_text((72, 72), "Confidential research protocol.")
    return doc.tobytes(**save_options)


def test_password_protected_pdf_is_refused_clearly() -> None:
    locked = pdf_bytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="secret", owner_pw="owner")
    with pytest.raises(UnreadableDocumentError, match="password-protected") as refused:
        convert_pdf_bytes_to_html(locked)
    assert "\\" not in str(refused.value) and "/tmp" not in str(refused.value)


def test_damaged_pdf_is_refused_clearly() -> None:
    with pytest.raises(UnreadableDocumentError, match="not a readable PDF"):
        convert_pdf_bytes_to_html(b"%PDF-1.7 this is not really a pdf")


def test_password_protected_docx_is_refused_clearly() -> None:
    # An encrypted Office file is an OLE compound file, not a ZIP package.
    ole = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 512
    with pytest.raises(UnreadableDocumentError, match="password-protected"):
        convert_docx_bytes_to_html(ole)


def test_damaged_docx_is_refused_clearly() -> None:
    with pytest.raises(UnreadableDocumentError, match="not a readable Word document"):
        convert_docx_bytes_to_html(b"random bytes that are not a zip")


def test_normal_docx_still_converts() -> None:
    document = Document()
    document.add_paragraph("A normal paragraph.")
    buffer = io.BytesIO()
    document.save(buffer)
    assert "A normal paragraph." in convert_docx_bytes_to_html(buffer.getvalue())["html"]


def test_pdf_line_in_another_type_size_keeps_its_own_line() -> None:
    """A survey question followed by its rating row in a smaller size: a real break, not a wrap."""
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 100), "1. I use online modules to provide teachers with meaningful feedback.", fontsize=11, fontname="tiro")
    page.insert_text((72, 116), "[1]  [2]  [3]  [4]", fontsize=10, fontname="tiro")
    html = convert_pdf_bytes_to_html(doc.tobytes())["html"]
    question = html.index("meaningful feedback.")
    rating = html.index("[1]")
    assert "<br" in html[question:rating], html[question - 100:rating + 40]
