"""AI System Architecture of IntelliDocs (Figure 16), drawn from the code.

usage: ml/venv/Scripts/python docs/manuscript/figures/chapter_3/ai_architecture.py [--scale 4]

Keeps the manuscript's structure (a Presentation Layer and an API Layer feeding two parallel tracks that
meet at the Data Layer, then a Fine-tuner and personalized models closing the loop) and fills each layer
with what the system actually runs:

- Behavioral Pipeline: editor events -> POST /behavior/events -> Redis event lists per user and genre ->
  the ML service's aggregator (/pipeline/aggregate) -> DuckDB behavior features (server/src/models/
  behaviorModel.ts, ml/aggregator.py, ml/duckdb_store.py).
- ML Microservice (FastAPI, ml/src/main.py /predict): Tier 1 rules, Tier 2 RandomForest, Tier 3 DistilBERT
  INT8 ONNX when the RandomForest is unsure, then the user's LSTM (blended 0.7/0.3 in hybrid mode, alone in
  isolated mode). The same service checks grammar and spelling and runs the originality council.
- AI Chat (MCP): the assistant's requests go to the MCP router (server/src/mcp) whose tool registry reads,
  plans or suggests; nothing changes a document until the user presses Apply. Chat models: Gemini, Groq or
  OpenRouter, tried in failover order (server/src/ai/aiClient.ts).
- Fine-tuner (ML /fine-tune), started by the server's personalization trigger at 5 labeled blocks and every
  10 more (server/src/skills/personalizationTrigger.ts, after aggregating behavior into DuckDB): trains the user's own
  RandomForest per genre on their labeled blocks (accepted: the suggested format; rejected: the format the block
  kept) and their LSTM; both are kept in Supabase Storage and adjust the user's predictions after Tier 3.
"""

from __future__ import annotations

import argparse
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONT = "'Times New Roman', Times, serif"
WIDTH = 1100
SVG: list[str] = []


def text(x: float, y: float, s: str, size: float = 14, weight: str = "normal", anchor: str = "middle", italic: bool = False) -> None:
    style = ' font-style="italic"' if italic else ""
    SVG.append(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}"{style} '
               f'text-anchor="{anchor}" dominant-baseline="central">{escape(s)}</text>')


def box(x: float, y: float, w: float, h: float, title: str | None = None, lines: tuple[str, ...] = (),
        title_size: float = 17, line_size: float = 13.5, dashed: bool = False, fill: str = "#fff") -> tuple[float, float, float, float]:
    dash = ' stroke-dasharray="6 4"' if dashed else ""
    SVG.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="#000" stroke-width="1.5"{dash}/>')
    rows = ([title] if title else []) + list(lines)
    pitch = 19
    top = y + h / 2 - (len(rows) - 1) * pitch / 2
    for i, row in enumerate(rows):
        if i == 0 and title:
            text(x + w / 2, top, row, title_size, "bold")
        else:
            text(x + w / 2, top + i * pitch, row, line_size)
    return x, y, w, h


def arrow(points: list[tuple[float, float]], both: bool = False, label: str | None = None, label_at: tuple[float, float] | None = None,
          dashed: bool = False) -> None:
    dash = ' stroke-dasharray="6 4"' if dashed else ""
    start = ' marker-start="url(#head)"' if both else ""
    pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    SVG.append(f'<polyline points="{pts}" fill="none" stroke="#000" stroke-width="1.5"{dash} marker-end="url(#head)"{start}/>')
    if label and label_at:
        text(label_at[0], label_at[1], label, 12.5, italic=True)


def build() -> float:
    left_x, right_x, col_w = 40, 580, 480
    center = WIDTH / 2

    # Presentation and API layers, across the page.
    box(40, 20, 1020, 78, "Presentation Layer", ("React + TipTap editor: suggestion panel, AI Assistant chat, grammar underlines",))
    box(40, 140, 1020, 70, "API Layer", ("Express gateway: authentication, rate limits, routing to the two tracks",))
    arrow([(center, 98), (center, 140)], both=True)

    # Track headings.
    text(left_x + col_w / 2 - 12, 240, "Track 1: implicit behavior", 14, "bold", anchor="end", italic=True)
    text(right_x + col_w / 2 - 12, 240, "Track 2: conversation", 14, "bold", anchor="end", italic=True)

    # Track 1.
    box(left_x, 270, col_w, 84, "Behavioral Pipeline",
        ("Editor events → Redis event lists (per user and genre)", "→ aggregator → DuckDB behavior features"))
    ml_y, ml_h = 400, 150
    box(left_x, ml_y, col_w, ml_h)
    text(left_x + col_w / 2, ml_y + 22, "ML Microservice (FastAPI)", 17, "bold")
    tiers = [("Tier 1", "Rules"), ("Tier 2", "RandomForest"), ("Tier 3", "DistilBERT", "(ONNX)"), ("User", "RandomForest,", "LSTM")]
    tw, gap = 92, 24
    tx = left_x + (col_w - (4 * tw + 3 * gap)) / 2
    ty, th = ml_y + 48, 74
    for i, lines in enumerate(tiers):
        bx = tx + i * (tw + gap)
        box(bx, ty, tw, th, lines[0], tuple(lines[1:]), title_size=14, line_size=13.5)
        if i:
            arrow([(bx - gap, ty + th / 2), (bx, ty + th / 2)])

    # Track 2.
    box(right_x, 270, col_w, 84, "AI Chat (MCP)",
        ("Assistant requests → MCP router", "Chat model: Gemini, Groq or OpenRouter (failover order)"))
    mcp_y = ml_y
    box(right_x, mcp_y, col_w, ml_h)
    text(right_x + col_w / 2, mcp_y + 22, "MCP Tool Layer", 17, "bold")
    kinds = [("Read", "document, profile,", "behavior, prediction"), ("Plan", "format blocks, presets,", "captions, bibliography"),
             ("Suggest", "literature search,", "academic style")]
    kw, kgap = 136, 16
    kx = right_x + (col_w - (3 * kw + 2 * kgap)) / 2
    for i, lines in enumerate(kinds):
        box(kx + i * (kw + kgap), ty, kw, th + 6, lines[0], tuple(lines[1:]), title_size=14, line_size=12.5)

    # API to the tracks, and each track's two stages.
    for x in (left_x + col_w / 2, right_x + col_w / 2):
        arrow([(x, 210), (x, 270)], both=True)
        arrow([(x, 354), (x, ml_y)])

    # Data layer.
    data_y, data_h = 610, 120
    box(40, data_y, 1020, data_h)
    text(center, data_y + 22, "Data Layer", 17, "bold")
    stores = [("Supabase", "PostgreSQL: documents, feedback", "Storage: pictures, user models"),
              ("Redis", "behavior event lists,", "AI cache, rate limits"),
              ("DuckDB", "behavior features per", "user and genre")]
    sw = 300
    sx = 40 + (1020 - 3 * sw) / 4
    for i, lines in enumerate(stores):
        box(sx + i * (sw + (1020 - 3 * sw) / 4), data_y + 40, sw, 66, lines[0], tuple(lines[1:]), title_size=14, line_size=12.5)
    arrow([(left_x + col_w / 2, ml_y + ml_h), (left_x + col_w / 2, data_y)], both=True)
    arrow([(right_x + col_w / 2, mcp_y + ml_h), (right_x + col_w / 2, data_y)], both=True)
    text(left_x + col_w / 2 + 8, (ml_y + ml_h + data_y) / 2, "features, labeled feedback", 12.5, anchor="start", italic=True)
    text(right_x + col_w / 2 + 8, (mcp_y + ml_h + data_y) / 2, "documents, history", 12.5, anchor="start", italic=True)

    # Fine-tuner and personalized models, closing the loop.
    ft_y = 780
    box(240, ft_y, 620, 84, "Fine-tuner (supervised)",
        ("Labeled blocks: accepted = the suggested format, rejected = the format kept;",
         "runs by itself at 5 of them, then every 10 more: the user's RandomForest and LSTM per genre"))
    arrow([(center, data_y + data_h), (center, ft_y)])
    pm_y = 910
    box(240, pm_y, 620, 66, "Personalized ML Models", ("each user's RandomForest and LSTM per genre, in Supabase Storage",))
    arrow([(center, ft_y + 84), (center, pm_y)])
    # Loaded back into predictions: up the left edge to the ML Microservice.
    loop_x = 18
    arrow([(240, pm_y + 33), (loop_x, pm_y + 33), (loop_x, ml_y + ml_h / 2), (left_x, ml_y + ml_h / 2)])
    text(loop_x + 8, (ml_y + ml_h + pm_y) / 2 + 60, "loaded for the user's", 12.5, anchor="start", italic=True)
    text(loop_x + 8, (ml_y + ml_h + pm_y) / 2 + 78, "predictions", 12.5, anchor="start", italic=True)
    return pm_y + 66 + 24


def render_svg() -> str:
    height = build()
    defs = ('<defs><marker id="head" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
            '<path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker></defs>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height:.0f}" viewBox="0 0 {WIDTH} {height:.0f}">'
            f'<rect width="100%" height="100%" fill="#fff"/>{defs}{"".join(SVG)}</svg>')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=4.0, help="device pixels per CSS pixel in the PNG")
    args = parser.parse_args()
    svg = render_svg()
    (HERE / "ai_architecture.svg").write_text(svg, encoding="utf-8")
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel="chrome")
        page = browser.new_context(device_scale_factor=args.scale).new_page()
        page.set_content(f'<html><body style="margin:0;background:#fff">{svg}</body></html>')
        page.evaluate("document.fonts.ready.then(() => true)")
        page.locator("svg").screenshot(path=str(HERE / "ai_architecture.png"))
        browser.close()
    print("wrote ai_architecture.svg and ai_architecture.png")


if __name__ == "__main__":
    main()
