from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

OUT_PATH = Path("docs/manuscript/Joshua_L_Asingua_CV_v2.docx")

FONT_NAME = "Calibri"
COLOR_BLACK = RGBColor(0x11, 0x11, 0x11)
COLOR_DARK_GRAY = RGBColor(0x33, 0x33, 0x33)
COLOR_MUTED = RGBColor(0x4A, 0x4A, 0x4A)

CONTENT_WIDTH_IN = 7.3  # 8.5 - 0.6*2


def set_bottom_border(paragraph, color="222222", sz="6"):
    pPr = paragraph._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), sz)
    bottom.set(qn("w:space"), "2")
    bottom.set(qn("w:color"), color)
    pBdr.append(bottom)
    pPr.append(pBdr)


def set_spacing(paragraph, before=0, after=0, line=1.12):
    pf = paragraph.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = line


def add_run(p, text, size=10, bold=False, italic=False, color=COLOR_BLACK):
    r = p.add_run(text)
    r.font.name = FONT_NAME
    r.font.size = Pt(size)
    r.bold = bold
    r.italic = italic
    r.font.color.rgb = color
    return r


def add_section_heading(doc, title):
    p = doc.add_paragraph()
    set_spacing(p, before=8, after=4, line=1.05)
    set_bottom_border(p, color="222222", sz="6")
    add_run(p, title.upper(), size=10.5, bold=True, color=COLOR_BLACK)
    return p


def add_bullet(doc, text, bold_prefix=None):
    p = doc.add_paragraph(style="List Bullet")
    set_spacing(p, before=0, after=2, line=1.12)
    p.paragraph_format.left_indent = Inches(0.22)
    p.paragraph_format.first_line_indent = Inches(-0.14)
    if bold_prefix:
        add_run(p, bold_prefix, size=9.5, bold=True, color=COLOR_BLACK)
    add_run(p, text, size=9.5, bold=False, color=COLOR_DARK_GRAY)
    return p


def add_split_row(doc, left_text, right_text, left_bold=True, right_italic=True, size=10, before=3, after=1.5):
    p = doc.add_paragraph()
    set_spacing(p, before=before, after=after, line=1.1)
    p.paragraph_format.tab_stops.add_tab_stop(Inches(CONTENT_WIDTH_IN), WD_TAB_ALIGNMENT.RIGHT)
    add_run(p, left_text, size=size, bold=left_bold, color=COLOR_BLACK)
    add_run(p, "\t", size=size)
    add_run(p, right_text, size=9.5, bold=False, italic=right_italic, color=COLOR_MUTED)
    return p


def main():
    doc = Document()

    # Page setup: Letter, 0.55" top/bottom, 0.6" left/right
    sec = doc.sections[0]
    sec.page_width = Inches(8.5)
    sec.page_height = Inches(11.0)
    sec.top_margin = Inches(0.5)
    sec.bottom_margin = Inches(0.5)
    sec.left_margin = Inches(0.6)
    sec.right_margin = Inches(0.6)

    # Normal style defaults
    normal = doc.styles["Normal"]
    normal.font.name = FONT_NAME
    normal.font.size = Pt(9.5)
    normal.font.color.rgb = COLOR_DARK_GRAY

    # ── Header ────────────────────────────────────────────────────────────────
    p_name = doc.add_paragraph()
    set_spacing(p_name, before=0, after=1, line=1.0)
    add_run(p_name, "JOSHUA L. ASINGUA", size=18, bold=True, color=COLOR_BLACK)

    p_contact = doc.add_paragraph()
    set_spacing(p_contact, before=0, after=2, line=1.1)
    add_run(
        p_contact,
        "Barangay Looc, Mandaue City, Cebu  |  0939-270-3203  |  joshuaasingua499@gmail.com  |  github.com/ThisisKaii",
        size=9.5,
        bold=False,
        color=COLOR_MUTED,
    )

    # ── Professional Summary ──────────────────────────────────────────────────
    add_section_heading(doc, "Professional Summary")
    p_sum = doc.add_paragraph()
    set_spacing(p_sum, before=1, after=2, line=1.15)
    add_run(
        p_sum,
        "Bachelor of Science in Information Technology student and Dean's Lister at the University of Cebu – "
        "Lapu-Lapu and Mandaue with hands-on experience in backend development, machine learning integration, "
        "and database management. Co-developer of IntelliDocs, an intelligent document editing system, where I "
        "built and tested Python/FastAPI ML services for formatting prediction, behavioral learning, and grammar "
        "checking. Adaptable, persevering, and eager to contribute technical problem-solving and software "
        "engineering skills as an IT intern.",
        size=9.5,
        color=COLOR_DARK_GRAY,
    )

    # ── Technical & Professional Skills ───────────────────────────────────────
    add_section_heading(doc, "Technical & Professional Skills")
    skills = [
        ("Programming & Web: ", "Python, PHP, Laravel, Livewire, Blade, Alpine.js, Tailwind CSS, Express.js, Node.js"),
        ("AI / ML & Frameworks: ", "FastAPI, scikit-learn, PyTorch, Hybrid Rule-Based & Neural Modeling"),
        ("Databases & Caching: ", "Database Management, MySQL, SQLite, PostgreSQL (Supabase), Redis, DuckDB"),
        ("Systems & Testing: ", "Linux Fundamentals (Cisco), Playwright, Selenium, Pytest, Git, Basic Software Development"),
        ("Soft Skills: ", "Teamwork, Adaptability, Perseverance, Technical Troubleshooting, Document Drafting"),
    ]
    for label, val in skills:
        p = doc.add_paragraph()
        set_spacing(p, before=0.5, after=1.5, line=1.12)
        add_run(p, label, size=9.5, bold=True, color=COLOR_BLACK)
        add_run(p, val, size=9.5, bold=False, color=COLOR_DARK_GRAY)

    # ── Technical Projects ────────────────────────────────────────────────────
    add_section_heading(doc, "Technical Projects")

    add_split_row(
        doc,
        "IntelliDocs — Intelligent Document Editing System",
        "Capstone Project | AI / ML & Backend Developer",
        left_bold=True,
        right_italic=True,
        size=10,
        before=2,
        after=1,
    )
    p_proj_desc = doc.add_paragraph()
    set_spacing(p_proj_desc, before=0, after=2, line=1.12)
    add_run(
        p_proj_desc,
        "An intelligent web-based document editor built with React, Node.js/Express, and a Python FastAPI ML "
        "microservice that learns user formatting behavior and provides confidence-scored formatting suggestions.",
        size=9.5,
        italic=True,
        color=COLOR_MUTED,
    )
    add_bullet(
        doc,
        "Developed and integrated the Formatting Prediction, Behavioral Learning, and Grammar & Spelling modules "
        "using Python, FastAPI, scikit-learn, and PyTorch.",
    )
    add_bullet(
        doc,
        "Implemented behavioral event aggregation pipelines transferring buffered user actions from Redis into "
        "DuckDB for personalized model fine-tuning.",
    )
    add_bullet(
        doc,
        "Authored and executed automated end-to-end Playwright, Selenium, and Pytest unit/integration test "
        "suites validating prediction confidence, behavioral learning, and grammar/spell checking.",
    )

    add_split_row(
        doc,
        "Project Management & Collaboration System (Laravel & Livewire)",
        "Personal Project | Full-Stack Developer",
        left_bold=True,
        right_italic=True,
        size=10,
        before=4,
        after=1,
    )
    add_bullet(
        doc,
        "Built a collaborative Project Management & Budgeting web application using Laravel 10, Livewire 3, "
        "Blade, Alpine.js, Tailwind CSS, and MySQL/SQLite.",
    )
    add_bullet(
        doc,
        "Implemented drag-and-drop Kanban and Table task views, budget/expense tracking (estimated vs. actual), "
        "and Role-Based Access Control (Owner, Admin, Member).",
    )
    add_bullet(
        doc,
        "Added real-time task and activity updates via Livewire polling alongside detailed system audit logging.",
    )

    # ── Achievements & Certifications ─────────────────────────────────────────
    add_section_heading(doc, "Achievements & Certifications")
    add_split_row(
        doc,
        "Dean's Lister",
        "University of Cebu – Lapu-Lapu and Mandaue",
        left_bold=True,
        right_italic=False,
        size=9.5,
        before=1.5,
        after=1.5,
    )
    add_split_row(
        doc,
        "Linux Essentials Certificate",
        "Cisco Networking Academy Program",
        left_bold=True,
        right_italic=False,
        size=9.5,
        before=0.5,
        after=1.5,
    )

    # ── Education ─────────────────────────────────────────────────────────────
    add_section_heading(doc, "Education")
    add_split_row(
        doc,
        "Bachelor of Science in Information Technology",
        "University of Cebu – Lapu-Lapu and Mandaue Campus",
        left_bold=True,
        right_italic=True,
        size=9.5,
        before=1.5,
        after=0.5,
    )
    p_edu_sub = doc.add_paragraph()
    set_spacing(p_edu_sub, before=0, after=2.5, line=1.1)
    add_run(p_edu_sub, "Looc, Mandaue City, Cebu  |  Dean's Lister", size=9, color=COLOR_MUTED)

    add_split_row(
        doc,
        "Secondary Education",
        "Mandaue City Comprehensive National High School",
        left_bold=True,
        right_italic=True,
        size=9.5,
        before=1,
        after=1.5,
    )
    add_split_row(
        doc,
        "Primary Education",
        "Labogon Elementary School",
        left_bold=True,
        right_italic=True,
        size=9.5,
        before=1,
        after=0,
    )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(OUT_PATH))
    print(f"Saved clean CV to {OUT_PATH}")


if __name__ == "__main__":
    main()
