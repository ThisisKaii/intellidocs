import re

with open('use_case_diagrams.html', 'r', encoding='utf-8') as f:
    content = f.read()

# I will replace the SVG blocks for Figures 16 to 25.

def get_svg_block(fig_num, title, bubbles, relationships, user_points_to):
    # bubbles: list of (x, y, text1, text2="")
    # relationships: list of (from_idx, to_idx, type) where type is 'include' or 'extend'
    # user_points_to: list of indices
    
    # We will use standard SVG structure for these figures.
    # Viewbox: 0 0 520 260 for 3 bubbles, 310 for 4 bubbles.
    height = 260 if len(bubbles) <= 3 else 310
    
    svg = f'<svg viewBox="0 0 520 {height}" xmlns="http://www.w3.org/2000/svg" width="520" height="{height}">\n'
    svg += f'  <defs>\n'
    svg += f'    <marker id="arrow-include" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto-start-reverse">\n'
    svg += f'      <polyline points="0,1 9,5 0,9" fill="none" stroke="#000" stroke-width="1.5"/>\n'
    svg += f'    </marker>\n'
    svg += f'  </defs>\n'
    svg += f'  <rect x="120" y="10" width="380" height="{height-20}" class="sys-boundary" rx="3"/>\n'
    svg += f'  <text x="310" y="32" text-anchor="middle" font-weight="bold" font-size="12px">{title}</text>\n\n'
    
    # User Actor
    actor_y = height // 2 - 10
    svg += f'  <circle cx="50" cy="{actor_y}" r="12" class="actor-head"/>\n'
    svg += f'  <line x1="50" y1="{actor_y+12}" x2="50" y2="{actor_y+45}" class="actor-line"/>\n'
    svg += f'  <line x1="28" y1="{actor_y+28}" x2="72" y2="{actor_y+28}" class="actor-line"/>\n'
    svg += f'  <line x1="50" y1="{actor_y+45}" x2="32" y2="{actor_y+72}" class="actor-line"/>\n'
    svg += f'  <line x1="50" y1="{actor_y+45}" x2="68" y2="{actor_y+72}" class="actor-line"/>\n'
    svg += f'  <text x="50" y="{actor_y+88}" text-anchor="middle">User</text>\n\n'
    
    # Bubbles
    bubble_coords = []
    for i, b in enumerate(bubbles):
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
        bubble_coords.append((cx, y_pos, rx, ry))
        
    # User lines
    for idx in user_points_to:
        bx, by, brx, bry = bubble_coords[idx]
        svg += f'  <line x1="72" y1="{actor_y+15}" x2="{bx-brx}" y2="{by}" class="uc-line"/>\n'
        
    # Relationships
    for from_idx, to_idx, rel_type in relationships:
        fx, fy, frx, fry = bubble_coords[from_idx]
        tx, ty, trx, try_val = bubble_coords[to_idx]
        
        # draw dashed arrow from (fx, fy) to (tx, ty)
        # we need to start from bottom/top of bubble
        if fy < ty:
            start_y = fy + fry
            end_y = ty - try_val - 2
            mid_y = (start_y + end_y) / 2
        else:
            start_y = fy - fry
            end_y = ty + try_val + 2
            mid_y = (start_y + end_y) / 2
            
        svg += f'  <line x1="{fx}" y1="{start_y}" x2="{tx}" y2="{end_y}" stroke="#000" stroke-width="1.5" stroke-dasharray="5,5" marker-end="url(#arrow-include)"/>\n'
        
        # Add label
        label = f"&lt;&lt;{rel_type}&gt;&gt;"
        # small offset for label
        svg += f'  <text x="{fx + 5}" y="{mid_y + 4}" text-anchor="start" font-size="10px" font-style="italic">{label}</text>\n'

    svg += '</svg>\n'
    svg += f'<div class="diagram-caption">Figure {fig_num}: System Use Case Model – {title}</div>\n'
    return svg

replacements = []

# Fig 16
fig16 = get_svg_block(16, "Login Account", 
                      ["User Login", "Create Account", "Authenticate via OAuth2"], 
                      [(1, 0, "extend"), (0, 2, "include")], 
                      [0])
replacements.append((138, 164, fig16))

# Fig 17
fig17 = get_svg_block(17, "Import & Integration", 
                      ["Import from Google Drive", "Connect Google Account", "Select Files to Import"], 
                      [(0, 1, "include"), (2, 0, "extend")], 
                      [0])
replacements.append((172, 198, fig17))

# Fig 18
fig18 = get_svg_block(18, "Workspace Manager", 
                      ["Create Document", "Rename Document", "Delete Document", "Organize Folders"], 
                      [(1, 3, "extend"), (2, 3, "extend")], 
                      [0, 3])
replacements.append((206, 236, fig18))

# Fig 19
fig19 = get_svg_block(19, "Custom Editor Workspace", 
                      ["Type and Edit Text", "Apply Manual Formatting", "Use Markdown Shortcuts", "Real-time Preview"], 
                      [(1, 0, "extend"), (2, 0, "extend"), (0, 3, "include")], 
                      [0])
replacements.append((244, 274, fig19))

# Fig 20
fig20 = get_svg_block(20, "Presets & Rules Engine", 
                      ["Manage Presets", ("Create Custom", "Formatting Bindings"), "Apply Preset to Document"], 
                      [(1, 0, "extend"), (2, 0, "extend")], 
                      [0])
replacements.append((282, 309, fig20))

# Fig 21
fig21 = get_svg_block(21, "ML Prediction & Learning", 
                      [("Generate Formatting", "Prediction"), ("Accept/Reject ML", "Suggestion"), "View Confidence Score"], 
                      [(1, 0, "include"), (1, 2, "include")], 
                      [1])
replacements.append((317, 345, fig21))

# Fig 22
fig22 = get_svg_block(22, "Isolation Manager", 
                      ["Toggle Document Isolation", ("Exclude Data from", "ML Training")], 
                      [(0, 1, "include")], 
                      [0])
replacements.append((353, 376, fig22))

# Fig 23
fig23 = get_svg_block(23, "Grammar & Spelling Core", 
                      [("Perform Grammar &", "Spelling Check"), ("Resolve Grammar/", "Spelling Issues"), "View Grammar Suggestions"], 
                      [(1, 0, "extend"), (0, 2, "include")], 
                      [0])
replacements.append((384, 412, fig23))

# Fig 24
fig24 = get_svg_block(24, "Analytics & Training", 
                      ["Log Behavioral Events", "View Formatting Analytics", ("Train Personalized", "ML Model")], 
                      [(2, 0, "include")], 
                      [1, 2])
replacements.append((420, 447, fig24))

# Fig 25
fig25 = get_svg_block(25, "Engage Chatbot", 
                      ["Open Chatbot", "Ask Formatting Question", ("Execute Natural Language", "Command")], 
                      [(1, 0, "extend"), (2, 0, "extend")], 
                      [0])
replacements.append((455, 482, fig25))

# We will just write a new file instead of replacing line by line, it's safer.
with open('use_case_diagrams_new.html', 'w', encoding='utf-8') as f:
    pass

import sys

lines = content.split('\n')
new_lines = []
skip_until = -1

for i, line in enumerate(lines):
    if i < skip_until:
        continue
    
    replaced = False
    for start, end, rep_text in replacements:
        if i == start - 1: # 0-indexed
            new_lines.append('<div class="diagram-section">')
            new_lines.append(rep_text)
            new_lines.append('</div>')
            skip_until = end
            replaced = True
            break
            
    if not replaced and i >= skip_until:
        new_lines.append(line)

with open('use_case_diagrams.html', 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines))

print("Successfully replaced all models.")
