"""Use case diagram of IntelliDocs (UML), drawn in the style of the manuscript's Figure 17.

usage: ml/venv/Scripts/python docs/manuscript/figures/chapter_3/use_case.py [--scale 4]

The manuscript's fourteen use cases, plus three the system has that the old figure left out: Collaborate
on Documents (document shares, share links, live co-editing), Check Originality (class-folder scans by a
professor, self-checks by anyone) and Manage Classes (a professor's class folders, rubrics and join codes;
a student joins with a code and sees grades). Which actor reaches which use case follows the server's
routes and role checks (server/src/routes, middleware/authMiddleware.ts).

Style, as in the manuscript: one system boundary titled IntelliDocs holding a single column of use cases,
Student and Professor on its left and Administrator on its right, each joined by plain association lines.
"""

from __future__ import annotations

import argparse
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONT = "'Times New Roman', Times, serif"

STUDENT, PROFESSOR, ADMIN = "Student", "Professor", "Administrator"

# (use case, actors), top to bottom: shared cases first, then one-role cases nearest their actor.
USE_CASES: list[tuple[str, set[str]]] = [
    ("Authenticate Account", {STUDENT, PROFESSOR, ADMIN}),
    ("Manage Account", {STUDENT, PROFESSOR, ADMIN}),
    ("Manage Documents", {STUDENT, PROFESSOR}),
    ("Manage Folders", {STUDENT, PROFESSOR}),
    ("Edit Document", {STUDENT, PROFESSOR}),
    ("Collaborate on Documents", {STUDENT, PROFESSOR}),
    ("Predict Formatting", {STUDENT, PROFESSOR}),
    ("Track Behavior", {STUDENT, PROFESSOR}),
    ("Check Grammar & Spelling", {STUDENT, PROFESSOR}),
    ("Use AI Assistant", {STUDENT, PROFESSOR}),
    ("Manage Academic Presets", {STUDENT, PROFESSOR}),
    ("Check Originality", {STUDENT, PROFESSOR}),
    ("Manage Classes", {STUDENT, PROFESSOR}),
    ("Review Document", {PROFESSOR}),
    ("Manage Users", {ADMIN}),
    ("Manage Reports", {ADMIN}),
    ("View All Documents", {ADMIN}),
]

WIDTH = 900
BOX_LEFT, BOX_RIGHT, BOX_TOP = 230, 670, 24
CASE_X, CASE_RX, CASE_RY = (230 + 670) / 2, 112, 27
FIRST_CASE_Y, CASE_PITCH = 104, 66
LABEL_SIZE = 14
ACTOR_SIZE = 15


def text(x: float, y: float, label: str, size: float, weight: str = "bold") -> str:
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
            f'text-anchor="middle" dominant-baseline="central">{escape(label)}</text>')


def line(x1: float, y1: float, x2: float, y2: float, width: float = 1.2) -> str:
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#000" stroke-width="{width}"/>'


def use_case(label: str, y: float) -> str:
    parts = [f'<ellipse cx="{CASE_X}" cy="{y}" rx="{CASE_RX}" ry="{CASE_RY}" fill="#fff" stroke="#000" stroke-width="1.6"/>']
    words = label.split(" ")
    if len(label) > 21:
        cut = (len(words) + 1) // 2
        parts.append(text(CASE_X, y - 8, " ".join(words[:cut]), LABEL_SIZE))
        parts.append(text(CASE_X, y + 9, " ".join(words[cut:]), LABEL_SIZE))
    else:
        parts.append(text(CASE_X, y + 0.5, label, LABEL_SIZE))
    return "".join(parts)


def actor(name: str, x: float, y: float) -> str:
    """A stick figure whose shoulders are at (x, y); its name sits under its feet."""
    head_r = 13
    return "".join([
        f'<circle cx="{x}" cy="{y - 16 - head_r}" r="{head_r}" fill="#fff" stroke="#000" stroke-width="2"/>',
        line(x, y - 16, x, y + 30, 2),
        line(x - 22, y, x + 22, y, 2),
        line(x, y + 30, x - 18, y + 58, 2),
        line(x, y + 30, x + 18, y + 58, 2),
        text(x, y + 74, name, ACTOR_SIZE),
    ])


def render_svg() -> str:
    case_y = {label: FIRST_CASE_Y + i * CASE_PITCH for i, (label, _) in enumerate(USE_CASES)}
    box_bottom = FIRST_CASE_Y + (len(USE_CASES) - 1) * CASE_PITCH + CASE_RY + 40
    height = box_bottom + 24

    def middle_of(role: str) -> float:
        ys = [case_y[label] for label, actors in USE_CASES if role in actors]
        return (min(ys) + max(ys)) / 2

    # Student high and Professor low on the left, so their fans of lines part; Administrator beside its own cases.
    actors = {
        STUDENT: (90, middle_of(STUDENT) - 260),
        PROFESSOR: (90, middle_of(PROFESSOR) + 200),
        ADMIN: (WIDTH - 90, case_y["Manage Reports"] - 140),
    }

    lines: list[str] = []
    for label, roles in USE_CASES:
        y = case_y[label]
        for role in roles:
            ax, ay = actors[role]
            if role == ADMIN:
                lines.append(line(ax - 24, ay, CASE_X + CASE_RX, y))
            else:
                lines.append(line(ax + 24, ay, CASE_X - CASE_RX, y))

    shapes = [
        f'<rect x="{BOX_LEFT}" y="{BOX_TOP}" width="{BOX_RIGHT - BOX_LEFT}" height="{box_bottom - BOX_TOP}" fill="none" stroke="#000" stroke-width="2"/>',
        text(CASE_X, BOX_TOP + 30, "IntelliDocs", 18),
        *(use_case(label, case_y[label]) for label, _ in USE_CASES),
        *(actor(name, x, y) for name, (x, y) in actors.items()),
    ]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height:.0f}" viewBox="0 0 {WIDTH} {height:.0f}">'
            f'<rect width="100%" height="100%" fill="#fff"/>{"".join(lines)}{"".join(shapes)}</svg>')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=4.0, help="device pixels per CSS pixel in the PNG")
    args = parser.parse_args()
    svg = render_svg()
    (HERE / "use_case.svg").write_text(svg, encoding="utf-8")
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel="chrome")
        page = browser.new_context(device_scale_factor=args.scale).new_page()
        page.set_content(f'<html><body style="margin:0;background:#fff">{svg}</body></html>')
        page.evaluate("document.fonts.ready.then(() => true)")
        page.locator("svg").screenshot(path=str(HERE / "use_case.png"))
        browser.close()
    print(f"wrote use_case.svg and use_case.png ({len(USE_CASES)} use cases)")


if __name__ == "__main__":
    main()
