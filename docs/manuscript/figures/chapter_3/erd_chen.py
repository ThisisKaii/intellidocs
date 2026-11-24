"""Entity-Relationship Diagram of IntelliDocs (Chen notation), drawn in the style of the manuscript's Figure 39.

usage: ml/venv/Scripts/python docs/manuscript/figures/chapter_3/erd_chen.py [--scale 4]

Covers the 29 tables of the Supabase public schema (db/supabase migrations 001-052; the tester-only
`reviews` table is left out) plus `users`, which is Supabase's auth.users. The DBML file is out of date,
so tables and columns are taken from the migrations.

Style, as in the manuscript: a tree. A hub table's children hang from a horizontal connector: a diamond
(1 above, N below), the child table, and its attributes as a stack of equal ovals off a line down its
left side. Hubs show their attributes fanned beside them. Tables are light-blue boxes and attributes are
labelled (PK)/(FK). Each table is drawn once, under one parent; another parent shows as an (FK)
attribute. Two links are by key, not foreign key: documents.formatting_preset and user_presets.base_key
name a formatting preset. Long tables show their key, foreign keys and main columns.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONT = "'Times New Roman', Times, serif"
FILL = "#cfe2f3"
NAME_SIZE = 17
ATTR_SIZE = 15
REL_SIZE = 15
CARD_SIZE = 16
OVAL_H = 30
OVAL_PITCH = 38
ENTITY_H = 40

A: dict[str, list[str]] = {
    "users": ["id (PK)", "email", "phone", "created_at", "last_sign_in_at"],
    "roles": ["role_id (PK)", "role_name"],
    "user_profiles": ["id (PK)", "user_id (FK)", "role_id (FK)", "decided_by (FK)", "display_name",
                      "verification_status", "requested_role", "faculty_id", "student_id", "plan"],
    "documents": ["id (PK)", "user_id (FK)", "formatting_preset", "title", "content", "content_json",
                  "page_size", "margins", "genre", "page_layout", "is_deleted", "created_at"],
    "folders": ["folder_id (PK)", "user_id (FK)", "parent_id (FK)", "name", "folder_type", "class_code",
                "academic_term", "join_code", "created_at"],
    "folder_documents": ["folder_id (PK, FK)", "document_id (PK, FK)", "added_at"],
    "class_enrollments": ["folder_id (PK, FK)", "student_id (PK, FK)", "enrolled_at"],
    "google_tokens": ["id (PK)", "user_id (FK)", "access_token", "refresh_token", "expiry_date", "updated_at"],
    "notifications": ["notification_id (PK)", "user_id (FK)", "type", "title", "message", "read", "created_at"],
    "reports": ["report_id (PK)", "generated_by (FK)", "report_type", "parameters", "file_path", "generated_at"],
    "format_bindings": ["id (PK)", "user_id (FK)", "trigger_condition", "format_to_apply", "priority", "created_at"],
    "personalization_settings": ["user_id (PK, FK)", "key (PK)", "value", "updated_at"],
    "prediction_feedback": ["id (PK)", "user_id (FK)", "document_id (FK)", "prediction_type", "predicted_format",
                            "confidence", "accepted", "block_text", "kept_format", "created_at"],
    "formatting_actions": ["action_id (PK)", "document_id (FK)", "user_id (FK)", "block_id", "action_type",
                           "action_source", "created_at"],
    "ai_suggestions": ["suggestion_id (PK)", "document_id (FK)", "user_id (FK)", "block_id", "suggested_format",
                       "confidence", "reason", "status", "created_at"],
    "suggestion_feedback": ["feedback_id (PK)", "suggestion_id (FK)", "user_id (FK)", "decision", "decided_at"],
    "grammar_issues": ["issue_id (PK)", "document_id (FK)", "user_id (FK)", "issue_type", "original_text",
                       "suggestion_text", "resolved_at", "created_at"],
    "plagiarism_scans": ["scan_id (PK)", "document_id (FK)", "user_id (FK)", "folder_id (FK)",
                         "overall_originality_score", "peer_similarity_score", "external_similarity_score",
                         "scope", "scan_status"],
    "plagiarism_matches": ["match_id (PK)", "scan_id (FK)", "matched_document_id (FK)", "matched_student_id (FK)",
                           "matched_folder_id (FK)", "similarity_score", "match_type", "match_severity", "flagged_text"],
    "formatting_presets": ["id (PK)", "key", "name", "description", "rules", "is_system", "created_at"],
    "user_presets": ["preset_id (PK)", "user_id (FK)", "key", "base_key", "name", "rules", "version", "blueprint", "created_at"],
    "document_tabs": ["tab_id (PK)", "document_id (FK)", "position", "title", "content_json", "page_count",
                      "word_count", "outline"],
    "document_versions": ["version_id (PK)", "document_id (FK)", "user_id (FK)", "tab_id", "version_number",
                          "title", "content_json", "reason", "created_at"],
    "document_shares": ["share_id (PK)", "document_id (FK)", "owner_id (FK)", "shared_with (FK)", "permission",
                        "pending_email", "shared_at"],
    "document_comments": ["comment_id (PK)", "document_id (FK)", "user_id (FK)", "highlighted_text", "comment", "created_at"],
    "document_reviews": ["review_id (PK)", "document_id (FK)", "reviewer_id (FK)", "student_id (FK)", "grade",
                         "status", "notes", "rubric", "reviewed_at"],
    "stored_images": ["path (PK)", "user_id (FK)", "document_id (FK)", "bytes", "backend", "created_at"],
    "document_embeddings": ["embedding_id (PK)", "document_id (FK)", "user_id (FK)", "folder_id (FK)",
                            "paragraph_index", "paragraph_text", "embedding", "char_start", "char_end"],
    "document_pins": ["user_id (PK, FK)", "document_id (PK, FK)", "pinned_at"],
    "document_opens": ["user_id (PK, FK)", "document_id (PK, FK)", "last_opened_at"],
}


def text_w(s: str, size: float) -> float:
    return len(s) * size * 0.5 + 6


def oval_w(attrs: list[str]) -> float:
    return max(text_w(a, ATTR_SIZE) for a in attrs) + 26


@dataclass
class Box:
    name: str
    x: float
    y: float
    w: float = 0.0
    h: float = ENTITY_H

    def __post_init__(self) -> None:
        self.w = max(150.0, text_w(self.name, NAME_SIZE) + 30)

    @property
    def left(self) -> float:
        return self.x - self.w / 2

    @property
    def right(self) -> float:
        return self.x + self.w / 2

    @property
    def top(self) -> float:
        return self.y - self.h / 2

    @property
    def bottom(self) -> float:
        return self.y + self.h / 2


SVG: list[str] = []
TOP_LAYER: list[str] = []
DRAWN: set[str] = set()


def t(x: float, y: float, s: str, size: float, weight: str = "normal") -> str:
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
            f'text-anchor="middle" dominant-baseline="central">{escape(s)}</text>')


def line(points: list[tuple[float, float]], width: float = 1.4) -> None:
    SVG.append(f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in points)}" fill="none" stroke="#000" stroke-width="{width}"/>')


def card(x: float, y: float, value: str) -> None:
    TOP_LAYER.append(t(x, y, value, CARD_SIZE))


def entity(name: str, x: float, y: float) -> Box:
    DRAWN.add(name)
    b = Box(name, x, y)
    TOP_LAYER.append(f'<rect x="{b.left:.1f}" y="{b.top:.1f}" width="{b.w:.1f}" height="{b.h:.1f}" fill="{FILL}" stroke="#1f1f1f" stroke-width="1.5"/>')
    TOP_LAYER.append(t(b.x, b.y + 0.5, name, NAME_SIZE, "bold"))
    return b


def diamond(label: str, x: float, y: float, half_w: float = 62, half_h: float = 38) -> tuple[float, float, float, float]:
    """A relationship diamond; returns (left x, right x, top y, bottom y)."""
    pts = [(x, y - half_h), (x + half_w, y), (x, y + half_h), (x - half_w, y)]
    TOP_LAYER.append(f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}" fill="#fff" stroke="#000" stroke-width="1.4"/>')
    words = label.split(" ")
    if len(label) > 9 and len(words) > 1:
        cut = (len(words) + 1) // 2
        TOP_LAYER.append(t(x, y - 9, " ".join(words[:cut]), REL_SIZE))
        TOP_LAYER.append(t(x, y + 10, " ".join(words[cut:]), REL_SIZE))
    else:
        TOP_LAYER.append(t(x, y + 0.5, label, REL_SIZE))
    return x - half_w, x + half_w, y - half_h, y + half_h


LOWEST = [0.0]


def oval(cx: float, cy: float, w: float, label: str) -> None:
    LOWEST[0] = max(LOWEST[0], cy + OVAL_H / 2)
    TOP_LAYER.append(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{w / 2:.1f}" ry="{OVAL_H / 2}" fill="#fff" stroke="#000" stroke-width="1.2"/>')
    TOP_LAYER.append(t(cx, cy + 0.5, label, ATTR_SIZE))


def hanging_attributes(b: Box) -> tuple[float, float]:
    """Ovals stacked under the table off a line down its left side. Returns (line x, last oval y)."""
    attrs = A[b.name]
    w = oval_w(attrs)
    spine = b.left + 12
    cx = spine + 14 + w / 2
    y = b.bottom + 14 + OVAL_H / 2
    last = y
    for a in attrs:
        oval(cx, y, w, a)
        line([(spine, y), (cx - w / 2, y)], 1.1)
        last = y
        y += OVAL_PITCH
    line([(spine, b.bottom), (spine, last)], 1.1)
    return spine, last


def fanned_attributes(b: Box, side: str, top: float) -> None:
    """Ovals stacked beside the table, each joined to the table's nearest edge."""
    attrs = A[b.name]
    w = oval_w(attrs)
    cx = b.left - 60 - w / 2 if side == "left" else b.right + 60 + w / 2
    edge_x = b.left if side == "left" else b.right
    for i, a in enumerate(attrs):
        y = top + i * OVAL_PITCH
        oval(cx, y, w, a)
        ty = b.top + 6 + (b.h - 12) * (i / max(1, len(attrs) - 1))
        line([(cx + w / 2 if side == "left" else cx - w / 2, y), (edge_x, ty)], 1.1)


def child(bus_y: float, x: float, label: str, entity_y: float, name: str, upper: str = "1", lower: str = "N") -> tuple[Box, float, float]:
    """A child under a horizontal connector: drop, diamond, drop, table, hanging attributes.
    Returns the table and its attribute line (x, last y), for a grandchild to hang from."""
    _, _, top, bottom = diamond(label, x, (bus_y + entity_y) / 2 - 6)
    line([(x, bus_y), (x, top)])
    card(x + 12, bus_y + 16, upper)
    b = entity(name, x, entity_y)
    line([(x, bottom), (x, b.top)])
    card(x + 12, b.top - 16, lower)
    spine, last = hanging_attributes(b)
    return b, spine, last


def grandchild(spine: float, last: float, label: str, name: str, upper: str = "1", lower: str = "N") -> float:
    """A child hung from the end of its parent's attribute line: the line carries on down to a diamond,
    and the child sits beside it with its attributes fanned to the right (as the manuscript draws
    suggestion_feedback). Returns the right edge of what was drawn."""
    dy = last + 80
    _, right, top, _ = diamond(label, spine, dy)
    line([(spine, last), (spine, top)])
    card(spine + 12, last + 22, upper)
    b = entity(name, right + 70 + Box(name, 0, 0).w / 2, dy)
    line([(right, dy), (b.left, dy)])
    card(b.left - 14, dy - 12, lower)
    n = len(A[name])
    fanned_attributes(b, "right", top=dy - (n - 1) * OVAL_PITCH / 2)
    return b.right + 60 + oval_w(A[name])


def grandchild_below(b: Box, last: float, label: str, name: str, upper: str = "1", lower: str = "N") -> None:
    """A child hung straight under its parent's column: a drop past the attributes, a diamond, the table,
    and its own hanging attributes, so it stays inside the parent's column."""
    x = max(b.left + 26 + oval_w(A[b.name]) + 22, b.right + 18)
    dy = last + 70
    _, _, top, bottom = diamond(label, x, dy)
    line([(b.right, b.y), (x, b.y), (x, top)])
    card(x + 12, top - 16, upper)
    c = entity(name, x, bottom + 50)
    line([(x, bottom), (x, c.top)])
    card(x + 12, c.top - 16, lower)
    hanging_attributes(c)


def column_width(name: str) -> float:
    """Horizontal room a child column needs: its table or its attribute ovals, whichever is wider."""
    return max(Box(name, 0, 0).w, oval_w(A[name]) + 26)


def row_positions(names: list[str], start: float, gap: float = 34) -> list[float]:
    xs: list[float] = []
    x = start
    for i, name in enumerate(names):
        w = column_width(name)
        if i == 0:
            x = start + w / 2
        else:
            x += (column_width(names[i - 1]) + w) / 2 + gap
        xs.append(x)
    return xs


def build() -> tuple[float, float]:
    # ── Top: users with its profile and role; users own documents; documents placed in folders ───────
    users = entity("users", 760, 560)
    fanned_attributes(users, "left", top=482)
    up = entity("user_profiles", 760, 150)
    fanned_attributes(up, "left", top=26)
    _, _, ht, hb = diamond("has", 760, 380, 50, 32)
    line([(760, up.bottom), (760, ht)])
    card(772, up.bottom + 14, "1")
    line([(760, hb), (760, users.top)])
    card(772, users.top - 14, "1")
    roles = entity("roles", 1190, 150)
    rw = oval_w(A["roles"])
    for i, a in enumerate(A["roles"]):
        ox = roles.x - 90 + i * 180
        oval(ox, 62, rw, a)
        line([(ox, 62 + OVAL_H / 2), (roles.x - 40 + i * 80, roles.top)], 1.1)
    l, r, _, _ = diamond("assigned to", 975, 150)
    line([(roles.left, 150), (r, 150)])
    card(roles.left - 14, 138, "1")
    line([(l, 150), (up.right, 150)])
    card(up.right + 14, 138, "N")

    docs = entity("documents", 1580, 560)
    fanned_attributes(docs, "right", top=340)
    l, r, _, _ = diamond("owns", 1170, 560)
    line([(users.right, 560), (l, 560)])
    card(users.right + 14, 548, "1")
    line([(r, 560), (docs.left, 560)])
    card(docs.left - 14, 548, "N")

    folders = entity("folders", 2600, 300)
    fanned_attributes(folders, "right", top=148)
    l, r, _, pb = diamond("placed in", 2150, 300)
    line([(docs.x - 30, docs.top), (docs.x - 30, 300), (l, 300)])
    card(docs.x - 18, docs.top - 14, "M")
    line([(r, 300), (folders.left, 300)])
    card(folders.left - 14, 288, "N")
    fd = entity("folder_documents", 2150, 420)
    line([(2150, pb), (2150, fd.top)])
    hanging_attributes(fd)
    # Folders nest (above), and enroll students in a class (below).
    l, r, _, _ = diamond("contains", 2380, 140, 58, 34)
    line([(folders.left + 20, folders.top), (folders.left + 20, 140), (r, 140)])
    card(folders.left + 32, folders.top - 14, "1")
    line([(l, 140), (2290, 140), (2290, 88), (folders.x + 40, 88), (folders.x + 40, folders.top)])
    card(folders.x + 52, folders.top - 14, "N")
    _, _, et, eb = diamond("enrolls", folders.x, 470, 56, 34)
    line([(folders.x, folders.bottom), (folders.x, et)])
    card(folders.x + 12, folders.bottom + 14, "1")
    ce = entity("class_enrollments", folders.x, 600)
    line([(folders.x, eb), (folders.x, ce.top)])
    card(folders.x + 12, ce.top - 14, "N")
    hanging_attributes(ce)

    # ── users' children: a first row, then a second row reached down the left edge ────────────────
    bus1, row1 = 780, 960
    kids1 = [("google_tokens", "authorizes", "1"), ("notifications", "receives", "N"), ("reports", "generates", "N"),
             ("format_bindings", "defines", "N"), ("personalization_settings", "customizes", "N"),
             ("prediction_feedback", "gives", "N"), ("formatting_actions", "performs", "N")]
    xs1 = row_positions([k[0] for k in kids1], 90)
    line([(users.x, users.bottom), (users.x, bus1)])
    line([(50, bus1), (xs1[-1], bus1)])
    for x, (name, label, lower) in zip(xs1, kids1):
        child(bus1, x, label, row1, name, "1", lower)
    bus2, row2 = 1420, 1600
    _, s1, last = child(bus2, 170, "receives", row2, "ai_suggestions")
    end = grandchild(s1, last, "answered by", "suggestion_feedback")
    gx = max(end + 40, 790)
    child(bus2, gx, "has", row2, "grammar_issues")
    px = gx + 260
    _, s2, last = child(bus2, px, "runs", row2, "plagiarism_scans")
    grandchild(s2, last, "finds", "plagiarism_matches")
    line([(50, bus1), (50, bus2), (px, bus2)])

    # ── documents' children: a first row, then a second row reached down the right edge ────────────
    dbus1 = 830
    dkids = [("formatting_presets", "follows", "N", "1"), ("document_tabs", "divided into", "1", "N"),
             ("document_versions", "saved as", "1", "N"), ("document_shares", "shared through", "1", "N"),
             ("document_comments", "receives", "1", "N"), ("document_reviews", "graded in", "1", "N"),
             ("stored_images", "contains", "1", "N"), ("document_embeddings", "indexed as", "1", "N")]
    dxs = row_positions([k[0] for k in dkids], xs1[-1] + column_width(kids1[-1][0]) / 2 + 50)
    line([(docs.x, docs.bottom), (docs.x, dbus1), (dxs[-1], dbus1)])
    for x, (name, label, upper, lower) in zip(dxs, dkids):
        b, s, last = child(dbus1, x, label, 1010, name, upper, lower)
        if name == "formatting_presets":
            grandchild_below(b, last, "forked into", "user_presets")
    right_edge = dxs[-1] + column_width(dkids[-1][0]) / 2 + 40
    dbus2 = 1470
    p1 = dxs[3]
    p2 = p1 + column_width("document_pins") + 40
    line([(dxs[-1], dbus1), (right_edge, dbus1), (right_edge, dbus2), (p1, dbus2)])
    child(dbus2, p1, "pinned in", 1650, "document_pins")
    child(dbus2, p2, "opened in", 1650, "document_opens")
    return right_edge + 40, LOWEST[0] + 40


def render_svg() -> str:
    width, height = build()
    missing = set(A) - DRAWN
    assert not missing, f"tables not drawn: {missing}"
    frame = f'<rect x="8" y="8" width="{width - 16}" height="{height - 16}" fill="none" stroke="#000" stroke-width="2"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
            f'<rect width="100%" height="100%" fill="#fff"/>{"".join(SVG)}{"".join(TOP_LAYER)}{frame}</svg>')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=4.0, help="device pixels per CSS pixel in the PNG")
    args = parser.parse_args()
    svg = render_svg()
    (HERE / "erd_chen.svg").write_text(svg, encoding="utf-8")
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel="chrome")
        page = browser.new_context(device_scale_factor=args.scale).new_page()
        page.set_content(f'<html><body style="margin:0;background:#fff">{svg}</body></html>')
        page.evaluate("document.fonts.ready.then(() => true)")
        page.locator("svg").screenshot(path=str(HERE / "erd_chen.png"))
        browser.close()
    print(f"wrote erd_chen.svg and erd_chen.png ({len(DRAWN)} tables)")


if __name__ == "__main__":
    main()
