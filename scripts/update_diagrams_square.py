import re

modules = [
    {
        "id": "UC-01",
        "name": "Login Account",
        "bubbles": ["Submits Credentials", "Validates Credentials", "Generates Session Token"]
    },
    {
        "id": "UC-02",
        "name": "Import & Integration",
        "bubbles": ["Selects Google Drive", "Authenticates Account", "Imports Document Data"]
    },
    {
        "id": "UC-03",
        "name": "Workspace Manager",
        "bubbles": ["Selects Workspace Action", "Processes Request", "Updates Workspace View"]
    },
    {
        "id": "UC-04",
        "name": "Custom Editor Workspace",
        "bubbles": ["Types Text Content", "Renders Live Preview", "Auto-Saves Document"]
    },
    {
        "id": "UC-05",
        "name": "Presets & Rules Engine",
        "bubbles": ["Selects Formatting Rules", "Creates Custom Preset", "Applies to Document"]
    },
    {
        "id": "UC-06",
        "name": "ML Prediction & Learning",
        "bubbles": ["Triggers Prediction", "Generates Suggestion", "Applies Formatting"]
    },
    {
        "id": "UC-07",
        "name": "Isolation Manager",
        "bubbles": ["Toggles Isolation Mode", "Excludes from ML", "Secures Document Data"]
    },
    {
        "id": "UC-08",
        "name": "Grammar & Spelling Core",
        "bubbles": ["Runs Grammar Check", "Identifies Issues", "Applies Corrections"]
    },
    {
        "id": "UC-09",
        "name": "Analytics & Training",
        "bubbles": ["Views Analytics Dashboard", "Analyzes Formatting Data", "Trains Personalized Model"]
    },
    {
        "id": "UC-10",
        "name": "Engage Chatbot",
        "bubbles": ["Sends a Message", "Chatbot Processes Message", "Response Generation"]
    }
]

html_diagrams = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>IntelliDocs — Use Case Diagrams</title>
<style>
  body { font-family: 'Times New Roman', Times, serif; background: #fff; text-align: center; margin: 40px; }
  .diagram-section { margin-bottom: 50px; }
  hr.sep { border: none; border-top: 1px dashed #aaa; margin: 40px 0; }
</style>
</head>
<body>
"""

def build_svg_square(fig_num, title, bubbles):
    font_style = 'font-family="Times New Roman" font-size="11px" fill="black"'
    bold_font = 'font-family="Times New Roman" font-size="14px" font-weight="bold" fill="black"'
    
    # We want a more square aspect ratio
    width = 650
    height = 320
    
    svg = f'<div class="diagram-section" style="text-align: center;">\n'
    svg += f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">\n'
    svg += f'  <defs>\n'
    svg += f'    <marker id="arr_{fig_num}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">\n'
    svg += f'      <path d="M0,0 L0,6 L9,3 z" fill="none" stroke="black" stroke-width="1.5"/>\n'
    svg += f'    </marker>\n'
    svg += f'  </defs>\n'
    
    svg += f'  <rect x="140" y="20" width="490" height="{height-40}" fill="none" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <text x="385" y="50" text-anchor="middle" {bold_font}>{title}</text>\n\n'
    
    user_cy = 130
    svg += f'  <circle cx="50" cy="{user_cy}" r="12" fill="none" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+12}" x2="50" y2="{user_cy+45}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="25" y1="{user_cy+25}" x2="75" y2="{user_cy+25}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+45}" x2="30" y2="{user_cy+75}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+45}" x2="70" y2="{user_cy+75}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <text x="50" y="{user_cy+95}" text-anchor="middle" {font_style}>User</text>\n\n'
    
    # Bubble positions (Triangular layout to make it square)
    # B1: top left
    # B2: top right
    # B3: bottom right
    rx = 95
    ry = 30
    positions = [
        (270, 110),
        (510, 110),
        (510, 230)
    ]
    
    for i, b_text in enumerate(bubbles):
        cx, cy = positions[i]
        svg += f'  <ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="white" stroke="black" stroke-width="2.5"/>\n'
        
        words = b_text.split()
        if len(words) > 2:
            mid = len(words)//2
            l1 = " ".join(words[:mid+1])
            l2 = " ".join(words[mid+1:])
            svg += f'  <text x="{cx}" y="{cy-3}" text-anchor="middle" {font_style} font-weight="bold">{l1}</text>\n'
            svg += f'  <text x="{cx}" y="{cy+12}" text-anchor="middle" {font_style} font-weight="bold">{l2}</text>\n'
        else:
            svg += f'  <text x="{cx}" y="{cy+4}" text-anchor="middle" {font_style} font-weight="bold">{b_text}</text>\n'
            
    # User to B1
    svg += f'  <line x1="75" y1="{user_cy+25}" x2="{positions[0][0]-rx}" y2="{positions[0][1]}" stroke="black" stroke-width="2.5"/>\n'
    
    # B1 to B2 (horizontal)
    start_x = positions[0][0] + rx
    end_x = positions[1][0] - rx - 2
    cy = positions[0][1]
    svg += f'  <line x1="{start_x}" y1="{cy}" x2="{end_x}" y2="{cy}" stroke="black" stroke-width="1.5" stroke-dasharray="5,5" marker-end="url(#arr_{fig_num})"/>\n'
    mx = (start_x + end_x) / 2
    svg += f'  <text x="{mx}" y="{cy-5}" text-anchor="middle" {font_style}>&lt;&lt;include&gt;&gt;</text>\n'
    
    # B2 to B3 (vertical)
    cx2 = positions[1][0]
    start_y = positions[1][1] + ry
    end_y = positions[2][1] - ry - 2
    svg += f'  <line x1="{cx2}" y1="{start_y}" x2="{cx2}" y2="{end_y}" stroke="black" stroke-width="1.5" stroke-dasharray="5,5" marker-end="url(#arr_{fig_num})"/>\n'
    my = (start_y + end_y) / 2
    svg += f'  <text x="{cx2+35}" y="{my+4}" text-anchor="middle" {font_style}>&lt;&lt;include&gt;&gt;</text>\n'
        
    svg += f'</svg>\n'
    svg += f'<div class="diagram-caption" style="font-family: \'Times New Roman\'; font-size: 12px; margin-top: 10px;">Figure {fig_num}: System Use Case Model – {title}</div>\n'
    svg += f'</div>\n\n'
    svg += f'<hr class="sep">\n\n'
    return svg

for i, mod in enumerate(modules):
    html_diagrams += build_svg_square(16 + i, mod["name"], mod["bubbles"])

html_diagrams += "</body></html>"
with open('use_case_diagrams.html', 'w', encoding='utf-8') as f:
    f.write(html_diagrams)
