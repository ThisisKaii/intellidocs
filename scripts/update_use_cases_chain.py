import re

with open('use_case_diagrams.html', 'r', encoding='utf-8') as f:
    content = f.read()

match = re.search(r'(<!-- ══════════════════════════════════════════════════════════════════ -->\s*<!--\s*MODULE 1: LOGIN ACCOUNT \(Figure 16\)\s*-->)', content)
if match:
    header = content[:match.start()]
else:
    print("Error: Could not find split point")
    exit(1)

# We want to replace the internal CSS to remove the blue themes and just use black and white, Times New Roman
# Let's just output the SVGs with inline styles to be absolutely sure, or let the CSS handle it if we modify it.
# Wait, I am only replacing the SVGs here.
# I will use inline styles/attributes to match the user's requested style perfectly.

def build_svg(fig_num, title, height, user_cy, primary_bubbles, secondary_bubbles, relationships, user_points_to):
    # primary_bubbles: list of (idx, cx, cy, text1, text2)
    # secondary_bubbles: list of (idx, cx, cy, text1, text2)
    # relationships: list of (from_idx, to_idx, type)
    # user_points_to: list of primary_bubble idx
    
    font_style = 'font-family="Times New Roman" font-size="11px" fill="black"'
    bold_font = 'font-family="Times New Roman" font-size="14px" font-weight="bold" fill="black"'
    
    svg = f'<div class="diagram-section" style="text-align: center;">\n'
    svg += f'<svg viewBox="0 0 650 {height}" xmlns="http://www.w3.org/2000/svg" width="650" height="{height}">\n'
    svg += f'  <defs>\n'
    svg += f'    <marker id="arrow_{fig_num}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">\n'
    svg += f'      <path d="M0,0 L0,6 L9,3 z" fill="none" stroke="black" stroke-width="1.5"/>\n'
    svg += f'    </marker>\n'
    svg += f'    <marker id="arrow_ext_{fig_num}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">\n'
    svg += f'      <path d="M9,0 L9,6 L0,3 z" fill="none" stroke="black" stroke-width="1.5"/>\n'
    svg += f'    </marker>\n'
    svg += f'  </defs>\n'
    
    # System Boundary (thick black border)
    svg += f'  <rect x="140" y="20" width="480" height="{height-40}" fill="none" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <text x="380" y="50" text-anchor="middle" {bold_font}>{title}</text>\n\n'
    
    # Actor (thick black lines)
    svg += f'  <circle cx="50" cy="{user_cy}" r="12" fill="none" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+12}" x2="50" y2="{user_cy+45}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="25" y1="{user_cy+25}" x2="75" y2="{user_cy+25}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+45}" x2="30" y2="{user_cy+75}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+45}" x2="70" y2="{user_cy+75}" stroke="black" stroke-width="2.5"/>\n'
    svg += f'  <text x="50" y="{user_cy+95}" text-anchor="middle" {font_style}>User</text>\n\n'
    
    bubbles = {}
    
    rx = 95
    ry = 30
    
    # Bubbles
    for idx, cx, cy, t1, t2 in primary_bubbles + secondary_bubbles:
        svg += f'  <ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="white" stroke="black" stroke-width="2.5"/>\n'
        if t2:
            svg += f'  <text x="{cx}" y="{cy-3}" text-anchor="middle" {font_style} font-weight="bold">{t1}</text>\n'
            svg += f'  <text x="{cx}" y="{cy+12}" text-anchor="middle" {font_style} font-weight="bold">{t2}</text>\n'
        else:
            svg += f'  <text x="{cx}" y="{cy+4}" text-anchor="middle" {font_style} font-weight="bold">{t1}</text>\n'
        bubbles[idx] = (cx, cy, rx, ry)
            
    # User lines
    for b_idx in user_points_to:
        bx, by, brx, bry = bubbles[b_idx]
        svg += f'  <line x1="75" y1="{user_cy+25}" x2="{bx - brx}" y2="{by}" stroke="black" stroke-width="2.5"/>\n'
        
    # Relationships
    for f_idx, t_idx, rel_type in relationships:
        fx, fy, frx, fry = bubbles[f_idx]
        tx, ty, trx, try_val = bubbles[t_idx]
        
        # Calculate intersection points on ellipses
        if fx < tx:
            start_x = fx + frx
            end_x = tx - trx - 2
        elif fx > tx:
            start_x = fx - frx
            end_x = tx + trx + 2
        else:
            start_x = fx
            end_x = tx
            
        if fy < ty:
            start_y = fy + fry if start_x == fx else fy + fry/2
            end_y = ty - try_val if end_x == tx else ty - try_val/2
        elif fy > ty:
            start_y = fy - fry if start_x == fx else fy - fry/2
            end_y = ty + try_val if end_x == tx else ty + try_val/2
        else:
            start_y = fy
            end_y = ty
            
        # Draw dashed arrow
        svg += f'  <line x1="{start_x}" y1="{start_y}" x2="{end_x}" y2="{end_y}" stroke="black" stroke-width="1.5" stroke-dasharray="5,5" marker-end="url(#arrow_{fig_num})"/>\n'
        
        # Calculate text position (midpoint)
        mx = (start_x + end_x) / 2
        my = (start_y + end_y) / 2
        
        # Add a white background rect for text so it doesn't cross the line messily
        # or just offset the text slightly
        svg += f'  <text x="{mx}" y="{my-5}" text-anchor="middle" {font_style}>&lt;&lt;{rel_type}&gt;&gt;</text>\n'
        
    svg += f'</svg>\n'
    svg += f'<div class="diagram-caption" style="font-family: \'Times New Roman\'; font-size: 12px; margin-top: 10px;">Figure {fig_num}: System Use Case Model – {title}</div>\n'
    svg += f'</div>\n\n'
    svg += f'<hr class="sep">\n\n'
    return svg

new_blocks = ""

# Fig 16: Login
new_blocks += "<!-- MODULE 1: LOGIN ACCOUNT (Figure 16) -->\n"
new_blocks += build_svg(16, "Login Account", 260, 100,
    [(0, 270, 140, "User Login", "")],
    [(1, 500, 80, "Create Account", ""), (2, 500, 200, "Authenticate via OAuth2", "")],
    [(1, 0, "extend"), (0, 2, "include")],
    [0]
)

# Fig 17: Import & Integration
new_blocks += "<!-- MODULE 2: IMPORT & INTEGRATION (Figure 17) -->\n"
new_blocks += build_svg(17, "Import & Integration", 260, 100,
    [(0, 270, 140, "Import from Google Drive", "")],
    [(1, 500, 80, "Connect Google Account", ""), (2, 500, 200, "Select Files to Import", "")],
    [(0, 1, "include"), (2, 0, "extend")],
    [0]
)

# Fig 18: Workspace Manager
new_blocks += "<!-- MODULE 3: WORKSPACE MANAGER (Figure 18) -->\n"
new_blocks += build_svg(18, "Workspace Manager", 300, 120,
    [(0, 270, 90, "Create Document", ""), (1, 270, 210, "Organize Folders", "")],
    [(2, 500, 150, "Rename Document", ""), (3, 500, 250, "Delete Document", "")],
    [(2, 1, "extend"), (3, 1, "extend")],
    [0, 1]
)

# Fig 19: Custom Editor Workspace
new_blocks += "<!-- MODULE 4: CUSTOM EDITOR WORKSPACE (Figure 19) -->\n"
new_blocks += build_svg(19, "Custom Editor Workspace", 320, 120,
    [(0, 270, 160, "Type and Edit Text", "")],
    [(1, 500, 80, "Apply Manual Formatting", ""), (2, 500, 160, "Use Markdown Shortcuts", ""), (3, 500, 240, "Real-time Preview", "")],
    [(1, 0, "extend"), (2, 0, "extend"), (0, 3, "include")],
    [0]
)

# Fig 20: Presets & Rules Engine
new_blocks += "<!-- MODULE 5: PRESETS & RULES ENGINE (Figure 20) -->\n"
new_blocks += build_svg(20, "Presets & Rules Engine", 260, 100,
    [(0, 270, 140, "Manage Presets", "")],
    [(1, 500, 80, "Create Custom", "Formatting Bindings"), (2, 500, 200, "Apply Preset to Document", "")],
    [(1, 0, "extend"), (2, 0, "extend")],
    [0]
)

# Fig 21: ML Prediction & Learning
new_blocks += "<!-- MODULE 6: ML PREDICTION & LEARNING (Figure 21) -->\n"
new_blocks += build_svg(21, "ML Prediction & Learning", 260, 100,
    [(0, 270, 140, "Accept/Reject ML", "Suggestion")],
    [(1, 500, 80, "Generate Formatting", "Prediction"), (2, 500, 200, "View Confidence Score", "")],
    [(0, 1, "include"), (0, 2, "include")],
    [0]
)

# Fig 22: Isolation Manager
new_blocks += "<!-- MODULE 7: ISOLATION MANAGER (Figure 22) -->\n"
new_blocks += build_svg(22, "Isolation Manager", 200, 70,
    [(0, 270, 110, "Toggle Document Isolation", "")],
    [(1, 500, 110, "Exclude Data from", "ML Training")],
    [(0, 1, "include")],
    [0]
)

# Fig 23: Grammar & Spelling Core
new_blocks += "<!-- MODULE 8: GRAMMAR & SPELLING CORE (Figure 23) -->\n"
new_blocks += build_svg(23, "Grammar & Spelling Core", 260, 100,
    [(0, 270, 140, "Perform Grammar &", "Spelling Check")],
    [(1, 500, 80, "Resolve Grammar/", "Spelling Issues"), (2, 500, 200, "View Grammar Suggestions", "")],
    [(1, 0, "extend"), (0, 2, "include")],
    [0]
)

# Fig 24: Analytics & Training
new_blocks += "<!-- MODULE 9: ANALYTICS & TRAINING (Figure 24) -->\n"
new_blocks += build_svg(24, "Analytics & Training", 280, 110,
    [(0, 270, 90, "View Formatting Analytics", ""), (1, 270, 200, "Train Personalized", "ML Model")],
    [(2, 500, 150, "Log Behavioral Events", "")],
    [(1, 2, "include")],
    [0, 1]
)

# Fig 25: Engage Chatbot
new_blocks += "<!-- MODULE 10: ENGAGE CHATBOT (Figure 25) -->\n"
new_blocks += build_svg(25, "Engage Chatbot", 260, 100,
    [(0, 270, 140, "Open Chatbot", "")],
    [(1, 500, 80, "Ask Formatting Question", ""), (2, 500, 200, "Execute Natural Language", "Command")],
    [(1, 0, "extend"), (2, 0, "extend")],
    [0]
)

new_blocks += "</body>\n</html>\n"

with open('use_case_diagrams.html', 'w', encoding='utf-8') as f:
    f.write(header + new_blocks)
