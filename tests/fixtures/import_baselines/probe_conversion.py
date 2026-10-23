import os
import sys
from pathlib import Path
from bs4 import BeautifulSoup

sys.path.insert(0, 'ml/src')
from converter import convert_docx_bytes_to_html, convert_pdf_bytes_to_html

docs_dir = Path("tests/fixtures/import_baselines/documents")
files = [
    "0200725_[research]_9569504b.docx",
    "0200725_[research]_9569504b.pdf",
    "DM-OUHRODI-2026-3750-1.docx",
    "DM-OUHRODI-2026-3750-1.pdf",
    "DM_0440_s_26_SGOD_Conduct-of-World-Teachers-Day.docx",
    "DM_0440_s_26_SGOD_Conduct-of-World-Teachers-Day.pdf",
    "V2 INTELLIDOCS (2).docx",
    "V2 INTELLIDOCS (2) (1).pdf",
    "V2 INTELLIDOCS sabotage.docx",
    "V2 INTELLIDOCS sabotage.pdf"
]

print(f"=== BATCH CONVERSION PROBE ({len(files)} files) ===\n")

for fn in files:
    fp = docs_dir / fn
    data = fp.read_bytes()
    try:
        if fn.endswith('.docx'):
            res = convert_docx_bytes_to_html(data)
        else:
            res = convert_pdf_bytes_to_html(data)
        
        soup = BeautifulSoup(res['html'], 'html.parser')
        p_count = len(soup.find_all('p'))
        h_count = len(soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']))
        table_count = len(soup.find_all('table'))
        img_count = len(soup.find_all('img'))
        
        # Check paragraph spacing in html
        ps_with_spacing = [p for p in soup.find_all('p') if 'margin-top' in p.get('style', '') or 'margin-bottom' in p.get('style', '')]
        
        # Check image widths in html
        img_widths = [img.get('width') for img in soup.find_all('img') if img.get('width')]
        
        # Check tables
        tables = soup.find_all('table')
        tbl_info = []
        for t in tables[:2]:
            rows = t.find_all('tr')
            cols = len(rows[0].find_all(['td', 'th'])) if rows else 0
            tbl_info.append(f"{len(rows)}x{cols}")
            
        print(f"File: {fn}")
        print(f"  HTML size: {len(res['html'])} chars | p: {p_count} | headings: {h_count} | tables: {table_count} | imgs: {img_count}")
        print(f"  Paragraphs with explicit margin spacing: {len(ps_with_spacing)}")
        print(f"  Image widths (px): {img_widths[:5]}")
        if tbl_info:
            print(f"  Sample tables: {tbl_info}")
        print(f"  Page setup: {res['page_setup']}")
        print(f"  Header: {res['header'][:40]!r} | Footer: {res['footer'][:40]!r}")
        print()
    except Exception as e:
        print(f"File: {fn} -> ERROR: {e}\n")
