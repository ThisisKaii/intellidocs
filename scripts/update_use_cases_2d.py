import re

with open('use_case_diagrams.html', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to extract the content up to Figure 15 (inclusive).
# It ends right before "<!-- MODULE 1: LOGIN ACCOUNT (Figure 16) -->"
match = re.search(r'(<!-- ══════════════════════════════════════════════════════════════════ -->\s*<!--\s*MODULE 1: LOGIN ACCOUNT \(Figure 16\)\s*-->)', content)
if match:
    header = content[:match.start()]
else:
    print("Error: Could not find split point")
    exit(1)

def build_svg(fig_num, title, height, user_cy, primary_bubbles, secondary_bubbles, relationships, user_points_to):
    # primary_bubbles: list of (idx, cx, cy, text1, text2)
    # secondary_bubbles: list of (idx, cx, cy, text1, text2)
    # relationships: list of (from_idx, to_idx, type, text_x, text_y, anchor)
    # user_points_to: list of primary_bubble idx
    
    svg = f'<div class="diagram-section">\n'
    svg += f'<svg viewBox="0 0 600 {height}" xmlns="http://www.w3.org/2000/svg" width="600" height="{height}">\n'
    svg += f'  <defs><marker id="a{fig_num}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0,0 8,3 0,6" fill="#000"/></marker></defs>\n'
    svg += f'  <rect x="110" y="10" width="480" height="{height-20}" class="sys-boundary" rx="3"/>\n'
    svg += f'  <text x="350" y="32" text-anchor="middle" font-weight="bold" font-size="12px">{title}</text>\n\n'
    
    svg += f'  <!-- Actor -->\n'
    svg += f'  <circle cx="45" cy="{user_cy}" r="12" class="actor-head"/>\n'
    svg += f'  <line x1="45" y1="{user_cy+12}" x2="45" y2="{user_cy+45}" class="actor-line"/>\n'
    svg += f'  <line x1="23" y1="{user_cy+28}" x2="67" y2="{user_cy+28}" class="actor-line"/>\n'
    svg += f'  <line x1="45" y1="{user_cy+45}" x2="27" y2="{user_cy+72}" class="actor-line"/>\n'
    svg += f'  <line x1="45" y1="{user_cy+45}" x2="63" y2="{user_cy+72}" class="actor-line"/>\n'
    svg += f'  <text x="45" y="{user_cy+88}" text-anchor="middle">User</text>\n\n'
    
    bubbles = {}
    
    # Draw primary bubbles
    for idx, cx, cy, t1, t2 in primary_bubbles:
        rx = 100
        svg += f'  <ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="22" class="uc-ellipse"/>\n'
        if t2:
            svg += f'  <text x="{cx}" y="{cy-4}" text-anchor="middle">{t1}</text>\n'
            svg += f'  <text x="{cx}" y="{cy+8}" text-anchor="middle">{t2}</text>\n'
        else:
            svg += f'  <text x="{cx}" y="{cy+4}" text-anchor="middle">{t1}</text>\n'
        bubbles[idx] = (cx, cy, rx, 22)
            
    # Draw secondary bubbles
    for idx, cx, cy, t1, t2 in secondary_bubbles:
        rx = 100
        svg += f'  <ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="22" class="uc-ellipse"/>\n'
        if t2:
            svg += f'  <text x="{cx}" y="{cy-4}" text-anchor="middle">{t1}</text>\n'
            svg += f'  <text x="{cx}" y="{cy+8}" text-anchor="middle">{t2}</text>\n'
        else:
            svg += f'  <text x="{cx}" y="{cy+4}" text-anchor="middle">{t1}</text>\n'
        bubbles[idx] = (cx, cy, rx, 22)
            
    # Draw user lines
    for b_idx in user_points_to:
        bx, by, brx, bry = bubbles[b_idx]
        svg += f'  <line x1="67" y1="{user_cy+15}" x2="{bx - brx}" y2="{by}" class="uc-line"/>\n'
        
    # Draw relationships
    for f_idx, t_idx, rel_type, lx, ly, lanchor in relationships:
        fx, fy, frx, fry = bubbles[f_idx]
        tx, ty, trx, try_val = bubbles[t_idx]
        
        # Calculate intersection points on ellipses for the straight line
        # Simple approximation: left/right edge
        if fx < tx:
            start_x = fx + frx
            end_x = tx - trx - 2
        else:
            start_x = fx - frx
            end_x = tx + trx + 2
            
        start_y = fy
        end_y = ty
        
        # draw dashed arrow from (fx, fy) to (tx, ty)
        svg += f'  <line x1="{start_x}" y1="{start_y}" x2="{end_x}" y2="{end_y}" stroke="#000" stroke-width="1.5" stroke-dasharray="5,5" marker-end="url(#a{fig_num})"/>\n'
        svg += f'  <text x="{lx}" y="{ly}" text-anchor="{lanchor}" font-size="10px" font-style="italic">&lt;&lt;{rel_type}&gt;&gt;</text>\n'
        
    svg += f'</svg>\n'
    svg += f'<div class="diagram-caption">Figure {fig_num}: System Use Case Model – {title}</div>\n'
    svg += f'</div>\n\n'
    svg += f'<hr class="sep">\n\n'
    return svg

new_blocks = ""

# Fig 16: Login
# User Login (0), Create Account (1), Authenticate (2)
# User Login (cx=250, cy=120)
# Create Account (cx=470, cy=65)
# Authenticate (cx=470, cy=175)
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--               MODULE 1: LOGIN ACCOUNT (Figure 16)               -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(16, "Login Account", 240, 105,
    [(0, 250, 120, "User Login", "")],
    [(1, 470, 65, "Create Account", ""), (2, 470, 175, "Authenticate via OAuth2", "")],
    [
        (1, 0, "extend", 360, 85, "middle"),
        (0, 2, "include", 360, 160, "middle")
    ],
    [0]
)

# Fig 17: Import & Integration
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--           MODULE 2: IMPORT & INTEGRATION (Figure 17)            -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(17, "Import & Integration", 240, 105,
    [(0, 250, 120, "Import from Google Drive", "")],
    [(1, 470, 65, "Connect Google Account", ""), (2, 470, 175, "Select Files to Import", "")],
    [
        (0, 1, "include", 360, 85, "middle"),
        (2, 0, "extend", 360, 160, "middle")
    ],
    [0]
)

# Fig 18: Workspace Manager
# Primary: Create (0), Organize (1)
# Secondary: Rename (2), Delete (3)
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--            MODULE 3: WORKSPACE MANAGER (Figure 18)              -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(18, "Workspace Manager", 260, 120,
    [(0, 240, 70, "Create Document", ""), (1, 240, 190, "Organize Folders", "")],
    [(2, 470, 130, "Rename Document", ""), (3, 470, 210, "Delete Document", "")],
    [
        (2, 1, "extend", 355, 155, "middle"),
        (3, 1, "extend", 355, 205, "middle")
    ],
    [0, 1]
)

# Fig 19: Custom Editor Workspace
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--        MODULE 4: CUSTOM EDITOR WORKSPACE (Figure 19)            -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(19, "Custom Editor Workspace", 280, 130,
    [(0, 240, 80, "Type and Edit Text", "")],
    [(1, 470, 45, "Apply Manual Formatting", ""), (2, 470, 115, "Use Markdown Shortcuts", ""), (3, 470, 210, "Real-time Preview", "")],
    [
        (1, 0, "extend", 355, 55, "middle"),
        (2, 0, "extend", 355, 90, "middle"),
        (0, 3, "include", 355, 155, "middle")
    ],
    [0]
)

# Fig 20: Presets & Rules
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--          MODULE 5: PRESETS & RULES ENGINE (Figure 20)           -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(20, "Presets & Rules Engine", 240, 105,
    [(0, 240, 120, "Manage Presets", "")],
    [(1, 470, 65, "Create Custom", "Formatting Bindings"), (2, 470, 175, "Apply Preset to Document", "")],
    [
        (1, 0, "extend", 355, 85, "middle"),
        (2, 0, "extend", 355, 160, "middle")
    ],
    [0]
)

# Fig 21: ML Prediction
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--        MODULE 6: ML PREDICTION & LEARNING (Figure 21)           -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(21, "ML Prediction & Learning", 240, 105,
    [(0, 240, 120, "Accept/Reject ML", "Suggestion")],
    [(1, 470, 65, "Generate Formatting", "Prediction"), (2, 470, 175, "View Confidence Score", "")],
    [
        (0, 1, "include", 355, 85, "middle"),
        (0, 2, "include", 355, 160, "middle")
    ],
    [0]
)

# Fig 22: Isolation Manager
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--           MODULE 7: ISOLATION MANAGER (Figure 22)               -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(22, "Isolation Manager", 180, 80,
    [(0, 240, 95, "Toggle Document Isolation", "")],
    [(1, 470, 95, "Exclude Data from", "ML Training")],
    [
        (0, 1, "include", 355, 90, "middle")
    ],
    [0]
)

# Fig 23: Grammar & Spelling Core
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--       MODULE 8: GRAMMAR & SPELLING CORE (Figure 23)             -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(23, "Grammar & Spelling Core", 240, 105,
    [(0, 240, 120, "Perform Grammar &", "Spelling Check")],
    [(1, 470, 65, "Resolve Grammar/", "Spelling Issues"), (2, 470, 175, "View Grammar Suggestions", "")],
    [
        (1, 0, "extend", 355, 85, "middle"),
        (0, 2, "include", 355, 160, "middle")
    ],
    [0]
)

# Fig 24: Analytics & Training
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--          MODULE 9: ANALYTICS & TRAINING (Figure 24)             -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(24, "Analytics & Training", 240, 105,
    [(0, 240, 70, "View Formatting Analytics", ""), (1, 240, 170, "Train Personalized", "ML Model")],
    [(2, 470, 120, "Log Behavioral Events", "")],
    [
        (1, 2, "include", 355, 160, "middle")
    ],
    [0, 1]
)

# Fig 25: Engage Chatbot
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--            MODULE 10: ENGAGE CHATBOT (Figure 25)                -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(25, "Engage Chatbot", 240, 105,
    [(0, 240, 120, "Open Chatbot", "")],
    [(1, 470, 65, "Ask Formatting Question", ""), (2, 470, 175, "Execute Natural Language", "Command")],
    [
        (1, 0, "extend", 355, 85, "middle"),
        (2, 0, "extend", 355, 160, "middle")
    ],
    [0]
)

new_blocks += "</body>\n</html>\n"

with open('use_case_diagrams.html', 'w', encoding='utf-8') as f:
    f.write(header + new_blocks)
