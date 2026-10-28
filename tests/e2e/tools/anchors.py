"""List every anchored (floating) drawing in a DOCX: position, wrapping, size and the text around it.

usage: ml/venv/Scripts/python tests/e2e/tools/anchors.py <docx> [--images-only]
Shows how Word places each floating picture (page, margin or paragraph relative; wrap mode;
behind text), which decides whether the converter pins it to the page or leaves it in the text.
"""
import argparse
import re
import sys
import zipfile

from lxml import etree

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
    "wps": "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
}
EMU_PER_PX = 9525

ap = argparse.ArgumentParser()
ap.add_argument("docx")
ap.add_argument("--images-only", action="store_true")
args = ap.parse_args()

with zipfile.ZipFile(args.docx) as z:
    root = etree.fromstring(z.read("word/document.xml"))
paragraphs = list(root.iter(f"{{{NS['w']}}}p"))
index_of = {p: i for i, p in enumerate(paragraphs)}


def text(p) -> str:
    return "".join(p.itertext()).strip()[:44]


def axis(position) -> str:
    if position is None:
        return "-"
    child = next(iter(position), None)
    what = "-" if child is None else (f"{int(child.text or 0) / EMU_PER_PX:.0f}px" if child.tag.endswith("posOffset") else child.text)
    return f"{position.get('relativeFrom')}:{what}"


rows = 0
for anchor in root.iter(f"{{{NS['wp']}}}anchor"):
    if any(a.tag.endswith("}Fallback") for a in anchor.iterancestors()):
        continue  # the mc:Fallback copy of a drawing is never rendered
    has_pic = anchor.find(".//pic:pic", NS) is not None
    has_text = anchor.find(".//w:txbxContent", NS) is not None
    if args.images_only and not has_pic:
        continue
    paragraph = next((a for a in anchor.iterancestors(f"{{{NS['w']}}}p")), None)
    extent = anchor.find("wp:extent", NS)
    wrap = next((etree.QName(c).localname for c in anchor if etree.QName(c).localname.startswith("wrap")), "none")
    kind = "picture" if has_pic else ("textbox" if has_text else "shape")
    rows += 1
    print(f"#{rows} para {index_of.get(paragraph, '?'):>4} {kind:8} {int(extent.get('cx')) / EMU_PER_PX:.0f}x{int(extent.get('cy')) / EMU_PER_PX:.0f}px  "
          f"H={axis(anchor.find('wp:positionH', NS))}  V={axis(anchor.find('wp:positionV', NS))}  {wrap}  "
          f"behind={anchor.get('behindDoc')}  | {text(paragraph) if paragraph is not None else ''!r}")
if rows == 0:
    print("no anchored drawings")
