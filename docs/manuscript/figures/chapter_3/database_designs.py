"""Database design figures of IntelliDocs (Figures 36-38), drawn from the code.

usage: ml/venv/Scripts/python docs/manuscript/figures/chapter_3/database_designs.py [--scale 4]

Writes:
- db_supabase_accounts, db_supabase_documents, db_supabase_classes, db_supabase_learning: the 29 tables of the
  Supabase public schema (the tester-only `reviews` table is left out) as table boxes with every column, its
  key and its type, read from the migrations (schema_from_migrations.py), in four areas. Each figure draws the
  relationships inside its area; a table from another area appears as a small stub with its key.
- db_redis: the Redis key design, from server/src/models and utils (key pattern, data type, contents, expiry).
- db_duckdb: the two DuckDB tables (ml/aggregator.py, ml/feature_extractor.py) and how they are filled.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from html import escape
from pathlib import Path

from schema_from_migrations import load_schema

HERE = Path(__file__).resolve().parent
FONT = "'Times New Roman', Times, serif"
FILL = "#cfe2f3"
ROW = 19
HEAD = 26
SCHEMA = load_schema()
# Supabase's own auth.users, as the app reads it.
SCHEMA["users"] = [("id", "uuid", "PK"), ("email", "varchar", ""), ("phone", "text", ""),
                   ("created_at", "timestamptz", ""), ("last_sign_in_at", "timestamptz", "")]


class Canvas:
    def __init__(self) -> None:
        self.back: list[str] = []
        self.front: list[str] = []

    def text(self, x: float, y: float, s: str, size: float = 12.5, weight: str = "normal", anchor: str = "middle",
             italic: bool = False, front: bool = True) -> None:
        style = ' font-style="italic"' if italic else ""
        (self.front if front else self.back).append(
            f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}"{style} '
            f'text-anchor="{anchor}" dominant-baseline="central">{escape(s)}</text>')

    def rect(self, x: float, y: float, w: float, h: float, fill: str = "#fff", width: float = 1.4) -> None:
        self.front.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{fill}" stroke="#000" stroke-width="{width}"/>')

    def line(self, points: list[tuple[float, float]], dashed: bool = False, head: bool = False) -> None:
        dash = ' stroke-dasharray="6 4"' if dashed else ""
        marker = ' marker-end="url(#head)"' if head else ""
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
        self.back.append(f'<polyline points="{pts}" fill="none" stroke="#000" stroke-width="1.3"{dash}{marker}/>')


@dataclass
class Box:
    table: str
    x: float
    y: float
    w: float
    rows: list[tuple[str, str, str]]

    @property
    def h(self) -> float:
        return HEAD + len(self.rows) * ROW

    def row_y(self, column: str) -> float:
        for i, (name, _, _) in enumerate(self.rows):
            if name == column:
                return self.y + HEAD + i * ROW + ROW / 2
        return self.y + HEAD / 2


def table_box(c: Canvas, table: str, x: float, y: float, w: float = 290, only: list[str] | None = None) -> Box:
    rows = SCHEMA[table] if only is None else [r for r in SCHEMA[table] if r[0] in only]
    box = Box(table, x, y, w, rows)
    c.rect(x, y, w, HEAD, FILL)
    c.text(x + w / 2, y + HEAD / 2, table + (" (stub)" if only is not None else ""), 13.5, "bold")
    c.rect(x, y + HEAD, w, len(rows) * ROW)
    for i, (name, kind, keys) in enumerate(rows):
        ry = y + HEAD + i * ROW + ROW / 2
        if i:
            c.front.append(f'<line x1="{x:.1f}" y1="{ry - ROW / 2:.1f}" x2="{x + w:.1f}" y2="{ry - ROW / 2:.1f}" stroke="#bbb" stroke-width="0.7"/>')
        c.text(x + 8, ry, name, 12, anchor="start")
        c.text(x + w * 0.58, ry, keys, 11.5, "bold")
        c.text(x + w - 8, ry, kind, 11.5, anchor="end")
    return box


def link(c: Canvas, child: Box, column: str, parent: Box, parent_column: str, via: float | None = None) -> None:
    """child.column (many) -> parent.parent_column (one), as an elbow line between facing sides."""
    cy, py = child.row_y(column), parent.row_y(parent_column)
    if child.x > parent.x + parent.w:
        cx, px = child.x, parent.x + parent.w
    elif child.x + child.w < parent.x:
        cx, px = child.x + child.w, parent.x
    else:  # stacked in one column: around the left side, or the right side when `via` is to the right
        right = via is not None and via > child.x + child.w
        cx, px = (child.x + child.w, parent.x + parent.w) if right else (child.x, parent.x)
        mid = via if via is not None else min(child.x, parent.x) - 22
        c.line([(cx, cy), (mid, cy), (mid, py), (px, py)])
        offset = 8 if right else -8
        c.text(cx + offset, cy - 8, "N", 12, "bold")
        c.text(px + offset, py - 8, "1", 12, "bold")
        return
    mid = via if via is not None else (cx + px) / 2
    c.line([(cx, cy), (mid, cy), (mid, py), (px, py)])
    sign = 1 if px > cx else -1
    c.text(cx + sign * 9, cy - 8, "N", 12, "bold")
    c.text(px - sign * 9, py - 8, "1", 12, "bold")


def note(c: Canvas, x: float, y: float, lines: list[str]) -> None:
    for i, row in enumerate(lines):
        c.text(x, y + i * 17, row, 12.5, italic=True, anchor="start")


# ── Supabase, area by area ──────────────────────────────────────────────────

def supabase_accounts() -> tuple[Canvas, float, float]:
    c = Canvas()
    users = table_box(c, "users", 420, 40)
    roles = table_box(c, "roles", 40, 40)
    profiles = table_box(c, "user_profiles", 40, 170)
    tokens = table_box(c, "google_tokens", 800, 40)
    notes = table_box(c, "notifications", 800, 230)
    personal = table_box(c, "personalization_settings", 420, 260)
    reports = table_box(c, "reports", 420, 420)
    link(c, profiles, "role_id", roles, "role_id")
    link(c, profiles, "user_id", users, "id", via=380)
    link(c, profiles, "decided_by", users, "id", via=395)
    link(c, tokens, "user_id", users, "id")
    link(c, notes, "user_id", users, "id", via=760)
    link(c, personal, "user_id", users, "id")
    link(c, reports, "generated_by", users, "id", via=400)
    return c, 1130, 590


def supabase_documents() -> tuple[Canvas, float, float]:
    c = Canvas()
    users = table_box(c, "users", 40, 40, 230, only=["id"])
    docs = table_box(c, "documents", 360, 40, 300)
    tabs = table_box(c, "document_tabs", 40, 160, 270)
    versions = table_box(c, "document_versions", 40, 460, 270)
    images = table_box(c, "stored_images", 40, 860, 270)
    shares = table_box(c, "document_shares", 760, 40, 280)
    comments = table_box(c, "document_comments", 760, 220, 280)
    pins = table_box(c, "document_pins", 760, 380, 280)
    opens = table_box(c, "document_opens", 760, 490, 280)
    folders = table_box(c, "folders", 760, 640, 280)
    fdocs = table_box(c, "folder_documents", 360, 760, 300)
    link(c, docs, "user_id", users, "id")
    link(c, tabs, "document_id", docs, "id")
    link(c, versions, "document_id", docs, "id", via=335)
    link(c, images, "document_id", docs, "id", via=345)
    for box in (shares, comments, pins, opens):
        link(c, box, "document_id", docs, "id", via=700 + [shares, comments, pins, opens].index(box) * 12)
    link(c, fdocs, "document_id", docs, "id", via=690)
    link(c, fdocs, "folder_id", folders, "folder_id")
    link(c, folders, "parent_id", folders, "folder_id", via=1080)
    return c, 1100, 1040


def supabase_classes() -> tuple[Canvas, float, float]:
    c = Canvas()
    users = table_box(c, "users", 40, 40, 230, only=["id"])
    docs = table_box(c, "documents", 40, 160, 230, only=["id", "user_id"])
    folders = table_box(c, "folders", 380, 40, 290)
    enroll = table_box(c, "class_enrollments", 760, 40, 280)
    reviews = table_box(c, "document_reviews", 380, 340, 290)
    scans = table_box(c, "plagiarism_scans", 760, 200, 300)
    matches = table_box(c, "plagiarism_matches", 760, 520, 300)
    embeds = table_box(c, "document_embeddings", 380, 560, 290)
    link(c, enroll, "folder_id", folders, "folder_id")
    link(c, enroll, "student_id", users, "id", via=720)
    link(c, reviews, "document_id", docs, "id")
    link(c, reviews, "student_id", users, "id", via=330)
    link(c, scans, "folder_id", folders, "folder_id", via=715)
    link(c, matches, "scan_id", scans, "scan_id", via=1090)
    link(c, embeds, "document_id", docs, "id", via=320)
    link(c, embeds, "folder_id", folders, "folder_id", via=345)
    return c, 1100, 900


def supabase_learning() -> tuple[Canvas, float, float]:
    c = Canvas()
    docs = table_box(c, "documents", 40, 40, 230, only=["id", "user_id", "formatting_preset"])
    presets = table_box(c, "formatting_presets", 40, 200, 260)
    upresets = table_box(c, "user_presets", 40, 420, 260)
    bindings = table_box(c, "format_bindings", 40, 690, 260)
    actions = table_box(c, "formatting_actions", 390, 40, 280)
    suggestions = table_box(c, "ai_suggestions", 390, 250, 280)
    feedback = table_box(c, "suggestion_feedback", 390, 510, 280)
    grammar = table_box(c, "grammar_issues", 760, 40, 280)
    predictions = table_box(c, "prediction_feedback", 760, 290, 280)
    link(c, actions, "document_id", docs, "id")
    link(c, suggestions, "document_id", docs, "id", via=330)
    link(c, feedback, "suggestion_id", suggestions, "suggestion_id", via=365)
    link(c, grammar, "document_id", docs, "id", via=720)
    link(c, predictions, "document_id", docs, "id", via=735)
    # Linked by key, not by a foreign key: a document names its preset, a user preset its base.
    c.line([(40, docs.row_y("formatting_preset")), (22, docs.row_y("formatting_preset")), (22, presets.row_y("key")), (40, presets.row_y("key"))], dashed=True)
    c.line([(40, upresets.row_y("base_key")), (14, upresets.row_y("base_key")), (14, presets.row_y("key")), (40, presets.row_y("key"))], dashed=True)
    return c, 1080, 870


# ── Redis ───────────────────────────────────────────────────────────────────

REDIS = [
    ("Behavior learning", [
        ("behavior:{user}:{document}", "List", "editor events (action, time, payload, genre)", "none; drained into DuckDB"),
        ("behavior:formats:{user}:{genre}", "String (JSON)", "learned text-to-format patterns", "60 days"),
    ]),
    ("Caches", [
        ("doc:cache:{document}", "String (JSON)", "a document's settings, for fast reads", "1 hour"),
        ("version:{document}:last", "String", "time of the last version snapshot", "1 hour"),
        ("ai:suggestions:{user}:{genre}:{text}", "String (JSON)", "a formatting suggestion", "30 seconds"),
        ("citations:search:{source}:{rows}:{query}", "String (JSON)", "Crossref / Semantic Scholar results", "24 hours"),
    ]),
    ("AI assistant", [
        ("ai:quota:{scope}:{user}", "Counter", "AI requests in the current window (30 allowed)", "60 seconds"),
        ("ai:route:{user}:{request}", "String (JSON)", "the tool the assistant chose for a request", "7 days"),
        ("ai:route:outcomes:{date}", "List", "whether each chosen tool was applied", "30 days"),
    ]),
    ("Google Drive imports", [
        ("drive:import:job:{job}", "String (JSON)", "an import job's state and progress", "1 hour"),
        ("drive:import:jobs:{user}", "List", "a user's import job ids", "1 hour"),
        ("drive:import:queue", "List", "job ids waiting to be converted", "1 hour"),
    ]),
    ("Abuse limits", [
        ("join-code:{user}", "Counter", "share and class code attempts (10 allowed)", "15 minutes"),
        ("web-check:{user}", "Counter", "online originality checks (10 allowed)", "1 hour"),
    ]),
]


def redis_design() -> tuple[Canvas, float, float]:
    c = Canvas()
    cols = [(40, 330, "Key pattern"), (370, 130, "Data type"), (500, 330, "Holds"), (830, 190, "Expires")]
    width = 1060
    y = 30
    c.rect(40, y, width - 80, 30, FILL)
    for x, w, title in cols:
        c.text(x + 8, y + 15, title, 13.5, "bold", anchor="start")
    y += 30
    for group, keys in REDIS:
        c.rect(40, y, width - 80, 24, "#eef3f9")
        c.text(48, y + 12, group, 13, "bold", anchor="start", italic=True)
        y += 24
        for key, kind, holds, expires in keys:
            c.rect(40, y, width - 80, 24)
            for (x, w, _), value in zip(cols, (key, kind, holds, expires)):
                c.text(x + 8, y + 12, value, 12.5, anchor="start")
            y += 24
    for x, _, _ in cols[1:]:
        c.front.append(f'<line x1="{x:.1f}" y1="30" x2="{x:.1f}" y2="{y:.1f}" stroke="#000" stroke-width="1"/>')
    return c, width, y + 24


# ── DuckDB ──────────────────────────────────────────────────────────────────

DUCKDB = {
    "behavior_events": [("user_id", "text", ""), ("document_id", "text", ""), ("genre", "text", ""), ("action", "text", ""),
                        ("event_ts", "timestamp", ""), ("event_ts_raw", "text", ""), ("payload", "text (JSON)", ""),
                        ("block_id", "text", ""), ("source_key", "text", ""), ("ingested_at", "timestamp", "")],
    "formatting_features": [("user_id", "text", ""), ("document_id", "text", ""), ("genre", "text", ""),
                            ("total_events", "integer", ""), ("bold_count ... code_block_count", "integer x 10", ""),
                            ("table_insert_count ... code_block_insert_count", "integer x 12", ""),
                            ("avg_image_width, avg_image_height", "double", ""), ("max_table_rows, max_table_cols", "double", ""),
                            ("last_action", "text", ""), ("last_event_ts", "timestamp", ""),
                            ("window_start, window_end", "timestamp", ""), ("ingested_at", "timestamp", "")],
}


def duckdb_design() -> tuple[Canvas, float, float]:
    c = Canvas()
    SCHEMA.update(DUCKDB)
    c.rect(40, 70, 230, 70)
    c.text(155, 95, "Redis", 14, "bold")
    c.text(155, 116, "behavior:{user}:{document} lists", 12)
    events = table_box(c, "behavior_events", 340, 40, 320)
    features = table_box(c, "formatting_features", 740, 40, 400)
    c.line([(270, 105), (340, 105)], head=True)
    c.text(305, 92, "aggregator", 12, italic=True)
    c.line([(660, events.row_y("action")), (740, events.row_y("action"))], head=True)
    c.text(700, events.row_y("action") - 44, "grouped by", 12, italic=True)
    c.text(700, events.row_y("action") - 30, "user, genre,", 12, italic=True)
    c.text(700, events.row_y("action") - 16, "document", 12, italic=True)
    return c, 1180, 300


def render_svg(c: Canvas, width: float, height: float) -> str:
    defs = ('<defs><marker id="head" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="8" markerHeight="8" orient="auto">'
            '<path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker></defs>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" viewBox="0 0 {width:.0f} {height:.0f}">'
            f'<rect width="100%" height="100%" fill="#fff"/>{defs}{"".join(c.back)}{"".join(c.front)}</svg>')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=4.0, help="device pixels per CSS pixel in the PNG")
    args = parser.parse_args()
    figures = {
        "db_supabase_accounts": supabase_accounts(), "db_supabase_documents": supabase_documents(),
        "db_supabase_classes": supabase_classes(), "db_supabase_learning": supabase_learning(),
        "db_redis": redis_design(), "db_duckdb": duckdb_design(),
    }
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel="chrome")
        page = browser.new_context(device_scale_factor=args.scale).new_page()
        for name, (canvas, width, height) in figures.items():
            svg = render_svg(canvas, width, height)
            (HERE / f"{name}.svg").write_text(svg, encoding="utf-8")
            page.set_content(f'<html><body style="margin:0;background:#fff">{svg}</body></html>')
            page.evaluate("document.fonts.ready.then(() => true)")
            page.locator("svg").screenshot(path=str(HERE / f"{name}.png"))
            print(f"wrote {name}.svg and .png")
        browser.close()


if __name__ == "__main__":
    main()
