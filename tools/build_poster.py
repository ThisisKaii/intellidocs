import json

with open('docs/b64_images.json', encoding='utf-8') as f:
    images = json.load(f)

cf_img = images['cf']
ag_img = images['ag']
ccs_img = images['ccs']
uclm_img = images['uclm']

html_template = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>IntelliDocs — 2x3 ft Capstone Exhibit Tarpaulin Poster</title>
  <style>
    /* -------------------------------------------------------------
       PRINT & TARPAULIN SPECIFICATIONS:
       Physical dimensions: 2 x 3 FEET (24 inches x 36 inches).
       Aspect ratio: 2:3 vertical format.
       Rendered Canvas: 960px by 1440px (scales crisply to any DPI).
       ------------------------------------------------------------- */
    @page {{
      size: 24in 36in;
      margin: 0;
    }}

    *, *::before, *::after {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    body {{
      width: 100%;
      min-height: 100vh;
      background: #0b132b;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }}

    /* THE 2x3 FT CANVAS CONTAINER */
    .poster-canvas {{
      width: 960px;
      height: 1440px;
      background: #edf4fb; /* Soft, clean ice blue canvas */
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
    }}

    /* PALETTE VARIABLES (PROFESSIONAL UC NAVY & ROYAL BLUE THEME) */
    :root {{
      --navy-dark: #091e36;
      --navy-card: #0f3b6c;
      --card-border: #134074;
      --blue-accent: #0284c7;
      --blue-light: #38bdf8;
      --light-ice: #edf4fb;
      --card-bg: #ffffff;
      --text-dark: #0f172a;
      --text-muted: #334155;
      --sub-border: #cbd5e1;
    }}

    /* -------------------------------------------------------------
       1. HEADER BANNER (UC NAVY BLUE WITH OFFICIAL LOGOS)
       ------------------------------------------------------------- */
    header {{
      background: #091e36;
      color: #ffffff;
      padding: 12px 24px 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3.5px solid #0284c7;
      flex-shrink: 0;
      height: 78px;
    }}

    .header-main {{
      display: flex;
      flex-direction: column;
      gap: 1px;
    }}

    .brand-row {{
      display: flex;
      align-items: baseline;
      gap: 10px;
    }}

    .brand-title {{
      font-size: 38px;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #ffffff;
      line-height: 1;
    }}

    .brand-title span {{
      color: #38bdf8; /* Bright sky blue highlight */
    }}

    .brand-tagline {{
      font-size: 13.8px;
      font-weight: 500;
      color: #e0f2fe;
      letter-spacing: 0.01em;
      margin-top: 2px;
    }}

    .brand-subtext {{
      font-size: 10.5px;
      font-weight: 400;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-top: 1px;
    }}

    /* OFFICIAL LOGOS IN HEADER */
    .header-logos {{
      display: flex;
      align-items: center;
      gap: 12px;
    }}

    .logo-container {{
      height: 56px;
      background: #ffffff;
      border-radius: 8px;
      padding: 4px 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
      border: 1.5px solid rgba(255, 255, 255, 0.7);
    }}

    .logo-img {{
      height: 48px;
      width: auto;
      object-fit: contain;
    }}

    /* -------------------------------------------------------------
       SECTION BADGE PILL (AGRISENSE SIGNATURE FEATURE - BLUE STYLE)
       ------------------------------------------------------------- */
    .section-pill-wrapper {{
      display: flex;
      justify-content: center;
      margin-top: -14px;
      margin-bottom: 5px;
    }}

    .section-pill {{
      background: #0f3b6c;
      color: #ffffff;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 3.5px 24px;
      border-radius: 9999px;
      box-shadow: 0 2px 5px rgba(15, 59, 108, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.25);
    }}

    /* -------------------------------------------------------------
       CARD CONTAINERS
       ------------------------------------------------------------- */
    .card-box {{
      background: #ffffff;
      border: 2px solid var(--card-border);
      border-radius: 14px;
      padding: 8px 14px;
      position: relative;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
    }}

    /* BODY WRAPPER: EXACT VERTICAL FLEX SIZING SO THERE ARE ZERO DEAD GAPS */
    .poster-body {{
      padding: 10px 18px 8px 18px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: hidden;
      height: 1312px; /* 1440 - 78 (header) - 50 (footer) */
    }}

    /* 2. ABSTRACT BOX */
    .abstract-card {{
      padding: 8px 16px 8px 16px;
      flex-shrink: 0;
    }}

    .abstract-p {{
      font-size: 11.2px;
      line-height: 1.45;
      color: var(--text-dark);
      text-align: justify;
    }}

    .abstract-p strong {{
      color: #091e36;
    }}

    .abstract-meta {{
      margin-top: 4px;
      font-size: 10px;
      color: var(--text-muted);
    }}

    .abstract-meta strong {{
      color: #0f3b6c;
    }}

    /* -------------------------------------------------------------
       3. TWO-COLUMN MAIN GRID (57% Left, 43% Right)
       ------------------------------------------------------------- */
    .main-grid {{
      display: grid;
      grid-template-columns: 57% 43%;
      gap: 10px;
      flex: 1;
      min-height: 0;
    }}

    /* LEFT COLUMN STACK: FULL HEIGHT WITH NO DEAD SPACE */
    .left-col {{
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
    }}

    /* INTRODUCTION */
    .intro-card {{
      padding: 8px 14px 10px 14px;
      flex-shrink: 0;
    }}

    .body-p {{
      font-size: 10.8px;
      line-height: 1.44;
      color: var(--text-dark);
      text-align: justify;
    }}

    .body-p + .body-p {{
      margin-top: 5px;
    }}

    /* CONCEPTUAL FRAMEWORK */
    .framework-card {{
      padding: 8px 14px 8px 14px;
      flex-shrink: 0;
    }}

    .framework-content {{
      display: grid;
      grid-template-columns: 54% 46%;
      gap: 10px;
      align-items: center;
    }}

    .diagram-panel {{
      background: #ffffff;
      border: 1.5px solid #bfdbfe;
      border-radius: 8px;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }}

    .diagram-img {{
      width: 100%;
      height: auto;
      max-height: 175px;
      object-fit: contain;
      border-radius: 4px;
      display: block;
    }}

    /* OBJECTIVES & METHODOLOGY SUB-GRID: REACHES THE BOTTOM EXACTLY */
    .sub-grid {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      flex: 1;
      min-height: 0;
    }}

    .obj-card, .meth-card {{
      padding: 8px 12px 10px 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
    }}

    .icon-box-wrapper {{
      display: flex;
      justify-content: center;
      margin-top: 6px;
    }}

    .icon-box {{
      width: 52px;
      height: 44px;
      background: #e0f2fe;
      border: 1.5px solid #0284c7;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0369a1;
      font-weight: 800;
      font-size: 19px;
      font-family: monospace;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }}

    .agile-wheel-wrapper {{
      display: flex;
      justify-content: center;
      margin: 4px 0 6px 0;
    }}

    .agile-img {{
      width: 135px;
      height: auto;
      max-height: 105px;
      object-fit: contain;
      display: block;
    }}

    /* -------------------------------------------------------------
       4. RIGHT COLUMN: RESULTS (AGRISENSE 8-ROW STACKED GRAPH LAYOUT)
       ------------------------------------------------------------- */
    .results-card {{
      padding: 8px 12px 8px 12px;
      display: flex;
      flex-direction: column;
      height: 100%;
    }}

    .results-list {{
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
      flex: 1;
    }}

    /* EACH GRAPH ROW HAS A LEFT CHART AND RIGHT NARRATIVE BLURB */
    .res-row {{
      display: flex;
      flex-direction: column;
      padding: 2px 0 3px 0;
      border-bottom: 1px solid #e2e8f0;
    }}

    .res-row:last-child {{
      border-bottom: none;
      padding-bottom: 0;
    }}

    .res-row-title {{
      font-size: 9.6px;
      font-weight: 800;
      color: #091e36;
      text-align: center;
      margin-bottom: 2px;
      letter-spacing: -0.01em;
    }}

    .res-row-body {{
      display: grid;
      grid-template-columns: 46% 54%;
      gap: 6px;
      align-items: center;
    }}

    .res-graph-area {{
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      padding: 1px 0;
    }}

    .res-text-area {{
      font-size: 8.8px;
      line-height: 1.30;
      color: #1e293b;
      text-align: justify;
    }}

    /* GRAPH LEGEND STYLES (CRISP SQUARES & LABELS UNDER EACH GRAPH) */
    .chart-legend {{
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 3px 6px;
      margin-top: 3px;
      width: 100%;
    }}

    .legend-item {{
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 7.2px;
      color: #1e293b;
      font-weight: 700;
      white-space: nowrap;
    }}

    .legend-box {{
      width: 6.5px;
      height: 6.5px;
      border-radius: 1.5px;
      flex-shrink: 0;
    }}

    /* VERTICAL BAR CHART STYLES (BLUE THEME) */
    .vbar-group {{
      display: flex;
      align-items: flex-end;
      justify-content: space-around;
      width: 100%;
      height: 42px;
      padding-top: 6px;
      border-bottom: 1.5px solid #94a3b8;
    }}

    .vbar-col {{
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
    }}

    .vbar-val {{
      font-size: 7.8px;
      font-weight: 800;
      color: #091e36;
    }}

    .vbar-pillar {{
      width: 14px;
      background: #0284c7;
      border-radius: 2px 2px 0 0;
    }}

    .vbar-lbl {{
      font-size: 7px;
      color: #475569;
      font-weight: 700;
      margin-top: 1px;
      white-space: nowrap;
    }}

    /* HORIZONTAL BAR STYLES (BLUE THEME) */
    .hbar-stack {{
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }}

    .hbar-item {{
      display: flex;
      flex-direction: column;
      gap: 1px;
    }}

    .hbar-lbl-row {{
      display: flex;
      justify-content: space-between;
      font-size: 7.4px;
      font-weight: 700;
      color: #0f172a;
    }}

    .hbar-bg {{
      width: 100%;
      height: 5px;
      background: #e2e8f0;
      border-radius: 3px;
      overflow: hidden;
    }}

    .hbar-fill {{
      height: 100%;
      background: #0284c7;
      border-radius: 3px;
    }}

    /* -------------------------------------------------------------
       5. CONCLUSION CARD (FULL WIDTH UC NAVY BLUE)
       ------------------------------------------------------------- */
    .conclusion-card {{
      background: #091e36;
      color: #ffffff;
      border: 2px solid #134074;
      border-radius: 12px;
      padding: 8px 16px 8px 16px;
      position: relative;
      flex-shrink: 0;
    }}

    .conclusion-card .section-pill {{
      background: #0284c7;
      color: #ffffff;
      border: 1px solid #38bdf8;
      padding: 3px 22px;
    }}

    .conclusion-text {{
      font-size: 10.6px;
      line-height: 1.42;
      color: #f8fafc;
      text-align: justify;
    }}

    /* -------------------------------------------------------------
       6. FOOTER (5 TEAM ROLES - UC NAVY BLUE)
       ------------------------------------------------------------- */
    footer {{
      background: #091e36;
      color: #ffffff;
      padding: 8px 24px 8px 24px;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
      border-top: 2.5px solid #0284c7;
      flex-shrink: 0;
      height: 50px;
    }}

    .member-col {{
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }}

    .member-col.adviser {{
      border-left: 1px solid rgba(255, 255, 255, 0.2);
    }}

    .member-name {{
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.01em;
    }}

    .member-role {{
      font-size: 8.5px;
      color: #7dd3fc;
      font-weight: 500;
      letter-spacing: 0.02em;
    }}
  </style>
</head>
<body>

  <!-- THE OFFICIAL 2x3 FT POSTER TARPAULIN -->
  <div class="poster-canvas">

    <!-- 1. HEADER (UC NAVY BLUE WITH OFFICIAL CCS & UCLM LOGOS) -->
    <header>
      <div class="header-main">
        <div class="brand-row">
          <div class="brand-title">Intelli<span>Docs</span></div>
        </div>
        <div class="brand-tagline">An Intelligent Document Editing System with Behavioral Learning and Automated Formatting</div>
        <div class="brand-subtext">College of Computer Studies • University of Cebu – Lapu-Lapu and Mandaue (UCLM)</div>
      </div>

      <div class="header-logos">
        <!-- Official College of Computer Studies Crest -->
        <div class="logo-container">
          <img src="{ccs_img}" alt="College of Computer Studies" class="logo-img">
        </div>
        <!-- Official University of Cebu Lapu-Lapu and Mandaue Logo -->
        <div class="logo-container">
          <img src="{uclm_img}" alt="University of Cebu Lapu-Lapu and Mandaue" class="logo-img">
        </div>
      </div>
    </header>

    <div class="poster-body">

      <!-- 2. ABSTRACT (FULL WIDTH) -->
      <div class="card-box abstract-card">
        <div class="section-pill-wrapper">
          <div class="section-pill">Abstract</div>
        </div>
        <p class="abstract-p">
          This study, titled <strong>"IntelliDocs: An Intelligent Document Editing System with Behavioral Learning and Automated Formatting,"</strong> was developed to address the mechanical burdens of manuscript preparation faced by students across all academic programs (Nursing, Maritime, Criminology, Education, Hospitality, Engineering, and Information Technology). While conventional word processors require repetitive, manual adjustment of headings, line spacing, margins, and citations, IntelliDocs provides a custom-built web editor that unobtrusively observes user formatting behaviors, predicts preferred styling with transparent confidence scoring, accepts natural-language formatting instructions, and verifies compliance against university thesis guidelines in real time.
        </p>
        <p class="abstract-p" style="margin-top: 4px;">
          The researchers employed a descriptive survey methodology with purposive sampling alongside the Agile software development cycle. The survey analyzed <strong>104 valid student and faculty responses</strong> from across UCLM departments. Results reveal that <strong>91.4% of respondents</strong> experience formatting inconsistencies in multi-author documents, and over <strong>94% suffer high stress</strong> formatting papers before deadlines. Respondents overwhelmingly validated the system with an overall acceptability rating of <strong>4.51 out of 5.00 (Highly Acceptable)</strong> under ISO/IEC 25010 standards.
        </p>
        <div class="abstract-meta">
          <strong>Keywords:</strong> Intelligent Word Processor, Automated Formatting, Behavioral AI, Student Productivity, UCLM Guidelines, TipTap Editor.
        </div>
      </div>

      <!-- 3. MAIN TWO-COLUMN SPLIT (57% Left, 43% Right) -->
      <div class="main-grid">

        <!-- LEFT COLUMN: INTRODUCTION, CONCEPTUAL FRAMEWORK, OBJECTIVES, METHODOLOGY -->
        <div class="left-col">

          <!-- INTRODUCTION -->
          <div class="card-box intro-card">
            <div class="section-pill-wrapper">
              <div class="section-pill">Introduction</div>
            </div>
            <p class="body-p">
              Academic writing across all college disciplines demands strict adherence to institutional guidelines (such as the UCLM Thesis Manual and IEEE standards). However, students and faculty continually struggle with the mechanical, tedious overhead of manually styling fonts, paragraph indents, and margins across multi-page manuscripts. Global research confirms that reformatting scientific manuscripts consumes an estimated <strong>23.8 million hours annually worldwide</strong>, resulting in over <strong>$1.1 Billion USD</strong> in lost academic productivity (Zon &amp; Boisvert, 2021).
            </p>
            <p class="body-p">
              Existing word processors like Microsoft Word and Google Docs rely on rigid, static templates that do not learn or adapt to personal writing habits. When collaborators combine sections right before critical defense deadlines, formatting fractures—forcing researchers to spend valuable hours fixing cosmetic errors rather than refining original thought. IntelliDocs bridges this critical divide by creating an intelligent document workspace that observes user styling choices, automates tedious adjustments with 1-click recommendations, and guarantees clean, consistent submissions.
            </p>
          </div>

          <!-- CONCEPTUAL FRAMEWORK (EXACT USER MANUSCRIPT DIAGRAM + NARRATIVE) -->
          <div class="card-box framework-card">
            <div class="section-pill-wrapper">
              <div class="section-pill">Conceptual Framework</div>
            </div>
            <div class="framework-content">
              <div class="diagram-panel">
                <img class="diagram-img" src="{cf_img}" alt="IntelliDocs Conceptual Framework">
              </div>
              <p class="body-p" style="font-size:9.8px; line-height: 1.38;">
                The figure illustrates the IntelliDocs core processing framework. As users interact with document content, the system processes natural language commands and tracks typing/formatting behaviors. The machine learning prediction engine evaluates extracted features to generate transparent, confidence-scored suggestions. Approved styling is automatically applied to the document, while a continuous feedback loop refines system learning without storing private draft content.
              </p>
            </div>
          </div>

          <!-- SPLIT SUBGRID: OBJECTIVES & METHODOLOGY (REACHES THE BOTTOM TOGETHER WITH RESULTS) -->
          <div class="sub-grid">

            <!-- OBJECTIVES -->
            <div class="card-box obj-card">
              <div class="section-pill-wrapper">
                <div class="section-pill" style="font-size:10.5px; padding:3px 18px;">Objectives</div>
              </div>
              <p class="body-p" style="font-size:9.8px; line-height: 1.42;">
                This study aims to analyze, design, develop, and evaluate IntelliDocs: An Intelligent Document Editing System with Behavioral Learning and Automated Formatting. Specifically, it seeks to:
                <br>• <strong>Analyze</strong> current formatting practices, inconsistencies, and manual overhead across academic departments.
                <br>• <strong>Design</strong> an adaptive word processing interface with behavioral habit logging.
                <br>• <strong>Develop</strong> a hybrid ML model to predict formatting intentions with transparent confidence scoring.
                <br>• <strong>Implement</strong> natural-language formatting commands and UCLM institutional guideline validation.
                <br>• <strong>Evaluate</strong> system acceptability based on ISO/IEC 25010 software quality standards.
              </p>
              <div class="icon-box-wrapper">
                <div class="icon-box">&lt; / &gt;</div>
              </div>
            </div>

            <!-- METHODOLOGY -->
            <div class="card-box meth-card">
              <div class="section-pill-wrapper">
                <div class="section-pill" style="font-size:10.5px; padding:3px 18px;">Methodology</div>
              </div>

              <!-- Agile 6-Cycle Wheel (Exact Manuscript Graphic) -->
              <div class="agile-wheel-wrapper">
                <img class="agile-img" src="{ag_img}" alt="Agile Development Cycle">
              </div>

              <p class="body-p" style="font-size:9.6px; line-height: 1.38;">
                A descriptive survey design with purposive sampling was conducted among 104 students and faculty members across diverse colleges at UCLM. System development followed the Agile software lifecycle, cycling through six iterative stages: <strong>Plan, Design, Develop, Test, Release, and Feedback</strong>. Continuous evaluations were performed using the ISO/IEC 25010 software quality framework.
              </p>
            </div>

          </div>

        </div>

        <!-- RIGHT COLUMN: RESULTS (AGRISENSE 8-ROW STACKED GRAPHS WITH LEGENDS - BLUE THEME) -->
        <div class="card-box results-card">
          <div class="section-pill-wrapper">
            <div class="section-pill">Results</div>
          </div>

          <div class="results-list">

            <!-- ROW 1: PRIMARY EDITING PLATFORM (DONUT CHART WITH LEGEND) -->
            <div class="res-row">
              <div class="res-row-title">Primary Document Editing Platform</div>
              <div class="res-row-body">
                <div class="res-graph-area">
                  <svg width="56" height="42" viewBox="0 0 42 42" style="transform: rotate(-90deg);">
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e2e8f0" stroke-width="7"/>
                    <!-- Word 58% (Navy) -->
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#0f3b6c" stroke-width="7" stroke-dasharray="58 42" stroke-dashoffset="0"/>
                    <!-- Docs 32% (Blue) -->
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#0284c7" stroke-width="7" stroke-dasharray="32 68" stroke-dashoffset="-58"/>
                    <!-- WPS 10% (Sky Blue) -->
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#38bdf8" stroke-width="7" stroke-dasharray="10 90" stroke-dashoffset="-90"/>
                  </svg>
                  <div class="chart-legend">
                    <div class="legend-item"><div class="legend-box" style="background:#0f3b6c;"></div> Word: 58% (60)</div>
                    <div class="legend-item"><div class="legend-box" style="background:#0284c7;"></div> Docs: 32% (33)</div>
                    <div class="legend-item"><div class="legend-box" style="background:#38bdf8;"></div> WPS: 10% (11)</div>
                  </div>
                </div>
                <div class="res-text-area">
                  The chart shows the primary editing platforms used by respondents. Most respondents, <strong>58% (60)</strong>, rely on Microsoft Word, followed by Google Docs with <strong>32% (33)</strong>, and WPS Office with <strong>10% (11)</strong>.
                </div>
              </div>
            </div>

            <!-- ROW 2: YEAR LEVEL DISTRIBUTION (VERTICAL BARS WITH LEGEND) -->
            <div class="res-row">
              <div class="res-row-title">Year Level Distribution</div>
              <div class="res-row-body">
                <div class="res-graph-area">
                  <div class="vbar-group">
                    <div class="vbar-col">
                      <span class="vbar-val">24</span>
                      <div class="vbar-pillar" style="height: 18px;"></div>
                      <span class="vbar-lbl">1st Yr</span>
                    </div>
                    <div class="vbar-col">
                      <span class="vbar-val">38</span>
                      <div class="vbar-pillar" style="height: 30px;"></div>
                      <span class="vbar-lbl">2nd Yr</span>
                    </div>
                    <div class="vbar-col">
                      <span class="vbar-val">31</span>
                      <div class="vbar-pillar" style="height: 24px;"></div>
                      <span class="vbar-lbl">3rd Yr</span>
                    </div>
                    <div class="vbar-col">
                      <span class="vbar-val">11</span>
                      <div class="vbar-pillar" style="height: 9px;"></div>
                      <span class="vbar-lbl">4th Yr</span>
                    </div>
                  </div>
                  <div class="chart-legend">
                    <div class="legend-item"><div class="legend-box" style="background:#0284c7;"></div> Student Respondents by Level (N = 104)</div>
                  </div>
                </div>
                <div class="res-text-area">
                  The graph shows the academic year levels of student respondents. 2nd Year students form the largest group (38), followed by 3rd Year (31), 1st Year (24), and graduating 4th Year seniors (11).
                </div>
              </div>
            </div>

            <!-- ROW 3: PROGRAM / COLLEGE DISTRIBUTION (VERTICAL BARS WITH LEGEND) -->
            <div class="res-row">
              <div class="res-row-title">Respondents Across Academic Programs</div>
              <div class="res-row-body">
                <div class="res-graph-area">
                  <div class="vbar-group">
                    <div class="vbar-col">
                      <span class="vbar-val">32</span>
                      <div class="vbar-pillar" style="height: 26px;"></div>
                      <span class="vbar-lbl">Nursing</span>
                    </div>
                    <div class="vbar-col">
                      <span class="vbar-val">28</span>
                      <div class="vbar-pillar" style="height: 22px;"></div>
                      <span class="vbar-lbl">Marit.</span>
                    </div>
                    <div class="vbar-col">
                      <span class="vbar-val">18</span>
                      <div class="vbar-pillar" style="height: 15px;"></div>
                      <span class="vbar-lbl">Crim</span>
                    </div>
                    <div class="vbar-col">
                      <span class="vbar-val">14</span>
                      <div class="vbar-pillar" style="height: 11px;"></div>
                      <span class="vbar-lbl">Educ</span>
                    </div>
                    <div class="vbar-col">
                      <span class="vbar-val">12</span>
                      <div class="vbar-pillar" style="height: 9px;"></div>
                      <span class="vbar-lbl">Eng/IT</span>
                    </div>
                  </div>
                  <div class="chart-legend">
                    <div class="legend-item"><div class="legend-box" style="background:#0284c7;"></div> Multi-Department Representation</div>
                  </div>
                </div>
                <div class="res-text-area">
                  The graph shows cross-department participation. Nursing (32) and Maritime (28) lead document creation demands, affirming that formatting pain points exist across all university colleges.
                </div>
              </div>
            </div>

            <!-- ROW 4: DOCUMENT WRITING FREQUENCY (VERTICAL BARS WITH LEGEND) -->
            <div class="res-row">
              <div class="res-row-title">Frequency of Document Creation</div>
              <div class="res-row-body">
                <div class="res-graph-area">
                  <div class="vbar-group">
                    <div class="vbar-col">
                      <span class="vbar-val">25</span>
                      <div class="vbar-pillar" style="height: 18px;"></div>
                      <span class="vbar-lbl">Daily</span>
                    </div>
                    <div class="vbar-col">
                      <span class="vbar-val">61</span>
                      <div class="vbar-pillar" style="height: 33px;"></div>
                      <span class="vbar-lbl">Weekly</span>
                    </div>
                    <div class="vbar-col">
                      <span class="vbar-val">16</span>
                      <div class="vbar-pillar" style="height: 12px;"></div>
                      <span class="vbar-lbl">Monthly</span>
                    </div>
                    <div class="vbar-col">
                      <span class="vbar-val">2</span>
                      <div class="vbar-pillar" style="height: 4px;"></div>
                      <span class="vbar-lbl">Rarely</span>
                    </div>
                  </div>
                  <div class="chart-legend">
                    <div class="legend-item"><div class="legend-box" style="background:#0284c7;"></div> Writing Recurrence (Times / Month)</div>
                  </div>
                </div>
                <div class="res-text-area">
                  The graph shows how frequently students write research documents. <strong>61</strong> write weekly and <strong>25</strong> write daily, demonstrating that mechanical formatting consumes hours every week.
                </div>
              </div>
            </div>

            <!-- ROW 5: PRIOR AI TOOL USAGE (DONUT CHART WITH LEGEND) -->
            <div class="res-row">
              <div class="res-row-title">Prior Use of AI Writing / Grammar Tools</div>
              <div class="res-row-body">
                <div class="res-graph-area">
                  <svg width="56" height="42" viewBox="0 0 42 42" style="transform: rotate(-90deg);">
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e2e8f0" stroke-width="7"/>
                    <!-- Yes: 88.5% (Navy Blue) -->
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#0f3b6c" stroke-width="7" stroke-dasharray="88.5 11.5" stroke-dashoffset="0"/>
                    <!-- No: 11.5% (Sky Blue) -->
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#38bdf8" stroke-width="7" stroke-dasharray="11.5 88.5" stroke-dashoffset="-88.5"/>
                  </svg>
                  <div class="chart-legend">
                    <div class="legend-item"><div class="legend-box" style="background:#0f3b6c;"></div> Yes: 88.5% (92)</div>
                    <div class="legend-item"><div class="legend-box" style="background:#38bdf8;"></div> No: 11.5% (12)</div>
                  </div>
                </div>
                <div class="res-text-area">
                  The pie chart shows whether respondents previously used AI writing tools. <strong>88.5% (92)</strong> have used AI assistants, yet note that none could automatically format manuscripts to university standards.
                </div>
              </div>
            </div>

            <!-- ROW 6: FORMATTING INCONSISTENCIES (HORIZONTAL BARS WITH LEGEND) -->
            <div class="res-row">
              <div class="res-row-title">Formatting Inconsistencies Encountered</div>
              <div class="res-row-body">
                <div class="res-graph-area">
                  <div class="hbar-stack">
                    <div class="hbar-item">
                      <div class="hbar-lbl-row"><span>Heading / Font Drift</span><span>92%</span></div>
                      <div class="hbar-bg"><div class="hbar-fill" style="width: 92%;"></div></div>
                    </div>
                    <div class="hbar-item">
                      <div class="hbar-lbl-row"><span>Line &amp; Para Spacing</span><span>88%</span></div>
                      <div class="hbar-bg"><div class="hbar-fill" style="width: 88%;"></div></div>
                    </div>
                    <div class="hbar-item">
                      <div class="hbar-lbl-row"><span>Margins &amp; Indents</span><span>85%</span></div>
                      <div class="hbar-bg"><div class="hbar-fill" style="width: 85%;"></div></div>
                    </div>
                  </div>
                  <div class="chart-legend">
                    <div class="legend-item"><div class="legend-box" style="background:#0284c7;"></div> Percentage Agreement (% of N=104)</div>
                  </div>
                </div>
                <div class="res-text-area">
                  The chart shows that <strong>92%</strong> of respondents face heading style discrepancies, <strong>88%</strong> encounter uneven spacing, and <strong>85%</strong> struggle with margin alignment during group writing.
                </div>
              </div>
            </div>

            <!-- ROW 7: PROBLEMS ENCOUNTERED (% AGREE WITH LEGEND) -->
            <div class="res-row">
              <div class="res-row-title">Problems Encountered in Existing Process</div>
              <div class="res-row-body">
                <div class="res-graph-area">
                  <div class="hbar-stack">
                    <div class="hbar-item">
                      <div class="hbar-lbl-row"><span>Manual Style Waste</span><span>91%</span></div>
                      <div class="hbar-bg"><div class="hbar-fill" style="width: 91%;"></div></div>
                    </div>
                    <div class="hbar-item">
                      <div class="hbar-lbl-row"><span>Lacks Habit Learning</span><span>89%</span></div>
                      <div class="hbar-bg"><div class="hbar-fill" style="width: 89%;"></div></div>
                    </div>
                    <div class="hbar-item">
                      <div class="hbar-lbl-row"><span>App-Switching Friction</span><span>86%</span></div>
                      <div class="hbar-bg"><div class="hbar-fill" style="width: 86%;"></div></div>
                    </div>
                  </div>
                  <div class="chart-legend">
                    <div class="legend-item"><div class="legend-box" style="background:#0284c7;"></div> Reported Mechanical Pain Points</div>
                  </div>
                </div>
                <div class="res-text-area">
                  The chart shows <strong>91%</strong> agree manual reformatting wastes writing focus, <strong>89%</strong> note existing tools lack habit personalization, and <strong>86%</strong> report switching AI apps disrupts flow.
                </div>
              </div>
            </div>

            <!-- ROW 8: BEST FEATURES (LIKERT 1-5 WEIGHTED MEAN WITH LEGEND) -->
            <div class="res-row">
              <div class="res-row-title">Best Features: Weighted Mean (1–5)</div>
              <div class="res-row-body">
                <div class="res-graph-area">
                  <div class="hbar-stack">
                    <div class="hbar-item">
                      <div class="hbar-lbl-row"><span>Smart Suggestions</span><span>4.62</span></div>
                      <div class="hbar-bg"><div class="hbar-fill" style="width: 92.4%;"></div></div>
                    </div>
                    <div class="hbar-item">
                      <div class="hbar-lbl-row"><span>Natural Commands</span><span>4.56</span></div>
                      <div class="hbar-bg"><div class="hbar-fill" style="width: 91.2%;"></div></div>
                    </div>
                    <div class="hbar-item">
                      <div class="hbar-lbl-row"><span>Habit Learning AI</span><span>4.48</span></div>
                      <div class="hbar-bg"><div class="hbar-fill" style="width: 89.6%;"></div></div>
                    </div>
                    <div class="hbar-item">
                      <div class="hbar-lbl-row"><span>UCLM Guidelines Check</span><span>4.44</span></div>
                      <div class="hbar-bg"><div class="hbar-fill" style="width: 88.8%;"></div></div>
                    </div>
                  </div>
                  <div class="chart-legend">
                    <div class="legend-item"><div class="legend-box" style="background:#0284c7;"></div> Scale: 1 (Strongly Disagree) to 5 (Strongly Agree)</div>
                  </div>
                </div>
                <div class="res-text-area">
                  The graph shows weighted mean evaluations. Intelligent formatting suggestions scored highest <strong>(4.62)</strong>, followed by natural-language commands <strong>(4.56)</strong>. All features rated <em>Strongly Agree</em>.
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

      <!-- 4. CONCLUSION (FULL WIDTH SOLID UC NAVY BLUE) -->
      <div class="conclusion-card">
        <div class="section-pill-wrapper">
          <div class="section-pill">Conclusion</div>
        </div>
        <p class="conclusion-text">
          In conclusion, the findings confirm that researchers across all UCLM departments still rely on tedious manual formatting: <strong>91.4% experience multi-section formatting inconsistencies</strong>, and <strong>89% report that existing word processors fail to learn individual writing habits</strong>. With over <strong>94% agreement</strong> that automated styling relieves deadline pressure, and an overall acceptability rating of <strong>4.51 out of 5.00</strong> led by confidence-scored suggestions (4.62), IntelliDocs meets the critical needs of students and faculty as a single, accessible, and intelligent document preparation platform.
        </p>
      </div>

    </div>

    <!-- 5. FOOTER (PROJECT TEAM & ADVISER - EXACT 5 COLUMNS) -->
    <footer>
      <div class="member-col">
        <div class="member-name">Marjun A. Amamence</div>
        <div class="member-role">Project Manager</div>
      </div>
      <div class="member-col">
        <div class="member-name">Joshua L. Asingua</div>
        <div class="member-role">Lead Developer / ML</div>
      </div>
      <div class="member-col">
        <div class="member-name">Rj Alenton</div>
        <div class="member-role">System Analyst</div>
      </div>
      <div class="member-col">
        <div class="member-name">Christian Paulo A. Dagupan</div>
        <div class="member-role">UI/UX &amp; Documentation</div>
      </div>
      <div class="member-col adviser">
        <div class="member-name">Ms. Gian S. Mahusay</div>
        <div class="member-role">Research Adviser</div>
      </div>
    </footer>

  </div>

</body>
</html>
'''

with open('docs/poster_2x3ft.html', 'w', encoding='utf-8') as f:
    f.write(html_template)

print('Updated docs/poster_2x3ft.html with Blue theme & official logos!')
