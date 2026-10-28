"""Print the raw WordprocessingML of the paragraphs just before a given paragraph text."""
import re, sys, zipfile
from lxml import etree

docx, needle = sys.argv[1], sys.argv[2]
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
ns = {"w": W}
with zipfile.ZipFile(docx) as z:
    root = etree.fromstring(z.read("word/document.xml"))
# Every paragraph in document order, including those nested in content controls (the TOC) and tables.
kids = list(root.iter(f"{{{W}}}p"))
occurrence = int(sys.argv[3]) if len(sys.argv) > 3 else 1  # 1 = first paragraph containing the text


def text_of(el) -> str:
    return "".join(el.itertext()).strip()


def brief(el) -> str:
    """Compact XML: drop run text noise but keep breaks, sectPr, pageBreakBefore, styles."""
    xml = etree.tostring(el, encoding="unicode")
    xml = re.sub(r' xmlns:\w+="[^"]+"', "", xml)
    return xml if len(xml) < 1400 else xml[:1400] + " ...[cut]"


seen = 0
for idx, el in enumerate(kids):
    if needle.lower() in text_of(el).lower():
        seen += 1
        if seen < occurrence:
            continue
        print(f"=== paragraph #{idx} (match {seen}): {text_of(el)[:50]!r}")
        for k in range(max(0, idx - 2), idx + 1):
            print(f"\n[{k}] text={text_of(kids[k])[:50]!r}")
            print(brief(kids[k]))
        break
