"""Print the converter's HTML for the table row (<tr>) holding some text.

usage: ml/venv/Scripts/python tests/e2e/tools/html_row.py <docx> <text>
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "tests" / "e2e"))
import fidelity_run as fr  # noqa: E402

docx, needle = sys.argv[1], sys.argv[2]
html = fr.convert(Path(docx))["html"]
at = html.find(needle)
if at < 0:
    raise SystemExit("text not found")
start = html.rfind("<tr", 0, at)
end = html.find("</tr>", at) + 5
row = html[start:end]
row = re.sub(r"<img[^>]{120,}>", "<img …>", row)
print(row)
