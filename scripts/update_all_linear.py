import re

modules = [
    {
        "id": "UC-01",
        "name": "Login Account",
        "desc": "The user logs into the IntelliDocs platform.",
        "pre": "The user has an existing account.",
        "post": "The user is authenticated and redirected to the dashboard.",
        "bubbles": ["Submits Credentials", "Validates Credentials", "Generates Session Token"]
    },
    {
        "id": "UC-02",
        "name": "Import & Integration",
        "desc": "The user imports documents from Google Drive.",
        "pre": "The user is logged in.",
        "post": "The selected document is imported into the workspace.",
        "bubbles": ["Selects Google Drive", "Authenticates Account", "Imports Document Data"]
    },
    {
        "id": "UC-03",
        "name": "Workspace Manager",
        "desc": "The user manages their workspace by creating, organizing, or deleting documents.",
        "pre": "The user is logged in and on the dashboard.",
        "post": "The workspace reflects the organizational changes.",
        "bubbles": ["Selects Workspace Action", "Processes Request", "Updates Workspace View"]
    },
    {
        "id": "UC-04",
        "name": "Custom Editor Workspace",
        "desc": "The user writes and formats document content.",
        "pre": "The user has opened a document.",
        "post": "The document content is saved and formatted.",
        "bubbles": ["Types Text Content", "Renders Live Preview", "Auto-Saves Document"]
    },
    {
        "id": "UC-05",
        "name": "Presets & Rules Engine",
        "desc": "The user creates and applies custom formatting presets.",
        "pre": "The user is editing a document.",
        "post": "The preset rules are saved and applied.",
        "bubbles": ["Selects Formatting Rules", "Creates Custom Preset", "Applies to Document"]
    },
    {
        "id": "UC-06",
        "name": "ML Prediction & Learning",
        "desc": "The user interacts with ML-driven formatting suggestions.",
        "pre": "The user has established a formatting pattern.",
        "post": "The suggested formatting is applied to the document.",
        "bubbles": ["Triggers Prediction", "Generates Suggestion", "Applies Formatting"]
    },
    {
        "id": "UC-07",
        "name": "Isolation Manager",
        "desc": "The user toggles document isolation to prevent ML training.",
        "pre": "The user is managing document settings.",
        "post": "The document data is excluded from ML pipelines.",
        "bubbles": ["Toggles Isolation Mode", "Excludes from ML", "Secures Document Data"]
    },
    {
        "id": "UC-08",
        "name": "Grammar & Spelling Core",
        "desc": "The user checks and resolves grammar and spelling issues.",
        "pre": "The user is editing a document.",
        "post": "The document text is corrected.",
        "bubbles": ["Runs Grammar Check", "Identifies Issues", "Applies Corrections"]
    },
    {
        "id": "UC-09",
        "name": "Analytics & Training",
        "desc": "The user reviews their formatting analytics and trains custom models.",
        "pre": "The system has logged behavioral events.",
        "post": "A personalized ML model is trained based on user data.",
        "bubbles": ["Views Analytics Dashboard", "Analyzes Formatting Data", "Trains Personalized Model"]
    },
    {
        "id": "UC-10",
        "name": "Engage Chatbot",
        "desc": "The user interacts with the chatbot for assistance.",
        "pre": "The user opens the chatbot panel.",
        "post": "The chatbot provides a relevant response or executes a command.",
        "bubbles": ["Sends a Message", "Chatbot Processes Message", "Response Generation"]
    }
]

# 1. Generate use_case_models.html
html_models = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>IntelliDocs — Use Case Specifications</title>
<style>
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11px;
    background: #fff;
    color: #000;
    padding: 40px;
    line-height: 1.8;
  }
  .model-section {
    max-width: 750px;
    margin: 0 auto 50px auto;
    page-break-inside: avoid;
  }
  .model-title {
    text-align: center;
    font-size: 12px;
    font-weight: bold;
    margin-bottom: 12px;
  }
  table.spec {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid #000;
    margin-bottom: 10px;
    table-layout: fixed;
  }
  table.spec th, table.spec td {
    border: 1px solid #000;
    padding: 6px 8px;
    vertical-align: top;
    font-size: 11px;
    word-wrap: break-word;
  }
  table.spec th {
    background: #e8e8e8;
    font-weight: bold;
    width: 22%;
    text-align: left;
  }
  table.spec td {
    width: 78%;
  }
  table.flow {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #000;
    margin-top: 4px;
  }
  table.flow th {
    background: #d9d9d9;
    border: 1px solid #000;
    padding: 4px 6px;
    font-size: 11px;
    text-align: center;
    font-weight: bold;
  }
  table.flow td {
    border: 1px solid #000;
    padding: 4px 6px;
    font-size: 11px;
    vertical-align: top;
  }
  table.flow td.step {
    width: 8%;
    text-align: center;
    font-weight: bold;
  }
  table.flow td.user-col { width: 46%; }
  table.flow td.sys-col { width: 46%; }
  hr.sep {
    border: none;
    border-top: 1px dashed #aaa;
    margin: 40px 0;
  }
</style>
</head>
<body>
"""

for i, mod in enumerate(modules):
    fig_num = 16 + i
    b = mod["bubbles"]
    html_models += f"""
<div class="model-section">
<div class="model-title">Use Case Specification {i+1}: {mod["name"]}</div>
<table class="spec">
  <tr><th>Use Case ID</th><td>{mod["id"]}</td></tr>
  <tr><th>Use Case Name</th><td>{mod["name"]}</td></tr>
  <tr><th>Actor(s)</th><td>User</td></tr>
  <tr><th>Description</th><td>{mod["desc"]}</td></tr>
  <tr><th>Pre-conditions</th><td>{mod["pre"]}</td></tr>
  <tr><th>Post-conditions</th><td>{mod["post"]}</td></tr>
  <tr><th>Basic Flow</th><td>
    <table class="flow">
      <tr><th class="step">Step</th><th>Action</th></tr>
      <tr><td class="step">1</td><td>User: {b[0]}</td></tr>
      <tr><td class="step">2</td><td>System: {b[1]}</td></tr>
      <tr><td class="step">3</td><td>System: {b[2]}</td></tr>
    </table>
  </td></tr>
  <tr><th>Include</th><td>{b[1]}, {b[2]}</td></tr>
</table>
</div>
<hr class="sep">
"""
html_models += "</body></html>"
with open('use_case_models.html', 'w', encoding='utf-8') as f:
    f.write(html_models)

# 2. Generate use_case_diagrams.html
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
def build_svg_chain(fig_num, title, bubbles):
    font_style = 'font-family="Times New Roman" font-size="11px" fill="black"'
    bold_font = 'font-family="Times New Roman" font-size="14px" font-weight="bold" fill="black"'
    
    height = 200
    svg = f'<div class="diagram-section" style="text-align: center;">\n'
    svg += f'<svg viewBox="0 0 900 {height}" xmlns="http://www.w3.org/2000/svg" width="900" height="{height}">\n'
    svg += f'  <defs>\n'
    svg += f'    <marker id="arr" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">\n'
    svg += f'      <path d="M0,0 L0,6 L9,3 z" fill="none" stroke="black" stroke-width="1.5"/>\n'
    svg += f'    </marker>\n'
    svg += f'  </defs>\n'
    
    svg += f'  <rect x="140" y="20" width="740" height="{height-40}" fill="none" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <text x="510" y="50" text-anchor="middle" {bold_font}>{title}</text>\n\n'
    
    user_cy = 100
    svg += f'  <circle cx="50" cy="{user_cy}" r="12" fill="none" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+12}" x2="50" y2="{user_cy+45}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="25" y1="{user_cy+25}" x2="75" y2="{user_cy+25}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+45}" x2="30" y2="{user_cy+75}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+45}" x2="70" y2="{user_cy+75}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <text x="50" y="{user_cy+95}" text-anchor="middle" {font_style}>User</text>\n\n'
    
    cxs = [280, 520, 760]
    rx = 95
    ry = 30
    
    for i, b_text in enumerate(bubbles):
        cx = cxs[i]
        cy = 110
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
            
    svg += f'  <line x1="75" y1="{user_cy+25}" x2="{cxs[0]-rx}" y2="110" stroke="black" stroke-width="2.5"/>\n'
    
    for i in range(2):
        start_x = cxs[i] + rx
        end_x = cxs[i+1] - rx - 2
        cy = 110
        svg += f'  <line x1="{start_x}" y1="{cy}" x2="{end_x}" y2="{cy}" stroke="black" stroke-width="1.5" stroke-dasharray="5,5" marker-end="url(#arr)"/>\n'
        mx = (start_x + end_x) / 2
        svg += f'  <text x="{mx}" y="{cy-5}" text-anchor="middle" {font_style}>&lt;&lt;include&gt;&gt;</text>\n'
        
    svg += f'</svg>\n'
    svg += f'<div class="diagram-caption" style="font-family: \'Times New Roman\'; font-size: 12px; margin-top: 10px;">Figure {fig_num}: System Use Case Model – {title}</div>\n'
    svg += f'</div>\n\n'
    svg += f'<hr class="sep">\n\n'
    return svg

for i, mod in enumerate(modules):
    html_diagrams += build_svg_chain(16 + i, mod["name"], mod["bubbles"])

html_diagrams += "</body></html>"
with open('use_case_diagrams.html', 'w', encoding='utf-8') as f:
    f.write(html_diagrams)
