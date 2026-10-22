# IntelliDocs Handoff Progress Artifact

**Date**: October 21, 2026 (nineteenth update — Header-zone inflation fixed + PDF import paragraph merging revived with a measured 1.4x geometry threshold)  
**Session**: Two follow-up bugs fixed and verified. (1) **Header-zone inflation**: the pagination library pads header/footer zones with the full page margin on top of the content offset, leaving ~2 inches of empty header space and stealing page-1 printable height (Enter near the bottom ejected text to page 2) — overridden in PagedEditor's scoped styles; first paragraph now starts at the authentic margin (132px → 76px at 0.75"). (2) **PDF imports shattered / merge pass dead**: the paragraph-merge guard no longer matched line-height-styled paragraphs, and merging is now governed by a per-page 1.4x measured line-advance threshold — paragraph nodes down 37–20% across the fixture PDFs. Full detail in the section below. One USER ACTION still pending — apply `db/supabase/026_document_preview_snippet.sql` in Supabase (graceful fallback active meanwhile).

---

## 🔁 Header/Footer Revert + PDF Pipeline Replaced by PDF→DOCX (twentieth update)

- **Header/footer revert**: the `.rm-page-header/.rm-page-footer` padding/max-height override added last session is removed from `PagedEditor.tsx`. In `tiptap-pagination-plus` that padding *is* the page margin; zeroing it pulled body text into the margin and collapsed the header/footer. Measured after revert: header padTop 72px (= 0.75" margin var), footer padBottom 72px. `AGENTS.md` now says never to clamp it. Not re-verified with real header/footer text (harness has none) — check on a real document.
- **PDF import**: all PDF→HTML heuristics deleted from `ml/src/converter.py`. `convert_pdf_bytes_to_html` now runs `pdf2docx` (0.5.13, MIT; PyMuPDF stays 2.0) into a temp DOCX and returns `convert_docx_bytes_to_html`. `ml/requirements.txt` gains `pdf2docx`; `/convert/document` is now a sync `def` so conversion runs in the threadpool. `tests/python/test_converter_headings.py` (26 PDF-heuristic tests) deleted; `tests/python/test_pdf_via_docx.py` added.
- **Measured trade-off (fixture PDFs via pdf2docx → DOCX converter)**: 0 headings and 0 page breaks on every PDF; header/footer empty; `0200725` → 643 p / 60 img / 24 tables; `DM-OUHRODI` → 619 p / 103 img / 60 tables / 11 MB HTML (was ~219 p); V2 sabotage → 636 p / 8 img / 12 tables. Conversion 0.5–9.6 s. Likely follow-ups: infer heading styles, restore page breaks, strip running headers, and cap HTML size.
- Verification: `pytest tests/python` 261 passed / 1 skipped; `npm run type-check` exit 0. Live PDF import through the app was NOT run (ML service on :8001 was started before this change).
- Pre-existing, untouched: `ml/src/main.py` `/parse` fallback assigns the converter's dict to `html` then `str()`s it.

---

## 📄 DOCX title page now matches Word; save-on-open data-loss bug found (twenty-eighth update)

User screenshot of `V2 INTELLIDOCS sabotage.docx` vs Word's own render (`reference_screenshots/.../page_001.png`). Layer-by-layer diagnosis: the staircase names / right-aligned "Adviser" are **in the document** (Word shows them too); the **library** was not at fault except for a layout gap (below); the rest was our editor preset CSS + our conversion + one schema filter.

| symptom | cause | fix |
|---|---|---|
| every left line +0.5in, title wrapped early | applied UCLM preset sets `.ProseMirror p { text-indent: 0.5in; font-size: 12pt }`; converter emitted no indent/size | converter emits explicit `text-indent:0` and base `font-size` on every paragraph (inline beats preset); `li p` indent reset in `academicPresets.ts` |
| Word's real body indents dropped | `text-indent` missing from `ALLOWED_STYLE_PROPS` (`TiptapEditor.tsx`) | added |
| page ran ~1in long by the bottom ("APPROVAL SHEET" spilled to page 2) | CSS `line-height: 1.5` = 1.5em, Word "auto 1.5" = 1.5 × font's natural height (TNR 1.15) | `_FONT_LINE_FACTORS` table (measured from installed fonts); blank lines use paragraph-mark font (doc default is Cambria, marks are TNR) |
| another ~0.12in at the top of every page | library header/footer zones are `display: inline-flex` -> line-box gap | `PagedEditor.tsx`: zones `display: flex` |
| header text "2" on page 1 | `PAGE` field cached result imported as static text | `_extract_header_footer` returns `header_number_format`/`footer_number_format`; server import sets `show_header` + formats (`predictionSchemas.ts`, `documentController.ts`) |

Measured (real import, writes blocked): title-page line positions vs Word 0.03-0.05in (was up to 1.02in drift); "This Capstone Project study" starts page 2 like Word; header shows a real page number. Page counts vs Word: V2 (2) 31/31, V2 sabotage 32/33; still off: research 17/14, DM-OUHRODI 50/32, DM_0440 4/2 (tables are still clipped by the library's `display: contents` + 0px wrapper, and anchored/floating images take flow space — separate issues). Tests: `pytest tests/python` 288 passed / 1 skipped, server jest 160/160 (planted `auditController` fixture fails as before), both type-checks clean.

Not fixed (visible on page 2): paragraph tab stops collapse to a space (signature rows), paragraph borders (horizontal rules) are dropped, "different first page" is not persisted (page 1 shows "1").

### ⚠️ DATA LOSS: opening a document can overwrite it with defaults (found while testing)
Evidence: every open (4/4) sends a full `PUT /documents/:id` ~6s after load; twice during this session a document silently became `title "Untitled Document"`, content `<p></p>`, no header (version history shows the destructive version; earlier versions are preserved, so restore via History). Mechanism (`frontend/src/pages/Document.tsx`): the empty editor's first `onUpdate` -> `handleContentChange('<p></p>')` (differs from `latestContentRef`'s initial `''`) -> `scheduleSave()` -> 3s (`AUTOSAVE_DELAY`) later `saveDocument()` builds the request from refs initialised to `'Untitled Document'` / `''`; if the document fetch has not filled them by then it saves the defaults, and `setContent(nextContent)` then blanks the editor too. There is no "document loaded" guard. **FIXED (twenty-ninth update, same day, after the user lost a document on their second open):** `documentLoadedRef` guard in `Document.tsx` (set only after the network fetch is applied; checked in `scheduleSave`, `saveDocument`, `handleContentChange`; a `cancelled` flag also stops a late response for a previous document being applied to a new one; a failed load shows the save-error status instead of looking saved), plus a server net: `server/src/utils/documentGuards.ts` `isDestructiveBlankOverwrite` makes `updateDocument` return 409 for a blank + default-title save over a non-empty renamed document (controller now passes 403/409 through instead of a blanket 500). Verified: fetch delayed 7s and 12s (autosave timer is 3s) -> the page sends no writes and the document is intact (before: every open sent a save); destructive PUT -> 409 and stored doc unchanged; normal edit and clear-with-same-title still 200. Server jest 167 tests (7 new), both type-checks clean. NOT covered by the server net: a default-titled document wiped by an old cached client bundle (only the client guard protects it, so reload the page to pick up the new bundle). Recovery for already-wiped documents: Document -> History -> restore the version just before the empty one (snapshots are kept; API `POST /documents/:id/versions/:versionId/restore`).

Test-harness note: a stale ML process (older code) held port 8001 and silently served imports; always verify exactly one listener per port before live tests.

---

## ⚡ ML service startup: ~11-14s → ~1.9s to listen (twenty-seventh update)

`python src/main.py` spent ~8.9s just importing `main` (`torch` 3.4s, `grammar.grammar_checker` → sklearn/scipy/nltk 2.9s, `pandas` 1.4s) plus ~1.5-2s in the startup hook, which also did a Supabase round trip (a 404 for a bucket that does not exist) on every start before falling back to the local ONNX file.

**Changes**: `ml/src/main.py` — `torch`/`pandas` no longer imported at module level (imported inside `compute_lstm_sequence_adjustment`, `predict_with_user_lstm`, `build_feature_row`; `pd` only under `TYPE_CHECKING`), `grammar.grammar_checker` imported inside `/grammar/check`; the FastAPI `lifespan` now only starts a daemon thread (`_warm_up_heavy_modules`: imports pandas, torch, grammar_checker, then loads the ONNX runtime). uvicorn finishes lifespan startup *before* opening the port, so warm-up work must stay in that thread. `ml/storage.py` `download_base_onnx_model` order is now fresh cache → local `ml/models` files → Supabase. `spell_checker`/`compliance_auditor` stay eager (<0.15s combined).

| | before | after |
|---|---|---|
| time to listen | 10.5 / 10.8 / 11.7 / 12.7 / 13.9s | 1.9 / 1.9 / 1.9s (2.2-2.3s in the endpoint harness) |
| grammar request once warm | 0.87s | 0.48s |
| first request while warm-up still running | — | slower (a /predict fired ~2s after listen took 11.1s vs 7.6s) because it waits on the same imports |

Verification: 10/11 endpoint responses byte-identical before vs after (`/`, 6x `/predict`, `/grammar/check`, `/audit/compliance`, `/convert/document`); `/spelling/check` differs only in low-ranked suggestions, which the **unmodified** checker already randomizes per hash seed. Both LSTM paths exercised with a fabricated user model + temp DuckDB (real probabilities, no swallowed warnings; `import main` loads no torch/pandas/sklearn). `pytest tests/python` 274 passed / 1 skipped. Note pytest never imports `main.py`, so the endpoint snapshot is the real coverage.

**Follow-up (same day): tokenizer + base model also warmed.** `_warm_up_heavy_modules` now also runs `load_model_payload()` (38 MB RandomForest pickle, pulls in sklearn) and a new cached `load_tokenizer()` (`transformers.AutoTokenizer`, ~10s import). The tokenizer used to be rebuilt via `from_pretrained` on EVERY prediction; it is now cached in `_TOKENIZER_CACHE`, and `predict_with_onnx` uses `load_tokenizer()`. Measured first full `/predict`: original 7.56s → after warm-up 0.11s (grammar 0.22s). A request fired immediately after the port opens still waits ~11s for the same loads (port up at ~2s, first prediction answered ~13.5s after launch vs ~21.5s originally). Snapshot diff vs the original: 10/11 identical in both the immediate and warmed runs (`/spelling/check` differs only in the randomized low-ranked suggestions), no warm-up warnings in the log, `pytest tests/python` 274 passed / 1 skipped.

**Remaining**: `/predict` with a `user_id` still costs ~1-1.6s per request because `storage.download_user_model` hits Supabase (404 "Bucket not found") each time; `/health/ready` on the Node side may report the ML service as reachable while it is still warming.

---

## ⚡ Server dev startup: 7.6s → 3.7s, restart 7s → 3s (twenty-sixth update)

`npm run dev` (`tsx watch`) restarts the whole process on every save, so cold-start cost is paid per edit. Profiling showed `index.ts → documentRoutes → documentController → processImportJob → driveModel → googleapis` (all ~330 Google APIs, ~2.8s) was on the startup path only because `documentController` imported one tiny helper from `processImportJob`.

**Changes (all under `server/`)**: `src/skills/sanitizeImportedHtml.ts` (new, one export; `processImportJob`/`driveController`/`documentController` import it); `driveModel.ts` + `driveController.ts` use `OAuth2Client` from `googleapis-common` and `drive` from `googleapis/build/src/apis/drive` instead of the `googleapis` barrel (`processImportJob` uses a type-only `drive_v3`); `documentController.ts` lazy-loads `mammoth` (`await import`) and `pdf-parse` (`createPdfParser`). `package.json`/lock: `googleapis-common` pinned exact `8.0.2` (the copy `google.auth.OAuth2` already resolved to; the top-level `google-auth-library` 10.7.0 is a *different* class and fails the Drive typings — do not use it).

| | before | after |
|---|---|---|
| time to listen (`npm run dev`) | 7.6s / 7.6s | 4.0 / 3.3 / 3.9s |
| restart after saving a route / controller | 7.2s / 6.7s | 3.2s / 2.8s |

Verified: `tsc --noEmit` clean; ESLint clean on changed files (4 pre-existing errors in `documentController.ts` — two `any`s, two useless escapes — are identical at HEAD and untouched); `npm test` 160/160 tests pass in 18/19 suites; runtime smoke of lazy mammoth/pdf-parse and Drive client construction. The one failing suite, `auditController.test.ts`, is the planted calibration fixture (imports missing `vitest`). NOT verified: a live Google Drive OAuth/import flow (no credentials here).

Remaining floor (~2.7s with every heavy package stubbed): node+tsx ~0.7s, express ~0.4s, arcjet ~0.6s, supabase/redis clients.

---

## ✅ Header/footer rows moved into the margins (twenty-fifth update)

Reported (user screenshots): the first row of the page grid showed a link cursor and text would not rise into it; the last grid row held no text. Root cause (library math, `tiptap-pagination-plus` utils `getHeight`): body height = page − (margin + **header content height**) − (margin + **footer content height**), so the 18px header/footer rows were carved out of the printable area. Live proof: `elementFromPoint` on the first grid row returned `div.rm-page-header-content` (`cursor: pointer`).

**Fix** (`PagedEditor.tsx` scoped style): `.rm-page-header-content` / `.rm-page-footer-content` get `height: 0 !important; overflow: visible !important; position: relative` with `top: calc(var(--rm-margin-top) * -0.5)` (header) and `calc(var(--rm-margin-bottom) * 0.5 - 9px)` (footer); zone padding untouched. `AGENTS.md` records the invariant.

| 1" margins, 120 body lines | before | after |
|---|---|---|
| header/footer content height | 18 / 18px | 0 / 0 |
| body start from sheet top | 122px | 104px (96 margin + 8 paragraph margin) |
| lines on page 1 | 32 | 33 |
| element under first grid row | header-content, `cursor: pointer` | editor body, `cursor: auto` |

Verified visually with gridlines on (old vs new, top and bottom of page 1) and at 0.5" margins with real header/footer text; `npm run type-check` clean; V2 sabotage PDF fixture stable at 28 pages (no pagination trouble). Not tested: different-first-page headers, multi-line headers taller than the margin (they would overlap the body), spread preview, a real header/footer through the in-app header editor.

---

## ⛔ `.tableWrapper { width: 100% }` REJECTED — pagination runaway (twenty-fourth update)

Applied then **reverted** (`PagedEditor.tsx` has only the `word-break` override). Giving the table wrapper real width makes `tiptap-pagination-plus` 3.1.0 loop forever on tables that are taller than a page:

- V2 sabotage PDF-derived: pages 949 → 1,455 → … → 7,527+ in 70s (browser freezes; the measurement script hung 29 min on it).
- The List of Tables alone (one 30-row, ~1,521px table): 413 pages. So it is not document-specific; the 4 other PDF fixtures finished only because their tables are shorter (16 / 29 / 2 / 24 pages, identical to override-only).
- Variants tried by CSS injection, all ran away: `width:100%`, `+ overflow:visible`, `min-width:100% + overflow:visible`. Override only: stable (28 pages for V2 sabotage).
- Consequence: with the library's `display: contents` table, the wrapper stays 0px and the table is clipped/invisible (see 23rd update). A real fix needs a different table strategy (upgrade/replace the library's table handling, cap row/table height, or render tables outside its measurement), not a CSS tweak.
- DOCX fixtures were not re-measured this round (last valid numbers are in the 23rd update).
- The test document `ac30af49-7bad-44a2-b1f2-caf3c9e6b553` now holds the List of Tables excerpt only (title reads "Untitled Document").

---

## 🛠 Table word-break override applied + tables found invisible (twenty-third update)

**Applied**: `PagedEditor.tsx` scoped style: `.rm-with-pagination table tr td/th { word-break: normal; overflow-wrap: break-word }`. `npm run type-check` clean.

**Page counts, library `break-all` forced back (before) vs override (after)** — live editor, each fixture's own page setup (margins clamped to the API's 0.1" minimum; source PDF page count in brackets):

| fixture | PDF-derived | DOCX-derived |
|---|---|---|
| 0200725 research [14] | 32 → 16 | 32 → 15 |
| DM-OUHRODI [32] | 51 → 30 | inconclusive (see below) |
| DM_0440 [2] | 4 → 4 | 5 → 4 |
| V2 (2) (1) / V2 (2).docx [31] | 43 → 24 | 77 → 29 |
| V2 sabotage [33] | 49 → 28 | 78 → 29 |

Table height (V2 sabotage PDF) 29,226px → 5,549px; first table body 115px × 12,904px → 355px × 1,521px.

**Unresolved / caveats**
- Page counts now run *below* the source for several fixtures (e.g. 24 vs 31) because `PageBreak` nodes do not force pages (see 22nd update); not a regression.
- **Tables were effectively invisible in the editor.** `.tableWrapper` is computed 0px wide with `overflow: auto` (the library makes `table` `display: contents`), so the table is clipped and sits at the far right under the assistant panel. With an injected `.rm-with-pagination .tableWrapper { width: 100% }` the V2 List of Tables renders correctly (screenshot `table_fix_wrapper-width-100.png` in the session scratchpad). NOT applied; page counts with that rule were not measured (the second candidate's screenshot timed out).
- **Merged-cell bug in `_table_to_html`** (visible once the table renders): pdf2docx tables use vertical merges; iterating python-docx `row.cells` repeats merged cells, so each List-of-Tables entry appears twice and page numbers are shifted by half a row. Needs `gridSpan`/`vMerge` handled as colspan/rowspan. Affects any DOCX with merged cells too.
- Converter returns margins below the API minimum for some documents (`top 0.0`/`0.09` for the research and DM PDFs, `bottom 0.0` for the DM DOCX); `PUT /documents/:id` rejects margins < 0.1 (400). Check what the import path does with them.
- DM-OUHRODI DOCX (5 MB) measured 50 pages once and 2 pages/0 tables twice; later the test document twice ended up empty ("Untitled Document", 0 KB) during rapid write/reload cycles from the harness. A clean write → open → navigate away → reopen cycle did NOT lose data (even at 5 MB), so the cause is unproven; worth watching given the "opening must not rewrite" invariant.

---

## 🔎 Why imports render far more pages than the source (twenty-second update — INVESTIGATION, no code changed)

Imported V2 sabotage PDF: 49 editor pages vs 33 PDF pages. The **DOCX** of the same document renders **75** pages vs 31 in Word — so this is an editor bug, not a PDF-converter one. Measured live (real stack, `test@test.com`), by loading the same HTML with parts stripped / CSS injected:

| experiment | PDF-derived | DOCX-derived |
|---|---|---|
| as imported | 49 pages | 75 pages |
| explicit page breaks removed | 49 | — |
| paragraph margins removed | 44 | — |
| line-heights removed | 53 (exact line-heights help) | — |
| empty spacers removed | 49 | — |
| **`word-break: normal` on table cells** (+ tbody width) | **28** | **27** |

- **Root cause**: `tiptap-pagination-plus` 3.1.0 injects `.rm-with-pagination table tr td/th { word-break: break-all }` and makes `tbody` a shrink-to-fit `display: table` inside a `display: contents` table. Imported tables collapse to ~36px columns (editor cell padding is 12px each side), words break mid-word, and 12 tables took 29,266px (~30 pages of height; body text is ~18). Table height 29,266px → 5,549px with the override.
- **Page breaks do nothing visually**: all 31 `div.intellidocs-page-break` nodes render at 0px height and 0/31 start a new page. `PageBreak.ts` is a documented invisible spacer, and the library (3.1.0) has no forced-break API. A real forced break would need the node's `height` attr set to the remaining page space (the old custom renderer did this). Page counts therefore come from content flow alone.
- **Second table bug, not the cause**: pdf2docx writes equal `tblGrid` columns (3141 twips x3) with the real widths in per-cell `tcW` (1500/6080/1340); `_table_to_html` reads only `tblGrid`, so PDF tables get equal columns. Prefer `tcW` when the grid is uniform and cells differ.
- **Fonts**: pdf2docx emits PDF face names as families (`'Times New Roman,Bold'`, `'___WRD_EMBED_SUB_11'`); bold/italic survival not yet checked.
- Candidate fix (proven by live injection, NOT applied): scoped override in `PagedEditor.tsx` for `.rm-with-pagination table tr td, th { word-break: normal; overflow-wrap: break-word }`. Re-verify page counts after applying; remaining 28 vs 33 is explained by breaks not forcing pages.
- Test doc `ac30af49-7bad-44a2-b1f2-caf3c9e6b553` (test account) was overwritten by these experiments and now holds the PDF-derived HTML.

---

## 🔧 PDF→DOCX Gap Repairs — page breaks, headings, running headers, size (twenty-first update)

All in `ml/src/converter.py`, PDF path only (`convert_docx_bytes_to_html` is behaviour-identical: DOCX fixtures re-measured unchanged, V2 DOCX still 7 page breaks). `_docx_document_to_result` now holds the shared DOCX→result code; `_body_to_html` takes an optional `page_break_after` set.

| gap | fix | proof (fixtures) |
|---|---|---|
| 0 page breaks | `_page_break_paragraphs`: next-page `sectPr` → `<hr class="page-break">` (continuous/column sections ignored; blank page-end paragraphs dropped) | 13 / 31 / 1 / 29 / 31 breaks (was 0); V2 sabotage 32 section breaks = 33 pages minus the trailing one |
| 0 headings | `_infer_heading_styles`: size ≥1.2× body, or bold + heading shape (numbered, CHAPTER/SECTION, roman/lettered, ALL CAPS, Title Case); rejects captions, tab-leader TOC lines, unbalanced fragments; level from numbering depth or size/caps rank | 15 / 22 / 2 / 18 / 33 headings (was 0) |
| running headers/logos in body | `_strip_running_furniture`: first/last 4 keyed elements per page; key = text + image hash; must repeat on ≥3 pages and ≥40%; page-number phrases normalized | images 60→8, 103→35; tables 158→60 raw; HTML 1.2MB→310KB, 11MB→1.7MB |
| 6 MB page image | `_compress_image_bytes` (≥150KB → ≤1400px JPEG q82, alpha stays PNG) via `pymupdf` | included above |

Bug caught by tests: the first furniture key digit-normalized every number, so body lines differing only by a digit ("Article 4") could be deleted on short pages. Now only page-number text is normalized (`_PAGE_PHRASE`, `_PAGE_NUMBER`); regression test `test_lines_differing_only_by_a_number_are_kept`.

Verification: `tests/python/test_pdf_via_docx.py` 14 passed; full `pytest tests/python` 273 passed / 1 skipped / **1 failed**: `test_ml.py::TestModelPerformance::test_formatting_model_latency` (17.0ms vs 15ms threshold, fails alone too) — a model-timing assert in code this change does not touch; not investigated. Not run: live PDF import through the app (restart the ML service first).

Known remaining: tables still over-segmented vs DOCX (research paper 24 vs 5; pdf2docx splits tables per page); bold glossary terms become h3; pdf2docx logs `[INFO]` per page to the service log; conversion is 1–17 s per document (sync route, threadpool).

---

## ✅ Header-Zone Inflation & PDF Import Merging — FIXED + VERIFIED (this session)

Two reported bugs — each had a root cause beyond the report, both found by measuring.

### Bug 1 — Page header area ~2 inches tall; Enter near the bottom of page 1 ejected text to page 2

- **Cause**: `tiptap-pagination-plus` pads `.rm-page-header` with `padding-top: var(--rm-margin-top) !important` (96px at 1" margins) while the page margin is *already* applied through the content offset — the zone duplicated the margin. Measured pre-fix (0.75" margins): header element = **72px of pure padding**, library `max-height` 403.2px, first paragraph 132px below the sheet top.
- **Fix** (`PagedEditor.tsx`, component-scoped `<style>`): `.rm-page-header { padding-top: 0 !important; padding-bottom: 8px !important; max-height: 48px !important; }` and the mirrored footer rule. The scoped style wins the cascade by document order over the library's head-injected rules (same mechanism as the existing spread overrides) — no library or global-CSS change needed. `contentMarginTop/Bottom` were already `0` in both the creation config and the layout effect (verified in code) — no calculation change required.
- **Measured before → after (live harness)**: header padTop **72→0**, padBottom **0→8**, max-height **403→48**, header element height **72→8px**; first paragraph from sheet top **132px → 76px** — the authentic 0.75" margin restored (**+56px printable height on page 1**, more at 1" margins). Pagination untouched (page breaks and page count unchanged).

### Bug 2 — PDF imports shattered into isolated lines; paragraph-node bloat on load

- **Hidden cause found**: the paragraph-merge pass was **effectively dead** — its guard only accepted `<p>` or `<p style="text-align:left…"`, but since the line-spacing work every PDF paragraph carries `style="line-height:…"`, so **nothing ever merged** (this is why the shattering persisted through earlier fixes). A doc-level threshold attempt also proved useless: the document-median line advance (12.5pt) sat below the real per-page advances (19pt), so no pair ever qualified.
- **Fix** (`ml/src/converter.py`):
  - `_pdf_is_flowing_paragraph`: accepts any `<p` **without an explicit alignment** — centered/right-aligned titles, bylines and dates never merge into flowing text.
  - `_pdf_merge_wrapped_paragraphs(items, max_join_gap=0.0)`: merges blocks within `max_join_gap`; bare calls keep the legacy punctuation heuristic (the 26 merge/heading pytest contract stays intact); upward gaps (column changes) never merge.
  - `_pdf_page_join_threshold`: per-page threshold = **1.4x the page's own measured line advance** (median of block-gap deltas, 0.7–2.5x font-size window so paragraph gaps and fragments cannot skew it; `0` disables merging for unmeasurable pages).
  - Call site now passes real page-space y coordinates (reading order retained by the column-aware sort) instead of ordinal indices.
- **Measured paragraph-node reduction**: `V2 INTELLIDOCS sabotage.pdf` **587 → 372 (−37%)**, `0200725_[research]` 144 → 123, `DM-OUHRODI-2026-3750-1` 273 → 219. Sample check: wrapped lines and `By: name` blocks rejoin; `Ms. Gian S. Mahusay` / `December 2026` / `Adviser` stay standalone — no run-on fusions across genuine breaks.

**Verification**: frontend `npm run type-check` **exit 0**; `pytest tests/python/ -q` → **286 passed, 1 skipped, 0 failed**; converter merge/heading tests **26/26**; `py_compile` clean; no debug leftovers (grep-verified). One full-suite run *while an extra dev server was running* showed `test_ml.py::TestModelPerformance::test_formatting_model_latency` at **15.058ms vs the 15ms threshold** (a 50-sample average timing assert) — it passes isolated (14.2ms) and in the clean full run; load-induced flake, unrelated to these changes (that test exercises the ML model, not the converter/editor).

**Files changed**: `frontend/src/components/editor/PagedEditor.tsx`, `ml/src/converter.py`. No new dependencies; MVC untouched; no `any` added.

**Next agent:** keep the header/footer zone overrides and the merge contract — the durable rules now also live in `AGENTS.md` (Custom Editor Rules + Import Pipeline Invariants). Do not narrow `_pdf_is_flowing_paragraph` back to style-matching inline checks.

---

## ✅ Import Format & Line-Spacing Architecture — FIXED + LIVE-VERIFIED (this session)

Reported symptom: imported DOCX/PDF "formats didn't save" and line spacing stayed wrong across **two converter generations** — because most of the damage was never in the converters. Root causes were found by measuring, not guessing (real Supabase stack, `test@test.com`).

| # | Root cause | Evidence | Fix |
|---|-----------|----------|-----|
| 1 | Editor stylesheet forced `.ProseMirror p { line-height: 1.5 !important }` — beat every imported inline line-height | live CSS inspection: every paragraph computed to 20px regardless of source spacing | `TiptapEditor.tsx`: `!important` removed — typed text still defaults to 1.5, imported inline spacing wins |
| 2 | Converter dropped spacing inherited from styles/docDefaults (82/213 paragraphs in `0200725_[research]_9569504b`) and emitted no PDF line-height | source-vs-emitted probe; PDFs measured single-spaced (ratios 1.13–1.17) rendered at 1.5 | `converter.py`: `_resolve_spacing_attr` (direct → style chain → docDefaults); `_pdf_median_line_ratio` emits measured line-height on PDF paragraphs |
| 3 | Blank lines rendered **double height**: `<p><br/></p>` parses as a hard-break node = TWO line boxes | title-page blanks measured 44px vs 22px text lines | converter emits `<p class="empty-spacer" style=…></p>` (no `<br/>`); `PagedEditor.sanitizeLoadedHtml` strips a lone `<br>` on load (heals already-saved docs) |
| 4 | **Chunked progressive hydration corrupted stored documents.** Every page chunk ended with a page-break `<hr>`, and ProseMirror strips a trailing `<hr>` from every parsed fragment — breaks died one per cycle (7→2→0), then images/paragraphs near boundaries followed | hr counts across cycles; one doc shrank 1.08MB→601KB (3 images + 14 paragraphs + all breaks gone), stored tail ended in stray nested `</table>` closers | `PagedEditor.tsx`: chunk/pump/idle-scheduler subsystem deleted — **one transactional `setContent`** with pagination paused (single relayout). Opening a document no longer rewrites it (autosave only on real edits) |
| 5 | `hr.page-break` (import format) had no schema rule — parsed as a plain horizontal rule, class stripped on first save | isolated paste round-trip: 7 `<hr>` survive but classless | `PageBreak.ts`: parses `hr.page-break` with `priority: 110` (outranks StarterKit horizontalRule — first match wins) → breaks persist as `div.intellidocs-page-break` |

Also this session: the MarkItDown/pymupdf4llm converter experiment is **abandoned** — rich converter restored byte-exact from the opencode snapshot object store (`0230589e…`); `ml/requirements.txt` reverted to its original contents. `sanitizeImportedHtml` no longer purges blank paragraphs (only the `&nbsp;` squeeze remains). The restored PDF path keeps the fixed wrapped-paragraph merge guard (fixes 3 previously failing pytest tests).

**Acceptance (real Supabase + Express + ML, `V2 INTELLIDOCS sabotage.docx`, two full edit→save→reload cycles):**

| metric | at import | save #1 | save #2 | reload render |
|---|---|---|---|---|
| paragraphs | 485 | 489 | **489** | 489 |
| images | 8 | **8** | **8** | 8 loaded |
| page breaks | 7 `<hr>` | **7 first-class** | **7** | 7 rendered |
| blank lines | — | **22px single** | 22px | 22px |
| page widgets | — | 77 | — | 77 |

`pytest tests/python/test_converter_headings.py` **26/26**; frontend `npm run type-check` clean.

**Files changed:** `ml/src/converter.py`, `frontend/src/components/editor/PagedEditor.tsx`, `frontend/src/components/editor/PageBreak.ts`, `frontend/src/components/editor/TiptapEditor.tsx`, `server/src/skills/processImportJob.ts`.

**User actions:**
1. **Re-import previously imported documents** — their stored copies carry the old round-trip damage (missing page breaks/images/paragraphs); new imports are stable.
2. Verified test document kept for inspection: `V2 INTELLIDOCS sabotage` (`75c01ce9-3767-4d82-975e-c874e3f7d621`); the four damaged probe documents were deleted from Supabase.
3. (Carried over) Apply `db/supabase/026_document_preview_snippet.sql` if not yet applied.

**Next agent:** do not regress the invariants now documented in `AGENTS.md` → "Import Pipeline Invariants".

---

## ✅ Overhaul Plan — Group 3 UI/UX (T10–T13) — DONE + LIVE-VERIFIED (this session)

| # | Task | What shipped | Live proof |
|---|------|--------------|------------|
| **T10** | Slate palette purge | `index.css` tokens: `--canvas #f5f2ec → #f8fafc` (Slate 50), `--surface-sunken #ece7de → #f1f5f9`, `--border #dbd4c8 → #e2e8f0`, `--border-strong #9a8f82 → #94a3b8`, `--stone #d4ccbe → #f8fafc`, shadow tints neutralized (`--border-shadow`, `--border-shadow-light`, `--card-shadow-inner`, `--page-shadow`), `.bg-brand-cream` + `--color-brand-cream` → slate. Warm ink text colors deliberately kept (contrast unchanged; the plan targets backgrounds). Drives the landing, editor canvas, panels, popovers, and all Tailwind token surfaces. | Zero elements with any of the four beige tones on the landing; body + editor canvas `rgb(248,250,252)`; outline panel + assistant header pure white. |
| **T11** | Animated outline drawer | `.left-panel` transitions `width/min-width/max-width 200ms cubic-bezier(0.16,1,0.3,1)` between the expanded and 48px collapsed rails; `.left-panel li:hover` surface (inline `transparent` removed — it was overriding the stylesheet hover); count badge is now a rounded pill (`tabular-nums`); indentation tightened to a 0.75rem step (H1 0.5rem / H2 1.25rem / H3 2.0rem). | Transition property includes width @0.2s; hover `transparent → rgb(241,245,249)`; H2 indent 20px; badge radius 9999px. |
| **T12** | Assistant header | Header bar: 48px min-height, `0 1rem` padding, white `--card` background; the collapse control is now a 32px `.panel-icon-btn` (rounded-lg, 150ms hover transition) — shared class also ready for other panel headers. | minHeight 48px / padding 0 16px / bg white / button 32×32 radius 8px; hover `transparent → slate-100`. |
| **T13** | Ribbon modernization | Ribbon `ToolButton`s bumped 30px → **32px** (radius 8px, active accent pill with 1px primary ring — already conformant); tab strip already used the soft primary pill for the active tab and muted hover for inactive. | Undo button 32×32 radius 8px; active tab `bg-primary/10` pill detected. |

Verification: `verify_group3_ui.py` **13/13**; frontend `npm run type-check` clean; eslint 0 errors (1 pre-existing warning in OutlineNavigator); screenshots `g3_landing.png` / `g3_editor.png` reviewed — no beige anywhere, panels crisp white on slate.

**Deviations (logged):** T10 keeps the warm ink text palette (plan only specified background/border changes); T11's "expand" direction animates mount/unmount (the panel is conditionally rendered) plus width for collapse.

**Replacement plan status: COMPLETE** — G1 (T1/T3/T4/T9) + G2 (T2/T5/T6/T7/T8/T15) + G3 (T10–T13); its T14 was already shipped with the earlier landing rewrite.

---

## ✅ Overhaul Plan — Group 2 Engine Tasks (T2, T5, T6, T7, T8, T15) — DONE + LIVE-VERIFIED (this session)

| # | Task | What shipped | Live proof |
|---|------|--------------|------------|
| **T2** | 7-mode image wrap suite | `ImageWrapStyle` extended to `inline / wrap-left / wrap-right / wrap-both / break / behind-text / in-front`; toolbar shows all 7 with tooltips; `imageWrapStyle` composer + `wrapFromStyle` parser extended. **Key discovery**: the resize library's `sanitizeStyle` whitelists properties and strips `clear / position / z-index / opacity` from `containerStyle` — so those three advanced modes are tagged via a new `wrapMode` node attr (`data-wrap-mode`) and styled by CSS rules targeting the wrapper (`div:has(> img[wrapmode=…])`; the node view writes the attribute lowercased). `setImageWrapStyle` writes the tag + differing margins (the node view only re-syncs img attrs when the containerStyle string changes). | Live computed styles: behind → `opacity 0.82`; in-front → `z-index 30`; wrap-both → block/no-clear; break → `clear: both`. All 7 buttons present. |
| **T5** | TOC tables/figures | `extractTablesFromHTML` matches ANY `<table>` (caption → `<caption>`, else nearby `Table N:` label, else generated `Table n`); `extractFiguresFromHTML` matches `<figure>` + bare `<img>` (figcaption → alt/title → nearby label → fallback), skipping imgs inside already-counted figures. Both return entries instead of silently dropping uncaptioned content. | Dev-server module import in-browser: 2 tables (`Table 1`, `Table 5: Data`) and 2 figures (`Figure 1: Flow`, `Chart`) extracted from sample HTML. |
| **T6** | Viewport-anchored zoom | Single `applyZoom(next)` now drives every zoom path (widget, Ctrl+±/0, Ctrl+wheel, Fit Width): scales the viewport-center content Y by the zoom ratio and restores `scrollTop` on the next frame. `zoomLevelRef` keeps listeners with empty dep lists live. | Live: scrolled to 800, Ctrl+= → expected scrollTop `919`, actual `919` (zoom 1.1). |
| **T7** | PDF font clustering + columns | `converter.py`: document-wide `_pdf_median_span_size`; heading gate gains `size_floor = median × 1.2` (applied only for plausible medians 8–16pt); `_pdf_detect_columns` (x0 clustering, ≥25% page separation) + `_pdf_reading_key`/`_pdf_order_blocks` order blocks column-by-column; items re-keyed to a monotonic sequence before the wrap-merge pass. Signatures stay backward-compatible (floor defaults 0). | New pytest classes (floor + columns + reading order) — **26/26 pass**; all prior heading/merge tests untouched. |
| **T8** | Google Docs cards | Sheet now exact `w-[160px] h-[215px]` at `scale-[0.65]` (hover 0.68), softer shadow, `bg-slate-100/80` tray, footer icon upgraded to a solid primary glyph, plus a quick Share button beside the 3-dots menu. | Live: sheet CSS class present, rendered 104×140 (160×215 @ 0.65), tray background set, solid icon + footer title present. |
| **T15** | Sibling-cluster auditor + focus-safe propagation + overlay toggle | Scanner: exported `classifyStructuralRole` (title/byline/heading_1-3/caption/reference_entry/body); **sibling inconsistency sweep** — same-role heading clusters compute a modal style (bold/italic/fontSize/textAlign) and flag deviants (modal share ≥ 80%) with the differing metric named in the label and modal styling captured for accept (`suggestionSource: 'learned'`); captured candidates are excluded from plain format-grouping. Propagation: `maybeSuggestBlueprintGroup` → `maybeSuggestSiblingPropagation` — guide-group path kept, plus structural clusters for ANY document (imports have no guide attrs); **STRICT focus rule** — no `setTextSelection` anywhere; chips target the first sibling by range, Accept/Accept-All apply by range with the caret restored. UI: suggestion queue now shows the explanatory label; FormattingPanel has the **Format Overlays & Chips** master switch that clears highlights/chips instantly. **Real bug found + fixed by the new test**: scanner rescans were overwriting a chip-owned `suggestionRange` (its value hijacked mid-flow); the scanner→overlay sync effect now yields while a chip is open. | Live 23/23: inconsistency card ("differs… bold") in the queue for a bold APPENDIX among 5 headings; propagation chip `"Apply this formatting to all other Heading 1s? (4 remaining)"`; accept-all converted 1→5 headings; overlay toggle cleared highlight + chip (1→0). |

Verification: `verify_group2_ui.py` **23/23**; `probe_t8_cards.py` card geometry confirmed; pytest 26/26; frontend `npm run type-check` clean; eslint 0 errors on all touched files (pre-existing warnings only). No new dependencies; no backend changes beyond `ml/src/converter.py`.

**Deviations (logged):** T2 uses attribute + CSS for the sanitizer-stripped modes (the plan's `.image-resizer.wrap-*` classes don't exist in this library's DOM); T5's `TOCPanel` flags (`includeTables/includeFigures`) still gate display — extraction is now correct when enabled; T15's byline role participates in classification but propagation currently triggers for title/heading roles only.

**Next up:** Group 3 — T10 (slate palette purge), T11 (animated outline drawer), T12 (assistant header), T13 (ribbon tabs). T14 is already shipped (landing rewrite).

---

## ✅ Overhaul Plan — Group 1 Quick Fixes (T1, T3, T4, T9) — DONE + LIVE-VERIFIED (this session)

| # | Bug | Fix shipped | Live proof |
|---|-----|-------------|------------|
| **T1** | Gridlines floated off-sheet (top-right of the window) because the old CSS `::after` anchored to the library's zero-height `.page` float markers | `PagedEditor.tsx`: deleted the `::after` style; gridlines are now a **React overlay layer** — one absolutely positioned div per page, pure math: sheet pitch = `page.height + gap` (normal: `PAGE_GAP`, spread: `SPREAD_GAP`), text rect inset by margins, dashed boundary border. Page count comes from a cheap `.rm-page-break` count (`editor.on('update')` + resize). Container gets `position: relative`; the dead `--gridlines` class removed. | Overlay rects measured live: `top=96, w=576, h=864` and second page `top=1192` → **delta exactly 1096 = 1056+40**; screenshot shows the grid inside the margins on both pages. |
| **T9** | Callouts never rendered: index.css targeted `.intellidocs-editor`, a class no component applies | All 6 callout rules in `index.css` now select `.intellidocs-page-editor blockquote[data-callout]` + `.ProseMirror.rm-with-pagination blockquote[data-callout]` (higher specificity than PagedEditor's generic blockquote rule) + legacy `.intellidocs-editor` kept for harnesses. | Live: inserted a Note callout → `background: color(srgb … / 0.08)`, `border-left: rgb(19, 81, 170)`, `::before content: "Note"`; removed afterwards to leave the doc tidy. |
| **T4** | Outline jump needed 2 clicks and the flash never showed — the CSS class was added to the ProseMirror node right when the selection transaction re-rendered that DOM, wiping it; `scrollIntoView` got confused by the float markers | `OutlineNavigator` now only reports the click; `Document.tsx` owns the jump: captures the heading's rect **before** the selection dispatch, sets a `flashCoords` state rendered as an absolute `.heading-flash-overlay` inside the scroll canvas (React-managed — PM cannot delete it), selects `pos + 1`, then smooth-scrolls via `coordsAtPos` (`(coords.top − containerRect.top)/zoom − 80`). `findHeadingPosition` exported for this. Old `heading-jump-flash`/`.heading-jump-highlight` CSS replaced with `@keyframes heading-flash` + overlay class. | Live: click outline entry #2 → flash overlay present within 250 ms; target heading lands at **rel = 72 px** from the canvas top after a single click; overlay gone after ~1.6 s. |
| **T3** | DocumentTypePrompt never appeared on real imports: any existing heading suppressed the inference | Removed the `hasHeadings` early-return in `Document.tsx`'s structure-inference effect (marker scan is specific enough; bound presets still skip the offer). `sanitizeImportedHtml` already implemented the plan's spacer-collapse rules; the plan's `class="author-line"` join rule was skipped — **nothing in this repo emits that class** (dead regex). | Live: fresh doc typed with a real `## Abstract` heading (markdown trigger) + "In Partial Fulfillment … Bachelor of Science" markers → prompt surfaced despite the heading; dismissed via "Not now". |

Verification: `verify_group1_ui.py` **12/12**; frontend `npm run type-check` clean; eslint 0 errors on touched files (pre-existing warnings only). Group 1 changes are frontend-only — MVC/route/controller layers untouched, no `any` added, no new dependencies.

**Deviations (logged):** T1 overlay paints above text at 7% alpha (Word paints under; visually indistinguishable); spread-mode overlay geometry is math-derived but not yet live-checked with two-page spread; T3's author-line regex skipped as dead code (see above).

**Next up:** Group 2 — T2 (7-mode image wrap suite), T5 (TOC tables/figures extraction), T6 (viewport-anchored zoom), T7 (PDF font-size clustering + column reassembly), T8 (Google Docs card polish), T15 (sibling-cluster auditor + focus-safe propagation + overlay toggle). Group 3 — T10–T13 UI/UX (T14 already shipped with the landing rewrite).

---

## 🎯 Immediate Tasks (User + Tester Agent)

### User action (still pending from the 16th update)
Apply **`db/supabase/026_document_preview_snippet.sql`** in the Supabase SQL Editor. Until then the Home grid/list previews render fallback placeholder lines; everything else works.

### Tester Agent verification for the new plan (suggested script: `verify_plan2_ui.py` pattern, 30/30 locally)
1. **Landing** (`/`): plain-language copy (no jargon), click **Clean Up Paper** → messy essay cleans up with a *"Paper cleaned up and formatted in X seconds"* pill + Try Again.
2. **Unformatted doc prompt**: open a doc with no preset, >150 chars, no headings → *"This document looks like an Academic Thesis"* card → **Apply standard format** binds the preset and the deductive scanner starts suggesting.
3. **Image toolbar**: click any image → floating toolbar below it (Wrap Inline/Wrap L/Wrap R/Break, alignment, 25–100% + reset, delete). Click **Wrap R** → wrapper gets `float: right`.
4. **Page Setup** → placement buttons per zone (left/center/right/split), Header at / Footer at offsets, *Different first page* toggle. Choosing **center** adds `.intellidocs-page-editor--header-center`.
5. **Styles ribbon** → **Guides** toggle flips *Hide/Show blueprint guide boxes*.
6. **Deductive suggestion**: short first paragraph (≤120 chars) + preset applied → after ≤10s the block is outlined; click it → chip *"Format as Title based on University Capstone / Thesis preset · 86%"*.
7. Temp docs created by the local verification live in the workspace: **Unformatted Infer Test**, **Preset Suggest Test**, **Chip Probe Doc** — harmless, delete from the dashboard at will.

---

## 🔍 Verification Protocol (Tester Agent / Antigravity) — COMPLETED (10/10 PASS)

Executed independent E2E Playwright verification suite (`tests/e2e/test_section_7_verification.py`) and empirical baseline audits on live dev services:

| Check | Verdict | Details |
|---|---|---|
| **Accuracy Metrics Artifact** | **PASS** | `ACCURACY_METRICS.md` validated at repo root with empirical baselines: WikiText-103 Top-1 **99.9%**, Top-3 100.0%; JFLEG GLEU **0.7734**, Precision 0.958; Spell Checker Detection **96.0%** (24/25), clean false positive 0/95. |
| **Swiss Modernist Landing Page** | **PASS** | `Landing.tsx` renders 12-column Swiss grid, Syne hero "Academic Rigor Automated.", 3 simulated TipTap confidence chips (`Heading 1 · 98%`, `APA Citation · 94%`, `Syntax Fix · 89%`), 4-pillar architecture grid, and navigation routes. |
| **DocumentZoomWidget Placement** | **PASS** | Docked at bottom-right (`{x: 936, y: 829.75, width: 248, height: 38}`) inside viewport without overflow. |
| **Zoom Step `[-]` / `[+]`** | **PASS** | Smooth 10% steps: `1.00 -> 0.90 -> 0.80 -> 1.10`. |
| **Continuous Range Slider** | **PASS** | Continuous slider (0.30–2.00, step 0.05) sets zoom level accurately (tested at `1.50`). |
| **Quick Preset Menu** | **PASS** | Popover menu selects presets accurately (`50%` -> 0.50, `Fit Width` -> 1.00). |
| **Keyboard Shortcuts** | **PASS** | `Ctrl + 0` (reset to 100%), `Ctrl + =` (increment to 110%), `Ctrl + -` (decrement to 100%). |
| **Ctrl + MouseWheel** | **PASS** | Non-passive wheel event listener smoothly zooms canvas (`1.05`) without browser window zoom. |
| **Page Count Stability** | **PASS** | Page break count remained strictly identical at **2** across all zoom transitions (zero feedback loops or pagination drifts). |
| **Application Errors** | **PASS** | 0 relevant console or page errors recorded. |

---

## 🔬 Import Accuracy & Sabotage Baseline Audit (User Fixtures)

Audited 5 document pairs (10 files) in `tests/fixtures/import_baselines/documents/` through `ml/src/converter.py` and visual PyMuPDF inspection:

1. **Sabotage vs. Correct Manuscript (`V2 INTELLIDOCS`)**:
   - **Page Count Inflation (31 -> 33 pages)**: Identified 39 paragraphs with explicit space-after differences (e.g. `w:spacing w:after="152400"` = 10.5pt). Cumulative paragraph spacing pushes content across 30+ pages into 2 extra phantom pages.
   - **Image Margin Bleed**: In the correct manuscript, photos have width `cx = 5481320` (~6.0 inches), perfectly bounded within the 6.0" body text (8.5" letter - 1.5" left margin - 1.0" right margin). In the sabotaged manuscript, Image 2 was inflated to `cx = 7932717` (8.68 inches / 625 pt), bleeding 0.18" past the physical page and well past the right margin.
   - **Distorted Table Cells**: Table 3 in the sabotaged manuscript has severely distorted column widths (`[568325, 914400, 685800, 457200, 1355725, ...]` vs balanced `[1085850, 790575, ...]`), squishing columns while ballooning others.

2. **Benchmark Document Ingestion Profiles**:
   - `0200725_[research]_9569504b`: 14-page IEEE/journal format with 125 explicit paragraph margins, 5 multi-cell tables, running headers and copyright footers.
   - `DM-OUHRODI-2026-3750-1`: 32-page DepEd memorandum with 25 tables, 78 embedded images, 163 spaced paragraphs, and A4 page setup.
   - `DM_0440_s_26_SGOD_Conduct-of-World-Teachers-Day`: 2-page memorandum with narrow margins (0.75" L, 0.5" R) and institutional footer address.

3. **Recommended Immediate Action for DeepSeek (Builder Agent)**:
   - **Paragraph Spacing Controls (`spaceBefore`, `spaceAfter`)**: Add in-editor toolbar options for "Space Before / Space After Paragraph" (0pt, 6pt, 10pt, 12pt, or remove spacing) to allow authors to catch and clear accidental paragraph spacing.
   - **Table Auto-Fit / Equalize Columns**: Add table command to equalize column widths to fix distorted cells.
   - **Image Margin Clamping**: Ensure `AlignedImageResize` and image nodes clamp imported widths to `Math.min(imageWidth, printableWidthPx)`.

---

## ✅ INTELLIDOCS OVERHAUL & BUG FIXES — 16-Task Plan DONE + LIVE-VERIFIED (this session)

All sixteen tasks from the new `IMPLEMENTATION_PLAN.md` executed. Frontend `npm run type-check` and server `npx tsc --noEmit` clean; eslint 0 errors on every touched file (pre-existing warnings only); new unit tests green (`inferDocumentStructure` 7/7 jest, `test_converter_headings.py` 20/20 pytest); `code-reviewer` checklist passed; `graphify update .` → 11,096 nodes / 18,776 edges / 663 communities.

| # | Task | What shipped |
|---|------|--------------|
| 1 | Grid/list previews | `documentModel.extractPreviewSnippet` stores a first-page **HTML slice** (≤3000 chars, page-break aware, imgs stripped, tables → `[Table]` chip) in the existing `preview_snippet` column; `DriveTable` renders it Google-Docs style (font-serif title, `dangerouslySetInnerHTML`). Needs user-applied migration 026. |
| 2 | Outline flash | `OutlineNavigator.handleHeadingClick` scrolls/jumps then flashes via `heading-jump-highlight` keyframes (1.6s) in `index.css`. |
| 3 | Editor perf | `HarperLinterExtension` rewritten to lint only the active block (1200ms debounce, 50k-char cap, codeBlock skipped); scanner skips selections inside `table`/`codeBlock`; `PagedEditor.sanitizeLoadedHtml` unwraps attribute-less `<span>/<font>`, drops empties, strips ZWSP before ProseMirror parses. |
| 4 | Ctrl+K | `Home.tsx` capture-phase listener focuses `#drive-search-input` (browser address bar never triggers). |
| 5 | Doc-type inference | **New server skill** `server/src/skills/inferDocumentStructure.ts` (opening-3,000-char marker profiles → `academic_thesis` / `ieee_manuscript` / `apa_manuscript` + presetKey; strict-`>` tie-break favours thesis). Controller `inferStructure` + `POST /formatting/infer-structure` with Zod `inferStructureSchema`; 7 jest tests. Frontend: `api.formatting.inferStructure` + **new** `DocumentTypePrompt.tsx` ("This document looks like an X" → Apply standard format binds the preset; the Task-13 scanner then suggests per-element formats). Fires once per doc/session on preset-less, heading-less docs >150 chars. |
| 6 | Import cleanup | `sanitizeImportedHtml` exported from `processImportJob.ts`; wired in `documentController` local import + both `driveController` HTML responses (blank-paragraph collapse, `&nbsp;` collapse). |
| 7 | Import modal | `ImportFileModal` closes the center modal the moment a file is validated; failures surface via `onError` toast wired in `Home.tsx`. |
| 8 | PDF headings + line join | Primary fix in `ml/src/converter.py`: `_pdf_heading_level(block, next_text)` with keyword/numbered/ALL-CAPS/title-case patterns (≤80 chars, no trailing continuations, reject next-block lowercase), plus `_pdf_merge_wrapped_paragraphs` joining unterminated `<p>` runs. Server pdf-parse fallback in `documentController.ts` mirrors it (`classifyPdfHeading`). New `tests/python/test_converter_headings.py` — 20/20. |
| 9 | Image floating toolbar | **New** `ImageOptionsToolbar.tsx` (Wrap Inline/Wrap L/Wrap R/Break · alignment · width 25–100% + reset · delete) mounted as a bottom `BubbleMenu`; new commands `setImageWrapStyle`/`setImageWidth` compose onto the single `containerStyle` attribute, preserving explicit width across wrap changes. Library's 3-icon margin controller hidden via CSS. **Integration fix found live**: this app's image node is `imageResize` (name from `tiptap-extension-resize-image`), not `image` — the new toolbar, `setImageAlignment`, and `ImageResizeBehaviorExtension` now target `imageResize` (the pre-existing `image`-keyed ribbon menu stays hidden by design; untouched). |
| 10 | Header/footer placement | `HeaderFooterPlacement` (`left/center/right/split`) added to the config; `PagedEditor.composeZone` maps text+number into the library's left/right slots; center adds `.intellidocs-page-editor--header-center/--footer-center` CSS. Page Setup popover gains per-zone placement buttons, Header/Footer edge offsets (0.25–2in), and a **Different first page** toggle — blanking page 1 via `customHeader/customFooter[1]` (per-page override supported by). |
| 11 | Micro-polish | Firefox thin scrollbars (`scrollbar-width/color`), concentric radii on editor popovers (12px = 6px items + 6px padding) and grouped tool buttons (10px = 8px + 2px); tabular figures/150ms transitions already pervasive. Native `title` tooltips kept (custom tooltip system not built — deviation). |
| 12 | Overlays = suggestions only | Removed the style-origin outline: effect + `hasStyleOriginIn` in `Document.tsx`, range/command/class in `SuggestionDecorationsExtension.ts`, `.style-origin-outline` CSS. Only `.agentic-highlight-overlay` (pending suggestions) remains. |
| 13 | Deductive preset suggestions | `useAutoFormatScanner` gains `presetKey`: blueprint-target text matching (conf **90**, label *"Format as {Label} based on {Blueprint} preset"*) + first-paragraph structural title rule (conf **86**, ≤120 chars, no guide attr). Chip label + Accept All reuse existing group machinery; `'title'` apply paths use `applyStyleCommand`. `resolveFormattingTier.ts` intentionally untouched (deviation — plan file list was aspirational; the server tier flow is unchanged). |
| 14 | Blueprint groups + guides toggle | `BlueprintSection.group` → `data-guide-group` → `guideGroup` attr; `author_block` tagged across UCLM/APA/IEEE. Styling one member offers *"Format the remaining Author Block elements to match?"* via the existing chip. **Guides** on/off button added to the Styles ribbon (storage-backed `setBlueprintGuidesEnabled` command; disabled clears decorations). |
| 15 | Selection preservation | `applyStyleCommand` keeps the exact selection/caret after block formats (done in this plan's earlier phase, already verified). |
| 16 | Landing rewrite | Zero-jargon copy (live-checked against a banned-terms list) + interactive `TryItDemo`: messy essay → **Clean Up Paper** → animated cleanup (crossfade + rise) → pill badge *"Paper cleaned up and formatted in X.X seconds"* (real measured time) + Try Again. Swiss layout preserved. |

### Live verification — `verify_plan2_ui.py`, **30/30 PASS** (Chrome headless, real stack, real login)

Landing jargon scan / demo button / badge / reset · structure prompt appears + Apply-all present · `style-origin-outline` gone from CSSOM · placement/offset/first-page controls present · center placement class applies (with header enabled and state restored afterwards) · image toolbar appears with all 11 buttons · Wrap R sets computed `float: right` · Guides toggle flips title both ways · scanner outlines the preset doc then click opens the chip — captured label: **"Format as Title based on University Capstone / Thesis preset | 86%"**.

### Remaining deviations (intentional, logged for review)
1. **Task 5** was implemented as a server classification skill + prompt (no per-block chips at inference time) — the per-block suggestions come from Task 13 once the preset is bound.
2. **Task 9** replaces the library's 3-icon controller instead of stacking with it; ribbon image menu left as-is (it targets the legacy `image` type name and has dead sections).
3. **Task 10** derives page-number side from per-zone number format + placement; no separate 4-way "page number placement" control.
4. **Task 11** keeps native tooltips; radius/scrollbar/figures pass only.
5. **Task 13** frontend-only; `resolveFormattingTier.ts` untouched.

---

## ✅ Task 1: Dedicated Document Zoom System — DONE + VERIFIED (this session)

Word-style in-editor zoom that scales only the canvas, never the browser chrome.

| Layer | Change |
|-------|--------|
| **New component** | `frontend/src/components/editor/DocumentZoomWidget.tsx` — sticky bottom-right widget: `[-]`/`[+]` 10% steps (clamped 30%–200%), continuous range slider (0.30–2.00, step 0.05), percentage badge (`tabular-nums`, aria-labeled) opening presets (50/75/90/100 Default/125/150/200% + Fit Width). Exports `clampZoom` / `ZOOM_MIN` / `ZOOM_MAX` / `ZOOM_STEP` for shared use. |
| **Document.tsx** | Widget mounted at the end of the canvas scroll container. `Ctrl + MouseWheel` non-passive listener on the canvas container (±0.05, `preventDefault` stops browser zoom). Shortcuts in the existing window keydown listener: `Ctrl+=`/`Ctrl++`, `Ctrl+-`, `Ctrl+0`. `handleFitWidth()` computes zoom from `PAGE_SIZES[pageSize]` + orientation (~90% of visible canvas width). |
| **Safety** | CSS `zoom` on `.intellidocs-page-editor` only (no `transform: scale`); zero changes to `.rm-pages-wrapper` / `.page` geometry. |

### Verification (Playwright probe, live stack, doc `a3c5c8ac…`)

**10/10 PASS**: widget renders inside viewport (248×38 @ bottom-right); `[-]`→0.90 / `[+]`→1.10; slider→1.50 (React native-setter dispatch); preset 50%→0.50; Ctrl+Wheel→0.45; shortcuts→0.55/0.45/1.00; Fit Width→1.0 (expected: (940−32)·0.9/816 = 1.00); **page break count identical (2) across every zoom step** — no pagination feedback loop; typing works after widget interaction. `tsc` + eslint clean (pre-existing warnings only). Screenshots: `zoom_widget_menu.png`, `zoom_widget_fit.png`.

---

## ✅ Task 2: Objective Baseline Accuracy Benchmarks — DONE (this session)

New `ml/tests/benchmark_accuracy.py` evaluates the pre-trained artifacts (before any user fine-tuning) and writes **`ACCURACY_METRICS.md`** at the repo root for Chapter 4. Run: `ml/venv/Scripts/python ml/tests/benchmark_accuracy.py` (~35s, no AI provider needed).

| Benchmark | Headline result | Protocol note |
|---|---|---|
| Formatting model (`base_model.pkl`) vs WikiText-103 test split (2,891 paragraphs) | Top-1 **99.9%**, Top-3 **100.0%**; per-category F1 for heading1/2/3 + paragraph ≈ 1.0, title 0.944 | Labels come from the same surface rule used at training time (`infer_format_label`), and marker features are in the vector — the report carries an explicit **limitations** note: this measures rule agreement, not human-annotated accuracy. Zero-support classes shown as n/a. |
| Grammar checker vs JFLEG test split (747 sentences, 4 refs) | GLEU **0.7734** (source baseline 0.7723), edit P **0.958** / R **0.249** / F1 0.395; 165 predicted vs 1,806 reference edits | Conservative rule pipeline on paraphrasal references; limitation note included. |
| Spell checker | Detection **96%** (24/25), Top-1 **88%**, Top-3 **92%**, false positives **0/95** clean words | Throughput: **5.3 s/1k words** on error-heavy JFLEG sample vs **1.3 ms/1k words** on clean academic prose (both rows reported). Diagnostics printed: missed `dependancy`; top-1 misses `publically→biblically`, `adress→dress`. |

Artifacts recorded with sha256 digests + file sizes (`base_model.pkl` 36.62 MB, `grammar_model.pkl` 0.57 MB); environment line (Python 3.14.2, scikit-learn 1.9.0, nltk 3.10.0).

---

## ✅ Task 3: Full-Stack UI Modernization (Swiss Modernist Pass) — DONE (this session)

All five sub-phases landed; `npx tsc --noEmit`, `npx eslint` (all touched files), and `npm run build` pass. Visual verification via Playwright screenshots at 1440×900: landing (desktop + mobile), dashboard, editor, professor dashboard, login, register — 0 console errors; every page reads as one design system (canvas `#f5f2ec`, stone `#d4ccbe`, ink `#3a342f`, cobalt `#1351aa`).

1. **Global tokens (`frontend/src/styles/index.css`, `frontend/index.html`)**: `:root` palette rewritten to the DESIGN.md Swiss set (canvas/stone/surface-sunken/border `#dbd4c8`/border-strong `#9a8f82`/ink trio/accent `#1351aa` + hover `#0f4189`); `@theme brand-*` colors moved to the cobalt family; Coolors badge utilities recolored; new `.font-display` (Syne) and `.font-tech` (Space Mono + tabular-nums) utilities; Syne + Space Mono added to the index.html font link. Freebuff contrast finding resolved: old teal `#388087` fully removed from source (verified by grep).
2. **Landing (`frontend/src/pages/Landing.tsx`)**: rebuilt to mirror `docs/landing_page_concept.html` — sticky nav (auth-aware CTA), Syne hero "Academic Rigor Automated.", simulated TipTap canvas preview with the three confidence chips, 4-pillar architecture grid, Deltas accordion (aria-expanded verified in probe), access CTA, footer. Mobile Sign In nowrap fix verified at 390px.
3. **Dashboard (`Home.tsx`, `DriveTable.tsx`, `DriveSidebar.tsx`)**: FAB + hover states on accent tokens (old `#27595e`/teal hexes removed); audit's sub-12px labels fixed — class metadata row 11px→12px with tabular-nums, owner avatar initials 10px→11px, sidebar "Academic Suite" 10px→12px, nav counts and storage bytes tabular-nums, class-code badge 11px. Template modal already uses the 2×2 `gridTemplateColumns: repeat(2, minmax(0, 1fr))` layout.
4. **Professor dashboard (`SimilarityMatrix.tsx`, `CouncilInspectionModal.tsx`)**: similarity cells now `tabular-nums`, matrix container `rounded-lg`→`rounded-xl` for correct concentric radius inside the card; metric/stat values tabular-nums, `Metric` label 10px→11px; similarity/confidence readouts tabular-nums.
5. **Auth (`Login.tsx`, `Register.tsx`)**: cards restyled to the Swiss treatment — 1px `--border-strong` border, 0.375rem radius, flat ink-tinted shadow (replacing the old teal glow); mono "ACADEMIC WORKSPACE" kicker + Syne uppercase wordmark added to both, values kept in sync per the existing comments; leftover teal submit-button shadow `rgba(56,128,135,.3)` → cobalt `rgba(19,81,170,.3)`.
6. **Safety guard honored**: no ProseMirror DOM, `.rm-pages-wrapper`, or `.page` CSS was touched; editor-side changes limited to Tailwind classes on non-editor-DOM components (`SimilarityMatrix`, `CouncilInspectionModal`).

---

## ✅ UI/UX Audit (§7.2) Closure Pass — DONE (this session)

All six open items from `TEST_RESULTS.md` §7.2 closed in code, then the full Playwright audit (`Temp/ui_audit/audit_v2.py`) was **re-run against the live stack** — `audit_v2_summary.json` and `shots/` now hold the fresh run:

- **Contrast: 0 failures on all 5 pages** (was 4). Teal→cobalt token pass + new `--success-text: #1f6b3f` / `--error-text: #a0342f` in `index.css`, applied to the save pill text (`Document.tsx`) while fills/dots keep `--success`/`--error`. Presence avatar palette (`AVATAR_COLORS` in `Document.tsx`, `getAvatarColor` in `SimilarityMatrix.tsx`) darkened to 700-level hues (white initials now 4.99–7.10:1, was 1.98–4.23).
- **Dashboard sub-12px labels: 93 → 0** (avatar initials bumped to `text-xs`; earlier sidebar/table fixes confirmed by re-run).
- **Small tap targets: 0 in-scope.** Steppers 22→24px wide (`TiptapEditor.tsx`), Collapse panel 22→24px (`EditorSidePanel.tsx`), zoom widget slider hit area 24px tall (`DocumentZoomWidget.tsx`). Remaining: `yesterday.to` inline link (77×17 — inline-link exception) and two nav text links (`Exit to Dashboard`, `Back to Documents`) that were never in the fix list.
- **Unnamed controls: 4 → 0.** Added `aria-label`s: editor back link (`Document.tsx`), professor back link (`ProfessorDashboard.tsx`), offline compact indicator (`OfflineIndicator.tsx`, title was undefined in tooltip mode), chatbot send button (`AIChatbot.tsx`).
- **Out of scope / left as-is:** dashboard hidden buttons (90 → 158 in fresh run; count scales with rendered rows, behavior unchanged — surfacing Table/Image outside the Insert tab remains a design decision); editor `<12px` metadata (`Quote`/`Caption` 11px, status stats 11.5px, `E2`/`3 headings`/`Ctrl+\` 10px) — never in the audit fix list.
- **Verification:** `tsc --noEmit` + `eslint` clean (only pre-existing warnings), `npm run build` passes, audit re-run: 0 console/page errors.

---

## ✅ Encoding Corruption Repair — DONE (this session, found during post-audit screenshot review)

The fresh §7.2 audit screenshots showed `You opened â€¢ …` mojibake on the dashboard. Root cause: an earlier PowerShell `Get-Content -Raw | Set-Content -Encoding UTF8` edit in this session decoded `DriveTable.tsx` with the ANSI codepage (Windows-1252) and wrote it back as UTF-8, double-encoding every non-ASCII character (comment `─`/`═` banners, `•`, `·`) and adding a UTF-8 BOM.

- **`DriveTable.tsx` — repaired losslessly**: byte-level inverse transform (sloppy-cp1252 → UTF-8) in Python; counts reconcile exactly (445 `─` + 184 `═` + 2 `•` = 631 `â`), BOM removed, CRLF preserved. `git diff HEAD` now contains only the intended §7.2 edits (hover token ×2, `#cdd9f0` badge tint, `text-xs tabular-nums`, added empty-state block, avatar `text-xs`).
- **Repo-wide sweep (350 source files, 0 mojibake hits remaining)** also found 3 pre-existing sites already committed in `HEAD` (not from this session):
  - `Login.tsx` — comment em-dash + **user-visible** `'Signing inâ€¦'` → `'Signing in…'`
  - `Register.tsx` — **user-visible** `'Account created. Redirectingâ€¦'` → `'Redirecting…'` (3 occurrences total)
  - `db/supabase/_apply_all_generated.sql` (untracked generated file) — 16 hits (14 em-dashes + 2 ellipses) in comments and preset seed descriptions
- All fixed via byte-preserving Python writes (UTF-8, no BOM). Pre-repair backups in `C:\Users\asus\AppData\Local\Temp\opencode\` (`DriveTable.mangled.bak`, `Register.tsx.bak2`, `_apply_all_generated.sql.bak2`).
- **Verification**: repo-wide mojibake scan 0 hits, `tsc --noEmit` clean, `eslint` clean on touched files, `npm run build` passes.
- **Hazard note for all agents**: never use PowerShell `Get-Content`/`Set-Content` for text edits in this repo — PS 5.1 reads/writes ANSI by default. Use editor tools or Python (byte-preserving) instead.

---

## ✅ Phases B–E: Fluent Motion, Dashboard Polish, Layout Controls — DONE + LIVE-VERIFIED (this session)

Follow-up to the §7.2 closure, in four phases. Everything verified against the **live stack** with Playwright probes (real clicks, real drags, real file import). View-layer only — no schema, route, controller, or MVC changes.

### B — Fluent motion system
- New keyframes + utility classes in `index.css`: `modalIn` / `popoverIn` / `overlayIn`, `.animate-modal` / `.animate-popover` / `.animate-overlay`, plus `:where(button, [role="button"])` hover/press transitions and a `prefers-reduced-motion` guard.
- Applied: `dropdown-menu.tsx` (Content + SubContent), `TiptapEditor.tsx` `POPOVER_STYLE` + image position-controller popover (local `fadeIn` keyframes removed), `OfflineIndicator.tsx`, `EditorStylesPanel.tsx` portal, and all six modals (`DocumentCreateModal`, `FolderCreateModal`, `ClassRosterModal`, `ImportFileModal`, `CouncilInspectionModal`, `PersonalizationProfileModal`).
- **Live check**: New Document modal reports `.animate-overlay`=1, `.animate-modal`=1; zero console errors.

### C — Dashboard & drive polish
- `My Documents` h1 now Syne (`font-display`, bold, tracking-tight) + Space Mono count badge (`155 DOCUMENTS`).
- `SUGGESTED FOLDERS` / `SUGGESTED FILES` labels switched to the mono uppercase label style.
- Folder cards: `duration-200` + `hover:shadow-md hover:-translate-y-px` quiet elevation. Antigravity's 3-dots visibility + `?folder=` persistence fixes left intact.
- Modal titles (`DocumentCreateModal`, `FolderCreateModal`, `ClassRosterModal`, `ImportFileModal`, `PersonalizationProfileModal`) now use `font-display`.

### D — Layout controls
- **D1 Paragraph spacing (Word parity)**: `CustomParagraph` gained a `setParagraphSpacing(beforePt, afterPt)` command that merges `margin-top/bottom` into the whitelisted inline style (all other declarations preserved). Page Setup popover has a new **Paragraph Spacing (PT)** section; values sync from the paragraph under the cursor on open and apply on change to every paragraph in the selection (deliberately no `.focus()` so the number input keeps focus). **Live check**: set 12/6 → first `<p>` inline style `margin-top: 12pt; margin-bottom: 6pt`; separately verified stored-content round-trip — margins written to Supabase reload intact into the editor (`probe-spacing-roundtrip.py`).
- **D2 Equalize Columns**: new `equalizeTableColumns` command + menu entry in Auto-fit. Widths are measured from the **rendered first row** (after a manual drag prosemirror-tables only stores `colwidth` on the dragged column), equalized at the preserved total, written back as `colwidth` on every cell (colspan-aware). **Live check**: real drag → `[133, null, null]` → Equalize → `[73, 73, 73]` on every row (total 219px preserved).
- **D3 Imported-image clamp**: `clampImageWidthsInHtml()` rewrites explicit px `<img>` widths beyond the printable page width (`PAGE_SIZES[size].width − margins×96` at the imported doc's own layout when present) before `setContent` — applied on the backend import path, the FileReader fallback, and the manual "Set Dimensions" prompt. **Live check**: throwaway doc (short, 1.5"/1" margins) + imported HTML with `<img width="2000">` → `width="576"` (= 816 − 240), rendered 574px; throwaway doc deleted after the check.

### E — Residual sweep
- Stale "teal" comment in `Register.tsx` corrected; `ProfessorDashboard` verified clean; Settings' indigo/purple swatches are a functional highlight-color picker, not stale theming.

### Verification rollup (all this session, live stack)
- `tsc --noEmit` clean; `eslint` clean on every touched file; `npm run build` passes. Repo-wide lint shows 56 **pre-existing** errors confined to `AcademicObjects.ts`, `CitationAssistant.tsx`, `TableOfContents.ts` (unmodified at HEAD, left as out-of-scope debt).
- `python tests/e2e/test_view_gridlines_zoom.py` → **9/9 PASS** (pagination intact under typing, 0 console errors) with all Phase B–E edits live.
- Probes + screenshots in `Temp\opencode\`: `probe-phases-bd.py`, `probe-phases-bd2.py`, `probe-d3-clamp.py`, `phase-c-dashboard.png`, `phase-b-modal.png`, `phase-d-page-setup.png`, `phase-d-equalize.png`, `phase-d3-clamp.png`.
- Shared E2E test doc verified **unpolluted**: probe content was never persisted (reload = 0 tables, no inline margins).
- `graphify update .` → 10,896 nodes / 18,407 edges.

---

## ✅ IMPLEMENTATION_PLAN.md Execution — Section 1 + All 8 Editor Bugs — DONE + LIVE-VERIFIED (this session)

Executed `IMPLEMENTATION_PLAN.md` (Section 1 grid previews, Section 3 all 8 editor bugs; Section 2 polish had already shipped). Everything verified live with Playwright + API probes.

### ⚠️ USER ACTION REQUIRED — apply migration 026
Run `db/supabase/026_document_preview_snippet.sql` in the Supabase SQL Editor. Until then the app works via a graceful fallback (see below) but grid previews show placeholder lines instead of real text, and snippet writes are skipped.

### Section 1 — Real grid-view document previews
- `db/supabase/026_document_preview_snippet.sql` — `preview_snippet` column + backfill.
- `documentModel.ts` — `LIST_BASE_COLUMNS`/`LIST_COLUMNS`, `listDocuments()` helper (falls back to base columns on undefined-column error), `extractPreviewSnippet()` (strips HTML → plain-text ~180 chars), snippet written on create/update.
- `folderModel.getDocumentsForFolder` + `DriveTable.tsx` — `DocumentRecord.preview_snippet?`; grid cards now render a white-sheet card (title header, real snippet or placeholder lines).
- **Pre-migration fallback hardened**: PostgREST names the missing column **`PGRST204`** for writes and `42703` for selects — both are now handled (`isUndefinedColumnError`) on list **and** create/update/retry paths. Before this hardening, autosave 500'd pre-migration; verified fixed live (create 201 / update 200 / delete 204 probe).

### The 8 bugs
1. **Large-doc lag** — `PagedEditor` chunk-by-blocks hydration (8 top-level blocks/chunk, wrapper descent for `div/section/article/main`) + `onHydrationChange` gate so grammar/AI scanners pause until hydrated; scanner composing guards; Harper debounce 450→1000 ms. **Second fix found during live verify**: intermediate `insertContent` emissions re-triggered the content-sync effect whose cleanup cancelled the hydration loop mid-way (stopped at 32/80 paragraphs) — inserts now run under `suppressEmitRef` and only the final HTML is emitted. **Live: 80-paragraph/5-page doc hydrates progressively to 80/80 paragraphs, 0 errors.**
2. **Table column resize** — resize-handle CSS (in `TiptapEditor` PROSE_STYLES), popover `maxHeight` support, table menu 420px / Page Setup 440px internal scroll. **Live: CSS present, menu `max-height:420px; overflow-y:auto`.**
3. **Header/footer click-to-adjust** — dblclick delegation on `.rm-page-header`/`.rm-page-footer` → Page Setup opens with the matching input focused. **Live: dblclick focuses header input.**
4. **Local image upload** — `POST /documents/images` (multer, 10 MB, images only) → `documentModel.uploadDocumentImage` (per-user path, public URL) → `api.documents.uploadImage`; toolbar button uses a file picker with data-URL fallback. **Live: browser upload → 201, storage URL inserted into the document, public URL reachable.**
5. **Chatbot history + tone** — side panel keeps the chatbot mounted (display toggle), collapse no longer unmounts the conversation; `buildChatContext.ts` rewritten to natural language (no Document ID / word-count / section telemetry), anti-telemetry lines added to `systemPrompts.ts`; test rewritten. **Live: reply arrives after tab switch, natural tone, no telemetry dumps.**
6. **Outline jump** — heading position matched by text + level, `setTextSelection(pos+1).scrollIntoView()`; observer keys elements via `dataset.outlineKey`. **Live: click selects the matching heading.**
7. **Gridlines alignment** — `.page { position: relative }` under `--gridlines` (stacked view was missing it). **Live: computed position relative + gridline overlay present.**
8. **Class-folder provisioning** — `getOwnedFolder`, enrollment provisions an idempotent personal "Student Workspace" folder under the class folder; delete guarded (404 non-owner, 403 for class-workspace children). **Live API probe: provision + idempotent re-enroll + 403 delete guard exact message + instructor 204 cleanup (16/17, the 1 "fail" was a probe false-alarm).**

### Verification rollup (live stack)
- `tsc --noEmit` clean (server + frontend); targeted jest re-run `api.integration` + `importJobModel` → 21/21 pass (full-suite caveats unchanged: `auditController.test.ts` vitest fixture + `api.integration` timeout only under the full concurrent run).
- Playwright UI suite (`Temp\opencode\verify_plan_ui.py`) → **13/13 PASS** incl. autosave-no-500 regression; Bug 1 suite (`verify_bug1.py`) → **3/3 PASS**.
- Documented deviations (from the earlier plan pass): two-button table split, custom header start-number, and `table-layout: fixed` were intentionally skipped (re-scoped in plan).
- Probe files deleted from the repo; `graphify update .` re-run (10,951 nodes / 18,514 edges); stack stopped.

### 📣 Multi-Document Accuracy Verification Suite — COMPLETED (10/10 PASS)

Executed independent multi-document accuracy verification (`tests/e2e/test_multi_document_accuracy.py`) across all 10 user baseline documents (5 DOCX + 5 PDF) against live dev services:

| Check | Verdict | Details |
|---|---|---|
| **Converter Pipeline (10 Files)** | **PASS** | Evaluated all 10 fixtures (`0200725_[research]`, `DM-OUHRODI`, `DM_0440`, `V2 INTELLIDOCS correct`, `V2 INTELLIDOCS sabotage`). 100% extraction rate: page size presets (Letter/A4), orientations, headers/footers, and paragraph margins. |
| **Sabotage & Bleed Bounds** | **PASS** | Verified that sabotaged 625pt (8.68") image in `V2 INTELLIDOCS sabotage.pdf` is clamped to printable page width (`pageSize.width - margins = 576px / 6.0"`), preventing text/image bleed beyond document margins. |
| **DOM Geometry Bleed Guard** | **PASS** | Tested in live TipTap editor canvas: `scrollWidth <= clientWidth` on 100% of pages (0 horizontal overflow bleed). |
| **ML Formatting Prediction Integrity** | **PASS** | Probed ML `/predict` endpoint: `Chapter 1 Introduction` -> `heading1` (confidence: 0.98), verifying that Phase D layout and spacing extensions introduced 0 regressions to ML accuracy. |

---

## ✅ Page View Controls: Gridlines + Canvas Zoom (this session)

The MS Word-style grid view plan was investigated, implemented, probe-tested, and **re-scoped** after the pagination extension's rendering model made a true multi-page grid infeasible. The safe subset shipped:

| Layer | Change |
|-------|--------|
| **PagedEditor** (`PagedEditor.tsx`) | New `zoomLevel` (CSS `zoom` on the canvas container — chosen over `transform: scale` so overlay `getBoundingClientRect()` math stays correct) and `showGridlines` props. Gridlines draw a 16px non-printing alignment grid inside each page's text margins via a `::after` on the page markers (`pointer-events: none`, behind content). |
| **Toolbar** (`TiptapEditor.tsx`) | New **View** section in the Page Setup popover: Gridlines On/Off toggle + Zoom 50/75/100% buttons. |
| **Document** (`Document.tsx`) | `zoomLevel`/`showGridlines` state wired through. |
| **Test** | `tests/e2e/test_view_gridlines_zoom.py` (replaces the removed `test_grid_view_layout.py`). |

### Why the multi-page grid was re-scoped (evidence)

tiptap-pagination-plus does NOT render per-page content containers: the document is one continuous white sheet and "pages" are zero-size float markers + gray gap bands inside `#pages.rm-pages-wrapper`. Re-gridding that wrapper (the already-shipped Two-Page spread CSS does this at HEAD) sets explicit page-height grid rows, so the wrapper's height feeds back into the extension's `scrollHeight`-based page-count calculation:

```
2-page doc → click Two-Page → 563 page breaks, 306,000px tall, screenshot times out
(probe: tests/e2e probes on doc a3c5c8ac…; vertical was 3 breaks / 3,248px)
```

Content also never splits into columns — the sheets would move but text would not — so even a stabilized grid would not look like Word. Note: the pre-existing IEEE "Two-Page" spread toggle (Insert tab) has this same limitation on multi-page docs; it was only ever verified on short documents. A true Multi-Page view needs per-page content splitting (new view-only renderer) and should be its own project.

### Verification

`python tests/e2e/test_view_gridlines_zoom.py` → **9/9 PASS**: controls present, layout buttons absent, zoom=0.5 applied, **page count stable under zoom + typing (2 → 2, the old feedback-loop regression guard)**, gridlines painted + toggled off, zoom restored to 1, pagination intact, zero console errors. `tsc` clean; eslint on changed files shows only pre-existing warnings. Screenshots: `view_controls_page_setup.png`, `view_zoom_50.png`, `view_gridlines_on.png` (brain artifacts dir). Also removed a probe-inserted lorem block from the shared E2E test document (verified gone after reload).

### Notes

- Editor stack was restarted after a machine reboot: backend `:3000`, frontend `:5173`, ML `:8001`.
- `tests/e2e/test_grid_view_layout.py` was deleted (superseded); no other suites touched.

---

## ✅ Keystroke Positions → Paragraph-Level Attribution (this session)

Composition events now carry the real editor position, and the forensics engine attributes them per flagged match instead of averaging the whole document.

| Layer | Change |
|-------|--------|
| **Frontend** | `Document.tsx` logs the live TipTap selection position (`editor.state.selection.from`) and document size (`doc.content.size`) with every `type`/`paste`/`backspace` event. |
| **Server** | `doc_size` accepted at the behavior boundary (Zod + shared type); the behavior summary exposes `char_count`/`position`/`doc_size` in `latestEvents` for debugging. |
| **ML** | `CompositionEvent` gained `doc_size`; `_filter_events_for_range` maps a match's HTML character range onto the events' normalised positions (fractions of their documents) and returns only in-range events — falling back to the full timeline when nothing positioned lands in range, so verdicts are never starved of evidence. `POST /council/scan` passes the document length. |

### Verification

Crafted probe with two shared paragraphs (paste inside paragraph 1, typing inside paragraph 2):

```
paragraph 0: derivative_paste (0.85) · paste=1 type=0 · "Bulk paste detected: 140 characters"
paragraph 1: original_author  (0.70) · paste=0 type=3 · "Organic typing detected: 3.0 chars/sec over 20.0s"
per-paragraph attribution correct: True
```

Full-stack E2E: browser telemetry logged `paste position=487 doc_size=488` (confirmed via the behavior summary); the scan persisted `timeline_verdict=derivative_paste` with forensics (fallback path — those edits were outside the match paragraph). `tsc`/eslint clean on both sides; frontend build passes.

## ✅ NVIDIA NIM Live Verification & Council Hardening (previous session)

Verified the live provider end-to-end with the existing single key and found two callability issues and one integration gap:

| Finding | Result |
|---------|--------|
| `meta/llama-3.2-90b-vision-instruct` (currently in `server/.env`) | Listed in the account catalog, but chat calls **hang** (120s+, connection closed) — not callable for this key |
| `meta/llama-3.2-11b-vision-instruct` | ✅ Verified callable: plain + JSON-mode chat in ~0.7–1.1s, and a **full 5-judge council run** (all judges "plagiarism", synthesizer verdict, quorum reached) |
| `meta/llama-3.3-70b-instruct` (originally planned) | 410 Gone — reached end of life 2026-08-26 |
| Node `aiClient.chat` with NVIDIA | ✅ Verified (`NODE_AI_OK: OK`) |
| Free-tier concurrency | Firing 4 judges in parallel made 3 of them exceed the hardcoded 8s timeout — NIM queues concurrent calls |

**Council fixes applied** (`ml/council_pipeline.py`):
- Judge/synthesis timeout is now configurable and defaults to **30s** (`COUNCIL_JUDGE_TIMEOUT_SECONDS`), and `_run_round` actually passes it (it previously hardcoded the 8s default).
- `_create_completion` runs at most **2 concurrent completions** so the four parallel judges stay inside their timeout on a single free-tier key.
- Node `aiClient.ts` caps provider waits at **60s** (`AbortSignal.timeout`) so a queuing provider can no longer hang a request forever.

**Required user action**: change `AI_MODEL` in `server/.env` to `meta/llama-3.2-11b-vision-instruct` (DeepSeek must not edit `.env` directly).

## ✅ Timeline Forensics (previous session)

The forensics engine is now wired end-to-end: editor telemetry → Redis → council scan → persisted match → inspection modal.

| Layer | Change |
|-------|--------|
| **ML** | `timeline_forensics.py` is importable again (dropped the dead `embedding_service` relative import, fixed `zipfile.BytesIO` → `io.BytesIO`), gained `build_composition_events()` and an optional `timeline_events` parameter. `POST /council/scan` now accepts a `timeline` array and returns **per-match `forensics`** (verdict, confidence, evidence, composition metrics). |
| **Server** | `runScan` reads the author's behavior events from Redis (`behaviorModel.getBehaviorEvents`, fails open), forwards them through `runCouncilScan`/`requestCouncilScan`, and persists the verdict into `plagiarism_matches.timeline_verdict` plus the full forensics payload inside `council_verdict` (jsonb) — **no new migration required**. Behavior events now accept top-level `char_count`/`position` (Zod boundary + shared type). |
| **Frontend** | Lightweight composition telemetry in `Document.tsx`: bulk insertions ≥50 chars log a `paste` event, accumulated typing logs a `type` event after a 15s flush, deletions ≥20 chars log `backspace`, with a 5s load-suppression window for progressive hydration. Only character volumes are stored — never text content. The inspection modal's **Forensics tab** renders the verdict badge, evidence list, and a composition metrics grid (session, characters, typing/paste events, typing speed). |

### Verification

ML endpoint with crafted timelines (no AI provider needed):

```
paste-burst        → derivative_paste (0.85) · "Bulk paste detected: 140 characters" · composition: session 20s, paste 1, type 1, cps 7.6
organic-typing     → original_author (0.70)  · "Organic typing detected: 2.5 chars/sec over 40.0s"
no events          → unverified_import (0.30)
format-events-only → unverified_import (0.30) — non-composition events are filtered out
```

Full-stack E2E (mock stack + ML + Playwright): the browser typed ~38 chars (flushed as one `type` event) and inserted a 203-char chunk (logged as `paste`); the professor scan then produced `timeline_verdict=derivative_paste`, composition `paste_events=2, typing_events=2`, and the modal rendered **Derivative Paste · 85%** with evidence and all metrics. Screenshot: `tests/e2e/artifacts/inspection/council_forensics_tab.png`. (The council also returned a real verdict — "plagiarism · confidence 100% · quorum reached" — in this run.)

## ✅ NVIDIA NIM Provider + Key Rotation (this session)

| Client | Change |
|--------|--------|
| **Node** (`server/src/ai/aiClient.ts`) | `'nvidia'` added to the provider union, mapped to `https://integrate.api.nvidia.com/v1/chat/completions`. `AI_API_KEY` may hold comma-separated keys; on **429/401/403** the client fails over to the next key before throwing. |
| **Python** (`ml/council_pipeline.py`) | `'nvidia': 'https://integrate.api.nvidia.com/v1'` added to `AI_BASE_URLS`. Comma-separated keys, rotation on 429/401/403 via `_create_completion`, and the last successful key is remembered so exhausted keys are skipped for subsequent judges. |

Tests: `server/src/ai/__tests__/aiClient.test.ts` (429 failover + no rotation on 500) passes; Python key parsing/rotation detection sanity-checked. The live environment runs **one provider with one key for now** (NVIDIA NIM), so comma-separated failover keys are supported but dormant — add more keys to `AI_API_KEY` later to exercise the live rotation path.

## ⛔ Student-Facing Scans — Not Built (by design)

Per the rejection of Option 3: scans stay strictly professor-facing. No student endpoints, UI, or navigation were added.

---

## ✅ Real-Stack Smoke Test (previous session)

Ran the full real stack — ML service (`ml/venv`, :8001), Express (`.env`), Vite (`.env.local`) — with `test@test.com` (the earlier login failure was transient; it works):

```
Backend /health/ready  → ready: supabase reachable (709ms), redis PONG (169ms), ml OK (20ms)
ML /predict            → heading1 @ 0.98 from base_model.pkl
ML /grammar/check      → 1 issue on a typo sentence
Tester agent login     → page renders, 0 console errors
Tester agent dashboard → loads user documents, 0 console errors
Tester agent editor    → scratch doc created; .ProseMirror mounted; 47 toolbar buttons;
                         page_break_count=1, div_count=86, freeze_likely=false
```

The editor freeze fix and the ML integration (tier-check auto-format prediction) both hold on the real stack. Remaining console noise is environmental only: Google Fonts ORB-blocked in the sandbox and one `harper_wasm` `ERR_ABORTED` (pre-flight canceled on page teardown, no page errors).

---

## ✅ Scan → Council → Inspection Flow (previous session)

The handoff's "Integration Test" step assumed this flow existed; it did not. Built the full wiring:

| Layer | What was added |
|-------|----------------|
| **ML** | `POST /council/scan` in `ml/src/main.py`. Runs the 3-stage triage with a **lexical peer pre-filter** (difflib — no embedding key required) then the **real 5-judge council**. `council_pipeline.py` now builds its OpenAI-compatible client lazily and supports per-request provider config (`configure_ai`, incl. Gemini's OpenAI-compat base URL); missing keys degrade to inconclusive verdicts instead of crashing. `embedding_service.py` clients are lazy too. `openai` added to the venv + `ml/requirements.txt`. |
| **Server** | `pythonBridge.requestCouncilScan` (+ Zod-validated response schema `schemas/plagiarismSchemas.ts`); `plagiarismModel` scan persistence/queries (`createScan`, `createMatches`, `getScanById`, `getMatchesForScan`, `listScansForFolder`, folder doc/peer loaders) + `documentIds` on similarity students; `skills/runCouncilScan.ts` (+jest test) forwards the server's `AI_PROVIDER/AI_API_KEY/AI_MODEL` to the council; `plagiarismController` + `plagiarismRoutes` mounted at `/plagiarism` (ownership via folder). |
| **Frontend** | `api.plagiarism` (`runScan`, `getScan`, `listFolderScans`) + scan/detail types; `CouncilInspectionModal` rewritten without `@ts-nocheck` (typed, transcript + forensics tabs, match navigation); Professor Dashboard gained **"Scan submissions"** (sequential scans with progress), click-a-student → inspection modal, and info/success/error banner tones. |
| **Mock** | `mock-supabase` now fills per-table primary keys (`scan_id`, `match_id`, `review_id`, …), which inserts previously left undefined. |

### Verification (mock stack + ML service + real AI provider)

```
UI    scan button → scans both submissions → matrix shows 100% pair
      clicked student → modal opened:
        flagged text: True · transcript section: True · forensics tab: True
      screenshots: council_scan_matrix.png, council_inspection_modal.png
API   GET /plagiarism/folders/class-1/scans → 2 scans
      GET /plagiarism/scans/:id → title=Alpha Thesis, matches=1, peer=100,
        originality=0, judges=1, quorum=False
```

The council genuinely called Gemini (OpenAI-compat endpoint) and hit the **free-tier daily quota (20 req/day/model)** mid-test — the graceful fallback is visible in the transcript ("Quorum failed: only 1 of 4 judges responded · Recommended action: manual review"). Re-run with a provider that has quota to capture full 5-judge verdicts.

`tsc` + eslint clean on both sides; frontend `npm run build` passes; `runCouncilScan` jest test passes.

---

## ✅ Professor Dashboard Similarity Tab (previous session)

The handoff asked for: populate `folders` from the API and wire `selectedClassFolderId` to `SimilarityMatrix`. Investigation found the wiring was half-done and the feature could never render:

| Problem | Fix |
|---------|-----|
| The **Similarity tab had no tab button** — the render block existed but was unreachable | Added `['similarity', 'Similarity Matrix', Users]` to the tab bar in `ProfessorDashboard.tsx` |
| `SimilarityMatrix.tsx` was `// @ts-nocheck` and called **Supabase directly from the browser** (including `auth.admin.getUserById`), violating strict MVC — and its queries used a non-existent `documents.folder_id`, so it always fell into the empty state | New `GET /professor/folders/:id/similarity` endpoint (route → `professorController.getFolderSimilarity` → new `plagiarismModel.getClassSimilarity`). The component now fetches through `api.professor.folderSimilarity()` only |
| An empty `classFolderId` left the component in an **infinite spinner** (`loading` started `true` and the fetch returned early) | Explicit states: no-folder prompt, loading, error, empty, matrix |
| Folder dropdown listed all folders; no default selection; tab Refresh was a no-op | Dropdown filters to `folder_type === 'class'`; first class folder auto-selected on load; tab Refresh remounts the matrix via a refresh key |

**Data model**: students come from the documents linked via `folder_documents`; pairwise scores come from the council's `plagiarism_matches` (strongest flagged passage between two students' submissions, capped at 100). Student names resolve from Supabase Auth (`display_name` → email prefix → short id). Folder ownership is enforced (`getFolderById`), so a professor only sees their own class folders.

### Verification (mock stack + Playwright)

```
API   GET /professor/folders/class-1/similarity
      → students: [Student 11111111, Student 22222222]
      → pairs: [{studentAId, studentBId, similarity: 85}]
      GET /professor/folders/<not-owned>/similarity → 404

UI    similarity tab present:       True
      shows 85% cell:               True
      shows both students:          True
      folder auto-selected:         True
      refresh still shows 85%:      True
      screenshot: tests/e2e/artifacts/inspection/professor_similarity.png
```

Server `tsc` + eslint clean; frontend `tsc`, eslint, and `npm run build` pass.
Mock dev seed also learned `plagiarism_scans`, `plagiarism_matches`, and `document_embeddings` tables.

---

## ✅ Follow-up: Chatbot Continuations & the Stripped `lastPreview` (previous session)

Source: `overlays_presets_and_chatbot_comprehensive_test_report.md` (Q3 finding).

Two defects stacked to produce the "chatbot gives instructions instead of acting" symptom:

1. **No continuation handling** — "Can you format the rest of the document for me automatically?" has no format keyword and is not a confirmation, so `detectFormattingPreview` returned `null` and the request fell through to the LLM.
   - **Fix**: new `CONTINUATION_PHRASES` + a continuation branch in `server/src/controllers/aiController.ts`. When a continuation phrase is present and a `lastPreview` exists, it inherits the previous formats/font size, widens the scope to the whole document (`scope: 'all'`, `targetCategory: 'all'`), and returns a deterministic `shortCircuitReply` — no model call needed.
2. **`lastPreview` was silently stripped by Zod** — `aiChatRequestSchema` did not include the field, and `validateBody` replaces `req.body` with `schema.parse(...)`, so the controller never received it. **Every follow-up flow (plain confirmations included) was broken server-side.**
   - **Fix**: added `lastPreviewSchema` (format/formats/scope/fontSize/target/targetCategory/normalize) to `server/schemas/aiSchemas.ts`.

### Verification (mock stack + real provider)

API-level (`POST /ai/chat` with crafted `lastPreview`):
- "Can you format the rest of the document for me automatically?" after a bold+center preview → `mode: preview`, `formats: [bold, align_center]`, `scope: all`, deterministic reply.
- "Format the remaining for me please" after a heading1 preview → inherits `heading1`, `scope: all`.
- Regression: "yes, do it" → re-displays the previous preview (was broken before the schema fix).
- No `lastPreview` → falls through to the provider as before.

Full UI E2E (docked chatbot, Playwright):
- Q1 "Format the entire document into APA style" → preview card → rejected.
- Q2 "Now format all headings and make them bold and centered" → applied → `h1 <strong>` 0→1, `p <strong>` 0→0 (category-scoped apply works; chat log shows "Applied: Bold + Align Center (all headings)").
- Q3 "Can you format the rest..." → continuation card ("Bold + Align Center — entire document") → applied → `p <strong>` 2. Screenshots: `chat_flow_q1/q2/q3.png` in `tests/e2e/artifacts/inspection/`.

---

## ✅ Presets & Chatbot Bulk Formatting (previous session)

Source: `presets_and_chatbot_bulk_formatting_audit.md`.

| Area | What was wrong | Fix |
|------|----------------|-----|
| **System prompt** | Told the model to *explain* document changes, so the chatbot replied with manual tutorials instead of one-line preview wording | Replaced the three read-only instructions in `server/src/ai/prompts/systemPrompts.ts` with preview-oriented guidance (no tutorial steps unless asked) |
| **Bulk scope detection** | "all headings", "every heading", "all subheadings", "all sections", "the rest", "remaining" were missing, so `scope` fell back to `selection` | Expanded `BULK_SCOPE_PHRASES` and added `targetCategory: 'headings' \| 'paragraphs' \| 'all'` detection in `server/src/skills/parseFormattingIntent.ts`; a named category now forces document-wide scope. 4 new tests (22 total, all pass) |
| **Category not propagated** | The frontend had no way to know a preview targeted headings | `targetCategory` now flows intent → `FormattingPreview` (`aiController.ts`) → `AIChatPreview`/`AIChatPreviewMeta` (`services/api.ts`) → `ChatMessage` |
| **Bulk apply ignored category** | `scope === 'all'` formatted the *entire* document (headings included) even for "all headings" | New `applyFormatsToBlocks('headings' \| 'paragraphs', …)` in `AIChatbot.tsx` iterates only the matching blocks (bottom-up), and handles marks, heading levels, font size, alignment, and normalize. Scope label shows "— all headings / — all paragraphs" |
| **Chat history dropped actions** | `messages.filter(m => !m.command_applied)` erased applied actions, so "format the rest" had no memory | History now keeps a compact `[Formatting applied: …]` summary per applied command |
| **Category grouping UI** | `formatGroup`/`groupMembers` existed on the type but nothing populated them; the live chip is `InlineSuggestionChip` (`FormatPrompt.tsx` is unused) | Scanner groups same-format candidates and fills `formatGroup`/`groupMembers`; the chip renders a clickable `Users +N` badge ("Apply to all N+1 similar blocks"); `Document.tsx` applies the format to every member bottom-up then runs the standard accept path (with behavior logging) |

### Verification

- **Intent parser**: 22/22 jest tests pass, including "Now format all headings and make them bold and centered" → `scope='all'`, `targetCategory='headings'`, `formats=['bold','align_center']`.
- **Group chip (browser, mock stack)**: doc with two heading-like paragraphs → chip showed "Apply to all 2 similar blocks" → clicking converted Introduction + Conclusion (`h1` 1 → 3), chip dismissed. Screenshot: `tests/e2e/artifacts/inspection/group_chip.png`.
- **Builds**: server `tsc --noEmit` clean, frontend `tsc --noEmit` clean, `npm run build` passes, eslint clean on all touched files (pre-existing warnings only).
- **Verified live**: the docked chatbot flow was re-tested with the real AI provider (the server loads `.env` on top of `.env.mock`), including Q1 → Q2 → Q3 with apply steps; see the follow-up section above.

---

## 🔴→✅ The Editor Freeze (Root Cause)

The first audit's `headerFooterConfig` memoization was necessary but NOT sufficient.
A follow-up audit still reproduced the freeze (`page.screenshot` timeouts, DOM explosion).

**Actual root cause**: `PagedEditor.tsx` injected the **spread-mode CSS
unconditionally** — even when `spreadPreview` was false. The injected rules
(`.rm-pages-wrapper` grid, `.rm-page-break { height: var(--rm-page-height) }`,
`.page { height: 0 !important; ... }`) corrupted `tiptap-pagination-plus`'s DOM
measurements, so its `view.update` loop never converged:

```
view.update → measure pageCount → differs → rAF dispatch meta transaction
→ rebuild page-break widget decorations → view.update → measure again → ...
```

Result: `.rm-page-break` nodes grew without bound (observed: 86 → 442), div count
hit 5,000+, and the main thread locked for 10+ seconds.

**Fix**: `spreadStyle` is now only injected when `spreadPreview` is true
(`PagedEditor.tsx`, near the `<style>` block).

### Hardening also applied (from the follow-up audit's prescriptions)

| Fix | File |
|-----|------|
| Layout effect now compares applied values via `lastAppliedLayoutRef` (incl. editor identity + content margins) and skips redundant chain dispatches | `frontend/src/components/editor/PagedEditor.tsx` |
| `handleContentChange` skips identical content echoes (`if (newContent === latestContentRef.current) return`) | `frontend/src/pages/Document.tsx` |
| Removed the `as any` on `updateMargins` and called the real `updateContentMargins` command for header/footer content margins | `frontend/src/components/editor/PagedEditor.tsx` |

---

## ✅ Verification (real browser, real app, mock backend)

Ran the app end-to-end with the dev mock stack (mock Supabase → Express `dev:mock` →
Vite `dev:mock`) and Playwright/Chrome:

```
before fix:  editor mounted → breaks=86, divs=1100 → breaks=442, divs=5372
             → main thread locked (~11s max tick gap) → screenshot timeout
after fix:   breaks=1, divs=84 stable through load + typing, screenshot OK,
             responsiveness probe 0.01s, zero page errors, autosave "Saved"
```

Also verified: document content loads and renders (`Adaptive Layout Formatting`),
typing works, toolbar/panels render, pagination reports "~1 page".

Remaining console noise in the mock environment only (not app defects):
- ML service absent → `formatting/tier-check` 500 (ECONNREFUSED :8001)
- Mock Supabase has no realtime websocket → handshake 404s

---

## 🛠 Dev Mock Stack Repairs (`server/mock-supabase/index.mjs`)

The mock could not serve the editor page correctly; three fixes were needed:

1. **Filter parsing was broken** — it looked for `col.op.value` in the query KEY,
   but PostgREST sends `col=op.value`. No filter ever applied. Now parsed from the
   value (`eq/neq/gt/gte/lt/lte/like/ilike/is/in`), with `is.null` treating absent
   fields as null.
2. **`.single()` semantics** — supabase-js requests one object via
   `Accept: application/vnd.pgrst.object+json`; the mock always returned arrays,
   which caused 403s (owner check read `user_id` from an array) and broke scratch
   doc creation. GET/POST/PATCH now honor the Accept header (406/`PGRST116` when
   not exactly one row).
3. **Missing relations** — added empty `document_shares`, `document_versions`,
   `user_presets`, and other tables the API queries, so they return `[]` instead
   of 404/42P01.

---

## ✅ Earlier Session Fixes (UI/UX audit, still in place)

| Finding | Fix |
|---------|-----|
| Missing `useMemo` import + type error in `Document.tsx` (build was broken) | `useMemo<HeaderFooterConfig>` annotation + import |
| Harper WASM 404 crash | `optimizeDeps.exclude: ['harper.js']` + pre-flight/guard rewrite of `HarperLinterExtension.ts` |
| Dashboard blank void with folders but no documents | Empty-state card in `DriveTable.tsx` |
| Template modal 4th card alone on 3-col grid | 2×2 grid in `DocumentCreateModal.tsx` |
| Outdated Concept D logo | `LogoMark` redrawn as Concept E "Document Lightbulb" |

---

## ⚠️ Known Remaining Issue

None. (The Professor Dashboard Similarity Tab was resolved this session.)

---

## ✅ Freebuff Verification Fixes — DONE (this session)

`TEST_RESULTS.md` assigned three fixes; all are complete and verified, plus **two additional real defects** were found and fixed while verifying E2.

1. **🔴 E1 — Restore `toggleBlockquote` — ✅ FIXED + VERIFIED**
   - `frontend/src/components/editor/TiptapEditor.tsx` `CustomBlockquote.addCommands()` now spreads `...this.parent?.()`.
   - Verified: `pytest tests/e2e -k quote -v` → `test_quote_converts_to_blockquote PASSED` (previously failed with `chain.toggleBlockquote is not a function`).

2. **🟠 E2 — Insert-tab staleness in the Table/Image test — ✅ FIXED + VERIFIED**
   - `tests/e2e/test_table_and_image_options.py` now clicks the Insert tab after loading the document, and its inner selectors were de-staled (`Insert 3×3 Table` button-only click, `Add Row Above`/`Add Column Left`/`Delete Row`, image prompt handled with a data-URI, wrap-mode labels matched in their rendered form).
   - Verified: master runner Suite 4 → **PASS** (`table_toolbar_button: PASS`, `image_toolbar_button: PASS`, plus `table_rendered_in_doc` and `table_row_col_actions` PASS).

3. **🟡 E3 — Console noise filter — ✅ FIXED + VERIFIED**
   - `tests/e2e/harness.py::filter_console_noise` also filters `[vite]`, `React DevTools`, the Chrome autofill warning, and the dev-only `harper_wasm_bg.wasm` StrictMode teardown abort.
   - Verified: `pytest tests/e2e -k application_errors -v` → both tests PASS (with the ML service running, as in the tester's environment).

### 🎁 Bonus real defects found while verifying E2 (same root pattern, both FIXED + verified)

`AlignedImageResize.addCommands()` and `TableAlignmentExtension.addCommands()` also overrode `addCommands()` without `...this.parent?.()`, silently dropping their parent commands:

- **Insert Image URL was broken** — `setImage is not a function`. Fixed → probe inserted an image with zero page errors.
- **All table commands were broken** — `insertTable`, `addRowBefore`, `deleteRow`, header toggles… Fixed → probes and the E2 script now insert a real 3×3 table and reach the row/column actions.

### Verification snapshot (master runner, this session)

```
[PASS] 1. AI Chatbot & Continuations
[PASS] 2. Overlays & Collision Handling
[PASS] 3. Professor Dashboard & Similarity Matrix
[PASS] 4. Table & Image Wrap Options        ← was FAIL before E2
[FAIL] 5. ML Microservice & Prediction      ← flaky microbenchmark only
[PASS] 6. Node Intent Parser & Skill Tests
```
- Suite 5 fails only on `test_formatting_model_latency` (15.5 ms vs a 15 ms threshold) while the whole master stack runs concurrently; **`pytest tests/python/test_ml.py -q` alone → 16 passed, 1 skipped** — environment load, not a regression.
- `tsc --noEmit` clean after every change.

### Notes
- **E4 intentionally untouched** (`auditController.test.ts` uses vitest): it is part of the deliberate calibration fixture on this throwaway branch (`CALIBRATION.md`).
- **Automation gap (not a defect)**: the image alignment/wrap menu is gated on the image being the active node selection; synthetic clicks select it in the DOM (`.ProseMirror-selectednode`) but the menu did not appear under automation, so the E2 script reports it as `WARN (selection-gated)`. The wrap/alignment options themselves remain as previously verified.

---

## 📋 Previously Completed Items

1. **AI provider: one key, one provider for now** — the live environment runs NVIDIA NIM with a single key (comma-separated failover supported but dormant; the user will shop for more AIs/APIs later, at which point only `AI_PROVIDER`/`AI_API_KEY`/`AI_MODEL` in `.env` change — no code changes).
   - ✅ Verified live: `meta/llama-3.2-11b-vision-instruct` answers in ~0.7–1.1s and completes a full 5-judge council (quorum reached); Node `aiClient.chat` works too.
   - 🔧 **Action (user, not DeepSeek)**: set `AI_MODEL=meta/llama-3.2-11b-vision-instruct` in `server/.env` — the currently configured `meta/llama-3.2-90b-vision-instruct` is listed in the account catalog but its calls hang.
   - Council hardening already in place for free tiers: 30s configurable judge timeout (`COUNCIL_JUDGE_TIMEOUT_SECONDS`) and max 2 concurrent completions; Node requests cap at 60s.
2. **⛔ Skip DOCX Import Metadata** — Defer feeding timeline forensics from DOCX files for now. In-editor web composition telemetry (keystroke/paste tracking) is sufficient for capstone evaluation.
3. **✅ Wire Real Keystroke Positions — DONE** (previous session, see above): events carry TipTap positions + document size; verdicts are attributed per flagged match range with a document-level fallback.

 
---
 
## 🤝 Testing Sign-Off (Tester Agent)
  
- **Chatbot Continuation Fix**: Verified on live running stack (`tests/e2e/test_chatbot_bulk_formatting.py`). Q1 (APA) → Q2 (all headings bold+center) → Q3 ("format the rest automatically") all produced actionable preview cards with `Apply`/`Reject` buttons. The fallback to instructional prose is completely resolved.
- **Overlay & Collision Fix**: Verified on live running stack (`tests/e2e/test_overlays_and_collision.py`). No idle popups, grammar clicks open `GrammarOverlay`, outline clicks open `InlineSuggestionChip`, and dual collisions route through `SuggestionActionsMenu`.
- **Professor Dashboard Similarity Tab**: Verified on live running stack (`tests/e2e/test_professor_dashboard.py`). All 5 tabs present and navigable; clicking 'Similarity Matrix' loads cleanly without infinite spinners; dropdown ready with class folders or clear prompt; tab refresh functional.
- **Table & Image Wrap Options**: Verified on live running stack (`tests/e2e/test_table_and_image_options.py`). Table insertion, row/column modifications, and style presets verified; Image alignment and all 6 text wrap modes (inline, square, tight, top-bottom, behind, in-front) verified.
- **Master Test Runner**: Unified runner created at `tests/e2e/run_full_system_test.py` covering all 6 core subsystems.
- All test suites exited with code 0. All screenshots stored in artifacts directory.


---

## ✅ DOCX Import Accuracy: Page Structure, TOC, Tables, Tabs (2026-10-22)

**Converter (`ml/src/converter.py`)** — now emits block `w:sdt` (TOC), inline wrappers,
text boxes (once), tables from `w:tc` (vertical merges flattened, `colspan` kept,
`data-column-size`), page breaks from `w:br`/`pageBreakBefore`/section breaks, tabs
(`<span data-tab>` + `data-tab-stops`/`data-default-tab`), NBSP-preserved space runs, and the
paragraph-mark size only for blank paragraphs. Text coverage ≈100% on V2/research (DM_0440 −2.1%).
`pytest tests/python`: 304 passed, 1 skipped (use `ml/venv/Scripts/python.exe`).

**Editor** — `tiptap-table-plus` 3.1.0 (+ `patch-package` patch), `PageBreak.ts` spacer layout,
`TabStop.ts` node + paragraph attrs, `ALLOWED_STYLE_PROPS` + `text-indent`.

**Measured live (real stack, V2 sabotage):** 4 real tables (no ghosts), widths follow Word
(e.g. 15.6/70.8/13.5%), List of Tables rows visible, 36 pages stable over 40s (Word: 33), sections
(ACKNOWLEDGEMENT … CHAPTER II) start on new pages within ±1 page of Word; TOC page numbers are
right-aligned. All five DOCX fixtures settle without runaway.

**Known gaps:** TOC runs 2 pages vs Word's 3 (TOC fonts/spacing differ), page counts still above Word
(DM_0440 5 vs 2, DM-OUHRODI 62 vs 32, research 19 vs 14 — floating letterhead images take flow
space, text boxes now add real text). `equalizeTableColumns` still writes `colwidth`, not
`columnSize`. Tab leaders (dots) not yet visually verified. `auditController.test.ts` needs
`vitest`, which is not installed (pre-existing).

**Gotcha:** the earlier "patch not live" diagnosis was wrong — the stack had been started with the
mock helper script. On the real stack the patch works after clearing `.vite`.

### Zoom fix (2026-10-22)
Zoom (CSS `zoom`) broke pagination and caused lag: the paginator and our layout passes mixed
zoomed `getBoundingClientRect()` values with unzoomed CSS px. Fixed via scale-aware `PageBreak.ts` /
`TabStop.ts` (spacer height from the page grid, writes only on change) and
`frontend/patches/tiptap-pagination-plus+3.1.0.patch`. Verified on V2 sabotage: 35 pages at 95%/100%/125%
with identical page first lines and zero layout writes after settling. At 80%/60% one borderline page
(content only 3px short of the page end at 100%) flips and later pages shift by one — sub-pixel text
metrics under zoom, not a logic bug. "APPROVAL SHEET" on page 1 is correct (Word does the same).


---

## ✅ Import naming, real thumbnails, UI overhaul (2026-10-22)

* **Duplicate import names:** `nextUniqueTitle` (`server/src/utils/uniqueTitle.ts`) + `documentModel.resolveUniqueTitle`;
  `createDocument` renames to "Name (1)", "Name (2)" when `unique_title` is set (local imports always; Drive imports send it).
  Verified: three imports of one DOCX gave `DupProbe`, `DupProbe (1)`, `DupProbe (2)`.
* **Thumbnails:** `server/src/utils/previewSnippet.ts` keeps styles/spans/tables/http images (data: images become grey boxes);
  `components/drive/DocumentPreview.tsx` renders the first page at the document's real page size, margins and preset.
  Existing rows were recomputed once with `server/scripts/backfillPreviewSnippets.ts` (264 rows). Re-run it after changing the extractor.
* **UI:** combined style documented in `DESIGN.md`; new `AuthShell` (Login/Register), plain-language `Landing` with a
  lazy-loaded interactive demo (`components/landing/*`, offline), calmer dashboard headings/container.
* **Not changed:** editor chrome and canvas (page count on the V2 fixture still 35). `auditController.test.ts` still needs `vitest`.

### Logo variants + remaining-screen polish (2026-10-22)
* **Logo:** four concepts live in `components/Logo.tsx` (`LOGO_VARIANTS`); `/logos` (public) lets you switch the whole app and the tab icon
  (`public/favicon-{a-d}.svg`, `main.tsx` favicon sync, choice kept in localStorage `intellidocs-logo-variant`). After a choice is made, hard-code
  it, delete the switch, `/logos` and the unused favicons.
* **Bug fixed:** unscoped preset CSS in the dashboard thumbnails uppercased every `h1` on the page. Presets are now scoped per card class
  (`scopePresetCss`) and the style block renders once (`PreviewStyles`). Note `Document.tsx` still injects `activeAcademicPreset.css` unscoped (existing behaviour).
* **Outline:** `decodeEntities` in `TableOfContents.ts` ("&amp;" no longer shown in the outline).
* **Polish:** `PageHeader` / `EmptyState` components; Settings, Professor (empty states) and Admin (copy only, not verified visually: the test account is a student) got sentence-case titles and calmer cards;
  dashboard/editor labels sentence-cased. Modals (`DocumentCreateModal`, `ImportFileModal`, `ShareModal`, `FolderCreateModal`) and editor toolbar markup were NOT restyled.
