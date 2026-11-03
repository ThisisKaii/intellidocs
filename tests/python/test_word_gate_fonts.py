"""The shipped-fonts-only mode of tests/e2e/word_gate.py and the font aliases it relies on."""
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "e2e"))
import word_gate  # noqa: E402

SHIPPED = {"times new roman", "arial", "bookman old style"}


def reduced(html: str) -> tuple[str, Counter]:
    dropped: Counter = Counter()
    return word_gate.shipped_fonts_only({"html": html}, SHIPPED, dropped)["html"], dropped


def test_reduces_every_string_in_the_payload_and_leaves_other_values():
    html = '<p style="font-family:Tahoma, Arial">x</p>'
    payload = word_gate.shipped_fonts_only({"html": html, "pageLayout": {"parts": [html]}, "n": 1}, SHIPPED, Counter())
    assert payload["pageLayout"]["parts"][0] == payload["html"] == '<p style="font-family:Arial">x</p>'
    assert payload["n"] == 1


def test_keeps_shipped_and_generic_families_and_drops_the_rest():
    html, dropped = reduced("""<p style="font-family:'Tahoma', Arial, sans-serif; font-size:11pt">x</p>""")
    assert html == """<p style="font-family:Arial, sans-serif; font-size:11pt">x</p>"""
    assert dropped == Counter({"Tahoma": 1})


def test_handles_html_escaped_quotes_and_multi_word_names():
    html, _ = reduced('<span style="font-family: &quot;MS Mincho&quot;, &quot;Times New Roman&quot;, serif">y</span>')
    assert html == """<span style="font-family: 'Times New Roman', serif">y</span>"""
    html, _ = reduced('<span style="font-family: &quot;Times New Roman&quot;; font-size: 9pt">y</span>')
    assert html == """<span style="font-family: 'Times New Roman'; font-size: 9pt">y</span>"""


def test_a_stack_with_nothing_shipped_becomes_serif():
    html, dropped = reduced('<p style="font-family:Cardo">z</p>')
    assert html == '<p style="font-family:serif">z</p>'
    assert dropped == Counter({"Cardo": 1})


def test_the_committed_aliases_cover_every_converter_fallback():
    """Every font the converter falls back to is drawn by the app on every computer."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ml" / "src"))
    from converter import _SHIPPED_FALLBACK

    shipped = word_gate.shipped_families()
    for family in _SHIPPED_FALLBACK.values():
        assert family.strip("'").lower() in shipped


def test_the_committed_aliases_carry_line_metrics():
    css = word_gate.ALIASES_CSS.read_text(encoding="utf-8")
    faces = re.findall(r"@font-face \{[^}]*\}", css)
    assert faces
    for face in faces:
        assert "ascent-override" in face and "descent-override" in face and "line-gap-override" in face, face[:120]
