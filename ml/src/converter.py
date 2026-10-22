import base64
import hashlib
import io
import json
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

    styles: List[str] = []

    if run.font.size:
        pt_val = round(run.font.size.pt, 1)
        styles.append(f"font-size:{pt_val}pt")

    hex_color = _color_to_hex(run.font.color)
    if hex_color:
        styles.append(f"color:{hex_color}")

    if run.font.name:
        styles.append(f"font-family:'{run.font.name}', serif")

    res = escaped
    if styles:
        css_str = "; ".join(styles)
        res = f'<span style="{css_str}">{res}</span>'

    if run.bold:
        res = f"<strong>{res}</strong>"
    if run.italic:
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


def _image_html(blip: Any, doc_parts: Dict[str, bytes]) -> str:
    """Render an embedded drawing (blip) as a base64 data-URI <img>, preserving size."""
    embed_id = blip.get(qn("r:embed"))
    if not embed_id or embed_id not in doc_parts:
        return ""

    img_bytes = doc_parts[embed_id]
    b64_src = base64.b64encode(img_bytes).decode("utf-8")

    mime = "image/png"
    if img_bytes.startswith(b"\xff\xd8"):
        mime = "image/jpeg"
    elif img_bytes.startswith(b"GIF"):
        mime = "image/gif"

    width = None
    try:
        pic = blip.getparent().getparent()
        xfrm = pic.find(".//" + qn("a:xfrm")) if pic is not None else None
        ext = xfrm.find(qn("a:ext")) if xfrm is not None else None
        if ext is not None:
            cx = ext.get(qn("cx"))
            if cx:
                width = round(int(cx) / 9525)
    except Exception:
        pass

    if width:
        style = "max-width:100%; height:auto; display:block; border-radius:4px;"
        return f'<img src="data:{mime};base64,{b64_src}" width="{width}" style="{style}" />'
    else:
        style = "max-width:100%; height:auto; display:block; border-radius:4px;"

    return f'<img src="data:{mime};base64,{b64_src}" style="{style}" />'


def _run_or_image_html(run: Run, doc_parts: Dict[str, bytes]) -> str:
    """Render a run as either its inline image (if it contains a drawing) or styled text."""
    try:
        blips = run._element.findall(".//" + qn("a:blip"))
        if blips:
            return "".join(_image_html(b, doc_parts) for b in blips)
    except Exception:
        pass
    return _run_to_html(run)


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
                    else:
                        parts.append("<br/>")
                parts.append(page_breaks + _run_or_image_html(run, doc_parts))
            elif tag == qn("w:hyperlink"):
                parts.append(_hyperlink_html(child, p, doc_parts))
            elif tag == qn("w:br"):
                if child.get(qn("w:type")) == "page":
                    parts.append(_PAGE_BREAK_HTML)
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


def _build_numbering_map(doc: docx.Document) -> Tuple[Dict[str, str], Dict[str, Dict[str, str]]]:
    """Return (numId->abstractNumId, abstractNumId->{ilvl: numFmt}) from numbering.xml."""
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

    abstract_levels: Dict[str, Dict[str, str]] = {}
    for abstract in root.findall(qn("w:abstractNum")):
        abstract_id = abstract.get(qn("w:abstractNumId"))
        if abstract_id is None:
            continue
        levels: Dict[str, str] = {}
        for lvl in abstract.findall(qn("w:lvl")):
            ilvl = lvl.get(qn("w:ilvl"), "0")
            fmt_el = lvl.find(qn("w:numFmt"))
            fmt = fmt_el.get(qn("w:val")) if fmt_el is not None else "bullet"
            levels[ilvl] = fmt
        abstract_levels[abstract_id] = levels

    return num_to_abstract, abstract_levels


def _paragraph_list_info(
    p: Paragraph,
    num_to_abstract: Dict[str, str],
    abstract_levels: Dict[str, Dict[str, str]],
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

    fmt = "bullet"
    abstract_id = num_to_abstract.get(num_id)
    if abstract_id:
        levels = abstract_levels.get(abstract_id, {})
        fmt = levels.get(str(ilvl), levels.get("0", "bullet"))

    kind = "ul" if fmt == "bullet" else "ol"
    return {"kind": kind, "level": ilvl}


def _paragraph_to_html(
    p: Paragraph,
    doc_parts: Dict[str, bytes],
    list_info: Optional[Dict[str, Any]] = None,
) -> str:
    """Convert a paragraph to HTML; list paragraphs return only their inner content."""
    style_name = p.style.name.lower() if p.style else ""
    inner = _paragraph_inner_html(p, doc_parts)

    if list_info is not None:
        return inner

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
        css = " ".join(
            filter(None, [align_style, "font-size:20pt; font-weight:bold; margin:0.75em 0 0.35em;", indent_style])
        )
        return f'<h1 class="title" style="{css}">{inner}</h1>'
    if "subtitle" in style_name:
        css = " ".join(
            filter(None, [align_style, "font-size:14pt; font-weight:600; font-style:italic; margin:0.35em 0 0.5em;", indent_style])
        )
        return f'<h2 class="subtitle" style="{css}">{inner}</h2>'
    if "heading 1" in style_name:
        return f'<h1 style="{align_style} font-size:17pt; font-weight:bold; margin:0.85em 0 0.35em; {indent_style}">{inner}</h1>'
    if "heading 2" in style_name:
        return f'<h2 style="{align_style} font-size:14pt; font-weight:bold; margin:0.75em 0 0.3em; {indent_style}">{inner}</h2>'
    if "heading 3" in style_name:
        return f'<h3 style="{align_style} font-size:12.5pt; font-weight:bold; margin:0.65em 0 0.25em; {indent_style}">{inner}</h3>'
    if "heading 4" in style_name:
        return f'<h4 style="{align_style} font-size:11.5pt; font-weight:bold; margin:0.5em 0 0.25em; {indent_style}">{inner}</h4>'
    if "heading 5" in style_name:
        return f'<h5 style="{align_style} font-size:10.5pt; font-weight:bold; margin:0.5em 0 0.25em; {indent_style}">{inner}</h5>'
    if "heading 6" in style_name:
        return f'<h6 style="{align_style} font-size:9.5pt; font-weight:bold; margin:0.5em 0 0.25em; {indent_style}">{inner}</h6>'
    if "heading" in style_name:
        return f'<h4 style="{align_style} font-size:11.5pt; font-weight:bold; margin:0.5em 0 0.25em; {indent_style}">{inner}</h4>'

    css_parts = filter(None, [align_style, _paragraph_font_css(p), spacing_style, indent_style])
    css_combined = "; ".join(part.rstrip("; ") for part in css_parts).strip()
    style_attr = f' style="{css_combined};"' if css_combined else ""
    return f"<p{style_attr}{_tab_attributes(p, inner)}>{inner}</p>"


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
        if not in_fallback:
            found.extend(child for child in content if child.tag == qn("w:p"))
    return found


def _cell_paragraph_to_html(p: Paragraph, doc_parts: Dict[str, bytes], force_white: bool = False) -> str:
    """Format paragraphs inside table cells compactly without ballooning cell heights."""
    inner = _paragraph_inner_html(p, doc_parts)
    if not inner.strip():
        return ""
    alignment = _get_paragraph_alignment(p)
    align_style = f"text-align:{alignment};" if alignment != "left" else ""
    color_style = "color:#ffffff;" if force_white else ""
    css = " ".join(filter(None, [align_style, color_style, "margin:0; line-height:1.35; text-indent:0;"]))
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

    The editor lays a row out as one grid track per cell of the WIDEST row, so
    the list is only valid when that count equals the number of grid columns;
    otherwise the editor falls back to equal columns.
    """
    widest = max((len(cells) for cells in rows), default=0)
    total = sum(col_px)
    if not col_px or widest != len(col_px) or total <= 0:
        return ""
    percents = [round(w / total * 100, 2) for w in col_px]
    return ' data-column-size="' + ",".join(f"{p:g}" for p in percents) + '"'


def _table_to_html(table: Table, doc_parts: Dict[str, bytes], text_width_px: Optional[float] = None) -> str:
    """Convert a Word table to HTML with real colspan/rowspan, per-cell column widths and nested tables.

    Cells are read straight from the XML: python-docx's ``row.cells`` repeats a
    merged cell once per grid column it covers, which duplicated its text.
    """
    tbl = table._element
    rows = _table_rows(tbl)
    col_px = _table_column_px(tbl, rows, text_width_px)

    rows_html: List[str] = []
    for i, cells in enumerate(rows):
        cells_html: List[str] = []
        tag = "th" if i == 0 else "td"

        for cell in cells:
            if cell["skip"]:
                # Continuation of a vertical merge: an empty cell that hides the
                # shared border, so the merged cell still reads as one block.
                span_attr = f' colspan="{cell["span"]}"' if cell["span"] > 1 else ""
                cells_html.append(
                    f'<{tag} style="border:1px solid var(--border); border-top:none; padding:8px 12px; vertical-align:top;"{span_attr}>&nbsp;</{tag}>'
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

            if not bg_color and i == 0:
                bg_color = "background-color:var(--secondary);"

            content_parts: List[str] = []
            for child in _iter_block_elements(tc):
                if child.tag == qn("w:p"):
                    content_parts.append(_cell_paragraph_to_html(Paragraph(child, table), doc_parts, force_white=is_dark))
                else:
                    content_parts.append(_table_to_html(Table(child, table), doc_parts, text_width_px))
            cell_content = "".join(content_parts)
            if not cell_content.strip():
                cell_content = "&nbsp;"

            style_parts = ["border:1px solid var(--border)", "padding:8px 12px", "vertical-align:top"]
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

        tr_style = "background-color:var(--secondary);" if i == 0 else ""
        tr_attr = f' style="{tr_style}"' if tr_style else ""
        rows_html.append(f"<tr{tr_attr}>{''.join(cells_html)}</tr>")

    table_css = "border-collapse:collapse; width:100%; margin:1.25em 0; border:1px solid var(--border); table-layout:fixed;"
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

    def emit_page_break() -> None:
        """Start a new page unless the output already ends with a page break."""
        close_all_lists()
        if not out or out[-1] != _PAGE_BREAK_HTML:
            out.append(_PAGE_BREAK_HTML)

    def emit_textboxes(element: Any) -> None:
        """Text-box paragraphs anchored to a paragraph, as ordinary paragraphs after it."""
        for box_p in _textbox_paragraphs(element):
            html = _paragraph_to_html(Paragraph(box_p, doc), doc_parts)
            if html and not html.startswith('<p class="empty-spacer"'):
                close_all_lists()
                out.append(html)

    for element in _iter_block_elements(doc.element.body):
        if page_break_after is not None:
            if pending_page_break:
                emit_page_break()
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
            target_depth = info["level"] + 1

            # Close lists deeper than the target depth.
            while len(stack) > target_depth:
                close_list()
            # Same depth but different kind -> close and reopen as the new kind.
            if stack and len(stack) == target_depth and stack[-1]["kind"] != kind:
                close_list()

            if len(stack) == target_depth and stack:
                # Continuing an existing list at this depth -> new sibling item.
                if open_li_depth == target_depth:
                    out.append("</li>")
                out.append("<li>")
                open_li_depth = target_depth
            else:
                # Open nested list(s) (inside the current open <li>) or a fresh list.
                while len(stack) < target_depth:
                    stack.append({"kind": kind})
                    out.append(f"<{kind}>")
                out.append("<li>")
                open_li_depth = target_depth

            out.append(_paragraph_to_html(p, doc_parts, list_info=info))
            emit_textboxes(element)

        elif element.tag == qn("w:tbl"):
            close_all_lists()
            out.append(_table_to_html(Table(element, doc), doc_parts, text_width))

    close_all_lists()
    return "\n".join(out)


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
    """Extract page size, orientation, and margins (inches) from the first section."""
    try:
        section = doc.sections[0] if doc.sections else None
        if section is None:
            return dict(DEFAULT_PAGE_SETUP)
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
    html = _body_to_html(doc, doc_parts, page_break_after)
    header, footer, header_number_format, footer_number_format = _extract_header_footer(doc)
    page_setup = _extract_page_setup(doc)

    return {
        "html": html,
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
_PAGE_NUMBER = re.compile(r"(page\s*)?[-–—\s]*\d+[-–—\s]*(of\s*\d+|/\s*\d+)?")
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


def _strip_running_furniture(doc: docx.Document, page_break_after: Set[Any]) -> int:
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
    for page in pages:
        keyed = [(el, _furniture_key(el, doc)) for el in page]
        keyed = [(el, key) for el, key in keyed if key]
        edges.append(keyed[:_FURNITURE_EDGE_ELEMENTS] + keyed[-_FURNITURE_EDGE_ELEMENTS:])

    page_counts: Dict[str, int] = {}
    for edge in edges:
        for key in {key for _, key in edge}:
            page_counts[key] = page_counts.get(key, 0) + 1

    min_pages = max(3, int(len(pages) * _FURNITURE_MIN_PAGE_SHARE + 0.999))
    furniture = {key for key, count in page_counts.items() if count >= min_pages}

    removed = 0
    for edge in edges:
        for element, key in edge:
            if key not in furniture or element.getparent() is None:
                continue
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


def _infer_heading_styles(doc: docx.Document) -> int:
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

    candidates: List[Tuple[Paragraph, float, str]] = []
    for p in doc.paragraphs:
        if p._p.find(".//" + qn("w:numPr")) is not None or p._p.find(".//" + qn("w:drawing")) is not None:
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
    _strip_running_furniture(doc, page_break_after)
    _infer_heading_styles(doc)
    return _docx_document_to_result(doc, page_break_after, compress_images=True)
