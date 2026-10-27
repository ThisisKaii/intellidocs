import re, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "tests" / "e2e"))
import fidelity_run as fr  # noqa: E402

docx, needle = sys.argv[1], sys.argv[2]
html = fr.convert(Path(docx))["html"]
for m in re.finditer(re.escape(needle), html):
    start = max(0, m.start() - 900)
    print(f"--- match at {m.start()} of {len(html)} chars ---")
    print(re.sub(r'<img[^>]{200,}>', '<img …>', html[start:m.start() + 120]))
    break
print("\npage-break elements in document:", len(re.findall(r'data-page-break|intellidocs-page-break', html)))
