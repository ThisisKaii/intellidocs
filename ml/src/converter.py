import base64
import collections
import copy
import hashlib
import io
import json
import logging
import math
import os
import re
import tempfile
import threading
from html import escape as _html_escape
from typing import Any, Dict, List, Optional, Set, Tuple
import docx
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn
from docx.shared import Emu
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.text.run import Run

import omml
from html import unescape as _html_unescape
from docir import (
    ColumnBreak,
    DisplayMath,
    DrawnLine,
    Fragment,
    Hyperlink,
    Inline,
    InlineMath,
    LineBreak,
    NoteReference,
    PageArt,
    PageBreak,
    ParagraphIndent,
    Picture,
    ParagraphProps,
    ParagraphSpacing,
    RunProps,
    TextRun,
)

# Word highlight color names -> CSS hex.
HIGHLIGHT_COLORS: Dict[str, str] = {
    "black": "#000000", "blue": "#0000FF", "cyan": "#00FFFF", "darkBlue": "#00008B",
    "darkCyan": "#008B8B", "darkGray": "#A9A9A9", "darkGreen": "#006400",
    "darkMagenta": "#8B008B", "darkRed": "#8B0000", "darkYellow": "#808000",
    "green": "#008000", "lightGray": "#D3D3D3", "magenta": "#FF00FF",
    "red": "#FF0000", "white": "#FFFFFF", "yellow": "#FFFF00",
}

EMU_PER_INCH = 914400
TWIPS_PER_PX = 96.0 / 1440.0

# Marks a column break inside a paragraph until the section's columns are built.
_COLUMN_MARK = ""
_PAGE_BREAK_HTML = '<hr class="page-break" data-page-break="true" />'
# Where a continuous section starts (frontend SectionMark): takes no room and never breaks a page.
_SECTION_MARK_HTML = '<div class="intellidocs-section-mark" data-section="{index}"></div>'

# A Word import's section margins are drawn by the editor (frontend SectionLayout) from the section
# properties on its breaks; nothing is written into the blocks' own styles, so a block added to a
# section later is placed like the rest. PDF imports get no section properties: pdf2docx's one section
# per page, with margins wherever that page's text sits, are not the document's sections.


def _is_pdf(doc: docx.Document) -> bool:
    return bool(getattr(doc.part, "_is_pdf_import", False))

DEFAULT_PAGE_SETUP: Dict[str, Any] = {
    "page_size": "letter",
    "orientation": "portrait",
    "margins": {"top": 1, "bottom": 1, "left": 1.5, "right": 1},
}


def _color_to_hex(color_obj: Any) -> Optional[str]:
    """Extract RGB hex color string from a python-docx ColorFormat object."""
    if not color_obj:
        return None
    try:
        if color_obj.rgb:
            return f"#{color_obj.rgb}"
    except Exception:
        pass
    return None


def _get_paragraph_alignment(p: Paragraph) -> str:
    """Return text alignment CSS value for a paragraph."""
    align_map = {
        WD_ALIGN_PARAGRAPH.CENTER: "center",
        WD_ALIGN_PARAGRAPH.RIGHT: "right",
        WD_ALIGN_PARAGRAPH.JUSTIFY: "justify",
        WD_ALIGN_PARAGRAPH.LEFT: "left",
    }
    return align_map.get(p.alignment, "left")


def _highlight_css(run: Run) -> Optional[str]:
    """Return the CSS background-color for a run's highlight, if any."""
    try:
        rPr = run._element.rPr
        if rPr is None:
            return None
        hl_el = rPr.find(qn("w:highlight"))
        if hl_el is None:
            return None
        val = hl_el.get(qn("w:val"))
        if val and val != "none" and val in HIGHLIGHT_COLORS:
            return HIGHLIGHT_COLORS[val]
    except Exception:
        pass
    return None


_SANS_FAMILIES = (
    "arial", "helvetica", "calibri", "verdana", "tahoma", "segoe", "open sans", "roboto", "lato",
    "montserrat", "trebuchet", "gill sans", "franklin", "myriad", "century gothic", "candara", "corbel",
)


def _clean_font_name(name: str) -> str:
    """A font family from a PDF-style name: drop the subset prefix and the ",Bold"/"-Italic" style suffix."""
    cleaned = re.sub(r"^[A-Z]{6}\+", "", name.strip())
    cleaned = re.split(r",", cleaned, maxsplit=1)[0]
    cleaned = re.sub(r"[-_ ](Bold|Italic|Oblique|BoldItalic|Regular|Light|Medium|Semibold)$", "", cleaned, flags=re.I)
    return cleaned.strip() or name


# Word font names the editor draws itself on every computer (frontend/src/styles/wordFontAliases.css,
# made by tests/e2e/tools/make_font_metrics.py), one per kind. A font the computer lacks falls back to
# one of these, never to the browser's generic family: that differs by system (Times New Roman on
# Windows, DejaVu on Linux), and so would the layout.
_SHIPPED_FALLBACK = {"serif": "'Times New Roman'", "sans-serif": "Arial", "monospace": "'Courier New'"}


def _generic_family(name: str) -> str:
    """What follows a font in its CSS stack: the shipped font of its kind, then the generic family."""
    lowered = name.lower()
    if "mono" in lowered or "courier" in lowered or "consolas" in lowered:
        generic = "monospace"
    else:
        generic = "sans-serif" if any(sans in lowered for sans in _SANS_FAMILIES) else "serif"
    return f"{_SHIPPED_FALLBACK[generic]}, {generic}"


def _style_flag(style: Any, attribute: str) -> Optional[bool]:
    """The nearest explicit bold/italic value along a style's based-on chain, or None when it never says."""
    seen: Set[str] = set()
    while style is not None and style.style_id not in seen:
        seen.add(style.style_id)
        value = getattr(style.font, attribute, None) if style.font is not None else None
        if value is not None:
            return bool(value)
        style = style.base_style
    return None


def _inherited_run_flag(run: Run, attribute: str) -> bool:
    """Bold/italic a run gets: its own setting, else its character style and its paragraph style combined.

    Bold and italic are toggle properties. A value set directly on the run is absolute. Otherwise the
    character style and the paragraph style each contribute their nearest value and the two are
    toggled against each other: both on gives off, so a "Strong" character style inside a bold
    heading style reads as regular text, as it does in Word.
    """
    direct = getattr(run, attribute)
    if direct is not None:
        return bool(direct)
    from_character: Optional[bool] = None
    try:
        from_character = _style_flag(run.style, attribute)
    except Exception:
        pass
    from_paragraph: Optional[bool] = None
    parent = run._parent
    if isinstance(parent, Paragraph):
        try:
            from_paragraph = _style_flag(parent.style, attribute)
        except Exception:
            pass
    return bool(from_character) != bool(from_paragraph)


def _font_widths() -> Dict[str, Dict[str, List[int]]]:
    """Character widths of common Word fonts (made by tests/e2e/tools/make_font_widths.py)."""
    global _FONT_WIDTHS
    if _FONT_WIDTHS is None:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "font_widths.json"), encoding="utf-8") as table:
            _FONT_WIDTHS = json.load(table)
    return _FONT_WIDTHS


_FONT_WIDTHS: Optional[Dict[str, Dict[str, List[int]]]] = None
# Word squeezes the spaces of a justified line to fit one more word; a browser only ever widens them.
# Scaled runs in justified paragraphs are set this much tighter so the same words fit, and
# justification widens the line back out. 0.9 doubled the lines matching Word on DM_0440.
_JUSTIFIED_TRACKING = 0.9
# Characters outside the width table (and in no listed font) count as half an em.
_UNKNOWN_CHAR_WIDTH = 500


def _text_width_em(text: str, family: Optional[str], bold: bool, italic: bool) -> float:
    """Natural width of text in ems, from the font's own character widths."""
    table = _font_widths()
    faces = table.get((family or "").lower(), table["times new roman"])
    style = {(False, False): "regular", (True, False): "bold", (False, True): "italic", (True, True): "bold italic"}[(bold, italic)]
    widths = faces[style]
    total = 0
    for char in text:
        code = ord(char) - 32
        total += widths[code] if 0 <= code < len(widths) else _UNKNOWN_CHAR_WIDTH
    return total / 1000


def _character_scale_tracking(run: Run, font_name: Optional[str]) -> float:
    """Points of letter spacing that make a run as wide as Word's character scale (w:w) makes it.

    Word stretches the glyphs of a run scaled to, say, 115%. CSS cannot: a transform does not reflow, and
    an inline-block would make a run of several lines one unbreakable box. So the run's extra width
    is shared across its characters, measured from its own text in its own font, and its lines break
    where Word's do. The glyphs keep their shape.
    """
    scale = run._element.rPr.find(qn("w:w")) if run._element.rPr is not None else None
    value = scale.get(qn("w:val")) if scale is not None else None
    if not value or not value.isdigit() or int(value) == 100 or not run.text:
        return 0.0
    size = run.font.size.pt if run.font.size else None
    parent = run._parent if isinstance(run._parent, Paragraph) else None
    if size is None and parent is not None:
        size = _resolve_font_size_pt(parent)
    width = _text_width_em(run.text, font_name, _inherited_run_flag(run, "bold"), _inherited_run_flag(run, "italic"))
    tracking = (int(value) / 100 - 1) * (size or 11.0) * width / len(run.text)
    justified = parent is not None and _resolve_pPr_attr(parent, "jc", "val") in ("both", "distribute")
    return tracking * _JUSTIFIED_TRACKING if justified else tracking


def _read_run(run: Run) -> Optional[TextRun]:
    """A text run as the document model: its text and its formatting resolved (None when it has no text)."""
    text = run.text
    if not text:
        return None

    rpr = run._element.rPr
    # Character spacing (w:spacing, twentieths of a point): condensed text wraps later.
    spacing = rpr.find(qn("w:spacing")) if rpr is not None else None
    tracking = float(spacing.get(qn("w:val")) or 0) / 20 if spacing is not None else 0.0

    # A run with no font of its own uses its paragraph's style chain, then the
    # document defaults; without this an Arial document imports as serif.
    font_name = run.font.name or _rfonts_name(rpr.find(qn("w:rFonts")) if rpr is not None else None, run.part)
    if not font_name and isinstance(run._parent, Paragraph):
        font_name = _inherited_font_name(run._parent)
    tracking += _character_scale_tracking(run, font_name)

    return TextRun(
        text=text,
        props=RunProps(
            size_pt=run.font.size.pt if run.font.size else None,
            color=_color_to_hex(run.font.color),
            tracking_pt=tracking,
            font_family=_clean_font_name(font_name) if font_name else None,
            bold=bool(_inherited_run_flag(run, "bold")),
            italic=bool(_inherited_run_flag(run, "italic")),
            underline=bool(run.underline),
            strike=bool(run.font.strike),
            subscript=bool(run.font.subscript),
            superscript=bool(run.font.superscript),
            highlight=_highlight_css(run),
        ),
    )


def _run_styles(props: RunProps) -> List[str]:
    """The CSS declarations of a run's span (size, colour, tracking, font), in the order they are written."""
    styles: List[str] = []
    if props.size_pt:
        styles.append(f"font-size:{round(props.size_pt, 1)}pt")
    if props.color:
        styles.append(f"color:{props.color}")
    if abs(props.tracking_pt) >= 0.005:
        styles.append(f"letter-spacing:{round(props.tracking_pt, 3):g}pt")
    if props.font_family:
        styles.append(f"font-family:'{props.font_family}', {_generic_family(props.font_family)}")
    return styles


def _run_segments(item: TextRun) -> List[str]:
    """A run's visible text, split at its tabs (the editor's tab nodes go between the segments).

    Runs of spaces keep their width as real NBSPs (HTML would collapse them), written as characters
    so sanitizing the "&nbsp;" entity form leaves them alone; an underlined run of only spaces is a
    fill-in blank and keeps its whole width, even beside another space.
    """
    if item.props.underline and not item.text.strip(" "):
        return ["\u00a0" * len(item.text)]
    return [re.sub(r" {2,}", lambda m: " " + "\u00a0" * (len(m.group(0)) - 1), part) for part in item.text.split("\t")]


def _write_run_html(item: TextRun) -> str:
    """A text run as the editor's HTML: escaped text in a styled span, wrapped in its formatting tags."""
    props = item.props

    def escape(text: str) -> str:
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    # A tab is an inline node whose width the editor computes from the paragraph's tab stops.
    escaped = "<span data-tab></span>".join(escape(segment) for segment in _run_segments(item))
    styles = _run_styles(props)

    res = escaped
    if styles:
        res = f'<span style="{"; ".join(styles)}">{res}</span>'
    if props.bold:
        res = f"<strong>{res}</strong>"
    if props.italic:
        res = f"<em>{res}</em>"
    if props.underline:
        res = f"<u>{res}</u>"
    if props.strike:
        res = f"<s>{res}</s>"
    if props.subscript:
        res = f"<sub>{res}</sub>"
    if props.superscript:
        res = f"<sup>{res}</sup>"
    if props.highlight:
        res = f'<mark style="background-color:{props.highlight}">{res}</mark>'
    return res


def _run_to_html(run: Run) -> str:
    """Convert a single text run into styled HTML with font size, color, family, and styles."""
    item = _read_run(run)
    return _write_run_html(item) if item is not None else ""


# DrawingML namespaces used to size and position pictures.
_NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
_NS_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"
_NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
_NS_WPG = "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
EMU_PER_PX = 9525
EMU_PER_POINT = 12700
# Grouped pictures are flattened to one image no wider than this many pixels.
MAX_GROUP_IMAGE_PX = 1000


def _image_mime(img_bytes: bytes) -> str:
    """MIME type of image bytes, by signature."""
    if img_bytes.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if img_bytes.startswith(b"GIF"):
        return "image/gif"
    return "image/png"


def _int_attr(element: Any, name: str) -> Optional[int]:
    """An integer attribute of an element (attributes like cx/cy carry no namespace), or None."""
    if element is None:
        return None
    value = element.get(name)
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


def _picture_display_size_emu(blip: Any) -> Optional[Tuple[int, int]]:
    """How big Word draws a picture, in EMU.

    A plain picture is as big as the extent of its drawing (inline or anchor). A
    picture inside a group is positioned in the group's own coordinate space, so
    its size is scaled by group extent / group child extent.
    """
    pic = blip.getparent().getparent() if blip.getparent() is not None else None
    if pic is None:
        return None
    ext = pic.find(f"./{{{_NS_PIC}}}spPr/{{{_NS_A}}}xfrm/{{{_NS_A}}}ext")
    own = (_int_attr(ext, "cx"), _int_attr(ext, "cy")) if ext is not None else None
    container = next(blip.iterancestors(f"{{{_NS_WP}}}inline", f"{{{_NS_WP}}}anchor"), None)
    group = next(blip.iterancestors(f"{{{_NS_WPG}}}wgp"), None)

    if group is not None and own and own[0] and own[1] and container is not None:
        frame = container.find(f"{{{_NS_WP}}}extent")
        child_space = group.find(f"./{{{_NS_WPG}}}grpSpPr/{{{_NS_A}}}xfrm/{{{_NS_A}}}chExt")
        if frame is not None and _int_attr(child_space, "cx") and _int_attr(child_space, "cy"):
            scale_x = _int_attr(frame, "cx") / _int_attr(child_space, "cx")
            scale_y = _int_attr(frame, "cy") / _int_attr(child_space, "cy")
            return round(own[0] * scale_x), round(own[1] * scale_y)
    if group is None and container is not None:
        frame = container.find(f"{{{_NS_WP}}}extent")
        if _int_attr(frame, "cx") and _int_attr(frame, "cy"):
            return _int_attr(frame, "cx"), _int_attr(frame, "cy")
    if own and own[0] and own[1]:
        return own
    return None


def _crop_image(img_bytes: bytes, blip: Any) -> bytes:
    """Apply the picture's source crop (a:srcRect, in 1/1000 of a percent), if it has one."""
    fill = blip.getparent()
    rect = fill.find(f"{{{_NS_A}}}srcRect") if fill is not None else None
    if rect is None:
        return img_bytes
    left, top, right, bottom = (_int_attr(rect, k) or 0 for k in ("l", "t", "r", "b"))
    if not any((left, top, right, bottom)) or min(left, top, right, bottom) < 0:
        return img_bytes
    try:
        import pymupdf

        pix = pymupdf.Pixmap(img_bytes)
        x0, y0 = round(pix.width * left / 100000), round(pix.height * top / 100000)
        x1, y1 = pix.width - round(pix.width * right / 100000), pix.height - round(pix.height * bottom / 100000)
        if x1 - x0 < 2 or y1 - y0 < 2:
            return img_bytes
        clip = pymupdf.IRect(x0, y0, x1, y1)
        cropped = pymupdf.Pixmap(pix.colorspace, pymupdf.IRect(0, 0, clip.width, clip.height), pix.alpha)
        cropped.copy(pix, clip)
        return cropped.tobytes("png" if cropped.alpha else "jpeg")
    except Exception:
        return img_bytes


# A picture whose pixels are within this fraction of the drawn aspect is left as it is.
ASPECT_TOLERANCE = 0.03


def _match_drawn_aspect(img_bytes: bytes, width_px: int, height_px: int) -> bytes:
    """Resample a picture whose pixel aspect differs from the aspect Word draws it at.

    The editor shows pictures at a width with automatic height, so a thin rule
    stored as a tiny image and stretched by Word (6.5in x 0.02in) would otherwise
    grow to hundreds of pixels tall. Resampling to the drawn aspect makes any
    viewer show the same height Word does.
    """
    try:
        import pymupdf

        pix = pymupdf.Pixmap(img_bytes)
        if pix.width < 1 or pix.height < 1:
            return img_bytes
        natural, drawn = pix.width / pix.height, width_px / height_px
        if abs(natural - drawn) / drawn <= ASPECT_TOLERANCE:
            return img_bytes
        target_w = min(pix.width, 2 * width_px) if pix.width > width_px else width_px
        target_h = max(1, round(target_w * height_px / width_px))
        resized = pymupdf.Pixmap(pix, target_w, target_h)
        return resized.tobytes("png" if resized.alpha else "jpeg")
    except Exception:
        return img_bytes


def _img_tag(img_bytes: bytes, width_px: Optional[int]) -> str:
    """An <img> with the drawn width, so the editor shows it as big as Word does."""
    src = base64.b64encode(img_bytes).decode("utf-8")
    style = "max-width:100%; height:auto; display:block; border-radius:4px;"
    width_attr = f' width="{width_px}"' if width_px else ""
    return f'<img src="data:{_image_mime(img_bytes)};base64,{src}"{width_attr} style="{style}" />'


def _image_html(blip: Any, doc_parts: Dict[str, bytes]) -> str:
    """Render an embedded drawing (blip) as a base64 data-URI <img> at the size Word draws it."""
    embed_id = blip.get(qn("r:embed"))
    if not embed_id or embed_id not in doc_parts:
        return ""

    img_bytes = _crop_image(doc_parts[embed_id], blip)
    size = _picture_display_size_emu(blip)
    if not size:
        return _img_tag(img_bytes, None)
    width = max(1, round(size[0] / EMU_PER_PX))
    height = max(1, round(size[1] / EMU_PER_PX))
    return _img_tag(_match_drawn_aspect(img_bytes, width, height), width)


def _group_image_html(group: Any, doc_parts: Dict[str, bytes]) -> str:
    """Flatten a group of pictures (a letterhead, a logo strip) into one image.

    The group's pictures are laid out at their own offsets inside the group's
    frame, on a transparent canvas the size of that frame; the editor can then
    draw the group as the single picture it is in Word. Empty string when the
    group can't be flattened (the caller falls back to the separate pictures).
    """
    container = next(group.iterancestors(f"{{{_NS_WP}}}inline", f"{{{_NS_WP}}}anchor"), None)
    frame = container.find(f"{{{_NS_WP}}}extent") if container is not None else None
    frame_w, frame_h = _int_attr(frame, "cx"), _int_attr(frame, "cy")
    xfrm = group.find(f"./{{{_NS_WPG}}}grpSpPr/{{{_NS_A}}}xfrm")
    child_off = xfrm.find(f"{{{_NS_A}}}chOff") if xfrm is not None else None
    child_ext = xfrm.find(f"{{{_NS_A}}}chExt") if xfrm is not None else None
    child_w, child_h = _int_attr(child_ext, "cx"), _int_attr(child_ext, "cy")
    if not (frame_w and frame_h and child_w and child_h):
        return ""

    scale_x, scale_y = frame_w / child_w, frame_h / child_h
    origin_x, origin_y = _int_attr(child_off, "x") or 0, _int_attr(child_off, "y") or 0
    placed: List[Tuple[bytes, Tuple[float, float, float, float]]] = []
    for pic in group.iter(f"{{{_NS_PIC}}}pic"):
        blip = pic.find(f"./{{{_NS_PIC}}}blipFill/{{{_NS_A}}}blip")
        off = pic.find(f"./{{{_NS_PIC}}}spPr/{{{_NS_A}}}xfrm/{{{_NS_A}}}off")
        ext = pic.find(f"./{{{_NS_PIC}}}spPr/{{{_NS_A}}}xfrm/{{{_NS_A}}}ext")
        embed_id = blip.get(qn("r:embed")) if blip is not None else None
        if not embed_id or embed_id not in doc_parts or off is None or ext is None:
            return ""
        x = ((_int_attr(off, "x") or 0) - origin_x) * scale_x / EMU_PER_POINT
        y = ((_int_attr(off, "y") or 0) - origin_y) * scale_y / EMU_PER_POINT
        w = (_int_attr(ext, "cx") or 0) * scale_x / EMU_PER_POINT
        h = (_int_attr(ext, "cy") or 0) * scale_y / EMU_PER_POINT
        placed.append((_crop_image(doc_parts[embed_id], blip), (x, y, x + w, y + h)))
    if not placed:
        return ""

    try:
        import pymupdf

        width_pt, height_pt = frame_w / EMU_PER_POINT, frame_h / EMU_PER_POINT
        canvas = pymupdf.open()
        page = canvas.new_page(width=width_pt, height=height_pt)
        for data, (x0, y0, x1, y1) in placed:
            page.insert_image(pymupdf.Rect(x0, y0, x1, y1), stream=data)
        dpi = max(36, min(150, int(MAX_GROUP_IMAGE_PX / (width_pt / 72))))
        pix = page.get_pixmap(dpi=dpi, alpha=True)
        return _img_tag(pix.tobytes("png"), max(1, round(frame_w / EMU_PER_PX)))
    except Exception:
        return ""


def _floating_placement(blip: Any) -> Optional[Tuple[str, float]]:
    """Where a floating picture sits across the text column: (side, offset px).

    Any picture that text wraps around qualifies (top-and-bottom, square, tight, through). The editor
    cannot flow text beside a picture, so the text goes below it, but the picture itself keeps its
    side: "left", "center" or "right", or an offset from the column's left edge for any other
    position. None when the picture follows the text (inline) or is pinned to the page.
    """
    anchor = next(blip.iterancestors(f"{{{_NS_WP}}}anchor"), None)
    if anchor is None or not _PAGE_GEOMETRY or _page_art_geometry(anchor) is not None:
        return None
    if any(a.tag == _MC_FALLBACK for a in anchor.iterancestors()) or next(blip.iterancestors(f"{{{_NS_WPG}}}wgp"), None) is not None:
        return None
    extent = anchor.find(f"{{{_NS_WP}}}extent")
    width = (_int_attr(extent, "cx") or 0) / EMU_PER_PX
    g = _PAGE_GEOMETRY
    column = g["w"] - g["l"] - g["r"]
    x = _anchor_axis(anchor.find(f"{{{_NS_WP}}}positionH"), width, g["w"], g["l"], g["r"], "left", "right")
    if x is None or width <= 0 or column <= 0 or width >= column - 2:
        return None
    if not any(anchor.find(f"{{{_NS_WP}}}{tag}") is not None for tag in ("wrapTopAndBottom", "wrapSquare", "wrapTight", "wrapThrough")):
        return None  # in front of / behind the text: not placed in the flow
    offset = x - g["l"]
    if abs(offset - (column - width) / 2) <= 3:
        return ("center", 0.0)
    if offset <= 3:
        return ("left", 0.0)
    if offset + width >= column - 3:
        return ("right", 0.0)
    return ("left", round(offset, 1))


# Word wraps text beside a picture only where a line of it fits: narrower gaps stay blank.
_MIN_WRAP_ROOM_PX = 144.0


def _wrap_float(blip: Any, width: float) -> Optional[Tuple[float, float, float]]:
    """(top, gap, reach in px) for a square-wrapped picture with room for text beside it, else None.

    `top` is Word's distance from the top of the paragraph holding the anchor, `gap` the space it keeps
    between picture and text, and `reach` how far down the picture ends.
    """
    anchor = next(blip.iterancestors(f"{{{_NS_WP}}}anchor"), None)
    if anchor is None or not any(anchor.find(f"{{{_NS_WP}}}{tag}") is not None for tag in ("wrapSquare", "wrapTight", "wrapThrough")):
        return None
    g = _PAGE_GEOMETRY
    if g["w"] - g["l"] - g["r"] - width < _MIN_WRAP_ROOM_PX:
        return None
    vertical = anchor.find(f"{{{_NS_WP}}}positionV")
    offset = vertical.find(f"{{{_NS_WP}}}posOffset") if vertical is not None else None
    if vertical is None or vertical.get("relativeFrom") != "paragraph" or offset is None or not (offset.text or "").lstrip("-").isdigit():
        return None
    top = max(int(offset.text) / EMU_PER_PX, 0.0)
    gap = max(_int_attr(anchor, "distL") or 0, _int_attr(anchor, "distR") or 0) / EMU_PER_PX
    height = (_int_attr(anchor.find(f"{{{_NS_WP}}}extent"), "cy") or 0) / EMU_PER_PX
    return (round(top, 1), round(gap, 1), round(top + height, 1))


def _place_floating(piece: str, blip: Any) -> str:
    """Give a floating picture's <img> the side (and offset) Word puts it at across the text column.

    A picture narrow enough for text to run beside it floats, and carries how far down it reaches
    for _group_wrapped_pictures.
    """
    placement = _floating_placement(blip) if piece.startswith("<img") else None
    width = re.search(r'\swidth="(\d+)"', piece)
    if placement is None or width is None or placement[0] == "center":
        return piece
    side, offset = placement
    wrap = _wrap_float(blip, float(width.group(1)))
    if wrap is not None:
        top, gap, reach = wrap
        margin = f"0 0 0 {gap:g}px" if side == "right" else f"0 {gap:g}px 0 {offset:g}px"
        container = f"width: {width.group(1)}px; height: auto; cursor: pointer; float: {side}; margin: {margin};"
        return piece.replace("<img ", f'<img data-wrap-top="{top:g}" data-wrap-reach="{reach:g}" data-alignment="{side}" containerstyle="{container}" ', 1)
    margin = "0 0 0 auto" if side == "right" else (f"0 0 0 {offset:g}px" if offset else "0 auto 0 0")
    container = f"width: {width.group(1)}px; height: auto; cursor: pointer; margin: {margin};"
    return piece.replace("<img ", f'<img data-alignment="{side}" containerstyle="{container}" ', 1)


def _place_inline_pictures(inner: str, p: Paragraph) -> str:
    """A picture alone in its paragraph sits where the paragraph's alignment and indent put it.

    The editor draws a picture as a block and ignores the paragraph around it (centred unless told
    otherwise), so a picture in a left-aligned or indented paragraph would be centred. Centred
    paragraphs need nothing. A paragraph that also holds text is left alone: Word lays the text and
    the picture out on one line, which a block cannot reproduce.
    """
    try:
        if "<img " not in inner or "".join(node.text or "" for node in p._element.iter(qn("w:t"))).strip():
            return inner
        alignment = _resolve_pPr_attr(p, "jc", "val") or "left"
        left = _resolve_pPr_attr(p, "ind", "left") or _resolve_pPr_attr(p, "ind", "start") or "0"
    except Exception:
        return inner  # not a paragraph we can read: leave the picture as it is
    if alignment == "center":
        return inner
    indent = int(left) * TWIPS_PER_PX if left.lstrip("-").isdigit() else 0.0
    if alignment == "right":
        side, margin = "right", "0 0 0 auto"
    else:
        side, margin = "left", (f"0 auto 0 {indent:.1f}px" if indent > 2 else "0 auto 0 0")

    def place(match: "re.Match[str]") -> str:
        tag = match.group(0)
        width = re.search(r'\swidth="(\d+)"', tag)
        if tag.startswith("<page-art") or "containerstyle=" in tag or width is None:
            return tag
        container = f"width: {width.group(1)}px; height: auto; cursor: pointer; margin: {margin};"
        return tag.replace("<img ", f'<img data-alignment="{side}" containerstyle="{container}" ', 1)

    return re.sub(r"<page-art [^>]*>.*?</page-art>|<img [^>]*>", place, inner, flags=re.S)


def _anchored_row(p_element: Any, doc_parts: Dict[str, bytes]) -> Optional[Dict[str, Any]]:
    """Pictures Word draws side by side on one line, merged into a single picture.

    Two or more pictures anchored to the same paragraph with top-and-bottom wrapping, each at
    its own horizontal offset and sharing one vertical band (the cover pages of two volumes),
    sit in a row in Word. The editor's pictures are blocks and would stack, so the row is drawn
    onto one transparent canvas, like a grouped letterhead. None when the paragraph holds no such row.
    """
    if not _PAGE_GEOMETRY:
        return None
    g = _PAGE_GEOMETRY
    items: List[Tuple[float, float, float, float, Any, bytes]] = []
    for anchor in p_element.iter(f"{{{_NS_WP}}}anchor"):
        if any(a.tag == _MC_FALLBACK for a in anchor.iterancestors()):
            continue
        if anchor.find(f"{{{_NS_WP}}}wrapTopAndBottom") is None or _page_art_geometry(anchor) is not None:
            continue
        if anchor.find(f".//{{{_NS_WPG}}}wgp") is not None:
            continue
        blip = anchor.find(f".//{{{_NS_A}}}blip")
        embed_id = blip.get(qn("r:embed")) if blip is not None else None
        extent = anchor.find(f"{{{_NS_WP}}}extent")
        if not embed_id or embed_id not in doc_parts or extent is None:
            continue
        width, height = (_int_attr(extent, "cx") or 0) / EMU_PER_PX, (_int_attr(extent, "cy") or 0) / EMU_PER_PX
        x = _anchor_axis(anchor.find(f"{{{_NS_WP}}}positionH"), width, g["w"], g["l"], g["r"], "left", "right")
        vertical = anchor.find(f"{{{_NS_WP}}}positionV")
        offset = next(iter(vertical), None) if vertical is not None and vertical.get("relativeFrom") in ("paragraph", "line") else None
        if x is None or width <= 0 or height <= 0 or offset is None or not offset.tag.endswith("}posOffset"):
            continue
        items.append((x, float(offset.text or 0) / EMU_PER_PX, width, height, blip, _crop_image(doc_parts[embed_id], blip)))
    if len(items) < 2:
        return None
    items.sort(key=lambda item: item[0])
    if any(a[0] + a[2] > b[0] + 2 for a, b in zip(items, items[1:])):
        return None  # pictures overlap sideways: not a row
    shared = min(i[1] + i[3] for i in items) - max(i[1] for i in items)
    if shared < 0.5 * min(i[3] for i in items):
        return None  # not on one line

    left, top = items[0][0], min(i[1] for i in items)
    width_px, height_px = max(i[0] + i[2] for i in items) - left, max(i[1] + i[3] for i in items) - top
    try:
        import pymupdf

        width_pt, height_pt = width_px * 0.75, height_px * 0.75
        canvas = pymupdf.open()
        page = canvas.new_page(width=width_pt, height=height_pt)
        for x, y, w, h, _blip, data in items:
            page.insert_image(pymupdf.Rect((x - left) * 0.75, (y - top) * 0.75, (x - left + w) * 0.75, (y - top + h) * 0.75), stream=data)
        dpi = max(36, min(150, int(MAX_GROUP_IMAGE_PX / (width_pt / 72))))
        return {"html": _img_tag(page.get_pixmap(dpi=dpi, alpha=True).tobytes("png"), max(1, round(width_px))), "blips": {i[4] for i in items}, "done": False}
    except Exception:
        return None


# Page size and margins (px) of the section being converted, for pictures Word pins to the page.
_PAGE_GEOMETRY: Dict[str, float] = {}
# Numbers the boxes that follow a paragraph, so the editor can find their paragraph again.
_OVERLAY_COUNTER = [0]


def _set_page_geometry(doc: docx.Document) -> None:
    """Remember the first section's page size and margins for page-anchored pictures."""
    _PAGE_GEOMETRY.clear()
    _OVERLAY_COUNTER[0] = 0
    try:
        section = doc.sections[0]
        _PAGE_GEOMETRY.update(
            w=section.page_width / EMU_PER_PX, h=section.page_height / EMU_PER_PX,
            l=(section.left_margin or 0) / EMU_PER_PX, r=(section.right_margin or 0) / EMU_PER_PX,
            t=(section.top_margin or 0) / EMU_PER_PX, b=(section.bottom_margin or 0) / EMU_PER_PX,
        )
    except Exception:
        pass


def _anchor_axis(position: Any, size: float, page: float, near: float, far: float, align_start: str, align_end: str) -> Optional[float]:
    """Pixel offset of an anchored picture along one axis from the page edge, or None when it follows the text."""
    if position is None:
        return None
    relative = position.get("relativeFrom") or ""
    if relative in ("page", "leftMargin", "topMargin"):
        origin, span = 0.0, page
    elif relative in ("margin", "column", "insideMargin", "outsideMargin"):
        origin, span = near, page - near - far
    else:
        return None  # paragraph / line / character: the picture moves with the text
    child = next(iter(position), None)
    if child is None:
        return None
    if child.tag.endswith("}posOffset"):
        return origin + float(child.text or 0) / EMU_PER_PX
    alignment = child.text or ""
    if alignment == align_start:
        return origin
    if alignment == align_end:
        return origin + span - size
    return origin + (span - size) / 2.0


def _page_art_geometry(anchor: Any) -> Optional[Dict[str, float]]:
    """Where a drawing anchored to the page (or hung beside its paragraph) sits, in px.

    "paragraph" is 1 when y is measured down from the top of the paragraph that holds
    the anchor instead of from the page corner; such boxes must not wrap text.
    """
    if anchor is None or not _PAGE_GEOMETRY:
        return None
    extent = anchor.find(f"{{{_NS_WP}}}extent")
    width, height = (_int_attr(extent, "cx") or 0) / EMU_PER_PX, (_int_attr(extent, "cy") or 0) / EMU_PER_PX
    if width <= 0 or height <= 0:
        return None
    g = _PAGE_GEOMETRY
    x = _anchor_axis(anchor.find(f"{{{_NS_WP}}}positionH"), width, g["w"], g["l"], g["r"], "left", "right")
    vertical = anchor.find(f"{{{_NS_WP}}}positionV")
    y = _anchor_axis(vertical, height, g["h"], g["t"], g["b"], "top", "bottom")
    beside = 0.0
    if y is None and vertical is not None and vertical.get("relativeFrom") == "paragraph":
        offset = next(iter(vertical), None)
        no_wrap = anchor.find(f"{{{_NS_WP}}}wrapNone") is not None
        if offset is not None and offset.tag.endswith("}posOffset") and no_wrap:
            y, beside = float(offset.text or 0) / EMU_PER_PX, 1.0
    if x is None or y is None:
        return None
    return {"x": x, "y": y, "w": width, "h": height, "behind": 1.0 if anchor.get("behindDoc") == "1" else 0.0, "paragraph": beside}


def _as_page_art(piece: str, source: Any) -> str:
    """Wrap a drawing's HTML in a <page-art> marker when Word pins it to the page or hangs it beside its paragraph."""
    anchor = next(source.iterancestors(f"{{{_NS_WP}}}anchor"), None)
    return _page_art_marker(piece, _page_art_geometry(anchor))


def _page_art_marker(piece: str, geometry: Optional[Dict[str, float]]) -> str:
    """The <page-art> marker for a drawing and its geometry (the drawing itself when it stays in the text)."""
    if geometry is None or not piece:
        return piece
    values = dict(geometry)
    if values["paragraph"]:
        _OVERLAY_COUNTER[0] += 1
        values["id"] = float(_OVERLAY_COUNTER[0])
    attrs = " ".join(f'data-{key}="{round(value, 1):g}"' for key, value in values.items())
    return f"<page-art {attrs}>{piece}</page-art>"


def _box_style(shape: Any) -> str:
    """CSS for a text box's fill and outline, read from its shape properties."""
    properties = shape.find(f"./{{{_NS_WPS}}}spPr")
    parts: List[str] = []
    if properties is not None:
        fill = properties.find(f"./{{{_NS_A}}}solidFill/{{{_NS_A}}}srgbClr")
        if fill is not None and fill.get("val"):
            parts.append(f"background:#{fill.get('val')}")
        line = properties.find(f"./{{{_NS_A}}}ln")
        if line is not None and line.find(f"./{{{_NS_A}}}noFill") is None:
            color = line.find(f"./{{{_NS_A}}}solidFill/{{{_NS_A}}}srgbClr")
            width = (_int_attr(line, "w") or 9525) / EMU_PER_POINT
            if color is not None and color.get("val"):
                parts.append(f"border:{max(width, 0.5):g}pt solid #{color.get('val')}")
    return ";".join(parts)


def _anchored_textboxes(run_element: Any, paragraph: Paragraph, images: Dict[str, bytes]) -> str:
    """Markers for the text boxes in a run that Word pins to the page or hangs beside their paragraph."""
    markers: List[str] = []
    for anchor in run_element.iter(f"{{{_NS_WP}}}anchor"):
        if any(a.tag == _MC_FALLBACK for a in anchor.iterancestors()):
            continue
        shape = anchor.find(f".//{{{_NS_WPS}}}wsp")
        content = anchor.find(f".//{qn('w:txbxContent')}")
        geometry = _page_art_geometry(anchor)
        if shape is None or content is None or geometry is None:
            continue
        body = shape.find(f"./{{{_NS_WPS}}}bodyPr")
        pad_l = (_int_attr(body, "lIns") if body is not None and body.get("lIns") else 91440) / EMU_PER_PX
        pad_t = (_int_attr(body, "tIns") if body is not None and body.get("tIns") else 45720) / EMU_PER_PX
        inner = "".join(
            _paragraph_to_html(Paragraph(child, paragraph._parent), images)
            for child in content if child.tag == qn("w:p")
        )
        style = f"box-sizing:border-box;width:100%;min-height:100%;padding:{pad_t:g}px {pad_l:g}px;overflow:hidden;{_box_style(shape)}"
        markers.append(_page_art_marker(f'<div style="{style}">{inner}</div>', geometry))
    return "".join(markers)


_PAGE_ART = re.compile(r"<page-art ([^>]*)>(.*?)</page-art>", re.S)
_BLOCK_START = re.compile(r"<(?:p|h[1-6])\b")


def _extract_page_art(html: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Take the <page-art> markers out of HTML.

    Each comes back with the page (1-based) it sits on and its content. A box hung
    beside a paragraph also tags that paragraph with `data-overlay`, so the editor
    can place the box from the paragraph wherever the text flows.
    """
    art: List[Dict[str, Any]] = []
    # Block start offsets (in the original string) of the paragraphs that own a box.
    owners: Dict[int, List[int]] = {}
    # Only blocks outside the markers: a text box's own paragraphs leave with it, and counting them
    # attached every later box to a paragraph further on (7 of 8 in DM-OUHRODI).
    inside = [(m.start(), m.end()) for m in _PAGE_ART.finditer(html)]
    blocks = [m.start() for m in _BLOCK_START.finditer(html) if not any(a <= m.start() < b for a, b in inside)]

    def take(match: "re.Match[str]") -> str:
        values: Dict[str, Any] = {key: float(value) for key, value in re.findall(r'data-(\w+)="([-\d.]+)"', match.group(1))}
        values["html"] = match.group(2)
        values["page"] = html.count('<hr class="page-break"', 0, match.start()) + 1
        if values.get("paragraph"):
            before = [start for start in blocks if start < match.start()]
            if before:
                owners.setdefault(blocks.index(before[-1]), []).append(int(values["id"]))
        art.append(values)
        return ""

    cleaned = _PAGE_ART.sub(take, html)
    if owners:
        # Block n outside the markers is block n of the cleaned string: removing a marker drops exactly the blocks inside it.
        starts = [m.end() for m in _BLOCK_START.finditer(cleaned)]
        for index in sorted(owners, reverse=True):
            if index < len(starts):
                ids = " ".join(str(value) for value in owners[index])
                cleaned = cleaned[: starts[index]] + f' data-overlay="{ids}"' + cleaned[starts[index]:]
    return cleaned, art


def _fill_box(html: str) -> str:
    """Make a picture fill the box it sits in (its size is the box's, not its pixel size)."""
    return re.sub(
        r'<img ([^>]*?)style="[^"]*"',
        r'<img \1style="display:block;width:100%;height:100%;max-width:none"',
        html,
    )


def _art_html(item: Dict[str, Any]) -> str:
    """One page-art drawing as an absolutely positioned box measured from the page corner."""
    blend = "mix-blend-mode:multiply;" if item.get("behind") else ""
    return (
        f'<div style="position:absolute;left:{item["x"]:g}px;top:{item["y"]:g}px;width:{item["w"]:g}px;'
        f'height:{item["h"]:g}px;{blend}pointer-events:none">{_fill_box(item["html"])}</div>'
    )


def _group_page_art(art: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Split page art into what repeats on several pages, what belongs to one page, and boxes beside paragraphs."""
    overlays: Dict[str, Dict[str, Any]] = {}
    pinned = [item for item in art if not item.get("paragraph")]
    for item in art:
        if item.get("paragraph"):
            overlays[str(int(item["id"]))] = {
                "x": item["x"], "y": item["y"], "w": item["w"], "h": item["h"],
                "behind": bool(item.get("behind")), "html": _fill_box(item["html"]),
            }
    seen: Dict[Tuple[int, float, float, float, float], Set[int]] = {}
    for item in pinned:
        key = (hash(item["html"]), round(item["x"]), round(item["y"]), round(item["w"]), round(item["h"]))
        seen.setdefault(key, set()).add(int(item["page"]))
    repeat: List[str] = []
    pages: Dict[int, List[str]] = {}
    emitted: Set[Tuple[int, float, float, float, float]] = set()
    for item in pinned:
        key = (hash(item["html"]), round(item["x"]), round(item["y"]), round(item["w"]), round(item["h"]))
        if len(seen[key]) >= 2:
            if key not in emitted:
                emitted.add(key)
                repeat.append(_art_html(item))
        else:
            pages.setdefault(int(item["page"]), []).append(_art_html(item))
    return {
        "repeat": "".join(repeat),
        "pages": {str(page): "".join(items) for page, items in pages.items()},
        "overlays": overlays,
    }


def _run_picture_html(run: Run, doc_parts: Dict[str, bytes], row: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """The HTML of a run's pictures and drawn lines, or None when it has neither (or they cannot be read):
    then the run is text.

    `row` is the paragraph's merged side-by-side pictures (see _anchored_row): the first run
    holding one of them draws the merged picture, and the row's own pictures are not drawn again.
    """
    try:
        element = run._element
        line_marks = _LINE_MARK * len(_line_shapes_in(element))
        # mc:AlternateContent stores a drawing twice (the real shape and a fallback
        # picture of it for old readers); only the real one is rendered.
        blips = [
            b for b in element.findall(".//" + qn("a:blip"))
            if not any(a.tag == _MC_FALLBACK for a in b.iterancestors())
        ]
        if blips:
            pieces: List[str] = []
            if row is not None and any(b in row["blips"] for b in blips):
                blips = [b for b in blips if b not in row["blips"]]
                if not row["done"]:
                    row["done"] = True
                    pieces.append(row["html"])
            grouped: Set[Any] = set()
            for group in element.iter(f"{{{_NS_WPG}}}wgp"):
                if next(group.iterancestors(f"{{{_NS_WPG}}}wgp"), None) is not None:
                    continue  # a nested group is flattened with its outer group
                flat = _group_image_html(group, doc_parts)
                if flat:
                    pieces.append(_as_page_art(flat, group))
                    grouped.update(group.iter(qn("a:blip")))
            for b in blips:
                if b in grouped:
                    continue
                piece = _place_floating(_as_page_art(_image_html(b, doc_parts), b), b)
                if next(b.iterancestors(f"{{{_NS_WP}}}anchor"), None) is None:  # inline: follows its paragraph
                    piece = _place_inline_pictures(piece, run._parent)
                pieces.append(piece)
            return line_marks + "".join(pieces)
        if line_marks:
            return line_marks
    except Exception:
        pass
    return None


def _split_page_art(html: str, kind: str) -> List[Inline]:
    """A fragment's HTML with its drawn-line markers as DrawnLine items and its page-art markers as
    PageArt items; the rest stays a fragment of `kind`."""
    items: List[Inline] = []
    if kind in ("lines", "pictures"):
        marks = len(html) - len(html.lstrip(_LINE_MARK))
        items.extend(DrawnLine() for _ in range(marks))
        html = html[marks:]
        if kind == "lines" and not html:
            return items
    at = 0
    for match in _PAGE_ART.finditer(html):
        if match.start() > at:
            items.append(Fragment(kind, html[at:match.start()]))
        found = re.search(r'data-id="(\d+)"', match.group(1))
        anchored = re.search(r'data-paragraph="1"', match.group(1))
        items.append(PageArt(match.group(0), int(found.group(1)) if found and anchored else None))
        at = match.end()
    if at < len(html) or not items:
        rest = html[at:]
        picture = _read_picture(rest) if kind == "pictures" else None
        if picture is not None:
            items.append(picture)
        elif rest or kind != "pictures":
            items.append(Fragment(kind, rest))
    return items


_IMG_TAG = re.compile(r"<img\b[^>]*/>")


def _read_picture(html: str) -> Optional[Picture]:
    """A picture from the one <img> tag the picture placement wrote, or None when it is not one."""
    if not _IMG_TAG.fullmatch(html):
        return None

    def attr(name: str) -> Optional[str]:
        found = re.search(r"\s" + name + '="([^"]*)"', html)
        return found.group(1) if found else None

    width = attr("width")
    return Picture(
        html=html,
        src=attr("src") or "",
        width=int(width) if width and width.isdigit() else None,
        alignment=attr("data-alignment") or "center",
        container_style=attr("containerstyle"),
        wraps=attr("data-wrap-reach") is not None,
    )


def _read_run_content(run: Run, doc_parts: Dict[str, bytes], row: Optional[Dict[str, Any]] = None) -> List[Inline]:
    """A run as the document model: its pictures and drawn lines (pictures pinned to the page as page
    art), or its text."""
    pictures = _run_picture_html(run, doc_parts, row)
    if pictures is not None:
        kind = "lines" if pictures and not pictures.replace(_LINE_MARK, "") else "pictures"
        return _split_page_art(pictures, kind)
    item = _read_run(run)
    return [item] if item is not None else []


def _run_or_image_html(run: Run, doc_parts: Dict[str, bytes], row: Optional[Dict[str, Any]] = None) -> str:
    """Render a run as either its inline image (if it contains a drawing) or styled text."""
    return _write_inline_html(_read_run_content(run, doc_parts, row))


_NS_WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
_LINE_GEOMETRIES = {"line", "straightConnector1"}
# Scheme colours Word uses for a default black/white line.
_SCHEME_LINE_COLORS = {"dk1": "#000000", "tx1": "#000000", "dk2": "#44546A", "tx2": "#44546A", "bg1": "#FFFFFF", "lt1": "#FFFFFF"}


# Marks where a drawn line sits in a paragraph's inner HTML (a private-use character).
_LINE_MARK = "\ue000"


def _is_flat_path(shape: Any) -> bool:
    """Whether a shape is drawn as a custom path that is one flat stroke (PDF-to-Word letterhead rules)."""
    path = shape.find(f"./{{{_NS_WPS}}}spPr/{{{_NS_A}}}custGeom/{{{_NS_A}}}pathLst/{{{_NS_A}}}path")
    if path is None or path.get("h") not in (None, "0"):
        return False
    return len(path.findall(f"{{{_NS_A}}}lnTo")) == 1 and path.find(f"{{{_NS_A}}}close") is None


def _line_shapes_in(element: Any) -> List[Tuple[int, int, str]]:
    """Straight horizontal lines drawn inside an element: (length EMU, weight EMU, colour).

    These are DrawingML line shapes (a "Straight Connector" with no height), the
    rules Word documents use for signature lines and section dividers. They carry
    no picture, so they would otherwise vanish from the import.
    """
    lines: List[Tuple[int, int, str]] = []
    for shape in element.iter(f"{{{_NS_WPS}}}wsp"):
        geometry = shape.find(f"./{{{_NS_WPS}}}spPr/{{{_NS_A}}}prstGeom")
        extent = shape.find(f"./{{{_NS_WPS}}}spPr/{{{_NS_A}}}xfrm/{{{_NS_A}}}ext")
        if extent is None or not (
            (geometry is not None and geometry.get("prst") in _LINE_GEOMETRIES) or _is_flat_path(shape)
        ):
            continue
        length, height = _int_attr(extent, "cx") or 0, _int_attr(extent, "cy") or 0
        if length <= 0 or height > 12700:  # taller than 1pt: a diagonal or a box, not a rule
            continue
        outline = shape.find(f"./{{{_NS_WPS}}}spPr/{{{_NS_A}}}ln")
        weight = _int_attr(outline, "w") or 9525
        color = "#000000"
        if outline is not None:
            rgb = outline.find(f"./{{{_NS_A}}}solidFill/{{{_NS_A}}}srgbClr")
            scheme = outline.find(f"./{{{_NS_A}}}solidFill/{{{_NS_A}}}schemeClr")
            if rgb is not None and rgb.get("val"):
                color = f"#{rgb.get('val')}"
            elif scheme is not None:
                color = _SCHEME_LINE_COLORS.get(scheme.get("val") or "", "#000000")
        lines.append((length, weight, color))
    return lines


def _line_paragraph_html(p: Paragraph, line: Tuple[int, int, str], space_before: bool) -> str:
    """An empty paragraph with a bottom border: how a drawn horizontal line is shown."""
    length, weight, color = line
    pt = round(weight / EMU_PER_POINT, 2)
    # An inline line sits on the baseline of a normal-height line: about 78% of
    # that line is blank above the rule and the descent (22%) below it.
    line_pt = (_resolve_font_size_pt(p) or 12.0) * _FONT_LINE_FACTORS.get((_resolve_font_name(p) or "").lower(), _DEFAULT_LINE_FACTOR)
    above = line_pt * 0.78 - pt
    # A rule thicker than the blank above it (a 1pt-tall line holding a 1.5pt rule): Word draws it over
    # the line without making the line taller, so the block's own 1pt and border are taken back.
    below = line_pt * 0.22 if above > 0 else line_pt - 1 - pt
    parts = [
        f"border-bottom:{pt:g}pt solid {color}",
        "font-size:1pt",
        "line-height:1pt",
        f"padding-top:{round(max(above, 0.0), 1):g}pt",
        f"margin-bottom:{round(below, 1):g}pt",
    ]
    spacing = _paragraph_spacing_css(p)
    before = next((part for part in spacing.split("; ") if part.startswith("margin-top")), None)
    parts.append(before if (space_before and before) else "margin-top:0")
    indent = _paragraph_indent_css(p)
    match = re.search(r"margin-left:\s*([\d.]+)px", indent)
    left_px = float(match.group(1)) if match else 0.0
    if match:
        parts.append(f"margin-left:{left_px:g}px")
    try:
        section = p.part.document.sections[0]
        column_px = (section.page_width - section.left_margin - section.right_margin) / EMU_PER_PX
        spare = column_px - left_px - length / EMU_PER_PX
        if spare > 4:
            if _get_paragraph_alignment(p) == "center" and not match:
                parts.extend([f"margin-left:{round(spare / 2, 1)}px", f"margin-right:{round(spare / 2, 1)}px"])
            else:
                parts.append(f"margin-right:{round(spare, 1)}px")
    except Exception:
        pass
    return f'<p class="rule-line" style="{"; ".join(parts)};"></p>'


def _strip_leading_breaks(html: str) -> str:
    """Remove the line breaks and empty spans Word puts right after an inline drawing.

    A break can sit inside the first span of the text that follows, so breaks are
    removed both at the very start and directly after opening span tags.
    """
    html = re.sub(r"^(?:\s|<br\s*/?>|<span[^>]*>\s*</span>)+", "", html)
    previous = None
    while previous != html:
        previous = html
        html = re.sub(r"^((?:<span[^>]*>)*)(?:\s|<br\s*/?>)+", r"\1", html)
    return html


def _is_dark_hex(hex_str: str) -> bool:
    """Check if a hex color is dark (luminance < 128) to ensure high text contrast."""
    if not hex_str:
        return False
    try:
        h = hex_str.lstrip("#")
        if len(h) == 6:
            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            return lum < 128
        if len(h) == 3:
            r, g, b = int(h[0] * 2, 16), int(h[1] * 2, 16), int(h[2] * 2, 16)
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            return lum < 128
    except Exception:
        pass
    return False


# Inline containers whose runs are real paragraph text: tracked insertions,
# smart tags, custom XML and simple fields (their cached result runs).
_INLINE_WRAPPER_TAGS = ("w:ins", "w:smartTag", "w:customXml", "w:fldSimple", "w:moveTo")

_M_OMATH = qn("m:oMath")
_M_OMATHPARA = qn("m:oMathPara")
# Children of a paragraph that carry no content of their own (they do not stop it being "only an equation").
_NEUTRAL_PARAGRAPH_CHILDREN = {qn("w:pPr"), qn("w:bookmarkStart"), qn("w:bookmarkEnd"), qn("w:proofErr")}


def _read_note_reference(run_el: Any, p: Paragraph) -> Optional[NoteReference]:
    """A footnote or endnote reference, numbered in reference order; its text is collected for the end
    of the document.

    The editor has no page-bottom note area, so notes follow the text in reference order. A note
    referenced twice keeps its first number. Paragraphs outside the body (headers, footers) never
    collect notes.
    """
    state = getattr(p.part, "_intellidocs_notes", None)
    if state is None:
        return None
    for tag, kind, fmt in (("w:footnoteReference", "footnote", "decimal"), ("w:endnoteReference", "endnote", "lowerRoman")):
        ref = run_el.find(qn(tag))
        if ref is None:
            continue
        note_id = ref.get(qn("w:id")) or ""
        numbers = state[kind]
        if note_id not in numbers:
            numbers[note_id] = len(numbers) + 1
        return NoteReference(kind=kind, number=numbers[note_id], number_format=fmt)
    return None


def _note_reference_html(run_el: Any, p: Paragraph) -> str:
    """A footnote or endnote reference as its number, raised."""
    ref = _read_note_reference(run_el, p)
    return _write_inline_html([ref]) if ref is not None else ""


def _notes_part_root(doc: docx.Document, kind: str) -> Optional[Any]:
    """The parsed footnotes.xml / endnotes.xml of the document, or None when it has none."""
    for rel in doc.part.rels.values():
        if rel.reltype.endswith(f"/{kind}s"):
            try:
                return parse_xml(rel.target_part.blob)
            except Exception:
                return None
    return None


def _notes_html(doc: docx.Document, doc_parts: Dict[str, bytes]) -> str:
    """The text of every referenced footnote and endnote, under "Notes" / "Endnotes", in reference order."""
    _STATE.last_notes_json = []
    state = getattr(doc.part, "_intellidocs_notes", None)
    if not state:
        return ""
    sections: List[str] = []
    for kind, heading, fmt in (("footnote", "Notes", "decimal"), ("endnote", "Endnotes", "lowerRoman")):
        if not state[kind]:
            continue
        root = _notes_part_root(doc, kind)
        if root is None:
            continue
        pieces: List[str] = []
        piece_nodes: List[Any] = []
        for note_id, number in state[kind].items():
            note = next((n for n in root.findall(qn(f"w:{kind}")) if n.get(qn("w:id")) == note_id), None)
            if note is None:
                continue
            written = []
            for pe in note.findall(qn("w:p")):
                html = _paragraph_to_html(Paragraph(pe, doc), doc_parts)
                if html:
                    written.append((html, _STATE.last_paragraph_nodes))
            if not written:
                continue
            paragraphs = [html for html, _ in written]
            label = f"<sup>{_format_number(fmt, number)}</sup> "
            paragraphs[0] = re.sub(r"(<p\b[^>]*>)", lambda m: m.group(1) + label, paragraphs[0], count=1)
            pieces.extend(paragraphs)
            nodes_list = [nodes for _, nodes in written]
            if all(nodes is not None for nodes in nodes_list) and paragraphs[0].startswith("<p"):
                nodes_list[0] = _with_note_label(nodes_list[0], _format_number(fmt, number))
            piece_nodes.extend(nodes_list)
        if pieces:
            sections.append(f'<p style="font-weight:600; margin-top:12px; margin-bottom:4px;">{heading}</p>' + "".join(pieces))
            title = _write_paragraph_json("font-weight:600; margin-top:12px; margin-bottom:4px;", None, [{"type": "text", "text": heading}])
            if _STATE.last_notes_json is not None:
                _STATE.last_notes_json = None if any(nodes is None for nodes in piece_nodes) else _STATE.last_notes_json + [title] + [n for nodes in piece_nodes for n in nodes]
    return "".join(sections)


def _read_inline_math(omath: Any) -> InlineMath:
    """An equation set inside a line of text, as LaTeX, or as its own text if it cannot be converted."""
    latex = omml.omath_to_latex(omath)
    return InlineMath(latex=latex, text=omml.linear_text(omath) if latex is None else "")


def _inline_math_html(omath: Any) -> str:
    """An equation set inside a line of text: the editor's inline math node, or its own text."""
    return _write_inline_html([_read_inline_math(omath)])


def _block_math_html(latex: str, number: Optional[str] = None) -> str:
    """A display equation: the editor's block math node, with its number when it has one."""
    number_attr = f' data-number="{_html_escape(number, quote=True)}"' if number else ""
    return f'<div data-type="block-math" data-latex="{_html_escape(latex, quote=True)}"{number_attr}></div>'


def _equation_paragraph_html(p: Paragraph) -> Optional[str]:
    """Display equation(s) when the paragraph is only math, else None.

    Word shows an equation that stands alone in its paragraph (or any m:oMathPara) as display math.
    A number may follow it after a tab, "(1)", or be typed inside it as "#(1)". A paragraph with
    other text, or an equation that cannot be converted, stays an ordinary paragraph (inline math or
    the equation's own text).
    """
    maths: List[Any] = []
    after: List[str] = []
    for child in p._p:
        if child.tag in _NEUTRAL_PARAGRAPH_CHILDREN:
            continue
        if child.tag == _M_OMATH:
            maths.append(child)
        elif child.tag == _M_OMATHPARA:
            maths.extend(child.findall(_M_OMATH))
        elif child.tag == qn("w:r") and child.find(qn("w:drawing")) is None and child.find(qn("w:pict")) is None:
            after.append("".join(t.text or "" for t in child.findall(qn("w:t"))))
        else:
            return None
    if not maths:
        return None
    latexes = [omml.omath_to_latex(m) for m in maths]
    if any(latex is None for latex in latexes):
        return None
    number: Optional[str] = None
    text = "".join(after).strip()
    if text:
        found = omml.EQUATION_NUMBER.fullmatch(text)
        if found is None or len(maths) != 1:
            return None
        number = found.group(1)
    blocks = []
    for latex in latexes:
        body, typed = omml.split_equation_number(latex or "")
        blocks.append(_block_math_html(body, number or typed))
    return "".join(blocks)


def _read_inline(p: Paragraph, doc_parts: Dict[str, bytes]) -> List[Inline]:
    """A paragraph's content as the document model: runs, breaks, pictures, links, equations and note
    references, in order (content controls and inline wrappers are read through)."""
    items: List[Inline] = []
    wrapper_tags = {qn(tag) for tag in _INLINE_WRAPPER_TAGS}
    row = _anchored_row(p._element, doc_parts)

    def br(element: Any) -> Inline:
        kind = element.get(qn("w:type"))
        return PageBreak() if kind == "page" else ColumnBreak() if kind == "column" else LineBreak()

    def walk(container: Any) -> None:
        for child in container:
            tag = child.tag
            if tag == qn("w:r"):
                run = Run(child, p)
                breaks = [br(element) for element in child.findall(qn("w:br"))]
                # A run's line and column breaks come before it; its page breaks lead its own content.
                items.extend(b for b in breaks if not isinstance(b, PageBreak))
                items.extend(b for b in breaks if isinstance(b, PageBreak))
                items.extend(_read_run_content(run, doc_parts, row))
                textboxes = _anchored_textboxes(child, p, doc_parts)
                if textboxes:
                    items.extend(_split_page_art(textboxes, "textboxes"))
                note = _read_note_reference(child, p)
                if note is not None:
                    items.append(note)
            elif tag == qn("w:hyperlink"):
                link = _read_hyperlink(child, p, doc_parts)
                if link is not None:
                    items.append(link)
            elif tag == qn("w:br"):
                items.append(br(child))
            elif tag == _M_OMATH:
                items.append(_read_inline_math(child))
            elif tag == _M_OMATHPARA:
                # Display math inside a paragraph that also holds other content: set as separate equations.
                for omath in child.findall(_M_OMATH):
                    latex = omml.omath_to_latex(omath)
                    if latex:
                        items.append(DisplayMath(*omml.split_equation_number(latex)))
                    else:
                        items.append(InlineMath(latex=None, text=omml.linear_text(omath)))
            elif tag == qn("w:sdt"):
                content = child.find(qn("w:sdtContent"))
                if content is not None:
                    walk(content)
            elif tag in wrapper_tags:
                walk(child)

    walk(p._element)
    return items


def _write_inline_html(items: List[Inline]) -> str:
    """A paragraph's content as the editor's HTML."""
    out: List[str] = []
    for item in items:
        if isinstance(item, TextRun):
            out.append(_write_run_html(item))
        elif isinstance(item, LineBreak):
            out.append("<br/>")
        elif isinstance(item, PageBreak):
            out.append(_PAGE_BREAK_HTML)
        elif isinstance(item, ColumnBreak):
            out.append(_COLUMN_MARK)
        elif isinstance(item, NoteReference):
            out.append(f"<sup>{_format_number(item.number_format, item.number)}</sup>")
        elif isinstance(item, InlineMath):
            if item.latex is None:
                out.append(_html_escape(item.text))
            else:
                out.append(f'<span data-type="inline-math" data-latex="{_html_escape(item.latex, quote=True)}"></span>')
        elif isinstance(item, DisplayMath):
            out.append(_block_math_html(item.latex, item.number))
        elif isinstance(item, (Fragment, PageArt, Picture)):
            out.append(item.html)
        elif isinstance(item, DrawnLine):
            out.append(_LINE_MARK)
        elif isinstance(item, Hyperlink):
            inner = _write_inline_html(list(item.content))
            if inner:
                target = ' target="_blank" rel="noopener noreferrer"' if item.url.startswith("http") else ""
                out.append(f'<a href="{item.url}"{target}>{inner}</a>')
    return "".join(out)


# ─── The editor's JSON (Stage 2a.3) ───────────────────────────────────────────
#
# The converter writes the editor's own JSON from the document model, so an import no longer depends on
# the editor parsing HTML. It must equal what the editor makes of the HTML today
# (tests/e2e/tools/editor_json_reference.py check --json), so these mirror the editor's parse rules:
# frontend TiptapEditor.tsx (filterStyle, CustomParagraph), IndentExtension, TabStop, @tiptap
# text-style/highlight, and ProseMirror's whitespace handling. Paragraphs only so far: anything else
# returns None and stays HTML.

# The editor schema's mark order (ProseMirror sorts a node's marks by it).
_MARK_RANK = ["link", "textStyle", "bold", "code", "italic", "strike", "underline", "subscript", "superscript", "highlight"]

# frontend ALLOWED_STYLE_PROPS: the CSS a paragraph's `style` attribute keeps.
_EDITOR_STYLE_PROPS = {
    "color", "background-color", "background", "text-align", "font-weight", "font-style", "font-size", "font-family",
    "margin-top", "margin-bottom", "margin-left", "margin-right", "padding-top", "padding-bottom", "padding-left",
    "padding-right", "border", "border-top", "border-bottom", "border-left", "border-right", "border-color",
    "border-width", "border-style", "vertical-align", "line-height", "text-decoration", "white-space", "word-wrap",
    "overflow-wrap", "text-indent",
}

_HEADING_ATTRS: Dict[str, Any] = {
    "tabStops": None, "defaultTab": None, "generated": None, "indent": 0, "textAlign": None, "level": 1,
    "styleSource": None, "docRole": None, "style": None, "overlay": None, "guide": None, "guideText": None,
    "guideGroup": None,
}

_PARAGRAPH_ATTRS: Dict[str, Any] = {
    "tabStops": None, "defaultTab": None, "captionKind": None, "generated": None, "indent": 0, "textAlign": None,
    "styleSource": None, "style": None, "overlay": None, "guide": None, "guideText": None, "guideGroup": None,
}

_WHITESPACE = re.compile(r"[ \t\r\n\u000c]+")


# frontend CELL_STYLE_PROPS: what a table cell keeps beyond the paragraph list.
_EDITOR_CELL_STYLE_PROPS = {"min-height", "padding"}


def _editor_style(raw: str, extra: Set[str] = frozenset()) -> Optional[str]:
    """frontend filterStyle: the declarations the editor keeps, as written."""
    kept = []
    for decl in raw.split(";"):
        trimmed = decl.strip()
        colon = trimmed.find(":")
        if trimmed and colon >= 1 and (trimmed[:colon].strip().lower() in _EDITOR_STYLE_PROPS or trimmed[:colon].strip().lower() in extra):
            kept.append(trimmed)
    return "; ".join(kept) if kept else None


def _style_value(raw: str, prop: str) -> Optional[str]:
    """@tiptap/core getStyleProperty: the last declaration of a property, as written."""
    for decl in reversed([d.strip() for d in raw.split(";") if d.strip()]):
        colon = decl.find(":")
        if colon != -1 and decl[:colon].strip().lower() == prop:
            return decl[colon + 1 :].strip()
    return None


def _cssom_length(value: Optional[str]) -> Optional[str]:
    """A length as the browser's CSS object model gives it back ("11.0pt" is "11pt")."""
    if value is None:
        return None
    found = re.fullmatch(r"(-?[\d.]+)([a-z%]*)", value.strip())
    return f"{float(found.group(1)):g}{found.group(2)}" if found else value.strip()


def _run_marks(props: RunProps) -> List[Dict[str, Any]]:
    """The editor marks of a run, in schema order."""
    marks: Dict[str, Dict[str, Any]] = {}
    styles = _run_styles(props)
    if styles:
        raw = "; ".join(styles)
        marks["textStyle"] = {"type": "textStyle", "attrs": {
            "color": (_style_value(raw, "color") or "").replace("'", "").replace('"', ""),
            "fontFamily": _style_value(raw, "font-family") or "",
            "fontSize": _cssom_length(_style_value(raw, "font-size")) or "",
            "letterSpacing": _cssom_length(_style_value(raw, "letter-spacing")),
        }}
    for flag in ("bold", "italic", "underline", "strike", "subscript", "superscript"):
        if getattr(props, flag):
            marks[flag] = {"type": flag}
    if props.highlight:
        marks["highlight"] = {"type": "highlight", "attrs": {"color": props.highlight}}
    return [marks[name] for name in _MARK_RANK if name in marks]


_TIPTAP_REMOVED_TEXT = re.compile(r"\n\s\s|\n")


def _write_inline_json(items: List[Inline], implicit: bool = False, lines: str = "split") -> Optional[List[Dict[str, Any]]]:
    """A paragraph's content as editor JSON nodes, normalised the way ProseMirror parses HTML: spaces
    collapse; a space is dropped at the start of the paragraph, after a space, or straight after a <br>
    (only when the text is not inside a span); the paragraph's trailing space is removed; neighbouring
    text with the same marks is one node. None when the content holds something not written yet.

    `implicit`: the content of a paragraph ProseMirror opened itself (text the HTML parser left outside
    any paragraph, after a page break): it drops no leading space at all.

    `lines`: what a drawn line is here. "split": the body paragraph writer splits at lines first, so
    one left is not written; "drop": a list item's paragraph removes them; "text": a table cell keeps
    the marker character itself (the cell writer never turns it into a rule)."""
    nodes: List[Dict[str, Any]] = []
    joins_bare = [False]  # the last thing written was bare text, which the next bare text joins in the DOM

    def add_text(text: str, marks: List[Dict[str, Any]], bare: bool) -> None:
        # TipTap's elementFromString removes a DOM text node that is only a newline (or a newline and two
        # spaces) before ProseMirror reads the HTML.
        joined = bare and joins_bare[0]
        joins_bare[0] = bare
        if not joined and _TIPTAP_REMOVED_TEXT.fullmatch(text):
            joins_bare[0] = False
            return
        text = _WHITESPACE.sub(" ", text)
        if text.startswith(" ") and not implicit:
            before = nodes[-1] if nodes else None
            if (
                before is None
                or (before["type"] == "text" and _WHITESPACE.search(before["text"][-1:]))
                or (bare and before["type"] == "hardBreak")
            ):
                text = text[1:]
        if not text:
            return
        if nodes and nodes[-1]["type"] == "text" and nodes[-1].get("marks") == (marks or None):
            nodes[-1]["text"] += text
        else:
            nodes.append({"type": "text", "text": text, **({"marks": marks} if marks else {})})

    def add(items: List[Inline], link: Optional[Dict[str, Any]]) -> bool:
        for item in items:
            if isinstance(item, TextRun):
                marks = _run_marks(item.props)
                if link:
                    marks = [link] + marks
                # A run without formatting is written as bare text, straight after whatever precedes it.
                bare = not marks
                for index, segment in enumerate(_run_segments(item)):
                    if index:
                        nodes.append({"type": "tab", **({"marks": marks} if marks else {})})
                        bare = False
                        joins_bare[0] = False
                    add_text(segment, marks, bare)
            elif isinstance(item, LineBreak) and not link:
                nodes.append({"type": "hardBreak"})
                joins_bare[0] = False
            elif isinstance(item, ColumnBreak):
                continue  # only marks where a column ends; the paragraph itself is unchanged
            elif isinstance(item, PageArt) or (isinstance(item, Fragment) and not item.html):
                continue  # drawn by the page layout (the page layout pass takes it out of the body)
            elif isinstance(item, DrawnLine) and lines != "split":
                if lines == "text":
                    add_text(_LINE_MARK, [], True)
            elif isinstance(item, NoteReference) and not link:
                add_text(_format_number(item.number_format, item.number), [{"type": "superscript"}], False)
            elif isinstance(item, InlineMath) and not link:
                if item.latex is None:
                    add_text(item.text, [], True)
                else:
                    nodes.append({"type": "inlineMath", "attrs": {"latex": item.latex}})
                    joins_bare[0] = False
            elif isinstance(item, Hyperlink) and not link:
                if not _write_inline_html(list(item.content)):
                    continue
                web = item.url.startswith("http")
                mark = {"type": "link", "attrs": {
                    "href": item.url,
                    "target": "_blank",
                    # The link extension's own rel unless the converter wrote one (web addresses).
                    "rel": "noopener noreferrer" if web else "noopener noreferrer nofollow",
                    "class": None,
                    "title": None,
                }}
                if not add(list(item.content), mark):
                    return False
            else:
                return False
        return True

    if not add(items, None):
        return None
    if nodes and nodes[-1]["type"] == "text":
        nodes[-1]["text"] = nodes[-1]["text"].rstrip(" \t\r\n\u000c")
        if not nodes[-1]["text"]:
            nodes.pop()
    return nodes


def _with_note_label(nodes: List[Dict[str, Any]], number: str) -> List[Dict[str, Any]]:
    """A note's first paragraph with its number in front (<sup>n</sup> and a space), as ProseMirror
    reads it: the paragraph's own leading space goes after that space, and bare text joins it."""
    first = dict(nodes[0])
    content = [dict(node) for node in first.get("content", [])]
    if content and content[0]["type"] == "text" and content[0]["text"].startswith(" "):
        content[0]["text"] = content[0]["text"][1:]
        if not content[0]["text"]:
            content.pop(0)
    label = [{"type": "text", "text": number, "marks": [{"type": "superscript"}]}, {"type": "text", "text": " "}]
    if content and content[0]["type"] == "text" and not content[0].get("marks"):
        label[1] = {"type": "text", "text": " " + content.pop(0)["text"]}
    first["content"] = label + content
    return [first] + nodes[1:]


def _js_numbers(value: Any) -> Any:
    """JSON as JavaScript writes it: one number type, so 48.0 is 48."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list):
        return [_js_numbers(item) for item in value]
    if isinstance(value, dict):
        return {key: _js_numbers(item) for key, item in value.items()}
    return value


def _document_json(doc: docx.Document, hf: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """The editor's JSON of the whole document (None when part of it is not written yet): the body as
    its passes left it, then the notes, with every section break carrying its section's properties."""
    body = _body_nodes(_STATE.last_body_json or [])
    if body is None or _STATE.last_notes_json is None:
        return None
    content = body + _STATE.last_notes_json
    if not _is_pdf(doc):
        sections = list(doc.sections)
        described = {entry["index"]: entry for entry in hf.get("sections", [])}
        for node in content:
            index = (node.get("attrs") or {}).get("section")
            if node["type"] in ("pageBreak", "sectionMark") and isinstance(index, int) and index < len(sections):
                node["attrs"]["sectionProps"] = _section_props(sections[index], described.get(index, {}))
    return _js_numbers({"type": "doc", "content": content})


def _block_style_marks(style: str) -> List[Dict[str, Any]]:
    """Marks the editor's Bold and Italic parse rules give everything inside a block whose own style says
    so (a heading styled font-weight:bold has all its text bold)."""
    marks = []
    weight = _style_value(style, "font-weight") if style else None
    if weight and re.fullmatch(r"bold(er)?|[5-9]\d{2,}", weight):
        marks.append({"type": "bold"})
    if style and _style_value(style, "font-style") == "italic":
        marks.append({"type": "italic"})
    return marks


def _with_block_marks_deep(nodes: List[Dict[str, Any]], style: str) -> List[Dict[str, Any]]:
    """Blocks with an enclosing element's style marks added to all the text inside them."""
    if not _block_style_marks(style):
        return nodes
    out = []
    for node in nodes:
        children = node.get("content")
        if children and any(child["type"] in ("text", "tab") for child in children):
            node = {**node, "content": _with_block_marks(children, style)}
        elif children:
            node = {**node, "content": _with_block_marks_deep(children, style)}
        out.append(node)
    return out


def _with_block_marks(content: List[Dict[str, Any]], style: str) -> List[Dict[str, Any]]:
    """Content with its block's style marks added, neighbouring text with equal marks merged again."""
    extra = _block_style_marks(style)
    if not extra:
        return content
    out: List[Dict[str, Any]] = []
    for node in content:
        if node["type"] in ("text", "tab"):
            present = {m["type"] for m in node.get("marks", [])}
            marks = node.get("marks", []) + [m for m in extra if m["type"] not in present]
            marks.sort(key=lambda m: _MARK_RANK.index(m["type"]))
            node = {**node, "marks": marks}
        if out and node["type"] == "text" and out[-1]["type"] == "text" and out[-1].get("marks") == node.get("marks"):
            out[-1] = {**out[-1], "text": out[-1]["text"] + node["text"]}
        else:
            out.append(node)
    return out


def _overlay_ids(items: List[Inline]) -> Optional[str]:
    """The `overlay` a paragraph gets: the ids of the page art hung beside it, in order."""
    ids = [str(item.overlay_id) for item in items if isinstance(item, PageArt) and item.overlay_id is not None]
    return " ".join(ids) if ids else None


def _with_overlay(nodes: Optional[List[Dict[str, Any]]], items: List[Inline]) -> Optional[List[Dict[str, Any]]]:
    """The page layout pass tags the block a box sits in, which opens with the paragraph's own tag."""
    overlay = _overlay_ids(items)
    if nodes and overlay and nodes[0]["type"] in ("paragraph", "heading"):
        nodes[0]["attrs"]["overlay"] = overlay
    return nodes


def _write_paragraph_json(
    style: str,
    tab_attrs: Optional[Tuple[str, str]],
    content: List[Dict[str, Any]],
    heading_level: Optional[int] = None,
) -> Dict[str, Any]:
    """A paragraph (or heading) node with the attributes the editor reads from its HTML."""
    attrs = dict(_PARAGRAPH_ATTRS if heading_level is None else _HEADING_ATTRS)
    if heading_level is not None:
        attrs["level"] = heading_level
    attrs["style"] = _editor_style(style) if style else None
    align = _style_value(style, "text-align") if style else None
    attrs["textAlign"] = align if align in ("left", "center", "right", "justify") else None
    margin = _cssom_length(_style_value(style, "margin-left")) if style else None
    found = re.match(r"-?\d+", margin or "0px")
    # JavaScript has one number type: 48 / 24 is 2, which JSON writes as 2, not 2.0.
    indent = int(found.group(0)) / 24 if found and int(found.group(0)) else 0
    attrs["indent"] = int(indent) if float(indent).is_integer() else indent
    if tab_attrs:
        attrs["tabStops"], attrs["defaultTab"] = tab_attrs
    node: Dict[str, Any] = {"type": "paragraph" if heading_level is None else "heading", "attrs": attrs}
    content = _with_block_marks(content, style)
    if content:
        node["content"] = content
    return node


def _image_container_style(alignment: str, width: Optional[int]) -> str:
    """frontend imageContainerStyle: the image box's CSS when the HTML gives none."""
    sizing = f"width: {width}px; height: auto; cursor: pointer;" if width else "cursor: pointer;"
    return {
        "left": f"{sizing} margin: 0 auto 0 0;",
        "right": f"{sizing} margin: 0 0 0 auto;",
        "float": f"{sizing} margin: 0.5rem 0 1rem 1.5rem; float: left;",
    }.get(alignment, f"{sizing} margin: 0 auto;")


def _picture_json(picture: Picture) -> Dict[str, Any]:
    """A picture as the editor's image node (imageResize)."""
    return {"type": "imageResize", "attrs": {
        "span": None, "src": picture.src, "alt": None, "title": None, "width": picture.width, "height": None,
        "containerStyle": picture.container_style or _image_container_style(picture.alignment, picture.width),
        "wrapperStyle": "display: flex; margin: 0;", "alignment": picture.alignment, "caption": None, "wrapMode": None,
    }}


def _write_picture_split_json(
    items: List[Inline],
    style: str,
    tab_attrs: Optional[Tuple[str, str]],
    heading_level: Optional[int],
    lines: str = "split",
) -> Optional[List[Dict[str, Any]]]:
    """A paragraph with pictures in its text, as the editor holds it: the picture is a block, so the
    paragraph ends at it and the text after it is a paragraph of its own. That paragraph keeps the
    source paragraph's style (its alignment, spacing and indent): a caption written in the picture's
    own paragraph stays centered (_split_paragraph_at_pictures writes the HTML the same way). In a
    heading the text after the picture is a plain paragraph with the heading's style marks, as
    ProseMirror splits it."""
    segments: List[List[Inline]] = [[]]
    pictures: List[Picture] = []
    for item in items:
        if isinstance(item, Picture):
            pictures.append(item)
            segments.append([])
        else:
            segments[-1].append(item)
    first = _write_inline_json(segments[0], lines=lines)
    if first is None:
        return None
    nodes = [_write_paragraph_json(style, tab_attrs, first, heading_level=heading_level)]
    for picture, segment in zip(pictures, segments[1:]):
        nodes.append(_picture_json(picture))
        content = _write_inline_json(segment, implicit=True, lines=lines)
        if content is None:
            return None
        if content and not _whitespace_only(content):
            if heading_level is None:
                nodes.append(_write_paragraph_json(style, tab_attrs, content))
            else:
                nodes.append(_write_paragraph_json("", None, _with_block_marks(content, style)))
    return nodes


_IMG_TAG = re.compile(r"(<img\s[^>]*/>)")
_VOID_TAGS = {"br", "img", "hr", "wbr"}


def _balanced(fragment: str) -> bool:
    """Whether every element opened in an HTML fragment is closed in it (no picture inside a span)."""
    depth = 0
    for match in re.finditer(r"<(/?)([a-zA-Z][\w-]*)[^>]*?(/?)>", fragment):
        closing, name, self_closing = match.groups()
        if self_closing or name.lower() in _VOID_TAGS:
            continue
        depth += -1 if closing else 1
        if depth < 0:
            return False
    return depth == 0


def _split_paragraph_at_pictures(open_tag: str, inner: str) -> Optional[str]:
    """A paragraph holding pictures and text, written as the editor will hold it: the paragraph up to
    the picture, the picture, then each run of text after a picture in a paragraph with the same
    open tag (style). Without this the editor drops the style of the text after the picture, and a
    caption written in its picture's paragraph loses its centering. None when there is nothing to
    split (no text after a picture) or the picture is not a top-level <img> (wrapped, page art, or
    inside an element)."""
    if "<img " not in inner or "data-wrap-" in inner or "<page-art" in inner:
        return None
    parts = _IMG_TAG.split(inner)
    if len(parts) < 3 or not all(_balanced(part) for part in parts[0::2]):
        return None

    def has_content(fragment: str) -> bool:
        return bool(re.sub(r"<[^>]+>", "", fragment).strip(" ")) or "<br" in fragment or "data-type=" in fragment

    if not any(has_content(part) for part in parts[2::2]):
        return None
    out = [f"{open_tag}{parts[0]}</p>"]
    for picture, after in zip(parts[1::2], parts[2::2]):
        out.append(picture)
        if has_content(after):
            out.append(f"{open_tag}{after}</p>")
    return "".join(out)


def _without_inline_icons(items: List[Inline], inner: str) -> List[Inline]:
    """_drop_inline_icons on the model: pictures 24px wide or less go when the paragraph has text."""
    if not re.sub(r"<[^>]+>", "", inner).strip():
        return items
    return [item for item in items if not (isinstance(item, Picture) and item.width is not None and item.width <= 24)]


_PAGE_BREAK_JSON: Dict[str, Any] = {"type": "pageBreak", "attrs": {"height": 0, "section": None, "sectionProps": None}}


def _block_json(item: Inline) -> Dict[str, Any]:
    """A page break or display equation as the editor node it becomes."""
    if isinstance(item, PageBreak):
        return json.loads(json.dumps(_PAGE_BREAK_JSON))
    assert isinstance(item, DisplayMath)
    return {"type": "blockMath", "attrs": {"latex": item.latex, "number": item.number, "span": None}}


def _whitespace_only(nodes: List[Dict[str, Any]]) -> bool:
    return all(node["type"] == "text" and not node["text"].strip(" ") for node in nodes)


def _write_split_paragraph_json(
    items: List[Inline],
    style: str,
    tab_attrs: Optional[Tuple[str, str]],
    heading_level: Optional[int],
) -> Optional[List[Dict[str, Any]]]:
    """The editor nodes of a paragraph that holds page breaks or display equations, as the HTML the
    converter writes for it parses today.

    A <hr> or <div> closes an open <p> (HTML parsing rules): the text after it lands in a paragraph
    ProseMirror opens itself, with no attributes, and the paragraph's own </p> then opens one more,
    empty. Inside a heading they do not close it; ProseMirror splits it, and the text after the break
    becomes a paragraph that keeps the heading's style marks. (Word keeps one paragraph with one style:
    reproduced here so imports do not change; removing it is a deliberate, measured step.)
    """
    segments: List[List[Inline]] = [[]]
    blocks: List[Inline] = []
    for item in items:
        if isinstance(item, (PageBreak, DisplayMath)):
            blocks.append(item)
            segments.append([])
        else:
            segments[-1].append(item)
    first = _write_inline_json(segments[0])
    if first is None:
        return None
    nodes = [_write_paragraph_json(style, tab_attrs, first, heading_level=heading_level)]
    for block, segment in zip(blocks, segments[1:]):
        nodes.append(_block_json(block))
        content = _write_inline_json(segment, implicit=True)
        if content is None:
            return None
        if content and not _whitespace_only(content):
            if heading_level is not None:
                content = _with_block_marks(content, style)
            nodes.append(_write_paragraph_json("", None, content))
    if heading_level is None:
        nodes.append(_write_paragraph_json("", None, []))
    return nodes


# A block the JSON writer does not write yet (as opposed to None: a block that writes nothing).
_NOT_WRITTEN = object()

logger = logging.getLogger(__name__)

# When set, the conversion also returns the editor's JSON of the whole document (`content_json`),
# built alongside the HTML from the same read: every pass that reshapes the body's HTML reshapes its
# JSON the same way. The editor loads it in place of parsing the HTML (Stage 2a).
_BUILD_JSON = True



class _ConversionState(threading.local):
    """What the HTML writers hand the JSON writer during one conversion. Per thread: the ML service
    converts in a thread pool, so two imports at once must not see each other's nodes."""

    def __init__(self) -> None:
        # The editor nodes of the last body paragraph _paragraph_to_html wrote (None: not written), of
        # the whole body once _write_body_html is done, and of the notes (None: not written).
        self.last_paragraph_nodes: Optional[List[Dict[str, Any]]] = None
        self.last_body_json: Optional[List[Any]] = None
        self.last_notes_json: Optional[List[Dict[str, Any]]] = []
        # The last list paragraph the HTML writer wrote: its content and style (None when it wrote no
        # paragraph), so the list's JSON is built from the same read.
        self.last_list_paragraph: Optional[Tuple[List[Inline], Optional[str]]] = None
        # The body (not a header, footer or note) is being written.
        self.in_body = False
        # The body paragraphs being written belong to a table of contents (or a list of tables or
        # figures), whose entries get dot leaders (see _toc_region_step).
        self.in_toc = False


_STATE = _ConversionState()

# While measuring, every table the body holds at the top level is recorded here: its node, or None.
_JSON_TABLE_SINK: Optional[List[Optional[Dict[str, Any]]]] = None

# While measuring, every list the body opens at the top level is recorded here (its node is filled in
# as its items arrive; None when an item holds content the JSON writer does not write yet).
_JSON_LIST_SINK: Optional[List[Dict[str, Any]]] = None


def _list_item_json(attrs: Dict[str, Any]) -> Dict[str, Any]:
    """A list item node; its paragraph and nested lists are added as the body is read."""
    return {"type": "listItem", "attrs": attrs, "content": []}


def _close_list_item_json(item: Dict[str, Any]) -> None:
    """A list item must start with a paragraph: ProseMirror opens an empty one when the HTML has none."""
    if not item["content"] or item["content"][0]["type"] != "paragraph":
        item["content"].insert(0, _write_paragraph_json("", None, []))


# While editor_json_reference.py measures the JSON writer, the body's paragraphs are recorded here, in
# order, as (plain text, the editor nodes it becomes, or None when not written yet). None the rest of
# the time. The paragraph's HTML is recorded with it so the measurement can pair it with the right
# reference paragraph.
_JSON_SINK: Optional[List[Tuple[str, Optional[List[Dict[str, Any]]]]]] = None
_JSON_SINK_HTML: Optional[List[str]] = None


def _record_paragraph_json(p: Paragraph, items: List[Inline]) -> None:
    if _JSON_SINK is None or not _STATE.in_body:
        return
    _JSON_SINK.append(_paragraph_json(p, items))


def _paragraph_json(p: Paragraph, items: List[Inline]) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
    """A body paragraph as editor JSON nodes, with its text: split at its drawn lines first, as
    _paragraph_to_html_from_items does, each piece then as _paragraph_html_from_inner decides."""
    text = "".join(item.text for item in items if isinstance(item, TextRun))
    if not any(isinstance(item, DrawnLine) for item in items):
        return _paragraph_piece_json(p, items)
    lines = _line_shapes_in(p._p)
    chunks: List[List[Inline]] = [[]]
    for item in items:
        if isinstance(item, DrawnLine):
            chunks.append([])
        else:
            chunks[-1].append(item)
    nodes: List[Dict[str, Any]] = []
    for index, chunk in enumerate(chunks):
        if index > 0:
            line = lines[index - 1] if index - 1 < len(lines) else (5486400, 9525, "#000000")
            rule = re.search(r'style="([^"]*)"', _line_paragraph_html(p, line, space_before=not nodes))
            nodes.append(_write_paragraph_json(rule.group(1) if rule else "", None, []))
            # Word's line breaks (and blank runs) right after a drawing are dropped with it.
            while chunk and (isinstance(chunk[0], LineBreak) or (isinstance(chunk[0], TextRun) and not chunk[0].text.strip())):
                chunk = chunk[1:]
        html = _write_inline_html(chunk)
        if re.sub(r"<(?!img)[^>]+>", "", html).strip():
            piece = _paragraph_piece_json(p, chunk)[1]
            if piece is None:
                return text, None
            nodes.extend(piece)
        elif index == 0:
            # Line breaks before a line are empty lines above it.
            for _ in range(len(re.findall(r"<br\s*/?>", html))):
                nodes.extend(_paragraph_piece_json(p, [])[1] or [])
    return text, nodes


def _paragraph_piece_json(p: Paragraph, items: List[Inline]) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
    """A paragraph (or one piece of it) as editor JSON nodes, deciding as _paragraph_html_from_inner does."""
    text = "".join(item.text for item in items if isinstance(item, TextRun))
    inner = _write_inline_html(items)
    props = _read_paragraph_props(p)
    font_css = _write_font_css(props.font_size_pt)
    spacing_css = _write_spacing_css(props.spacing, props.font_name)
    # A blank line is what writes no HTML: a space inside a styled run still writes its span, so that
    # paragraph keeps its alignment and indent.
    if not inner.strip():
        style = "; ".join(filter(None, [font_css, spacing_css]))
        return text, [_write_paragraph_json(style, None, [])]
    # Only page breaks, or only display equations: bare blocks, no paragraph around them.
    if re.fullmatch(r"(<hr[^>]*/>\s*)+", inner) or re.fullmatch(r'(<div data-type="block-math"[^>]*></div>\s*)+', inner):
        return text, [_block_json(item) for item in items if isinstance(item, (PageBreak, DisplayMath))]
    align = f"text-align:{props.alignment};" if props.alignment != "left" else ""
    indent_css = _write_indent_css(props.indent)
    heading = _heading_kind(props.style_name)
    if heading is not None:
        level, size, margin, weight, italic = heading
        style, tabs, heading_level = _heading_css(font_css, spacing_css, align, indent_css, size, margin, weight, italic), None, level
    else:
        css = "; ".join(part.rstrip("; ") for part in filter(None, [align, font_css, spacing_css, indent_css])).strip()
        style, heading_level = (f"{css};" if css else ""), None
        tabs = (json.dumps(_paragraph_tab_stops(p), separators=(",", ":")), str(_default_tab_px(p))) if "data-tab" in inner else None
    if any(isinstance(item, Picture) for item in items):
        items = _without_inline_icons(items, inner)
    pictures = [item for item in items if isinstance(item, Picture)]
    if any(picture.wraps for picture in pictures):
        # The wrap pass moves the picture out ahead of its paragraph when it opens it, then groups them.
        if len(pictures) == 1 and items and items[0] is pictures[0] and heading is None:
            rest = _write_inline_json(items[1:])
            if rest is None:
                return text, None
            return text, [_picture_json(pictures[0]), _write_paragraph_json(style, tabs, rest)]
        return text, None
    if pictures and re.fullmatch(r"<img\s[^>]+/>", _write_inline_html(items).strip()):
        return text, [_picture_json(pictures[0])]  # a paragraph that is only a picture is the picture
    if pictures and any(isinstance(item, (PageBreak, DisplayMath)) for item in items):
        return text, None
    if pictures:
        nodes = _write_picture_split_json(items, style, tabs, heading_level)
    elif any(isinstance(item, (PageBreak, DisplayMath)) for item in items):
        nodes = _write_split_paragraph_json(items, style, tabs, heading_level)
    else:
        content = _write_inline_json(items)
        nodes = None if content is None else [_write_paragraph_json(style, tabs, content, heading_level=heading_level)]
    nodes = _with_overlay(nodes, items)
    if nodes is None:
        return text, None
    # The text as the editor holds it (links, note numbers and all).
    written = "".join(child.get("text", "") for node in nodes for child in node.get("content", []))
    return written or text, nodes


def _paragraph_inner_html(p: Paragraph, doc_parts: Dict[str, bytes]) -> str:
    """Build the inner HTML (runs + hyperlinks + page breaks + images) of a paragraph."""
    return _write_inline_html(_read_inline(p, doc_parts))


def _read_hyperlink(hyperlink_el: Any, p: Paragraph, doc_parts: Dict[str, bytes]) -> Optional[Hyperlink]:
    """A <w:hyperlink> as the document model: its target and its runs (None when it cannot be read)."""
    try:
        r_id = hyperlink_el.get(qn("r:id"))
        url = "#"
        if r_id:
            try:
                url = p.part.rels[r_id].target_ref
            except Exception:
                url = "#"
        content: List[Inline] = []
        for r in hyperlink_el.findall(qn("w:r")):
            content.extend(_read_run_content(Run(r, p), doc_parts))
        return Hyperlink(url=url, content=tuple(content))
    except Exception:
        return None


def _hyperlink_html(hyperlink_el: Any, p: Paragraph, doc_parts: Dict[str, bytes]) -> str:
    """Render a <w:hyperlink> element as an <a> tag with its styled run text."""
    link = _read_hyperlink(hyperlink_el, p, doc_parts)
    return _write_inline_html([link]) if link is not None else ""


def _resolve_pPr_attr(p: Paragraph, tag: str, attr: str) -> Optional[str]:
    """Resolve one attribute of a paragraph property (w:spacing, w:ind) like Word.

    Precedence: the paragraph's own property, then its style chain, then the
    document defaults. Returns None when the attribute is set nowhere.
    """
    pPr = p._element.pPr
    if pPr is not None:
        el = pPr.find(qn(f"w:{tag}"))
        if el is not None and el.get(qn(f"w:{attr}")) is not None:
            return el.get(qn(f"w:{attr}"))

    try:
        style = p.style
    except Exception:
        style = None
    seen: Set[str] = set()
    while style is not None and style.style_id not in seen:
        seen.add(style.style_id)
        style_pPr = style.element.find(qn("w:pPr"))
        el = style_pPr.find(qn(f"w:{tag}")) if style_pPr is not None else None
        if el is not None and el.get(qn(f"w:{attr}")) is not None:
            return el.get(qn(f"w:{attr}"))
        style = style.base_style

    try:
        defaults = p.part.styles.element.find(qn("w:docDefaults"))
        if defaults is not None:
            pPr_default = defaults.find(qn("w:pPrDefault"))
            if pPr_default is not None:
                default_pPr = pPr_default.find(qn("w:pPr"))
                el = default_pPr.find(qn(f"w:{tag}")) if default_pPr is not None else None
                if el is not None:
                    return el.get(qn(f"w:{attr}"))
    except Exception:
        pass
    return None


def _resolve_pPr_flag(p: Paragraph, tag: str) -> bool:
    """Resolve an on/off paragraph property (w:pageBreakBefore ...): paragraph, then style chain."""
    def state(ppr: Any) -> Optional[bool]:
        el = ppr.find(qn(f"w:{tag}")) if ppr is not None else None
        if el is None:
            return None
        return el.get(qn("w:val")) not in ("0", "false", "off")

    direct = state(p._element.pPr)
    if direct is not None:
        return direct
    try:
        style = p.style
    except Exception:
        style = None
    seen: Set[str] = set()
    while style is not None and style.style_id not in seen:
        seen.add(style.style_id)
        inherited = state(style.element.find(qn("w:pPr")))
        if inherited is not None:
            return inherited
        style = style.base_style
    return False


def _paragraph_page_break_before(p: Paragraph) -> bool:
    """Whether Word starts this paragraph on a new page ("page break before", e.g. chapter headings)."""
    return _resolve_pPr_flag(p, "pageBreakBefore")


def _default_tab_px(p: Paragraph) -> float:
    """Word's default tab interval (settings.xml defaultTabStop, twips) in px; 0.5in when unset."""
    cached = getattr(p.part, "_intellidocs_default_tab_px", None)
    if cached is not None:
        return cached
    value = 48.0
    try:
        el = p.part.document.settings.element.find(qn("w:defaultTabStop"))
        if el is not None and el.get(qn("w:val")):
            value = round(int(el.get(qn("w:val"))) * TWIPS_PER_PX, 2)
    except Exception:
        pass
    try:
        setattr(p.part, "_intellidocs_default_tab_px", value)
    except Exception:
        pass
    return value


# The label that opens a table of contents, a list of tables or a list of figures.
_TOC_LABEL = re.compile(r"^(table\s+of\s+contents|contents|list\s+of\s+(tables|figures|illustrations|abbreviations|appendices))\s*:?$", re.IGNORECASE)
# A table-of-contents entry: text, a tab, then a page number (arabic or roman).
_TOC_ENTRY = re.compile(r"\S.*\t\s*(\d+|[ivxlcdm]+)\s*$", re.IGNORECASE)


def _toc_region_step(p: Paragraph) -> None:
    """Track whether the body is inside a table of contents: a TOC or list label opens it, and the
    first heading-styled paragraph or line of prose after it ends it."""
    text = p.text.strip()
    if _TOC_LABEL.match(text):
        _STATE.in_toc = True
        return
    if not _STATE.in_toc or not text:
        return
    style_name = ""
    try:
        style_name = (p.style.name or "") if p.style is not None else ""
    except Exception:
        style_name = ""
    if style_name.lower().startswith(("heading", "title")) or (len(text) >= 80 and text.endswith((".", "!", "?"))):
        _STATE.in_toc = False


def _is_toc_entry(p: Paragraph) -> bool:
    """A table-of-contents line: Word's TOC styles, or a "title<tab>page" line inside a TOC region."""
    try:
        style_name = (p.style.name or "") if p.style is not None else ""
    except Exception:
        style_name = ""
    if re.match(r"^(toc\s*\d|table of figures)", style_name, re.IGNORECASE):
        return True
    return _STATE.in_toc and _TOC_ENTRY.match(p.text) is not None


def _paragraph_tab_stops(p: Paragraph) -> List[List[Any]]:
    """Custom tab stops in effect for a paragraph: [[align, position_px, leader], ...] sorted by position.

    Stops accumulate from the style chain (base first) and then the paragraph;
    a ``clear`` stop removes the inherited one at that position. In a table of contents, a final
    right-aligned stop without a leader gets a dot leader: hand-made TOCs often leave it out, and
    readers expect dots between a title and its page number.
    """
    stops = _paragraph_tab_stops_as_set(p)
    if stops and stops[-1][0] == "right" and stops[-1][2] in (None, "none") and _is_toc_entry(p):
        stops[-1] = [stops[-1][0], stops[-1][1], "dot"]
    return stops


def _paragraph_tab_stops_as_set(p: Paragraph) -> List[List[Any]]:
    """The tab stops exactly as the document sets them (see _paragraph_tab_stops)."""
    chain: List[Any] = []
    try:
        style = p.style
    except Exception:
        style = None
    seen: Set[str] = set()
    while style is not None and style.style_id not in seen:
        seen.add(style.style_id)
        chain.append(style.element.find(qn("w:pPr")))
        style = style.base_style
    chain.reverse()
    chain.append(p._element.pPr)

    stops: Dict[int, Tuple[str, Optional[str]]] = {}
    for ppr in chain:
        tabs = ppr.find(qn("w:tabs")) if ppr is not None else None
        if tabs is None:
            continue
        for tab in tabs.findall(qn("w:tab")):
            pos = tab.get(qn("w:pos"))
            if pos is None:
                continue
            kind = tab.get(qn("w:val")) or "left"
            if kind == "clear":
                stops.pop(int(pos), None)
            elif kind != "bar":
                stops[int(pos)] = (kind, tab.get(qn("w:leader")))
    return [[kind, round(pos * TWIPS_PER_PX, 1), leader] for pos, (kind, leader) in sorted(stops.items())]


def _tab_attributes(p: Paragraph, inner: str) -> str:
    """data-* attributes carrying a paragraph's tab stops; empty when it holds no tab."""
    if "data-tab" not in inner:
        return ""
    stops = json.dumps(_paragraph_tab_stops(p), separators=(",", ":"))
    return f' data-tab-stops="{_html_escape(stops, quote=True)}" data-default-tab="{_default_tab_px(p)}"'


def _resolve_spacing_attr(p: Paragraph, attr: str) -> Optional[str]:
    """Resolve one w:spacing attribute the way Word renders it."""
    return _resolve_pPr_attr(p, "spacing", attr)


def _read_indent(p: Paragraph) -> ParagraphIndent:
    """A paragraph's indents, resolved through the style chain like spacing is."""

    def twips(value: Optional[str]) -> Optional[int]:
        return int(value) if value and value != "0" else None

    left = _resolve_pPr_attr(p, "ind", "left") or _resolve_pPr_attr(p, "ind", "start")
    # firstLine and hanging are mutually exclusive: a direct value of either
    # replaces whatever the style chain says, as a pair.
    pPr = p._element.pPr
    direct = pPr.find(qn("w:ind")) if pPr is not None else None
    if direct is not None and (
        direct.get(qn("w:firstLine")) is not None or direct.get(qn("w:hanging")) is not None
    ):
        first_line = direct.get(qn("w:firstLine"))
        hanging = direct.get(qn("w:hanging"))
    else:
        first_line = _resolve_pPr_attr(p, "ind", "firstLine")
        hanging = _resolve_pPr_attr(p, "ind", "hanging")
    right = _resolve_pPr_attr(p, "ind", "right") or _resolve_pPr_attr(p, "ind", "end")
    return ParagraphIndent(
        left_twips=twips(left),
        right_twips=twips(right),
        first_line_twips=twips(first_line),
        hanging_twips=twips(hanging),
    )


def _write_indent_css(indent: ParagraphIndent) -> str:
    """CSS for a paragraph's indents (twips -> px).

    A paragraph with no first-line indent gets an explicit ``text-indent:0``: inline style beats
    any preset stylesheet, so an applied template's 0.5in first-line indent can never be forced
    onto a title page or signature block that Word left flush.
    """
    styles: List[str] = []
    if indent.left_twips:
        styles.append(f"margin-left:{round(indent.left_twips * TWIPS_PER_PX, 1)}px")
    if indent.first_line_twips:
        styles.append(f"text-indent:{round(indent.first_line_twips * TWIPS_PER_PX, 1)}px")
    elif indent.hanging_twips:
        styles.append(f"text-indent:{round(-indent.hanging_twips * TWIPS_PER_PX, 1)}px")
    else:
        styles.append("text-indent:0")
    if indent.right_twips:
        styles.append(f"margin-right:{round(indent.right_twips * TWIPS_PER_PX, 1)}px")
    return "; ".join(styles)


def _paragraph_indent_css(p: Paragraph) -> str:
    """CSS for a paragraph's left, right and first-line indents."""
    return _write_indent_css(_read_indent(p))


# Word's single line height per em (hhea ascender + descender + line gap) for
# common fonts, measured from the installed font files. CSS ``line-height: N``
# multiplies only the font size, while Word's "auto" spacing multiplies this
# natural height, so imported spacing is scaled by it. Unknown fonts get the
# Times New Roman / Arial value.
_FONT_LINE_FACTORS: Dict[str, float] = {
    "times new roman": 1.15, "arial": 1.15, "arial narrow": 1.15, "calibri": 1.221,
    "calibri light": 1.221, "cambria": 1.172, "georgia": 1.136, "garamond": 1.125,
    "book antiqua": 1.206, "century gothic": 1.226, "century": 1.202, "verdana": 1.215,
    "tahoma": 1.207, "segoe ui": 1.33, "courier new": 1.133, "consolas": 1.171,
    "trebuchet ms": 1.161, "palatino linotype": 1.349, "bookman old style": 1.174,
    "candara": 1.221, "corbel": 1.208, "constantia": 1.221, "franklin gothic book": 1.134,
    "gill sans mt": 1.16, "rockwell": 1.174,
    # Measured from Word: 21.4pt pitch at 1.5 lines of 11pt.
    "ms mincho": 1.297,
}
_DEFAULT_LINE_FACTOR = 1.15
_THEME_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# The theme script entry Word reads for an East Asian language when the theme's own slot is empty.
_EAST_ASIAN_SCRIPTS = (("ja", "Jpan"), ("ko", "Hang"), ("zh-tw", "Hant"), ("zh-hk", "Hant"), ("zh-mo", "Hant"), ("zh", "Hans"))
# Themes name these fonts in their native script; the rest of the converter knows the Latin names.
_NATIVE_FONT_NAMES = {
    "ＭＳ 明朝": "MS Mincho", "ＭＳ ゴシック": "MS Gothic", "宋体": "SimSun", "黑体": "SimHei",
    "新細明體": "PMingLiU", "맑은 고딕": "Malgun Gothic",
}


def _theme_east_asian_font(font: Any, language: str) -> Optional[str]:
    """A theme font's East Asian face: its own slot, else the entry for the document's East Asian language."""
    slot = font.find(f"{_THEME_NS}ea")
    face = slot.get("typeface") if slot is not None else ""
    if not face:
        script = next((code for prefix, code in _EAST_ASIAN_SCRIPTS if language.lower().startswith(prefix)), None)
        entry = next((item for item in font.findall(f"{_THEME_NS}font") if item.get("script") == script), None)
        face = entry.get("typeface") if entry is not None else ""
    return _NATIVE_FONT_NAMES.get(face, face) or None


def _theme_fonts(part: Any) -> Dict[str, str]:
    """Return the document's theme fonts, keyed major, minor, majorEastAsia and minorEastAsia (cached on the part)."""
    cached = getattr(part, "_intellidocs_theme_fonts", None)
    if cached is not None:
        return cached
    fonts: Dict[str, str] = {}
    try:
        from lxml import etree

        package_parts = list(part.package.iter_parts())
        language = ""
        for rel in package_parts:
            if str(rel.partname) == "/word/settings.xml":
                lang = etree.fromstring(rel.blob).find(f"{_WORD_NS}themeFontLang")
                language = (lang.get(f"{_WORD_NS}eastAsia") or "") if lang is not None else ""
        for rel in package_parts:
            if str(rel.partname).startswith("/word/theme/"):
                root = etree.fromstring(rel.blob)
                for kind in ("major", "minor"):
                    font = root.find(f".//{_THEME_NS}{kind}Font")
                    if font is None:
                        continue
                    latin = font.find(f"{_THEME_NS}latin")
                    if latin is not None and latin.get("typeface"):
                        fonts[kind] = latin.get("typeface")
                    east_asian = _theme_east_asian_font(font, language)
                    if east_asian:
                        fonts[f"{kind}EastAsia"] = east_asian
                break
    except Exception:
        pass
    try:
        setattr(part, "_intellidocs_theme_fonts", fonts)
    except Exception:
        pass
    return fonts


def _rfonts_name(r_fonts: Any, part: Any) -> Optional[str]:
    """Latin font name from a w:rFonts element, following a theme reference."""
    if r_fonts is None:
        return None
    theme_ref = r_fonts.get(qn("w:asciiTheme"))
    if theme_ref:
        kind = "major" if theme_ref.lower().startswith("major") else "minor"
        fonts = _theme_fonts(part)
        themed = fonts.get(f"{kind}EastAsia") if theme_ref.endswith("EastAsia") else None
        themed = themed or fonts.get(kind)
        if themed:
            return themed
    return r_fonts.get(qn("w:ascii")) or r_fonts.get(qn("w:hAnsi"))


def _paragraph_mark_rpr(p: Paragraph) -> Any:
    """The w:rPr inside w:pPr (formatting of the paragraph mark), or None."""
    pPr = p._element.pPr
    return pPr.find(qn("w:rPr")) if pPr is not None else None


def _resolve_font_name(p: Paragraph) -> Optional[str]:
    """Font family Word would use for the paragraph's text: first run, style chain, docDefaults."""
    for run in p.runs:
        if run.text.strip():
            run_pr = run._element.rPr
            name = _rfonts_name(run_pr.find(qn("w:rFonts")) if run_pr is not None else None, p.part)
            if name:
                return name
    # The paragraph mark's own properties size a blank line in Word, and they
    # usually name the font the author typed in (the style default may differ).
    mark_rpr = _paragraph_mark_rpr(p)
    mark_name = _rfonts_name(mark_rpr.find(qn("w:rFonts")) if mark_rpr is not None else None, p.part)
    if mark_name:
        return mark_name
    return _inherited_font_name(p)


def _inherited_font_name(p: Paragraph) -> Optional[str]:
    """Font a paragraph's text gets from its style chain, then docDefaults (no run or mark overrides)."""
    try:
        style = p.style
    except Exception:
        style = None
    seen: Set[str] = set()
    while style is not None and style.style_id not in seen:
        seen.add(style.style_id)
        rpr = style.element.find(qn("w:rPr"))
        name = _rfonts_name(rpr.find(qn("w:rFonts")) if rpr is not None else None, p.part)
        if name:
            return name
        style = style.base_style
    try:
        defaults = p.part.styles.element.find(qn("w:docDefaults"))
        rpr = defaults.find(qn("w:rPrDefault") + "/" + qn("w:rPr")) if defaults is not None else None
        return _rfonts_name(rpr.find(qn("w:rFonts")) if rpr is not None else None, p.part)
    except Exception:
        return None


def _resolve_font_size_pt(p: Paragraph) -> Optional[float]:
    """Base font size (pt) of the paragraph: paragraph mark, style chain, then docDefaults."""
    # The paragraph mark's size is the height of a BLANK line only; a paragraph
    # with text sizes from its style and runs (the mark often differs).
    if not any(run.text.strip() for run in p.runs):
        mark_rpr = _paragraph_mark_rpr(p)
        mark_sz = mark_rpr.find(qn("w:sz")) if mark_rpr is not None else None
        if mark_sz is not None and mark_sz.get(qn("w:val")):
            return round(int(mark_sz.get(qn("w:val"))) / 2.0, 1)
    style_size = _style_font_size_pt(p)
    # Word sizes a line from its largest run, and most paragraphs are one size
    # throughout, so a paragraph whose text is mostly one explicit run size takes
    # it as its base: line height and spacing then scale with the text it holds.
    weights: Dict[float, int] = {}
    for run in p.runs:
        text = run.text.strip()
        if not text:
            continue
        size = round(run.font.size.pt, 1) if run.font.size is not None else style_size
        if size is not None:
            weights[size] = weights.get(size, 0) + len(text)
    if weights:
        return max(weights.items(), key=lambda item: item[1])[0]
    return style_size


def _style_font_size_pt(p: Paragraph) -> Optional[float]:
    """Font size (pt) a paragraph's style chain, then the document defaults, give its text."""
    try:
        style = p.style
    except Exception:
        style = None
    seen: Set[str] = set()
    while style is not None and style.style_id not in seen:
        seen.add(style.style_id)
        if style.font is not None and style.font.size is not None:
            return round(style.font.size.pt, 1)
        style = style.base_style
    try:
        defaults = p.part.styles.element.find(qn("w:docDefaults"))
        sz = defaults.find(qn("w:rPrDefault") + "/" + qn("w:rPr") + "/" + qn("w:sz")) if defaults is not None else None
        if sz is not None and sz.get(qn("w:val")):
            return round(int(sz.get(qn("w:val"))) / 2.0, 1)
    except Exception:
        pass
    return None


def _write_font_css(size: Optional[float]) -> str:
    """Explicit base font size, so an applied preset's size cannot change imported text."""
    if size is None:
        return ""
    return f"font-size:{int(size) if size == int(size) else size}pt"


def _paragraph_font_css(p: Paragraph) -> str:
    """The paragraph's base font size as CSS, empty when the document sets none."""
    return _write_font_css(_resolve_font_size_pt(p))


def _read_spacing(p: Paragraph) -> ParagraphSpacing:
    """The paragraph's spacing, resolved exactly the way Word renders it: direct w:spacing, then its
    style chain, then docDefaults. Nothing is invented: what is set nowhere stays None."""
    before = _resolve_spacing_attr(p, "before")
    before_lines = _resolve_spacing_attr(p, "beforeLines")
    after = _resolve_spacing_attr(p, "after")
    after_lines = _resolve_spacing_attr(p, "afterLines")
    line = _resolve_spacing_attr(p, "line")

    def lines(value: Optional[str]) -> Optional[int]:
        # w:beforeLines / w:afterLines count hundredths of a line (100 = one line).
        return int(value) if value and value != "0" and value.isdigit() else None

    return ParagraphSpacing(
        before_twips=int(before) if before is not None else None,
        after_twips=int(after) if after is not None else None,
        before_lines=lines(before_lines),
        after_lines=lines(after_lines),
        line=int(line) if line and line != "0" else None,
        line_rule=_resolve_spacing_attr(p, "lineRule") or "auto",
        unset=before is None and before_lines is None and after is None and after_lines is None and line is None,
    )


def _write_spacing_css(spacing: ParagraphSpacing, font_name: Optional[str]) -> str:
    """CSS for a paragraph's spacing (twips -> px, auto line spacing -> unitless).

    Spacing inherited from styles IS emitted, because the editor cannot see the DOCX style chain
    and would otherwise fall back to its own line spacing (single-spaced documents far too loose).
    """
    if spacing.unset:
        return ""
    styles: List[str] = []
    if spacing.before_twips is not None:
        px = round(spacing.before_twips * TWIPS_PER_PX, 1)
        styles.append(f"margin-top:{px}px" if px else "margin-top:0")
    elif spacing.before_lines:
        styles.append(f"margin-top:{round(spacing.before_lines * 0.012, 2)}em")
    if spacing.after_twips is not None:
        px = round(spacing.after_twips * TWIPS_PER_PX, 1)
        styles.append(f"margin-bottom:{px}px" if px else "margin-bottom:0")
    elif spacing.after_lines:
        styles.append(f"margin-bottom:{round(spacing.after_lines * 0.012, 2)}em")
    if spacing.line:
        if spacing.line_rule in ("exact", "atLeast"):
            # Exact/atLeast spacing is stored in twips (1/20 pt): 240 = 12pt.
            styles.append(f"line-height:{round(spacing.line / 20.0, 2)}pt")
        else:
            # Auto spacing is in 240ths of a line: 240 = single, 360 = 1.5x. Word's "single" is the
            # font's natural line height (~1.15em for Times New Roman), CSS's is 1em, so scale by it.
            factor = _FONT_LINE_FACTORS.get((font_name or "").lower(), _DEFAULT_LINE_FACTOR)
            styles.append(f"line-height:{round(spacing.line / 240.0 * factor, 3)}")
    return "; ".join(styles)


def _paragraph_spacing_css(p: Paragraph) -> str:
    """CSS for the paragraph's effective spacing, empty when the document sets none."""
    spacing = _read_spacing(p)
    needs_font = spacing.line and spacing.line_rule not in ("exact", "atLeast")
    return _write_spacing_css(spacing, _resolve_font_name(p) if needs_font else None)


def _read_paragraph_props(p: Paragraph) -> ParagraphProps:
    """A paragraph's own formatting as the document model."""
    return ParagraphProps(
        alignment=_get_paragraph_alignment(p),
        font_size_pt=_resolve_font_size_pt(p),
        font_name=_resolve_font_name(p),
        spacing=_read_spacing(p),
        indent=_read_indent(p),
        style_name=p.style.name.lower() if p.style else "",
    )


# Word numbering formats the editor's ordered list can draw (its `type` attribute).
_LIST_TYPES: Dict[str, str] = {
    "lowerLetter": "a",
    "upperLetter": "A",
    "lowerRoman": "i",
    "upperRoman": "I",
}


def _build_numbering_map(doc: docx.Document) -> Tuple[Dict[str, str], Dict[str, Dict[str, Tuple[str, float]]]]:
    """Return (numId->abstractNumId, abstractNumId->{ilvl: (numFmt, text indent px)}) from numbering.xml."""
    try:
        numbering_part = doc.part.numbering_part
    except Exception:
        return {}, {}
    if numbering_part is None:
        return {}, {}

    root = numbering_part.element
    num_to_abstract: Dict[str, str] = {}
    for num in root.findall(qn("w:num")):
        num_id = num.get(qn("w:numId"))
        abstract = num.find(qn("w:abstractNumId"))
        if num_id and abstract is not None:
            num_to_abstract[num_id] = abstract.get(qn("w:val")) or ""

    abstract_levels: Dict[str, Dict[str, Tuple[str, float]]] = {}
    for abstract in root.findall(qn("w:abstractNum")):
        abstract_id = abstract.get(qn("w:abstractNumId"))
        if abstract_id is None:
            continue
        levels: Dict[str, Tuple[str, float]] = {}
        for lvl in abstract.findall(qn("w:lvl")):
            ilvl = lvl.get(qn("w:ilvl"), "0")
            fmt_el = lvl.find(qn("w:numFmt"))
            fmt = fmt_el.get(qn("w:val")) if fmt_el is not None else "bullet"
            indent = lvl.find(qn("w:pPr") + "/" + qn("w:ind"))
            left = indent.get(qn("w:left")) or indent.get(qn("w:start")) if indent is not None else None
            levels[ilvl] = (fmt, float(left) * TWIPS_PER_PX if left else 0.0)
        abstract_levels[abstract_id] = levels

    return num_to_abstract, abstract_levels


_GEOMETRY_CACHE: Dict[int, Dict[Tuple[str, str], Dict[str, Any]]] = {}


def _numbering_geometry(part: Any) -> Dict[Tuple[str, str], Dict[str, Any]]:
    """(numId, ilvl) -> marker text, suffix and indent (twips) of every numbered level, read once."""
    try:
        root = part.numbering_part.element
    except Exception:
        return {}
    if id(root) in _GEOMETRY_CACHE:
        return _GEOMETRY_CACHE[id(root)]
    abstract_levels: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for abstract in root.findall(qn("w:abstractNum")):
        levels: Dict[str, Dict[str, Any]] = {}
        for lvl in abstract.findall(qn("w:lvl")):
            text = lvl.find(qn("w:lvlText"))
            suff = lvl.find(qn("w:suff"))
            ind = lvl.find(qn("w:pPr") + "/" + qn("w:ind"))
            left = ind.get(qn("w:left")) or ind.get(qn("w:start")) if ind is not None else None
            first = ind.get(qn("w:firstLine")) if ind is not None else None
            hanging = ind.get(qn("w:hanging")) if ind is not None else None
            fmt = lvl.find(qn("w:numFmt"))
            start = lvl.find(qn("w:start"))
            restart = lvl.find(qn("w:lvlRestart"))
            levels[lvl.get(qn("w:ilvl"), "0")] = {
                "text": text.get(qn("w:val")) if text is not None else "%1.",
                "suff": suff.get(qn("w:val")) if suff is not None else "tab",
                "left": int(left) if left else 0,
                "first": int(first) if first else (-int(hanging) if hanging else 0),
                "fmt": fmt.get(qn("w:val")) if fmt is not None else "decimal",
                "start": int(start.get(qn("w:val")) or 1) if start is not None else 1,
                "lgl": lvl.find(qn("w:isLgl")) is not None,
                # <w:lvlRestart w:val="0"/>: the level keeps counting when a higher level advances.
                "keeps_counting": restart is not None and restart.get(qn("w:val")) == "0",
            }
        abstract_levels[abstract.get(qn("w:abstractNumId"), "")] = levels
    table: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for num in root.findall(qn("w:num")):
        abstract_id = num.find(qn("w:abstractNumId"))
        overrides = {
            ov.get(qn("w:ilvl"), "0"): int(so.get(qn("w:val")) or 1)
            for ov in num.findall(qn("w:lvlOverride"))
            for so in ov.findall(qn("w:startOverride"))
        }
        for ilvl, value in abstract_levels.get(abstract_id.get(qn("w:val")) if abstract_id is not None else "", {}).items():
            # A list that restarts (w:startOverride) numbers from its own start, whatever the shared definition says.
            table[(num.get(qn("w:numId"), ""), ilvl)] = {**value, "start": overrides[ilvl]} if ilvl in overrides else value
    _GEOMETRY_CACHE[id(root)] = table
    return table


def _format_number(fmt: str, number: int) -> str:
    """One counter written in a Word numbering format (decimal, a, A, i, I, 01); other formats read as decimal."""
    if fmt in ("lowerLetter", "upperLetter") and number > 0:
        letters = ""
        remaining = number
        while remaining > 0:
            remaining, digit = divmod(remaining - 1, 26)
            letters = chr(97 + digit) + letters
        return letters if fmt == "lowerLetter" else letters.upper()
    if fmt in ("lowerRoman", "upperRoman") and 0 < number < 4000:
        return _roman(number) if fmt == "lowerRoman" else _roman(number).upper()
    if fmt == "decimalZero":
        return f"{number:02d}"
    return str(number)


# A literal marker goes into a CSS string, so only plain text qualifies.
_PLAIN_MARKER = re.compile(r"[\w.()\[\]\-–: §]{1,24}")


def _literal_marker(part: Any, num_id: str, level: int, counts: Dict[Tuple[str, int], int]) -> Optional[str]:
    """The number Word writes for a numbered item whose marker the editor's own counter cannot draw.

    That is a level whose text joins several counters ("1.1", "1.1.1"), a legal-style level (isLgl), or a
    list that starts above 1 or restarts at a chosen number. None for the plain case (one counter in the
    level's own format from 1, drawn by the list's counter) and for anything that is not plain text.
    """
    table = _numbering_geometry(part)
    lvl = table.get((num_id, str(level)))
    if lvl is None or lvl["suff"] != "tab" or "%" not in lvl["text"]:
        return None
    refs = [int(k) for k in re.findall(r"%(\d)", lvl["text"])]
    if any(k - 1 > level for k in refs):
        return None  # a level cannot show the counter of a level below it
    plain = (
        len(refs) == 1
        and refs[0] == level + 1
        and not lvl["lgl"]
        and lvl["start"] == 1
        and lvl["fmt"] in ("decimal", "lowerLetter", "upperLetter", "lowerRoman", "upperRoman")
    )
    if plain:
        return None
    text = lvl["text"]
    for k in sorted(set(refs), reverse=True):
        shown = table.get((num_id, str(k - 1)))
        number = (shown["start"] if shown else 1) + max(counts.get((num_id, k - 1), 1), 1) - 1
        fmt = "decimal" if lvl["lgl"] else (shown["fmt"] if shown else "decimal")
        text = text.replace(f"%{k}", _format_number(fmt, number))
    return text if _PLAIN_MARKER.fullmatch(text) else None


def _marker_width_px(text: str, size_pt: float) -> float:
    """Approximate width of a written-out marker in a serif face: narrow letters and punctuation are narrow.

    Where the item's text starts depends on whether the marker ends before the next tab stop, and a
    marker like "B.ii" is far narrower than four digits, so a flat per-character width puts the text
    a whole tab stop too far right.
    """
    narrow, medium, wide = "il.,:;'|!", "tfjr()[] -", "mwMW"
    em = 0.0
    for char in text:
        if char in narrow:
            em += 0.27
        elif char in medium:
            em += 0.33
        elif char in wide:
            em += 0.78
        elif char.isupper():
            em += 0.62
        elif char.isdigit():
            em += 0.5
        else:
            em += 0.46
    return em * size_pt * 96 / 72


def _list_item_geometry(p: Paragraph, info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Where Word puts a numbered item's marker and text, in px from the text column's left edge.

    Word draws the marker at ``left + firstLine`` (or ``left - hanging``), follows it with a tab
    to the next stop and wraps later lines at ``left``. None when the level is not a plain
    single-counter number ("1.", "a)", "(i)") that the editor can draw from the list's counter.
    """
    if info.get("kind") != "ol":
        return None
    level = _numbering_geometry(p.part).get((info["num_id"], str(info["level"])))
    if level is None or level["suff"] != "tab":
        return None
    marker = info.get("marker")
    if marker:
        pre, post = "", ""
    else:
        match = re.fullmatch(r"([^%]*)%(\d)([^%]*)", level["text"])
        if not match or int(match.group(2)) != int(info["level"]) + 1:
            return None
        # The affixes go into a CSS string, so only plain text qualifies.
        if re.search(r"[\\\"'\n-]", match.group(1) + match.group(3)):
            return None
        pre, post = match.group(1), match.group(3)

    pPr = p._element.pPr
    direct = pPr.find(qn("w:ind")) if pPr is not None else None
    left = level["left"]
    first = level["first"]
    if direct is not None:
        own_left = direct.get(qn("w:left")) or direct.get(qn("w:start"))
        if own_left is not None:
            left = int(own_left)
        if direct.get(qn("w:firstLine")) is not None or direct.get(qn("w:hanging")) is not None:
            first = int(direct.get(qn("w:firstLine")) or 0) - int(direct.get(qn("w:hanging")) or 0)
    wrap_x = left * TWIPS_PER_PX
    marker_x = (left + first) * TWIPS_PER_PX

    size_pt = _resolve_font_size_pt(p) or 11.0
    marker_end = marker_x + (_marker_width_px(marker, size_pt) if marker else (len(pre) + len(post) + 1) * 0.5 * size_pt * 96 / 72)
    stops = [pos for kind, pos, _leader in _paragraph_tab_stops(p) if kind in ("left", "num")]
    if first < 0:
        stops.append(wrap_x)
    ahead = sorted(pos for pos in stops if pos > marker_end)
    if ahead:
        text_x = ahead[0]
    else:
        step = _default_tab_px(p) or 48.0
        text_x = (math.floor(marker_end / step) + 1) * step
    return {"marker_x": round(marker_x, 1), "wrap_x": round(wrap_x, 1), "text_x": round(text_x, 1), "pre": pre, "post": post, "marker": marker or ""}


def _style_numbering(p: Paragraph) -> Optional[Tuple[str, Optional[str], str]]:
    """(numId, ilvl, styleId) a paragraph inherits from its style chain, e.g. "List Bullet"; None for none.

    Built-in list styles carry their numbering in the style, not on each paragraph. Headings are
    skipped: their numbering is outline numbering ("1.1 Scope") written by the heading itself, and
    turning those into list items would break the heading structure.
    """
    try:
        style = p.style
    except Exception:
        return None
    found: Optional[Tuple[str, Optional[str], str]] = None
    seen: Set[str] = set()
    while style is not None and style.style_id not in seen:
        seen.add(style.style_id)
        name = (style.name or "").lower()
        if name.startswith("heading") or name == "title":
            return None
        style_pPr = style.element.find(qn("w:pPr"))
        num_pr = style_pPr.find(qn("w:numPr")) if style_pPr is not None else None
        num_id_el = num_pr.find(qn("w:numId")) if num_pr is not None else None
        if found is None and num_id_el is not None and num_id_el.get(qn("w:val")):
            ilvl_el = num_pr.find(qn("w:ilvl"))
            found = (num_id_el.get(qn("w:val")), ilvl_el.get(qn("w:val")) if ilvl_el is not None else None, style.style_id)
        style = style.base_style
    return found


def _style_level(part: Any, num_id: str, style_id: str) -> int:
    """The list level a style maps to ("List Bullet 2" is level 1): the numbering level that names it, else 0."""
    table = getattr(part, "_intellidocs_style_levels", None)
    if table is None:
        table = {}
        try:
            root = part.numbering_part.element
            by_abstract: Dict[str, Dict[str, int]] = {}
            for abstract in root.findall(qn("w:abstractNum")):
                for lvl in abstract.findall(qn("w:lvl")):
                    linked = lvl.find(qn("w:pStyle"))
                    if linked is not None and linked.get(qn("w:val")):
                        by_abstract.setdefault(abstract.get(qn("w:abstractNumId"), ""), {})[linked.get(qn("w:val"))] = int(lvl.get(qn("w:ilvl"), "0"))
            for num in root.findall(qn("w:num")):
                abstract_id = num.find(qn("w:abstractNumId"))
                for linked_style, level in by_abstract.get(abstract_id.get(qn("w:val")) if abstract_id is not None else "", {}).items():
                    table[(num.get(qn("w:numId"), ""), linked_style)] = level
        except Exception:
            pass
        try:
            setattr(part, "_intellidocs_style_levels", table)
        except Exception:
            pass
    return table.get((num_id, style_id), 0)


def _paragraph_list_info(
    p: Paragraph,
    num_to_abstract: Dict[str, str],
    abstract_levels: Dict[str, Dict[str, Tuple[str, float]]],
) -> Optional[Dict[str, Any]]:
    """Return list kind + level for a numbered/bulleted paragraph, or None.

    The paragraph's own numPr wins (numId 0 switches numbering off); a paragraph without one
    takes the numbering of its style, which is how Word's "List Bullet"/"List Number" work.
    """
    pPr = p._element.pPr
    num_pr = pPr.find(qn("w:numPr")) if pPr is not None else None
    num_id_el = num_pr.find(qn("w:numId")) if num_pr is not None else None
    direct_ilvl_el = num_pr.find(qn("w:ilvl")) if num_pr is not None else None
    style_id = ""
    style_ilvl: Optional[str] = None
    if num_id_el is not None:
        num_id = num_id_el.get(qn("w:val"))
    else:
        inherited = _style_numbering(p)
        if inherited is None:
            return None
        num_id, style_ilvl, style_id = inherited
    if not num_id or num_id == "0":
        return None

    if direct_ilvl_el is not None:
        ilvl = int(direct_ilvl_el.get(qn("w:val")) or "0")
    elif style_ilvl is not None:
        ilvl = int(style_ilvl or "0")
    elif style_id:
        ilvl = _style_level(p.part, num_id, style_id)
    else:
        ilvl = 0

    fmt, level_left = "bullet", 0.0
    abstract_id = num_to_abstract.get(num_id)
    if abstract_id:
        levels = abstract_levels.get(abstract_id, {})
        fmt, level_left = levels.get(str(ilvl), levels.get("0", ("bullet", 0.0)))

    kind = "ul" if fmt == "bullet" else "ol"
    return {"kind": kind, "level": ilvl, "num_id": num_id, "fmt": fmt, "left_px": level_left}


def _get_paragraph_alignment_css(p: Paragraph) -> str:
    """text-align declaration for a paragraph, empty when left-aligned."""
    alignment = _get_paragraph_alignment(p)
    return f"text-align:{alignment}" if alignment != "left" else ""


def _paragraph_to_html(
    p: Paragraph,
    doc_parts: Dict[str, bytes],
    list_info: Optional[Dict[str, Any]] = None,
) -> str:
    """Convert a paragraph to HTML; list paragraphs return only their inner content."""
    if list_info is None:
        equation = _equation_paragraph_html(p)
        if equation is not None:
            if _BUILD_JSON:
                _STATE.last_paragraph_nodes = [
                    {"type": "blockMath", "attrs": {"latex": m.group(1), "number": m.group(3), "span": None}}
                    for m in re.finditer(r'<div data-type="block-math" data-latex="([^"]*)"( data-number="([^"]*)")?></div>', equation)
                ]
                for node in _STATE.last_paragraph_nodes:
                    node["attrs"]["latex"] = _html_unescape(node["attrs"]["latex"])
                    if node["attrs"]["number"] is not None:
                        node["attrs"]["number"] = _html_unescape(node["attrs"]["number"])
            return equation
    items = _read_inline(p, doc_parts)
    inner = _write_inline_html(items)
    if list_info is None and _BUILD_JSON:
        _STATE.last_paragraph_nodes = _paragraph_json(p, items)[1]
    if list_info is None and _JSON_SINK is not None and _STATE.in_body:
        html = _paragraph_to_html_from_items(p, inner)
        _record_paragraph_json(p, items)
        if _JSON_SINK_HTML is not None:
            _JSON_SINK_HTML.append(html)
        # Measurement only: tag the paragraph so the measurement can tell which ones stay in the body
        # (later passes lift text-box content into overlays and drop blank lines before page breaks).
        # At the end of the opening tag: the body writer tests how a paragraph's HTML starts.
        return re.sub(r"^(<(?:p|h[1-6])\b[^>]*)>", lambda m: f'{m.group(1)} data-sink="{len(_JSON_SINK) - 1}">', html, count=1)

    if list_info is None:
        return _paragraph_to_html_from_items(p, inner)
    inner = inner.replace(_LINE_MARK, "")
    _STATE.last_list_paragraph = (items, _list_paragraph_css(p, list_info) if inner.strip() else None)
    # The item keeps its paragraph's spacing, size and alignment.
    if inner.strip():
        css = _list_paragraph_css(p, list_info)
        return f'<p style="{css};">{inner}</p>' if css else f"<p>{inner}</p>"
    return inner


def _list_paragraph_css(p: Paragraph, list_info: Dict[str, Any]) -> str:
    """The style of a list item's paragraph: its spacing, size and alignment, and Word's indent."""
    # The editor's list already indents text 24px; the rest of Word's indent goes on the item.
    direct_left = re.search(r"margin-left:\s*([\d.]+)px", _paragraph_indent_css(p))
    left_px = float(direct_left.group(1)) if direct_left else float(list_info.get("left_px") or 0.0)
    extra = f"margin-left:{round(left_px - 24, 1):g}px" if left_px - 24 > 2 else ""
    geometry = _list_item_geometry(p, list_info)
    if geometry:
        # The editor draws the marker at its own x; the paragraph wraps at the indent and
        # starts its first line at the tab stop after the marker, as in Word.
        right = re.search(r"margin-right:\s*[\d.]+px", _paragraph_indent_css(p))
        extra = "; ".join(
            part
            for part in (
                f"margin-left:{geometry['wrap_x']:g}px",
                f"text-indent:{round(geometry['text_x'] - geometry['wrap_x'], 1):g}px",
                right.group(0).replace(" ", "") if right else "",
            )
            if part
        )
    css_parts = [_get_paragraph_alignment_css(p), _paragraph_font_css(p), _paragraph_spacing_css(p), extra]
    return "; ".join(part.rstrip("; ") for part in css_parts if part)
def _paragraph_to_html_from_items(p: Paragraph, inner: str) -> str:
    """A (non-list) paragraph's HTML from its inner HTML: drawn lines split it into bordered paragraphs."""
    if _LINE_MARK not in inner:
        return _paragraph_html_from_inner(p, inner)

    # A drawn line in the paragraph becomes its own bordered paragraph; the text
    # around it keeps the paragraph's formatting.
    lines = _line_shapes_in(p._p)
    chunks = inner.split(_LINE_MARK)
    pieces: List[str] = []
    for index, chunk in enumerate(chunks):
        if index > 0:
            line = lines[index - 1] if index - 1 < len(lines) else (5486400, 9525, "#000000")
            pieces.append(_line_paragraph_html(p, line, space_before=not pieces))
            chunk = _strip_leading_breaks(chunk)
        if re.sub(r"<(?!img)[^>]+>", "", chunk).strip():
            pieces.append(_paragraph_html_from_inner(p, chunk))
        elif index == 0:
            # Line breaks before a line are empty lines above it.
            pieces.extend(_paragraph_html_from_inner(p, "") for _ in range(len(re.findall(r"<br\s*/?>", chunk))))
    return "".join(pieces)


def _drop_inline_icons(inner: str) -> str:
    """Remove small pictures set inside a line of text (an ORCID badge after a name).

    The editor holds pictures as blocks, so one inside a sentence would cut the
    line in two; a badge that small carries no content the text lacks.
    """
    if not re.sub(r"<[^>]+>", "", inner).strip():
        return inner
    return re.sub(r'<img [^>]*?width="(\d+)"[^>]*/>', lambda m: "" if int(m.group(1)) <= 24 else m.group(0), inner)


def _paragraph_html_from_inner(p: Paragraph, inner: str) -> str:
    """The HTML of a (non-list) paragraph whose inner HTML has already been built."""
    inner = _drop_inline_icons(inner)
    props = _read_paragraph_props(p)
    style_name = props.style_name
    font_css = _write_font_css(props.font_size_pt)
    spacing_css = _write_spacing_css(props.spacing, props.font_name)

    if not inner.strip():
        # Blank line: render it exactly as tall as Word does — the same
        # resolved line height (and before/after spacing) as its style chain,
        # so runs of blank paragraphs neither collapse nor balloon. No <br/>:
        # the editor's strict HTML parsing turns a lone <br> into a hard-break
        # node that renders TWO line boxes (double-height blank lines).
        empty_style = "; ".join(filter(None, [font_css, spacing_css]))
        empty_attr = f' style="{empty_style}"' if empty_style else ""
        return f'<p class="empty-spacer"{empty_attr}></p>'

    # A paragraph that is only a page break -> bare <hr>, not wrapped in <p>.
    if re.fullmatch(r"(<hr[^>]*/>\s*)+", inner):
        return inner

    # A paragraph that is only an image -> bare <img>, not wrapped in <p>.
    # This prevents ProseMirror from splitting the <p> and creating an
    # empty paragraph above the block-level image node.
    if re.fullmatch(r'<img\s[^>]+/>', inner.strip()):
        return inner.strip()

    # Display equations are blocks of their own, never inside a <p>.
    if re.fullmatch(r'(<div data-type="block-math"[^>]*></div>\s*)+', inner):
        return inner

    align_style = f"text-align:{props.alignment};" if props.alignment != "left" else ""
    spacing_style = spacing_css
    indent_style = _write_indent_css(props.indent)

    heading = _heading_kind(style_name)
    if heading is not None:
        level, size, margin, weight, italic = heading
        css = _heading_css(font_css, spacing_css, align_style, indent_style, size, margin, weight, italic)
        role = ' class="title"' if "title" in style_name and "sub" not in style_name else ' class="subtitle"' if "subtitle" in style_name else ""
        return f'<h{level}{role} style="{css}">{inner}</h{level}>'

    css_parts = filter(None, [align_style, font_css, spacing_style, indent_style])
    css_combined = "; ".join(part.rstrip("; ") for part in css_parts).strip()
    style_attr = f' style="{css_combined};"' if css_combined else ""
    open_tag = f"<p{style_attr}{_tab_attributes(p, inner)}>"
    return _split_paragraph_at_pictures(open_tag, inner) or f"{open_tag}{inner}</p>"


# Heading level, fallback size (pt) and fallback margin, used only when the
# source document defines no size or spacing for the paragraph.
_HEADING_DEFAULTS: List[Tuple[int, float, str]] = [
    (1, 17, "margin:0.85em 0 0.35em"),
    (2, 14, "margin:0.75em 0 0.3em"),
    (3, 12.5, "margin:0.65em 0 0.25em"),
    (4, 11.5, "margin:0.5em 0 0.25em"),
    (5, 10.5, "margin:0.5em 0 0.25em"),
    (6, 9.5, "margin:0.5em 0 0.25em"),
]


def _heading_kind(style_name: str) -> Optional[Tuple[int, float, str, str, bool]]:
    """The heading a paragraph style makes: (level, fallback size pt, fallback margin, weight, italic),
    or None for an ordinary paragraph."""
    if "title" in style_name and "sub" not in style_name:
        return 1, 20, "margin:0.75em 0 0.35em", "bold", False
    if "subtitle" in style_name:
        return 2, 14, "margin:0.35em 0 0.5em", "600", True
    for level, size, margin in _HEADING_DEFAULTS:
        if f"heading {level}" in style_name:
            return level, size, margin, "bold", False
    if "heading" in style_name:
        return 4, 11.5, "margin:0.5em 0 0.25em", "bold", False
    return None


def _heading_css(
    font_css: str,
    spacing_css: str,
    align_style: str,
    indent_style: str,
    default_size_pt: float,
    default_margin: str,
    weight: str = "bold",
    italic: bool = False,
) -> str:
    """Inline style for a heading element.

    The source paragraph's own size and spacing are authoritative (they carry the
    vertical gaps of a title page and Word's heading spacing); the fixed defaults
    apply only when the document defines none, so an imported heading is never
    reshaped by the editor's heading rules.
    """
    size = font_css or f"font-size:{default_size_pt:g}pt"
    spacing = spacing_css or default_margin
    parts = [align_style.rstrip(";"), size, f"font-weight:{weight}", "font-style:italic" if italic else "", spacing, indent_style.rstrip(";")]
    return "; ".join(part for part in parts if part) + ";"


def _iter_block_elements(container: Any) -> Any:
    """Yield the paragraphs and tables of a body/cell, looking inside block content controls (w:sdt).

    A table of contents (and many cover pages) is one w:sdt wrapping dozens of
    paragraphs; walking only direct children silently dropped all of it.
    """
    for child in container:
        if child.tag == qn("w:sdt"):
            content = child.find(qn("w:sdtContent"))
            if content is not None:
                yield from _iter_block_elements(content)
        elif child.tag in (qn("w:p"), qn("w:tbl")):
            yield child


_MC_FALLBACK = "{http://schemas.openxmlformats.org/markup-compatibility/2006}Fallback"


def _textbox_paragraphs(paragraph_el: Any) -> List[Any]:
    """Paragraphs inside the text boxes anchored to a paragraph (DrawingML and VML).

    mc:AlternateContent carries every text box twice (a DrawingML Choice and a
    VML Fallback); only the first copy is returned.
    """
    found: List[Any] = []
    for content in paragraph_el.iter(qn("w:txbxContent")):
        ancestor = content.getparent()
        in_fallback = False
        while ancestor is not None and ancestor is not paragraph_el:
            if ancestor.tag == _MC_FALLBACK:
                in_fallback = True
                break
            ancestor = ancestor.getparent()
        # A box Word pins to the page or hangs beside its paragraph is drawn in place, not flowed after it.
        anchor = next(content.iterancestors(f"{{{_NS_WP}}}anchor"), None)
        pinned = anchor is not None and _page_art_geometry(anchor) is not None
        if not in_fallback and not pinned:
            found.extend(child for child in content if child.tag == qn("w:p"))
    return found


_NUMBERING_CACHE: Dict[int, Dict[Tuple[str, str], Tuple[str, str]]] = {}


def _numbering_levels(part: Any) -> Dict[Tuple[str, str], Tuple[str, str]]:
    """(numId, ilvl) -> (numFmt, lvlText) for every numbered level of a document, read once."""
    try:
        root = part.numbering_part.element
    except Exception:
        return {}
    if id(root) in _NUMBERING_CACHE:
        return _NUMBERING_CACHE[id(root)]
    abstract_levels: Dict[str, Dict[str, Tuple[str, str]]] = {}
    for abstract in root.findall(qn("w:abstractNum")):
        levels: Dict[str, Tuple[str, str]] = {}
        for lvl in abstract.findall(qn("w:lvl")):
            fmt = lvl.find(qn("w:numFmt"))
            text = lvl.find(qn("w:lvlText"))
            levels[lvl.get(qn("w:ilvl"), "0")] = (
                fmt.get(qn("w:val")) if fmt is not None else "decimal",
                text.get(qn("w:val")) if text is not None else "%1.",
            )
        abstract_levels[abstract.get(qn("w:abstractNumId"), "")] = levels
    table: Dict[Tuple[str, str], Tuple[str, str]] = {}
    for num in root.findall(qn("w:num")):
        abstract_id = num.find(qn("w:abstractNumId"))
        for ilvl, value in abstract_levels.get(abstract_id.get(qn("w:val")) if abstract_id is not None else "", {}).items():
            table[(num.get(qn("w:numId"), ""), ilvl)] = value
    _NUMBERING_CACHE[id(root)] = table
    return table


def _roman(number: int) -> str:
    """A number as lower-case roman numerals."""
    out = ""
    for value, symbol in ((1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")):
        while number >= value:
            out += symbol
            number -= value
    return out


def _cell_marker(p: Paragraph, counters: Dict[Tuple[str, str], int]) -> str:
    """The bullet or number Word draws before a numbered paragraph inside a table cell ("" when it has none)."""
    pr = p._element.pPr
    num_pr = pr.find(qn("w:numPr")) if pr is not None else None
    num_id = num_pr.find(qn("w:numId")) if num_pr is not None else None
    if num_id is None or num_id.get(qn("w:val")) in (None, "0"):
        return ""
    ilvl_el = num_pr.find(qn("w:ilvl"))
    key = (num_id.get(qn("w:val")), ilvl_el.get(qn("w:val")) if ilvl_el is not None else "0")
    fmt, text = _numbering_levels(p.part).get(key, ("bullet", "%1"))
    if fmt == "bullet":
        return "•"
    counters[key] = counters.get(key, 0) + 1
    count = counters[key]
    shown = {
        "lowerLetter": chr(96 + (count - 1) % 26 + 1), "upperLetter": chr(64 + (count - 1) % 26 + 1),
        "lowerRoman": _roman(count), "upperRoman": _roman(count).upper(),
    }.get(fmt, str(count))
    return re.sub(r"%\d", shown, text)


def _cell_paragraph(
    p: Paragraph,
    doc_parts: Dict[str, bytes],
    force_white: bool = False,
    counters: Optional[Dict[Tuple[str, str], int]] = None,
) -> Tuple[str, Any]:
    """A table cell paragraph as (HTML, editor JSON). The JSON is the paragraph node, None when the
    paragraph writes nothing, or _NOT_WRITTEN when it holds content the JSON writer does not cover."""
    equation = _equation_paragraph_html(p)
    if equation is not None:
        return equation, _NOT_WRITTEN
    items = _read_inline(p, doc_parts)
    inner = _write_inline_html(items)
    if not inner.strip():
        return "", None
    marker = _cell_marker(p, counters if counters is not None else {})
    if marker:
        inner = f"{marker}<span data-tab></span>{inner}"
        # The marker is bare text and a tab ahead of the content.
        items = [TextRun(marker + "\t", RunProps())] + items
    alignment = _get_paragraph_alignment(p)
    align_style = f"text-align:{alignment};" if alignment != "left" else ""
    color_style = "color:#ffffff;" if force_white else ""
    indent = _paragraph_indent_css(p)
    pieces = [align_style, color_style, "margin:0", _paragraph_font_css(p), _paragraph_spacing_css(p), indent]
    css = "; ".join(piece.rstrip("; ") for piece in pieces if piece) + ";"
    open_tag = f'<p style="{css}"{_tab_attributes(p, inner)}>'
    html = f"{open_tag}{inner}</p>"
    tabs = (json.dumps(_paragraph_tab_stops(p), separators=(",", ":")), str(_default_tab_px(p))) if "data-tab" in inner else None
    if any(isinstance(item, Picture) for item in items):
        html = _split_paragraph_at_pictures(open_tag, inner) or html
        # A picture in a cell paragraph splits it as in the body (cells keep no picture-only shortcut).
        if any(isinstance(item, Picture) and item.wraps for item in items):
            return html, _NOT_WRITTEN
        split = _write_picture_split_json(items, css, tabs, None, lines="text")
        return html, _with_overlay(split, items) if split is not None else _NOT_WRITTEN
    content = _write_inline_json(items, lines="text")
    if content is None:
        return html, _NOT_WRITTEN
    return html, _with_overlay([_write_paragraph_json(css, tabs, content)], items)[0]


def _cell_paragraph_to_html(
    p: Paragraph,
    doc_parts: Dict[str, bytes],
    force_white: bool = False,
    counters: Optional[Dict[Tuple[str, str], int]] = None,
) -> str:
    """Format paragraphs inside table cells compactly without ballooning cell heights.

    A cell paragraph keeps its own indents and, when Word numbers or bullets it, its
    marker (drawn as text and a tab, which the paragraph's tab stop lines up).
    """
    return _cell_paragraph(p, doc_parts, force_white, counters)[0]

def _text_width_px(doc: docx.Document) -> Optional[float]:
    """Printable width of the first section in CSS pixels, or None when unreadable."""
    try:
        section = doc.sections[0]
        return float(section.page_width - section.left_margin - section.right_margin) / EMU_PER_INCH * 96.0
    except Exception:
        return None


def _tc_width_px(tc: Any) -> Optional[float]:
    """Width of a table cell from its w:tcW (twips) in px, or None when not a dxa width."""
    width = tc.find(qn("w:tcPr") + "/" + qn("w:tcW"))
    if width is not None and width.get(qn("w:type")) == "dxa" and width.get(qn("w:w")):
        return int(width.get(qn("w:w"))) * TWIPS_PER_PX
    return None


def _table_rows(tbl: Any) -> List[List[Dict[str, Any]]]:
    """Resolve every row of a w:tbl into cells with grid column, span and vertical-merge state."""
    rows: List[List[Dict[str, Any]]] = []
    for tr in tbl.findall(qn("w:tr")):
        tr_pr = tr.find(qn("w:trPr"))
        grid_before = tr_pr.find(qn("w:gridBefore")) if tr_pr is not None else None
        column = int(grid_before.get(qn("w:val")) or 0) if grid_before is not None else 0
        cells: List[Dict[str, Any]] = []
        for child in tr:
            tcs = [child] if child.tag == qn("w:tc") else (
                [c for c in child.iter(qn("w:tc"))] if child.tag == qn("w:sdt") else []
            )
            for tc in tcs:
                tc_pr = tc.find(qn("w:tcPr"))
                span_el = tc_pr.find(qn("w:gridSpan")) if tc_pr is not None else None
                span = int(span_el.get(qn("w:val")) or 1) if span_el is not None else 1
                merge_el = tc_pr.find(qn("w:vMerge")) if tc_pr is not None else None
                merge = None
                if merge_el is not None:
                    merge = "restart" if merge_el.get(qn("w:val")) == "restart" else "continue"
                cells.append({"el": tc, "col": column, "span": span, "merge": merge, "rowspan": 1, "skip": merge == "continue"})
                column += span
        rows.append(cells)
    # A restart cell spans down through the continuation cells that follow at the same grid column.
    for r, cells in enumerate(rows):
        for cell in cells:
            if cell["merge"] != "restart":
                continue
            for below in rows[r + 1:]:
                match = next((c for c in below if c["col"] == cell["col"] and c["merge"] == "continue"), None)
                if match is None:
                    break
                cell["rowspan"] += 1
    return rows


def _table_column_px(tbl: Any, rows: List[List[Dict[str, Any]]], text_width_px: Optional[float]) -> List[float]:
    """Column widths in px: the table grid, or the cells' own widths when the grid is uniform.

    pdf2docx writes equal gridCol values and puts the real widths in each
    cell's w:tcW; the result is scaled down to the printable width.
    """
    grid_el = tbl.find(qn("w:tblGrid"))
    grid = [int(g.get(qn("w:w"))) * TWIPS_PER_PX for g in grid_el.findall(qn("w:gridCol")) if g.get(qn("w:w"))] if grid_el is not None else []
    if len(grid) > 1 and len({round(w) for w in grid}) == 1 and rows:
        first = rows[0]
        widths = [_tc_width_px(c["el"]) for c in first if c["span"] == 1]
        if len(widths) == len(grid) and all(w is not None for w in widths) and len({round(w) for w in widths}) > 1:
            grid = [float(w) for w in widths]
    if not grid and rows:
        widths = [_tc_width_px(c["el"]) for c in rows[0]]
        grid = [w for w in widths if w is not None]
    total = sum(grid)
    if text_width_px and total > text_width_px:
        grid = [w * text_width_px / total for w in grid]
    return grid


def _column_size_attribute(rows: List[List[Dict[str, Any]]], col_px: List[float]) -> str:
    """data-column-size (percent per column) for the editor's grid tables.

    The editor lays a row out as one grid track per column of the WIDEST row (a
    cell with colspan 2 takes two tracks), so the list is only valid when that
    count equals the number of grid columns; otherwise the editor falls back to
    equal columns.
    """
    widest = max((sum(cell["span"] for cell in cells) for cells in rows), default=0)
    total = sum(col_px)
    if not col_px or widest != len(col_px) or total <= 0:
        return ""
    percents = [round(w / total * 100, 2) for w in col_px]
    return ' data-column-size="' + ",".join(f"{p:g}" for p in percents) + '"'


_BORDER_EDGES = ("top", "left", "bottom", "right")


def _style_chain_elements(table: Table) -> List[Any]:
    """The table's style and the styles it is based on, nearest first (as XML elements)."""
    chain: List[Any] = []
    try:
        style = table.style
        while style is not None and len(chain) < 8:
            chain.append(style.element)
            style = style.base_style
    except Exception:
        pass
    return chain


def _border_set(container: Any) -> Dict[str, Optional[str]]:
    """Borders under a w:tblBorders / w:tcBorders element as CSS ("1pt solid #000"), None for no border."""
    found: Dict[str, Optional[str]] = {}
    if container is None:
        return found
    for edge in container:
        name = edge.tag.split("}")[-1]
        if name == "start":
            name = "left"
        elif name == "end":
            name = "right"
        value = edge.get(qn("w:val"))
        if value in (None, "nil", "none"):
            found[name] = None
            continue
        size = float(edge.get(qn("w:sz")) or 4) / 8.0  # eighths of a point
        color = edge.get(qn("w:color"))
        color = "#000000" if color in (None, "auto") else f"#{color}"
        found[name] = f"{max(size, 0.5):g}pt {'double' if value == 'double' else 'solid'} {color}"
    return found


def _table_borders(table: Table) -> Dict[str, Optional[str]]:
    """Effective table-level borders: the table's own, else the nearest style that defines them."""
    tbl = table._element
    direct = _border_set(tbl.find(qn("w:tblPr") + "/" + qn("w:tblBorders")))
    if direct:
        return direct
    for element in _style_chain_elements(table):
        found = _border_set(element.find(qn("w:tblPr") + "/" + qn("w:tblBorders")))
        if found:
            return found
    return {}


def _table_cell_margins(table: Table) -> Dict[str, float]:
    """Default cell padding in px per side: tblCellMar (direct, else style), else Word's 0.08in left/right."""
    margins = {"top": 0.0, "left": 7.2 * 96 / 72, "bottom": 0.0, "right": 7.2 * 96 / 72}
    sources = [table._element.find(qn("w:tblPr") + "/" + qn("w:tblCellMar"))]
    sources += [el.find(qn("w:tblPr") + "/" + qn("w:tblCellMar")) for el in _style_chain_elements(table)]
    for source in sources:
        if source is None:
            continue
        for child in source:
            name = {"start": "left", "end": "right"}.get(child.tag.split("}")[-1], child.tag.split("}")[-1])
            width = child.get(qn("w:w"))
            if name in margins and width and child.get(qn("w:type")) in (None, "dxa"):
                margins[name] = float(width) * TWIPS_PER_PX
        break
    # A PDF has no cell padding to carry over; columns set flush against each other would run together.
    if getattr(table.part, "_is_pdf_import", False):
        margins["pdf"] = 1.0
        if margins["left"] == 0 and margins["right"] == 0:
            margins["left"] = margins["right"] = 9.6
    return margins


def _cell_padding_px(tc: Any, default: Dict[str, float]) -> Dict[str, float]:
    """Padding of one cell in px per side: its own tcMar over the table's default cell margins."""
    margins = dict(default)
    mar = tc.find(qn("w:tcPr") + "/" + qn("w:tcMar"))
    if mar is not None:
        for child in mar:
            name = {"start": "left", "end": "right"}.get(child.tag.split("}")[-1], child.tag.split("}")[-1])
            width = child.get(qn("w:w"))
            if name in margins and width:
                margins[name] = float(width) * TWIPS_PER_PX
    if default.get("pdf") and margins["left"] == 0 and margins["right"] == 0:
        margins["left"] = margins["right"] = 9.6
    if default.get("pdf"):
        # A PDF's narrow columns ("Talk-To-Your-Slides" in a 53px column) have no room for full padding:
        # 9.6px a side left a third of the width and the header wrapped onto extra lines.
        width_el = tc.find(qn("w:tcPr") + "/" + qn("w:tcW"))
        raw = width_el.get(qn("w:w")) if width_el is not None else None
        if raw and raw.isdigit() and width_el.get(qn("w:type")) in (None, "dxa"):
            cap = max(_PDF_MIN_CELL_PADDING_PX, _PDF_CELL_PADDING_SHARE * float(raw) * TWIPS_PER_PX)
            margins["left"] = min(margins["left"], cap)
            margins["right"] = min(margins["right"], cap)
    return margins


# PDF table cells keep at most this share of their width as padding on each side (and at least 2px).
_PDF_CELL_PADDING_SHARE = 0.06
_PDF_MIN_CELL_PADDING_PX = 2.0


def _cell_padding_css(tc: Any, default: Dict[str, float]) -> str:
    """CSS padding of one cell, as longhands (the editor's style whitelist drops the "padding" shorthand)."""
    margins = _cell_padding_px(tc, default)
    return "; ".join(f"padding-{side}:{margins[side]:g}px" for side in _BORDER_EDGES)


def _cell_vertical_align(tc: Any) -> str:
    """CSS vertical-align of a cell (Word's w:vAlign; top when unset)."""
    value = tc.find(qn("w:tcPr") + "/" + qn("w:vAlign"))
    return {"center": "middle", "bottom": "bottom"}.get(value.get(qn("w:val")) if value is not None else "", "top")


def _row_height_px(tc: Any) -> Optional[float]:
    """Height (px) Word gives the row holding this cell (w:trHeight), if any."""
    row = tc.getparent()
    height = row.find(qn("w:trPr") + "/" + qn("w:trHeight")) if row is not None else None
    if height is None or not height.get(qn("w:val")):
        return None
    return round(float(height.get(qn("w:val"))) * TWIPS_PER_PX, 1)


def _cell_edge_css(table_borders: Dict[str, Optional[str]], tc: Any, row: int, last_row: int, column: int, last_column: int) -> str:
    """CSS borders of one cell: its own tcBorders over the table's outer/inside borders."""
    own = _border_set(tc.find(qn("w:tcPr") + "/" + qn("w:tcBorders")))
    outer = {"top": row == 0, "bottom": row == last_row, "left": column == 0, "right": column == last_column}
    inside = {"top": "insideH", "bottom": "insideH", "left": "insideV", "right": "insideV"}
    parts: List[str] = []
    for edge in _BORDER_EDGES:
        if edge in own:
            value = own[edge]
        else:
            value = table_borders.get(edge if outer[edge] else inside[edge])
        parts.append(f"border-{edge}:{value or 'none'}")
    return "; ".join(parts)


def _paragraph_height_px(p: Paragraph, width_px: float) -> float:
    """Rough height of a paragraph in a cell: its spacing plus its wrapped lines at Word's line height.

    Only used to decide which row of a vertically merged cell a paragraph starts in, so a line of error
    matters only for a paragraph that starts within a line of a row boundary.
    """
    size_pt = _resolve_font_size_pt(p) or 11.0
    size_px = size_pt * 96.0 / 72.0
    before = int(_resolve_spacing_attr(p, "before") or 0) * TWIPS_PER_PX
    after = int(_resolve_spacing_attr(p, "after") or 0) * TWIPS_PER_PX
    line = _resolve_spacing_attr(p, "line")
    rule = _resolve_spacing_attr(p, "lineRule") or "auto"
    if line and line != "0" and rule in ("exact", "atLeast"):
        line_px = int(line) / 20.0 * 96.0 / 72.0
    else:
        factor = _FONT_LINE_FACTORS.get((_resolve_font_name(p) or "").lower(), _DEFAULT_LINE_FACTOR)
        line_px = size_px * factor * (int(line) / 240.0 if line and line != "0" else 1.0)
    characters = sum(len(t.text or "") for t in p._p.iter(qn("w:t")))
    breaks = len(p._p.findall(".//" + qn("w:br")))
    wrapped = max(1, math.ceil(characters * 0.5 * size_px / max(width_px, 20.0))) if characters else 1
    return before + (wrapped + breaks) * line_px + after


def _merged_cell_chunks(table: Table, rows: List[List[Dict[str, Any]]], col_px: List[float]) -> Dict[Tuple[int, int], List[Any]]:
    """For a cell merged down several rows, the paragraphs that start in each of those rows.

    The editor cannot take real row spans (its paginator loops on them), so a merged cell's content sits
    in its first row, which then grows to hold all of it while the rows below keep their own height: the
    merged text is counted twice. Word lays the text down across the merged area, so each paragraph is put
    in the row where it starts, given the rows' set heights. Applies only when every spanned row but the
    last has a set height and the cell holds plain paragraphs; anything else keeps the single-row layout.
    Keyed by (row index, grid column); a row's chunk can be empty.
    """
    chunks: Dict[Tuple[int, int], List[Any]] = {}
    for r, cells in enumerate(rows):
        for cell in cells:
            if cell["merge"] != "restart" or cell["rowspan"] < 2:
                continue
            blocks = list(_iter_block_elements(cell["el"]))
            if len(blocks) < 2 or any(b.tag != qn("w:p") for b in blocks):
                continue
            spanned = rows[r : r + cell["rowspan"]]
            heights = [_row_height_px(row[0]["el"]) if row else None for row in spanned[:-1]]
            if any(h is None or h <= 2 for h in heights):
                continue
            pad = _cell_padding_px(cell["el"], {"top": 0.0, "bottom": 0.0, "left": 0.0, "right": 0.0})
            ends: List[float] = []
            total = 0.0
            for h in heights:
                total += float(h or 0.0) + pad["top"] + pad["bottom"]
                ends.append(total)
            width = (sum(col_px[cell["col"] : cell["col"] + cell["span"]]) or _tc_width_px(cell["el"]) or 300.0) - pad["left"] - pad["right"]
            found: List[List[Any]] = [[] for _ in spanned]
            y, k = pad["top"], 0
            for element in blocks:
                paragraph = Paragraph(element, table)
                # The row is the one the paragraph's text starts in (after its own space-before); text that
                # starts within a couple of pixels of a row's end belongs to the next row.
                text_top = y + int(_resolve_spacing_attr(paragraph, "before") or 0) * TWIPS_PER_PX
                while k < len(ends) and text_top >= ends[k] - 2.0:
                    k += 1
                found[k].append(element)
                y += _paragraph_height_px(paragraph, width)
            for offset, items in enumerate(found):
                chunks[(r + offset, cell["col"])] = items
    return chunks


def _table_to_html(table: Table, doc_parts: Dict[str, bytes], text_width_px: Optional[float] = None) -> str:
    """Convert a Word table to HTML with real colspan/rowspan, per-cell column widths and nested tables."""
    return _table(table, doc_parts, text_width_px)[0]


def _cell_json(style: str, span: int, blocks: List[Any]) -> Any:
    """A table cell node (or _NOT_WRITTEN). An empty cell writes &nbsp;, which the editor puts in a paragraph."""
    if any(block is _NOT_WRITTEN for block in blocks):
        return _NOT_WRITTEN
    content: List[Dict[str, Any]] = []
    for block in blocks:  # a cell paragraph split round a picture gives several nodes
        if isinstance(block, list):
            content.extend(block)
        elif block is not None:
            content.append(block)
    if not content:
        content = [_write_paragraph_json("", None, [{"type": "text", "text": "\u00a0"}])]
    # The cell's own style marks (a header cell styled font-weight:600) reach all text inside it.
    content = _with_block_marks_deep(content, style)
    return {"type": "tableCell", "attrs": {
        "colspan": span, "rowspan": 1, "colwidth": None, "style": _editor_style(style, _EDITOR_CELL_STYLE_PROPS),
        "align": None, "backgroundColor": None, "color": None,
    }, "content": content}


def _table(
    table: Table, doc_parts: Dict[str, bytes], text_width_px: Optional[float] = None, nested: bool = False
) -> Tuple[str, Any]:
    """A Word table as (HTML, editor JSON or _NOT_WRITTEN), with real colspan/rowspan, per-cell column
    widths and nested tables.

    Cells are read straight from the XML: python-docx's ``row.cells`` repeats a
    merged cell once per grid column it covers, which duplicated its text.
    """
    tbl = table._element
    rows = _table_rows(tbl)
    col_px = _table_column_px(tbl, rows, text_width_px)
    merged_chunks = _merged_cell_chunks(table, rows, col_px)
    borders = _table_borders(table)
    pad = _table_cell_margins(table)
    last_row = len(rows) - 1
    list_counters: Dict[Tuple[str, str], int] = {}

    rows_html: List[str] = []
    rows_json: List[Any] = []
    for i, cells in enumerate(rows):
        cells_html: List[str] = []
        cells_json: List[Any] = []
        tag = "td"
        last_column = len(cells) - 1

        for column, cell in enumerate(cells):
            if cell["skip"]:
                # Continuation of a vertical merge: an empty cell that hides the
                # shared border, so the merged cell still reads as one block.
                span_attr = f' colspan="{cell["span"]}"' if cell["span"] > 1 else ""
                shared = merged_chunks.get((i, cell["col"]))
                spilled = [_cell_paragraph(Paragraph(el, table), doc_parts, counters=list_counters) for el in shared] if shared else []
                spill = "".join(html for html, _ in spilled)
                skip_style = f'{_cell_edge_css(borders, cell["el"], i, last_row, column, last_column)}; border-top:none; {_cell_padding_css(cell["el"], pad)}; vertical-align:top;'
                cells_html.append(f'<{tag} style="{skip_style}"{span_attr}>{spill or "&nbsp;"}</{tag}>')
                cells_json.append(_cell_json(skip_style, cell["span"], [node for _, node in spilled] if spill else []))
                continue
            tc = cell["el"]
            bg_color = ""
            text_color = ""
            is_dark = False
            shd = tc.find(qn("w:tcPr") + "/" + qn("w:shd"))
            if shd is not None and shd.get(qn("w:fill")):
                fill = shd.get(qn("w:fill"))
                if fill and fill != "auto" and fill.lower() not in ("ffffff", "none"):
                    bg_color = f"background-color:#{fill};"
                    if _is_dark_hex(fill):
                        is_dark = True
                        text_color = "color:#ffffff; font-weight:600;"

            content_parts: List[str] = []
            content_json: List[Any] = []
            # A cell merged down several rows keeps only the paragraphs that start in this row.
            own_blocks = merged_chunks.get((i, cell["col"])) if cell["rowspan"] > 1 else None
            for child in own_blocks if own_blocks is not None else _iter_block_elements(tc):
                if child.tag == qn("w:p"):
                    html, node = _cell_paragraph(Paragraph(child, table), doc_parts, force_white=is_dark, counters=list_counters)
                else:
                    html, node = _table(Table(child, table), doc_parts, text_width_px, nested=True)
                content_parts.append(html)
                content_json.append(node)
            cell_content = "".join(content_parts)
            if not cell_content.strip():
                cell_content = "&nbsp;"

            style_parts = [_cell_edge_css(borders, tc, i, last_row, column, last_column), _cell_padding_css(tc, pad), f"vertical-align:{_cell_vertical_align(tc)}"]
            row_height = _row_height_px(tc)
            if row_height and row_height > 2:
                # Word measures a row's set height before its cell margins: the drawn row is that plus the top and bottom padding.
                vertical = _cell_padding_px(tc, pad)
                style_parts.append(f"min-height:{row_height + vertical['top'] + vertical['bottom']:g}px")
            if bg_color:
                style_parts.append(bg_color.rstrip(";"))
            if text_color:
                style_parts.append(text_color.rstrip(";"))
            if cell["rowspan"] > 1:
                # Rowspans are not emitted: the editor's paginator loops forever
                # on a tall table that needs row groups. Keep the content in the
                # first row and hide the border it shares with the rows below.
                style_parts.append("border-bottom:none")
            cell_style = "; ".join(style_parts) + ";"

            attrs = [f'style="{cell_style}"']
            if cell["span"] > 1:
                attrs.append(f'colspan="{cell["span"]}"')
            cells_html.append(f'<{tag} {" ".join(attrs)}>{cell_content}</{tag}>')
            cells_json.append(_cell_json(cell_style, cell["span"], content_json if cell_content != "&nbsp;" else []))

        rows_html.append(f"<tr>{''.join(cells_html)}</tr>")
        rows_json.append(_NOT_WRITTEN if any(cell is _NOT_WRITTEN for cell in cells_json) else {"type": "tableRow", "content": cells_json})

    table_css = "border-collapse:collapse; width:100%; margin:0; table-layout:fixed;"
    column_size = _column_size_attribute(rows, col_px)
    html = f'<table style="{table_css}"{column_size}>{"".join(rows_html)}</table>'
    if any(row is _NOT_WRITTEN for row in rows_json):
        return html, _NOT_WRITTEN
    sizes = re.search(r'data-column-size="([^"]*)"', column_size)
    raw = sizes.group(1) if sizes else ""
    # tiptap-table-plus keeps the list only when every entry is a number.
    columns = raw if all(re.fullmatch(r"-?[\d.]*", part) for part in raw.split(",")) else ""
    # The HTML parser puts the rows in a <tbody>, which tiptap-table-plus reads as one row group; its
    # regrouping (by rowspan, and every row here spans one) rebuilds the table with plain rows only when
    # that changes the grouping, so a table of one row keeps its group. The regrouping does not look
    # inside tables, so a nested table always keeps the one group of all its rows.
    grouped = nested or len(rows_json) == 1
    content = [{"type": "tableRowGroup", "content": rows_json}] if grouped else rows_json
    return html, {"type": "table", "attrs": {"alignment": "center", "columnSize": columns, "inset": None, "span": None}, "content": content}


def _body_to_html(*args: Any, **kwargs: Any) -> str:
    """The document body as the editor's HTML (see _write_body_html); records paragraph JSON when measured."""
    _STATE.in_body = True
    _STATE.in_toc = False
    try:
        return _write_body_html(*args, **kwargs)
    finally:
        _STATE.in_body = False


def _write_body_html(
    doc: docx.Document,
    doc_parts: Dict[str, bytes],
    page_break_after: Optional[Set[Any]] = None,
) -> str:
    """Build the document body HTML, including properly nested lists.

    ``page_break_after`` holds the body paragraphs that end a page (a next-page
    section break); a page break is emitted before the element that follows
    each one. A marked paragraph left blank is dropped so page ends do not
    gain a stray blank line. Paragraphs with "page break before" start a page
    too, unless the previous element already ended one.
    """
    num_to_abstract, abstract_levels = _build_numbering_map(doc)
    text_width = _text_width_px(doc)
    out: List[str] = []
    stack: List[Dict[str, str]] = []
    open_li_depth: Optional[int] = None
    pending_page_break = False
    # Items seen so far per (numId, level): a numbered list interrupted by other
    # paragraphs reopens with <ol start="n"> so Word's numbering carries on.
    item_counts: Dict[Tuple[str, int], int] = {}

    # The editor JSON of the open lists and items, built alongside the HTML.
    json_lists: List[Dict[str, Any]] = []
    json_items: List[Dict[str, Any]] = []
    json_root: Dict[str, Any] = {}
    # The JSON of each `out` entry, kept in step with it: a list of nodes, [] for an entry that adds
    # none of its own (list tags), None when not written, or a list's root {"node", "ok"}.
    jout: List[Any] = []

    def close_list() -> None:
        nonlocal open_li_depth
        if open_li_depth == len(stack):
            out.append("</li>")
            jout.append([])
            open_li_depth = None
            if json_items:
                _close_list_item_json(json_items.pop())
        out.append(f"</{stack.pop()['kind']}>")
        jout.append([])
        if json_lists:
            json_lists.pop()
        # The <li> that contained this (nested) list is now complete.
        if len(stack) > 0:
            out.append("</li>")
            jout.append([])
            open_li_depth = None
            if json_items:
                _close_list_item_json(json_items.pop())

    def close_all_lists() -> None:
        while stack:
            close_list()

    def emit_page_break(section: Optional[int] = None) -> None:
        """Start a new page unless the output already ends with a page break.

        A page that opens a new Word section carries the section's number, so the
        editor can give it that section's header, footer and page numbering.
        """
        close_all_lists()
        # Blank lines before a break stay: when a full page pushes them over, Word
        # leaves the blank page they make, and every later page depends on it.
        marked = _PAGE_BREAK_HTML if section is None else _PAGE_BREAK_HTML.replace(" />", f' data-section="{section}" />')
        node = {"type": "pageBreak", "attrs": {"height": 0, "section": section, "sectionProps": None}}
        if out and out[-1] == _PAGE_BREAK_HTML and section is not None:
            out[-1] = marked
            jout[-1] = [node]
        elif not out or out[-1] not in (_PAGE_BREAK_HTML, marked):
            out.append(marked)
            jout.append([node])

    def emit_textboxes(element: Any) -> None:
        """Text-box paragraphs anchored to a paragraph, as ordinary paragraphs after it."""
        for box_p in _textbox_paragraphs(element):
            html = _paragraph_to_html(Paragraph(box_p, doc), doc_parts)
            if html and not html.startswith('<p class="empty-spacer"'):
                close_all_lists()
                out.append(html)
                jout.append(_STATE.last_paragraph_nodes)

    section_no = 0
    section_starts: Dict[int, int] = {0: 0}
    previous_closed_section = False
    for element in _iter_block_elements(doc.element.body):
        if previous_closed_section:
            section_no += 1
            close_all_lists()
            section_starts[section_no] = len(out)
        previous_closed_section = element.tag == qn("w:p") and element.find(qn("w:pPr") + "/" + qn("w:sectPr")) is not None
        if page_break_after is not None:
            if pending_page_break:
                emit_page_break(section_no)
            pending_page_break = element in page_break_after

        if element.tag == qn("w:p"):
            p = Paragraph(element, doc)
            _toc_region_step(p)
            if _paragraph_page_break_before(p):
                emit_page_break()
            info = _paragraph_list_info(p, num_to_abstract, abstract_levels)
            if info is None:
                close_all_lists()
                html = _paragraph_to_html(p, doc_parts)
                nodes = _STATE.last_paragraph_nodes
                if pending_page_break and html.startswith('<p class="empty-spacer"'):
                    continue
                if html:
                    out.append(html)
                    jout.append(nodes)
                emit_textboxes(element)
                continue

            kind = info["kind"]
            # Count this item first: a marker like "1.1" is built from the counters of the levels above.
            count_key = (info["num_id"], info["level"])
            item_counts[count_key] = item_counts.get(count_key, 0) + 1
            # A new item at this level restarts the deeper levels of the same list, except levels set to keep counting.
            levels_table = _numbering_geometry(p.part)
            for deeper in [k for k in item_counts if k[0] == info["num_id"] and k[1] > info["level"]]:
                if not levels_table.get((deeper[0], str(deeper[1])), {}).get("keeps_counting"):
                    del item_counts[deeper]
            ordinal = item_counts[count_key]
            if kind == "ol":
                info["marker"] = _literal_marker(p.part, info["num_id"], info["level"], item_counts)
            # The item carries its text size: the marker is drawn in the item's font, not its paragraph's.
            size_css = _paragraph_font_css(p)
            item_html = _paragraph_to_html(p, doc_parts, list_info=info)
            # data-flat: Word puts no space around a list or between its items (the paragraphs carry it all).
            item_open = f'<li data-flat="1" style="{size_css}">' if size_css else '<li data-flat="1">'
            item_attrs: Dict[str, Any] = {
                "style": _editor_style(size_css) if size_css else None, "markerX": None, "markerTop": None,
                "markerPre": None, "markerPost": None, "flat": "1", "markerText": None,
            }
            geometry = _list_item_geometry(p, info)
            if geometry:
                # The marker is drawn by the editor at Word's x, in the item's own font and line box.
                spacing = _paragraph_spacing_css(p)
                top = re.search(r"margin-top:\s*([\d.]+)px", spacing)
                line = re.search(r"line-height:\s*([\d.]+(?:px|pt)?)", spacing)
                family = re.search(r"font-family:\s*([^\";]+)", item_html)
                style = "; ".join(
                    part
                    for part in (
                        size_css,
                        f"line-height:{line.group(1)}" if line else "",
                        f"font-family:{family.group(1).strip()}" if family else "",
                    )
                    if part
                )
                attrs = (
                    f' data-mx="{geometry["marker_x"]:g}" data-mt="{top.group(1) if top else 0}"'
                    f' data-pre="{_html_escape(geometry["pre"], quote=True)}" data-post="{_html_escape(geometry["post"], quote=True)}"'
                )
                if geometry.get("marker"):
                    # The number is written out (it joins several counters or restarts), not drawn from the list's counter.
                    attrs += f' data-marker="{_html_escape(geometry["marker"], quote=True)}"'
                item_open = f'<li data-flat="1"{attrs} style="{style}">' if style else f'<li data-flat="1"{attrs}>'
                item_attrs.update({
                    "style": _editor_style(style) if style else None,
                    "markerX": f"{geometry['marker_x']:g}", "markerTop": top.group(1) if top else "0",
                    "markerPre": geometry["pre"], "markerPost": geometry["post"], "markerText": geometry.get("marker") or None,
                })
            # Lists open one nesting level at a time and remember the Word level they hold: a lettered
            # sublist whose first item has no numbered parent starts at the top (no stray empty "1."),
            # and its later items stay siblings instead of nesting deeper.
            while stack and stack[-1].get("level", -1) > info["level"]:
                close_list()
            target_depth = len(stack) if stack and stack[-1].get("level") == info["level"] else len(stack) + 1

            # Same depth but different kind -> close and reopen as the new kind.
            if stack and len(stack) == target_depth and stack[-1]["kind"] != kind:
                close_list()
            # Another numbered list (a restart) at the same depth is a new <ol>.
            if stack and len(stack) == target_depth and stack[-1].get("num_id") not in (None, info["num_id"]):
                close_list()
                ordinal = 1

            measuring = (_JSON_LIST_SINK is not None and _STATE.in_body) or _BUILD_JSON
            if len(stack) == target_depth and stack:
                # Continuing an existing list at this depth -> new sibling item.
                if open_li_depth == target_depth:
                    out.append("</li>")
                    jout.append([])
                    if measuring and json_items:
                        _close_list_item_json(json_items.pop())
                out.append(item_open)
                jout.append([])
                open_li_depth = target_depth
            else:
                # Open nested list(s) (inside the current open <li>) or a fresh list.
                while len(stack) < target_depth:
                    opens_this_item = len(stack) + 1 == target_depth
                    stack.append({"kind": kind, "num_id": info["num_id"] if opens_this_item else None, "level": info["level"]})
                    start_attr = f' start="{ordinal}"' if kind == "ol" and opens_this_item and ordinal > 1 else ""
                    type_attr = ""
                    list_type = None
                    if kind == "ol" and opens_this_item:
                        list_type = _LIST_TYPES.get(info.get("fmt", ""))
                        type_attr = f' type="{list_type}"' if list_type else ""
                    opening = f"<{kind}{start_attr}{type_attr}>"
                    if measuring:
                        node: Dict[str, Any] = {"type": "orderedList" if kind == "ol" else "bulletList", "content": []}
                        if kind == "ol":
                            node["attrs"] = {"start": ordinal if start_attr else 1, "type": list_type}
                        root_entry: Any = []
                        if json_items:
                            json_items[-1]["content"].append(node)
                        else:
                            json_root = {"node": node, "ok": True}
                            root_entry = json_root
                            if _JSON_LIST_SINK is not None and _STATE.in_body:
                                _JSON_LIST_SINK.append(json_root)
                                opening = f"<{kind}{start_attr}{type_attr} data-sink-list=\"{len(_JSON_LIST_SINK) - 1}\">"
                        json_lists.append(node)
                        jout.append(root_entry)
                    else:
                        jout.append([])
                    out.append(opening)
                out.append(item_open)
                jout.append([])
                open_li_depth = target_depth
            if measuring and json_lists:
                item_node = _list_item_json(item_attrs)
                json_lists[-1]["content"].append(item_node)
                json_items.append(item_node)
                list_items, list_css = _STATE.last_list_paragraph or ([], None)
                if list_css is not None:
                    content = _write_inline_json(list_items, lines="drop")
                    if content is None:
                        json_root["ok"] = False
                    else:
                        item_node["content"].extend(_with_overlay([_write_paragraph_json(f"{list_css};" if list_css else "", None, content)], list_items))

            out.append(item_html)
            jout.append([])
            emit_textboxes(element)

        elif element.tag == qn("w:tbl"):
            close_all_lists()
            html, node = _table(Table(element, doc), doc_parts, text_width)
            if _JSON_TABLE_SINK is not None and _STATE.in_body:
                _JSON_TABLE_SINK.append(None if node is _NOT_WRITTEN else node)
                # Measurement only: tag the table so the measurement can tell which ones stay in the body.
                html = re.sub(r"^(<table\b[^>]*)>", lambda m: f'{m.group(1)} data-sink-table="{len(_JSON_TABLE_SINK) - 1}">', html, count=1)
            out.append(html)
            jout.append(None if node is _NOT_WRITTEN else [node])

    close_all_lists()
    section_starts[section_no + 1] = len(out)
    _wrap_columns(doc, out, section_starts, jout)
    if not _is_pdf(doc):
        _mark_continuous_sections(doc, out, section_starts, jout)
    _group_wrapped_pictures(out, jout)
    _STATE.last_body_json = jout
    return "\n".join(out).replace(_COLUMN_MARK, "")


def _body_nodes(entries: List[Any]) -> Optional[List[Dict[str, Any]]]:
    """The body's editor nodes from the JSON kept in step with its HTML entries (None if any is not written)."""
    nodes: List[Dict[str, Any]] = []
    for entry in entries:
        if entry is None:
            return None
        if isinstance(entry, dict):  # a list's root
            if not entry["ok"]:
                return None
            nodes.append(entry["node"])
        else:
            nodes.extend(entry)
    return nodes


def _section_kind(sect_pr: Any) -> str:
    """How a section starts: nextPage (Word's default), continuous, evenPage or oddPage."""
    start = sect_pr.find(qn("w:type")) if sect_pr is not None else None
    kind = start.get(qn("w:val")) if start is not None else None
    return kind if kind in ("nextPage", "continuous", "evenPage", "oddPage") else "nextPage"


def _mark_continuous_sections(doc: docx.Document, out: List[str], starts: Dict[int, int], jout: Optional[List[Any]] = None) -> None:
    """Put a section mark where each continuous section starts, top level, before its first block, and
    one at the very start for section 0 (its properties are on no break) when there are several sections.

    Runs after the column wrapping, which indexes `out` by section start: a mark added earlier would be
    wrapped into a column.
    """
    sections = list(doc.sections)
    if len(sections) < 2:
        return
    for index in sorted(starts, reverse=True):
        if index == 0 or (index < len(sections) and _section_kind(sections[index]._sectPr) == "continuous"):
            at = min(starts[index], len(out))
            out.insert(at, _SECTION_MARK_HTML.format(index=index))
            if jout is not None:
                jout.insert(at, [{"type": "sectionMark", "attrs": {"section": index, "sectionProps": None}}])


def _section_props(section: Any, described: Dict[str, Any]) -> Dict[str, Any]:
    """One section's properties as the editor's SectionProps (frontend/src/lib/sectionProps.ts), in px."""
    sect_pr = section._sectPr

    def px(emu: Any, fallback: float) -> float:
        return round((emu if emu is not None else fallback) / EMU_PER_PX, 1)

    cols = sect_pr.find(qn("w:cols"))
    count, gap, widths = 1, 48.0, None
    if cols is not None:
        count = max(1, int(cols.get(qn("w:num")) or 1))
        space = cols.get(qn("w:space"))
        gap = round(int(space) * TWIPS_PER_PX, 1) if space and space.isdigit() else 48.0
        explicit = [c.get(qn("w:w")) for c in cols.findall(qn("w:col"))]
        if cols.get(qn("w:equalWidth")) in ("0", "false") and len(explicit) == count and all(w and w.isdigit() for w in explicit):
            widths = [round(int(w) * TWIPS_PER_PX, 1) for w in explicit]
    width, height = px(section.page_width, 7772400), px(section.page_height, 10058400)
    return {
        "kind": _section_kind(sect_pr),
        "page": {"width": width, "height": height},
        "orientation": "landscape" if width > height else "portrait",
        "margins": {
            "top": px(section.top_margin, 914400),
            "right": px(section.right_margin, 914400),
            "bottom": px(section.bottom_margin, 914400),
            "left": px(section.left_margin, 914400),
            # As _extract_sections reads them (a 0 distance counts as unset, 0.5in), so the headers and
            # footers drawn from these properties sit exactly where they did from page_layout.
            "header": round((section.header_distance or 457200) / EMU_PER_PX, 1),
            "footer": round((section.footer_distance or 457200) / EMU_PER_PX, 1),
            "gutter": px(section.gutter, 0),
        },
        "columns": {"count": count, "gap": gap, "widths": widths},
        "headers": {"default": described.get("header"), "first": described.get("first_header"), "even": None},
        "footers": {"default": described.get("footer"), "first": described.get("first_footer"), "even": None},
        "titlePage": bool(described.get("title_pg")),
        "numbering": {"start": described.get("number_start"), "format": described.get("number_format") or "decimal"},
    }


_SECTION_TAG = re.compile(r'<(?:hr class="page-break"|div class="intellidocs-section-mark")[^>]*\bdata-section="(\d+)"[^>]*?/?>')


def _attach_section_props(html: str, doc: docx.Document, hf: Dict[str, Any]) -> str:
    """Give every section break the properties of the section it starts (data-section-props, JSON).
    PDF imports get none: pdf2docx's sections are its pages, not the document's sections."""
    if _is_pdf(doc):
        return html
    sections = list(doc.sections)
    described = {entry["index"]: entry for entry in hf.get("sections", [])}

    def attach(match: re.Match) -> str:
        tag, index = match.group(0), int(match.group(1))
        if index >= len(sections) or "data-section-props" in tag:
            return tag
        props = _html_escape(json.dumps(_section_props(sections[index], described.get(index, {})), separators=(",", ":")), quote=True)
        closing = " />" if tag.endswith("/>") else ">"
        return tag[: -len(closing)] + f' data-section-props="{props}"' + closing

    return _SECTION_TAG.sub(attach, html)


def _block_height_px(html: str, width_px: float) -> float:
    """Rough height of a paragraph at a text width, to see how far a wrapped picture reaches."""
    size = re.search(r"font-size:\s*([\d.]+)pt", html)
    size_px = float(size.group(1)) * 96 / 72 if size else 14.67
    line = re.search(r"line-height:\s*([\d.]+)(pt)?", html)
    if line is None:
        line_px = size_px * 1.2
    else:
        line_px = float(line.group(1)) * 96 / 72 if line.group(2) else float(line.group(1)) * size_px
    characters = len(re.sub(r"<[^>]+>", "", html))
    lines = max(1, math.ceil(characters * size_px * 0.5 / max(width_px, 1.0)))
    margins = sum(float(m) for m in re.findall(r"margin-(?:top|bottom):\s*([\d.]+)px", html.split(">", 1)[0]))
    return lines * line_px + margins


def _group_wrapped_pictures(out: List[str], jout: Optional[List[Any]] = None) -> None:
    """Put each wrapped picture and the paragraphs it reaches into one block (WrapBlock in the editor)."""
    index = len(out) - 1
    while index >= 0:
        reach = re.search(r' data-wrap-reach="([\d.]+)"', out[index])
        if reach is None:
            index -= 1
            continue
        width = re.search(r"width: (\d+)px", out[index])
        column = _PAGE_GEOMETRY["w"] - _PAGE_GEOMETRY["l"] - _PAGE_GEOMETRY["r"]
        beside = column - (float(width.group(1)) if width else 0.0)
        end, covered = index, 0.0
        while end < len(out) and (end == index or covered < float(reach.group(1))):
            if not out[end].startswith(("<p", "<h", "<img")) or out[end].startswith("<p class=\"rule-line\""):
                break
            covered += _block_height_px(out[end], beside)
            end += 1
        top = re.search(r' data-wrap-top="([\d.]+)"', out[index])
        out[index] = out[index].replace(reach.group(0), "", 1).replace(top.group(0), "", 1)
        if end > index:
            # The picture leads the block: left inside its paragraph, the editor would split that
            # paragraph round it and leave an empty line above.
            first = re.sub(r"^(<p\b[^>]*>)(<img\b[^>]*/>)", r"\2\1", out[index], count=1)
            out[index:end] = [f'<div class="intellidocs-wrap" data-top="{top.group(1)}">{first}{"".join(out[index + 1:end])}</div>']
            if jout is not None:
                inner = _body_nodes(jout[index:end])
                jout[index:end] = [None if inner is None else [{"type": "wrapBlock", "attrs": {"top": float(top.group(1))}, "content": inner}]]
        else:
            # Not a block that can be grouped (a picture in a list item). A float outside a wrap block
            # would land below the last page, so it stays a plain block on its side.
            out[index] = re.sub(r"float: (\w+); margin: [^;]+;", lambda m: f"margin: {'0 0 0 auto' if m[1] == 'right' else '0 auto 0 0'};", out[index], count=1)
            if jout is not None:
                jout[index] = None  # a picture left in its paragraph with a changed style: not written yet
        index -= 1


# A multi-column section longer than this stays single-column: the paginator cannot split a column block.
_MAX_COLUMN_ENTRIES = 40
_MAX_COLUMN_TEXT = 3000


def _column_widths(sect_pr: Any) -> List[float]:
    """Column widths (percent) of a section's w:cols, equal unless it lists its own widths; [] for one column."""
    cols = sect_pr.find(qn("w:cols"))
    if cols is None:
        return []
    count = int(cols.get(qn("w:num")) or 1)
    if count < 2:
        return []
    listed = [float(c.get(qn("w:w"))) for c in cols.findall(qn("w:col")) if c.get(qn("w:w"))]
    if cols.get(qn("w:equalWidth")) == "0" and len(listed) == count:
        total = sum(listed)
        return [round(width * 100 / total, 1) for width in listed]
    return [round(100.0 / count, 1)] * count


def _wrap_columns(doc: docx.Document, out: List[str], starts: Dict[int, int], jout: Optional[List[Any]] = None) -> None:
    """Put each short multi-column section's blocks into a column block, split at its column breaks.

    The editor lays the block out as side-by-side columns, so a header line with a
    right-hand date (two columns and a column break in Word) keeps its layout. Long
    sections, ones holding a page break and ones without a column break stay single-column.
    """
    sections = list(doc.sections)
    for index in sorted(starts, reverse=True):
        if index >= len(sections) or index + 1 not in starts:
            continue
        widths = _column_widths(sections[index]._sectPr)
        begin, end = starts[index], starts[index + 1]
        segment = out[begin:end]
        text = re.sub(r"<[^>]+>", "", "".join(segment))
        if not widths or not segment or len(segment) > _MAX_COLUMN_ENTRIES or len(text) > _MAX_COLUMN_TEXT:
            continue
        if any('<hr class="page-break"' in item for item in segment):
            continue
        # Only sections with a real column break (a header line and its date): pdf2docx marks every
        # multi-column page as columns, and wrapping those would make unsplittable blocks.
        if not any(_COLUMN_MARK in item for item in segment):
            continue
        columns: List[List[str]] = [[]]
        json_columns: List[List[Any]] = [[]]
        for position, item in enumerate(segment):
            if _COLUMN_MARK in item:
                columns.append([])
                json_columns.append([])
                item = item.replace(_COLUMN_MARK, "")
            columns[-1].append(item)
            json_columns[-1].append(jout[begin + position] if jout is not None else [])
        body = "".join('<div class="intellidocs-column">' + "\n".join(column) + "</div>" for column in columns if column)
        out[begin:end] = [f'<div class="intellidocs-columns" data-widths="{",".join(f"{w:g}" for w in widths)}">{body}</div>']
        if jout is not None:
            inner = [_body_nodes(column) for column, html_column in zip(json_columns, columns) if html_column]
            jout[begin:end] = [None if any(column is None for column in inner) else [{
                "type": "columnSection", "attrs": {"widths": ",".join(f"{w:g}" for w in widths)},
                "content": [{"type": "sectionColumn", "content": column} for column in inner],
            }]]
        # Later sections' offsets move with the replaced range.
        shift = len(segment) - 1
        for later in starts:
            if later > index:
                starts[later] -= shift


def _page_field_format(instruction: str) -> str:
    """Page-number format for a Word field instruction: 'number', 'roman', or 'none' when it is not PAGE."""
    tokens = instruction.upper().split()
    if not tokens or tokens[0] != "PAGE":
        return "none"
    return "roman" if "ROMAN" in tokens else "number"


def _paragraph_text_and_page_format(paragraph_el: Any) -> Tuple[str, str]:
    """Plain text of a header/footer paragraph with Word fields resolved.

    A PAGE field's cached result is the number it showed when the file was
    last saved ("2" on the title page of a thesis), so it is dropped from the
    text and reported as a page-number format instead; the editor then numbers
    pages itself. Results of other fields (NUMPAGES, DATE...) stay as text.
    """
    text_parts: List[str] = []
    page_format = "none"
    stack: List[Dict[str, Any]] = []  # open complex fields: {"instr": str, "skip": bool, "in_result": bool}

    def in_skipped_result() -> bool:
        return any(field["in_result"] and field["skip"] for field in stack)

    def walk(element: Any) -> None:
        nonlocal page_format
        for child in element:
            if child.tag == qn("w:fldSimple"):
                fmt = _page_field_format(child.get(qn("w:instr")) or "")
                if fmt != "none":
                    page_format = fmt
                    continue  # drop the cached page number
                walk(child)
            elif child.tag == qn("w:r"):
                for part in child:
                    if part.tag == qn("w:fldChar"):
                        kind = part.get(qn("w:fldCharType"))
                        if kind == "begin":
                            stack.append({"instr": "", "skip": False, "in_result": False})
                        elif kind == "separate" and stack:
                            fmt = _page_field_format(stack[-1]["instr"])
                            stack[-1]["skip"] = fmt != "none"
                            stack[-1]["in_result"] = True
                            if fmt != "none":
                                page_format = fmt
                        elif kind == "end" and stack:
                            stack.pop()
                    elif part.tag == qn("w:instrText") and stack:
                        stack[-1]["instr"] += part.text or ""
                    elif part.tag == qn("w:t") and not in_skipped_result():
                        text_parts.append(part.text or "")
                    elif part.tag == qn("w:tab") and not in_skipped_result():
                        text_parts.append("\t")
            elif len(child):
                walk(child)  # hyperlinks, tracked insertions, content controls

    walk(paragraph_el)
    return "".join(text_parts), page_format


def _header_footer_text_and_format(part: Any) -> Tuple[str, str]:
    """Plain text and page-number format of a header or footer part."""
    pieces: List[str] = []
    page_format = "none"
    for paragraph in part.paragraphs:
        text, fmt = _paragraph_text_and_page_format(paragraph._element)
        if text.strip():
            pieces.append(text.strip())
        if fmt != "none":
            page_format = fmt
    return " ".join(pieces), page_format


def _extract_header_footer(doc: docx.Document) -> Tuple[str, str, str, str]:
    """Extract header/footer text and page-number formats from the first section.

    Returns (header, footer, header_number_format, footer_number_format); the
    formats are 'number', 'roman' or 'none'.
    """
    try:
        section = doc.sections[0] if doc.sections else None
    except Exception:
        return "", "", "none", "none"
    if section is None:
        return "", "", "none", "none"

    header, header_format = "", "none"
    footer, footer_format = "", "none"
    try:
        if not section.header.is_linked_to_previous:
            header, header_format = _header_footer_text_and_format(section.header)
    except Exception:
        pass
    try:
        if not section.footer.is_linked_to_previous:
            footer, footer_format = _header_footer_text_and_format(section.footer)
    except Exception:
        pass
    return header, footer, header_format, footer_format


def _part_images(part: Any) -> Dict[str, bytes]:
    """The pictures a header or footer part owns, by its own relationship ids (these differ from the body's)."""
    images: Dict[str, bytes] = {}
    for rel_id, rel in part.rels.items():
        if "image" in rel.reltype:
            try:
                images[rel_id] = rel.target_part.blob
            except Exception:
                continue
    return images


def _mark_page_fields(element: Any) -> None:
    """Replace the cached result of every PAGE field with the editor's {page} token."""
    for field in element.iter(qn("w:fldSimple")):
        if (field.get(qn("w:instr")) or "").strip().upper().startswith("PAGE"):
            texts = list(field.iter(qn("w:t")))
            for index, node in enumerate(texts):
                node.text = "{page}" if index == 0 else ""
    stack: List[Dict[str, Any]] = []
    for run in element.iter(qn("w:r")):
        chars = run.findall(qn("w:fldChar"))
        if chars:
            kind = chars[0].get(qn("w:fldCharType"))
            if kind == "begin":
                stack.append({"instr": "", "separated": False, "results": []})
            elif kind == "separate" and stack:
                stack[-1]["separated"] = True
            elif kind == "end" and stack:
                field = stack.pop()
                if field["instr"].strip().upper().startswith("PAGE"):
                    for index, node in enumerate(field["results"]):
                        node.text = "{page}" if index == 0 else ""
            continue
        if not stack:
            continue
        for node in run.findall(qn("w:instrText")):
            stack[-1]["instr"] += node.text or ""
        if stack[-1]["separated"]:
            stack[-1]["results"].extend(run.findall(qn("w:t")))


def _springy_tabs(html: str) -> str:
    """Header/footer text is not edited by ProseMirror, so a tab becomes a flexible gap in a flex line."""
    def line(match: "re.Match[str]") -> str:
        tag, body = match.group(1), match.group(2)
        if "data-tab" not in body:
            return match.group(0)
        body = re.sub(r"<span[^>]*><span data-tab></span></span>", "<span data-tab></span>", body)
        body = body.replace("<span data-tab></span>", '<span style="flex:1 1 0"></span>')
        tag = re.sub(r' data-tab-stops="[^"]*"| data-default-tab="[^"]*"', "", tag)
        tag = tag.replace('style="', 'style="display:flex; align-items:baseline; ', 1) if 'style="' in tag else tag.replace("<p", '<p style="display:flex;"', 1)
        return f"{tag}{body}</p>"

    return re.sub(r"(<p\b[^>]*>)(.*?)</p>", line, html, flags=re.S)


def _hf_part_html(part: Any, text_width: Optional[float], origin_y: float = 0.0) -> Optional[Dict[str, str]]:
    """A header/footer part as HTML plus the pictures Word pins to the page, or None when plain text says it all."""
    import copy

    element = copy.deepcopy(part.element)
    drawn = element.find(".//" + qn("w:drawing")) is not None or element.find(".//" + qn("w:pict")) is not None
    tables = element.find(qn("w:tbl")) is not None
    has_tab = element.find(".//" + qn("w:tab")) is not None
    if not (drawn or tables or has_tab):
        return None
    _mark_page_fields(element)
    images = _part_images(part)
    pieces: List[str] = []
    for child in element:
        if child.tag == qn("w:p"):
            pieces.append(_paragraph_to_html(Paragraph(child, part), images))
            # Header text often lives in a text box beside the logos.
            for box in _textbox_paragraphs(child):
                html = _paragraph_to_html(Paragraph(box, part), images)
                if html and not html.startswith('<p class="empty-spacer"'):
                    pieces.append(html)
        elif child.tag == qn("w:tbl"):
            pieces.append(_table_to_html(Table(child, part), images, text_width))
    flow, art = _extract_page_art("".join(pieces))
    # A box hung beside a header paragraph is measured from where the header starts.
    for item in art:
        if item.get("paragraph"):
            item["y"] += origin_y
    flow = re.sub(r' data-overlay="[^"]*"', "", flow)
    flow = _springy_tabs(flow)
    if not (art or "<img" in flow or re.sub(r"<[^>]+>", "", flow).strip()):
        return None
    return {"flow": flow, "art": "".join(_art_html(item) for item in art)}


def _extract_sections(doc: docx.Document) -> Dict[str, Any]:
    """Per-section headers, footers and page numbering, with each distinct part converted once.

    Returns {"parts": {key: {"flow", "art"}}, "sections": [...]}; a section lists the
    part used for its default and first-page header/footer (None = nothing), whether
    its first page differs, and how its pages are numbered.
    """
    sections = list(doc.sections)
    text_width = _text_width_px(doc)
    page_h = _PAGE_GEOMETRY.get("h", 1056.0)
    header_origin = (sections[0].header_distance or 457200) / EMU_PER_PX if sections else 48.0
    footer_origin = page_h - (sections[0].bottom_margin or 914400) / EMU_PER_PX if sections else page_h - 96
    keys: Dict[int, str] = {}
    parts: Dict[str, Dict[str, str]] = {}

    def effective(index: int, kind: str, first: bool) -> Optional[str]:
        attribute = ("first_page_" if first else "") + kind
        for back in range(index, -1, -1):
            holder = getattr(sections[back], attribute)
            if holder.is_linked_to_previous:
                continue
            part = holder.part
            if id(part) not in keys:
                converted = _hf_part_html(part, text_width, header_origin if kind == "header" else footer_origin)
                keys[id(part)] = f"p{len(keys)}"
                if converted is not None:
                    parts[keys[id(part)]] = converted
            return keys[id(part)] if keys[id(part)] in parts else None
        return None

    described: List[Dict[str, Any]] = []
    for index, section in enumerate(sections):
        number = section._sectPr.find(qn("w:pgNumType"))
        start = number.get(qn("w:start")) if number is not None else None
        fmt = number.get(qn("w:fmt")) if number is not None else None
        described.append({
            "index": index,
            "header": effective(index, "header", False),
            "footer": effective(index, "footer", False),
            "first_header": effective(index, "header", True),
            "first_footer": effective(index, "footer", True),
            "title_pg": bool(section.different_first_page_header_footer),
            "number_start": int(start) if start and start.lstrip("-").isdigit() else None,
            "number_format": fmt or "decimal",
            "header_distance": round((section.header_distance or 457200) / EMU_PER_PX, 1),
            "footer_distance": round((section.footer_distance or 457200) / EMU_PER_PX, 1),
        })
    return {"parts": parts, "sections": described}


def _page_size_key(short_in: float, long_in: float) -> str:
    """Map a section's short/long side (inches) to the closest editor page preset."""
    candidates = [
        ("letter", 8.5, 11.0),
        ("legal", 8.5, 14.0),
        ("a4", 8.27, 11.69),
        ("long", 8.5, 13.0),
        ("short", 8.5, 11.0),
    ]
    best = "letter"
    best_err: Optional[float] = None
    for key, short, long_side in candidates:
        err = abs(short_in - short) / short + abs(long_in - long_side) / long_side
        if best_err is None or err < best_err:
            best, best_err = key, err
    return best


# Smallest bottom margin the editor is given: its footer zone collapses with a zero margin.
_MIN_BOTTOM_MARGIN_IN = 0.19


def _page_bottom_margin(doc: docx.Document, chosen: Any) -> float:
    """Bottom margin (inches) for the editor's single page setup.

    The editor has one body height, and a section's own bottom margin cannot be shifted with
    block margins the way left, right and top are. A section whose bottom margin is smaller than
    the page setup's loses its last lines to the next page, and every later page then sits one
    page behind Word. Taking the smallest bottom margin lets each Word page's content fit; the
    hard page breaks Word writes between sections end the pages that are shorter. Measured on the
    fixtures: 0200725 went from 16 to 14 pages (Word: 14) with pages 1-12 aligned, DM-OUHRODI from
    37 to 35 (Word: 32). PDF imports keep their first page's margin (pdf2docx sets each page's
    margins from where its text happens to sit).
    """
    own = round(chosen.bottom_margin / EMU_PER_INCH, 2)
    if getattr(doc.part, "_is_pdf_import", False):
        return own
    try:
        smallest = min(round((s.bottom_margin or 0) / EMU_PER_INCH, 2) for s in doc.sections)
    except Exception:
        return own
    return min(own, max(smallest, _MIN_BOTTOM_MARGIN_IN))


def _extract_page_setup(doc: docx.Document) -> Dict[str, Any]:
    """Extract page size, orientation, and margins (inches) from the section most pages use.

    A cover or title page often has its own tiny margins; the editor has one page
    setup for the whole document, so the setup that most sections share wins
    (the first one on a tie).
    """
    try:
        sections = list(doc.sections)
        if not sections:
            return dict(DEFAULT_PAGE_SETUP)

        def signature(candidate: Any) -> Tuple[int, ...]:
            return tuple(round((value or 0) / 9144) for value in (
                candidate.page_width, candidate.page_height, candidate.top_margin,
                candidate.bottom_margin, candidate.left_margin, candidate.right_margin,
            ))

        counts: Dict[Tuple[int, ...], int] = {}
        for candidate in sections:
            counts[signature(candidate)] = counts.get(signature(candidate), 0) + 1
        section = max(sections, key=lambda candidate: (counts[signature(candidate)], -sections.index(candidate)))
        # pdf2docx sets every page's margins from where that page's text happens to sit; page one is the reference.
        if getattr(doc.part, "_is_pdf_import", False):
            section = sections[0]
    except Exception:
        return dict(DEFAULT_PAGE_SETUP)

    width_in = section.page_width / EMU_PER_INCH
    height_in = section.page_height / EMU_PER_INCH

    orientation = "landscape" if width_in > height_in else "portrait"
    short_side, long_side = (height_in, width_in) if width_in > height_in else (width_in, height_in)

    try:
        margins = {
            "top": round(section.top_margin / EMU_PER_INCH, 2),
            "bottom": _page_bottom_margin(doc, section),
            "left": round(section.left_margin / EMU_PER_INCH, 2),
            "right": round(section.right_margin / EMU_PER_INCH, 2),
        }
    except Exception:
        margins = dict(DEFAULT_PAGE_SETUP["margins"])

    return {
        "page_size": _page_size_key(short_side, long_side),
        "orientation": orientation,
        "margins": margins,
    }


# A paper counts as two-column when most of its text sits in sections with two or more columns.
_TWO_COLUMN_SHARE = 0.5
_TWO_COLUMN_MIN_CHARS = 1500


def _section_columns(sect_pr: Any) -> int:
    """How many text columns a section has (1 when it declares none)."""
    cols = sect_pr.find(qn("w:cols"))
    return int(cols.get(qn("w:num")) or 1) if cols is not None else 1


def _is_two_column_body(doc: docx.Document) -> bool:
    """True when most of the document's text is in sections laid out in two or more columns.

    A header line and its date set in two columns (a memo) is a few lines of text, so it does not count:
    the columns must hold at least half the text, and there must be a real body of it.
    """
    if getattr(doc.part, "_is_pdf_import", False):
        return False  # pdf2docx marks every multi-column page as columns, whatever it is
    try:
        sections = list(doc.sections)
        lengths = [0]
        for child in doc.element.body.iterchildren():
            if child.tag not in (qn("w:p"), qn("w:tbl")):
                continue
            lengths[-1] += sum(len(t.text or "") for t in child.iter(qn("w:t")))
            if child.tag == qn("w:p") and child.find(qn("w:pPr") + "/" + qn("w:sectPr")) is not None:
                lengths.append(0)
        columned = sum(length for index, length in enumerate(lengths) if index < len(sections) and _section_columns(sections[index]._sectPr) >= 2)
    except Exception:
        return False
    total = sum(lengths)
    return total >= _TWO_COLUMN_MIN_CHARS and columned / total >= _TWO_COLUMN_SHARE


def _widow_control_on(doc: docx.Document) -> bool:
    """Whether the document's body text follows Word's widow/orphan rules: default style, then docDefaults, then on."""
    try:
        styles = doc.styles.element
        default = next(
            (s for s in styles.findall(qn("w:style")) if s.get(qn("w:type")) == "paragraph" and s.get(qn("w:default")) in ("1", "true")),
            None,
        )
        defaults = styles.find(qn("w:docDefaults") + "/" + qn("w:pPrDefault"))
        for holder in (default, defaults):
            setting = holder.find(qn("w:pPr") + "/" + qn("w:widowControl")) if holder is not None else None
            if setting is not None:
                return setting.get(qn("w:val")) not in ("0", "false", "off")
    except Exception:
        return False
    return True


def convert_docx_bytes_to_html(file_bytes: bytes) -> Dict[str, Any]:
    """High-fidelity DOCX to HTML converter using python-docx XML traversal.

    Returns html, page_setup, and plain-text header/footer so the server can
    persist page size/margins and reuse the editor's header/footer features.
    """
    return _docx_document_to_result(docx.Document(io.BytesIO(file_bytes)))


def _docx_document_to_result(
    doc: docx.Document,
    page_break_after: Optional[Set[Any]] = None,
    compress_images: bool = False,
) -> Dict[str, Any]:
    """Convert an open DOCX document to the {html, page_setup, header, footer} result."""
    doc_parts: Dict[str, bytes] = {}
    for rel_id, rel in doc.part.rels.items():
        if "image" in rel.target_ref:
            try:
                doc_parts[rel_id] = rel.target_part.blob
            except Exception:
                pass
    if compress_images:
        doc_parts = {rel_id: _compress_image_bytes(blob) for rel_id, blob in doc_parts.items()}

    if page_break_after is None:
        page_break_after = _page_break_paragraphs(doc)
    _set_page_geometry(doc)
    doc.part._intellidocs_notes = {"footnote": {}, "endnote": {}}
    html = _body_to_html(doc, doc_parts, page_break_after)
    html, body_art = _extract_page_art(html)
    html += _notes_html(doc, doc_parts)
    header, footer, header_number_format, footer_number_format = _extract_header_footer(doc)
    page_setup = _extract_page_setup(doc)
    hf = _extract_sections(doc)
    html = _attach_section_props(html, doc, hf)
    content_json = None
    if _BUILD_JSON:
        try:
            content_json = _document_json(doc, hf)
        except Exception:  # the HTML is complete without it: the editor then parses the HTML
            logger.exception("Editor JSON assembly failed; returning the HTML only")

    return {
        "html": html,
        "page_art": _group_page_art(body_art),
        "hf": hf,
        **({"content_json": content_json} if content_json is not None else {}),
        "page_setup": page_setup,
        "header": header,
        "footer": footer,
        "header_number_format": header_number_format,
        "footer_number_format": footer_number_format,
        "two_column_body": _is_two_column_body(doc),
        **({"flow_rules": True} if _widow_control_on(doc) else {}),
    }


# ─── PDF conversion (normalized to DOCX) ────────────────────────────────────
#
# pdf2docx emits one next-page section per PDF page, direct formatting only
# (no heading styles), repeats running headers/footers in the body of every
# page, and embeds large page images at full resolution. The helpers below
# repair those four gaps on the intermediate DOCX so the shared DOCX emitter
# does the rest.

MAX_IMAGE_DIM = 1400
JPEG_QUALITY = 82
# Only images above this size are re-encoded; small icons stay untouched.
_COMPRESS_MIN_BYTES = 150_000
# Elements examined at the top and bottom of each page for running furniture.
_FURNITURE_EDGE_ELEMENTS = 4
# A running header/footer must repeat on this share of pages (and at least 3).
_FURNITURE_MIN_PAGE_SHARE = 0.4

_HEADING_NUMBERED = re.compile(r"^(\d+(?:\.\d+){0,3})[.)]?\s+\S")
_HEADING_KEYWORD = re.compile(r"^(chapter|section|article|appendix)\b", re.IGNORECASE)
# "I. INTRODUCTION" (roman, top level) and "B. Methods" (lettered, second level).
_HEADING_ROMAN = re.compile(r"^[IVX]+[.)]\s+\S")
_HEADING_LETTERED = re.compile(r"^[A-Z][.)]\s+\S")
_PAGE_PHRASE = re.compile(r"\bpage\s*\d+(\s*(of|/)\s*\d+)?")
_ROMAN = r"m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})"
_PAGE_NUMBER = re.compile(rf"(page\s*)?[-–—\s]*(?:\d+|(?=[ivxlcdm])(?:{_ROMAN}))[-–—\s]*(of\s*\d+|/\s*\d+)?")
# "Table 2" / "Figure 3" captions are labels, never headings.
_CAPTION = re.compile(r"^(table|figure|fig\.?|chart|plate)\s*\d", re.IGNORECASE)
_HEADING_CONNECTORS = {
    "a", "an", "the", "of", "in", "on", "and", "or", "to", "for", "with", "by",
    "at", "from", "as", "vs", "via", "per", "into", "its", "their",
}


def _compress_image_bytes(img_bytes: bytes) -> bytes:
    """Downscale a large embedded image to MAX_IMAGE_DIM and re-encode it small.

    Small images and anything that fails to decode or would grow are returned
    unchanged, so conversion never breaks on an odd image.
    """
    if len(img_bytes) < _COMPRESS_MIN_BYTES:
        return img_bytes
    try:
        import pymupdf

        pix = pymupdf.Pixmap(img_bytes)
        largest = max(pix.width, pix.height)
        if largest > MAX_IMAGE_DIM:
            factor = MAX_IMAGE_DIM / largest
            pix = pymupdf.Pixmap(pix, int(pix.width * factor), int(pix.height * factor))
        if pix.alpha:
            out_bytes = pix.tobytes("png")
        else:
            if pix.colorspace is not None and pix.colorspace.n > 3:
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            out_bytes = pix.tobytes("jpeg", jpg_quality=JPEG_QUALITY)
        return out_bytes if len(out_bytes) < len(img_bytes) else img_bytes
    except Exception:
        return img_bytes


def _page_break_paragraphs(doc: docx.Document) -> Set[Any]:
    """Body paragraphs after which a new page starts.

    A paragraph-level sectPr closes a section; the NEXT section's start type
    (default nextPage) decides whether a page break follows it. Continuous
    sections (column changes inside one PDF page) never break.
    """
    sections = list(doc.element.body.iter(qn("w:sectPr")))
    breaks: Set[Any] = set()
    for current, following in zip(sections, sections[1:]):
        properties = current.getparent()
        paragraph = properties.getparent() if properties is not None else None
        if paragraph is None or not paragraph.tag.endswith("}p"):
            continue
        start_type = following.find(qn("w:type"))
        kind = start_type.get(qn("w:val")) if start_type is not None else "nextPage"
        if kind in ("nextPage", "evenPage", "oddPage"):
            breaks.add(paragraph)
    return breaks


def _split_pages(doc: docx.Document, page_break_after: Set[Any]) -> List[List[Any]]:
    """Group the body's paragraphs and tables into pages at the page-ending paragraphs."""
    pages: List[List[Any]] = [[]]
    for element in doc.element.body:
        if not (element.tag.endswith("}p") or element.tag.endswith("}tbl")):
            continue
        pages[-1].append(element)
        if element in page_break_after:
            pages.append([])
    return [page for page in pages if page]


def _paragraph_side_indents(element: Any) -> Tuple[float, float]:
    """A paragraph's left and right indents in points (its text area inside the margins)."""
    ind = element.find(qn("w:pPr") + "/" + qn("w:ind"))
    if ind is None:
        return 0.0, 0.0

    def twips(*names: str) -> float:
        for name in names:
            value = ind.get(qn(name))
            if value is not None:
                try:
                    return int(value) / 20.0
                except ValueError:
                    return 0.0
        return 0.0

    return twips("w:left", "w:start"), twips("w:right", "w:end")


def _realign_from_pdf(doc: docx.Document, pdf_bytes: bytes, page_break_after: Set[Any]) -> int:
    """Re-read the alignment of short single-line paragraphs from the PDF itself.

    pdf2docx guesses alignment and often calls a centred title right-aligned.
    The PDF knows where each line was drawn: a line whose left and right gaps to
    the text area match is centred, one that ends at the right margin is right
    aligned. Returns how many paragraphs were changed.
    """
    try:
        import pymupdf
    except ImportError:  # pragma: no cover - PyMuPDF ships with pdf2docx
        import fitz as pymupdf
    try:
        section = doc.sections[0]
        left_margin = section.left_margin / 12700.0
        right_margin = section.right_margin / 12700.0
        pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        return 0

    def normal(text: str) -> str:
        return re.sub(r"\s+", " ", text).strip().lower()

    # Lines of every PDF page: normalized text -> (x0, x1), with the page width; and the same
    # lines in reading order, for paragraphs that run over several lines.
    pages: List[Tuple[float, Dict[str, Tuple[float, float]]]] = []
    ordered_pages: List[List[Tuple[str, float, float]]] = []
    for page in pdf:
        lines: Dict[str, Tuple[float, float]] = {}
        ordered: List[Tuple[str, float, float]] = []
        for block in page.get_text("dict").get("blocks", []):
            for line in block.get("lines", []):
                text = normal("".join(span.get("text", "") for span in line.get("spans", [])))
                if text:
                    lines.setdefault(text, (line["bbox"][0], line["bbox"][2]))
                    ordered.append((text, line["bbox"][0], line["bbox"][2]))
        pages.append((page.rect.width, lines))
        ordered_pages.append(ordered)
    pdf.close()

    def squash(text: str) -> str:
        return re.sub(r"[\s\-]+", "", text)

    def centred_over_lines(text: str, page_index: int, width: float, element: Any) -> bool:
        """Whether the paragraph's text is a run of consecutive PDF lines, each centred."""
        target = squash(text)
        ordered = ordered_pages[page_index]
        for start in range(len(ordered)):
            first = squash(ordered[start][0])
            if not first or not target.startswith(first):
                continue
            joined, end = first, start
            while len(joined) < len(target) and end + 1 < len(ordered):
                end += 1
                joined += squash(ordered[end][0])
                if not target.startswith(joined):
                    break
            if joined != target or end == start:
                continue
            boxes = ordered[start:end + 1]
            # Measured from the paragraph's own text edges: a thesis body indented from a
            # binding margin would otherwise look evenly placed on every line.
            ind_left, ind_right = _paragraph_side_indents(element)
            gaps = [(x0 - left_margin - ind_left, (width - right_margin - ind_right) - x1) for _, x0, x1 in boxes]
            # Every line evenly placed, and at least one short (a full line fits any alignment).
            return _centred_line_run(gaps) is not None
        return False

    def has_left_indent(element: Any) -> bool:
        ind = element.find(qn("w:pPr") + "/" + qn("w:ind"))
        return ind is not None and int(ind.get(qn("w:left")) or ind.get(qn("w:start")) or 0) > 0

    changed, page_index = 0, 0
    for element in doc.element.body:
        if element.tag == qn("w:p") and page_index < len(pages):
            text = normal("".join(node.text or "" for node in element.iter(qn("w:t"))))
            if 2 <= len(text) <= 80 and not any(True for _ in element.iter(qn("w:tab"))):
                width, lines = pages[page_index]
                box = lines.get(text)
                if box is not None:
                    left_gap = box[0] - left_margin
                    right_gap = (width - right_margin) - box[1]
                    wanted = None
                    if abs(left_gap - right_gap) <= 8 and left_gap >= 24:
                        wanted = "center"
                    elif right_gap <= 6 and left_gap >= 48:
                        wanted = "right"
                    elif left_gap <= 6 and right_gap >= 24:
                        wanted = "left"
                    if wanted:
                        paragraph_properties = element.get_or_add_pPr() if hasattr(element, "get_or_add_pPr") else element.pPr
                        if paragraph_properties is not None:
                            jc = paragraph_properties.find(qn("w:jc"))
                            current = jc.get(qn("w:val")) if jc is not None else "left"
                            if current != wanted:
                                if jc is None:
                                    jc = paragraph_properties.makeelement(qn("w:jc"), {})
                                    paragraph_properties.append(jc)
                                jc.set(qn("w:val"), wanted)
                                changed += 1
            elif len(text) > 80 and not any(True for _ in element.iter(qn("w:tab"))) and not has_left_indent(element):
                # A centred paragraph of several lines (pdf2docx calls them left or justified).
                width, _ = pages[page_index]
                if centred_over_lines(text, page_index, width, element):
                    paragraph_properties = element.get_or_add_pPr() if hasattr(element, "get_or_add_pPr") else element.pPr
                    if paragraph_properties is not None:
                        jc = paragraph_properties.find(qn("w:jc"))
                        if jc is None or jc.get(qn("w:val")) != "center":
                            if jc is None:
                                jc = paragraph_properties.makeelement(qn("w:jc"), {})
                                paragraph_properties.append(jc)
                            jc.set(qn("w:val"), "center")
                            changed += 1
        if element in page_break_after:
            page_index += 1
    return changed


def _absorb_table_continuation_lines(doc: docx.Document, page_break_after: Set[Any]) -> int:
    """Put a cell's wrapped second line back into its table.

    A list of figures wraps a long name onto a second line inside its cell. pdf2docx ends the
    table at that line, writes the line as a paragraph of its own (indented to the cell's column)
    and starts a new table after it, so the name breaks out of its row. A short paragraph right
    after a table whose indent falls inside one of the table's columns is moved into that column
    of the last row that has text there, after a line break. Returns how many lines moved.
    """
    moved = 0
    body = list(doc.element.body)
    for index, element in enumerate(body):
        if element.tag != qn("w:p") or index == 0 or body[index - 1].tag != qn("w:tbl") or element in page_break_after:
            continue
        runs = [r for r in element if r.tag == qn("w:r")]
        text = "".join(node.text or "" for node in element.iter(qn("w:t"))).strip()
        if not text or len(text) > 60 or not runs or len(runs) != len(element.findall(qn("w:r"))):
            continue
        if any(r.find(qn("w:tab")) is not None or r.find(qn("w:drawing")) is not None for r in runs):
            continue
        ind = element.find(qn("w:pPr") + "/" + qn("w:ind"))
        try:
            left = int(ind.get(qn("w:left")) or ind.get(qn("w:start")) or 0) if ind is not None else 0
        except ValueError:
            continue
        table = body[index - 1]
        grid = [int(g.get(qn("w:w")) or 0) for g in table.iter(qn("w:gridCol"))]
        tbl_ind = table.find(qn("w:tblPr") + "/" + qn("w:tblInd"))
        try:
            start = float(tbl_ind.get(qn("w:w")) or 0) if tbl_ind is not None else 0.0
        except ValueError:
            start = 0.0
        column = None
        for col, width in enumerate(grid):
            if start - 60 <= left <= start + width - 60 and col > 0:
                column = col
                break
            start += width
        if column is None:
            continue
        target_cell = None
        for row in reversed(table.findall(qn("w:tr"))):
            cells = row.findall(qn("w:tc"))
            if column < len(cells) and "".join(node.text or "" for node in cells[column].iter(qn("w:t"))).strip():
                target_cell = cells[column]
                break
        if target_cell is None:
            continue
        paragraphs = target_cell.findall(qn("w:p"))
        if not paragraphs:
            continue
        last = paragraphs[-1]
        br_run = last.makeelement(qn("w:r"), {})
        br_run.append(br_run.makeelement(qn("w:br"), {}))
        last.append(br_run)
        for run in runs:
            last.append(run)
        parent = element.getparent()
        parent.remove(element)
        moved += 1
        # The table pdf2docx started after the line continues this one: join them, so the rows
        # share the first table's columns instead of each piece having its own.
        following = table.getnext()
        if following is not None and following.tag == qn("w:tbl"):
            _append_table_rows(table, following)
    return moved


def _append_table_rows(table: Any, following: Any) -> bool:
    """Move `following`'s rows into `table` when both have the same plain columns (no spans)."""
    grid = [int(g.get(qn("w:w")) or 0) for g in table.iter(qn("w:gridCol"))]
    rows = following.findall(qn("w:tr"))
    if not grid or not rows:
        return False
    for row in rows:
        cells = row.findall(qn("w:tc"))
        if len(cells) != len(grid) or any(c.find(qn("w:tcPr") + "/" + qn("w:gridSpan")) is not None for c in cells):
            return False
    for row in rows:
        for cell, width in zip(row.findall(qn("w:tc")), grid):
            tc_pr = cell.find(qn("w:tcPr"))
            tc_w = tc_pr.find(qn("w:tcW")) if tc_pr is not None else None
            if tc_w is not None:
                tc_w.set(qn("w:w"), str(width))
                tc_w.set(qn("w:type"), "dxa")
        table.append(row)
    following.getparent().remove(following)
    return True


def _drop_false_vertical_merges(doc: docx.Document) -> int:
    """Unmerge table cells pdf2docx marked as continuing the cell above although they hold text.

    A continuation cell (`<w:vMerge/>`) is drawn as part of the merged cell above it, so its own
    content is never shown. pdf2docx sometimes marks the first row under a header that way: a list
    of figures lost "1  CONCEPTUAL FRAMEWORK", leaving only its page number. In a PDF import a
    continuation cell with text of its own is always such a mistake; it becomes a cell of its own.
    Returns how many cells were unmerged.
    """
    fixed = 0
    for cell in doc.element.body.iter(qn("w:tc")):
        tc_pr = cell.find(qn("w:tcPr"))
        v_merge = tc_pr.find(qn("w:vMerge")) if tc_pr is not None else None
        if v_merge is None or v_merge.get(qn("w:val")) == "restart":
            continue
        if "".join(node.text or "" for node in cell.iter(qn("w:t"))).strip():
            tc_pr.remove(v_merge)
            fixed += 1
    return fixed


def _centred_line_run(gaps: List[Tuple[float, float]]) -> Optional[float]:
    """For a paragraph's printed lines as (left gap, right gap) to the text area: when every line
    is centred, the first-line indent its opening line carries (0 when none); else None.

    A centred paragraph with a first-line indent is centred within the indented width, so its
    first line (and the first line after a centred heading) sits further right by the indent.
    """
    indent = 0.0
    for index, (lg, rg) in enumerate(gaps):
        diff = lg - rg
        if abs(diff) <= 12:
            continue
        if 18 <= diff <= 80 and (index == 0 or gaps[index - 1][0] >= 24):
            others = [a - b for a, b in gaps if abs(a - b) <= 12]
            indent = max(indent, diff - (sum(others) / len(others) if others else 0.0))
            continue
        return None
    if not any(lg >= 24 for lg, _ in gaps):
        return None
    # A full justified line is evenly placed too, but it starts exactly at the left edge; the lines
    # of a centred paragraph that nearly fill the width still start a few points in.
    if sum(1 for lg, _ in gaps if lg < 1.5) > len(gaps) / 3:
        return None
    return indent


def _reflow_centred_blocks_from_pdf(doc: docx.Document, pdf_bytes: bytes, page_break_after: Set[Any]) -> int:
    """Rebuild centred paragraphs pdf2docx imitated with tabs.

    A centred block (a centred heading and the centred paragraph under it) comes out of pdf2docx
    as one left-aligned paragraph: each printed line pushed right with a few tabs and ended with
    a line break, and stray tabs mid-sentence where a line wrapped ("intelligent document ⇥⇥
    editing systems"). When the paragraph's text is exactly a run of consecutive PDF lines and
    every one of them is centred, the tabs go (a space where they joined two words), a wholly
    bold short line becomes its own paragraph (the heading), and the rest becomes one paragraph;
    all of them are centred with no indent. Returns how many paragraphs were rebuilt.
    """
    pdf = _open_pdf(pdf_bytes)
    if pdf is None:
        return 0
    try:
        section = doc.sections[0]
        left_margin = section.left_margin / 12700.0
        right_margin = section.right_margin / 12700.0
    except Exception:
        pdf.close()
        return 0

    def squash(text: str) -> str:
        return re.sub(r"[\s\-]+", "", text).lower()

    try:
        pages: List[Tuple[float, List[Tuple[str, float, float]]]] = []
        for page in pdf:
            ordered: List[Tuple[str, float, float]] = []
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    text = "".join(span.get("text", "") for span in line.get("spans", []))
                    if text.strip():
                        ordered.append((squash(text), line["bbox"][0], line["bbox"][2]))
            pages.append((page.rect.width, ordered))
    finally:
        pdf.close()

    def all_lines_centred(text: str, page: Tuple[float, List[Tuple[str, float, float]]], element: Any) -> Optional[float]:
        width, ordered = page
        target = squash(text)
        for start in range(len(ordered)):
            if not ordered[start][0] or not target.startswith(ordered[start][0]):
                continue
            joined, end = ordered[start][0], start
            while len(joined) < len(target) and end + 1 < len(ordered) and target.startswith(joined + ordered[end + 1][0]):
                end += 1
                joined += ordered[end][0]
            if joined != target or end == start:
                continue
            ind_left, ind_right = _paragraph_side_indents(element)
            gaps = [(x0 - left_margin - ind_left, (width - right_margin - ind_right) - x1) for _, x0, x1 in ordered[start:end + 1]]
            return _centred_line_run(gaps)
        return None

    def run_text(run: Any) -> str:
        return "".join(node.text or "" for node in run.iter(qn("w:t")))

    def is_bold(run: Any) -> bool:
        b = run.find(qn("w:rPr") + "/" + qn("w:b"))
        return b is not None and b.get(qn("w:val")) not in ("0", "false")

    def centre(p: Any) -> None:
        p_pr = p.find(qn("w:pPr"))
        if p_pr is None:
            p_pr = p.makeelement(qn("w:pPr"), {})
            p.insert(0, p_pr)
        jc = p_pr.find(qn("w:jc"))
        if jc is None:
            jc = p_pr.makeelement(qn("w:jc"), {})
            p_pr.append(jc)
        jc.set(qn("w:val"), "center")
        ind = p_pr.find(qn("w:ind"))
        if ind is not None:
            p_pr.remove(ind)
        tabs = p_pr.find(qn("w:tabs"))
        if tabs is not None:
            p_pr.remove(tabs)

    rebuilt, page_index = 0, 0
    for element in list(doc.element.body):
        if element.tag == qn("w:p") and page_index < len(pages):
            runs = [r for r in element if r.tag == qn("w:r")]
            has_tabs = any(r.find(qn("w:tab")) is not None for r in runs)
            text = "".join(run_text(r) for r in runs)
            first_indent = all_lines_centred(text, pages[page_index], element) if has_tabs and len(runs) == len(element.findall(qn("w:r"))) and len(text) > 20 else None
            if first_indent is not None:
                # Lines as printed: split at line breaks, padding tabs dropped.
                segments: List[List[Any]] = [[]]
                for run in runs:
                    if run.find(qn("w:br")) is not None and not run_text(run).strip():
                        segments.append([])
                    elif run.find(qn("w:tab")) is not None and not run_text(run).strip():
                        segment = segments[-1]
                        # A tab between two words stood for the space a wrapped line had.
                        if segment and not run_text(segment[-1]).endswith(" "):
                            space = run.makeelement(qn("w:r"), {})
                            rpr = run.find(qn("w:rPr"))
                            if rpr is not None:
                                space.append(copy.deepcopy(rpr))
                            t = space.makeelement(qn("w:t"), {"{http://www.w3.org/XML/1998/namespace}space": "preserve"})
                            t.text = " "
                            space.append(t)
                            segment.append(space)
                    else:
                        segments[-1].append(run)
                segments = [s for s in segments if "".join(run_text(r) for r in s).strip()]
                # Group into paragraphs: a wholly bold short line is a heading of its own.
                groups: List[List[Any]] = []
                for segment in segments:
                    seg_text = "".join(run_text(r) for r in segment).strip()
                    heading = len(seg_text) <= 80 and all(is_bold(r) for r in segment if run_text(r).strip())
                    if heading or not groups or groups[-1] is None:
                        groups.append(list(segment))
                        if heading:
                            groups.append(None)  # type: ignore[arg-type]
                    else:
                        if groups[-1] and not "".join(run_text(r) for r in groups[-1]).endswith(" "):
                            space = copy.deepcopy(segment[0])
                            for t in space.iter(qn("w:t")):
                                t.text = " "
                            groups[-1].append(space)
                        groups[-1].extend(segment)
                groups = [g for g in groups if g]
                if groups:
                    parent = element.getparent()
                    index = parent.index(element)
                    for run in runs:
                        element.remove(run)
                    first = True
                    for group in groups:
                        target = element if first else copy.deepcopy(element)
                        if not first:
                            for run in [r for r in target if r.tag == qn("w:r")]:
                                target.remove(run)
                        for run in group:
                            target.append(run)
                        centre(target)
                        group_text = "".join(run_text(r) for r in group).strip()
                        if first_indent >= 18 and len(group_text) > 80:
                            p_pr = target.find(qn("w:pPr"))
                            ind = p_pr.makeelement(qn("w:ind"), {qn("w:firstLine"): str(int(round(first_indent / 18.0)) * 360)})
                            jc = p_pr.find(qn("w:jc"))
                            jc.addprevious(ind)
                        if not first:
                            index += 1
                            parent.insert(index, target)
                        first = False
                    rebuilt += 1
        if element in page_break_after:
            page_index += 1
    return rebuilt


def _picture_only(element: Any) -> Optional[Tuple[Any, float, float]]:
    """(inline drawing, width pt, height pt) for a paragraph that holds one inline picture and no text, else None."""
    if element.tag != qn("w:p") or "".join(node.text or "" for node in element.iter(qn("w:t"))).strip():
        return None
    inlines = list(element.iter(f"{{{_NS_WP}}}inline"))
    if len(inlines) != 1 or element.find(f".//{{{_NS_WP}}}anchor") is not None:
        return None
    extent = inlines[0].find(f"{{{_NS_WP}}}extent")
    cx, cy = _int_attr(extent, "cx"), _int_attr(extent, "cy")
    if not cx or not cy or inlines[0].find(f".//{{{_NS_A}}}blip") is None:
        return None
    return inlines[0], cx / EMU_PER_POINT, cy / EMU_PER_POINT


def _merge_picture_rows_from_pdf(doc: docx.Document, pdf_bytes: bytes, page_break_after: Set[Any]) -> int:
    """Merge pictures that sit side by side in the PDF but came out one under the other.

    pdf2docx writes every picture as its own inline paragraph, so two covers or two subfigures drawn
    on one line become a stack. The PDF still knows where each picture was drawn: two neighbouring
    picture-only paragraphs whose PDF rectangles share a horizontal band, one left of the other,
    are drawn onto one canvas as a single picture. Returns how many rows were merged.
    """
    try:
        import pymupdf
    except ImportError:  # pragma: no cover - PyMuPDF ships with pdf2docx
        import fitz as pymupdf
    try:
        pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        rects_by_page = [
            [tuple(info["bbox"]) for info in page.get_image_info() if info["bbox"][2] - info["bbox"][0] >= 40 and info["bbox"][3] - info["bbox"][1] >= 40]
            for page in pdf
        ]
        pdf.close()
    except Exception:
        return 0

    def rect_for(rects: List[Tuple[float, float, float, float]], width: float, height: float) -> Optional[Tuple[float, float, float, float]]:
        return next((r for r in rects if abs(r[2] - r[0] - width) <= 4 and abs(r[3] - r[1] - height) <= 4), None)

    merged, page_index = 0, 0
    body = list(doc.element.body)
    index = 0
    while index < len(body):
        element = body[index]
        first = _picture_only(element)
        if first is not None and page_index < len(rects_by_page):
            # the next picture-only paragraph on this page, skipping blank spacer paragraphs
            nxt = index + 1
            while nxt < len(body) and body[nxt].tag == qn("w:p") and body[nxt] not in page_break_after and not "".join(body[nxt].itertext()).strip() and body[nxt].find(f".//{{{_NS_WP}}}inline") is None:
                nxt += 1
            second = _picture_only(body[nxt]) if nxt < len(body) and element not in page_break_after else None
            rects = rects_by_page[page_index]
            r1 = rect_for(rects, first[1], first[2])
            r2 = rect_for([r for r in rects if r != r1], second[1], second[2]) if second is not None else None
            if r1 and r2 and r1[2] <= r2[0] + 2 and min(r1[3], r2[3]) - max(r1[1], r2[1]) >= 0.5 * min(r1[3] - r1[1], r2[3] - r2[1]):
                row = _compose_picture_row(doc, [(first[0], r1), (second[0], r2)])
                if row is not None:
                    png, width_pt, height_pt = row
                    paragraph = Paragraph(element, doc._body)
                    for run_element in list(element.findall(qn("w:r"))):
                        element.remove(run_element)
                    paragraph.add_run().add_picture(io.BytesIO(png), width=Emu(int(width_pt * 12700)), height=Emu(int(height_pt * 12700)))
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for gone in body[index + 1: nxt + 1]:
                        gone.getparent().remove(gone)
                    merged += 1
                    index = nxt + 1
                    continue
        if element in page_break_after:
            page_index += 1
        index += 1
    return merged


def _compose_picture_row(doc: docx.Document, placed: List[Tuple[Any, Tuple[float, float, float, float]]]) -> Optional[Tuple[bytes, float, float]]:
    """Draw pictures at their PDF positions on one transparent canvas: (png bytes, width pt, height pt)."""
    try:
        import pymupdf

        left, top = min(r[0] for _i, r in placed), min(r[1] for _i, r in placed)
        width_pt, height_pt = max(r[2] for _i, r in placed) - left, max(r[3] for _i, r in placed) - top
        canvas = pymupdf.open()
        page = canvas.new_page(width=width_pt, height=height_pt)
        for inline, (x0, y0, x1, y1) in placed:
            embed_id = inline.find(f".//{{{_NS_A}}}blip").get(qn("r:embed"))
            page.insert_image(pymupdf.Rect(x0 - left, y0 - top, x1 - left, y1 - top), stream=doc.part.related_parts[embed_id].blob)
        dpi = max(36, min(150, int(MAX_GROUP_IMAGE_PX / (width_pt / 72))))
        return page.get_pixmap(dpi=dpi, alpha=True).tobytes("png"), width_pt, height_pt
    except Exception:
        return None


def _furniture_key(element: Any, doc: docx.Document) -> str:
    """Identity of an element for repeat detection: its digit-normalized text
    plus the hashes of its images. Empty when the element carries neither."""
    text = "".join(node.text or "" for node in element.iter(qn("w:t")))
    text = re.sub(r"\s+", " ", text).strip().lower()
    # Only page numbers ("12", "page 3 of 14", "3 / 14") are digit-normalized;
    # any other line keeps its digits so "Article 4" / "Question 7" lines that
    # differ by a number are never mistaken for the same running header.
    text = _PAGE_PHRASE.sub("<page-number>", text)
    if _PAGE_NUMBER.fullmatch(text):
        text = "<page-number>"
    hashes: List[str] = []
    for blip in element.iter(qn("a:blip")):
        rel_id = blip.get(qn("r:embed"))
        part = doc.part.related_parts.get(rel_id) if rel_id else None
        if part is not None:
            hashes.append(hashlib.sha1(part.blob).hexdigest()[:16])
    if not text and not hashes:
        return ""
    return f"{text}|{','.join(sorted(hashes))}"


def _strip_running_furniture(doc: docx.Document, page_break_after: Set[Any], report: Optional[Dict[str, Any]] = None) -> int:
    """Remove running headers/footers (repeated top/bottom elements) from the body.

    An element counts as furniture when the same text (page numbers normalized)
    or image sits within the first/last few elements of at least 3 pages and
    40% of all pages. Paragraphs that carry the page's section break are
    emptied instead of deleted so the break survives. Returns the number of
    elements removed or emptied.
    """
    pages = _split_pages(doc, page_break_after)
    if len(pages) < 3:
        return 0

    edges: List[List[Tuple[Any, str]]] = []
    page_keyed: List[List[Tuple[Any, str]]] = []
    for page in pages:
        keyed = [(el, _furniture_key(el, doc)) for el in page]
        keyed = [(el, key) for el, key in keyed if key]
        head, tail = keyed[:_FURNITURE_EDGE_ELEMENTS], keyed[-_FURNITURE_EDGE_ELEMENTS:]
        page_keyed.append(keyed)
        edges.append(head + [item for item in tail if item not in head])

    page_counts: Dict[str, int] = {}
    for edge in edges:
        for key in {key for _, key in edge}:
            page_counts[key] = page_counts.get(key, 0) + 1

    min_pages = max(3, int(len(pages) * _FURNITURE_MIN_PAGE_SHARE + 0.999))
    furniture = {key for key, count in page_counts.items() if count >= min_pages}

    # pdf2docx sometimes merges a page's footer lines into one table, their words interleaved, while
    # the other pages keep them as separate elements, so that page's footer matches no key. An edge
    # element of six or more words that are (all but a couple) words of the repeating furniture is
    # the same footer, merged. Real body text always has words outside that small vocabulary.
    furniture_words = {word for key in furniture for word in key.split("|", 1)[0].split() if len(key.split("|", 1)[0]) >= 20}

    def is_merged_furniture(key: str) -> bool:
        words = key.split("|", 1)[0].split()
        if len(words) < 6 or not furniture_words:
            return False
        outside = sum(1 for word in words if word not in furniture_words)
        return outside <= max(2, len(words) // 10)

    def is_furniture(key: str) -> bool:
        return key in furniture or is_merged_furniture(key)

    # Furniture before a page's first body element is a header and after its last body element a
    # footer. (Position alone fails on short pages: a footer can sit in the top half of one.) A page
    # with no body element at all is left to the vote below.
    sides: Dict[Any, str] = {}
    for keyed in page_keyed:
        body = [index for index, (_el, key) in enumerate(keyed) if not is_furniture(key)]
        if not body:
            continue
        for index, (el, key) in enumerate(keyed):
            if is_furniture(key):
                sides[el] = "header" if index < body[0] else ("footer" if index > body[-1] else ("header" if index < len(keyed) / 2 else "footer"))

    # One side per repeating line: the side it takes on most pages.
    votes: Dict[str, Dict[str, int]] = {}
    for edge in edges:
        for element, key in edge:
            if element in sides:
                votes.setdefault(key, {"header": 0, "footer": 0})[sides[element]] += 1
    key_side = {key: ("header" if counts["header"] > counts["footer"] else "footer") for key, counts in votes.items()}

    removed = 0
    for page_index, edge in enumerate(edges):
        for element, key in edge:
            if (key not in furniture and not is_merged_furniture(key)) or element.getparent() is None:
                continue
            if report is not None:
                jc = element.find(qn("w:pPr") + "/" + qn("w:jc"))
                report.setdefault("items", []).append({
                    "page": page_index,
                    "side": key_side.get(key, sides.get(element, "footer")) if key in furniture else sides.get(element, "footer"),
                    "key": key,
                    "text": "".join(node.text or "" for node in element.iter(qn("w:t"))).strip(),
                    "jc": jc.get(qn("w:val")) if jc is not None else None,
                    "has_image": element.find(".//" + qn("a:blip")) is not None,
                    "images_html": _furniture_images_html(element, doc),
                })
            if element in page_break_after:
                for child in list(element):
                    if not child.tag.endswith("}pPr"):
                        element.remove(child)
            else:
                element.getparent().remove(element)
            removed += 1
    return removed


def _furniture_images_html(element: Any, doc: docx.Document) -> str:
    """The pictures of a running header/footer line as <img> tags, so a letterhead seal returns with it."""
    parts: Dict[str, bytes] = {}
    for blip in element.iter(qn("a:blip")):
        rel_id = blip.get(qn("r:embed"))
        part = doc.part.related_parts.get(rel_id) if rel_id else None
        if part is not None and rel_id not in parts:
            parts[rel_id] = _compress_image_bytes(part.blob)
    if not parts:
        return ""
    try:
        return "".join(_image_html(blip, parts) for blip in element.iter(qn("a:blip")))
    except Exception:
        return ""


def _heading_shape(words: List[str], text: str) -> bool:
    """True when a bold body-size line is shaped like a heading."""
    if any(rx.match(text) for rx in (_HEADING_NUMBERED, _HEADING_KEYWORD, _HEADING_ROMAN, _HEADING_LETTERED)):
        return True
    letters = re.sub(r"[^A-Za-z]", "", text)
    if letters and letters.isupper():
        return True
    return all(w[0].isupper() or w.lower() in _HEADING_CONNECTORS or not w[0].isalpha() for w in words)


def _heading_candidate(text: str, size: float, all_bold: bool, body_size: float) -> bool:
    """Decide whether one short paragraph is a heading (size/bold + shape rules)."""
    words = text.split()
    if not 1 <= len(words) <= 14 or not 3 <= len(text) <= 100:
        return False
    if text[-1] in ",;-.…" or words[-1].lower().strip(":") in _HEADING_CONNECTORS:
        return False
    if text[0].islower() or not text[0].isalnum() or "\t" in text:
        return False
    # TOC/list lines carry tab leaders; captions are labels; a wrapped
    # fragment such as "Coefficient)" has unbalanced brackets.
    if _CAPTION.match(text) or text.count("(") != text.count(")"):
        return False
    if size >= body_size * 1.2:
        return True
    return all_bold and size >= body_size - 0.5 and _heading_shape(words, text)


def _paragraph_run_stats(p: Paragraph) -> Tuple[str, float, bool]:
    """Return (text, largest run size in pt, whether every text run is bold)."""
    text_runs = [r for r in p.runs if r.text.strip()]
    text = "".join(r.text for r in p.runs).strip()
    sizes = [r.font.size.pt for r in text_runs if r.font.size is not None]
    all_bold = bool(text_runs) and all(r.font.bold for r in text_runs)
    return text, (max(sizes) if sizes else 0.0), all_bold


def _first_page_paragraphs(doc: docx.Document, page_break_after: Set[Any]) -> Set[Any]:
    """The paragraph elements that come before the first page break (the cover/title page)."""
    first: Set[Any] = set()
    for element in doc.element.body:
        if element.tag.endswith("}p"):
            first.add(element)
        if element in page_break_after:
            break
    return first


def _is_title_page_line(p: Paragraph, first_page: Set[Any]) -> bool:
    """A centred line on the first page that is not a CHAPTER/numbered/keyword heading.

    Cover pages are made of large, bold, centred lines (university, title,
    "Presented to…", names). Promoting them to headings would hand their layout
    to the editor's heading rules and put them in the table of contents.
    """
    if p._p not in first_page or _get_paragraph_alignment(p) != "center":
        return False
    text = "".join(r.text for r in p.runs).strip()
    return not any(rx.match(text) for rx in (_HEADING_NUMBERED, _HEADING_KEYWORD, _HEADING_ROMAN))


def _infer_heading_styles(doc: docx.Document, page_break_after: Optional[Set[Any]] = None) -> int:
    """Give heading-shaped body paragraphs real Heading 1-3 styles.

    pdf2docx keeps only direct formatting, so the DOCX emitter would otherwise
    see no headings at all. Candidates come from font size (>= 1.2x the body
    size) or bold lines shaped like headings (numbered, CHAPTER/SECTION, ALL
    CAPS, Title Case); levels come from numbering depth or size rank. Returns
    the number of paragraphs promoted.
    """
    char_sizes: Dict[float, int] = {}
    for p in doc.paragraphs:
        for r in p.runs:
            if r.font.size is not None and r.text.strip():
                key = round(r.font.size.pt * 2) / 2
                char_sizes[key] = char_sizes.get(key, 0) + len(r.text)
    if not char_sizes:
        return 0
    body_size = max(char_sizes, key=lambda k: char_sizes[k])

    first_page = _first_page_paragraphs(doc, page_break_after) if page_break_after is not None else set()
    candidates: List[Tuple[Paragraph, float, str]] = []
    for p in doc.paragraphs:
        if p._p.find(".//" + qn("w:numPr")) is not None or p._p.find(".//" + qn("w:drawing")) is not None:
            continue
        if _is_title_page_line(p, first_page):
            continue
        text, size, all_bold = _paragraph_run_stats(p)
        if size and _heading_candidate(text, size, all_bold, body_size):
            candidates.append((p, size, text))
    if not candidates:
        return 0

    def tier(size: float, text: str) -> Tuple[float, int]:
        """Rank key: bigger size first, then ALL CAPS ahead of mixed case."""
        letters = re.sub(r"[^A-Za-z]", "", text)
        return (-round(size * 2) / 2, 0 if letters.isupper() else 1)

    tiers = sorted({tier(size, text) for _, size, text in candidates})
    for p, size, text in candidates:
        numbered = _HEADING_NUMBERED.match(text)
        if numbered:
            level = min(numbered.group(1).count(".") + 1, 3)
        elif _HEADING_KEYWORD.match(text) or _HEADING_ROMAN.match(text):
            level = 1
        elif _HEADING_LETTERED.match(text):
            level = 2
        else:
            level = min(tiers.index(tier(size, text)) + 1, 3)
        style_name = f"Heading {level}"
        try:
            style = doc.styles[style_name]
        except KeyError:
            style = doc.styles.add_style(style_name, WD_STYLE_TYPE.PARAGRAPH)
        p.style = style
    return len(candidates)


_ROMAN_VALUES = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100, "d": 500, "m": 1000}


def _printed_page_number(text: str) -> Optional[Tuple[int, str]]:
    """The value and style of a printed page number ("12" or "iv"), or None when the text is not one."""
    cleaned = re.sub(r"(?i)\bpage\b|\bof\s*\d+|/\s*\d+|[-–—\s]", "", text)
    if not cleaned:
        return None
    if cleaned.isdigit():
        return int(cleaned), "decimal"
    lowered = cleaned.lower()
    if all(ch in _ROMAN_VALUES for ch in lowered):
        total = 0
        for index, ch in enumerate(lowered):
            value = _ROMAN_VALUES[ch]
            total += -value if index + 1 < len(lowered) and _ROMAN_VALUES[lowered[index + 1]] > value else value
        return total, "lowerRoman" if cleaned == lowered else "upperRoman"
    return None


def _furniture_alignment(item: Dict[str, Any]) -> str:
    """CSS alignment of a removed header/footer line (centred when the PDF paragraph says so, else right for numbers)."""
    return {"center": "center", "right": "right", "left": "left", "both": "left"}.get(item.get("jc") or "", "right" if item["key"].startswith("<page-number>") else "left")


def _furniture_to_layout(result: Dict[str, Any], report: Dict[str, Any], page_count: int) -> None:
    """Put the running headers/footers and page numbers stripped from a PDF back as real ones.

    A PDF prints a page number or running title on every page, which was removed
    from the body as repeated furniture. They return as header/footer parts, with
    the printed numbers read per page so a roman front matter and a restart at 1
    survive.
    """
    items = report.get("items") or []
    hf = result.get("hf") or {}
    all_sections = hf.get("sections") or []
    # The section that opens each page: the first one, then the one each page break announces.
    breaks = [
        (re.search(r'data-section="(\d+)"', tag) or [None, ""])[1]
        for tag in re.findall(r'<hr class="page-break"[^>]*/>', result["html"])
    ]
    if not items or not all_sections:
        return
    # Which section opens each page. When the emitter's page breaks and the PDF's pages cannot be
    # matched one to one, the furniture still returns, on every page (better than losing it).
    by_index = {section["index"]: section for section in all_sections}
    sections: List[Optional[Dict[str, Any]]] = []
    page_matched = bool(breaks) and all(value != "" for value in breaks) and len(breaks) + 1 == page_count
    if page_matched:
        sections = [by_index.get(index) for index in [0] + [int(value) for value in breaks]]
        page_matched = all(section is not None for section in sections)
    if not page_matched:
        sections = list(all_sections)
    parts: Dict[str, Dict[str, str]] = result["hf"]["parts"]
    lines: Dict[str, List[Dict[str, Any]]] = {"header": [], "footer": []}
    seen: Set[Tuple[str, str]] = set()
    for item in items:
        if not item["text"] and not item.get("images_html"):
            continue
        signature = (item["side"], item["key"])
        if signature not in seen:
            seen.add(signature)
            lines[item["side"]].append(item)

    for side in ("header", "footer"):
        if not lines[side]:
            continue
        html = ""
        for item in lines[side]:
            is_number = item["key"].startswith("<page-number>")
            body = "{page}" if is_number else _html_escape(item["text"])
            body = (item.get("images_html") or "") + (" " if item.get("images_html") and body else "") + body
            html += f'<p style="margin:0;text-align:{_furniture_alignment(item)};font-size:11pt">{body}</p>'
        parts[f"pdf_{side}"] = {"flow": html, "art": ""}
        pages_with = {item["page"] for item in items if item["side"] == side}
        for page_index, section in enumerate(sections):
            if section is None:
                continue
            section[side] = f"pdf_{side}" if (not page_matched or page_index in pages_with) else None
    if not page_matched:
        return

    # Printed numbers per page: start values and number styles where the sequence changes.
    printed: Dict[int, Tuple[int, str]] = {}
    for item in items:
        number = _printed_page_number(item["text"]) if item["key"].startswith("<page-number>") else None
        if number is not None:
            printed.setdefault(item["page"], number)
    previous: Optional[Tuple[int, str]] = None
    for page_index, section in enumerate(sections):
        number = printed.get(page_index)
        if number is None:
            continue
        value, style = number
        if previous is None or style != previous[1] or value != previous[0] + 1:
            section["number_start"] = value
        section["number_format"] = style
        previous = number


# A page needs this many "title <tab> number" lines to be a table of contents.
_TOC_PAGE_MIN_LINES = 3
_TOC_NUMBER = re.compile(r"^\s*(\d{1,4}|[ivxlcdm]{1,7})\s*$", re.IGNORECASE)


def _snap_right_tabs(doc: docx.Document, page_break_after: Optional[Set[Any]] = None) -> None:
    """Make a left tab stop that sits at the right margin a right-aligned one, on table-of-contents pages.

    pdf2docx records where a page number STARTS (a left stop just inside the right
    margin), so the number overflows the line and wraps in a table of contents.
    The PDF drew it flush right. Only pages with several "title <tab> number" lines
    are treated this way: a memo's "No. ____, s. 2026" or a form's "INDICATOR 11"
    also ends in a number, and a right stop there drew a dot leader the PDF never had.
    """
    try:
        section = doc.sections[0]
        width_twips = (section.page_width - section.left_margin - section.right_margin) / 635.0
    except Exception:
        return
    if width_twips <= 0:
        return

    def is_toc_line(paragraph: Any) -> bool:
        text = "".join((node.text or "") if node.tag == qn("w:t") else "\t" for node in paragraph.iter(qn("w:t"), qn("w:tab")) if node.getparent() is not None and node.getparent().tag == qn("w:r"))
        if "\t" not in text:
            return False
        before, _, after = text.rpartition("\t")
        return bool(before.strip()) and bool(_TOC_NUMBER.match(after))

    pages = _split_pages(doc, page_break_after) if page_break_after is not None else [list(doc.element.body)]
    for page in pages:
        toc_lines = [el for el in page if el.tag == qn("w:p") and is_toc_line(el)]
        if len(toc_lines) < _TOC_PAGE_MIN_LINES:
            continue
        for paragraph in toc_lines:
            for tab in paragraph.iter(qn("w:tab")):
                if tab.getparent() is None or tab.getparent().tag != qn("w:tabs"):
                    continue
                position = tab.get(qn("w:pos"))
                if tab.get(qn("w:val")) != "left" or not position:
                    continue
                if 0.88 * width_twips <= float(position) <= 1.05 * width_twips:
                    tab.set(qn("w:val"), "right")
                    tab.set(qn("w:pos"), str(int(width_twips)))


_WORD_LIST: Any = None


def _known_words(words: List[str]) -> Set[str]:
    """Which of these (lowercase) words are English words, by pyspellchecker's word list (loaded once)."""
    global _WORD_LIST
    if _WORD_LIST is None:
        from spellchecker import SpellChecker  # ships with the ML service (grammar checks)

        _WORD_LIST = SpellChecker()
    return set(_WORD_LIST.known([w for w in words if w]))


def _joins_without_space(left: str, right: str) -> bool:
    """Whether a PDF line break between `left` and `right` cut one word in two ("Behavi|oral").

    A pair that spells a word joins ("Extract|ion"); a lowercase fragment that is no word of its own
    continues the word before it ("Barka|n"); anything else is two words ("machine|learning").
    """
    left_word = re.search(r"([A-Za-z]+)$", left.rstrip())
    right_word = re.match(r"([A-Za-z]+)", right.lstrip())
    if not left_word or not right_word:
        return False
    a, b = left_word.group(1), right_word.group(1)
    if not b[0].islower():
        return False
    known = _known_words([b.lower(), (a + b).lower()])
    if (a + b).lower() in known:
        return True
    # The word list counts single letters and odd short forms as words; only common ones are.
    fragment = b.lower() not in known or (len(b) <= 2 and b.lower() not in _SHORT_WORDS)
    return fragment


# A cell paragraph indent up to this (0.25in) is pdf2docx's stand-in for cell padding, not a real indent.
_PADDING_LIKE_INDENT_TWIPS = 360

_SHORT_WORDS = frozenset(
    "a i an as at be by do go he if in is it me my no of on or so to up us we".split()
)


def _reflow_pdf_table_cells(doc: docx.Document) -> int:
    """Let table cell text flow again, as it did in the document the PDF was made from.

    pdf2docx keeps each PDF line of a cell as a forced line break, often in the middle of a word
    ("Behavi|oral Tracki|ng"), so the editor's (slightly different) column widths break every
    fragment once more and the table grows to twice its height. It also fakes vertical centring with
    large space-before and fixes each row's height. Here the breaks are joined (no space inside a
    cut word), the fake centring becomes real vertical centring, and exact row heights become
    minimums. Returns how many breaks were joined.
    """
    joined = 0
    for tc in doc.element.body.iter(qn("w:tc")):
        centred = False
        for p in tc.iter(qn("w:p")):
            # pdf2docx stands in for cell padding with a small paragraph indent; the cell gets real
            # padding later (_table_cell_margins), so the indent would inset the text twice.
            ind = p.find(qn("w:pPr") + "/" + qn("w:ind"))
            if ind is not None:
                for side in ("left", "start", "right", "end"):
                    value = ind.get(qn(f"w:{side}"))
                    if value is not None and 0 < abs(int(float(value))) <= _PADDING_LIKE_INDENT_TWIPS:
                        ind.set(qn(f"w:{side}"), "0")
            spacing = p.find(qn("w:pPr") + "/" + qn("w:spacing"))
            if spacing is not None and int(spacing.get(qn("w:before")) or 0) > 0:
                spacing.set(qn("w:before"), "0")
                centred = True
            order = {element: index for index, element in enumerate(p.iter())}
            texts = list(p.iter(qn("w:t")))
            for br in list(p.iter(qn("w:br"))):
                if br.get(qn("w:type")) not in (None, "textWrapping"):
                    continue
                left = next((t for t in reversed(texts) if order[t] < order[br]), None)
                right = next((t for t in texts if order[t] > order[br]), None)
                if left is not None and right is not None and left.text and right.text:
                    if _joins_without_space(left.text, right.text):
                        left.text = left.text.rstrip()
                        right.text = right.text.lstrip()
                    elif not left.text.endswith(" ") and not right.text.startswith(" "):
                        left.text += " "
                    left.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                br.getparent().remove(br)
                joined += 1
        if centred:
            tc_pr = tc.find(qn("w:tcPr"))
            if tc_pr is None:
                tc_pr = OxmlElement("w:tcPr")
                tc.insert(0, tc_pr)
            if tc_pr.find(qn("w:vAlign")) is None:
                valign = OxmlElement("w:vAlign")
                valign.set(qn("w:val"), "center")
                tc_pr.append(valign)
    for height in doc.element.body.iter(qn("w:trHeight")):
        if height.get(qn("w:hRule")) == "exact":
            height.set(qn("w:hRule"), "atLeast")
    return joined


def convert_pdf_bytes_to_html(file_bytes: bytes) -> Dict[str, Any]:
    """Convert a PDF by normalizing it to DOCX with pdf2docx, repairing what
    pdf2docx drops (page breaks, headings, running headers, image weight), then
    reusing the DOCX emitter so spacing, blank lines and page setup are defined
    in exactly one place."""
    from pdf2docx import Converter  # heavy import; only needed for PDF imports

    with tempfile.TemporaryDirectory(prefix="intellidocs-pdf-") as workdir:
        pdf_path = os.path.join(workdir, "source.pdf")
        docx_path = os.path.join(workdir, "source.docx")
        with open(pdf_path, "wb") as pdf_file:
            pdf_file.write(file_bytes)

        pdf_converter = Converter(pdf_path)
        try:
            pdf_converter.convert(docx_path)
        finally:
            pdf_converter.close()

        doc = docx.Document(docx_path)

    page_break_after = _page_break_paragraphs(doc)
    furniture: Dict[str, Any] = {}
    page_count = len(_split_pages(doc, page_break_after))
    _unnest_hyperlinks(doc)
    _unwrap_layout_tables(doc)
    _strip_running_furniture(doc, page_break_after, furniture)
    _infer_heading_styles(doc, page_break_after)
    _snap_right_tabs(doc, page_break_after)
    _rebuild_definition_pages(doc, file_bytes, page_break_after)
    _repair_tabbed_entries(doc, file_bytes, page_break_after)
    _reflow_pdf_table_cells(doc)
    _grid_from_cell_widths(doc)
    _merge_split_table_rows(doc)
    _space_word_runs(doc)
    _absorb_inline_picture_gaps(doc)
    _drop_trailing_page_spacers(doc, page_break_after)
    _flatten_section_marks(doc, page_break_after)
    _exact_line_pitch_from_pdf(doc, file_bytes, page_break_after)
    _loosen_page_bottoms(doc, page_break_after)
    _keep_blank_pages(doc, page_break_after)
    _fill_blanks_from_pdf(doc, file_bytes, page_break_after)
    _realign_from_pdf(doc, file_bytes, page_break_after)
    _reflow_centred_blocks_from_pdf(doc, file_bytes, page_break_after)
    _rejoin_side_lines_from_pdf(doc, file_bytes, page_break_after)
    _restore_column_rows_from_pdf(doc, file_bytes, page_break_after)
    _float_pictures_beside_text(doc, file_bytes, page_break_after)
    _mark_superscripts_from_pdf(doc, file_bytes, page_break_after)
    _merge_picture_rows_from_pdf(doc, file_bytes, page_break_after)
    _absorb_table_continuation_lines(doc, page_break_after)
    _drop_false_vertical_merges(doc)
    doc.part._is_pdf_import = True  # pdf2docx leaves cell padding at zero; see _table_cell_margins
    result = _docx_document_to_result(doc, page_break_after, compress_images=True)
    _furniture_to_layout(result, furniture, page_count)
    if _pdf_two_column_body(file_bytes):
        result["two_column_body"] = True
    # A PDF is laid out page by page: Word's widow/orphan rules would spill lines onto extra pages.
    result["flow_rules"] = False
    return result


# "a." "b)" "iv." "12." — an enumeration label pdf2docx leaves glued to the item text.
_LIST_LABEL_RUN = re.compile(r"^\(?(?:[a-z]|[ivx]{1,4}|\d{1,3})[.)]$", re.IGNORECASE)


def _run_text(run: Any) -> str:
    return "".join(node.text or "" for node in run.iter(qn("w:t")))


def _prepend_space(run: Any) -> bool:
    """Put a space at the start of a run's first text node."""
    first = run.find(qn("w:t"))
    if first is None or first.text is None:
        return False
    first.text = " " + first.text
    first.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    return True


def _space_word_runs(doc: docx.Document) -> int:
    """Restore the spaces between runs that a justified PDF line drew word by word.

    Justified text is often drawn one word at a time with no space glyphs between
    them; pdf2docx gives each word its own run and the line read
    "provideteacherswithmeaningful". Two adjacent runs that each end/start a word are
    joined by a space when they are separate dictionary words but not one word
    together ("Extract" + "ion" stays one word). An enumeration label run ("a.", "3)")
    is always followed by a space. Returns how many spaces were added.
    """
    added = 0
    for paragraph in doc.element.body.iter(qn("w:p")):
        runs = [run for run in paragraph.findall(qn("w:r")) if _run_text(run)]
        for index, (left_run, right_run) in enumerate(zip(runs, runs[1:])):
            left, right = _run_text(left_run), _run_text(right_run)
            before = _run_text(runs[index - 1]) if index > 0 else ""
            if not left or not right or left[-1].isspace() or right[0].isspace():
                continue
            if right_run.find(qn("w:rPr") + "/" + qn("w:vertAlign")) is not None or left_run.find(qn("w:rPr") + "/" + qn("w:vertAlign")) is not None:
                continue
            # A label opens the paragraph or follows the end of the previous item ("…communities; b.").
            label_position = index == 0 or not before or before.rstrip()[-1:] in ";:." or before[-1:].isspace()
            if _LIST_LABEL_RUN.match(left.strip()) and label_position and right[0].isalpha():
                added += _prepend_space(right_run)
                continue
            left_word = re.search(r"([A-Za-z]+)$", left)
            right_word = re.match(r"([A-Za-z]+)", right)
            if not left_word or not right_word:
                continue
            a, b = left_word.group(1), right_word.group(1)
            if len(a) < 2 or len(b) < 2:
                continue
            known = _known_words([a.lower(), b.lower(), (a + b).lower()])
            if a.lower() in known and b.lower() in known and (a + b).lower() not in known:
                added += _prepend_space(right_run)
    return added


def _fill_blanks_from_pdf(doc: docx.Document, pdf_bytes: bytes, page_break_after: Set[Any]) -> int:
    """Put text the PDF printed on a fill-in blank back inside the blank.

    A form line "No. ________, s. 2026" with "0440" typed onto the underline came out as
    "No. ________, s. 2026 0440": pdf2docx keeps the overlaid text as a separate run at the
    line's end. When the PDF draws a short text span horizontally inside an underscore
    span on the same line, the run holding that text replaces the middle of the blank.
    Returns how many blanks were filled.
    """
    pdf = _open_pdf(pdf_bytes)
    if pdf is None:
        return 0
    try:
        overlays_per_page: List[Set[str]] = []
        for page in pdf:
            found: Set[str] = set()
            # The overlaid text is usually its own block, so the page's spans are compared together.
            spans = [span for block in page.get_text("dict").get("blocks", []) for line in block.get("lines", []) for span in line.get("spans", [])]
            blanks = [span for span in spans if re.search(r"_{4,}", span.get("text", "") or "")]
            if blanks:
                for span in spans:
                    text = (span.get("text") or "").strip()
                    if not text or "_" in text or len(text) > 20:
                        continue
                    x0, y0, x1, y1 = span["bbox"]
                    for blank in blanks:
                        bx0, by0, bx1, by1 = blank["bbox"]
                        if bx0 - 2 <= x0 and x1 <= bx1 + 2 and min(y1, by1) - max(y0, by0) > 0.3 * (y1 - y0):
                            found.add(text)
            overlays_per_page.append(found)
    finally:
        pdf.close()

    filled, page_index = 0, 0
    for element in doc.element.body:
        if element.tag == qn("w:p") and page_index < len(overlays_per_page) and overlays_per_page[page_index]:
            runs = element.findall(qn("w:r"))
            for index, run in enumerate(runs):
                text = _run_text(run).strip()
                if text not in overlays_per_page[page_index]:
                    continue
                blank_run = next((r for r in runs[:index] if re.search(r"_{4,}", _run_text(r))), None)
                if blank_run is None:
                    continue
                nodes = [node for node in blank_run.iter(qn("w:t")) if node.text and re.search(r"_{4,}", node.text)]
                if not nodes:
                    continue
                match = re.search(r"_{4,}", nodes[0].text)
                underscores = match.group(0)
                keep = (len(underscores) - len(text)) // 2
                if keep >= 2:
                    # A long blank: the number sits in its middle, the rest of the line stays visible.
                    nodes[0].text = nodes[0].text[: match.start()] + "_" * keep + text + "_" * keep + nodes[0].text[match.end():]
                    nodes[0].set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                    run.getparent().remove(run)
                else:
                    # The number fills the blank: printed on the line, it reads as underlined text.
                    head, tail = nodes[0].text[: match.start()], nodes[0].text[match.end():]
                    nodes[0].text = head
                    nodes[0].set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                    r_pr = run.find(qn("w:rPr"))
                    if r_pr is None:
                        r_pr = run.makeelement(qn("w:rPr"), {})
                        run.insert(0, r_pr)
                    if r_pr.find(qn("w:u")) is None:
                        r_pr.append(r_pr.makeelement(qn("w:u"), {qn("w:val"): "single"}))
                    run.getparent().remove(run)
                    blank_run.addnext(run)
                    if tail:
                        tail_run = copy.deepcopy(blank_run)
                        for node in list(tail_run):
                            if node.tag != qn("w:rPr"):
                                tail_run.remove(node)
                        tail_node = tail_run.makeelement(qn("w:t"), {})
                        tail_node.text = tail
                        tail_node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                        tail_run.append(tail_node)
                        run.addnext(tail_run)
                filled += 1
                break
        if element in page_break_after:
            page_index += 1
    return filled


# A two-column term list needs this many rows with a term beside its definition.
_DEFLIST_MIN_ROWS = 3
# A column is a band of line starts this wide (pt); the definition column sits at least this far right.
_DEFLIST_COLUMN_BAND = 8.0
_DEFLIST_MIN_COLUMN_GAP = 60.0
# Most term spans are bold, and the definitions take at least this many lines per term line.
_DEFLIST_MIN_BOLD_SHARE = 0.6
_DEFLIST_MIN_LINE_RATIO = 1.5


def _page_section_left_margin_pt(doc: docx.Document, page: List[Any]) -> float:
    """Left margin (pt) of the section a page belongs to: the sectPr that closes it, else the body's last one."""
    for element in page:
        sect = element.find(qn("w:pPr") + "/" + qn("w:sectPr")) if element.tag == qn("w:p") else None
        if sect is not None:
            margin = sect.find(qn("w:pgMar"))
            if margin is not None and (margin.get(qn("w:left")) or "").lstrip("-").isdigit():
                return int(margin.get(qn("w:left"))) / 20.0
    try:
        return doc.sections[-1].left_margin / EMU_PER_POINT
    except Exception:
        return 72.0


def _rebuild_definition_pages(doc: docx.Document, pdf_bytes: bytes, page_break_after: Set[Any]) -> int:
    """Rebuild a two-column Definition of Terms from the PDF's own lines.

    A thesis's Definition of Terms sets each term in a left column and its definition in
    a right column. pdf2docx reads some such pages as a mix of a table, centred stray
    terms and definitions detached from their terms, which also spilled onto the next
    page. Where a page has several rows with a term beside its definition, the run of
    rows is rebuilt: one paragraph per entry, the term (bold as printed), a tab, then the
    definition, with a hanging indent at the definition column and the PDF's line pitch.
    The pdf2docx paragraphs holding that text are replaced. Returns how many entries
    were written.
    """
    pdf = _open_pdf(pdf_bytes)
    if pdf is None:
        return 0
    try:
        pdf_pages = []
        for page in pdf:
            lines = []
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    spans = [span for span in line.get("spans", []) if (span.get("text") or "").strip()]
                    if spans:
                        lines.append({"x0": line["bbox"][0], "x1": line["bbox"][2], "y0": line["bbox"][1], "y1": line["bbox"][3], "spans": spans,
                                      "text": re.sub(r"\s+", " ", "".join(span["text"] for span in line["spans"])).strip()})
            lines.sort(key=lambda item: (round(item["y0"]), item["x0"]))
            pdf_pages.append(lines)
    finally:
        pdf.close()

    def overlaps(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
        return min(a["y1"], b["y1"]) - max(a["y0"], b["y0"]) > 0.5 * min(a["y1"] - a["y0"], b["y1"] - b["y0"])

    written = 0
    for page_index, page in enumerate(_split_pages(doc, page_break_after)):
        if page_index >= len(pdf_pages):
            break
        lines = pdf_pages[page_index]
        # Rows where a line starts left of another line at the same height: candidate term/definition pairs.
        pairs = []
        for a in lines:
            for b in lines:
                if b["x0"] - a["x0"] >= _DEFLIST_MIN_COLUMN_GAP and b["x0"] - a["x1"] >= _DEFLIST_COLUMN_BAND and overlaps(a, b):
                    pairs.append((a, b))
        if len(pairs) < _DEFLIST_MIN_ROWS:
            continue
        # The columns meet at a gutter: term lines end left of it, definition lines start right of it.
        # Reading the gutter (not each column's left edge) also takes centred terms and definitions.
        term_ends = sorted(a["x1"] for a, _ in pairs)
        definition_starts = sorted(b["x0"] for _, b in pairs)
        term_end = term_ends[min(len(term_ends) - 1, int(len(term_ends) * 0.9))]
        definition_start = definition_starts[int(len(definition_starts) * 0.1)]
        if term_end >= definition_start:
            continue
        split = (term_end + definition_start) / 2
        left_x = min(a["x0"] for a, _ in pairs)
        right_x = definition_start
        in_left = lambda item: item["x1"] <= split + 2 and item["x0"] >= left_x - _DEFLIST_COLUMN_BAND
        in_right = lambda item: item["x0"] >= split - 2
        rows = [(a, b) for a, b in pairs if in_left(a) and in_right(b)]
        if len(rows) < _DEFLIST_MIN_ROWS:
            continue
        # The region runs from the first paired row down through the column lines that follow it.
        top = min(a["y0"] for a, _ in rows)
        region = []
        for item in lines:
            if item["y1"] < top:
                continue
            if in_left(item) or in_right(item):
                region.append(item)
            elif region:
                break
        # Entries: a new one starts at a left-column line that is not just below the previous term line.
        right_lines = [item for item in region if in_right(item)]
        gaps = sorted(b["y0"] - a["y1"] for a, b in zip(right_lines, right_lines[1:]) if b["y0"] > a["y1"] - 1)
        line_gap = gaps[len(gaps) // 4] if gaps else 4.0
        # Read the region row by row: lines at the same height form one row, left column first,
        # so a term and the first line of its definition always land in the same entry.
        ordered: List[Dict[str, Any]] = []
        row: List[Dict[str, Any]] = []
        for item in sorted(region, key=lambda line: line["y0"]):
            if row and not overlaps(row[0], item):
                ordered.extend(sorted(row, key=lambda line: line["x0"]))
                row = []
            row.append(item)
        ordered.extend(sorted(row, key=lambda line: line["x0"]))
        entries: List[Dict[str, Any]] = []
        for item in ordered:
            if in_left(item):
                previous_term = entries[-1]["term"][-1] if entries and entries[-1]["term"] else None
                # A wrapped term ("Artificial Intelligence" / "(AI)") sits one line below the previous term line.
                continues = previous_term is not None and item["y0"] - previous_term["y1"] <= line_gap + 2
                if continues:
                    entries[-1]["term"].append(item)
                else:
                    entries.append({"term": [item], "definition": []})
            elif entries:
                entries[-1]["definition"].append(item)
        entries = [entry for entry in entries if entry["definition"]]
        if len(entries) < _DEFLIST_MIN_ROWS:
            continue
        # A term list: terms printed bold, definitions running longer than their terms. An author
        # sidebar beside an abstract (plain e-mail lines beside prose) is not one.
        term_spans = [span for entry in entries for item in entry["term"] for span in item["spans"]]
        bold_share = sum(1 for span in term_spans if (span.get("flags", 0) & 16) or "bold" in span.get("font", "").lower()) / max(1, len(term_spans))
        term_lines = sum(len(entry["term"]) for entry in entries)
        definition_lines = sum(len(entry["definition"]) for entry in entries)
        if bold_share < _DEFLIST_MIN_BOLD_SHARE or definition_lines < _DEFLIST_MIN_LINE_RATIO * term_lines:
            continue

        def norm_words(text: str) -> List[str]:
            return re.findall(r"[a-z0-9]+", text.lower())

        region_words = set(word for item in region for word in norm_words(item["text"]))
        doomed = []
        for element in page:
            if element.tag not in (qn("w:p"), qn("w:tbl")):
                continue
            if element.find(".//" + qn("a:blip")) is not None or (element.tag == qn("w:p") and element.find(qn("w:pPr") + "/" + qn("w:sectPr")) is not None):
                continue
            words = norm_words("".join(node.text or "" for node in element.iter(qn("w:t"))))
            if words and sum(1 for word in words if word in region_words) >= 0.9 * len(words):
                doomed.append(element)
        if not doomed:
            continue
        # Never lose text: the rebuilt entries must hold the words of everything they replace.
        entry_words = collections.Counter(norm_words(" ".join(item["text"] for entry in entries for item in entry["term"] + entry["definition"])))
        replaced_words = collections.Counter(word for element in doomed for word in norm_words("".join(node.text or "" for node in element.iter(qn("w:t")))))
        if sum((replaced_words - entry_words).values()) > 2:
            continue
        # pdf2docx's empty spacer paragraphs between the replaced ones go with them.
        children = list(doc.element.body)
        first, last = children.index(doomed[0]), children.index(doomed[-1])
        for element in children[first:last + 1]:
            if element in doomed or element.tag != qn("w:p") or element in page_break_after:
                continue
            if element.find(qn("w:pPr") + "/" + qn("w:sectPr")) is not None or element.find(".//" + qn("a:blip")) is not None:
                continue
            if not "".join(node.text or "" for node in element.iter(qn("w:t"))).strip():
                doomed.append(element)

        margin_pt = _page_section_left_margin_pt(doc, page)
        pitch = (sorted(b["y0"] - a["y0"] for a, b in zip(right_lines, right_lines[1:]) if b["y0"] - a["y0"] > 2) or [14.0])
        pitch_pt = pitch[len(pitch) // 4]
        stop_twips = int(round((right_x - margin_pt) * 20))
        left_twips = int(round((left_x - margin_pt) * 20))

        def run_for(text: str, span: Dict[str, Any]) -> Any:
            run = OxmlElement("w:r")
            r_pr = OxmlElement("w:rPr")
            font = re.sub(r"^[A-Z]{6}\+", "", span.get("font", "")).split(",")[0].split("-")[0]
            font = re.sub(r"(PSMT|PS|MT)$", "", font).strip() or "Times New Roman"
            fonts = OxmlElement("w:rFonts")
            for attr in ("w:ascii", "w:hAnsi", "w:cs"):
                fonts.set(qn(attr), font)
            r_pr.append(fonts)
            bold = bool(span.get("flags", 0) & 16) or "bold" in span.get("font", "").lower()
            italic = bool(span.get("flags", 0) & 2) or "italic" in span.get("font", "").lower()
            if bold:
                r_pr.append(OxmlElement("w:b"))
            if italic:
                r_pr.append(OxmlElement("w:i"))
            size = OxmlElement("w:sz")
            size.set(qn("w:val"), str(int(round(span.get("size", 11) * 2))))
            r_pr.append(size)
            run.append(r_pr)
            text_node = OxmlElement("w:t")
            text_node.text = text
            text_node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
            run.append(text_node)
            return run

        anchor_element = doomed[0]
        previous_bottom = None
        for entry in entries:
            paragraph = OxmlElement("w:p")
            p_pr = OxmlElement("w:pPr")
            tabs = OxmlElement("w:tabs")
            tab = OxmlElement("w:tab")
            tab.set(qn("w:val"), "left")
            tab.set(qn("w:pos"), str(stop_twips))
            tabs.append(tab)
            p_pr.append(tabs)
            spacing = OxmlElement("w:spacing")
            first_top = min(item["y0"] for item in entry["term"] + entry["definition"])
            before = 0 if previous_bottom is None else max(0.0, first_top - previous_bottom - (pitch_pt - (entry["definition"][0]["y1"] - entry["definition"][0]["y0"])))
            spacing.set(qn("w:before"), str(int(round(before * 20))))
            spacing.set(qn("w:after"), "0")
            spacing.set(qn("w:line"), str(int(round(pitch_pt * 20))))
            spacing.set(qn("w:lineRule"), "exact")
            p_pr.append(spacing)
            ind = OxmlElement("w:ind")
            ind.set(qn("w:left"), str(stop_twips))
            ind.set(qn("w:hanging"), str(stop_twips - left_twips))
            p_pr.append(ind)
            paragraph.append(p_pr)
            term_spans = [span for item in entry["term"] for span in item["spans"]]
            term_text = " ".join(item["text"] for item in entry["term"])
            paragraph.append(run_for(term_text, term_spans[0]))
            tab_run = OxmlElement("w:r")
            tab_run.append(OxmlElement("w:tab"))
            paragraph.append(tab_run)
            definition_text = " ".join(item["text"] for item in entry["definition"])
            paragraph.append(run_for(definition_text, entry["definition"][0]["spans"][0]))
            anchor_element.addprevious(paragraph)
            previous_bottom = max(item["y1"] for item in entry["term"] + entry["definition"])
            written += 1
        for element in doomed:
            if element in page_break_after:
                # Keep the page-ending paragraph (its break) but empty it.
                for child in list(element):
                    if child.tag != qn("w:pPr"):
                        element.remove(child)
            elif element.getparent() is not None:
                element.getparent().remove(element)
    return written


# A definition-list page has at least this many "term <tab> definition" entries.
_DEFINITION_PAGE_MIN_ENTRIES = 3
_DEFINITION_TERM_MAX_WORDS = 6


def _tabbed_entry(paragraph: Any) -> Optional[Tuple[Any, int, int, str, str]]:
    """(pPr, left indent, tab stop, term, text after the tab) for a "short term <tab> text" paragraph with one left stop."""
    p_pr = paragraph.find(qn("w:pPr"))
    if p_pr is None:
        return None
    stops = [tab for tab in p_pr.iter(qn("w:tab")) if tab.get(qn("w:val")) == "left" and (tab.get(qn("w:pos")) or "").isdigit()]
    if len(stops) != 1:
        return None
    ind = p_pr.find(qn("w:ind"))
    raw_left = ind.get(qn("w:left")) if ind is not None else None
    left = int(raw_left) if raw_left and raw_left.lstrip("-").isdigit() else 0
    stop = int(stops[0].get(qn("w:pos")))
    if stop <= left + 360:
        return None
    pieces: List[str] = [""]
    for node in paragraph.iter(qn("w:t"), qn("w:tab")):
        if node.getparent() is None or node.getparent().tag != qn("w:r"):
            continue
        if node.tag == qn("w:tab"):
            pieces.append("")
        else:
            pieces[-1] += node.text or ""
    if len(pieces) < 2:
        return None
    term, rest = pieces[0].strip(), " ".join(piece.strip() for piece in pieces[1:]).strip()
    if not term or not rest or len(term.split()) > _DEFINITION_TERM_MAX_WORDS:
        return None
    return p_pr, left, stop, term, rest


def _split_at_first_tab(paragraph: Any) -> Optional[Any]:
    """Move everything before the paragraph's first tab into a new paragraph inserted before it; return that paragraph."""
    first_tab = next((node for node in paragraph.iter(qn("w:tab")) if node.getparent() is not None and node.getparent().tag == qn("w:r")), None)
    if first_tab is None:
        return None
    tab_run = first_tab.getparent()
    if tab_run.getparent() is not paragraph:
        return None
    head = copy.deepcopy(paragraph)
    for child in list(head):
        if child.tag != qn("w:pPr"):
            head.remove(child)
    for child in list(paragraph):
        if child.tag == qn("w:pPr"):
            continue
        if child is tab_run:
            # Text in the tab's own run before the tab belongs to the heading.
            before_run = copy.deepcopy(child)
            cut = False
            for node in list(before_run):
                if node.tag == qn("w:rPr"):
                    continue
                if node.tag == qn("w:tab") and not cut:
                    cut = True
                if cut:
                    before_run.remove(node)
            if any(node.tag != qn("w:rPr") for node in before_run):
                head.append(before_run)
            seen_tab = False
            for node in list(child):
                if node.tag == qn("w:rPr") or seen_tab:
                    continue
                child.remove(node)
                if node.tag == qn("w:tab"):
                    seen_tab = True
            if not any(node.tag != qn("w:rPr") for node in child):
                paragraph.remove(child)
            break
        paragraph.remove(child)
        head.append(child)
    paragraph.addprevious(head)
    # The PDF line break between the heading and the body is now the paragraph break.
    _trim_edge_breaks(head, at_end=True)
    _trim_edge_breaks(paragraph, at_end=False)
    return head


def _trim_edge_breaks(paragraph: Any, at_end: bool) -> None:
    """Drop line breaks (and whitespace-only text) at the end or start of a paragraph."""
    runs = [child for child in paragraph if child.tag == qn("w:r")]
    for run in (reversed(runs) if at_end else runs):
        content = [node for node in run if node.tag != qn("w:rPr")]
        for node in (reversed(content) if at_end else content):
            if node.tag == qn("w:br") and node.get(qn("w:type")) in (None, "textWrapping"):
                run.remove(node)
            elif node.tag == qn("w:t") and not (node.text or "").strip():
                run.remove(node)
            else:
                return
        if not any(node.tag != qn("w:rPr") for node in run):
            paragraph.remove(run)


def _repair_tabbed_entries(doc: docx.Document, pdf_bytes: bytes, page_break_after: Set[Any]) -> int:
    """Rebuild "term <tab> text" paragraphs the way the PDF set them.

    pdf2docx joins two shapes into one paragraph with a tab, and both overflowed the page:

    * A Definition of Terms entry, term and definition side by side, the definition wrapped
      in its own column: written as the term, a tab, then every wrapped line after a further
      tab. The editor wraps the text itself, so the inner tabs landed mid-line and the
      wrapped lines fell back under the term. On a page with several of these, each gets a
      hanging indent at the tab stop and its inner tabs become spaces.
    * A run-in heading on its own line followed by a paragraph whose first line is indented
      ("Machine Learning Prediction Engine" / "The literature strongly ..."): written as the
      heading, a tab, the body. It is split back into the heading paragraph and a body
      paragraph with that first-line indent.

    The PDF tells them apart: a definition's first line holds the term and the start of its
    definition, a run-in heading's line holds only the heading. Returns how many changed.
    """
    pdf = _open_pdf(pdf_bytes)
    if pdf is None:
        return 0

    def normal(text: str) -> str:
        return re.sub(r"\s+", " ", text).strip().lower()

    try:
        page_lines: List[List[Tuple[str, float, float]]] = []
        for page in pdf:
            found: List[Tuple[str, float, float]] = []
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    text = normal("".join(span.get("text", "") for span in line.get("spans", [])))
                    if text:
                        found.append((text, line["bbox"][1], line["bbox"][3]))
            page_lines.append(found)
    finally:
        pdf.close()

    def shape(term: str, rest: str, lines: List[Tuple[str, float, float]]) -> Optional[str]:
        """'definition' when the text after the tab starts beside the term, 'heading' when it starts below it."""
        for text, y0, y1 in lines:
            if text.startswith(term + " ") and len(text) > len(term) + 3:
                return "definition"  # term and definition read as one PDF line
        term_line = next(((y0, y1) for text, y0, y1 in lines if text == term), None)
        if term_line is None:
            return None
        lead = rest[:20]
        rest_line = next(((y0, y1) for text, y0, y1 in lines if len(lead) >= 6 and (text.startswith(lead) or lead.startswith(text[:20]))), None)
        if rest_line is None:
            return None
        overlap = min(term_line[1], rest_line[1]) - max(term_line[0], rest_line[0])
        if overlap > 0.5 * (term_line[1] - term_line[0]):
            return "definition"
        return "heading" if rest_line[0] >= term_line[1] - 1 else None

    changed = 0
    for page_index, page in enumerate(_split_pages(doc, page_break_after)):
        if page_index >= len(page_lines):
            break
        lines = page_lines[page_index]
        definitions: List[Tuple[Any, Tuple[Any, int, int, str, str]]] = []
        for element in page:
            if element.tag != qn("w:p"):
                continue
            found = _tabbed_entry(element)
            if not found:
                continue
            term = normal(found[3])
            kind = shape(term, normal(found[4]), lines)
            if kind == "heading":
                # The heading stood alone on its PDF line: split it from the body.
                p_pr, left, stop = found[0], found[1], found[2]
                if _split_at_first_tab(element) is None:
                    continue
                spacing = p_pr.find(qn("w:spacing"))
                if spacing is not None and spacing.get(qn("w:before")) is not None:
                    spacing.set(qn("w:before"), "0")
                for tabs in list(p_pr.iter(qn("w:tabs"))):
                    tabs.getparent().remove(tabs)
                ind = p_pr.find(qn("w:ind"))
                if ind is None:
                    ind = p_pr.makeelement(qn("w:ind"), {})
                    p_pr.append(ind)
                ind.set(qn("w:firstLine"), str(stop - left))
                if ind.get(qn("w:hanging")) is not None:
                    del ind.attrib[qn("w:hanging")]
                changed += 1
            elif kind == "definition":
                definitions.append((element, found))
        if len(definitions) < _DEFINITION_PAGE_MIN_ENTRIES:
            continue
        for paragraph, (p_pr, left, stop, _term, _rest) in definitions:
            ind = p_pr.find(qn("w:ind"))
            if ind is None:
                ind = p_pr.makeelement(qn("w:ind"), {})
                p_pr.append(ind)
            ind.set(qn("w:left"), str(stop))
            ind.set(qn("w:hanging"), str(stop - left))
            for attr in ("w:firstLine", "w:start"):
                if ind.get(qn(attr)) is not None:
                    del ind.attrib[qn(attr)]
            # Every tab after the first one only marked where a wrapped PDF line began.
            tabs = [node for node in paragraph.iter(qn("w:tab")) if node.getparent() is not None and node.getparent().tag == qn("w:r")]
            for tab in tabs[1:]:
                run = tab.getparent()
                space = run.makeelement(qn("w:t"), {})
                space.text = " "
                space.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                run.replace(tab, space)
            changed += 1
    return changed


def _drop_trailing_page_spacers(doc: docx.Document, page_break_after: Set[Any]) -> int:
    """Remove the empty paragraphs pdf2docx leaves at the foot of a page.

    pdf2docx pads a page with empty paragraphs down to where its text ended. Every PDF
    page already ends with a hard page break, so the padding can only push the page's
    last lines onto an extra page when the editor sets the text a little taller. Empty
    paragraphs (no text, picture, field or section break) directly before a page's end
    are removed; the page-ending paragraph itself stays. Returns how many were removed.
    """
    removed = 0
    for page in _split_pages(doc, page_break_after):
        if not page or page[-1] not in page_break_after:
            continue
        for element in reversed(page[:-1]):
            if element.tag != qn("w:p"):
                break
            if "".join(node.text or "" for node in element.iter(qn("w:t"))).strip():
                break
            if element.find(".//" + qn("a:blip")) is not None or element.find(".//" + qn("w:fldChar")) is not None:
                break
            if element.find(qn("w:pPr") + "/" + qn("w:sectPr")) is not None or element.find(".//" + qn("w:br")) is not None and any(br.get(qn("w:type")) == "page" for br in element.iter(qn("w:br"))):
                break
            element.getparent().remove(element)
            removed += 1
    return removed


def _flatten_section_marks(doc: docx.Document, page_break_after: Set[Any]) -> int:
    """Give the empty paragraphs that only carry a continuous section break no height.

    pdf2docx closes a section wherever a PDF page's column layout changes, each with an
    empty paragraph holding the break. Such a paragraph has no spacing of its own, so it
    took the document defaults (a line and 10pt after, about 33px) in the editor, which
    pdf2docx never counted: a page with five of them ran 165px long and spilled onto the
    next. The section stays (its columns and numbering still apply); its paragraph gets
    zero spacing and a 1pt exact line. Page-ending paragraphs are left alone. Returns how
    many were flattened.
    """
    flattened = 0
    for paragraph in doc.element.body.iterchildren(qn("w:p")):
        if paragraph in page_break_after:
            continue
        p_pr = paragraph.find(qn("w:pPr"))
        if p_pr is None or p_pr.find(qn("w:sectPr")) is None:
            continue
        if any(child.tag != qn("w:pPr") for child in paragraph):
            continue
        spacing = p_pr.find(qn("w:spacing"))
        if spacing is None:
            spacing = p_pr.makeelement(qn("w:spacing"), {})
            # Schema order: w:spacing comes before w:ind/w:jc/w:sectPr; inserting before sectPr is enough here.
            p_pr.insert(list(p_pr).index(p_pr.find(qn("w:sectPr"))), spacing)
        spacing.set(qn("w:before"), "0")
        spacing.set(qn("w:after"), "0")
        spacing.set(qn("w:line"), "20")
        spacing.set(qn("w:lineRule"), "exact")
        flattened += 1
    return flattened


def _exact_line_pitch_from_pdf(doc: docx.Document, pdf_bytes: bytes, page_break_after: Set[Any]) -> int:
    """Set each multi-line paragraph's line spacing to the pitch the PDF printed it at.

    pdf2docx writes most line spacing as Word "auto" multiples, but its multiples are not
    Word's: the converter (rightly, for real Word files) scales an auto multiple by the
    font's natural line height, and a memo's 13.1pt pitch came out at 14.4pt. Across a
    page those extra points pushed the last lines onto the next page. For a PDF the pitch
    is known exactly: where a paragraph's text spans two or more PDF lines, the median
    distance between their tops becomes exact line spacing. Paragraphs holding pictures,
    equations or page breaks keep their own spacing (exact spacing would clip a picture).
    Returns how many paragraphs changed.
    """
    pdf = _open_pdf(pdf_bytes)
    if pdf is None:
        return 0

    def normal(text: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", text.lower())

    try:
        page_lines: List[List[Tuple[str, float]]] = []
        for page in pdf:
            # Fragments on one baseline (a justified line drawn word by word) form one visual line, left to right.
            pieces = []
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    raw = "".join(span.get("text", "") for span in line.get("spans", []))
                    if raw.strip():
                        pieces.append((line["bbox"][1], line["bbox"][0], raw))
            pieces.sort()
            visual: List[List[Any]] = []
            for top, x0, raw in pieces:
                if visual and abs(visual[-1][0] - top) <= 2.0:
                    visual[-1][1].append((x0, raw))
                else:
                    visual.append([top, [(x0, raw)]])
            lines = []
            for top, parts in visual:
                text = normal("".join(raw for _x, raw in sorted(parts)))
                if len(text) >= 3:
                    lines.append((text, top))
            page_lines.append(lines)
    finally:
        pdf.close()

    changed = 0
    for page_index, page in enumerate(_split_pages(doc, page_break_after)):
        if page_index >= len(page_lines):
            break
        lines = page_lines[page_index]
        for element in page:
            if element.tag != qn("w:p"):
                continue
            if element.find(".//" + qn("a:blip")) is not None or any(br.get(qn("w:type")) == "page" for br in element.iter(qn("w:br"))):
                continue
            if element.find(".//{http://schemas.openxmlformats.org/officeDocument/2006/math}oMath") is not None:
                continue
            text = normal("".join(node.text or "" for node in element.iter(qn("w:t"))))
            if len(text) < 40:
                continue
            p_pr = element.find(qn("w:pPr"))
            spacing = p_pr.find(qn("w:spacing")) if p_pr is not None else None
            if spacing is not None and spacing.get(qn("w:lineRule")) in ("exact", "atLeast"):
                continue
            # Walk the PDF lines that spell the paragraph from its start.
            start = next((i for i, (line, _y) in enumerate(lines) if len(line) >= 8 and text.startswith(line)), None)
            if start is None:
                continue
            tops = [lines[start][1]]
            consumed = len(lines[start][0])
            for line, top in lines[start + 1:]:
                if consumed >= len(text):
                    break
                if text.startswith(line, consumed):
                    tops.append(top)
                    consumed += len(line)
                elif line in text[consumed:consumed + len(line) + 3]:
                    tops.append(top)
                    consumed = text.index(line, consumed) + len(line)
                else:
                    break
            gaps = sorted(b - a for a, b in zip(tops, tops[1:]) if b > a + 2)
            if not gaps or consumed < 0.8 * len(text):
                continue
            pitch_pt = gaps[len(gaps) // 2]
            if p_pr is None:
                p_pr = element.makeelement(qn("w:pPr"), {})
                element.insert(0, p_pr)
            if spacing is None:
                spacing = p_pr.makeelement(qn("w:spacing"), {})
                p_pr.append(spacing)
            spacing.set(qn("w:line"), str(int(round(pitch_pt * 20))))
            spacing.set(qn("w:lineRule"), "exact")
            changed += 1
    return changed


def _grid_from_cell_widths(doc: docx.Document) -> int:
    """Give each table the column widths its cells carry.

    pdf2docx writes a table's grid as equal columns and puts the real widths on the
    cells (a bullet column of 680 twips beside a 5260-twip indicator column). The editor
    sizes columns from the grid, so the narrow bullet column got a quarter of the width,
    the long labels wrapped onto extra lines and a results table grew a third taller. Each
    column takes the median width of its unmerged cells that differ from the placeholder;
    a column covered only by merged cells is solved from the merged cell's total. Returns
    how many tables changed.
    """
    changed = 0
    for tbl in doc.element.body.iter(qn("w:tbl")):
        grid_cols = list(tbl.iterchildren(qn("w:tblGrid")))
        cols = list(grid_cols[0].iterchildren(qn("w:gridCol"))) if grid_cols else []
        if len(cols) < 2:
            continue
        placeholder = {col.get(qn("w:w")) for col in cols}
        if len(placeholder) != 1:
            continue  # the grid already has distinct widths
        default = next(iter(placeholder))
        rows: List[List[Tuple[int, int, Optional[int]]]] = []
        for tr in tbl.iterchildren(qn("w:tr")):
            position, cells = 0, []
            for tc in tr.iterchildren(qn("w:tc")):
                tc_pr = tc.find(qn("w:tcPr"))
                span_el = tc_pr.find(qn("w:gridSpan")) if tc_pr is not None else None
                span = int(span_el.get(qn("w:val"))) if span_el is not None and (span_el.get(qn("w:val")) or "").isdigit() else 1
                width_el = tc_pr.find(qn("w:tcW")) if tc_pr is not None else None
                raw = width_el.get(qn("w:w")) if width_el is not None else None
                width = int(raw) if raw and raw.isdigit() and width_el.get(qn("w:type")) in (None, "dxa") else None
                cells.append((position, span, width))
                position += span
            rows.append(cells)
        widths: List[Optional[int]] = [None] * len(cols)
        samples: Dict[int, List[int]] = {}
        for cells in rows:
            for position, span, width in cells:
                if span == 1 and width and str(width) != default and position < len(cols):
                    samples.setdefault(position, []).append(width)
        for position, values in samples.items():
            values.sort()
            widths[position] = values[len(values) // 2]
        for _ in range(len(cols)):
            progress = False
            for cells in rows:
                for position, span, width in cells:
                    covered = list(range(position, min(position + span, len(cols))))
                    missing = [c for c in covered if widths[c] is None]
                    if span > 1 and width and len(missing) == 1:
                        rest = width - sum(widths[c] for c in covered if widths[c] is not None)
                        if rest > 0:
                            widths[missing[0]] = rest
                            progress = True
            if not progress:
                break
        if all(width is None for width in widths):
            continue
        for col, width in zip(cols, widths):
            if width is not None:
                col.set(qn("w:w"), str(width))
        changed += 1
    return changed


# The gap above a page's trailing block (its footer, signature, last paragraph) gives up this share, when large.
_PAGE_BOTTOM_GAP_MIN_TWIPS = 600
_PAGE_BOTTOM_GAP_SHARE = 0.3
_PAGE_BOTTOM_LOOKBACK = 4


def _loosen_page_bottoms(doc: docx.Document, page_break_after: Set[Any]) -> int:
    """Shrink the large gap above the block at the foot of each PDF page.

    pdf2docx places a page's footer or closing block with a space-before that reaches
    exactly to where the PDF printed it. Lines set a pixel taller anywhere above add up,
    and the footer of a DepEd manual's page 6 then fell onto a page of its own, shifting
    every later page. Each PDF page ends with a hard break, so the block need not touch
    the bottom: among the last few blocks of a page, the largest gap above 30pt gives up
    30% of itself. Returns how many gaps changed.
    """
    changed = 0
    for page in _split_pages(doc, page_break_after):
        content = [
            el for el in page
            if el.tag == qn("w:tbl")
            or "".join(node.text or "" for node in el.iter(qn("w:t"))).strip()
            or el.find(".//" + qn("a:blip")) is not None
        ]
        best, best_before = None, 0
        for element in content[-_PAGE_BOTTOM_LOOKBACK:]:
            if element.tag != qn("w:p"):
                continue
            spacing = element.find(qn("w:pPr") + "/" + qn("w:spacing"))
            raw = spacing.get(qn("w:before")) if spacing is not None else None
            if raw and raw.isdigit() and int(raw) > best_before:
                best, best_before = spacing, int(raw)
        if best is not None and best_before > _PAGE_BOTTOM_GAP_MIN_TWIPS:
            best.set(qn("w:before"), str(int(best_before * (1 - _PAGE_BOTTOM_GAP_SHARE))))
            changed += 1
    return changed


# A picture floats when at least this many PDF text lines sit beside it.
_FLOAT_MIN_SIDE_LINES = 2
_FLOAT_SIZE_TOLERANCE_PT = 3.0


def _float_pictures_beside_text(doc: docx.Document, pdf_bytes: bytes, page_break_after: Set[Any]) -> int:
    """Float a picture beside the text the PDF set next to it.

    A journal's logo sits to the right of its masthead lines; a screenshot sits left of
    the paragraph that wraps around it. pdf2docx gives such a picture a paragraph of its
    own, so the editor stacked picture and text and the page ran long. Where the PDF draws
    two or more text lines beside a picture-only paragraph's picture, the picture becomes
    a square-wrapped anchor on the paragraph holding the first of those lines, on the side
    and at the height the PDF shows; its own paragraph goes. Returns how many moved.
    """
    pdf = _open_pdf(pdf_bytes)
    if pdf is None:
        return 0

    def normal(text: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", text.lower())

    try:
        pages = []
        for page in pdf:
            images = [info["bbox"] for info in page.get_image_info() if info.get("bbox")]
            lines = []
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    text = "".join(span.get("text", "") for span in line.get("spans", []))
                    if text.strip():
                        lines.append((tuple(line["bbox"]), normal(text)))
            pages.append((page.rect.width, images, lines))
    finally:
        pdf.close()

    moved = 0
    for page_index, page in enumerate(_split_pages(doc, page_break_after)):
        if page_index >= len(pages):
            break
        page_width, images, lines = pages[page_index]
        candidates = []
        for element in page:
            if element.tag != qn("w:p") or element in page_break_after:
                continue
            for inline in element.iter(f"{{{_NS_WP}}}inline"):
                extent = inline.find(f"{{{_NS_WP}}}extent")
                cx, cy = _int_attr(extent, "cx"), _int_attr(extent, "cy")
                if cx and cy and inline.find(f".//{{{_NS_A}}}blip") is not None:
                    candidates.append((element, inline, cx / EMU_PER_POINT, cy / EMU_PER_POINT))
        for element, inline, width_pt, height_pt in candidates:
            box = next((b for b in images if abs((b[2] - b[0]) - width_pt) <= _FLOAT_SIZE_TOLERANCE_PT and abs((b[3] - b[1]) - height_pt) <= _FLOAT_SIZE_TOLERANCE_PT), None)
            if box is None:
                continue
            beside = sorted(
                (line_box, text) for line_box, text in lines
                if min(line_box[3], box[3]) - max(line_box[1], box[1]) > 0.5 * (line_box[3] - line_box[1])
                # Wrapped text can start right at the picture's edge.
                and (line_box[2] <= box[0] + 1 or line_box[0] >= box[2] - 1) and len(text) >= 3
            )
            if len(beside) < _FLOAT_MIN_SIDE_LINES:
                continue
            first_box, first_text = beside[0]
            target = None
            for candidate in page:
                if candidate.tag != qn("w:p") or candidate.getparent() is None:
                    continue
                candidate_text = normal("".join(node.text or "" for node in candidate.iter(qn("w:t"))))
                if candidate_text and (candidate_text.startswith(first_text[:20]) or first_text.startswith(candidate_text[:20])):
                    target = candidate
                    break
            if target is None:
                continue
            side = "right" if (box[0] + box[2]) / 2 > page_width / 2 else "left"
            offset_emu = int(max(0.0, box[1] - first_box[1]) * EMU_PER_POINT)
            anchor_el = OxmlElement("wp:anchor")
            for name, value in (("distT", "0"), ("distB", "0"), ("distL", "114300"), ("distR", "114300"), ("simplePos", "0"),
                                ("relativeHeight", "1"), ("behindDoc", "0"), ("locked", "0"), ("layoutInCell", "1"), ("allowOverlap", "1")):
                anchor_el.set(name, value)
            simple = OxmlElement("wp:simplePos")
            simple.set("x", "0")
            simple.set("y", "0")
            anchor_el.append(simple)
            horizontal = OxmlElement("wp:positionH")
            horizontal.set("relativeFrom", "margin")
            align = OxmlElement("wp:align")
            align.text = side
            horizontal.append(align)
            anchor_el.append(horizontal)
            vertical = OxmlElement("wp:positionV")
            vertical.set("relativeFrom", "paragraph")
            offset = OxmlElement("wp:posOffset")
            offset.text = str(offset_emu)
            vertical.append(offset)
            anchor_el.append(vertical)
            children = {child.tag: child for child in inline}
            for tag in ("extent", "effectExtent"):
                child = children.get(f"{{{_NS_WP}}}{tag}")
                if child is not None:
                    anchor_el.append(child)
            wrap = OxmlElement("wp:wrapSquare")
            wrap.set("wrapText", "bothSides")
            anchor_el.append(wrap)
            for tag in ("docPr", "cNvGraphicFramePr"):
                child = children.get(f"{{{_NS_WP}}}{tag}")
                if child is not None:
                    anchor_el.append(child)
            graphic = inline.find(f"{{{_NS_A}}}graphic")
            if graphic is None:
                continue
            anchor_el.append(graphic)
            run = OxmlElement("w:r")
            drawing = OxmlElement("w:drawing")
            drawing.append(anchor_el)
            run.append(drawing)
            # Take the picture out of its run (and the run, and the paragraph, when nothing else is left).
            old_run = next(inline.iterancestors(qn("w:r")), None)
            old_drawing = next(inline.iterancestors(qn("w:drawing")), None)
            if old_run is None or old_drawing is None:
                continue
            old_drawing.getparent().remove(old_drawing)
            if not any(child.tag != qn("w:rPr") for child in old_run):
                old_run.getparent().remove(old_run)
            p_pr = target.find(qn("w:pPr"))
            target.insert(1 if p_pr is not None else 0, run)
            leftover = "".join(node.text or "" for node in element.iter(qn("w:t"))).strip()
            if element is not target and not leftover and element.find(".//" + qn("w:drawing")) is None and element.getparent() is not None:
                element.getparent().remove(element)
            moved += 1
    return moved


def _keep_blank_pages(doc: docx.Document, page_break_after: Set[Any]) -> int:
    """Keep a PDF page that is blank once its page number has moved to the footer.

    A thesis leaves a page blank but numbered; the number becomes the running footer,
    the page holds nothing, and the emitter (which never writes two page breaks in a row)
    dropped it, so every later page sat one page early. Such a page's closing paragraph
    gets a non-breaking space, which keeps the page. Returns how many pages were kept.
    """
    kept = 0
    for page in _split_pages(doc, page_break_after):
        if not page or page[-1] not in page_break_after or page[-1].tag != qn("w:p"):
            continue
        if any("".join(node.text or "" for node in el.iter(qn("w:t"))).strip() for el in page):
            continue
        if any(el.tag == qn("w:tbl") or el.find(".//" + qn("w:drawing")) is not None for el in page):
            continue
        run = OxmlElement("w:r")
        text = OxmlElement("w:t")
        text.text = " "
        text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        run.append(text)
        page[-1].append(run)
        kept += 1
    return kept


def _merge_split_table_rows(doc: docx.Document) -> int:
    """Join table rows that pdf2docx split one printed row into.

    In a List of Tables the page numbers sat a point lower than the names, and pdf2docx
    gave each its own row: "22" alone, then "1 / COMPARATIVE MATRIX" alone. Each half-row
    was only a few points tall in the PDF but takes a full line in the editor, so the list
    grew by a third and spilled onto the next page. Two neighbouring rows whose filled
    columns do not overlap, with the same cell layout, are one printed row: the second's
    cell contents move into the first, which takes their combined height. Returns how many
    rows were merged away.
    """
    def cells_of(row: Any) -> List[Any]:
        return list(row.iterchildren(qn("w:tc")))

    def filled(cell: Any) -> bool:
        return bool("".join(node.text or "" for node in cell.iter(qn("w:t"))).strip()) or cell.find(".//" + qn("w:drawing")) is not None

    def span(cell: Any) -> int:
        found = cell.find(qn("w:tcPr") + "/" + qn("w:gridSpan"))
        return int(found.get(qn("w:val"))) if found is not None and (found.get(qn("w:val")) or "").isdigit() else 1

    def height(row: Any) -> int:
        found = row.find(qn("w:trPr") + "/" + qn("w:trHeight"))
        return int(found.get(qn("w:val"))) if found is not None and (found.get(qn("w:val")) or "").isdigit() else 0

    merged = 0
    for tbl in doc.element.body.iter(qn("w:tbl")):
        rows = list(tbl.iterchildren(qn("w:tr")))
        index = 0
        while index < len(rows) - 1:
            first, second = rows[index], rows[index + 1]
            a, b = cells_of(first), cells_of(second)
            same_layout = len(a) == len(b) and [span(c) for c in a] == [span(c) for c in b]
            fill_a = [filled(c) for c in a]
            fill_b = [filled(c) for c in b]
            disjoint = same_layout and not any(x and y for x, y in zip(fill_a, fill_b))
            partial = same_layout and any(fill_a) and any(fill_b) and not all(fill_a) and not all(fill_b)
            if not (disjoint and partial):
                index += 1
                continue
            for cell_a, cell_b, has_b in zip(a, b, fill_b):
                if not has_b:
                    continue
                for child in list(cell_a):
                    if child.tag != qn("w:tcPr"):
                        cell_a.remove(child)
                for child in list(cell_b):
                    if child.tag != qn("w:tcPr"):
                        cell_a.append(child)
            total = height(first) + height(second)
            if total:
                tr_pr = first.find(qn("w:trPr"))
                if tr_pr is None:
                    tr_pr = first.makeelement(qn("w:trPr"), {})
                    first.insert(0, tr_pr)
                found = tr_pr.find(qn("w:trHeight"))
                if found is None:
                    found = tr_pr.makeelement(qn("w:trHeight"), {})
                    tr_pr.append(found)
                found.set(qn("w:val"), str(total))
            tbl.remove(second)
            rows.pop(index + 1)
            merged += 1
    return merged


# A paragraph's space-before counts its picture's height when it is at least this share of it.
_PICTURE_GAP_SHARE = 0.6


def _absorb_inline_picture_gaps(doc: docx.Document) -> int:
    """Stop counting a picture's height twice in the space above its paragraph.

    pdf2docx measures a paragraph's space-before to the top of its text line. When a
    picture sits on that line with the text at its foot (a figure with its caption beside
    it), the space-before it writes already spans the picture, and the editor then draws
    the picture as its own block on top of that space: a 165pt figure took 315pt and
    pushed the page's last lines onto the next page. When the space-before is at least
    most of the picture's height, the picture's height is taken off it. Returns how many
    paragraphs changed.
    """
    changed = 0
    for paragraph in doc.element.body.iter(qn("w:p")):
        heights = []
        for inline in paragraph.iter(f"{{{_NS_WP}}}inline"):
            extent = inline.find(f"{{{_NS_WP}}}extent")
            cy = _int_attr(extent, "cy")
            if cy:
                heights.append(cy / EMU_PER_POINT * 20)  # twips
        if not heights:
            continue
        spacing = paragraph.find(qn("w:pPr") + "/" + qn("w:spacing"))
        before = spacing.get(qn("w:before")) if spacing is not None else None
        if not before or not before.lstrip("-").isdigit():
            continue
        picture = max(heights)
        if int(before) >= _PICTURE_GAP_SHARE * picture:
            spacing.set(qn("w:before"), str(max(0, int(int(before) - picture))))
            changed += 1
    return changed


# A side line (a memo's date beside the office name) is at most this long, and looks back this many paragraphs.
_SIDE_LINE_MAX_CHARS = 40
_SIDE_LINE_LOOKBACK = 6

# Rows of a paragraph laid out in columns: a gap this wide (pt) between two pieces of text on one
# row, or a row that starts this far (pt) right of the text's left edge. Prose has neither.
_COLUMN_GAP_PT = 72.0
_COLUMN_START_PT = 144.0
# Two pieces of text whose vertical centres are this close (pt) sit on the same PDF row.
_SAME_ROW_PT = 3.0
# An existing tab stop this close (twips) to a column's position already serves it.
_TAB_STOP_NEAR_TWIPS = 216


def _restore_column_rows_from_pdf(doc: docx.Document, pdf_bytes: bytes, page_break_after: Set[Any]) -> int:
    """Put back the rows and columns of side-by-side lines pdf2docx ran together.

    An approval sheet signs two people side by side: a name on the left and one on the right,
    each title on the line under its name. pdf2docx writes those two printed lines as one
    paragraph, the names run together with no tab and the titles on the same line after them
    ("MS. GIAN S. MAHUSAYALEXANDER Y. BUCOL … Adviser  IT Research Coordinator"). Each run is
    matched to its text in the PDF to learn its row. Where rows are laid out in columns (a wide
    gap between two pieces of one row, or a row starting far to the right), a line break goes
    between rows, a tab goes across each wide gap, tabs left dangling at a row's end are dropped,
    and the paragraph gets a left tab stop at each column. Wrapped prose has no such rows and is
    left alone, and so is any paragraph whose text cannot all be found in the PDF.
    Returns how many paragraphs were rebuilt.
    """
    pdf = _open_pdf(pdf_bytes)
    if pdf is None:
        return 0

    def normal(text: str) -> str:
        return re.sub(r"\s+", " ", text).strip()

    try:
        pages: List[List[Tuple[str, Tuple[float, float, float, float]]]] = []
        for page in pdf:
            spans = []
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = normal(span.get("text", ""))
                        if text:
                            spans.append((text, tuple(span["bbox"])))
            pages.append(spans)
    finally:
        pdf.close()
    try:
        section = doc.sections[0]
        margin_pt = section.left_margin / 12700.0
        right_edge_pt = (section.page_width - section.right_margin) / 12700.0
    except Exception:
        return 0

    def run_text(run: Any) -> str:
        return "".join(node.text or "" for node in run.iter(qn("w:t")))

    def is_tab_run(run: Any) -> bool:
        return run.find(qn("w:tab")) is not None and not run_text(run).strip()

    def has_break(run: Any) -> bool:
        return any(br.get(qn("w:type")) in (None, "textWrapping") for br in run.iter(qn("w:br")))

    def indent_pt(p: Any) -> float:
        ind = p.find(qn("w:pPr") + "/" + qn("w:ind"))
        if ind is None:
            return 0.0
        value = ind.get(qn("w:left")) or ind.get(qn("w:start")) or "0"
        try:
            return int(value) / 20.0
        except ValueError:
            return 0.0

    def skip_past(p: Any, spans: List[Tuple[str, Tuple[float, float, float, float]]], start: int) -> int:
        """Where the next paragraph's text starts: after this paragraph's own spans, when found."""
        target = re.sub(r"\s+", "", "".join(run_text(r) for r in p.iter(qn("w:r"))))
        if not target:
            return start
        for index in range(start, min(len(spans), start + 60)):
            joined, end = re.sub(r"\s+", "", spans[index][0]), index
            if not joined or not target.startswith(joined):
                continue
            while len(joined) < len(target) and end + 1 < len(spans):
                following = re.sub(r"\s+", "", spans[end + 1][0])
                if not target.startswith(joined + following):
                    break
                end += 1
                joined += following
            return end + 1
        return start

    def rebuild(p: Any, spans: List[Tuple[str, Tuple[float, float, float, float]]], start: int) -> Tuple[bool, int]:
        runs = [r for r in p if r.tag == qn("w:r")]
        if len(runs) < 2 or len(p.findall(qn("w:r"))) != len(runs):
            return False, skip_past(p, spans, start)  # hyperlinks, fields or other wrappers: leave alone
        jc = p.find(qn("w:pPr") + "/" + qn("w:jc"))
        if jc is not None and jc.get(qn("w:val")) == "center":
            return False, skip_past(p, spans, start)  # a centred block's short lines only look like columns
        if any(t.get(qn("w:val")) == "right" for t in p.iter(qn("w:tab")) if t.getparent().tag == qn("w:tabs")):
            return False, skip_past(p, spans, start)  # a side line already set against the right margin (memo date)
        # Match every text run to its PDF span(s), in order, to learn its row and position. A run
        # of wrapped prose covers several printed lines: it is placed by where it ends, and
        # `starts` keeps where it begins.
        placed: List[Tuple[Any, Optional[Tuple[float, float, float, float]]]] = []
        starts: Dict[int, Tuple[float, float, float, float]] = {}
        cursor = start
        # The unmatched rest of the span the previous run matched: one printed span ("Date:____")
        # can hold several runs ("Date:", "____").
        rest, rest_index = "", -1
        for run in runs:
            text = normal(run_text(run))
            if not text:
                placed.append((run, None))
                continue
            if rest and text in rest:
                rest = rest[rest.index(text) + len(text):]
                placed.append((run, spans[rest_index][1]))
                continue
            hit: Optional[Tuple[int, int]] = None
            for index in range(cursor, min(len(spans), cursor + 60)):
                span_text = spans[index][0]
                if span_text == text or span_text.startswith(text) or text in span_text:
                    hit = (index, index)
                    break
                if text.startswith(span_text):
                    joined, end = span_text, index
                    while end + 1 < len(spans) and len(joined) < len(text):
                        end += 1
                        joined = normal(joined + " " + spans[end][0])
                    if joined.replace(" ", "") == text.replace(" ", ""):
                        hit = (index, end)
                        break
            if hit is None:
                return False, skip_past(p, spans, start)
            if hit[1] != hit[0]:
                starts[len(placed)] = spans[hit[0]][1]
            placed.append((run, spans[hit[1]][1]))
            last_text = spans[hit[1]][0]
            rest = last_text[last_text.index(text) + len(text):] if hit[0] == hit[1] and text in last_text else ""
            rest_index = hit[1]
            cursor = hit[1] + 1
        # Rows, top to bottom, by vertical centre.
        rows: List[float] = []
        for _, box in placed:
            if box is None:
                continue
            centre = (box[1] + box[3]) / 2
            if not any(abs(centre - row) <= _SAME_ROW_PT for row in rows):
                rows.append(centre)
        if len(rows) < 2:
            return False, cursor
        rows.sort()

        def row_of(box: Tuple[float, float, float, float]) -> int:
            centre = (box[1] + box[3]) / 2
            return min(range(len(rows)), key=lambda i: abs(rows[i] - centre))

        text_left = margin_pt + indent_pt(p)
        boxes_by_row: Dict[int, List[Tuple[float, float, float, float]]] = {}
        for _, box in placed:
            if box is not None:
                boxes_by_row.setdefault(row_of(box), []).append(box)
        column_rows = set()
        for row, boxes in boxes_by_row.items():
            boxes.sort(key=lambda b: b[0])
            gaps = [b[0] - a[2] for a, b in zip(boxes, boxes[1:])]
            if any(gap >= _COLUMN_GAP_PT for gap in gaps) or boxes[0][0] - text_left >= _COLUMN_START_PT:
                column_rows.add(row)
        if not column_rows:
            return False, cursor

        # Each text run's row; whitespace and tab runs belong with the text before them.
        rows_of: List[int] = []
        current = row_of(next(box for _, box in placed if box is not None))
        for _, box in placed:
            if box is not None:
                current = row_of(box)
            rows_of.append(current)

        changed = False
        new_children: List[Any] = []
        stops_pt: List[float] = []
        previous_box: Optional[Tuple[float, float, float, float]] = None
        last_text_at = -1
        for index, (run, box) in enumerate(placed):
            row = rows_of[index]
            if box is not None and previous_box is not None:
                previous_row = row_of(previous_box)
                # Already on a new line (a break between the rows): its tabs are that line's indent.
                broken = any(has_break(child) for child in new_children[last_text_at + 1:]) if last_text_at >= 0 else False
                # Wrapped text, not a new row: the line ran to the right edge and the next one
                # starts where its last piece started (a glossary definition's second line).
                wraps = right_edge_pt - previous_box[2] <= 40 and abs(box[0] - previous_box[0]) <= 8
                if row != previous_row and (row in column_rows or previous_row in column_rows) and not broken and not wraps:
                    # A new printed row: drop tabs dangling at the end of the old one, then break.
                    while new_children and is_tab_run(new_children[-1]):
                        new_children.pop()
                        changed = True
                    if not (new_children and has_break(new_children[-1])):
                        br_run = run.makeelement(qn("w:r"), {})
                        br_run.append(br_run.makeelement(qn("w:br"), {}))
                        new_children.append(br_run)
                        changed = True
                    if box[0] - text_left >= _COLUMN_START_PT / 2:
                        tab_run = run.makeelement(qn("w:r"), {})
                        tab_run.append(tab_run.makeelement(qn("w:tab"), {}))
                        new_children.append(tab_run)
                        stops_pt.append(box[0])
                        changed = True
                elif row == previous_row and row in column_rows and box[0] - previous_box[2] >= _COLUMN_GAP_PT:
                    if not (new_children and is_tab_run(new_children[-1])):
                        tab_run = run.makeelement(qn("w:r"), {})
                        tab_run.append(tab_run.makeelement(qn("w:tab"), {}))
                        new_children.append(tab_run)
                        changed = True
                    stops_pt.append(box[0])
            elif box is not None and previous_box is None and row in column_rows and box[0] - text_left >= _COLUMN_START_PT / 2:
                stops_pt.append(box[0])
            new_children.append(run)
            if box is not None:
                previous_box = box
                last_text_at = len(new_children) - 1
        if not changed:
            return False, cursor
        for run in runs:
            p.remove(run)
        for child in new_children:
            p.append(child)

        # A left tab stop at each column (positions are measured from the page margin).
        p_pr = p.find(qn("w:pPr"))
        if p_pr is None:
            p_pr = p.makeelement(qn("w:pPr"), {})
            p.insert(0, p_pr)
        tabs = p_pr.find(qn("w:tabs"))
        if tabs is None:
            tabs = p_pr.makeelement(qn("w:tabs"), {})
            p_pr.insert(0, tabs)
        existing = [int(t.get(qn("w:pos")) or 0) for t in tabs.findall(qn("w:tab"))]
        for x in sorted(set(round(x, 1) for x in stops_pt)):
            pos = int(round((x - margin_pt) * 20))
            if pos > 0 and not any(abs(pos - e) <= _TAB_STOP_NEAR_TWIPS for e in existing):
                tabs.append(tabs.makeelement(qn("w:tab"), {qn("w:val"): "left", qn("w:pos"): str(pos)}))
                existing.append(pos)
        ordered = sorted(tabs.findall(qn("w:tab")), key=lambda t: int(t.get(qn("w:pos")) or 0))
        for t in ordered:
            tabs.remove(t)
            tabs.append(t)
        return True, cursor

    # Paragraphs follow the page from top to bottom, so each one's text is looked for after the
    # previous one's: a contents entry "TABLE OF CONTENTS  v" must not match the page's title.
    rebuilt, page_index, page_cursor = 0, 0, 0
    for element in list(doc.element.body):
        if element.tag == qn("w:p") and page_index < len(pages):
            try:
                done, page_cursor = rebuild(element, pages[page_index], page_cursor)
                if done:
                    rebuilt += 1
            except Exception:
                pass  # a repair, never a reason for the import to fail
        if element in page_break_after:
            page_index += 1
            page_cursor = 0
    return rebuilt


def _rejoin_side_lines_from_pdf(doc: docx.Document, pdf_bytes: bytes, page_break_after: Set[Any]) -> int:
    """Put a short right-hand line back on the line it shares in the PDF.

    A memo prints its date flush right on the same line as the office name; pdf2docx
    writes the date as its own right-aligned paragraph a few lines further down, with a
    large gap under it, which pushed the whole page down. A short right-aligned
    paragraph whose PDF line sits beside (same height, wholly to the right of) the
    first line of one of the few paragraphs before it moves into that paragraph after a
    right tab stop at the right margin, as Word would write it. Returns how many moved.
    """
    pdf = _open_pdf(pdf_bytes)
    if pdf is None:
        return 0

    def normal(text: str) -> str:
        return re.sub(r"\s+", " ", text).strip().lower()

    try:
        pages: List[List[Tuple[str, Tuple[float, float, float, float]]]] = []
        for page in pdf:
            lines = []
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    text = normal("".join(span.get("text", "") for span in line.get("spans", [])))
                    if text:
                        lines.append((text, tuple(line["bbox"])))
            pages.append(lines)
    finally:
        pdf.close()
    try:
        section = doc.sections[0]
        text_width_twips = int((section.page_width - section.left_margin - section.right_margin) / 635.0)
    except Exception:
        return 0
    if text_width_twips <= 0:
        return 0

    def first_line_box(text: str, lines: List[Tuple[str, Tuple[float, float, float, float]]]) -> Optional[Tuple[float, float, float, float]]:
        for line_text, box in lines:
            if len(line_text) >= 4 and (text == line_text or text.startswith(line_text + " ")):
                return box
        return None

    moved, page_index = 0, 0
    page_paragraphs: List[Any] = []
    for element in list(doc.element.body):
        if element.tag == qn("w:p") and page_index < len(pages):
            text = normal("".join(node.text or "" for node in element.iter(qn("w:t"))))
            jc = element.find(qn("w:pPr") + "/" + qn("w:jc"))
            is_right = jc is not None and jc.get(qn("w:val")) == "right"
            if is_right and 2 <= len(text) <= _SIDE_LINE_MAX_CHARS and element not in page_break_after:
                box = next((b for t, b in pages[page_index] if t == text), None)
                target = None
                if box is not None:
                    for candidate in reversed(page_paragraphs[-_SIDE_LINE_LOOKBACK:]):
                        candidate_text = normal("".join(node.text or "" for node in candidate.iter(qn("w:t"))))
                        cbox = first_line_box(candidate_text, pages[page_index]) if candidate_text else None
                        if cbox is None:
                            continue
                        overlap = min(box[3], cbox[3]) - max(box[1], cbox[1])
                        if overlap > 0.5 * (box[3] - box[1]) and cbox[2] < box[0]:
                            target = candidate
                            break
                if target is not None and not any(True for _ in target.iter(qn("w:tab"))):
                    p_pr = target.find(qn("w:pPr"))
                    if p_pr is None:
                        p_pr = target.makeelement(qn("w:pPr"), {})
                        target.insert(0, p_pr)
                    tabs = p_pr.find(qn("w:tabs"))
                    if tabs is None:
                        tabs = p_pr.makeelement(qn("w:tabs"), {})
                        p_pr.insert(0, tabs)
                    tabs.append(tabs.makeelement(qn("w:tab"), {qn("w:val"): "right", qn("w:pos"): str(text_width_twips)}))
                    # pdf2docx narrows the line to where its own text ended; the side text needs the full width.
                    ind = p_pr.find(qn("w:ind"))
                    if ind is not None:
                        for attr in ("w:right", "w:end"):
                            if ind.get(qn(attr)) is not None:
                                ind.set(qn(attr), "0")
                    runs = element.findall(qn("w:r"))
                    if runs:
                        tab_run = target.makeelement(qn("w:r"), {})
                        tab_run.append(tab_run.makeelement(qn("w:tab"), {}))
                        # The side text joins the target's first line: before the target's first line break if any.
                        first_break = next((r for r in target.findall(qn("w:r")) if r.find(qn("w:br")) is not None), None)
                        anchor_index = list(target).index(first_break) if first_break is not None else len(target)
                        for offset, node in enumerate([tab_run] + runs):
                            target.insert(anchor_index + offset, node)
                        element.getparent().remove(element)
                        moved += 1
                        continue
            page_paragraphs.append(element)
        if element in page_break_after:
            page_index += 1
            page_paragraphs = []
    return moved




def _table_has_borders(tbl: Any) -> bool:
    """Whether the table or any of its cells draws a border."""
    def drawn(borders: Any) -> bool:
        return borders is not None and any(edge.get(qn("w:val")) not in (None, "nil", "none") for edge in borders)

    if drawn(tbl.find(qn("w:tblPr") + "/" + qn("w:tblBorders"))):
        return True
    return any(drawn(cell.find(qn("w:tcPr") + "/" + qn("w:tcBorders"))) for cell in tbl.iter(qn("w:tc")))


def _unwrap_layout_tables(doc: docx.Document) -> int:
    """Turn pdf2docx's single-cell layout frames back into paragraphs.

    pdf2docx reads a framed line or a lone centred heading as a borderless one-cell table.
    That cell's paragraphs take its place in reading order. Tables with two or more cells
    are kept, whatever they hold: side-by-side cells are how the PDF set them, and stacking
    them made pages longer than the original. Returns how many tables were unwrapped.
    """
    unwrapped = 0
    for tbl in list(doc.element.body.iter(qn("w:tbl"))):
        if tbl.getparent() is None or tbl.getparent().tag != qn("w:body"):
            continue  # nested tables stay with their parent
        if tbl.find(".//" + qn("w:tbl")) is not None or _table_has_borders(tbl):
            continue
        rows = tbl.findall(qn("w:tr"))
        cells = [cell for row in rows for cell in row.findall(qn("w:tc"))]
        if not rows or not cells:
            continue
        columns = max(len(row.findall(qn("w:tc"))) for row in rows)
        # Only a single-cell frame is unwrapped. Cells side by side (an abstract beside its author
        # sidebar, a term beside its definition) stay a table: stacked, they made the page longer
        # than the PDF and spilled it onto the next.
        if len(cells) > 1:
            continue
        parent = tbl.getparent()
        position = parent.index(tbl)
        for cell in cells:
            for child in list(cell):
                if child.tag in (qn("w:p"), qn("w:tbl")):
                    parent.insert(position, child)
                    position += 1
        parent.remove(tbl)
        unwrapped += 1
    return unwrapped


def _unnest_hyperlinks(doc: docx.Document) -> int:
    """Lift <w:hyperlink> elements pdf2docx nests inside a run up to the paragraph.

    WordprocessingML puts a hyperlink beside runs, never inside one; pdf2docx writes
    ``<w:r><w:hyperlink>…</w:hyperlink></w:r>``, which the emitter reads as an empty run,
    so the link and its text (a DOI, a URL) disappeared. Returns how many were moved.
    """
    moved = 0
    for hyperlink in list(doc.element.body.iter(qn("w:hyperlink"))):
        run = hyperlink.getparent()
        if run is None or run.tag != qn("w:r"):
            continue
        paragraph = run.getparent()
        if paragraph is None:
            continue
        run.remove(hyperlink)
        paragraph.insert(paragraph.index(run) + 1, hyperlink)
        if not any(child.tag != qn("w:rPr") for child in run):
            paragraph.remove(run)
        moved += 1
    return moved


def _open_pdf(pdf_bytes: bytes) -> Any:
    """Open the PDF with PyMuPDF (None when it cannot be read)."""
    try:
        import pymupdf
    except ImportError:  # pragma: no cover - PyMuPDF ships with pdf2docx
        import fitz as pymupdf
    try:
        return pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        return None


def _mark_superscripts_from_pdf(doc: docx.Document, pdf_bytes: bytes, page_break_after: Set[Any]) -> int:
    """Raise the runs the PDF drew as superscripts (affiliation and footnote markers).

    pdf2docx keeps a raised "3" as a small plain run, so "Micabalo3" read as one word.
    PyMuPDF flags superscript spans; a run on the same page whose text is one of
    them, and smaller than its paragraph's text, gets Word's superscript. Returns
    how many runs were raised.
    """
    pdf = _open_pdf(pdf_bytes)
    if pdf is None:
        return 0
    try:
        raised_per_page: List[Set[str]] = []
        for page in pdf:
            raised: Set[str] = set()
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = span.get("text", "").strip()
                        if text and len(text) <= 4 and (span.get("flags", 0) & 1):
                            raised.add(text)
            raised_per_page.append(raised)
    finally:
        pdf.close()

    changed, page_index = 0, 0
    for element in doc.element.body:
        if element.tag == qn("w:p") and page_index < len(raised_per_page) and raised_per_page[page_index]:
            runs = element.findall(qn("w:r"))
            sizes = []
            for run in runs:
                sz = run.find(qn("w:rPr") + "/" + qn("w:sz"))
                if sz is not None and sz.get(qn("w:val")):
                    sizes.append(int(sz.get(qn("w:val"))))
            body_size = max(sizes) if sizes else 0
            for run in runs:
                text = "".join(node.text or "" for node in run.iter(qn("w:t"))).strip()
                if not text or text not in raised_per_page[page_index]:
                    continue
                sz = run.find(qn("w:rPr") + "/" + qn("w:sz"))
                size = int(sz.get(qn("w:val"))) if sz is not None and sz.get(qn("w:val")) else 0
                if body_size and size and size >= body_size:
                    continue
                r_pr = run.find(qn("w:rPr"))
                if r_pr is None:
                    r_pr = run.makeelement(qn("w:rPr"), {})
                    run.insert(0, r_pr)
                if r_pr.find(qn("w:vertAlign")) is None:
                    vert = r_pr.makeelement(qn("w:vertAlign"), {qn("w:val"): "superscript"})
                    r_pr.append(vert)
                    changed += 1
        if element in page_break_after:
            page_index += 1
    return changed


# A body counts as two columns when this share of its pages set their text in two side-by-side bands.
_PDF_TWO_COLUMN_PAGE_SHARE = 0.6


def _pdf_two_column_body(pdf_bytes: bytes) -> bool:
    """True when most pages of the PDF set their text in two columns (IEEE and journal papers).

    pdf2docx marks every multi-column page as columns (a memo's date line too), so the
    DOCX signal is ignored for PDFs; the page geometry is read instead. A page is two
    columns when several text blocks sit wholly left of the page's middle and several
    wholly right of it, each narrower than two thirds of the text width.
    """
    pdf = _open_pdf(pdf_bytes)
    if pdf is None:
        return False
    try:
        pages = len(pdf)
        if pages == 0:
            return False
        two_column_pages = 0
        for page in pdf:
            width = page.rect.width
            middle = width / 2
            blocks = [b for b in page.get_text("blocks") if b[6] == 0 and (b[3] - b[1]) >= 20 and str(b[4]).strip()]
            narrow = [b for b in blocks if (b[2] - b[0]) < width * 0.6]
            left = sum(1 for b in narrow if b[2] <= middle + 6)
            right = sum(1 for b in narrow if b[0] >= middle - 6)
            # The last page of a paper often holds one short block in its right column.
            if left >= 1 and right >= 1 and left + right >= max(3, len(blocks) // 2):
                two_column_pages += 1
        return two_column_pages >= max(1, int(pages * _PDF_TWO_COLUMN_PAGE_SHARE + 0.999))
    except Exception:
        return False
    finally:
        pdf.close()
