"""Formatting prediction cascade of IntelliDocs, a flowchart drawn from the code.

usage: ml/venv/Scripts/python docs/manuscript/figures/chapter_3/prediction_cascade.py [--scale 4]

Follows predict_format_core in ml/src/main.py (POST /predict), in order:
- Tier 1 rules, each answering at once: a heading pattern (chapter line, "I." / "1." / "1.0", a known section
  name, "1.1", "1.1.1"; not inside a table or list, at most 14 words, and not a Heading 1 right after a
  Heading 1), a bullet marker (at most 25 words), ALL CAPS text up to 120 characters, code, a reference entry.
- Isolated mode with the user's LSTM for this genre: the LSTM alone decides.
- Tier 2: the base RandomForest on the block's features.
- Tier 3: below TIER3_CONFIDENCE_THRESHOLD (0.70), DistilBERT INT8 ONNX votes and wins only if more confident.
- Outside the baseline mode, the user's own RandomForest for this genre (fine-tuned on their labeled feedback,
  ml/training/fine_tuner.py) is blended into the answer so far (ml/src/user_forest.py).
- Hybrid mode (the default) with an LSTM score above 0: confidence = 0.7 x model + 0.3 x LSTM.
Drawn in the style of the manuscript's Figure 11: rounded terminators, diamonds, black on white.
"""

from __future__ import annotations

import argparse
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONT = "'Times New Roman', Times, serif"
WIDTH = 1040
SVG: list[str] = []
MAIN_X = 380
SIDE_X = 790
BUS_X = 1000


def text(x: float, y: float, s: str, size: float = 14, weight: str = "normal", anchor: str = "middle", italic: bool = False) -> None:
    style = ' font-style="italic"' if italic else ""
    SVG.append(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}"{style} '
               f'text-anchor="{anchor}" dominant-baseline="central">{escape(s)}</text>')


def lines_at(x: float, y: float, rows: list[str], size: float = 14, bold_first: bool = False) -> None:
    pitch = size + 4
    top = y - (len(rows) - 1) * pitch / 2
    for i, row in enumerate(rows):
        text(x, top + i * pitch, row, size, "bold" if bold_first and i == 0 else "normal")


def process(x: float, y: float, w: float, h: float, rows: list[str], bold_first: bool = False) -> None:
    SVG.append(f'<rect x="{x - w / 2}" y="{y - h / 2}" width="{w}" height="{h}" fill="#fff" stroke="#000" stroke-width="1.5"/>')
    lines_at(x, y, rows, bold_first=bold_first)


def terminator(x: float, y: float, w: float, h: float, rows: list[str]) -> None:
    SVG.append(f'<rect x="{x - w / 2}" y="{y - h / 2}" width="{w}" height="{h}" rx="{h / 2}" fill="#fff" stroke="#000" stroke-width="1.5"/>')
    lines_at(x, y, rows)


def decision(x: float, y: float, rows: list[str], hw: float = 170, hh: float = 46) -> tuple[float, float]:
    pts = [(x, y - hh), (x + hw, y), (x, y + hh), (x - hw, y)]
    SVG.append(f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}" fill="#fff" stroke="#000" stroke-width="1.5"/>')
    lines_at(x, y, rows, 13.5)
    return hw, hh


def arrow(points: list[tuple[float, float]], head: bool = True) -> None:
    pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    marker = ' marker-end="url(#head)"' if head else ""
    SVG.append(f'<polyline points="{pts}" fill="none" stroke="#000" stroke-width="1.5"{marker}/>')


def label(x: float, y: float, s: str) -> None:
    text(x, y, s, 13.5, "bold")


def build() -> float:
    y = 46
    terminator(MAIN_X, y, 330, 56, ["Start: a block's text and context", "(previous format, heading level, table or list)"])
    prev_bottom = y + 28

    # Tier 1 rules: each answers at once with its own label and confidence.
    rules = [
        (["Heading pattern?", "chapter, I. / 1. / 1.0, section name,", "1.1 or 1.1.1 (not in a table or list)"],
         ["Heading 1, 2 or 3", "confidence 0.95 to 0.98"]),
        (["Bullet marker", "and at most 25 words?"], ["Bulleted list", "confidence 0.93"]),
        (["ALL CAPS and at most", "120 characters?"], ["Title", "confidence 0.96"]),
        (["Code marker or keyword?"], ["Code block", "confidence 0.97"]),
        (["Reference entry pattern?", "Surname, I. ... (year)"], ["Reference entry", "confidence 0.96"]),
    ]
    rules_top = None
    y += 50
    for i, (question, answer) in enumerate(rules):
        y += 64 if i == 0 else 140
        hw, hh = decision(MAIN_X, y, question, hw=190 if len(question) == 3 else 170, hh=52 if len(question) == 3 else 44)
        arrow([(MAIN_X, prev_bottom), (MAIN_X, y - hh)])
        if i:
            label(MAIN_X + 16, (prev_bottom + y - hh) / 2, "No")
        rules_top = rules_top if rules_top is not None else y - hh
        process(SIDE_X, y, 210, 54, answer, bold_first=True)
        arrow([(MAIN_X + hw, y), (SIDE_X - 105, y)])
        label(MAIN_X + hw + 22, y - 12, "Yes")
        arrow([(SIDE_X + 105, y), (BUS_X, y)], head=False)
        prev_bottom = y + hh
    rules_bottom = prev_bottom
    # Tier 1 bracket on the left.
    bx = 150
    SVG.append(f'<polyline points="{bx + 14},{rules_top} {bx},{rules_top} {bx},{rules_bottom} {bx + 14},{rules_bottom}" '
               'fill="none" stroke="#000" stroke-width="1.5"/>')
    text(bx - 14, (rules_top + rules_bottom) / 2, "Tier 1: rules", 15, "bold", italic=True)
    SVG[-1] = SVG[-1].replace("<text ", f'<text transform="rotate(-90 {bx - 14} {(rules_top + rules_bottom) / 2:.1f})" ', 1)

    # Isolated mode: the user's LSTM alone.
    y += 130
    hw, hh = decision(MAIN_X, y, ["Isolated mode, and the user", "has an LSTM for this genre?"], hw=190, hh=50)
    arrow([(MAIN_X, prev_bottom), (MAIN_X, y - hh)])
    label(MAIN_X + 16, (prev_bottom + y - hh) / 2, "No")
    process(SIDE_X, y, 210, 54, ["User LSTM decides", "(personalized model)"], bold_first=True)
    arrow([(MAIN_X + hw, y), (SIDE_X - 105, y)])
    label(MAIN_X + hw + 22, y - 12, "Yes")
    arrow([(SIDE_X + 105, y), (BUS_X, y)], head=False)
    prev_bottom = y + hh

    # Tier 2.
    y += 118
    process(MAIN_X, y, 340, 62, ["Tier 2: RandomForest", "on the block's features: label and confidence c"], bold_first=True)
    arrow([(MAIN_X, prev_bottom), (MAIN_X, y - 31)])
    label(MAIN_X + 16, (prev_bottom + y - 31) / 2, "No")
    prev_bottom = y + 31

    # Tier 3.
    y += 112
    hw, hh = decision(MAIN_X, y, ["c below 0.70?"], hw=130, hh=38)
    arrow([(MAIN_X, prev_bottom), (MAIN_X, y - hh)])
    process(SIDE_X, y, 250, 70, ["Tier 3: DistilBERT (ONNX)", "its label and confidence replace", "the RandomForest's if higher"], bold_first=True)
    arrow([(MAIN_X + hw, y), (SIDE_X - 125, y)])
    label(MAIN_X + hw + 22, y - 12, "Yes")
    merge_y = y + 92
    arrow([(SIDE_X, y + 35), (SIDE_X, merge_y), (MAIN_X + 4, merge_y)])
    arrow([(MAIN_X, y + hh), (MAIN_X, merge_y + 26)])
    label(MAIN_X + 16, (y + hh + merge_y) / 2, "No")
    prev_bottom = merge_y + 26

    # The user's own RandomForest, fine-tuned on their feedback, adjusts the answer so far.
    y = merge_y + 86
    hw, hh = decision(MAIN_X, y, ["Not baseline mode, and the user", "has a fine-tuned RandomForest", "for this genre?"], hw=200, hh=58)
    arrow([(MAIN_X, prev_bottom), (MAIN_X, y - hh)])
    process(SIDE_X, y, 270, 80, ["Blend in the user's RandomForest", "p = (1 − w) × p(answer) + w × p(user)",
                                  "w = n ÷ (n + 20), at most 0.6", "(n = the user's labeled blocks)"], bold_first=True)
    arrow([(MAIN_X + hw, y), (SIDE_X - 135, y)])
    label(MAIN_X + hw + 22, y - 12, "Yes")
    merge_y = y + 104
    arrow([(SIDE_X, y + 40), (SIDE_X, merge_y), (MAIN_X + 4, merge_y)])
    arrow([(MAIN_X, y + hh), (MAIN_X, merge_y + 26)])
    label(MAIN_X + 16, (y + hh + merge_y) / 2, "No")
    prev_bottom = merge_y + 26

    # Hybrid blend.
    y = merge_y + 86
    hw, hh = decision(MAIN_X, y, ["Hybrid mode, and the user's", "LSTM scores this label above 0?"], hw=200, hh=52)
    arrow([(MAIN_X, prev_bottom), (MAIN_X, y - hh)])
    process(SIDE_X, y, 250, 62, ["Blend the confidence", "0.7 × c + 0.3 × LSTM score"], bold_first=True)
    arrow([(MAIN_X + hw, y), (SIDE_X - 125, y)])
    label(MAIN_X + hw + 22, y - 12, "Yes")
    arrow([(SIDE_X + 125, y), (BUS_X, y)], head=False)
    end_y = y + 130
    arrow([(MAIN_X, y + hh), (MAIN_X, end_y - 30)])
    label(MAIN_X + 16, (y + hh + end_y - 30) / 2, "No")

    # Every answer arrives at the end.
    terminator(MAIN_X, end_y, 380, 60, ["End: predicted format and confidence,", "shown as a suggestion in the editor"])
    arrow([(BUS_X, 46 + 50 + 64), (BUS_X, end_y), (MAIN_X + 190, end_y)])
    return end_y + 50


def render_svg() -> str:
    height = build()
    defs = ('<defs><marker id="head" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="8" markerHeight="8" orient="auto">'
            '<path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker></defs>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height:.0f}" viewBox="0 0 {WIDTH} {height:.0f}">'
            f'<rect width="100%" height="100%" fill="#fff"/>{defs}{"".join(SVG)}</svg>')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=4.0, help="device pixels per CSS pixel in the PNG")
    args = parser.parse_args()
    svg = render_svg()
    (HERE / "prediction_cascade.svg").write_text(svg, encoding="utf-8")
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel="chrome")
        page = browser.new_context(device_scale_factor=args.scale).new_page()
        page.set_content(f'<html><body style="margin:0;background:#fff">{svg}</body></html>')
        page.evaluate("document.fonts.ready.then(() => true)")
        page.locator("svg").screenshot(path=str(HERE / "prediction_cascade.png"))
        browser.close()
    print("wrote prediction_cascade.svg and prediction_cascade.png")


if __name__ == "__main__":
    main()
