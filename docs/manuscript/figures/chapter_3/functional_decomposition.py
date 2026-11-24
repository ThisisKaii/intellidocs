"""Functional decomposition diagrams of IntelliDocs (Figure 14), drawn from the code.

usage: ml/venv/Scripts/python docs/manuscript/figures/chapter_3/functional_decomposition.py [--scale 4]

Writes functional_decomposition (.svg, .png): the whole tree on one page, IntelliDocs -> User Authentication ->
the Student, Professor and Administrator sections, each module with its functions, in the style of the
manuscript's Figure 14: boxes joined by elbow lines, a module's functions stacked under it off a line down
its left side.

Every function below exists in the app (checked against the routes in server/src/routes, their controllers,
and the pages and components that call them). A professor and an administrator also have every student
function; their trees show only what their role adds.
"""

from __future__ import annotations

import argparse
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONT = "'Times New Roman', Times, serif"

MODULES: dict[str, list[tuple[str, list[str]]]] = {
    "Student": [
        ("Document Editor", ["Text and paragraph formatting", "Tables, images and equations", "Captions, contents and bibliography",
                             "Page setup and document tabs", "Autosave and version history"]),
        ("Document Management", ["Create (blank or preset)", "Import .docx, PDF or Google Drive", "Rename, pin and trash",
                                 "Restore or delete permanently", "Export Word, PDF or HTML"]),
        ("Folder Management", ["Create and rename folders", "Move documents to folders", "Delete folders",
                               "Join a class with a code", "Submit to a class"]),
        ("Formatting Prediction", ["Formatting suggestions", "Accept or reject", "Apply to similar blocks",
                                   "Academic presets", "Format bindings"]),
        ("Behavioral Learning", ["Behavior tracking", "Labeled feedback", "Personal model training",
                                 "Learning summary", "Isolate a document"]),
        ("AI Assistant", ["Ask about the document", "Formatting plan cards", "Find sources and cite",
                          "Refine academic style", "Structure notes"]),
        ("Grammar and Spelling", ["Grammar check", "Spelling check", "Apply a correction", "Personal dictionary"]),
        ("Collaboration", ["Share with people", "Share link or code", "Set view, comment or edit", "Real-time co-editing"]),
        ("Originality Check", ["Against own documents", "Against web sources", "AI judge review"]),
        ("Account Management", ["Profile and avatar", "Password and two-factor", "Role verification",
                                "Subscription plan", "Export data, delete account"]),
    ],
    "Professor": [
        ("Class Management", ["Create a class", "Join codes", "Enroll or remove students", "Grading rubric"]),
        ("Review and Grading", ["View submissions", "Comment on text", "Grade with the rubric", "Notify the student"]),
        ("Plagiarism Scanning", ["Scan a submission", "AI judge council", "Classmates and web sources", "View the matches"]),
        ("Compliance Audit", ["Thesis templates", "Run the audit", "Headings, references, margins"]),
    ],
    "Administrator": [
        ("Verification", ["Review applications", "Approve or reject", "Notify the applicant"]),
        ("User Management", ["Search users", "Change roles"]),
        ("Reports", ["Weekly activity charts", "Download CSV or PDF", "Research dataset"]),
        ("Document Overview", ["Search all documents", "View author and activity"]),
    ],
}
AUTH = ["Register (email or Google)", "Log in", "Two-factor code", "Log out"]

BOX_H = 46
CHILD_W, CHILD_H, CHILD_PITCH = 172, 42, 54
COL_W, COL_GAP = 200, 26


class Canvas:
    def __init__(self) -> None:
        self.svg: list[str] = []

    def text(self, x: float, y: float, s: str, size: float = 14, weight: str = "normal") -> None:
        self.svg.append(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
                        f'text-anchor="middle" dominant-baseline="central">{escape(s)}</text>')

    def box(self, x: float, y: float, w: float, h: float, label: str, size: float = 14, weight: str = "normal", width: int = 22) -> None:
        self.svg.append(f'<rect x="{x - w / 2:.1f}" y="{y - h / 2:.1f}" width="{w}" height="{h}" fill="#fff" stroke="#000" stroke-width="1.6"/>')
        rows = wrap(label, width)
        pitch = size + 3
        top = y - (len(rows) - 1) * pitch / 2
        for i, row in enumerate(rows):
            self.text(x, top + i * pitch, row, size, weight)

    def line(self, points: list[tuple[float, float]], head: bool = False) -> None:
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
        marker = ' marker-end="url(#head)"' if head else ""
        self.svg.append(f'<polyline points="{pts}" fill="none" stroke="#000" stroke-width="1.4"{marker}/>')


def wrap(label: str, width: int) -> list[str]:
    rows: list[str] = []
    for word in label.split():
        if rows and len(rows[-1]) + 1 + len(word) <= width:
            rows[-1] += " " + word
        else:
            rows.append(word)
    return rows


def children(c: Canvas, x: float, top: float, items: list[str], parent_w: float = COL_W - 20) -> float:
    """Items stacked under a box whose bottom is at `top`, off a line down its left side. Returns the bottom."""
    spine = x - parent_w / 2 + 12
    y = top + 18 + CHILD_H / 2
    last = y
    for item in items:
        c.box(spine + 14 + CHILD_W / 2, y, CHILD_W, CHILD_H, item, 13, width=24)
        c.line([(spine, y), (spine + 14, y)], head=True)
        last = y
        y += CHILD_PITCH
    c.line([(spine, top), (spine, last)])
    return last + CHILD_H / 2


def tree(role: str) -> tuple[str, float, float]:
    """IntelliDocs -> the role -> its modules (rows of at most five) -> their functions."""
    c = Canvas()
    modules = MODULES[role]
    per_row = min(5, len(modules))
    rows = [modules[i:i + per_row] for i in range(0, len(modules), per_row)]
    width = per_row * COL_W + (per_row - 1) * COL_GAP + 120
    cx = width / 2
    c.box(cx, 40, 200, BOX_H, "IntelliDocs", 17, "bold")
    c.line([(cx, 63), (cx, 104)], head=True)
    c.box(cx, 130, 200, BOX_H, role, 16, "bold")
    y = 210
    trunk_x = 26
    first_row = True
    for row in rows:
        xs = [cx + (i - (len(row) - 1) / 2) * (COL_W + COL_GAP) for i in range(len(row))]
        bus = y
        if first_row:
            c.line([(cx, 153), (cx, bus)])
        else:
            c.line([(trunk_x, prev_bus), (trunk_x, bus), (xs[0], bus)])
        c.line([(xs[0], bus), (xs[-1], bus)])
        box_y = bus + 40 + BOX_H / 2
        bottom = box_y
        for x, (name, items) in zip(xs, row):
            c.line([(x, bus), (x, box_y - BOX_H / 2)], head=True)
            c.box(x, box_y, COL_W - 20, BOX_H, name, 14.5, "bold")
            bottom = max(bottom, children(c, x, box_y + BOX_H / 2, items))
        if first_row and len(rows) > 1:
            c.line([(xs[0], bus), (trunk_x, bus)])
        prev_bus = bus
        y = bottom + 50
        first_row = False
    return "".join(c.svg), width, y - 20


def overview() -> tuple[str, float, float]:
    """IntelliDocs -> User Authentication (and its functions) -> the three roles -> their modules."""
    c = Canvas()
    roles = list(MODULES)
    width = 3 * 300 + 2 * 60 + 120
    cx = width / 2
    c.box(cx, 40, 200, BOX_H, "IntelliDocs", 17, "bold")
    c.line([(cx, 63), (cx, 104)], head=True)
    c.box(cx, 130, 230, BOX_H, "User Authentication", 15.5, "bold")
    # Authentication's own functions, to the right of it.
    ax = cx + 230
    for i, item in enumerate(AUTH):
        ay = 92 + i * 26
        c.box(ax + 110, ay, 200, 22, item, 12.5, width=30)
        c.line([(ax - 10, ay), (ax + 10, ay)], head=True)
    c.line([(cx + 115, 130), (ax - 10, 130)])
    c.line([(ax - 10, 92), (ax - 10, 92 + (len(AUTH) - 1) * 26)])
    bus = 215
    c.line([(cx, 153), (cx, bus)])
    xs = [cx + (i - 1) * 360 for i in range(3)]
    c.line([(xs[0], bus), (xs[-1], bus)])
    bottom = 0.0
    for x, role in zip(xs, roles):
        c.line([(x, bus), (x, bus + 34)], head=True)
        c.box(x, bus + 57, 220, BOX_H, role, 16, "bold")
        spine = x - 110 + 14
        y = bus + 80 + 22 + 21
        last = y
        for name, _ in MODULES[role]:
            c.box(spine + 16 + 100, y, 200, 40, name, 13.5, width=26)
            c.line([(spine, y), (spine + 16, y)], head=True)
            last = y
            y += 52
        c.line([(spine, bus + 80), (spine, last)])
        bottom = max(bottom, last + 20)
    return "".join(c.svg), width, bottom + 24


def combined() -> tuple[str, float, float]:
    """The whole decomposition on one page: IntelliDocs -> User Authentication (with its functions) -> the
    Student, Professor and Administrator sections, each with its modules (rows of at most five) and their
    functions. A trunk down the left side joins the sections to User Authentication."""
    c = Canvas()
    width = 5 * COL_W + 4 * COL_GAP + 140
    cx = width / 2
    c.box(cx, 40, 200, BOX_H, "IntelliDocs", 17, "bold")
    c.line([(cx, 63), (cx, 104)], head=True)
    c.box(cx, 130, 230, BOX_H, "User Authentication", 15.5, "bold")
    ax = cx + 230
    for i, item in enumerate(AUTH):
        ay = 92 + i * 26
        c.box(ax + 110, ay, 200, 22, item, 12.5, width=30)
        c.line([(ax - 10, ay), (ax + 10, ay)], head=True)
    c.line([(cx + 115, 130), (ax - 10, 130)])
    c.line([(ax - 10, 92), (ax - 10, 92 + (len(AUTH) - 1) * 26)])

    trunk_x, row_trunk_x = 26, 52
    c.line([(cx, 153), (cx, 190), (trunk_x, 190)])
    top = 230
    role_ys: list[float] = []
    for role, modules in MODULES.items():
        role_y = top + BOX_H / 2
        role_ys.append(role_y)
        c.box(cx, role_y, 220, BOX_H, role, 16, "bold")
        c.line([(trunk_x, role_y), (cx - 110, role_y)], head=True)
        per_row = min(5, len(modules))
        rows = [modules[i:i + per_row] for i in range(0, len(modules), per_row)]
        y = role_y + BOX_H / 2 + 34
        prev_bus = y
        for r, row in enumerate(rows):
            xs = [cx + (i - (len(row) - 1) / 2) * (COL_W + COL_GAP) for i in range(len(row))]
            bus = y
            if r == 0:
                c.line([(cx, role_y + BOX_H / 2), (cx, bus)])
            else:
                c.line([(row_trunk_x, prev_bus), (row_trunk_x, bus), (xs[0], bus)])
            c.line([(xs[0], bus), (xs[-1], bus)])
            if r == 0 and len(rows) > 1:
                c.line([(xs[0], bus), (row_trunk_x, bus)])
            box_y = bus + 34 + BOX_H / 2
            bottom = box_y
            for x, (name, items) in zip(xs, row):
                c.line([(x, bus), (x, box_y - BOX_H / 2)], head=True)
                c.box(x, box_y, COL_W - 20, BOX_H, name, 14.5, "bold")
                bottom = max(bottom, children(c, x, box_y + BOX_H / 2, items))
            prev_bus = bus
            y = bottom + 40
        top = y + 20
    c.line([(trunk_x, 190), (trunk_x, role_ys[-1])])
    return "".join(c.svg), width, top - 30


def render_svg(body: str, width: float, height: float) -> str:
    defs = ('<defs><marker id="head" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
            '<path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker></defs>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" viewBox="0 0 {width:.0f} {height:.0f}">'
            f'<rect width="100%" height="100%" fill="#fff"/>{defs}{body}</svg>')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=4.0, help="device pixels per CSS pixel in the PNG")
    args = parser.parse_args()
    figures = {"functional_decomposition": combined()}
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel="chrome")
        page = browser.new_context(device_scale_factor=args.scale).new_page()
        for name, (body, width, height) in figures.items():
            svg = render_svg(body, width, height)
            (HERE / f"{name}.svg").write_text(svg, encoding="utf-8")
            page.set_content(f'<html><body style="margin:0;background:#fff">{svg}</body></html>')
            page.evaluate("document.fonts.ready.then(() => true)")
            page.locator("svg").screenshot(path=str(HERE / f"{name}.png"))
            print(f"wrote {name}.svg and .png")
        browser.close()


if __name__ == "__main__":
    main()
