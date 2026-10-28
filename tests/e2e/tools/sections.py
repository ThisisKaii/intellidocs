"""List every section's page size / margins / header-footer distance from a DOCX (inches)."""
import sys, zipfile
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
q = lambda t: f"{{{W}}}{t}"
with zipfile.ZipFile(sys.argv[1]) as z:
    root = etree.fromstring(z.read("word/document.xml"))
for n, s in enumerate(root.iter(q("sectPr"))):
    mar = s.find(q("pgMar"))
    size = s.find(q("pgSz"))
    kind = s.find(q("type"))
    f = lambda e, k: round(int(e.get(q(k)) or 0) / 1440, 2) if e is not None and e.get(q(k)) else None
    print(f"section {n}: size {f(size,'w')}x{f(size,'h')}  type={kind.get(q('val')) if kind is not None else 'nextPage'}  "
          f"top={f(mar,'top')} bottom={f(mar,'bottom')} left={f(mar,'left')} right={f(mar,'right')} "
          f"header={f(mar,'header')} footer={f(mar,'footer')}  "
          f"titlePg={s.find(q('titlePg')) is not None}  cols={(s.find(q('cols')).get(q('num')) if s.find(q('cols')) is not None else '1')}  "
          f"hdrRefs={len(s.findall(q('headerReference')))} ftrRefs={len(s.findall(q('footerReference')))}")
