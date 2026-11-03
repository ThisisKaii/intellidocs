"""Write ml/src/font_widths.json: the advance width of each ASCII character in common Word fonts.

The converter needs a run's natural width to reproduce Word's character scale (w:w). It runs on servers
without these fonts, so the numbers are generated once here, on a Windows machine with Office installed.

Usage: ml/venv/Scripts/python tests/e2e/tools/make_font_widths.py
"""
import json
from pathlib import Path

from fontTools.ttLib import TTCollection, TTFont

FONTS = Path(r"C:\Windows\Fonts")
OUT = Path(__file__).resolve().parents[3] / "ml" / "src" / "font_widths.json"

# Family (lower case) -> file of each style. A .ttc entry names the face inside the collection.
FAMILIES = {
    "bookman old style": ("BOOKOS.TTF", "BOOKOSB.TTF", "BOOKOSI.TTF", "BOOKOSBI.TTF"),
    "times new roman": ("times.ttf", "timesbd.ttf", "timesi.ttf", "timesbi.ttf"),
    "arial": ("arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"),
    "calibri": ("calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibriz.ttf"),
    "cambria": ("cambria.ttc#Cambria", "cambriab.ttf", "cambriai.ttf", "cambriaz.ttf"),
    "arial narrow": ("ARIALN.TTF", "ARIALNB.TTF", "ARIALNI.TTF", "ARIALNBI.TTF"),
    "microsoft sans serif": ("micross.ttf",) * 4,
    "trebuchet ms": ("trebuc.ttf", "trebucbd.ttf", "trebucit.ttf", "trebucbi.ttf"),
    "tahoma": ("tahoma.ttf", "tahomabd.ttf", "tahoma.ttf", "tahomabd.ttf"),
}
STYLES = ("regular", "bold", "italic", "bold italic")


def load(entry: str) -> TTFont:
    """Open a font file, or the named face of a font collection."""
    name, _, face = entry.partition("#")
    if not face:
        return TTFont(FONTS / name)
    for font in TTCollection(FONTS / name).fonts:
        if font["name"].getDebugName(4) == face:
            return font
    raise LookupError(entry)


def widths(font: TTFont) -> list[int]:
    """Advance widths of ASCII 32-126, in thousandths of an em."""
    units = font["head"].unitsPerEm
    cmap, metrics = font.getBestCmap(), font["hmtx"]
    return [round(metrics[cmap[code]][0] * 1000 / units) if code in cmap else 500 for code in range(32, 127)]


def main() -> None:
    table = {
        family: {style: widths(load(entry)) for style, entry in zip(STYLES, entries)}
        for family, entries in FAMILIES.items()
    }
    OUT.write_text(json.dumps(table, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{OUT}: {len(table)} families, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
