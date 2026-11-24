"""Program workflows of IntelliDocs, one flowchart per role, drawn from the code.

usage: ml/venv/Scripts/python docs/manuscript/figures/chapter_3/program_workflow.py [--scale 4] [--role student|professor|admin]

Writes program_workflow_<role>.svg and .png. Each keeps the manuscript's Figure 11 layout: sign-in at the top,
the role's dashboard and its branches in the middle (each branch a chain of steps), the data it uses at the
bottom.

- Student (frontend/src/pages/Home.tsx and the editor): new accounts register with email or Google and start
  as students; a login is validated, a user with two-factor authentication enters their code, and everyone
  lands on the Dashboard (/dashboard). Redis keys are listed in server/src/models (behavior:*,
  behavior:formats:*, doc:cache:*, version:*, ai:quota:*, ai:route:*, drive:import:*, the AI suggestion
  cache); DuckDB (behavior_events, formatting_features) is filled from Redis by the aggregator.
- Professor (pages/ProfessorDashboard.tsx, server/src/routes/professorRoutes.ts, folderRoutes.ts,
  plagiarismRoutes.ts): the Professor Dashboard opens only for an approved professor
  (ApprovedProfessorRoute, requireApprovedProfessor); everyone registers as a student and applies for
  professor verification in Settings, which an administrator approves. Tabs: Overview, Classes,
  Submissions, Plagiarism, Compliance. Scans and audits run on the ML service.
- Administrator (pages/AdminDashboard.tsx, server/src/routes/adminRoutes.ts): opened from the Dashboard.
  Tabs: Verification, Users, Reports, Documents (read-only), Research data; all on Supabase.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONT = "'Times New Roman', Times, serif"


@dataclass
class Store:
    name: str
    subtitle: str
    items: list[str]
    # Fed by the branches (an arrow from the results line), else only from the store before it.
    from_branches: bool = True
    # Label of the arrow from the store before this one, if any.
    from_previous: str | None = None


@dataclass
class Role:
    key: str
    # "register": the full sign-up path; "professor": the approved-professor gate; "admin": straight in.
    gate: str
    dashboard: str
    # (heading rows, [step rows, ...]); a branch without steps ends the session.
    branches: list[tuple[list[str], list[list[str]]]]
    stores: list[Store] = field(default_factory=list)


ROLES = [
    Role("student", "register", "View Dashboard", [
        (["Manage Folders", "and Classes"], [["Create, rename, move;", "join a class with a code"]]),
        (["Import", "Document"], [["Convert .docx or PDF", "(file or Google Drive)"]]),
        (["Create or Open", "Document"], [["Edit with formatting", "suggestions, grammar", "checks, AI assistant"],
                                          ["Autosave and", "version history"]]),
        (["Share", "Document"], [["Invite by email, link", "or code; edit together", "in real time"]]),
        (["Check", "Originality"], [["Against own documents", "and web sources"]]),
        (["Settings"], [["Profile, password,", "two-factor, verification,", "subscription plan"]]),
        (["Log Out"], []),
    ], [
        Store("Supabase", "(PostgreSQL and Storage)", ["accounts, profiles and roles", "documents, tabs and versions",
              "folders, classes and enrollments", "shares and comments", "suggestion feedback, originality scans",
              "Storage: pictures, user models"]),
        Store("Redis", "(fast, short-lived data)", ["behavior event lists", "learned formats per user and genre",
              "document cache, AI suggestion cache", "AI quotas, assistant memory", "Google Drive import queue"]),
        Store("DuckDB", "(behavior analytics)", ["behavior_events", "formatting_features", "(per user and genre)"],
              from_branches=False, from_previous="aggregated"),
    ]),
    Role("professor", "professor", "Open Professor Dashboard", [
        (["Overview"], [["Classes, students,", "submissions, scans,", "flagged (originality < 70%)"]]),
        (["Classes"], [["Create a class", "(join code made)"], ["Enroll students by", "email or join code"],
                       ["Set the grading", "rubric"]]),
        (["Submissions"], [["Open a student's", "submission"], ["Comment on", "highlighted text"],
                           ["Grade with the rubric;", "student notified"]]),
        (["Plagiarism"], [["Scan a submission"], ["AI judges compare it", "with classmates and", "the web"],
                          ["Notified when done;", "view the matches"]]),
        (["Compliance"], [["Choose or create a", "thesis template"], ["Run the compliance", "audit"],
                          ["Review headings,", "references, margins"]]),
        (["Own Documents"], [["Write and edit like", "any user (student", "workflow)"]]),
        (["Log Out"], []),
    ], [
        Store("Supabase", "(PostgreSQL)", ["classes and enrollments", "class rubrics", "submissions, comments",
              "reviews and grades", "originality scans and matches", "notifications"]),
        Store("ML Service", "(FastAPI)", ["originality council (AI judges)", "compliance audit"]),
    ]),
    Role("admin", "admin", "Open Admin Dashboard", [
        (["Verification"], [["Review a student or", "professor application"], ["Approve or reject"],
                            ["Role and status updated;", "applicant notified"]]),
        (["Users"], [["Search by name, email,", "role or status"], ["Change a user's role"]]),
        (["Reports"], [["Headline numbers and", "weekly activity charts"], ["Download CSV or PDF"]]),
        (["Documents"], [["Search all documents"], ["View author, revisions,", "last update (read-only)"]]),
        (["Research Data"], [["Export the research", "dataset (CSV)"]]),
        (["Log Out"], []),
    ], [
        Store("Supabase", "(PostgreSQL and Storage)", ["user profiles, roles, verification", "documents and their pictures",
              "notifications", "formatting actions, suggestion feedback", "originality scans (for reports)"]),
    ]),
]


class Canvas:
    def __init__(self) -> None:
        self.svg: list[str] = []

    def text(self, x: float, y: float, s: str, size: float = 14, weight: str = "normal", anchor: str = "middle", italic: bool = False) -> None:
        style = ' font-style="italic"' if italic else ""
        self.svg.append(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}"{style} '
                        f'text-anchor="{anchor}" dominant-baseline="central">{escape(s)}</text>')

    def rows(self, x: float, y: float, rows: list[str], size: float = 14, bold: bool = False) -> None:
        pitch = size + 4
        top = y - (len(rows) - 1) * pitch / 2
        for i, row in enumerate(rows):
            self.text(x, top + i * pitch, row, size, "bold" if bold else "normal")

    def box(self, x: float, y: float, w: float, h: float, rows: list[str], bold: bool = False, size: float = 14) -> None:
        self.svg.append(f'<rect x="{x - w / 2:.1f}" y="{y - h / 2:.1f}" width="{w}" height="{h}" fill="#fff" stroke="#000" stroke-width="1.6"/>')
        self.rows(x, y, rows, size, bold)

    def terminator(self, x: float, y: float, w: float, h: float, label: str) -> None:
        self.svg.append(f'<rect x="{x - w / 2:.1f}" y="{y - h / 2:.1f}" width="{w}" height="{h}" rx="{h / 2}" fill="#fff" stroke="#000" stroke-width="1.6"/>')
        self.text(x, y, label, 16, "bold")

    def decision(self, x: float, y: float, rows: list[str], hw: float = 95, hh: float = 46) -> None:
        pts = [(x, y - hh), (x + hw, y), (x, y + hh), (x - hw, y)]
        self.svg.append(f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}" fill="#fff" stroke="#000" stroke-width="1.6"/>')
        self.rows(x, y, rows, 14)

    def arrow(self, points: list[tuple[float, float]], head: bool = True) -> None:
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
        marker = ' marker-end="url(#head)"' if head else ""
        self.svg.append(f'<polyline points="{pts}" fill="none" stroke="#000" stroke-width="1.5"{marker}/>')

    def label(self, x: float, y: float, s: str, anchor: str = "middle") -> None:
        self.text(x, y, s, 14, "bold", anchor)


def sign_in(c: Canvas, role: Role, cx: float) -> float:
    """The sign-in steps down to the role's dashboard. Returns the dashboard box's centre y."""
    c.terminator(cx, 40, 150, 46, "Start")
    if role.gate == "register":
        c.decision(cx, 150, ["Has an", "account?"])
        c.arrow([(cx, 63), (cx, 104)])
        c.box(cx + 360, 150, 230, 62, ["Register", "(email or Google)"], bold=True)
        c.arrow([(cx + 95, 150), (cx + 245, 150)])
        c.label(cx + 120, 138, "No")
        c.box(cx + 650, 150, 230, 62, ["Account created", "as a student"], bold=True)
        c.arrow([(cx + 475, 150), (cx + 535, 150)])
        login_y = 285
        c.arrow([(cx, 196), (cx, login_y - 27)])
        c.label(cx + 16, 228, "Yes", "start")
        c.arrow([(cx + 650, 181), (cx + 650, login_y), (cx + 100, login_y)])
    else:
        login_y = 140
        c.arrow([(cx, 63), (cx, login_y - 27)])
    c.box(cx, login_y, 200, 54, ["Log In"], bold=True)
    valid_y = login_y + 120
    c.decision(cx, valid_y, ["Valid", "credentials?"])
    c.arrow([(cx, login_y + 27), (cx, valid_y - 46)])
    c.arrow([(cx - 95, valid_y), (cx - 230, valid_y), (cx - 230, login_y), (cx - 100, login_y)])
    c.label(cx - 160, valid_y - 12, "No")
    factor_y = valid_y + 125
    c.decision(cx, factor_y, ["Two-factor", "turned on?"])
    c.arrow([(cx, valid_y + 46), (cx, factor_y - 46)])
    c.label(cx + 16, valid_y + 63, "Yes", "start")
    c.box(cx + 360, factor_y, 250, 54, ["Enter authentication code"], bold=True)
    c.arrow([(cx + 95, factor_y), (cx + 235, factor_y)])
    c.label(cx + 122, factor_y - 12, "Yes")

    if role.gate == "professor":
        gate_y = factor_y + 135
        c.decision(cx, gate_y, ["Approved", "professor?"])
        c.arrow([(cx, factor_y + 46), (cx, gate_y - 46)])
        c.label(cx + 16, factor_y + 60, "No", "start")
        c.arrow([(cx + 360, factor_y + 27), (cx + 360, factor_y + 76), (cx + 4, factor_y + 76)])
        c.box(cx + 360, gate_y, 250, 62, ["Apply for professor", "verification (Settings)"], bold=True)
        c.arrow([(cx + 95, gate_y), (cx + 235, gate_y)])
        c.label(cx + 122, gate_y - 12, "No")
        c.box(cx + 660, gate_y, 250, 62, ["An administrator approves;", "the professor is notified"], bold=True)
        c.arrow([(cx + 485, gate_y), (cx + 535, gate_y)])
        dash_y = gate_y + 130
        c.arrow([(cx, gate_y + 46), (cx, dash_y - 29)])
        c.label(cx + 16, gate_y + 64, "Yes", "start")
        c.arrow([(cx + 660, gate_y + 31), (cx + 660, dash_y), (cx + 130, dash_y)])
    else:
        dash_y = factor_y + 120
        c.arrow([(cx, factor_y + 46), (cx, dash_y - 29)])
        c.label(cx + 16, factor_y + 70, "No", "start")
        c.arrow([(cx + 360, factor_y + 27), (cx + 360, dash_y), (cx + 130, dash_y)])
    dash_rows = [role.dashboard] if role.gate != "admin" else [role.dashboard, "(from the Dashboard)"]
    c.box(cx, dash_y, 260, 58, dash_rows, bold=True)
    return dash_y


def build(role: Role) -> tuple[str, float, float]:
    c = Canvas()
    col_w, gap = 168, 22
    n = len(role.branches)
    width = max(1610, n * col_w + (n - 1) * gap + 140)
    cx = 640 if role.gate == "register" else width / 2 - 180
    dash_y = sign_in(c, role, cx)

    left = (width - (n * col_w + (n - 1) * gap)) / 2 + col_w / 2
    xs = [left + i * (col_w + gap) for i in range(n)]
    bus_y = dash_y + 75
    c.arrow([(cx, dash_y + 29), (cx, bus_y)], head=False)
    c.arrow([(xs[0], bus_y), (xs[-1], bus_y)], head=False)
    head_y = bus_y + 70
    step_h, step_gap = 78, 40
    longest = max(len(steps) for _, steps in role.branches)
    data_bus = head_y + 30 + longest * (step_h + step_gap) + 30
    for x, (name, steps) in zip(xs, role.branches):
        c.arrow([(x, bus_y), (x, head_y - 30)])
        c.box(x, head_y, col_w, 60, name, bold=True, size=14.5)
        y_prev = head_y + 30
        if not steps:
            end_y = head_y + 30 + step_gap + 23
            c.terminator(x, end_y, 130, 46, "End")
            c.arrow([(x, y_prev), (x, end_y - 23)])
            continue
        for i, rows in enumerate(steps):
            y = head_y + 30 + step_gap + step_h / 2 + i * (step_h + step_gap)
            c.box(x, y, col_w, step_h, rows, size=13.5)
            c.arrow([(x, y_prev), (x, y - step_h / 2)])
            y_prev = y + step_h / 2
        c.arrow([(x, y_prev), (x, data_bus)], head=False)

    # Every result is saved, and the user returns to the dashboard.
    last_with_steps = max(i for i, (_, steps) in enumerate(role.branches) if steps)
    c.arrow([(xs[0], data_bus), (26, data_bus), (26, dash_y), (cx - 130, dash_y)])
    c.text(34, dash_y - 14, "Back to the dashboard", 13.5, "bold", anchor="start", italic=True)

    # Data stores, side by side under the results line.
    stores_top = data_bus + 55
    store_h = 70 + max(len(s.items) for s in role.stores) * 21 + 20
    store_gap = 80
    store_w = min(470, (width - 180 - (len(role.stores) - 1) * store_gap) / len(role.stores))
    total = len(role.stores) * store_w + (len(role.stores) - 1) * store_gap
    x0 = (width - total) / 2
    labelled = False
    fed: list[float] = []
    for i, store in enumerate(role.stores):
        sx = x0 + i * (store_w + store_gap)
        mid = sx + store_w / 2
        c.svg.append(f'<rect x="{sx:.1f}" y="{stores_top:.1f}" width="{store_w:.1f}" height="{store_h:.1f}" fill="#fff" stroke="#000" stroke-width="2"/>')
        c.text(mid, stores_top + 24, store.name, 17, "bold")
        c.text(mid, stores_top + 44, store.subtitle, 13.5, italic=True)
        for j, item in enumerate(store.items):
            c.text(mid, stores_top + 76 + j * 21, item, 13.5)
        if store.from_branches:
            # Off any branch's line, so the arrow is not read as that branch's alone.
            ax = mid + 45 if any(abs(mid - x) < 20 for x in xs) else mid
            fed.append(ax)
            c.arrow([(ax, data_bus), (ax, stores_top)])
            if not labelled:
                c.text(ax + 8, data_bus + 26, "store / retrieve", 13, italic=True, anchor="start")
                labelled = True
        if store.from_previous:
            c.arrow([(sx - store_gap, stores_top + store_h / 2), (sx, stores_top + store_h / 2)])
            c.text(sx - store_gap / 2, stores_top + store_h / 2 - 16, store.from_previous, 12.5, italic=True)
    # The results line joins every branch and reaches every store it feeds.
    c.arrow([(min(fed + [xs[0]]), data_bus), (max(fed + [xs[last_with_steps]]), data_bus)], head=False)
    height = stores_top + store_h + 30
    return "".join(c.svg), width, height


def render_svg(role: Role) -> str:
    body, width, height = build(role)
    defs = ('<defs><marker id="head" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="8" markerHeight="8" orient="auto">'
            '<path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker></defs>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" viewBox="0 0 {width:.0f} {height:.0f}">'
            f'<rect width="100%" height="100%" fill="#fff"/>{defs}{body}</svg>')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=4.0, help="device pixels per CSS pixel in the PNG")
    parser.add_argument("--role", choices=[r.key for r in ROLES], help="render one role only")
    args = parser.parse_args()
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel="chrome")
        page = browser.new_context(device_scale_factor=args.scale).new_page()
        for role in ROLES:
            if args.role and role.key != args.role:
                continue
            svg = render_svg(role)
            (HERE / f"program_workflow_{role.key}.svg").write_text(svg, encoding="utf-8")
            page.set_content(f'<html><body style="margin:0;background:#fff">{svg}</body></html>')
            page.evaluate("document.fonts.ready.then(() => true)")
            page.locator("svg").screenshot(path=str(HERE / f"program_workflow_{role.key}.png"))
            print(f"wrote program_workflow_{role.key}.svg and .png")
        browser.close()


if __name__ == "__main__":
    main()
