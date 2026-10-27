import base64
import hashlib
import io
import json
import math
import os
import re
import tempfile
from html import escape as _html_escape
from typing import Any, Dict, List, Optional, Set, Tuple
import docx
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.text.run import Run

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


# Free fonts with the same character widths as the Word fonts; the editor bundles them.
_METRIC_TWINS = {
    "times new roman": "Tinos", "times": "Tinos",
    "arial": "Arimo", "helvetica": "Arimo",
    "calibri": "Carlito", "cambria": "Caladea",
    "courier new": "Cousine", "courier": "Cousine",
    # Not an exact twin (TeX Gyre Bonum follows ITC Bookman), but the closest free font.
    "bookman old style": "'TeX Gyre Bonum'", "bookman": "'TeX Gyre Bonum'",
}


def _generic_family(name: str) -> str:
    """What follows a font in its CSS stack: its metric twin (when one is bundled), then the generic family."""
    lowered = name.lower()
    if "mono" in lowered or "courier" in lowered or "consolas" in lowered:
        generic = "monospace"
    else:
        generic = "sans-serif" if any(sans in lowered for sans in _SANS_FAMILIES) else "serif"
    twin = _METRIC_TWINS.get(lowered)
    return f"{twin}, {generic}" if twin else generic


def _inherited_run_flag(run: Run, attribute: str) -> bool:
    """Bold/italic a run gets from its own, its character style's or its paragraph style's settings."""
    direct = getattr(run, attribute)
    if direct is not None:
        return bool(direct)
    styles: List[Any] = []
    try:
        styles.append(run.style)
    except Exception:
        pass
    parent = run._parent
    if isinstance(parent, Paragraph):
        try:
            styles.append(parent.style)
        except Exception:
            pass
    for style in styles:
        seen: Set[str] = set()
        while style is not None and style.style_id not in seen:
            seen.add(style.style_id)
            value = getattr(style.font, attribute, None) if style.font is not None else None
            if value is not None:
                return bool(value)
            style = style.base_style
    return False


def _run_to_html(run: Run) -> str:
    """Convert a single text run into styled HTML with font size, color, family, and styles."""
    text = run.text
    if not text:
        return ""

    escaped = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
    # A tab is an inline node whose width the editor computes from the
    # paragraph's tab stops; runs of spaces keep their width as real NBSPs
    # (HTML would collapse them), written as characters so sanitizing the
    # "&nbsp;" entity form leaves them alone.
    escaped = escaped.replace("\t", "<span data-tab></span>")
    escaped = re.sub(r" {2,}", lambda m: " " + "\u00a0" * (len(m.group(0)) - 1), escaped)
    # An underlined run of only spaces is a fill-in blank: it keeps its whole width, even beside another space.
    if run.underline and not text.strip(" "):
        escaped = "\u00a0" * len(text)

    styles: List[str] = []

    if run.font.size:
        pt_val = round(run.font.size.pt, 1)
        styles.append(f"font-size:{pt_val}pt")

    hex_color = _color_to_hex(run.font.color)
    if hex_color:
        styles.append(f"color:{hex_color}")

    # Character spacing (w:spacing, twentieths of a point): condensed text wraps later.
    spacing = run._element.rPr.find(qn("w:spacing")) if run._element.rPr is not None else None
    if spacing is not None and spacing.get(qn("w:val")) not in (None, "0"):
        styles.append(f"letter-spacing:{round(float(spacing.get(qn('w:val'))) / 20, 2):g}pt")

    # A run with no font of its own uses its paragraph's style chain, then the
    # document defaults; without this an Arial document imports as serif.
    font_name = run.font.name or _rfonts_name(run._element.rPr.find(qn("w:rFonts")) if run._element.rPr is not None else None, run.part)
    if not font_name and isinstance(run._parent, Paragraph):
        font_name = _inherited_font_name(run._parent)
    if font_name:
        family = _clean_font_name(font_name)
        styles.append(f"font-family:'{family}', {_generic_family(family)}")

    res = escaped
    if styles:
        css_str = "; ".join(styles)
        res = f'<span style="{css_str}">{res}</span>'

    if _inherited_run_flag(run, "bold"):
        res = f"<strong>{res}</strong>"
    if _inherited_run_flag(run, "italic"):
        res = f"<em>{res}</em>"
    if run.underline:
        res = f"<u>{res}</u>"
    if run.font.strike:
        res = f"<s>{res}</s>"
    if run.font.subscript:
        res = f"<sub>{res}</sub>"
    if run.font.superscript:
        res = f"<sup>{res}</sup>"

    hl = _highlight_css(run)
    if hl:
        res = f'<mark style="background-color:{hl}">{res}</mark>'

    return res


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
    blocks = [m.start() for m in _BLOCK_START.finditer(html)]

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
        # Block n of the original is block n of the cleaned string (markers sit inside blocks, never add or drop one).
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


def _run_or_image_html(run: Run, doc_parts: Dict[str, bytes]) -> str:
    """Render a run as either its inline image (if it contains a drawing) or styled text."""
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
            grouped: Set[Any] = set()
            for group in element.iter(f"{{{_NS_WPG}}}wgp"):
                if next(group.iterancestors(f"{{{_NS_WPG}}}wgp"), None) is not None:
                    continue  # a nested group is flattened with its outer group
                flat = _group_image_html(group, doc_parts)
                if flat:
                    pieces.append(_as_page_art(flat, group))
                    grouped.update(group.iter(qn("a:blip")))
            pieces.extend(_as_page_art(_image_html(b, doc_parts), b) for b in blips if b not in grouped)
            return line_marks + "".join(pieces)
        if line_marks:
            return line_marks
    except Exception:
        pass
    return _run_to_html(run)


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
    parts = [
        f"border-bottom:{pt:g}pt solid {color}",
        "font-size:1pt",
        "line-height:1pt",
        f"padding-top:{round(line_pt * 0.78 - pt, 1):g}pt",
        f"margin-bottom:{round(line_pt * 0.22, 1):g}pt",
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


def _paragraph_inner_html(p: Paragraph, doc_parts: Dict[str, bytes]) -> str:
    """Build the inner HTML (runs + hyperlinks + page breaks + images) of a paragraph."""
    parts: List[str] = []
    wrapper_tags = {qn(tag) for tag in _INLINE_WRAPPER_TAGS}

    def walk(container: Any) -> None:
        for child in container:
            tag = child.tag
            if tag == qn("w:r"):
                run = Run(child, p)
                brs = child.findall(qn("w:br"))
                page_breaks = ""
                for br in brs:
                    if br.get(qn("w:type")) == "page":
                        page_breaks += _PAGE_BREAK_HTML
                    elif br.get(qn("w:type")) == "column":
                        parts.append(_COLUMN_MARK)
                    else:
                        parts.append("<br/>")
                parts.append(page_breaks + _run_or_image_html(run, doc_parts) + _anchored_textboxes(child, p, doc_parts))
            elif tag == qn("w:hyperlink"):
                parts.append(_hyperlink_html(child, p, doc_parts))
            elif tag == qn("w:br"):
                if child.get(qn("w:type")) == "page":
                    parts.append(_PAGE_BREAK_HTML)
                elif child.get(qn("w:type")) == "column":
                    parts.append(_COLUMN_MARK)
                else:
                    parts.append("<br/>")
            elif tag == qn("w:sdt"):
                content = child.find(qn("w:sdtContent"))
                if content is not None:
                    walk(content)
            elif tag in wrapper_tags:
                walk(child)

    walk(p._element)
    return "".join(parts)


def _hyperlink_html(hyperlink_el: Any, p: Paragraph, doc_parts: Dict[str, bytes]) -> str:
    """Render a <w:hyperlink> element as an <a> tag with its styled run text."""
    try:
        r_id = hyperlink_el.get(qn("r:id"))
        url = "#"
        if r_id:
            try:
                url = p.part.rels[r_id].target_ref
            except Exception:
                url = "#"
        runs_html = "".join(
            _run_or_image_html(Run(r, p), doc_parts)
            for r in hyperlink_el.findall(qn("w:r"))
        )
        if not runs_html:
            return ""
        target = ' target="_blank" rel="noopener noreferrer"' if url.startswith("http") else ""
        return f'<a href="{url}"{target}>{runs_html}</a>'
    except Exception:
        return ""


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


def _paragraph_tab_stops(p: Paragraph) -> List[List[Any]]:
    """Custom tab stops in effect for a paragraph: [[align, position_px, leader], ...] sorted by position.

    Stops accumulate from the style chain (base first) and then the paragraph;
    a ``clear`` stop removes the inherited one at that position.
    """
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


def _paragraph_indent_css(p: Paragraph) -> str:
    """Return CSS for paragraph left indent / first-line indent (twips -> px).

    Indents resolve through the style chain like spacing does. A paragraph with
    no first-line indent gets an explicit ``text-indent:0``: inline style beats
    any preset stylesheet, so an applied template's 0.5in first-line indent can
    never be forced onto a title page or signature block that Word left flush.
    """
    styles: List[str] = []
    left = _resolve_pPr_attr(p, "ind", "left") or _resolve_pPr_attr(p, "ind", "start")
    if left and left != "0":
        styles.append(f"margin-left:{round(int(left) * TWIPS_PER_PX, 1)}px")

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

    if first_line and first_line != "0":
        styles.append(f"text-indent:{round(int(first_line) * TWIPS_PER_PX, 1)}px")
    elif hanging and hanging != "0":
        styles.append(f"text-indent:{round(-int(hanging) * TWIPS_PER_PX, 1)}px")
    else:
        styles.append("text-indent:0")
    right = _resolve_pPr_attr(p, "ind", "right") or _resolve_pPr_attr(p, "ind", "end")
    if right and right != "0":
        styles.append(f"margin-right:{round(int(right) * TWIPS_PER_PX, 1)}px")
    return "; ".join(styles)


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
}
_DEFAULT_LINE_FACTOR = 1.15
_THEME_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


def _theme_fonts(part: Any) -> Dict[str, str]:
    """Return {'major': name, 'minor': name} Latin theme fonts of the document (cached on the part)."""
    cached = getattr(part, "_intellidocs_theme_fonts", None)
    if cached is not None:
        return cached
    fonts: Dict[str, str] = {}
    try:
        from lxml import etree

        for rel in part.package.iter_parts():
            if str(rel.partname).startswith("/word/theme/"):
                root = etree.fromstring(rel.blob)
                for kind in ("major", "minor"):
                    latin = root.find(f".//{_THEME_NS}{kind}Font/{_THEME_NS}latin")
                    if latin is not None and latin.get("typeface"):
                        fonts[kind] = latin.get("typeface")
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
        themed = _theme_fonts(part).get(kind)
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
        if run.text.strip() and run.font.name:
            return run.font.name
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


def _paragraph_font_css(p: Paragraph) -> str:
    """Explicit base font size, so an applied preset's size cannot change imported text."""
    size = _resolve_font_size_pt(p)
    if size is None:
        return ""
    return f"font-size:{int(size) if size == int(size) else size}pt"


def _paragraph_spacing_css(p: Paragraph) -> str:
    """Return CSS for the paragraph's effective spacing (twips -> px, line -> unitless).

    Values are resolved exactly the way Word renders them: direct w:spacing on
    the paragraph, then its style chain, then docDefaults. Nothing is invented —
    a paragraph whose spacing is defined nowhere yields an empty string — but
    spacing inherited from styles IS emitted, because the editor cannot see the
    DOCX style chain and would otherwise fall back to its own line spacing
    (rendering single-spaced documents far too loose).
    """
    before = _resolve_spacing_attr(p, "before")
    before_lines = _resolve_spacing_attr(p, "beforeLines")
    after = _resolve_spacing_attr(p, "after")
    after_lines = _resolve_spacing_attr(p, "afterLines")
    line = _resolve_spacing_attr(p, "line")
    rule = _resolve_spacing_attr(p, "lineRule") or "auto"

    if before is None and before_lines is None and after is None and after_lines is None and line is None:
        return ""

    styles: List[str] = []

    if before is not None:
        px = round(int(before) * TWIPS_PER_PX, 1)
        styles.append(f"margin-top:{px}px" if px else "margin-top:0")
    elif before_lines and before_lines != "0" and before_lines.isdigit():
        # w:beforeLines counts hundredths of a line (100 = one line).
        styles.append(f"margin-top:{round(int(before_lines) * 0.012, 2)}em")

    if after is not None:
        px = round(int(after) * TWIPS_PER_PX, 1)
        styles.append(f"margin-bottom:{px}px" if px else "margin-bottom:0")
    elif after_lines and after_lines != "0" and after_lines.isdigit():
        styles.append(f"margin-bottom:{round(int(after_lines) * 0.012, 2)}em")

    if line and line != "0":
        if rule == "exact" or rule == "atLeast":
            # Exact/atLeast spacing is stored in twips (1/20 pt): 240 = 12pt.
            styles.append(f"line-height:{round(int(line) / 20.0, 2)}pt")
        else:
            # Auto spacing is in 240ths of a line: 240 = single, 360 = 1.5x.
            # Word's "single" is the font's natural line height (~1.15em for
            # Times New Roman), CSS's is 1em, so scale by that factor.
            factor = _FONT_LINE_FACTORS.get((_resolve_font_name(p) or "").lower(), _DEFAULT_LINE_FACTOR)
            styles.append(f"line-height:{round(int(line) / 240.0 * factor, 3)}")

    return "; ".join(styles)


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
            levels[lvl.get(qn("w:ilvl"), "0")] = {
                "text": text.get(qn("w:val")) if text is not None else "%1.",
                "suff": suff.get(qn("w:val")) if suff is not None else "tab",
                "left": int(left) if left else 0,
                "first": int(first) if first else (-int(hanging) if hanging else 0),
            }
        abstract_levels[abstract.get(qn("w:abstractNumId"), "")] = levels
    table: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for num in root.findall(qn("w:num")):
        abstract_id = num.find(qn("w:abstractNumId"))
        for ilvl, value in abstract_levels.get(abstract_id.get(qn("w:val")) if abstract_id is not None else "", {}).items():
            table[(num.get(qn("w:numId"), ""), ilvl)] = value
    _GEOMETRY_CACHE[id(root)] = table
    return table


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
    marker_end = marker_x + (len(pre) + len(post) + 1) * 0.5 * size_pt * 96 / 72
    stops = [pos for kind, pos, _leader in _paragraph_tab_stops(p) if kind in ("left", "num")]
    if first < 0:
        stops.append(wrap_x)
    ahead = sorted(pos for pos in stops if pos > marker_end)
    if ahead:
        text_x = ahead[0]
    else:
        step = _default_tab_px(p) or 48.0
        text_x = (math.floor(marker_end / step) + 1) * step
    return {"marker_x": round(marker_x, 1), "wrap_x": round(wrap_x, 1), "text_x": round(text_x, 1), "pre": pre, "post": post}


def _paragraph_list_info(
    p: Paragraph,
    num_to_abstract: Dict[str, str],
    abstract_levels: Dict[str, Dict[str, Tuple[str, float]]],
) -> Optional[Dict[str, Any]]:
    """Return list kind + level for a numbered/bulleted paragraph, or None."""
    pPr = p._element.pPr
    if pPr is None:
        return None
    num_pr = pPr.find(qn("w:numPr"))
    if num_pr is None:
        return None
    num_id_el = num_pr.find(qn("w:numId"))
    if num_id_el is None:
        return None
    num_id = num_id_el.get(qn("w:val"))
    if not num_id or num_id == "0":
        return None

    ilvl_el = num_pr.find(qn("w:ilvl"))
    ilvl = int(ilvl_el.get(qn("w:val")) or "0") if ilvl_el is not None else 0

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
    inner = _paragraph_inner_html(p, doc_parts)

    if list_info is not None:
        inner = inner.replace(_LINE_MARK, "")
        # The item keeps its paragraph's spacing, size and alignment.
        if inner.strip():
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
            css = "; ".join(part.rstrip("; ") for part in css_parts if part)
            return f'<p style="{css};">{inner}</p>' if css else f"<p>{inner}</p>"
        return inner
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
    style_name = p.style.name.lower() if p.style else ""

    if not inner.strip():
        # Blank line: render it exactly as tall as Word does — the same
        # resolved line height (and before/after spacing) as its style chain,
        # so runs of blank paragraphs neither collapse nor balloon. No <br/>:
        # the editor's strict HTML parsing turns a lone <br> into a hard-break
        # node that renders TWO line boxes (double-height blank lines).
        empty_style = "; ".join(filter(None, [_paragraph_font_css(p), _paragraph_spacing_css(p)]))
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

    alignment = _get_paragraph_alignment(p)
    align_style = f"text-align:{alignment};" if alignment != "left" else ""
    spacing_style = _paragraph_spacing_css(p)
    indent_style = _paragraph_indent_css(p)

    if "title" in style_name and "sub" not in style_name:
        css = _heading_css(p, align_style, indent_style, 20, "margin:0.75em 0 0.35em")
        return f'<h1 class="title" style="{css}">{inner}</h1>'
    if "subtitle" in style_name:
        css = _heading_css(p, align_style, indent_style, 14, "margin:0.35em 0 0.5em", weight="600", italic=True)
        return f'<h2 class="subtitle" style="{css}">{inner}</h2>'
    for level, size, margin in _HEADING_DEFAULTS:
        if f"heading {level}" in style_name:
            return f'<h{level} style="{_heading_css(p, align_style, indent_style, size, margin)}">{inner}</h{level}>'
    if "heading" in style_name:
        return f'<h4 style="{_heading_css(p, align_style, indent_style, 11.5, "margin:0.5em 0 0.25em")}">{inner}</h4>'

    css_parts = filter(None, [align_style, _paragraph_font_css(p), spacing_style, indent_style])
    css_combined = "; ".join(part.rstrip("; ") for part in css_parts).strip()
    style_attr = f' style="{css_combined};"' if css_combined else ""
    return f"<p{style_attr}{_tab_attributes(p, inner)}>{inner}</p>"


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


def _heading_css(
    p: Paragraph,
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
    size = _paragraph_font_css(p) or f"font-size:{default_size_pt:g}pt"
    spacing = _paragraph_spacing_css(p) or default_margin
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
    inner = _paragraph_inner_html(p, doc_parts)
    if not inner.strip():
        return ""
    marker = _cell_marker(p, counters if counters is not None else {})
    if marker:
        inner = f"{marker}<span data-tab></span>{inner}"
    alignment = _get_paragraph_alignment(p)
    align_style = f"text-align:{alignment};" if alignment != "left" else ""
    color_style = "color:#ffffff;" if force_white else ""
    indent = _paragraph_indent_css(p)
    pieces = [align_style, color_style, "margin:0", _paragraph_font_css(p), _paragraph_spacing_css(p), indent]
    css = "; ".join(piece.rstrip("; ") for piece in pieces if piece) + ";"
    return f'<p style="{css}"{_tab_attributes(p, inner)}>{inner}</p>'


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
    return margins


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


def _table_to_html(table: Table, doc_parts: Dict[str, bytes], text_width_px: Optional[float] = None) -> str:
    """Convert a Word table to HTML with real colspan/rowspan, per-cell column widths and nested tables.

    Cells are read straight from the XML: python-docx's ``row.cells`` repeats a
    merged cell once per grid column it covers, which duplicated its text.
    """
    tbl = table._element
    rows = _table_rows(tbl)
    col_px = _table_column_px(tbl, rows, text_width_px)
    borders = _table_borders(table)
    pad = _table_cell_margins(table)
    last_row = len(rows) - 1
    list_counters: Dict[Tuple[str, str], int] = {}

    rows_html: List[str] = []
    for i, cells in enumerate(rows):
        cells_html: List[str] = []
        tag = "td"
        last_column = len(cells) - 1

        for column, cell in enumerate(cells):
            if cell["skip"]:
                # Continuation of a vertical merge: an empty cell that hides the
                # shared border, so the merged cell still reads as one block.
                span_attr = f' colspan="{cell["span"]}"' if cell["span"] > 1 else ""
                cells_html.append(
                    f'<{tag} style="{_cell_edge_css(borders, cell["el"], i, last_row, column, last_column)}; border-top:none; {_cell_padding_css(cell["el"], pad)}; vertical-align:top;"{span_attr}>&nbsp;</{tag}>'
                )
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
            for child in _iter_block_elements(tc):
                if child.tag == qn("w:p"):
                    content_parts.append(_cell_paragraph_to_html(Paragraph(child, table), doc_parts, force_white=is_dark, counters=list_counters))
                else:
                    content_parts.append(_table_to_html(Table(child, table), doc_parts, text_width_px))
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

        rows_html.append(f"<tr>{''.join(cells_html)}</tr>")

    table_css = "border-collapse:collapse; width:100%; margin:0; table-layout:fixed;"
    return f'<table style="{table_css}"{_column_size_attribute(rows, col_px)}>{"".join(rows_html)}</table>'


def _body_to_html(
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

    def close_list() -> None:
        nonlocal open_li_depth
        if open_li_depth == len(stack):
            out.append("</li>")
            open_li_depth = None
        out.append(f"</{stack.pop()['kind']}>")
        # The <li> that contained this (nested) list is now complete.
        if len(stack) > 0:
            out.append("</li>")
            open_li_depth = None

    def close_all_lists() -> None:
        while stack:
            close_list()

    def emit_page_break(section: Optional[int] = None) -> None:
        """Start a new page unless the output already ends with a page break.

        A page that opens a new Word section carries the section's number, so the
        editor can give it that section's header, footer and page numbering.
        """
        close_all_lists()
        # Blank lines at the end of a page only pad it; left in, they spill onto a
        # blank page when the text above runs a line long. A page that is blank on
        # purpose (break, blank lines, break) keeps its lines.
        trailing = 0
        while trailing < len(out) and out[-1 - trailing].startswith('<p class="empty-spacer"'):
            trailing += 1
        if trailing and trailing < len(out) and out[-1 - trailing] != _PAGE_BREAK_HTML:
            del out[len(out) - trailing:]
        marked = _PAGE_BREAK_HTML if section is None else _PAGE_BREAK_HTML.replace(" />", f' data-section="{section}" />')
        if out and out[-1] == _PAGE_BREAK_HTML and section is not None:
            out[-1] = marked
        elif not out or out[-1] not in (_PAGE_BREAK_HTML, marked):
            out.append(marked)

    def emit_textboxes(element: Any) -> None:
        """Text-box paragraphs anchored to a paragraph, as ordinary paragraphs after it."""
        for box_p in _textbox_paragraphs(element):
            html = _paragraph_to_html(Paragraph(box_p, doc), doc_parts)
            if html and not html.startswith('<p class="empty-spacer"'):
                close_all_lists()
                out.append(html)

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
            if _paragraph_page_break_before(p):
                emit_page_break()
            info = _paragraph_list_info(p, num_to_abstract, abstract_levels)
            if info is None:
                close_all_lists()
                html = _paragraph_to_html(p, doc_parts)
                if pending_page_break and html.startswith('<p class="empty-spacer"'):
                    continue
                if html:
                    out.append(html)
                emit_textboxes(element)
                continue

            kind = info["kind"]
            # The item carries its text size: the marker is drawn in the item's font, not its paragraph's.
            size_css = _paragraph_font_css(p)
            item_html = _paragraph_to_html(p, doc_parts, list_info=info)
            item_open = f'<li style="{size_css}">' if size_css else "<li>"
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
                item_open = f'<li{attrs} style="{style}">' if style else f"<li{attrs}>"
            # Lists open one nesting level at a time and remember the Word level they hold: a lettered
            # sublist whose first item has no numbered parent starts at the top (no stray empty "1."),
            # and its later items stay siblings instead of nesting deeper.
            while stack and stack[-1].get("level", -1) > info["level"]:
                close_list()
            target_depth = len(stack) if stack and stack[-1].get("level") == info["level"] else len(stack) + 1
            count_key = (info["num_id"], info["level"])
            item_counts[count_key] = item_counts.get(count_key, 0) + 1
            # A new item at this level restarts the deeper levels of the same list.
            for deeper in [k for k in item_counts if k[0] == info["num_id"] and k[1] > info["level"]]:
                del item_counts[deeper]
            ordinal = item_counts[count_key]

            # Same depth but different kind -> close and reopen as the new kind.
            if stack and len(stack) == target_depth and stack[-1]["kind"] != kind:
                close_list()
            # Another numbered list (a restart) at the same depth is a new <ol>.
            if stack and len(stack) == target_depth and stack[-1].get("num_id") not in (None, info["num_id"]):
                close_list()
                ordinal = 1

            if len(stack) == target_depth and stack:
                # Continuing an existing list at this depth -> new sibling item.
                if open_li_depth == target_depth:
                    out.append("</li>")
                out.append(item_open)
                open_li_depth = target_depth
            else:
                # Open nested list(s) (inside the current open <li>) or a fresh list.
                while len(stack) < target_depth:
                    opens_this_item = len(stack) + 1 == target_depth
                    stack.append({"kind": kind, "num_id": info["num_id"] if opens_this_item else None, "level": info["level"]})
                    start_attr = f' start="{ordinal}"' if kind == "ol" and opens_this_item and ordinal > 1 else ""
                    type_attr = ""
                    if kind == "ol" and opens_this_item:
                        list_type = _LIST_TYPES.get(info.get("fmt", ""))
                        type_attr = f' type="{list_type}"' if list_type else ""
                    out.append(f"<{kind}{start_attr}{type_attr}>")
                out.append(item_open)
                open_li_depth = target_depth

            out.append(item_html)
            emit_textboxes(element)

        elif element.tag == qn("w:tbl"):
            close_all_lists()
            out.append(_table_to_html(Table(element, doc), doc_parts, text_width))

    close_all_lists()
    section_starts[section_no + 1] = len(out)
    _wrap_columns(doc, out, section_starts)
    _shift_sections(doc, out, section_starts)
    return _trim_page_ends("\n".join(out).replace(_COLUMN_MARK, ""))


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


def _wrap_columns(doc: docx.Document, out: List[str], starts: Dict[int, int]) -> None:
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
        for item in segment:
            if _COLUMN_MARK in item:
                columns.append([])
                item = item.replace(_COLUMN_MARK, "")
            columns[-1].append(item)
        body = "".join('<div class="intellidocs-column">' + "\n".join(column) + "</div>" for column in columns if column)
        out[begin:end] = [f'<div class="intellidocs-columns" data-widths="{",".join(f"{w:g}" for w in widths)}">{body}</div>']
        # Later sections' offsets move with the replaced range.
        shift = len(segment) - 1
        for later in starts:
            if later > index:
                starts[later] -= shift


def _shift_sections(doc: docx.Document, out: List[str], starts: Dict[int, int]) -> None:
    """Give every section its own margins inside the document-wide page setup.

    The editor has one page setup (the one most sections share), so a section with
    different margins would reflow: its lines wrap at the wrong width and the page
    breaks drift from Word's. Each section's blocks are moved by the difference
    instead: left/right by their margin, and the first block of a section that
    starts a new page up/down by the top margin.
    """
    try:
        sections = list(doc.sections)
        setup = _extract_page_setup(doc)["margins"]
    except Exception:
        return
    if len(sections) < 2:
        return

    def shifted(style: str, prop: str, delta: float) -> str:
        found = re.search(rf"(?<![\w-]){prop}:\s*(-?[\d.]+)px", style)
        if found:
            return style.replace(found.group(0), f"{prop}:{round(float(found.group(1)) + delta, 1):g}px", 1)
        return f"{prop}:{round(delta, 1):g}px; {style}"

    # pdf2docx sets each page's margins from where its text happens to sit, so only the first
    # page (the reference) is shifted for a PDF; every section is shifted for a real DOCX.
    shifted_sections = sections[:1] if getattr(doc.part, "_is_pdf_import", False) else sections
    for number, section in enumerate(shifted_sections):
        begin, end = starts.get(number), starts.get(number + 1)
        if begin is None or end is None:
            continue
        try:
            deltas = {
                "left": section.left_margin / EMU_PER_PX - setup["left"] * 96,
                "right": section.right_margin / EMU_PER_PX - setup["right"] * 96,
                "top": section.top_margin / EMU_PER_PX - setup["top"] * 96,
            }
        except Exception:
            continue
        section_type = section._sectPr.find(qn("w:type"))
        starts_page = number == 0 or section_type is None or section_type.get(qn("w:val")) != "continuous"
        if not starts_page:
            deltas["top"] = 0.0
        if all(abs(value) < 4 for value in deltas.values()):
            continue

        first_block = True
        for index in range(begin, min(end, len(out))):
            html = out[index]
            match = re.match(r'<(p|h[1-6])\b([^>]*)>', html)
            if not match or html.startswith("<p class=\"empty-spacer\""):
                continue
            attrs = match.group(2)
            style_match = re.search(r'style="([^"]*)"', attrs)
            style = style_match.group(1) if style_match else ""
            for prop, delta in (("margin-left", deltas["left"]), ("margin-right", deltas["right"])):
                if abs(delta) >= 4:
                    style = shifted(style, prop, delta)
            if first_block and abs(deltas["top"]) >= 4:
                style = shifted(style, "margin-top", deltas["top"])
            first_block = False
            new_attrs = attrs.replace(style_match.group(0), f'style="{style}"') if style_match else f' style="{style}"{attrs}'
            out[index] = f"<{match.group(1)}{new_attrs}>" + html[match.end():]


def _trim_page_ends(html: str) -> str:
    """Drop the blank lines that only pad the end of a page before a page break.

    Left in, they spill onto a blank page whenever the text above runs a line
    long. A page that is blank on purpose (break, blank lines, break) is kept.
    """
    kept: List[str] = []
    for line in html.split("\n"):
        if line.startswith('<hr class="page-break"'):
            trailing = 0
            while trailing < len(kept) and kept[-1 - trailing].startswith('<p class="empty-spacer"'):
                trailing += 1
            # Only a page that has other content loses its padding lines.
            if trailing and trailing < len(kept) and not kept[-1 - trailing].startswith('<hr class="page-break"'):
                del kept[len(kept) - trailing:]
        kept.append(line)
    html = "\n".join(kept)
    return re.sub(r'(?:<br\s*/?>\s*(?:<span[^>]*>\s*</span>)?)+(?=</p>\s*<hr class="page-break")', "", html)


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
            "bottom": round(section.bottom_margin / EMU_PER_INCH, 2),
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
    html = _body_to_html(doc, doc_parts, page_break_after)
    html, body_art = _extract_page_art(html)
    header, footer, header_number_format, footer_number_format = _extract_header_footer(doc)
    page_setup = _extract_page_setup(doc)

    return {
        "html": html,
        "page_art": _group_page_art(body_art),
        "hf": _extract_sections(doc),
        "page_setup": page_setup,
        "header": header,
        "footer": footer,
        "header_number_format": header_number_format,
        "footer_number_format": footer_number_format,
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

    # Lines of every PDF page: normalized text -> (x0, x1), with the page width.
    pages: List[Tuple[float, Dict[str, Tuple[float, float]]]] = []
    for page in pdf:
        lines: Dict[str, Tuple[float, float]] = {}
        for block in page.get_text("dict").get("blocks", []):
            for line in block.get("lines", []):
                text = normal("".join(span.get("text", "") for span in line.get("spans", [])))
                if text:
                    lines.setdefault(text, (line["bbox"][0], line["bbox"][2]))
        pages.append((page.rect.width, lines))
    pdf.close()

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
        if element in page_break_after:
            page_index += 1
    return changed


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
    sides: Dict[Any, str] = {}
    for page in pages:
        keyed = [(el, _furniture_key(el, doc)) for el in page]
        keyed = [(el, key) for el, key in keyed if key]
        head, tail = keyed[:_FURNITURE_EDGE_ELEMENTS], keyed[-_FURNITURE_EDGE_ELEMENTS:]
        for el, _ in head:
            sides[el] = "header"
        for el, _ in tail:
            sides.setdefault(el, "footer")
        edges.append(head + [item for item in tail if item not in head])

    page_counts: Dict[str, int] = {}
    for edge in edges:
        for key in {key for _, key in edge}:
            page_counts[key] = page_counts.get(key, 0) + 1

    min_pages = max(3, int(len(pages) * _FURNITURE_MIN_PAGE_SHARE + 0.999))
    furniture = {key for key, count in page_counts.items() if count >= min_pages}

    removed = 0
    for page_index, edge in enumerate(edges):
        for element, key in edge:
            if key not in furniture or element.getparent() is None:
                continue
            if report is not None:
                jc = element.find(qn("w:pPr") + "/" + qn("w:jc"))
                report.setdefault("items", []).append({
                    "page": page_index,
                    "side": sides.get(element, "footer"),
                    "key": key,
                    "text": "".join(node.text or "" for node in element.iter(qn("w:t"))).strip(),
                    "jc": jc.get(qn("w:val")) if jc is not None else None,
                    "has_image": element.find(".//" + qn("a:blip")) is not None,
                })
            if element in page_break_after:
                for child in list(element):
                    if not child.tag.endswith("}pPr"):
                        element.remove(child)
            else:
                element.getparent().remove(element)
            removed += 1
    return removed


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
    if not items or not breaks or any(value == "" for value in breaks) or len(breaks) + 1 != page_count:
        return
    by_index = {section["index"]: section for section in all_sections}
    sections = [by_index.get(index) for index in [0] + [int(value) for value in breaks]]
    if any(section is None for section in sections):
        return
    parts: Dict[str, Dict[str, str]] = result["hf"]["parts"]
    lines: Dict[str, List[Dict[str, Any]]] = {"header": [], "footer": []}
    seen: Set[Tuple[str, str]] = set()
    for item in items:
        if item["has_image"] or not item["text"]:
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
            html += f'<p style="margin:0;text-align:{_furniture_alignment(item)};font-size:11pt">{body}</p>'
        parts[f"pdf_{side}"] = {"flow": html, "art": ""}
        pages_with = {item["page"] for item in items if item["side"] == side}
        for page_index, section in enumerate(sections):
            section[side] = f"pdf_{side}" if page_index in pages_with else None

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


def _snap_right_tabs(doc: docx.Document) -> None:
    """Make a left tab stop that sits at the right margin a right-aligned one.

    pdf2docx records where a page number STARTS (a left stop just inside the right
    margin), so the number overflows the line and wraps in a table of contents.
    The PDF drew it flush right.
    """
    try:
        section = doc.sections[0]
        width_twips = (section.page_width - section.left_margin - section.right_margin) / 635.0
    except Exception:
        return
    if width_twips <= 0:
        return
    for tab in doc.element.body.iter(qn("w:tab")):
        if tab.getparent() is None or tab.getparent().tag != qn("w:tabs"):
            continue
        position = tab.get(qn("w:pos"))
        if tab.get(qn("w:val")) != "left" or not position:
            continue
        if 0.88 * width_twips <= float(position) <= 1.05 * width_twips:
            tab.set(qn("w:val"), "right")
            tab.set(qn("w:pos"), str(int(width_twips)))


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
    _strip_running_furniture(doc, page_break_after, furniture)
    _infer_heading_styles(doc, page_break_after)
    _snap_right_tabs(doc)
    _realign_from_pdf(doc, file_bytes, page_break_after)
    doc.part._is_pdf_import = True  # pdf2docx leaves cell padding at zero; see _table_cell_margins
    result = _docx_document_to_result(doc, page_break_after, compress_images=True)
    _furniture_to_layout(result, furniture, page_count)
    # A PDF is laid out page by page: Word's widow/orphan rules would spill lines onto extra pages.
    result["flow_rules"] = False
    return result
