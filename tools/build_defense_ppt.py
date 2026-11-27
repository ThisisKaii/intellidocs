from pathlib import Path
from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

OUT_PATH = Path("docs/manuscript/IntelliDocs_Oral_Defense.pptx")
CH3_DIR = Path("docs/manuscript/figures/chapter_3")
TMP_DIR = Path("Temp/ppt_assets")

# Widescreen 16:9
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

# Palette
C_NAVY = RGBColor(0x0F, 0x17, 0x2A)       # Deep Slate Navy
C_NAVY_CARD = RGBColor(0x1E, 0x29, 0x3B)  # Dark Slate Card
C_BG = RGBColor(0xF8, 0xFA, 0xFC)         # Clean Off-White
C_WHITE = RGBColor(0xFF, 0xFF, 0xFF)
C_BORDER = RGBColor(0xCB, 0xD5, 0xE1)
C_BLUE = RGBColor(0x1D, 0x4E, 0xD8)       # IntelliDocs Royal Blue
C_BLUE_LIGHT = RGBColor(0xDB, 0xEA, 0xFE)
C_SKY = RGBColor(0x38, 0xBD, 0xF8)
C_GREEN = RGBColor(0x05, 0x96, 0x69)
C_GREEN_BG = RGBColor(0xD1, 0xFA, 0xE5)
C_AMBER = RGBColor(0xD9, 0x77, 0x06)
C_TEXT = RGBColor(0x1E, 0x29, 0x3B)
C_MUTED = RGBColor(0x64, 0x74, 0x8B)
C_LIGHT_TEXT = RGBColor(0xE2, 0xE8, 0xF0)

FONT = "Segoe UI"


def set_bg(slide, color):
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color


def add_rect(slide, left, top, width, height, fill_color, border_color=None, border_pt=1, rounded=True):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE
    shp = slide.shapes.add_shape(shape_type, left, top, width, height)
    if rounded:
        shp.adjustments[0] = 0.04
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill_color
    if border_color:
        shp.line.color.rgb = border_color
        shp.line.width = Pt(border_pt)
    else:
        shp.line.fill.background()
    return shp


def add_textbox(slide, left, top, width, height, text="", size=14, bold=False, italic=False,
                color=C_TEXT, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = Inches(0.05)
    tf.margin_right = Inches(0.05)
    tf.margin_top = Inches(0.03)
    tf.margin_bottom = Inches(0.03)
    if text:
        p = tf.paragraphs[0]
        p.alignment = align
        r = p.add_run()
        r.text = text
        r.font.name = FONT
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.italic = italic
        r.font.color.rgb = color
    return tb


def add_header(slide, kicker, title, slide_num):
    set_bg(slide, C_BG)
    # Top accent bar
    add_rect(slide, Inches(0), Inches(0), SLIDE_W, Inches(0.08), C_BLUE, rounded=False)
    # Kicker pill
    pill = add_rect(slide, Inches(0.55), Inches(0.25), Inches(2.5), Inches(0.32), C_BLUE_LIGHT, rounded=True)
    pill.adjustments[0] = 0.5
    add_textbox(slide, Inches(0.6), Inches(0.25), Inches(2.4), Inches(0.32),
                kicker.upper(), size=10, bold=True, color=C_BLUE, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    # Title
    add_textbox(slide, Inches(0.55), Inches(0.62), Inches(11.6), Inches(0.55),
                title, size=25, bold=True, color=C_TEXT)
    # Divider
    add_rect(slide, Inches(0.55), Inches(1.22), Inches(12.23), Inches(0.02), C_BORDER, rounded=False)
    # Footer
    add_textbox(slide, Inches(0.55), Inches(7.12), Inches(9.0), Inches(0.28),
                "IntelliDocs  |  Oral Defense Presentation  |  University of Cebu – Lapu-Lapu and Mandaue",
                size=9.5, color=C_MUTED)
    add_textbox(slide, Inches(11.8), Inches(7.12), Inches(0.98), Inches(0.28),
                f"{slide_num}", size=10, bold=True, color=C_MUTED, align=PP_ALIGN.RIGHT)


def add_bullets(tf, items, size=14.5, space_after=8, color=C_TEXT, bullet_char="• "):
    for idx, item in enumerate(items):
        p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
        p.space_after = Pt(space_after)
        p.line_spacing = 1.18
        if isinstance(item, tuple):
            lead, rest = item
            r0 = p.add_run()
            r0.text = bullet_char + lead
            r0.font.name = FONT
            r0.font.size = Pt(size)
            r0.font.bold = True
            r0.font.color.rgb = C_BLUE if color == C_TEXT else C_SKY
            r1 = p.add_run()
            r1.text = rest
            r1.font.name = FONT
            r1.font.size = Pt(size)
            r1.font.color.rgb = color
        else:
            r = p.add_run()
            r.text = bullet_char + item
            r.font.name = FONT
            r.font.size = Pt(size)
            r.font.color.rgb = color


def add_fitted_image(slide, img_path, box_left, box_top, box_w, box_h):
    """Add an image centered and aspect-ratio fitted inside the given box."""
    with Image.open(img_path) as im:
        iw, ih = im.size
    box_ratio = box_w / box_h
    img_ratio = iw / ih
    if img_ratio > box_ratio:
        w = box_w
        h = box_w / img_ratio
    else:
        h = box_h
        w = box_h * img_ratio
    left = box_left + (box_w - w) / 2
    top = box_top + (box_h - h) / 2
    slide.shapes.add_picture(str(img_path), left, top, width=w, height=h)


def build_diagram_slide(prs, kicker, title, img_path, notes_title, bullets, slide_num):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_header(slide, kicker, title, slide_num)

    # Left card for diagram
    add_rect(slide, Inches(0.55), Inches(1.4), Inches(8.6), Inches(5.55), C_WHITE, C_BORDER, 1)
    if img_path.exists():
        add_fitted_image(slide, img_path, Inches(0.68), Inches(1.52), Inches(8.34), Inches(5.31))
    else:
        add_textbox(slide, Inches(0.7), Inches(3.8), Inches(8.3), Inches(0.5),
                    f"[Missing diagram: {img_path.name}]", size=14, color=C_MUTED, align=PP_ALIGN.CENTER)

    # Right card for concise oral talking points
    add_rect(slide, Inches(9.35), Inches(1.4), Inches(3.43), Inches(5.55), C_WHITE, C_BORDER, 1)
    add_rect(slide, Inches(9.35), Inches(1.4), Inches(3.43), Inches(0.45), C_BLUE, rounded=False)
    add_textbox(slide, Inches(9.5), Inches(1.4), Inches(3.15), Inches(0.45),
                notes_title, size=13, bold=True, color=C_WHITE, anchor=MSO_ANCHOR.MIDDLE)
    tb = add_textbox(slide, Inches(9.5), Inches(2.0), Inches(3.15), Inches(4.8))
    add_bullets(tb.text_frame, bullets, size=13.5, space_after=11)


def main():
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    blank = prs.slide_layouts[6]

    # =========================================================================
    # SLIDE 1: Concept / Explainer Video
    # =========================================================================
    s1 = prs.slides.add_slide(blank)
    set_bg(s1, C_NAVY)
    add_rect(s1, Inches(0), Inches(0), SLIDE_W, Inches(0.1), C_BLUE, rounded=False)
    add_textbox(s1, Inches(0.8), Inches(0.45), Inches(11.7), Inches(0.4),
                "01  |  CONCEPT OVERVIEW", size=12, bold=True, color=C_SKY, align=PP_ALIGN.CENTER)
    add_textbox(s1, Inches(0.8), Inches(0.85), Inches(11.7), Inches(0.6),
                "IntelliDocs Explainer Video", size=30, bold=True, color=C_WHITE, align=PP_ALIGN.CENTER)

    # Video placeholder box
    add_rect(s1, Inches(1.9), Inches(1.65), Inches(9.53), Inches(5.1), C_NAVY_CARD, C_BLUE, 2)
    play_btn = s1.shapes.add_shape(MSO_SHAPE.OVAL, Inches(6.16), Inches(3.55), Inches(1.0), Inches(1.0))
    play_btn.fill.solid()
    play_btn.fill.fore_color.rgb = C_BLUE
    play_btn.line.fill.background()
    add_textbox(s1, Inches(6.22), Inches(3.55), Inches(0.95), Inches(1.0),
                "▶", size=28, bold=True, color=C_WHITE, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    add_textbox(s1, Inches(2.2), Inches(4.75), Inches(8.93), Inches(0.6),
                "[ Insert / Play Concept Video Here ]", size=18, bold=True, color=C_LIGHT_TEXT, align=PP_ALIGN.CENTER)
    add_textbox(s1, Inches(2.2), Inches(5.3), Inches(8.93), Inches(0.5),
                "Intelligent Document Editing with Behavioral Learning & Automated Formatting",
                size=13, italic=True, color=C_MUTED, align=PP_ALIGN.CENTER)

    # =========================================================================
    # SLIDE 2: Title Page (Title + Proponents with Role)
    # =========================================================================
    s2 = prs.slides.add_slide(blank)
    set_bg(s2, C_NAVY)
    add_rect(s2, Inches(0), Inches(0), SLIDE_W, Inches(0.1), C_BLUE, rounded=False)
    add_textbox(s2, Inches(0.8), Inches(0.45), Inches(11.7), Inches(0.35),
                "UNIVERSITY OF CEBU – LAPU-LAPU AND MANDAUE  |  COLLEGE OF COMPUTER STUDIES",
                size=11.5, bold=True, color=C_SKY, align=PP_ALIGN.CENTER)
    add_textbox(s2, Inches(0.8), Inches(0.95), Inches(11.7), Inches(1.35),
                "INTELLIDOCS: AN INTELLIGENT DOCUMENT EDITING SYSTEM WITH\nBEHAVIORAL LEARNING AND AUTOMATED FORMATTING",
                size=26, bold=True, color=C_WHITE, align=PP_ALIGN.CENTER)
    add_textbox(s2, Inches(0.8), Inches(2.35), Inches(11.7), Inches(0.4),
                "Capstone Project Oral Defense  •  Adviser: Ms. Gian S. Mahusay  •  December 2026",
                size=13, italic=True, color=C_LIGHT_TEXT, align=PP_ALIGN.CENTER)

    add_textbox(s2, Inches(0.8), Inches(3.05), Inches(11.7), Inches(0.35),
                "PROPONENTS & ROLES", size=12, bold=True, color=C_SKY, align=PP_ALIGN.CENTER)

    proponents = [
        ("Marjun A. Amamence", "Project Manager & Full-Stack Developer",
         "• Account Management\n• Custom TipTap Document Editor\n• Team Coordination & Delivery"),
        ("Joshua L. Asingua", "AI / ML & Backend Developer",
         "• Formatting Prediction Engine\n• Behavioral Learning Pipeline\n• Grammar & Spelling Checking"),
        ("RJ Alenton", "Full-Stack & Admin Developer",
         "• Document Management\n• AI Chat Overlay (MCP)\n• Admin & User Verification"),
        ("Christian Paulo A. Dagupan", "Frontend & Collaboration Developer",
         "• Folder Management\n• Document Comments\n• Document Review & Classes"),
    ]
    card_w = Inches(2.82)
    gap = Inches(0.22)
    start_x = Inches(0.68)
    for idx, (name, role, scope) in enumerate(proponents):
        cx = start_x + idx * (card_w + gap)
        add_rect(s2, cx, Inches(3.5), card_w, Inches(3.15), C_NAVY_CARD, C_BLUE if idx == 0 else RGBColor(0x33, 0x41, 0x55), 1.5)
        add_rect(s2, cx, Inches(3.5), card_w, Inches(0.08), C_SKY if idx == 0 else C_BLUE, rounded=False)
        add_textbox(s2, cx + Inches(0.14), Inches(3.68), card_w - Inches(0.28), Inches(0.55),
                    name, size=14.5, bold=True, color=C_WHITE)
        add_textbox(s2, cx + Inches(0.14), Inches(4.22), card_w - Inches(0.28), Inches(0.52),
                    role, size=11.5, bold=True, color=C_SKY)
        add_textbox(s2, cx + Inches(0.14), Inches(4.85), card_w - Inches(0.28), Inches(1.65),
                    scope, size=11.5, color=C_LIGHT_TEXT)

    # =========================================================================
    # SLIDE 3: Chapter 1 - Objectives of the Study (In Toto / Verbatim)
    # =========================================================================
    s3 = prs.slides.add_slide(blank)
    add_header(s3, "Chapter 1  |  Introduction", "Objectives of the Study (In Toto)", 3)

    # General Objective card
    add_rect(s3, Inches(0.55), Inches(1.38), Inches(12.23), Inches(1.42), C_WHITE, C_BLUE, 1.5)
    add_rect(s3, Inches(0.55), Inches(1.38), Inches(0.1), Inches(1.42), C_BLUE, rounded=False)
    add_textbox(s3, Inches(0.8), Inches(1.45), Inches(11.8), Inches(0.32),
                "GENERAL OBJECTIVE", size=11.5, bold=True, color=C_BLUE)
    add_textbox(
        s3, Inches(0.8), Inches(1.78), Inches(11.8), Inches(0.95),
        "To design, develop, and implement a web-based intelligent document editing system that leverages "
        "machine learning to understand user formatting behaviors, automate repetitive styling tasks, and offer "
        "a natural language command interface, with continuous refinement driven by user feedback in University "
        "of Cebu Lapu-Lapu and Mandaue.",
        size=13.5, color=C_TEXT,
    )

    # Specific Objectives (2 columns)
    add_rect(s3, Inches(0.55), Inches(2.98), Inches(5.98), Inches(3.98), C_WHITE, C_BORDER, 1)
    add_rect(s3, Inches(6.80), Inches(2.98), Inches(5.98), Inches(3.98), C_WHITE, C_BORDER, 1)

    tb_left = add_textbox(s3, Inches(0.75), Inches(3.12), Inches(5.6), Inches(3.75))
    tf_l = tb_left.text_frame
    p = tf_l.paragraphs[0]
    p.space_after = Pt(6)
    r = p.add_run()
    r.text = "SPECIFIC OBJECTIVES (1 & 3–4)"
    r.font.name = FONT; r.font.size = Pt(11.5); r.font.bold = True; r.font.color.rgb = C_BLUE

    spec_left = [
        "1. Analyze existing document editing systems by evaluating:",
        "   1.1. current formatting processes and workflow structures; and",
        "   1.2. common challenges, including repetitive manual formatting, lack of personalization, and limited intelligent automation.",
        "3. Determine the most effective features to be included in the Intelligent Document Editing System.",
        "4. Assess the acceptability and effectiveness of the proposed system among target users.",
    ]
    for line in spec_left:
        p = tf_l.add_paragraph()
        p.space_after = Pt(7)
        p.line_spacing = 1.15
        r = p.add_run()
        r.text = line
        r.font.name = FONT
        r.font.size = Pt(12.5)
        r.font.color.rgb = C_TEXT

    tb_right = add_textbox(s3, Inches(7.0), Inches(3.12), Inches(5.6), Inches(3.75))
    tf_r = tb_right.text_frame
    p = tf_r.paragraphs[0]
    p.space_after = Pt(6)
    r = p.add_run()
    r.text = "SPECIFIC OBJECTIVE (2)"
    r.font.name = FONT; r.font.size = Pt(11.5); r.font.bold = True; r.font.color.rgb = C_BLUE

    spec_right = [
        "2. Identify and integrate key mechanisms and techniques for the proposed system, specifically:",
        "   2.1. behavioral tracking of user formatting actions as sequential patterns;",
        "   2.2. machine learning-based prediction of formatting actions with confidence scoring;",
        "   2.3. a natural language command interface to enable efficient bulk formatting operations; and",
        "   2.4. continuous improvement through reinforcement learning from accepted suggestions and retraining from rejected ones.",
    ]
    for line in spec_right:
        p = tf_r.add_paragraph()
        p.space_after = Pt(7)
        p.line_spacing = 1.15
        r = p.add_run()
        r.text = line
        r.font.name = FONT
        r.font.size = Pt(12.5)
        r.font.color.rgb = C_TEXT

    # =========================================================================
    # SLIDE 4: Chapter 1 - Scope and Limitations (Bulleted terms)
    # =========================================================================
    s4 = prs.slides.add_slide(blank)
    add_header(s4, "Chapter 1  |  Introduction", "Scope and Limitations of the Study", 4)

    # Scope Card
    add_rect(s4, Inches(0.55), Inches(1.42), Inches(5.98), Inches(5.5), C_WHITE, C_BORDER, 1)
    add_rect(s4, Inches(0.55), Inches(1.42), Inches(5.98), Inches(0.52), C_BLUE, rounded=False)
    add_textbox(s4, Inches(0.75), Inches(1.42), Inches(5.6), Inches(0.52),
                "SYSTEM SCOPE", size=14, bold=True, color=C_WHITE, anchor=MSO_ANCHOR.MIDDLE)
    tb_scope = add_textbox(s4, Inches(0.75), Inches(2.12), Inches(5.6), Inches(4.65))
    add_bullets(tb_scope.text_frame, [
        ("Secure Web Access: ", "User registration, authentication, and browser-based editing"),
        ("Sequential Behavior Tracking: ", "Relative position, text length, punctuation context"),
        ("Hybrid ML Prediction: ", "Rule-based + neural confidence-scored suggestions"),
        ("Natural Language Commands: ", "Plain-text bulk formatting operations"),
        ("Adaptive Retraining: ", "Continuous learning from accept / reject feedback"),
        ("Cloud Integrity: ", "Real-time auto-save & responsive desktop/mobile UI"),
    ], size=14, space_after=12)

    # Limitations Card
    add_rect(s4, Inches(6.80), Inches(1.42), Inches(5.98), Inches(5.5), C_WHITE, C_BORDER, 1)
    add_rect(s4, Inches(6.80), Inches(1.42), Inches(5.98), Inches(0.52), C_NAVY, rounded=False)
    add_textbox(s4, Inches(7.0), Inches(1.42), Inches(5.6), Inches(0.52),
                "SYSTEM LIMITATIONS", size=14, bold=True, color=C_WHITE, anchor=MSO_ANCHOR.MIDDLE)
    tb_lim = add_textbox(s4, Inches(7.0), Inches(2.12), Inches(5.6), Inches(4.65))
    add_bullets(tb_lim.text_frame, [
        ("Internet Dependency: ", "Online web app only; no offline editing support"),
        ("Session Scope: ", "Single-user active editing focus per session"),
        ("Styling-Only NLP: ", "Commands execute formatting, not content generation"),
        ("Cold-Start Curve: ", "Early predictions require consistent usage data"),
    ], size=14.5, space_after=16)

    # =========================================================================
    # SLIDES 5–11: Chapter 3 Diagrams
    # =========================================================================
    build_diagram_slide(
        prs, "Chapter 3  |  Methodology", "Functional Decomposition Diagram",
        CH3_DIR / "functional_decomposition.png", "System Breakdown",
        [
            ("3 User Roles: ", "Student, Professor, and Administrator"),
            ("11 Core Modules: ", "Account, Documents, Folders, Editor, ML Prediction, Behavioral Learning, Grammar, AI Chat, Comments, Review, Admin"),
            ("Modular MVC: ", "Clear separation of UI, API controllers, and ML services"),
        ], 5
    )

    build_diagram_slide(
        prs, "Chapter 3  |  Methodology", "Use Case Diagram",
        CH3_DIR / "use_case.png", "Actor Interactions",
        [
            ("Student: ", "Creates/imports docs, uses TipTap editor, applies ML suggestions, AI chat, joins classes"),
            ("Professor: ", "Creates classes, reviews submissions, checks originality & compliance"),
            ("Administrator: ", "Verifies accounts, manages users, monitors reports & research data"),
        ], 6
    )

    build_diagram_slide(
        prs, "Chapter 3  |  Methodology", "Entity Relationship Diagram (ERD)",
        CH3_DIR / "erd_chen.png", "Data Architecture",
        [
            ("Core Entities: ", "Users, Documents, Folders, Document Versions, Comments"),
            ("Learning & ML: ", "Behavior Logs, Formatting Suggestions, User Feedback"),
            ("Academic Suite: ", "Classes, Submissions, Originality & Compliance Records"),
        ], 7
    )

    build_diagram_slide(
        prs, "Chapter 3  |  Methodology", "Technology Stack",
        CH3_DIR / "technology_stack.png", "4-Tier Stack",
        [
            ("Frontend: ", "React 18, TypeScript, Vite, TipTap (ProseMirror), Tailwind CSS"),
            ("Backend & MCP: ", "Node.js 20, Express, Zod, Model Context Protocol"),
            ("AI / ML Service: ", "Python 3, FastAPI, scikit-learn, PyTorch"),
            ("Storage & Cache: ", "Supabase (PostgreSQL + pgvector), Redis, DuckDB"),
        ], 8
    )

    build_diagram_slide(
        prs, "Chapter 3  |  Methodology", "Network Design",
        CH3_DIR / "network_design.png", "Infrastructure Flow",
        [
            ("Client Layer: ", "Modern web browsers over HTTPS"),
            ("Application Tier: ", "Express REST API + MCP tool orchestration"),
            ("ML Microservice: ", "Dedicated FastAPI prediction & grammar service"),
            ("Data Tier: ", "Supabase cloud DB, Redis failover cache, DuckDB analytics"),
        ], 9
    )

    build_diagram_slide(
        prs, "Chapter 3  |  Methodology", "Business Roadmap",
        TMP_DIR / "business_roadmap.png", "2026–2027 Phases",
        [
            ("Phase 1 (Planning): ", "Requirements, RRL, BMC, validation board, wireframes"),
            ("Phase 2 (Design): ", "Architecture, ERD, FDD, use cases, network model"),
            ("Phase 3 (Build): ", "Custom TipTap editor, ML training, behavioral pipeline"),
            ("Phase 4 (Launch): ", "Testing validation, deployment, campus adoption"),
        ], 10
    )

    build_diagram_slide(
        prs, "Chapter 3  |  Methodology", "Gantt Chart",
        TMP_DIR / "gantt_chart.png", "Project Schedule",
        [
            ("Agile Sprints: ", "Iterative planning, design, development, and QA cycles"),
            ("Milestones: ", "Core editor build → ML pre-training → Full-stack integration"),
            ("Verification: ", "End-to-end Selenium & Pytest suite validation"),
        ], 11
    )

    # =========================================================================
    # SLIDE 12: Chapter 3 - List of Modules
    # =========================================================================
    s12 = prs.slides.add_slide(blank)
    add_header(s12, "Chapter 3  |  Methodology", "List of Modules", 12)

    rows_data = [
        ("Module", "Lead Proponent", "Key Sub-Modules", "Roles"),
        ("1. Account Management", "Amamence, Marjun", "Register, Login, Logout, Profile, 2FA/Security", "Student, Prof, Admin"),
        ("2. Document Management", "Alenton, RJ", "Create, Open, Auto-Save, Import/Export, Share, Pin, Recent, Search, History", "Student, Prof"),
        ("3. Folder Management", "Dagupan, Christian Paulo", "Create, Rename, Delete, Move Document to Folder", "Student, Prof"),
        ("4. Document Editor", "Amamence, Marjun", "Rich Text, Headings, Alignment, Lists, Tables, Images, Page Setup", "Student, Prof"),
        ("5. Formatting Prediction", "Asingua, Joshua", "Confidence-Scored Suggestions, Style Presets, One-Click Apply", "Student, Prof"),
        ("6. Behavioral Learning", "Asingua, Joshua", "Sequential Tracking, Redis Buffer, DuckDB Aggregation, Fine-Tuning", "Student, Prof"),
        ("7. Grammar & Spelling", "Asingua, Joshua", "Inline Wavy Underlines, Contextual Grammar & Spell Fixes", "Student, Prof"),
        ("8. AI Chat Overlay", "Alenton, RJ", "Natural Language Bulk Formatting, Preview & Confirm (MCP)", "Student, Prof"),
        ("9. Document Comments", "Dagupan, Christian Paulo", "Add, Reply, Resolve, Delete Inline Comments", "Student, Prof"),
        ("10. Document Review", "Dagupan, Christian Paulo", "Classes, Submissions, Plagiarism & Compliance Checks", "Student, Prof"),
        ("11. Admin Management", "Alenton, RJ", "User Verification, Account Management, Reports, Research Data", "Admin"),
    ]
    tbl_shape = s12.shapes.add_table(len(rows_data), 4, Inches(0.55), Inches(1.4), Inches(12.23), Inches(5.5))
    tbl = tbl_shape.table
    col_widths = [Inches(2.55), Inches(2.25), Inches(5.43), Inches(2.0)]
    for i, w in enumerate(col_widths):
        tbl.columns[i].width = w

    for r_idx, row in enumerate(rows_data):
        for c_idx, val in enumerate(row):
            cell = tbl.cell(r_idx, c_idx)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.margin_left = Inches(0.08)
            cell.margin_right = Inches(0.08)
            cell.margin_top = Inches(0.04)
            cell.margin_bottom = Inches(0.04)
            cell.fill.solid()
            if r_idx == 0:
                cell.fill.fore_color.rgb = C_BLUE
            elif r_idx % 2 == 1:
                cell.fill.fore_color.rgb = C_WHITE
            else:
                cell.fill.fore_color.rgb = RGBColor(0xF1, 0xF5, 0xF9)

            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.LEFT
            run = p.add_run()
            run.text = val
            run.font.name = FONT
            run.font.size = Pt(11.5 if r_idx == 0 else 10.5)
            run.font.bold = (r_idx == 0 or c_idx == 0)
            run.font.color.rgb = C_WHITE if r_idx == 0 else C_TEXT

    # =========================================================================
    # SLIDE 13: Chapter 3 - Testing Strategy
    # =========================================================================
    s13 = prs.slides.add_slide(blank)
    add_header(s13, "Chapter 3  |  Methodology", "Software Testing Strategy", 13)

    stages = [
        ("01  UNIT TESTING", "131 Automated Cases",
         "Verifies each of the 11 modules independently using headless Selenium & Pytest — covering normal workflows, input validation, and error handling."),
        ("02  INTEGRATION TESTING", "16 End-to-End Workflows",
         "Validates cross-module data flow across React, Express API, Supabase, Redis, DuckDB, and the Python FastAPI ML microservice."),
        ("03  ALPHA TESTING", "Internal QA Verification",
         "Evaluates UI responsiveness, formatting fidelity (.docx/.pdf import-export), and model prediction behavior prior to user evaluation."),
        ("04  ACCEPTANCE TESTING", "N = 406 Target Evaluators",
         "Measures acceptability, usability, and perceived effectiveness among UCLM students and faculty via structured 5-point Likert evaluation."),
    ]
    for idx, (st_title, st_sub, st_desc) in enumerate(stages):
        col = idx % 2
        row = idx // 2
        x = Inches(0.55) + col * Inches(6.25)
        y = Inches(1.45) + row * Inches(2.75)
        add_rect(s13, x, y, Inches(5.98), Inches(2.5), C_WHITE, C_BORDER, 1)
        add_rect(s13, x, y, Inches(5.98), Inches(0.48), C_BLUE if row == 0 else C_NAVY, rounded=False)
        add_textbox(s13, x + Inches(0.18), y, Inches(3.2), Inches(0.48),
                    st_title, size=13, bold=True, color=C_WHITE, anchor=MSO_ANCHOR.MIDDLE)
        add_textbox(s13, x + Inches(3.3), y, Inches(2.5), Inches(0.48),
                    st_sub, size=11.5, bold=True, color=C_SKY, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
        add_textbox(s13, x + Inches(0.2), y + Inches(0.68), Inches(5.58), Inches(1.65),
                    st_desc, size=13.5, color=C_TEXT)

    # =========================================================================
    # SLIDE 14: Chapter 4 - Presentation and Interpretation of Data (Survey)
    # =========================================================================
    s14 = prs.slides.add_slide(blank)
    add_header(s14, "Chapter 4  |  Results & Data", "Presentation and Interpretation of Data (N = 406)", 14)

    kpis = [
        ("406", "Total Respondents", "UCLM Students & Faculty (95.32% aged 18–25)", C_BLUE),
        ("93.10%", "Prior AI Tool Usage", "378 / 406 experienced with AI writing tools", C_BLUE),
        ("4.17 / 5.0", "Manual Formatting Load", "Grand Mean (Agree) — headings/spacing M = 4.52", C_AMBER),
        ("4.25 / 5.0", "Proposed Feature Rating", "High agreement on confidence-scored previews & AI", C_GREEN),
    ]
    for idx, (val, lbl, sub, col) in enumerate(kpis):
        kx = Inches(0.55) + idx * Inches(3.11)
        add_rect(s14, kx, Inches(1.4), Inches(2.9), Inches(1.65), C_WHITE, C_BORDER, 1)
        add_rect(s14, kx, Inches(1.4), Inches(2.9), Inches(0.08), col, rounded=False)
        add_textbox(s14, kx + Inches(0.15), Inches(1.55), Inches(2.6), Inches(0.55),
                    val, size=24, bold=True, color=col)
        add_textbox(s14, kx + Inches(0.15), Inches(2.12), Inches(2.6), Inches(0.32),
                    lbl, size=12, bold=True, color=C_TEXT)
        add_textbox(s14, kx + Inches(0.15), Inches(2.45), Inches(2.6), Inches(0.5),
                    sub, size=10.5, color=C_MUTED)

    # Key findings table
    survey_rows = [
        ("Dimension Evaluated", "Key Finding / Indicator", "Mean", "Interpretation"),
        ("Current Formatting Practices", "Excessive time spent on headings, spacing & margins (CFP)", "4.17", "Agree"),
        ("Problems in Existing Editors", "Lack of adaptive personalization to user habits (M = 4.27)", "3.57*", "Agree"),
        ("Behavioral & ML Mechanisms", "Confidence-scored suggestions & accept/reject control", "4.21", "Strongly Agree"),
        ("AI Chat & Grammar Features", "NL bulk commands (M = 4.26) & inline grammar check (M = 4.24)", "4.25", "Strongly Agree"),
        ("Collaboration & Interoperability", "Real-time sharing (M = 4.24) & .docx/.pdf export (M = 4.20)", "4.22", "Strongly Agree"),
    ]
    stbl_s = s14.shapes.add_table(len(survey_rows), 4, Inches(0.55), Inches(3.25), Inches(12.23), Inches(3.55))
    stbl = stbl_s.table
    for i, w in enumerate([Inches(3.2), Inches(5.63), Inches(1.3), Inches(2.1)]):
        stbl.columns[i].width = w
    for r_i, row in enumerate(survey_rows):
        for c_i, val in enumerate(row):
            cell = stbl.cell(r_i, c_i)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.margin_left = Inches(0.1); cell.margin_right = Inches(0.1)
            cell.fill.solid()
            cell.fill.fore_color.rgb = C_BLUE if r_i == 0 else (C_WHITE if r_i % 2 == 1 else RGBColor(0xF1, 0xF5, 0xF9))
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER if c_i >= 2 else PP_ALIGN.LEFT
            run = p.add_run()
            run.text = val
            run.font.name = FONT
            run.font.size = Pt(12 if r_i == 0 else 11.5)
            run.font.bold = (r_i == 0 or c_i == 0 or c_i == 2)
            run.font.color.rgb = C_WHITE if r_i == 0 else C_TEXT

    add_textbox(s14, Inches(0.55), Inches(6.82), Inches(12.23), Inches(0.28),
                "*Reverse-adjusted Grand Mean for PEEP items. Qualitative feedback (n = 284) prioritized discipline templates (19.01%).",
                size=10, italic=True, color=C_MUTED)

    # =========================================================================
    # SLIDE 15: Chapter 4 - Software Testing Results
    # =========================================================================
    s15 = prs.slides.add_slide(blank)
    add_header(s15, "Chapter 4  |  Results & Data", "Automated Software Testing Results", 15)

    test_kpis = [
        ("147 / 147", "Total Test Cases Passed", "100% Pass Rate  |  0 Failed  |  0 Skipped", C_GREEN),
        ("131", "Unit Test Cases", "Executed across all 11 functional modules", C_BLUE),
        ("16", "Integration Test Cases", "End-to-end multi-module user workflows", C_BLUE),
    ]
    for idx, (val, lbl, sub, col) in enumerate(test_kpis):
        kx = Inches(0.55) + idx * Inches(4.15)
        add_rect(s15, kx, Inches(1.4), Inches(3.93), Inches(1.45), C_WHITE, C_BORDER, 1)
        add_rect(s15, kx, Inches(1.4), Inches(3.93), Inches(0.08), col, rounded=False)
        add_textbox(s15, kx + Inches(0.18), Inches(1.52), Inches(3.55), Inches(0.55),
                    val, size=24, bold=True, color=col)
        add_textbox(s15, kx + Inches(0.18), Inches(2.08), Inches(3.55), Inches(0.32),
                    lbl, size=12.5, bold=True, color=C_TEXT)
        add_textbox(s15, kx + Inches(0.18), Inches(2.4), Inches(3.55), Inches(0.35),
                    sub, size=10.5, color=C_MUTED)

    test_rows = [
        ("Test Suite / Module", "Cases", "Passed", "Status"),
        ("UT-01  Account Management", "11", "11", "PASSED"),
        ("UT-02  Document Management (incl. Pin, Recent, Shared, History)", "25", "25", "PASSED"),
        ("UT-03  Folder Management", "8", "8", "PASSED"),
        ("UT-04  Document Editor (incl. Tables, Images, Page Setup)", "24", "24", "PASSED"),
        ("UT-05  Formatting Prediction", "11", "11", "PASSED"),
        ("UT-06  Behavioral Learning", "8", "8", "PASSED"),
        ("UT-07  Grammar & Spelling", "8", "8", "PASSED"),
        ("UT-08  AI Chat Overlay", "10", "10", "PASSED"),
        ("UT-09  Document Comments", "4", "4", "PASSED"),
        ("UT-10  Document Review (Classes, Submissions, Originality)", "14", "14", "PASSED"),
        ("UT-11  Admin Management", "8", "8", "PASSED"),
        ("IT-01 to IT-16  End-to-End Integration Suite", "16", "16", "PASSED"),
    ]
    ttbl_s = s15.shapes.add_table(len(test_rows), 4, Inches(0.55), Inches(3.02), Inches(12.23), Inches(3.92))
    ttbl = ttbl_s.table
    for i, w in enumerate([Inches(7.33), Inches(1.5), Inches(1.5), Inches(1.9)]):
        ttbl.columns[i].width = w
    for r_i, row in enumerate(test_rows):
        for c_i, val in enumerate(row):
            cell = ttbl.cell(r_i, c_i)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.margin_left = Inches(0.1); cell.margin_right = Inches(0.1)
            cell.margin_top = Inches(0.02); cell.margin_bottom = Inches(0.02)
            cell.fill.solid()
            if r_i == 0:
                cell.fill.fore_color.rgb = C_NAVY
            elif c_i == 3:
                cell.fill.fore_color.rgb = C_GREEN_BG
            else:
                cell.fill.fore_color.rgb = C_WHITE if r_i % 2 == 1 else RGBColor(0xF1, 0xF5, 0xF9)
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER if c_i >= 1 else PP_ALIGN.LEFT
            run = p.add_run()
            run.text = val
            run.font.name = FONT
            run.font.size = Pt(11 if r_i == 0 else 10.5)
            run.font.bold = (r_i == 0 or c_i == 3 or r_i == len(test_rows) - 1)
            run.font.color.rgb = C_WHITE if r_i == 0 else (C_GREEN if c_i == 3 else C_TEXT)

    # =========================================================================
    # SLIDE 16: Chapter 5 - Conclusions
    # =========================================================================
    s16 = prs.slides.add_slide(blank)
    add_header(s16, "Chapter 5  |  Summary", "Conclusions", 16)

    conclusions = [
        ("1. Empirical Need Validated",
         "Survey findings (N = 406) confirm conventional editors impose heavy repetitive formatting overhead (Grand Mean = 4.17), especially on headings, spacing, and margins (M = 4.52)."),
        ("2. Adaptive Hybrid AI Architecture",
         "IntelliDocs bridges the personalization gap by combining sequential behavioral tracking, a hybrid LSTM + RandomForest prediction engine, and supervised accept/reject retraining."),
        ("3. Authorial Control & Productivity",
         "Confidence-scored inline suggestions, before-and-after previews (M = 4.25), natural language bulk commands (M = 4.26), and inline grammar checks reduce styling effort without sacrificing control."),
        ("4. Verified Functional Readiness",
         "All 147 automated Selenium/Pytest unit and integration test cases passed (100%), validating end-to-end reliability across React, Express, Supabase, Redis, DuckDB, and FastAPI."),
    ]
    for idx, (ctitle, cbody) in enumerate(conclusions):
        col = idx % 2
        row = idx // 2
        x = Inches(0.55) + col * Inches(6.25)
        y = Inches(1.45) + row * Inches(2.75)
        add_rect(s16, x, y, Inches(5.98), Inches(2.5), C_WHITE, C_BORDER, 1)
        add_rect(s16, x, y, Inches(0.1), Inches(2.5), C_BLUE, rounded=False)
        add_textbox(s16, x + Inches(0.25), y + Inches(0.22), Inches(5.5), Inches(0.4),
                    ctitle, size=15.5, bold=True, color=C_BLUE)
        add_textbox(s16, x + Inches(0.25), y + Inches(0.72), Inches(5.5), Inches(1.6),
                    cbody, size=13.5, color=C_TEXT)

    # =========================================================================
    # SLIDE 17: Chapter 5 - Recommendations
    # =========================================================================
    s17 = prs.slides.add_slide(blank)
    add_header(s17, "Chapter 5  |  Future Work", "Recommendations", 17)

    recs = [
        ("1. Quantitative Model Benchmarking",
         "Benchmark hybrid LSTM/RandomForest precision, recall, and cold-start convergence rate across diverse academic document types."),
        ("2. Discipline-Specific Templates & Presets",
         "Expand built-in presets beyond APA 7th, IEEE, and UCLM to support nursing, maritime, criminology, and engineering manuscripts (19.01% feedback theme)."),
        ("3. Automated Citation & Bibliography Manager",
         "Integrate DOI/URL/PDF metadata extraction to dynamically generate in-text citations and reference lists (APA, IEEE, MLA, Chicago)."),
        ("4. Domain-Aware Terminology & Similarity",
         "Expand NLP dictionaries for specialized technical terms alongside deeper institutional plagiarism and originality verification."),
        ("5. Offline Caching & Mobile Optimization",
         "Add local browser caching with asynchronous cloud sync for offline editing and touch-friendly mobile layout refinements."),
    ]
    for idx, (rtitle, rbody) in enumerate(recs):
        ry = Inches(1.4) + idx * Inches(1.1)
        add_rect(s17, Inches(0.55), ry, Inches(12.23), Inches(0.96), C_WHITE, C_BORDER, 1)
        add_rect(s17, Inches(0.55), ry, Inches(0.1), Inches(0.96), C_BLUE, rounded=False)
        add_textbox(s17, Inches(0.8), ry + Inches(0.08), Inches(11.8), Inches(0.34),
                    rtitle, size=13.5, bold=True, color=C_BLUE)
        add_textbox(s17, Inches(0.8), ry + Inches(0.42), Inches(11.8), Inches(0.48),
                    rbody, size=12.5, color=C_TEXT)

    # =========================================================================
    # SLIDE 18: << System Demo >>
    # =========================================================================
    s18 = prs.slides.add_slide(blank)
    set_bg(s18, C_NAVY)
    add_rect(s18, Inches(0), Inches(0), SLIDE_W, Inches(0.1), C_BLUE, rounded=False)
    add_textbox(s18, Inches(0.8), Inches(2.0), Inches(11.7), Inches(0.4),
                "LIVE WALKTHROUGH", size=13, bold=True, color=C_SKY, align=PP_ALIGN.CENTER)
    add_textbox(s18, Inches(0.8), Inches(2.5), Inches(11.7), Inches(1.1),
                "<< System Demo >>", size=44, bold=True, color=C_WHITE, align=PP_ALIGN.CENTER)
    add_textbox(s18, Inches(1.5), Inches(3.85), Inches(10.3), Inches(0.9),
                "Account & Dashboard  •  Custom TipTap Editor  •  ML Formatting Predictions\n"
                "AI Chat Bulk Commands  •  Grammar & Spelling  •  Class Review & Export",
                size=15, color=C_LIGHT_TEXT, align=PP_ALIGN.CENTER)
    add_rect(s18, Inches(4.9), Inches(5.35), Inches(3.53), Inches(0.65), C_BLUE, rounded=True)
    add_textbox(s18, Inches(4.9), Inches(5.35), Inches(3.53), Inches(0.65),
                "Thank You  |  Open for Q&A", size=15, bold=True, color=C_WHITE,
                align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT_PATH))
    print(f"Saved professional presentation to {OUT_PATH} ({len(prs.slides)} slides)")


if __name__ == "__main__":
    main()
