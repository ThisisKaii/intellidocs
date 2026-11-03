# Document import architecture: how production engines do it, and what IntelliDocs should change

## Context
Three rounds of fidelity work fixed real bugs, but most were symptoms of one design: **DOCX → HTML string (with CSS baked in) → ProseMirror → saved as HTML → paginated by browser CSS flow**. This session alone found:
- a CSS counter that never restarted page numbers
- page breaks drawn with floats, so no picture could float
- a save that rewrote table padding into a form the reload dropped (V2: 31 → 34 pages)
- an undo that could empty the document
- a widow pass that measured before layout settled

The question is how Google Docs, Word for the web and LibreOffice/Collabora avoid that class of bug, and which of their decisions IntelliDocs can adopt within its constraints. Those constraints are a custom TipTap editor (Dean requirement), strict MVC and no heavy dependencies.

## Method and evidence boundary
The skill's REA tooling targets shipped binaries, JavaScript bundles and captures; it isn't connected in this session. Google Docs and Word for the web are closed services, and reverse engineering them at runtime would mean driving a logged-in account. So the evidence base is:

| Grade | Source |
|---|---|
| **Observed (code)** | LibreOffice/Collabora source and docs (`docs.libreoffice.org` sw and writerfilter), SuperDoc repo and issue #3261, IntelliDocs code and this session's measurements |
| **Observed (first-party statement)** | Google Workspace Updates, 11 May 2021 (canvas rendering), Collabora/LibreOffice conference material on LOKit tiles |
| **Inferred** | Behaviour consistent with those statements plus the OOXML spec (ECMA-376), but not directly seen |
| **Unknown** | Word for the web's layout engine internals: no public source found; Microsoft's write-up covers only the UI platform |

## 1. Ingestion and intermediate representation

| Engine | Parse | Intermediate model | Grade |
|---|---|---|---|
| LibreOffice / Collabora | `writerfilter`: OOXML tokenizer → **DomainMapper** → UNO API | `SwDoc` model: paragraphs, page styles (one per section), frames for anchored objects, tables with real grids. **Not HTML.** | Observed (docs.libreoffice.org writerfilter and sw) |
| ONLYOFFICE | `x2t` (C++) converts DOCX to its own internal format | Proprietary document model loaded by `sdkjs` | Observed (repo descriptions); format internals not verified |
| Google Docs | Server-side conversion into the Docs model | Proprietary model (Kix); DOCX features with no Docs equivalent are dropped or approximated on import | Partly inferred: conversion is visible product behaviour, but model internals are not public |
| SuperDoc (ProseMirror DOCX editor) | V1: OOXML → ProseMirror. **V2: OOXML-backed model**; "edits write back to the XML without an HTML conversion step" | V2 makes OOXML parts authoritative, and ProseMirror is no longer the source of truth | Observed (README) |

**The common pattern (inferred from all four):** nobody uses HTML as the intermediate representation. Each parses into a typed document model in which Word's primitives are first-class:
- **Sections** are objects with page size, margins, columns, header/footer references and numbering. In LibreOffice they are page styles, not markers in the text flow.
- **Field codes** (PAGE, NUMPAGES, TOC) stay fields, evaluated at layout time.
- **Anchored objects** are frames with an anchor position, offsets and wrap mode, held outside the paragraph's text.
- **Footnotes** are separate story streams placed by the layout engine at the foot of the page.
- **Styles stay as styles**: properties are resolved through the style chain, while the chain itself is kept.

SuperDoc is the most relevant data point because it shares our stack. It moved **away** from ProseMirror as the authoritative model for exactly this reason.

## 2. Layout and pagination

| Engine | Where layout runs | Rendering | Grade |
|---|---|---|---|
| LibreOffice / Collabora | **Server**, in the Writer layout engine: a tree of `SwFrame` (`SwRootFrame` → `SwPageFrame` → `SwTextFrame`) | LOKit renders tiles (PNG) server-side; the browser shows them, and selections arrive as callbacks | Observed (sw docs, LOKit deep-dive) |
| Google Docs | **Client**, in Google's own JS layout | **Canvas** since 2021, "for better performance and consistent display across platforms" | Rendering observed (Google post); layout location inferred from canvas output |
| ONLYOFFICE | Client, in the `sdkjs` layout engine | Canvas | Inferred from repo and product; not verified in source |
| Word for the web | Unknown | Unknown | **Unknown** |
| SuperDoc | Its own "Layout Engine" producing layout snapshots before paint | V2 renders bounded windows | Observed (issue #3261: drift was "in layout snapshot data before final paint") |

**The decisive pattern:** every engine that paginates reliably **owns line breaking and page breaking**. It measures text with its own metrics, places lines into a page geometry, applies Word's rules (widow/orphan, keep-with-next, keep-lines, exact row heights, anchors), and only then renders. None of them asks the browser to flow content and then patches page boundaries afterwards.

Even an owned engine drifts if a single metric is wrong. SuperDoc #3261 is cumulative drift from an unmodelled `w:docGrid linePitch`, which is the same failure class as our theme font and character scale bugs.

**Font metric drift (inferred):**
- **Collabora** lays out with the fonts on the server, so all clients see the same layout. Missing fonts get substitutes from a replacement table.
- **ONLYOFFICE** uses fonts installed on the server, read through FreeType, and ships them to its editor. Measurement is therefore identical for every client, and doesn't depend on the user's OS.
- **Canvas engines** measure with their own font data, not the user's OS fonts.

All three take the same lesson: **the engine owns the font metrics.**

**Whitespace and empty paragraphs:** in Word's model an empty paragraph is a line whose height comes from its paragraph-mark properties. LibreOffice models it the same way. There's no "blank line" hack; the height follows from the mark's font, size and spacing.

## 3. Complex structures

**Tables (observed in LibreOffice, inferred elsewhere).** The model keeps the grid (`w:tblGrid`) and cell margins, which default to `w:tblCellMar`, then 108 twips left/right. Merges keep their Word form (`vMerge` restart/continue, `gridSpan`), and border conflicts are resolved by Word's precedence rules at layout time. Saved state is the model, never CSS, so there's no shorthand/longhand round-trip class of bug.

**Anchored objects.** These are frames held outside the text flow with:
- the anchor paragraph
- `positionH`/`positionV` relative to page, margin, column or paragraph
- the extent
- the wrap mode

The layout engine places the frame on the page of its anchor paragraph and reduces the line widths of text that intersects it. That is an engine operation, not a CSS float, and it's why it works across page breaks.

**Lists and tabs.** `abstractNum` and `num` definitions with level overrides are resolved into a numbering instance at layout time. Counters are model state, not CSS counters. Tab stops are paragraph properties, and the engine positions text at them.

## 4. IntelliDocs: where the mismatch is

| # | Mismatch | Evidence from this project | Cost |
|---|---|---|---|
| M1 | **HTML with CSS strings is the storage format.** Every save serialises live DOM styles, so the browser can rewrite them | Padding shorthand lost on reload (V2 31 → 34 pages); class names dropped; `hr` → `div` on save | Silent layout loss after the first save |
| M2 | **No section object.** Sections are `hr[data-section]` markers, and per-section margins are faked by shifting blocks (`_shift_sections`) | Per-page body height prototyped and rejected (`AGENTS.md`); DM-OUHRODI has 35 sections and layout 0.188 | Wrong page geometry on multi-section files |
| M3 | **Pagination is browser flow plus `tiptap-pagination-plus` floats**, then patched (`PageFlow` spacers, `lastLineSlackPx`, `layoutPageBreaks`) | Floats can't coexist with page-break floats; slack measured per fixture (3px/9px); spacers measured before layout settled | Every Word rule is a post-hoc patch |
| M4 | **Font metrics come from the user's browser and OS** | Per-font line factors measured by hand; `font_widths.json`; "Bookman installed here but not on the server" | Pagination differs by machine |
| M5 | **No original package kept.** Export rebuilds Word from HTML (`downloadDOCX(editor.getHTML())`) | Exports are HTML-as-`.doc` | Round-trip loses everything HTML lacks |
| M6 | **Page furniture through CSS hacks**: counters, header art boxes, footnotes moved to the end | counter-reset bug; footer art on the wrong page; footnotes not at page foot | Each needs its own workaround |

## 5. Blueprint: highest impact first
Each stage is independent and testable, and none needs a canvas rewrite. A canvas editor like Google's or ONLYOFFICE's would mean building a text editor from scratch, which the TipTap-only requirement rules out.

### Stage 1: store ProseMirror JSON, not HTML (fixes M1) · days
- Add a `content_json` column holding `editor.getJSON()`, and load from it when present. HTML stays as a derived field for search, plagiarism and legacy rows.
- Give node attributes typed values instead of CSS strings: paragraph spacing as numbers, a cell padding object, borders as structured values. `renderHTML` builds the CSS, so the browser never round-trips styles.
- Files: `server/src/models/documentModel.ts`, a migration, `server/schemas/documentSchemas.ts`, `frontend/src/pages/Document.tsx`, `PagedEditor.tsx`, and the node extensions in `TiptapEditor.tsx`.
- Gate: save, reload and save again produces identical JSON, using the existing `saveRoundTrip.test.ts` extended to every fixture.
- **Status (2026-11-03): JSON storage done; typed attributes deferred.**
  - Migration `037_document_content_json.sql` adds `content_json` to documents and versions. The storage quota counts the JSON in place of the HTML.
  - The server clears `content_json` whenever `content` is written without it, so stale JSON never loads over newer HTML.
  - `word_gate.py --roundtrip` reopens every fixture from its saved JSON and requires the same score as the first open.
  - **Follow-up, typed attributes:** still open. JSON storage already removes the round-trip drift, because attribute strings are saved exactly as the editor holds them. Typed values would change converter output and every node extension, so they belong with Stage 2's canonical IR.

### Stage 2: canonical IR from the converter (fixes M1 and M5, enables everything else) · 1–2 weeks
- `converter.py` emits a versioned JSON IR (with a Zod schema on the server boundary):
  - `sections[]`: geometry, columns, header/footer refs, numbering
  - `blocks[]`: resolved paragraph properties as numbers, with style ids kept
  - `runs`: font, size, scale `w:w`, spacing
  - `tables`: grid, merges, cell margins, resolved borders
  - `anchors[]`: anchor block, H/V position, extent, wrap
  - `lists`: numbering instances
  - `notes[]` and `fields[]`
- A single IR → ProseMirror JSON mapper replaces today's IR → HTML strings.
- Keep the original `.docx` in storage, keyed to the document. Export can then patch the original package (python-docx) instead of rebuilding Word from HTML.

### Stage 3: sections as schema nodes (fixes M2) · 1–2 weeks
- Add a `section` node (`content: 'block+'`) with page size, margins, columns and header/footer references. This is also where per-section numbering lives, replacing CSS counters.
- The paginator reads the section of each page, which delivers the rejected per-page body height properly.

### Stage 4: font metrics owned by the app (fixes M4) · days
- Ship metric-compatible fonts:
  - Tinos/Arimo/Carlito/Cousine, which are partly shipped already
  - Caladea for Cambria
  - Gelasio for Georgia
  - TeX Gyre Bonum, adjusted to Bookman's width
- Use `@font-face` `ascent-override`, `descent-override`, `line-gap-override` and `size-adjust` to match Word's line metrics, so `_FONT_LINE_FACTORS` becomes CSS instead of converter magic.
- Always name the shipped font first, so pagination stops depending on the user's OS.
- **Status (2026-11-03): done, with three corrections to the plan above.**
  - **How it's done:** each Word font name is declared as an `@font-face` that points at its stand-in, so documents, exports and the toolbar keep the Word name. The file is `frontend/src/styles/wordFontAliases.css`, generated by `tests/e2e/tools/make_font_metrics.py`.
  - **Fonts:**
    - Arial Narrow now has Liberation Sans Narrow (GPLv2 with the font exception, shipped unmodified).
    - Bookman keeps TeX Gyre Bonum. Its widths already match Bookman's, so no width adjustment was needed.
    - Gelasio wasn't needed: no fixture uses Georgia.
  - **Line metrics:** each alias carries the Word font's line metrics as Chrome draws them on Windows. The generator measures them and checks that the stand-in then reproduces the Word font's line exactly.
  - **Correction 1, line factors:** `_FONT_LINE_FACTORS` stays in the converter. Imported paragraphs set an explicit numeric `line-height`, which multiplies the font size and ignores font metrics, so those factors are still needed.
  - **Correction 2, Cambria:** Caladea is not a twin of the Cambria 6.99 that Windows ships. Several letters are wider in Cambria (e 48.8 vs 44.1 per 100 em), about 4% overall. The Cambria alias therefore uses an installed Cambria first and Caladea elsewhere.
  - **Correction 3, fallbacks:** a font the computer lacks now falls back to a shipped font of its kind ('Times New Roman', Arial or 'Courier New'), never to the browser's generic family, which differs by system.
  - **Kerning:** Word doesn't kern by default, but turning kerning and ligatures off in the editor changed no fixture's layout, so it wasn't adopted.
  - **Gate:** `word_gate.py --shipped-fonts-only` lays every fixture out with only shipped fonts and passes the baseline. A DevTools check confirms the fonts that actually drew the text; at most 0.15% of glyphs came from installed fonts, all rare symbols.
  - **CI:** `.github/workflows/word-gate.yml` runs that mode with `--roundtrip` on Linux. It hasn't run yet, because the branch hasn't been pushed.
  - **Open:**
    - Symbols outside every shipped font (✓, □, ⨯, and private-use Symbol/Wingdings characters) still come from the system.
    - The private-use characters should be mapped to Unicode in the converter.

### Stage 5: an owned paginator (fixes M3 and M6) · weeks, the largest item
Replace `tiptap-pagination-plus` floats with a layout pass that measures, then places:
1. Measure each block's line boxes at its section's body width. The DOM is fine as the measuring device, since font metrics are now fixed.
2. Place lines into pages with Word's rules: widow/orphan, keepNext, keepLines, pageBreakBefore, exact/atLeast rows, and table header repeat.
3. Lay out anchors in page coordinates and reduce the widths of intersecting lines. That's the real version of `WrapBlock`.
4. Render page boundaries as decorations or widgets. The document stays untouched (as the CLAUDE.md PageBreak invariant requires), and footnotes go at the page foot.

The existing pieces (`PageFlow` rules, `lastLineSlackPx`, `layoutPageBreaks`, `WrapBlock`) become inputs to this one engine, and stop being patches on each other.

### Stage 6: Word truth in CI · days, alongside Stage 1
- Move this session's COM tools into `tests/e2e/tools/`:
  - `word_truth.ps1`
  - `diverge.py`
  - `word_lines.ps1`
- Commit Word's paragraph positions per fixture as golden JSON, so CI compares against Word without having Word installed.
- Make the measure "paragraphs on Word's page" (sabotage: 454/477) instead of the blurred image score, which kept understating real gains.

## 6. Recommended order and expected effect
1. **Stage 1 and Stage 6 first.** They're cheap, they stop silent regressions after the first save (the class of bug this session found three times), and they give a trustworthy measure.
2. **Stage 4.** Pagination becomes the same on every machine.
3. **Stages 2 and 3 together.** These make sections and anchors real.
4. **Stage 5 last.** It depends on 2–4, and the earlier stages reduce how much it has to absorb.

## Checklist status
| Question | Status |
|---|---|
| 1. Intermediate representation and Word-only primitives | **Answered** for LibreOffice and SuperDoc (code). Inferred for Google and ONLYOFFICE |
| 2. Where pagination happens, and fonts | **Answered** for Collabora (server) and Google (canvas). Partly answered for ONLYOFFICE. **Unresolved** for Word for the web |
| 3. Tables, anchors, lists | **Answered** from the OOXML spec and the LibreOffice model. Per-vendor internals inferred |
| 4. IntelliDocs mismatch and blueprint | **Answered** from this project's code and measurements |

## Sources
- [Google Docs canvas-based rendering update (May 2021)](https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html)
- [LibreOffice writerfilter module](https://docs.libreoffice.org/writerfilter.html) · [LibreOffice sw module](https://docs.libreoffice.org/sw.html) · [SwFrame](https://docs.libreoffice.org/sw/html/classSwFrame.html) · [swdocxreader.cxx](https://docs.libreoffice.org/sw/html/swdocxreader_8cxx_source.html)
- [LibreOffice Online deep dive (2016)](https://conference.libreoffice.org/assets/Conference/Brno/Online-DeepDive-2016.pdf) · [Collabora SDK architecture](https://sdk.collaboraonline.com/docs/architecture.html)
- [ONLYOFFICE sdkjs](https://github.com/ONLYOFFICE/sdkjs)
- [SuperDoc README](https://github.com/superdoc-dev/superdoc) · [SuperDoc issue #3261](https://github.com/superdoc-dev/superdoc/issues/3261)
- [Modernizing Word Online's UX platform](https://medium.com/web-on-the-edge/modernizing-word-onlines-ux-platform-df1050344e3a)
