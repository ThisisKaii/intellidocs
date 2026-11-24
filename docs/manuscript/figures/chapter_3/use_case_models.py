"""System Use Case Models of IntelliDocs: one UML diagram per use case of Figure 17 (use_case.py).

usage: ml/venv/Scripts/python docs/manuscript/figures/chapter_3/use_case_models.py [--scale 4] [--only name]

Writes use_case_models/<nn>_<name>.svg and .png. Drawn in the style of the manuscript's Figures 18-28: the
actor on the left joined to the base use cases inside a titled system boundary, and secondary use cases on
the right joined by dashed arrows: <<include>> points from the base to what it always does, <<extend>>
points from the optional behaviour back to the base. Two actors are stacked on the left, each beside its
own use cases, so no lines cross.

Every use case below was checked against the code (routes in server/src/routes, their controllers, and the
pages and components that call them). Some of the old figures showed features the system does not have
(translating text, warning users, inviting users by email, detecting anomalous usage, filtering reports by
date): those are left out. Password reset is left out too: the sign-in page links to /forgot-password,
but the app has no such page.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "use_case_models"
FONT = "'Times New Roman', Times, serif"

INCLUDE, EXTEND = "include", "extend"


@dataclass
class Base:
    label: str
    # (relation, label): <<include>> or <<extend>> use cases drawn to the right of this one.
    related: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class Model:
    number: int
    title: str
    # (actor, its base use cases), top to bottom.
    actors: list[tuple[str, list[Base]]]


MODELS: list[Model] = [
    Model(1, "Authenticate Account", [("User", [
        Base("Register Account", [(EXTEND, "Sign Up with Google")]),
        Base("Log In", [(INCLUDE, "Validate Credentials"), (EXTEND, "Enter Two-Factor Code")]),
        Base("Log Out"),
    ])]),
    Model(2, "Manage Account", [("User", [
        Base("Update Profile", [(EXTEND, "Upload Avatar")]),
        Base("Change Password"),
        Base("Set Up Two-Factor Authentication"),
        Base("Apply for Role Verification", [(INCLUDE, "Notify Administrator")]),
        Base("Manage Subscription Plan"),
        Base("Export Account Data"),
        Base("Delete Account", [(INCLUDE, "Confirm Deletion")]),
    ])]),
    Model(3, "Manage Documents", [("User", [
        Base("Create Document", [(EXTEND, "Start from Preset Template")]),
        Base("Import Document", [(INCLUDE, "Convert to Editable Document"), (EXTEND, "Import from Google Drive")]),
        Base("Open Document"),
        Base("Rename or Pin Document"),
        Base("Move to Trash", [(EXTEND, "Restore Document"), (EXTEND, "Delete Permanently")]),
        Base("Export Document", [(EXTEND, "Choose Word, PDF or HTML")]),
    ])]),
    Model(4, "Manage Folders", [("User", [
        Base("Create Folder", [(EXTEND, "Create Subfolder")]),
        Base("Open Folder"),
        Base("Rename Folder"),
        Base("Move Document to Folder"),
        Base("Delete Folder"),
    ])]),
    Model(5, "Edit Document", [("User", [
        Base("Write and Format Text", [(INCLUDE, "Save Automatically"), (EXTEND, "Apply Paragraph Style")]),
        Base("Insert Content", [(EXTEND, "Insert Table, Image or Equation")]),
        Base("Generate Contents and References", [(EXTEND, "Number Figure and Table Captions")]),
        Base("Change Page Setup"),
        Base("Manage Document Tabs"),
        Base("Restore Previous Version"),
    ])]),
    Model(6, "Collaborate on Documents", [("User", [
        Base("Share with People", [(INCLUDE, "Set View, Comment or Edit Access")]),
        Base("Create Share Link", [(INCLUDE, "Set Link Access"), (EXTEND, "Set Expiry Date")]),
        Base("Join with Share Code"),
        Base("Edit Together in Real Time"),
        Base("Remove Access"),
    ])]),
    Model(7, "Predict Formatting", [("User", [
        Base("Receive Formatting Suggestion", [(INCLUDE, "Run Rules and Models")]),
        Base("Accept Suggestion", [(INCLUDE, "Record Feedback"), (EXTEND, "Apply to Similar Blocks")]),
        Base("Reject Suggestion", [(INCLUDE, "Record Feedback")]),
        Base("Review Document Suggestions"),
        Base("Turn Suggestions Off"),
    ])]),
    Model(8, "Track Behavior", [("User", [
        Base("Perform Formatting Action", [(INCLUDE, "Log Behavior Event")]),
        Base("Respond to Suggestion", [(INCLUDE, "Record Labeled Feedback")]),
        Base("View Learning Summary"),
        Base("Export or Import Personalization Profile"),
    ])]),
    Model(9, "Check Grammar and Spelling", [("User", [
        Base("Write Text", [(INCLUDE, "Check Grammar and Spelling")]),
        Base("Review Issues"),
        Base("Apply Correction"),
        Base("Dismiss Issue"),
        Base("Import Personal Dictionary"),
    ])]),
    Model(10, "Use AI Assistant", [("User", [
        Base("Ask About the Document", [(INCLUDE, "Read Document Content")]),
        Base("Request Formatting Change", [(INCLUDE, "Preview Plan Card"), (EXTEND, "Apply Changes")]),
        Base("Find Sources and Cite"),
        Base("Refine Academic Style"),
        Base("Structure Notes into a Section"),
        Base("Explain a Suggestion"),
    ])]),
    Model(11, "Manage Academic Presets", [("User", [
        Base("Apply Preset to Document"),
        Base("Save Custom Preset", [(EXTEND, "Fork from Changed Preset")]),
        Base("Create Preset from Word File"),
        Base("Import Preset"),
        Base("Define Format Binding"),
        Base("Delete Custom Preset"),
    ])]),
    Model(12, "Check Originality", [
        ("Student", [
            Base("Check Against Own Documents", [(EXTEND, "Ask AI Judges to Review")]),
            Base("Check Against Web Sources", [(EXTEND, "Limit to Chapter or Pages")]),
        ]),
        ("Professor", [
            Base("Scan Class Submission", [(INCLUDE, "Convene AI Judges"), (INCLUDE, "Notify When Done")]),
            Base("View Scan Results"),
        ]),
    ]),
    Model(13, "Manage Classes", [
        ("Professor", [
            Base("Create Class", [(INCLUDE, "Generate Join Code")]),
            Base("Regenerate Join Code"),
            Base("Enroll Student by Email"),
            Base("Remove Student"),
            Base("Set Grading Rubric"),
        ]),
        ("Student", [
            Base("Join Class with Code"),
            Base("Submit Document to Class"),
            Base("View Rubric and Grades"),
        ]),
    ]),
    Model(14, "Review Document", [("Professor", [
        Base("View Submissions"),
        Base("Add Comment", [(EXTEND, "Highlight Text")]),
        Base("Grade Submission", [(INCLUDE, "Notify Student"), (EXTEND, "Score with Rubric")]),
        Base("Run Compliance Audit"),
    ])]),
    Model(15, "Manage Users", [("Administrator", [
        Base("Review Verification Request", [(INCLUDE, "Notify Applicant")]),
        Base("Approve or Reject Applicant"),
        Base("View and Search Users"),
        Base("Change User Role"),
    ])]),
    Model(16, "Manage Reports", [("Administrator", [
        Base("View System Reports", [(INCLUDE, "Aggregate Weekly Activity")]),
        Base("Download Report", [(EXTEND, "Choose CSV or PDF")]),
        Base("Export Research Dataset"),
    ])]),
    Model(17, "View All Documents", [("Administrator", [
        Base("Search All Documents"),
        Base("View Author and Activity"),
    ])]),
]

# Geometry.
BOX_LEFT = 150
BASE_X = 330
REL_X = 640
RX, RY = 105, 33
SLOT = 86
TOP = 78
LABEL_SIZE = 13.5


def text(x: float, y: float, s: str, size: float = LABEL_SIZE, weight: str = "bold", italic: bool = False) -> str:
    style = ' font-style="italic"' if italic else ""
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}"{style} '
            f'text-anchor="middle" dominant-baseline="central">{escape(s)}</text>')


def wrap(label: str, width: int = 18) -> list[str]:
    lines: list[str] = []
    for word in label.split():
        if lines and len(lines[-1]) + 1 + len(word) <= width:
            lines[-1] += " " + word
        else:
            lines.append(word)
    return lines


def ellipse(x: float, y: float, label: str) -> str:
    rows = wrap(label)
    pitch = 16
    top = y - (len(rows) - 1) * pitch / 2
    return (f'<ellipse cx="{x}" cy="{y:.1f}" rx="{RX}" ry="{RY}" fill="#fff" stroke="#000" stroke-width="1.8"/>'
            + "".join(text(x, top + i * pitch, row) for i, row in enumerate(rows)))


def actor(x: float, y: float, name: str) -> str:
    """A stick figure with its shoulders at (x, y)."""
    line = lambda a, b, c, d: f'<line x1="{a}" y1="{b:.1f}" x2="{c}" y2="{d:.1f}" stroke="#000" stroke-width="2"/>'
    return "".join([
        f'<circle cx="{x}" cy="{y - 28:.1f}" r="12" fill="#fff" stroke="#000" stroke-width="2"/>',
        line(x, y - 16, x, y + 26), line(x - 20, y, x + 20, y),
        line(x, y + 26, x - 16, y + 52), line(x, y + 26, x + 16, y + 52),
        text(x, y + 68, name, 14),
    ])


def arrow(x1: float, y1: float, x2: float, y2: float, kind: str) -> str:
    mid_x, mid_y = (x1 + x2) / 2, (y1 + y2) / 2
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#000" stroke-width="1.6" '
            f'stroke-dasharray="7 5" marker-end="url(#open)"/>'
            + f'<rect x="{mid_x - 33:.1f}" y="{mid_y - 17:.1f}" width="66" height="14" fill="#fff"/>'
            + text(mid_x, mid_y - 10, f"«{kind}»", 12, "normal", italic=True))


def render(model: Model) -> str:
    has_related = any(base.related for _, bases in model.actors for base in bases)
    box_right = (REL_X + RX + 36) if has_related else (BASE_X + RX + 60)
    width = box_right + 24
    parts: list[str] = []
    lines: list[str] = []
    slot = 0
    for name, bases in model.actors:
        start_slot = slot
        anchors: list[float] = []
        for base in bases:
            span = max(1, len(base.related))
            base_y = TOP + (slot + (span - 1) / 2) * SLOT + SLOT / 2
            anchors.append(base_y)
            parts.append(ellipse(BASE_X, base_y, base.label))
            for i, (kind, label) in enumerate(base.related):
                rel_y = TOP + (slot + i) * SLOT + SLOT / 2
                parts.append(ellipse(REL_X, rel_y, label))
                # Where each arrow meets an ellipse: on its rim, toward the other one.
                dx, dy = REL_X - BASE_X, rel_y - base_y
                start = (BASE_X + RX * 0.98, base_y + (dy / dx) * RX * 0.98 if abs(dy) > 1 else base_y)
                end = (REL_X - RX * 0.98, rel_y - (dy / dx) * RX * 0.98 if abs(dy) > 1 else rel_y)
                if kind == INCLUDE:
                    lines.append(arrow(start[0], start[1], end[0], end[1], kind))
                else:
                    lines.append(arrow(end[0], end[1], start[0], start[1], kind))
            slot += span
        actor_y = (TOP + start_slot * SLOT + SLOT / 2 + TOP + (slot - 1) * SLOT + SLOT / 2) / 2 - 12
        parts.append(actor(70, actor_y, name))
        for base_y in anchors:
            lines.append(f'<line x1="92" y1="{actor_y:.1f}" x2="{BASE_X - RX:.1f}" y2="{base_y:.1f}" stroke="#000" stroke-width="1.6"/>')
    box_bottom = TOP + slot * SLOT + 18
    height = box_bottom + 24
    boundary = (f'<rect x="{BOX_LEFT}" y="22" width="{box_right - BOX_LEFT}" height="{box_bottom - 22}" fill="none" stroke="#000" stroke-width="2.2"/>'
                + text((BOX_LEFT + box_right) / 2, 48, model.title, 18))
    defs = ('<defs><marker id="open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto">'
            '<path d="M1,1 L11,6 L1,11" fill="none" stroke="#000" stroke-width="1.6"/></marker></defs>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height:.0f}" viewBox="0 0 {width} {height:.0f}">'
            f'<rect width="100%" height="100%" fill="#fff"/>{defs}{"".join(lines)}{boundary}{"".join(parts)}</svg>')


def slug(model: Model) -> str:
    return f"{model.number:02d}_" + "_".join(model.title.lower().replace(",", "").split())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=4.0, help="device pixels per CSS pixel in the PNG")
    parser.add_argument("--only", help="render only models whose title contains this text")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    models = [m for m in MODELS if not args.only or args.only.lower() in m.title.lower()]
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel="chrome")
        page = browser.new_context(device_scale_factor=args.scale).new_page()
        for model in models:
            svg = render(model)
            (OUT / f"{slug(model)}.svg").write_text(svg, encoding="utf-8")
            page.set_content(f'<html><body style="margin:0;background:#fff">{svg}</body></html>')
            page.evaluate("document.fonts.ready.then(() => true)")
            page.locator("svg").screenshot(path=str(OUT / f"{slug(model)}.png"))
        browser.close()
    print(f"wrote {len(models)} use case models to {OUT.name}/")


if __name__ == "__main__":
    main()
