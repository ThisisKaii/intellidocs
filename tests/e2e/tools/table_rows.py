"""Describe the table row holding some text: table/row/cell properties and each cell's paragraph spacing.

usage: ml/venv/Scripts/python tests/e2e/tools/table_rows.py <docx> <text> [n]
Shows why a row may be taller or shorter in the editor than in Word (trHeight, cell margins,
paragraph spacing, borders, fonts).
"""
import re
import sys
import zipfile

from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
q = lambda tag: f"{{{W}}}{tag}"
docx, needle = sys.argv[1], sys.argv[2]
occurrence = int(sys.argv[3]) if len(sys.argv) > 3 else 1

with zipfile.ZipFile(docx) as z:
    root = etree.fromstring(z.read("word/document.xml"))


def brief(el) -> str:
    """Compact XML without namespaces."""
    xml = re.sub(r' xmlns:\w+="[^"]+"', "", etree.tostring(el, encoding="unicode"))
    return re.sub(r"\s+w14:\w+=\"[^\"]*\"|\s+w:rsid\w*=\"[^\"]*\"", "", xml)


seen = 0
for row in root.iter(q("tr")):
    if needle.lower() not in "".join(row.itertext()).lower():
        continue
    seen += 1
    if seen < occurrence:
        continue
    table = row.getparent()
    print("TABLE tblPr:", brief(table.find(q("tblPr"))) if table.find(q("tblPr")) is not None else None)
    print("TABLE grid :", [c.get(q("w")) for c in table.find(q("tblGrid"))])
    print("ROW trPr   :", brief(row.find(q("trPr"))) if row.find(q("trPr")) is not None else None)
    for number, cell in enumerate(row.findall(q("tc"))):
        tcpr = cell.find(q("tcPr"))
        print(f"\nCELL {number} tcPr:", brief(tcpr) if tcpr is not None else None)
        for p in cell.findall(q("p")):
            ppr = p.find(q("pPr"))
            spacing = ppr.find(q("spacing")) if ppr is not None else None
            style = ppr.find(q("pStyle")) if ppr is not None else None
            print("   p style=", style.get(q("val")) if style is not None else None,
                  "spacing=", dict((k.split('}')[1], v) for k, v in spacing.attrib.items()) if spacing is not None else None,
                  "text=", "".join(p.itertext())[:50].strip())
    break
else:
    print("no table row contains that text")
