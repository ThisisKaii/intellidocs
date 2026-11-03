"""Tests that a floating picture keeps the side of the text column Word puts it on."""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))

from test_anchored_row import build  # noqa: E402  (a DOCX with anchored pictures: x_in, y_in, w_in, h_in)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))
from converter import _group_wrapped_pictures  # noqa: E402

# Letter page, 1in margins: the text column runs from x=1in to x=7.5in (6.5in = 624px wide).


def placement(html: str) -> tuple[str | None, str | None]:
    """(data-alignment, margin of the container style) of the first picture, None where absent."""
    tag = re.search(r"<img[^>]*>", html).group(0)
    alignment = re.search(r'data-alignment="(\w+)"', tag)
    container = re.search(r'containerstyle="([^"]*)"', tag)
    margin = re.search(r"margin:\s*([^;]+);", container.group(1)) if container else None
    return (alignment.group(1) if alignment else None, margin.group(1) if margin else None)


def test_picture_at_the_left_edge_is_left_aligned() -> None:
    assert placement(build([(1.0, 0.0, 2.0, 1.0)])) == ("left", "0 auto 0 0")


def test_picture_in_the_middle_of_the_column_stays_centered() -> None:
    assert placement(build([(3.25, 0.0, 2.0, 1.0)])) == (None, None)  # (6.5 - 2) / 2 = 2.25in in from the margin


def test_picture_at_the_right_edge_is_right_aligned() -> None:
    assert placement(build([(5.5, 0.0, 2.0, 1.0)])) == ("right", "0 0 0 auto")


def test_picture_at_an_offset_keeps_that_offset() -> None:
    assert placement(build([(2.0, 0.0, 2.0, 1.0)])) == ("left", "0 0 0 96px")  # 1in in from the left margin


def test_square_wrapped_picture_floats_in_a_wrap_block() -> None:
    """Text flows beside it in Word, so the picture floats on its side inside a block of its own."""
    html = build([(1.0, 0.0, 2.0, 1.0)], wrap="wrapSquare")
    assert '<div class="intellidocs-wrap" data-top="0">' in html
    assert "float: left" in html
    assert "data-wrap-reach" not in html and "data-wrap-top" not in html  # working marks do not reach the editor


def test_a_picture_with_no_room_beside_it_stays_a_plain_block() -> None:
    """Word leaves a gap too narrow for a line of text blank."""
    html = build([(1.0, 0.0, 6.0, 1.0)], wrap="wrapSquare")
    assert "intellidocs-wrap" not in html
    assert "float:" not in html


def test_a_wrapped_picture_on_the_right_floats_right() -> None:
    assert "float: right" in build([(5.5, 0.0, 2.0, 1.0)], wrap="wrapSquare")


def test_a_wrapped_picture_that_cannot_be_grouped_never_stays_floated() -> None:
    """Outside a wrap block a float lands below the last page, so the picture must become a plain block."""
    item = '<li><img data-wrap-top="0" data-wrap-reach="100" containerstyle="width: 200px; float: left; margin: 0 8px 0 0;" /></li>'
    blocks = ["<ol>", item, "</ol>"]
    _group_wrapped_pictures(blocks)
    assert "float" not in blocks[1]
    assert "data-wrap" not in blocks[1]
    assert "margin: 0 auto 0 0;" in blocks[1]


def test_picture_in_front_of_the_text_is_not_placed() -> None:
    """wrapNone (in front of / behind the text) is not part of the flow: it is pinned as overlay art."""
    assert "data-alignment" not in build([(1.0, 0.0, 2.0, 1.0)], wrap="wrapNone")


def test_full_width_picture_needs_no_placement() -> None:
    assert placement(build([(1.0, 0.0, 6.5, 1.0)])) == (None, None)
