"""Build the manuscript's Unit Testing and Integration Testing tables (a Word file) from the suite.

Every case is read from its test's docstring (case id, unit or modules, description, expected
result) and its outcome and "Actual Result" from pytest's JUnit report(s), so the tables always
show what the last run actually saw. Each case's screenshot follows as test evidence.

Usage:
    python build_testing_tables.py <out.docx> <junit.xml> [<junit.xml> ...]
A case in several reports takes its outcome from the report given last.
"""

from __future__ import annotations

import ast
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt

HERE = Path(__file__).parent
FIGURES = HERE.parents[2] / "docs" / "manuscript" / "figures" / "chapter_4"

# Table 24 (List of Modules): who built each module.
PROPONENTS = {
    "Account Management": "Amamence, Marjun",
    "Document Management": "Alenton, RJ",
    "Folder Management": "Dagupan, Christian Paulo",
    "Document Editor": "Amamence, Marjun",
    "Formatting Prediction": "Asingua, Joshua",
    "Behavioral Learning": "Asingua, Joshua",
    "Grammar and Spelling": "Asingua, Joshua",
    "AI Chat Overlay": "Alenton, RJ",
    "Document Comments": "Dagupan, Christian Paulo",
    "Document Review": "Dagupan, Christian Paulo",
    "Admin Management": "Alenton, RJ",
}


def cases_in(path: Path) -> list[dict[str, str]]:
    """Every test function's case details, in file order."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    module_doc = ast.get_docstring(tree) or ""
    module = ""
    match = re.match(r"Unit testing \| ([^(]+)", module_doc)
    if match:
        module = match.group(1).strip()
    found = []
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef) or not node.name.startswith("test_"):
            continue
        doc = ast.get_docstring(node) or ""
        lines = [line.strip() for line in doc.splitlines() if line.strip()]
        head = [part.strip() for part in lines[0].split("|")]
        body = " ".join(lines[1:])
        fields = dict(re.findall(r"(Process|Precondition|Expected):\s*(.*?)(?=\s(?:Process|Precondition|Expected):|$)", body))
        description = re.split(r"\s(?:Process|Precondition|Expected):", " " + body)[0].strip()
        found.append({"test": node.name, "id": head[0], "unit": head[1], "kind": head[2], "module": module,
                      "description": description, **fields})
    return found


def outcomes(reports: list[Path]) -> dict[str, dict[str, str]]:
    """test name → {result, actual, date, message} from the JUnit reports (later reports win)."""
    seen: dict[str, dict[str, str]] = {}
    for report in reports:
        root = ET.parse(report).getroot()
        for suite in root.iter("testsuite"):
            stamp = suite.get("timestamp", "")
            date = datetime.fromisoformat(stamp).strftime("%m/%d/%Y") if stamp else ""
            for case in suite.iter("testcase"):
                name = case.get("name", "")
                failure = case.find("failure")
                if failure is None:
                    failure = case.find("error")
                skipped = case.find("skipped")
                actual = next((p.get("value", "") for p in case.iter("property") if p.get("name") == "actual"), "")
                if skipped is not None:
                    result = "Not run"
                    actual = actual or (skipped.get("message", "").replace("Skipped: ", "") or "Not run")
                elif failure is not None:
                    result = "Failed"
                    if not actual:
                        message = (failure.get("message") or "").split("\n")[0]
                        actual = re.sub(r"^\w+(Error|Exception): ", "", message)[:220]
                else:
                    result = "Passed"
                seen[name] = {"result": result, "actual": actual, "date": date}
    return seen


def sentence(text: str) -> str:
    """Start with a capital letter (the docstrings run on after "Expected:" in lower case)."""
    text = text.strip()
    return text[:1].upper() + text[1:]


def set_cell(cell, text: str, bold: bool = False, size: float = 8) -> None:
    text = sentence(text)
    cell.text = ""
    run = cell.paragraphs[0].add_run(text)
    run.bold = bold
    run.font.size = Pt(size)
    run.font.name = "Times New Roman"


def shade(cell, color: str = "D9D9D9") -> None:
    properties = cell._tc.get_or_add_tcPr()
    fill = OxmlElement("w:shd")
    fill.set(qn("w:val"), "clear")
    fill.set(qn("w:color"), "auto")
    fill.set(qn("w:fill"), color)
    properties.append(fill)


def table(doc, headers: list[str], rows: list[list[str]], widths: list[float]) -> None:
    grid = doc.add_table(rows=1, cols=len(headers))
    grid.style = "Table Grid"
    grid.alignment = WD_TABLE_ALIGNMENT.CENTER
    for index, header in enumerate(headers):
        set_cell(grid.rows[0].cells[index], header, bold=True)
        shade(grid.rows[0].cells[index])
    for row in rows:
        cells = grid.add_row().cells
        for index, value in enumerate(row):
            set_cell(cells[index], value, bold=(index == len(row) - 1 and value in ("Failed",)))
    for row in grid.rows:
        for index, width in enumerate(widths):
            row.cells[index].width = Inches(width)
    # Repeat the header row on every page.
    header_properties = grid.rows[0]._tr.get_or_add_trPr()
    repeat = OxmlElement("w:tblHeader")
    repeat.set(qn("w:val"), "true")
    header_properties.append(repeat)


def heading(doc, text: str, size: float = 12) -> None:
    paragraph = doc.add_paragraph()
    run = paragraph.add_run(text)
    run.bold = True
    run.font.size = Pt(size)
    run.font.name = "Times New Roman"


def evidence(doc, case: dict[str, str], folder: str, outcome: dict[str, str]) -> None:
    name = case["test"].removeprefix("test_")
    image = FIGURES / folder / f"{name}.png"
    if not image.exists():
        image = FIGURES / folder / f"{name}_FAILED.png"
    if not image.exists():
        return
    doc.add_picture(str(image), width=Inches(8.5))
    caption = doc.add_paragraph()
    run = caption.add_run(f"{case['id']} ({outcome.get('result', 'Not run')}): {case.get('unit', '')}. {outcome.get('actual', '')}")
    run.italic = True
    run.font.size = Pt(9)
    run.font.name = "Times New Roman"


def main() -> None:
    out = Path(sys.argv[1])
    results = outcomes([Path(p) for p in sys.argv[2:]])
    unit_cases = [c for f in sorted(HERE.glob("test_unit_*.py")) for c in cases_in(f)]
    integration_cases = cases_in(HERE / "test_integration.py")

    doc = Document()
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = Inches(13), Inches(8.5)
    for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(section, side, Inches(0.6))
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(10)

    heading(doc, "UNIT TESTING")
    rows, last_module = [], None
    for case in unit_cases:
        outcome = results.get(case["test"], {"result": "Not run", "actual": "", "date": ""})
        module = case["module"]
        first = module != last_module
        last_module = module
        rows.append([
            PROPONENTS.get(module, "") if first else "",
            module if first else "",
            case["unit"],
            outcome["date"],
            case["id"],
            f"{case['kind']}: {case['description']}",
            case.get("Expected", ""),
            outcome["actual"],
            outcome["result"],
        ])
    table(doc, ["Proponent", "Module Name", "Unit Name", "Date Tested", "Test Case ID", "Test Case Description", "Expected Result", "Actual Result", "Result"],
          rows, [1.0, 1.0, 1.1, 0.75, 0.75, 2.4, 2.3, 2.3, 0.6])

    doc.add_page_break()
    heading(doc, "INTEGRATION TESTING")
    rows = []
    for case in integration_cases:
        outcome = results.get(case["test"], {"result": "Not run", "actual": "", "date": ""})
        first_module, second_module = [m.strip() for m in case["unit"].split("->")]
        rows.append([
            PROPONENTS.get(first_module, ""),
            case["id"],
            first_module,
            f"{case['kind']}: {sentence(case.get('Process', ''))}",
            second_module,
            case.get("Precondition", ""),
            case.get("Expected", ""),
            f"{outcome['result']}. {outcome['actual']}".strip(),
        ])
    table(doc, ["Proponent", "Test Case ID", "Module 1", "Integration Process", "Module 2", "Precondition", "Expected Result", "Remarks"],
          rows, [1.0, 0.7, 1.1, 2.6, 1.1, 1.7, 2.5, 2.5])

    doc.add_page_break()
    heading(doc, "TEST EVIDENCE: UNIT TESTING")
    for case in unit_cases:
        evidence(doc, case, "unit", results.get(case["test"], {}))
    doc.add_page_break()
    heading(doc, "TEST EVIDENCE: INTEGRATION TESTING")
    for case in integration_cases:
        evidence(doc, case, "integration", results.get(case["test"], {}))

    doc.save(str(out))
    counted = [results.get(c["test"], {}).get("result", "Not run") for c in unit_cases + integration_cases]
    print(f"wrote {out}: {len(unit_cases)} unit, {len(integration_cases)} integration;",
          ", ".join(f"{counted.count(r)} {r.lower()}" for r in ("Passed", "Failed", "Not run")))


if __name__ == "__main__":
    main()
