"""Network figures of IntelliDocs (Figures 40-42): design, model and topology, drawn from the deployment.

usage: ml/venv/Scripts/python docs/manuscript/figures/chapter_3/network.py [--scale 4]

Writes network_design, network_model and network_topology (.svg and .png), black and white with simple drawn
icons. What runs where (render.yaml, frontend/vercel.json, the .env.example files, server/src):
- The React app is served by Vercel; the browser signs in with Supabase Auth (VITE_SUPABASE_URL) and calls
  the API server (VITE_API_URL) over HTTPS, plus a WebSocket for live co-editing (server/src/collaboration).
- The API server (Node.js + Express, Docker on Render) screens requests with Arcjet and reaches Supabase
  (PostgreSQL, Storage), Cloudflare R2 (pictures), Upstash Redis, the ML service, the AI providers (Gemini,
  Groq, OpenRouter: AI_PROVIDER_n), Google APIs (OAuth, Drive, Picker) and scholarly / web search (Crossref,
  OpenAlex, Semantic Scholar, Brave Search).
- The ML service (FastAPI, Docker on Render) uses DuckDB on MotherDuck, Upstash Redis (behavior events),
  Supabase Storage (models) and the AI providers (the originality council's judges).
Billing is a mock (no payment provider), so no payment node is drawn.
"""

from __future__ import annotations

import argparse
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONT = "'Times New Roman', Times, serif"


class Canvas:
    def __init__(self) -> None:
        self.svg: list[str] = []

    def add(self, s: str) -> None:
        self.svg.append(s)

    def text(self, x: float, y: float, s: str, size: float = 14, weight: str = "normal", italic: bool = False, anchor: str = "middle") -> None:
        style = ' font-style="italic"' if italic else ""
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}"{style} '
                 f'text-anchor="{anchor}" dominant-baseline="central">{escape(s)}</text>')

    def lines(self, x: float, y: float, rows: list[str], size: float = 14, bold_first: bool = True) -> None:
        for i, row in enumerate(rows):
            self.text(x, y + i * (size + 4), row, size if i else size + 1.5, "bold" if bold_first and i == 0 else "normal")

    def arrow(self, x1: float, y1: float, x2: float, y2: float, both: bool = False, dashed: bool = False, width: float = 1.8) -> None:
        dash = ' stroke-dasharray="7 5"' if dashed else ""
        start = ' marker-start="url(#head)"' if both else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#000" stroke-width="{width}"{dash} '
                 f'marker-end="url(#head)"{start}/>')

    # ── Icons, each centred on (x, y) and about `s` tall ──────────────────────
    def person(self, x: float, y: float, s: float = 70) -> None:
        r = s * 0.2
        self.add(f'<circle cx="{x}" cy="{y - s * 0.22:.1f}" r="{r:.1f}" fill="#fff" stroke="#000" stroke-width="3"/>')
        self.add(f'<path d="M{x - s * 0.36:.1f},{y + s * 0.45:.1f} Q{x - s * 0.36:.1f},{y + s * 0.05:.1f} {x:.1f},{y + s * 0.05:.1f} '
                 f'Q{x + s * 0.36:.1f},{y + s * 0.05:.1f} {x + s * 0.36:.1f},{y + s * 0.45:.1f}" fill="#fff" stroke="#000" stroke-width="3"/>')

    def laptop(self, x: float, y: float, s: float = 70) -> None:
        w, h = s * 1.15, s * 0.7
        self.add(f'<rect x="{x - w / 2:.1f}" y="{y - h / 2 - s * 0.1:.1f}" width="{w:.1f}" height="{h:.1f}" rx="4" fill="#fff" stroke="#000" stroke-width="3"/>')
        self.add(f'<rect x="{x - w / 2 + 7:.1f}" y="{y - h / 2 - s * 0.1 + 7:.1f}" width="{w - 14:.1f}" height="{h - 14:.1f}" fill="none" stroke="#000" stroke-width="1.5"/>')
        b = y + h / 2 - s * 0.1
        self.add(f'<path d="M{x - w / 2 - 10:.1f},{b + 14:.1f} L{x - w / 2:.1f},{b:.1f} L{x + w / 2:.1f},{b:.1f} L{x + w / 2 + 10:.1f},{b + 14:.1f} Z" '
                 'fill="#fff" stroke="#000" stroke-width="3" stroke-linejoin="round"/>')

    def globe(self, x: float, y: float, s: float = 70) -> None:
        r = s / 2
        self.add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" stroke="#000" stroke-width="3"/>')
        self.add(f'<ellipse cx="{x}" cy="{y}" rx="{r * 0.45:.1f}" ry="{r}" fill="none" stroke="#000" stroke-width="2"/>')
        for dy in (-r * 0.5, 0, r * 0.5):
            half = (r * r - dy * dy) ** 0.5
            self.add(f'<line x1="{x - half:.1f}" y1="{y + dy:.1f}" x2="{x + half:.1f}" y2="{y + dy:.1f}" stroke="#000" stroke-width="2"/>')

    def cloud(self, x: float, y: float, s: float = 70) -> None:
        w = s * 1.5
        self.add(f'<path d="M{x - w * 0.42:.1f},{y + s * 0.3:.1f} a{s * 0.26:.1f},{s * 0.26:.1f} 0 0 1 {s * 0.05:.1f},-{s * 0.5:.1f} '
                 f'a{s * 0.34:.1f},{s * 0.34:.1f} 0 0 1 {s * 0.62:.1f},-{s * 0.12:.1f} a{s * 0.26:.1f},{s * 0.26:.1f} 0 0 1 {s * 0.42:.1f},{s * 0.2:.1f} '
                 f'a{s * 0.22:.1f},{s * 0.22:.1f} 0 0 1 {s * 0.04:.1f},{s * 0.42:.1f} Z" fill="#fff" stroke="#000" stroke-width="3" stroke-linejoin="round"/>')

    def server(self, x: float, y: float, s: float = 70) -> None:
        w, unit = s * 0.9, s * 0.3
        for i in range(3):
            top = y - s / 2 + i * (unit + 3)
            self.add(f'<rect x="{x - w / 2:.1f}" y="{top:.1f}" width="{w:.1f}" height="{unit:.1f}" rx="3" fill="#fff" stroke="#000" stroke-width="2.5"/>')
            self.add(f'<circle cx="{x + w / 2 - 10:.1f}" cy="{top + unit / 2:.1f}" r="3" fill="#000"/>')
            self.add(f'<line x1="{x - w / 2 + 8:.1f}" y1="{top + unit / 2:.1f}" x2="{x - w / 2 + 28:.1f}" y2="{top + unit / 2:.1f}" stroke="#000" stroke-width="2"/>')

    def database(self, x: float, y: float, s: float = 70) -> None:
        w, ry = s * 0.8, s * 0.12
        top, bottom = y - s / 2 + ry, y + s / 2 - ry
        self.add(f'<path d="M{x - w / 2:.1f},{top:.1f} L{x - w / 2:.1f},{bottom:.1f} A{w / 2:.1f},{ry:.1f} 0 0 0 {x + w / 2:.1f},{bottom:.1f} '
                 f'L{x + w / 2:.1f},{top:.1f}" fill="#fff" stroke="#000" stroke-width="2.5"/>')
        for yy in (top + (bottom - top) / 3, top + 2 * (bottom - top) / 3):
            self.add(f'<path d="M{x - w / 2:.1f},{yy:.1f} A{w / 2:.1f},{ry:.1f} 0 0 0 {x + w / 2:.1f},{yy:.1f}" fill="none" stroke="#000" stroke-width="2"/>')
        self.add(f'<ellipse cx="{x}" cy="{top:.1f}" rx="{w / 2:.1f}" ry="{ry:.1f}" fill="#fff" stroke="#000" stroke-width="2.5"/>')

    def browser(self, x: float, y: float, s: float = 70) -> None:
        w, h = s * 1.1, s * 0.8
        self.add(f'<rect x="{x - w / 2:.1f}" y="{y - h / 2:.1f}" width="{w:.1f}" height="{h:.1f}" rx="4" fill="#fff" stroke="#000" stroke-width="2.5"/>')
        self.add(f'<line x1="{x - w / 2:.1f}" y1="{y - h / 2 + 14:.1f}" x2="{x + w / 2:.1f}" y2="{y - h / 2 + 14:.1f}" stroke="#000" stroke-width="2"/>')
        for i in range(3):
            self.add(f'<circle cx="{x - w / 2 + 8 + i * 8:.1f}" cy="{y - h / 2 + 7:.1f}" r="2.2" fill="#000"/>')
        for i, frac in enumerate((0.75, 0.55, 0.65)):
            yy = y - h / 2 + 26 + i * 11
            self.add(f'<line x1="{x - w / 2 + 9:.1f}" y1="{yy:.1f}" x2="{x - w / 2 + 9 + (w - 18) * frac:.1f}" y2="{yy:.1f}" stroke="#000" stroke-width="2"/>')

    def node(self, x: float, y: float, w: float, h: float, rows: list[str], size: float = 13) -> None:
        self.add(f'<rect x="{x - w / 2:.1f}" y="{y - h / 2:.1f}" width="{w}" height="{h}" rx="6" fill="#fff" stroke="#000" stroke-width="1.8"/>')
        top = y - (len(rows) - 1) * (size + 4) / 2
        self.lines(x, top, rows, size)


def design() -> tuple[Canvas, float, float]:
    """Figure 40: the user works in a web browser that talks to IntelliDocs' cloud services."""
    c = Canvas()
    c.person(110, 120, 90)
    c.text(110, 205, "User", 16, "bold")
    c.text(110, 226, "(student, professor,", 13)
    c.text(110, 243, "or administrator)", 13)
    c.laptop(420, 118, 100)
    c.text(420, 205, "Client", 16, "bold")
    c.text(420, 226, "web browser running", 13)
    c.text(420, 243, "the React app", 13)
    c.cloud(740, 130, 110)
    c.server(740, 128, 52)
    c.text(740, 205, "Cloud Services", 16, "bold")
    c.text(740, 226, "web app, API server, ML service,", 13)
    c.text(740, 243, "database and storage", 13)
    c.arrow(180, 120, 340, 120, both=True)
    c.text(260, 102, "uses", 13, italic=True)
    c.arrow(500, 120, 640, 120, both=True)
    c.text(570, 102, "HTTPS, WebSocket", 13, italic=True)
    return c, 900, 270


def model() -> tuple[Canvas, float, float]:
    """Figure 41: the user's device reaches the cloud over the Internet; the cloud hosts four parts."""
    c = Canvas()
    c.laptop(90, 250, 90)
    c.text(90, 320, "User Device", 15, "bold")
    c.text(90, 339, "(web browser)", 13)
    c.globe(290, 250, 80)
    c.text(290, 320, "Internet", 15, "bold")
    c.text(290, 339, "(HTTPS)", 13)
    c.cloud(490, 255, 105)
    c.text(490, 320, "Cloud", 15, "bold")
    c.arrow(150, 250, 238, 250, both=True)
    c.arrow(342, 250, 418, 250, both=True)
    parts = [
        (95, "browser", ["Web Application", "React app on Vercel"]),
        (205, "server", ["API Server", "Node.js + Express on Render"]),
        (315, "server", ["ML Service", "Python FastAPI on Render"]),
        (425, "database", ["Database and Storage", "Supabase (PostgreSQL, Auth,", "Storage), Upstash Redis,", "DuckDB on MotherDuck"]),
    ]
    for y, icon, rows in parts:
        getattr(c, icon)(700, y, 62)
        c.arrow(565, 255, 655, y if abs(y - 255) > 4 else 255, both=True)
        top = y - (len(rows) - 1) * 9
        for i, row in enumerate(rows):
            c.text(752, top + i * 18, row, 15 if i == 0 else 13.5, "bold" if i == 0 else "normal", anchor="start")
    return c, 1000, 490


def topology() -> tuple[Canvas, float, float]:
    """Figure 42: a star around the API server; clients load the app from Vercel and sign in with Supabase."""
    c = Canvas()

    def path(points: list[tuple[float, float]], dashed: bool = False) -> None:
        dash = ' stroke-dasharray="7 5"' if dashed else ""
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
        c.add(f'<polyline points="{pts}" fill="none" stroke="#000" stroke-width="1.8"{dash} '
              'marker-start="url(#head)" marker-end="url(#head)"/>')

    # Clients on one line.
    client_xs = [300, 500, 700]
    for x, label in zip(client_xs, ["Student", "Professor", "Administrator"]):
        c.laptop(x, 62, 70)
        c.text(x, 120, label, 14.5, "bold")
        c.text(x, 138, "web browser", 12.5)
        c.add(f'<line x1="{x}" y1="148" x2="{x}" y2="168" stroke="#000" stroke-width="1.8"/>')
    c.add('<line x1="300" y1="168" x2="800" y2="168" stroke="#000" stroke-width="1.8"/>')
    # The app's files and sign-in, straight from the browser.
    c.node(1090, 70, 290, 56, ["Vercel", "serves the React app"])
    c.node(1090, 168, 290, 56, ["Supabase Auth", "sign-in, sessions, two-factor"])
    path([(800, 168), (870, 168), (870, 70), (945, 70)])
    c.add('<line x1="870" y1="168" x2="945" y2="168" stroke="#000" stroke-width="1.8" marker-end="url(#head)"/>')
    c.text(878, 120, "HTTPS", 12.5, italic=True, anchor="start")

    # The hub.
    hub_x, hub_y = 500, 400
    c.server(hub_x, hub_y - 40, 62)
    c.node(hub_x, hub_y + 40, 310, 58, ["API Server (central hub)", "Node.js + Express, Docker on Render"])
    path([(480, 168), (480, hub_y - 72)])
    path([(520, 168), (520, hub_y - 72)], dashed=True)
    c.text(470, 235, "HTTPS (REST)", 12.5, italic=True, anchor="end")
    c.text(530, 235, "WebSocket (live", 12.5, italic=True, anchor="start")
    c.text(530, 252, "co-editing)", 12.5, italic=True, anchor="start")
    c.node(150, hub_y + 40, 210, 52, ["Arcjet", "request screening"], 12.5)
    path([(255, hub_y + 40), (345, hub_y + 40)])

    # External services to the right.
    for y, rows in [(300, ["Scholarly and Web Search", "Crossref, OpenAlex,", "Semantic Scholar, Brave"]),
                    (430, ["Google APIs", "OAuth, Drive, Picker"]),
                    (560, ["AI Providers", "Gemini, Groq, OpenRouter"])]:
        h = 74 if len(rows) == 3 else 56
        c.node(1090, y, 290, h, rows, 12.5)
        path([(hub_x + 155, hub_y + 40), (945, y)])

    # Data services below.
    row_y = 700
    below = [(160, ["Supabase", "PostgreSQL, Storage"]), (410, ["Cloudflare R2", "document pictures"]),
             (660, ["Upstash Redis", "events, caches, queues"]), (910, ["ML Service", "FastAPI, Docker on Render"])]
    for x, rows in below:
        c.node(x, row_y, 230, 58, rows, 12.5)
        path([(hub_x + (x - hub_x) * 0.3, hub_y + 69), (x, row_y - 29)])
    # The ML service's own links: DuckDB, the behavior events in Redis, the models in Supabase Storage, the AI judges.
    c.node(910, 850, 230, 56, ["DuckDB on MotherDuck", "behavior analytics"], 12.5)
    path([(910, row_y + 29), (910, 822)])
    path([(850, row_y + 29), (850, 770), (700, 770), (700, row_y + 29)], dashed=True)
    path([(880, row_y + 29), (880, 790), (160, 790), (160, row_y + 29)], dashed=True)
    path([(1025, row_y - 10), (1090, row_y - 10), (1090, 588)], dashed=True)
    c.text(775, 760, "behavior events", 12, italic=True)
    c.text(520, 803, "user models (Storage)", 12, italic=True)
    c.text(1098, 640, "council", 12, italic=True, anchor="start")
    c.text(1098, 656, "judges", 12, italic=True, anchor="start")

    return c, 1270, 900


def render_svg(canvas: Canvas, width: float, height: float) -> str:
    defs = ('<defs><marker id="head" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            '<path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker></defs>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" viewBox="0 0 {width:.0f} {height:.0f}">'
            f'<rect width="100%" height="100%" fill="#fff"/>{defs}{"".join(canvas.svg)}</svg>')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=4.0, help="device pixels per CSS pixel in the PNG")
    args = parser.parse_args()
    figures = {"network_design": design(), "network_model": model(), "network_topology": topology()}
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
