import re

with open('use_case_diagrams.html', 'r', encoding='utf-8') as f:
    content = f.read()

match = re.search(r'(<!-- ══════════════════════════════════════════════════════════════════ -->\s*<!--\s*MODULE 1: LOGIN ACCOUNT \(Figure 16\)\s*-->)', content)
if match:
    header = content[:match.start()]
else:
    print("Error: Could not find split point")
    exit(1)

def build_svg(fig_num, title, height, user_cy, all_bubbles):
    # all_bubbles: list of (text1, text2)
    
    svg = f'<div class="diagram-section">\n'
    svg += f'<svg viewBox="0 0 520 {height}" xmlns="http://www.w3.org/2000/svg" width="520" height="{height}">\n'
    svg += f'  <rect x="120" y="10" width="380" height="{height-20}" class="sys-boundary" rx="3"/>\n'
    svg += f'  <text x="310" y="32" text-anchor="middle" font-weight="bold" font-size="12px">{title}</text>\n\n'
    
    svg += f'  <!-- Actor -->\n'
    svg += f'  <circle cx="50" cy="{user_cy}" r="12" class="actor-head"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+12}" x2="50" y2="{user_cy+45}" class="actor-line"/>\n'
    svg += f'  <line x1="28" y1="{user_cy+28}" x2="72" y2="{user_cy+28}" class="actor-line"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+45}" x2="32" y2="{user_cy+72}" class="actor-line"/>\n'
    svg += f'  <line x1="50" y1="{user_cy+45}" x2="68" y2="{user_cy+72}" class="actor-line"/>\n'
    svg += f'  <text x="50" y="{user_cy+88}" text-anchor="middle">User</text>\n\n'
    
    # Bubbles
    for i, b in enumerate(all_bubbles):
        y_pos = 75 + i * 65
        cx = 310
        rx = 100
        ry = 22
        svg += f'  <ellipse cx="{cx}" cy="{y_pos}" rx="{rx}" ry="{ry}" class="uc-ellipse"/>\n'
        if isinstance(b, tuple) and len(b) > 1 and b[1]:
            svg += f'  <text x="{cx}" y="{y_pos-4}" text-anchor="middle">{b[0]}</text>\n'
            svg += f'  <text x="{cx}" y="{y_pos+8}" text-anchor="middle">{b[1]}</text>\n'
        else:
            txt = b[0] if isinstance(b, tuple) else b
            svg += f'  <text x="{cx}" y="{y_pos+4}" text-anchor="middle">{txt}</text>\n'
            
        # Draw line from user to this bubble
        # actor arm height is approx user_cy+28
        # actor line ends at x=72
        user_arm_y = user_cy + 28
        # Calculate a slight offset for each line so they don't originate from the exact same Y pixel
        y_offset = (i - len(all_bubbles)/2) * 5
        svg += f'  <line x1="72" y1="{user_arm_y + y_offset}" x2="{cx - rx}" y2="{y_pos}" class="uc-line"/>\n'
        
    svg += f'</svg>\n'
    svg += f'<div class="diagram-caption">Figure {fig_num}: System Use Case Model – {title}</div>\n'
    svg += f'</div>\n\n'
    svg += f'<hr class="sep">\n\n'
    return svg

new_blocks = ""

new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--               MODULE 1: LOGIN ACCOUNT (Figure 16)               -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(16, "Login Account", 260, 120,
    ["User Login", "Create Account", "Authenticate via OAuth2"]
)

new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--           MODULE 2: IMPORT & INTEGRATION (Figure 17)            -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(17, "Import & Integration", 260, 120,
    ["Import from Google Drive", "Connect Google Account", "Select Files to Import"]
)

new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--            MODULE 3: WORKSPACE MANAGER (Figure 18)              -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(18, "Workspace Manager", 310, 145,
    ["Create Document", "Rename Document", "Delete Document", "Organize Folders"]
)

new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--        MODULE 4: CUSTOM EDITOR WORKSPACE (Figure 19)            -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(19, "Custom Editor Workspace", 310, 145,
    ["Type and Edit Text", "Apply Manual Formatting", "Use Markdown Shortcuts", "Real-time Preview"]
)

new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--          MODULE 5: PRESETS & RULES ENGINE (Figure 20)           -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(20, "Presets & Rules Engine", 260, 120,
    ["Manage Presets", ("Create Custom", "Formatting Bindings"), "Apply Preset to Document"]
)

new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--        MODULE 6: ML PREDICTION & LEARNING (Figure 21)           -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(21, "ML Prediction & Learning", 260, 120,
    [("Generate Formatting", "Prediction"), ("Accept/Reject ML", "Suggestion"), "View Confidence Score"]
)

new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--           MODULE 7: ISOLATION MANAGER (Figure 22)               -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(22, "Isolation Manager", 220, 100,
    ["Toggle Document Isolation", ("Exclude Data from", "ML Training")]
)

new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--       MODULE 8: GRAMMAR & SPELLING CORE (Figure 23)             -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(23, "Grammar & Spelling Core", 260, 120,
    [("Perform Grammar &", "Spelling Check"), ("Resolve Grammar/", "Spelling Issues"), "View Grammar Suggestions"]
)

new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--          MODULE 9: ANALYTICS & TRAINING (Figure 24)             -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(24, "Analytics & Training", 260, 120,
    ["Log Behavioral Events", "View Formatting Analytics", ("Train Personalized", "ML Model")]
)

new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n"
new_blocks += "<!--            MODULE 10: ENGAGE CHATBOT (Figure 25)                -->\n"
new_blocks += "<!-- ══════════════════════════════════════════════════════════════════ -->\n\n"
new_blocks += build_svg(25, "Engage Chatbot", 260, 120,
    ["Open Chatbot", "Ask Formatting Question", ("Execute Natural Language", "Command")]
)

new_blocks += "</body>\n</html>\n"

with open('use_case_diagrams.html', 'w', encoding='utf-8') as f:
    f.write(header + new_blocks)
