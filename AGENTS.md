# IntelliDocs — AI Agent & Developer Instructions
> Technical guide for AI tools (Zed, Copilot, Gemini) and developers
> This is the single source of truth for implementation details

---

## Agent Operating Rules

- Ship working code only. Plausibility is not correctness.
- Read the files you will touch before editing them.
- Touch only what the task requires. No drive-by refactors or cleanup outside the request.
- If the request is ambiguous in a way that changes the output, ask before proceeding.
- Verify claims by reading files, running code, or checking command output instead of guessing.
- Never fabricate paths, APIs, test results, or implementation details.
- Keep solutions simple. Do not add abstraction or configurability that was not requested.
- Match existing patterns in this repository even if you would structure it differently in a greenfield project.
- Do not report success based only on a plausible diff. Verify the result.
- Context7 MCP: When working with external library APIs (TipTap v2+, ProseMirror, Tailwind, Vite, DuckDB, Radix UI), use the connected Context7 MCP tools (`resolve-library-id`, `query-docs`) to pull exact, up-to-date documentation rather than guessing deprecated APIs.
- Stop the local dev stack (ports 3000/5173/8001) whenever you finish a task and verify the ports are free — never leave services running in the background. Helper: `C:\Users\asus\AppData\Local\Temp\opencode\stop-stack.ps1`.

### Loop Circuit Breaker (Non-Negotiable)
- If you find yourself running the exact same tool, test, or command signature more than twice without progress, you are caught in an iteration loop.
- You must immediately ABORT further tool executions, summarize what failed and why, and ask the user for direction. Never attempt a 3rd blind retry.

### Working Approach

1. Read the relevant files and the calling code around them.
2. Define success in a way that can be checked.
3. Make the smallest change that satisfies the request.
4. Run the most relevant verification available.
5. If the same issue fails twice, stop and reassess instead of layering guesses.

---

## What is IntelliDocs?

IntelliDocs is a capstone research system — an intelligent web-based document
editor that learns user formatting behavior over time and automatically suggests
formatting with confidence scoring. It is NOT a replacement for Word or Google
Docs. It fills a specific gap: no existing editor learns individual formatting
behavior and predicts it automatically.

---

## Dean Requirements (non-negotiable)

- Editor must be feature-complete and custom-built — built on TipTap
  (ProseMirror) with a custom React toolbar, custom formatting commands,
  and custom selection handling; no prebuilt word-processor application
- Grammar and spell checking is required as a feature
- ML model must be pre-trained on an existing online dataset
  before user behavior fine-tuning begins
- System must follow strict MVC architecture throughout

---

## Full Tech Stack

### Front-end
- React 18 + Vite
- TypeScript + TSX
- Shadcn/ui + Tailwind CSS (UI primitives only, NOT the editor)
- TipTap editor (ProseMirror) with custom React toolbar + formatting commands;
  pagination via the `tiptap-pagination-plus` extension

### Back-end
- Node.js 20 + Express
- TypeScript

### Databases
- Supabase — PostgreSQL + pgvector + Auth + Realtime
  Supabase Auth handles ALL authentication (no custom auth)
  User profile display names live in Supabase Auth's own schema
  (`auth.users.raw_user_meta_data`, key `display_name`) — updated via
  `supabase.auth.admin.updateUserById`. The `user_profiles` table is the
  manuscript's planned schema, NOT the deployed app's; never write profile
  data to it.
  pgvector enabled for embedding storage
  Realtime for auto-save functionality
  Never commit Supabase URL or anon key
- Redis — behavior buffer, suggestion cache, debounced auto-save dirty flags,
  per-user AI quota tracking, and NLP command deduplication.
  Failover chain (`server/src/utils/redisClient.ts`): Upstash
  (`UPSTASH_REDIS_REST_URL/TOKEN`), an optional second Upstash
  (`UPSTASH_REDIS_REST_URL_2/TOKEN_2`), an optional local `REDIS_URL`, then an
  in-process memory store. A failing backend is skipped for 30s; `/health/ready`
  names the one in use. The aggregator also drains the second Upstash.
- DuckDB — analytical store for ML training data. All ML code opens it through
  `ml/duckdb_store.py`: lock errors are retried, then `DUCKDB_FALLBACK_PATH`
  (default `db/duckdb/behavior_fallback.duckdb`) is used, and its rows are copied
  back into `DUCKDB_PATH` by the aggregator once the primary is reachable.
- Storage quotas (`userModel.STORAGE_QUOTA_BYTES`): student 25 MB, professor
  50 MB, admin 100 MB of document content, enforced on create/update/import
  (413 `storage_quota_exceeded`). Sized for the 500 MB Supabase free tier.

### AI / ML
- Python 3 + FastAPI — ML prediction microservice
- scikit-learn + PyTorch — hybrid rule-based + neural model
- External AI provider via `server/src/ai/aiClient.ts`
  (currently provider-abstracted; provider is selected by env)
- MCP server (Express) — exposes app tools to AI brain
- Python ML service remains responsible for formatting prediction,
  grammar checks, spelling checks, and confidence scoring

### Python handles
- ML training and prediction (predict.py)
- Grammar and spell checking
- Dataset download and preprocessing
- Redis → DuckDB aggregation (aggregator.py)
- Automation testing (pytest)

### Datasets (pre-training)
- WikiText-103 — formatting patterns (huggingface)
- JFLEG — grammar correction (github.com/keisks/jfleg)
- Use HuggingFace datasets library to download

---

## MVC Architecture (strict — never break this)

```
Route       → receives HTTP request, calls controller ONLY
               zero logic, zero DB queries here

Controller  → handles request/response, calls model and skills
               zero direct DB queries here
               zero Supabase/Redis/DuckDB calls here

Model       → ALL data access lives here ONLY
               Supabase queries, Redis operations, DuckDB queries
               zero req/res objects here

React       → View layer, calls Express via fetch() in services/api.ts
               zero direct Supabase calls (go through Express)

AI Skills   → service layer called by controllers
               single-purpose async functions
               one export per file
```

---

## Folder Structure

```
intellidocs/
│
├── AGENTS.md                         ← AI tool context (Zed, Antigravity, Copilot)
├── CLAUDE.md                         → symlink to AGENTS.md
├── GEMINI.md                         → symlink to AGENTS.md
├── .rules                            → symlink to AGENTS.md
├── .github/
│   └── copilot-instructions.md       ← copied from AGENTS.md
│
├── frontend/                         ← React 18 + Vite (View layer)
│   ├── src/
│   │   ├── types/
│   │   │   └── index.ts              ← all shared frontend types
│   │   ├── components/
│   │   │   ├── ui/                   ← Shadcn components (primitives only)
│   │   │   ├── editor/               ← TipTap-based document editor
│   │   │   │   ├── TiptapEditor.tsx  ← toolbar, shared extensions, canvas, menus
│   │   │   │   ├── PagedEditor.tsx   ← paginated single editor (tiptap-pagination-plus)
│   │   │   │   ├── GrammarUnderlineExtension.ts ← wavy-underline grammar plugin
│   │   │   │   ├── GrammarPanel.tsx  ← grammar/spell engine + issue list
│   │   │   │   ├── GrammarOverlay.tsx← floating fix popover
│   │   │   │   ├── FormatPrompt.tsx  ← confidence-scored suggestion prompt
│   │   │   │   ├── SuggestionPanel.tsx ← prediction suggestions UI
│   │   │   │   ├── FormattingPanel.tsx ← preset + custom rule bindings
│   │   │   │   ├── behaviorListener.ts ← format-action event factory
│   │   │   │   ├── PageBreak.ts      ← legacy page-break node (saved docs)
│   │   │   │   ├── AIChatbot.tsx     ← floating AI chatbot (preview/confirm UI)
│   │   │   │   └── McpDebugPanel.tsx ← MCP tool debugging UI
│   │   │   ├── DocumentCard.tsx
│   │   │   ├── DocumentForm.tsx
│   │   │   └── Navbar.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Home.tsx              ← list all documents
│   │   │   └── Document.tsx          ← editor page
│   │   ├── hooks/
│   │   │   ├── useEditor.ts
│   │   │   ├── useAIStream.ts
│   │   │   └── useBehaviorLogger.ts
│   │   ├── services/
│   │   │   ├── api.ts                ← ALL fetch() calls live here
│   │   │   └── mcpChat.ts            ← chatbot MCP calls
│   │   ├── context/
│   │   │   └── AuthContext.tsx       ← Supabase session state
│   │   └── App.tsx                   ← routes + protected routes
│   └── index.html
│
├── server/                           ← Node 20 + Express (Controller layer)
│   ├── types/
│   │   └── index.ts                  ← all shared backend types
│   ├── models/                       ← ALL data access (Model layer)
│   │   ├── documentModel.ts          ← Supabase document queries
│   │   ├── userModel.ts              ← Supabase user queries
│   │   ├── behaviorModel.ts          ← Redis operations
│   │   ├── feedbackModel.ts          ← Supabase prediction feedback queries
│   │   ├── driveModel.ts             ← Supabase Google OAuth tokens
│   │   └── folderModel.ts            ← Supabase folder management
│   ├── controllers/                  ← request handlers (Controller layer)
│   │   ├── authController.ts
│   │   ├── documentController.ts
│   │   ├── behaviorController.ts
│   │   ├── aiController.ts
│   │   ├── predictionController.ts
│   │   ├── driveController.ts
│   │   └── formattingController.ts
│   ├── routes/                       ← URL mapping only, no logic
│   │   ├── authRoutes.ts
│   │   ├── documentRoutes.ts
│   │   ├── aiRoutes.ts
│   │   ├── behaviorRoutes.ts
│   │   ├── driveRoutes.ts
│   │   └── formattingRoutes.ts
│   ├── ai/
│   │   ├── aiClient.ts               ← external provider abstraction
│   │   ├── bridge/
│   │   │   └── pythonBridge.ts       ← HTTP calls to FastAPI only
│   │   └── prompts/
│   │       └── systemPrompts.ts      ← ALL prompt strings live here
│   ├── skills/                       ← single-purpose async functions
│   │   ├── predictFormat.ts
│   │   ├── feedbackLoop.ts
│   │   ├── parseFormattingIntent.ts
│   │   ├── resolveFormattingTier.ts
│   │   └── buildChatContext.ts
│   ├── middleware/
│   │   ├── arcjet.ts                 ← Arcjet per-router protection
│   │   ├── authMiddleware.ts         ← verify Supabase JWT
│   │   ├── errorHandler.ts           ← global error handling
│   │   └── validate.ts               ← Zod request validation middleware
│   ├── mcp/
│   │   ├── mcpServer.ts              ← MCP server setup
│   │   └── tools/                    ← tools exposed to AI brain
│   │       ├── getDocumentContent.ts
│   │       ├── applyFormatting.ts    ← preview mode + commit mode
│   │       ├── getUserProfile.ts
│   │       ├── predictNextFormat.ts
│   │       ├── getBehaviorSummary.ts
│   │       └── explainSuggestion.ts
│   ├── schemas/                      ← Zod schemas for external boundaries
│   │   ├── authSchemas.ts
│   │   ├── behaviorSchemas.ts
│   │   ├── documentSchemas.ts
│   │   ├── feedbackSchemas.ts
│   │   └── predictionSchemas.ts
│   ├── utils/
│   │   └── redisClient.ts            ← Redis client singleton
│   ├── app.ts                        ← Express setup + middleware
│   └── server.ts                     ← HTTP entry point
│
├── ml/                               ← Python FastAPI + ML
│   ├── dataset/
│   │   ├── download.py               ← downloads WikiText-103, JFLEG
│   │   └── preprocess.py             ← cleans and extracts features
│   ├── models/
│   │   ├── base_model.pkl            ← pre-trained on dataset
│   │   └── user_models/              ← per-user fine-tuned models
│   ├── training/
│   │   ├── base_trainer.py           ← trains on WikiText-103
│   │   └── fine_tuner.py             ← personalizes on user behavior
│   ├── grammar/
│   │   ├── grammar_checker.py        ← trained on JFLEG dataset
│   │   └── spell_checker.py          ← pyspellchecker library
│   ├── src/
│   │   └── main.py                   ← FastAPI prediction endpoint
│   └── aggregator.py                 ← Redis → DuckDB flush
│
├── db/
│   ├── supabase/                     ← SQL migrations and seeds
│   └── duckdb/                       ← behavioral schema + queries
│
├── tests/
│   ├── python/                       ← pytest automation tests
│   └── node/                         ← Jest + Supertest API tests
│
└── .env                              ← gitignored, never commit this
```

---

## Custom Editor Rules (TipTap)

- EDITOR-FIRST RULE: before hand-rolling any editor behavior (pagination,
  tables, menus, commands), check whether TipTap or a maintained community
  extension already provides it and prefer that solution — e.g. pagination
  uses `tiptap-pagination-plus` (see PagedEditor.tsx), not a custom cascade
- The editor is TipTap (ProseMirror); the toolbar, menus, and page layout
  are custom-built in React (TiptapEditor.tsx, PagedEditor.tsx)
- All formatting goes through TipTap's command API (`editor.chain().focus()`)
- All behavior events fire from toolbar actions via `onFormatApplied`
- Grammar underlines are a custom TipTap plugin (GrammarUnderlineExtension.ts)
- Keep shared extensions in `editorExtensions` (TiptapEditor.tsx) — single
  source of truth for every editor instance
- In `tiptap-pagination-plus` the header/footer zones' padding (`--rm-margin-top`
  / `--rm-margin-bottom`) IS the page margin. Never zero or clamp it — doing so
  moved body text into the margin and collapsed the header/footer (shipped once).
- The header/footer CONTENT rows (`.rm-page-header-content` / `-footer-content`)
  are deliberately measured as 0px tall and drawn inside the margins (see
  PagedEditor's scoped style). The library otherwise subtracts their height from
  every page's body, which put the header's clickable zone on the grid's first
  row and left the last row unusable. Keep `overflow: visible !important` (the
  library sets inline `overflow:hidden`) and leave the zone padding untouched.
- The library lays header/footer zones out as `display: inline-flex`, which
  leaves an 8-11px line-box gap below each zone and pushed every page's text
  ~0.1in down; PagedEditor forces them to `display: flex`. Keep that override.

---

## Import Pipeline Invariants (do not regress)

- The editor loads a document in ONE transactional `setContent` (pagination
  paused around it). Never stream large imports as chunked `insertContent`
  fragments: ProseMirror strips a trailing `<hr>` from every parsed fragment,
  so chunk boundaries silently deleted page breaks — and adjacent images and
  paragraphs — from saved documents on every load/save cycle.
- Page breaks are schema-owned (`PageBreak` node): imports arrive as
  `<hr class="page-break" data-page-break>` and persist as
  `<div class="intellidocs-page-break">`. Its `hr.page-break` parse rule must
  keep `priority: 110` to outrank StarterKit's horizontalRule (first match wins).
- Never purge blank paragraphs anywhere in the import path. Word blank lines
  are intentional; emit empty `<p>` elements and NEVER `<p><br/></p>` (a lone
  `<br>` parses as a hard-break node and renders two line boxes — double-height
  blank lines).
- Imported spacing is authoritative: paragraph inline line-height/margins come
  from Word/PDF (direct `w:spacing` → style chain → docDefaults; PDFs use the
  measured line ratio). Editor CSS must never override them with `!important`.
  Every imported paragraph carries an EXPLICIT `text-indent` (0 when Word has
  none) and base `font-size`, so an applied preset's 0.5in indent / 12pt cannot
  reshape a title page; "auto" line spacing is scaled by the font's natural
  line height (`_FONT_LINE_FACTORS`, 1.15 for Times New Roman) because CSS
  `line-height: N` multiplies 1em while Word multiplies that height. Blank
  paragraphs size from their paragraph-mark font, not the style default.
  Header/footer `PAGE` fields are imported as a page-number format, never as
  the cached number Word last saved.
- Merely opening a document must not rewrite it: autosave fires on real edits
  only. `Document.tsx` enforces this with `documentLoadedRef`: it is set only
  after the server copy is applied, and `scheduleSave`/`saveDocument`/
  `handleContentChange` do nothing before that (the empty editor emits an update
  on mount and the "latest" refs start as 'Untitled Document'/'', so an early
  save used to overwrite real documents with defaults). The server adds a net:
  `isDestructiveBlankOverwrite` (`server/src/utils/documentGuards.ts`) rejects
  with 409 a save that blanks a non-empty renamed document AND resets its title.
  Browser test scripts must still block PUT/PATCH unless they are testing saves.
- PDFs are normalized to DOCX with pdf2docx and then go through the DOCX
  converter (`convert_pdf_bytes_to_html` in `ml/src/converter.py`). There is no
  separate PDF→HTML path — do not reintroduce one. The PDF-only repairs run on
  the intermediate DOCX before the shared emitter: next-page `sectPr` →
  page breaks, repeated top/bottom elements (running headers/footers/logos)
  stripped, heading styles inferred from size/bold/shape, large images
  re-encoded. Furniture detection must normalize ONLY page-number text
  (`<page-number>`); never digit-normalize arbitrary lines or "Article 4" /
  "Question 7" body lines get deleted on short pages.
- The converter walks EVERYTHING Word nests, not just top-level `p`/`tbl`:
  block `w:sdt` content controls (the Table of Contents lives in one), inline
  wrappers (`w:sdt/ins/smartTag/customXml/fldSimple`) and text boxes
  (`w:txbxContent`; skip the `mc:Fallback` duplicate). Tables are read from
  `w:tc` directly — never python-docx `row.cells`, which repeats merged cells.
- Tables use `tiptap-table-plus` (pinned 3.1.0) — never stock TipTap tables with
  the paginator, which clips them to 0px. Its paginator is only safe with LOOSE
  rows (no `<tbody>` per row) and NO rowspans: tall tables that need row groups
  make `tiptap-pagination-plus` grow the page count forever. Vertical merges are
  therefore flattened (restart cell `border-bottom:none`, continuation emitted
  as a bordered cell). A cell merged down several rows must NOT keep all its
  paragraphs in its first row: that row grows to hold them while the rows below
  keep their own height, so the text is counted twice (form-style tables: ~28pt per
  merge, the cause of DM-OUHRODI running 35 pages against Word's 32). Its paragraphs
  are spread over the rows it covers by where each starts (`_merged_cell_chunks`:
  estimated paragraph heights against the rows' set heights; text starts after its own
  space-before); only when every spanned row but the last has a set height, the
  cell holds plain paragraphs and there are at least two. `data-column-size` carries column percents and is
  only emitted when the widest row has as many cells as the grid. The library
  has a bug (ghost tables, lost table attrs when regrouping); the fix lives in
  `frontend/patches/tiptap-table-plus+3.1.0.patch`, applied by `patch-package`
  (postinstall). After changing the patch, delete `frontend/node_modules/.vite`
  and restart Vite — a running dev server keeps serving its cached pre-bundle.
- Page structure follows Word: explicit `w:br type=page`, `pageBreakBefore`
  (direct or style) and next-page section breaks all become page-break `<hr>`s.
  `PageBreak.ts` stretches each spacer to the end of its page at runtime
  (DOM-only height; it must never become a transaction/autosave). The paginator
  keeps every `.breaker` in one wrapper, so order them by position, not DOM order.
- The canvas zooms with CSS `zoom`, so `getBoundingClientRect()` is in zoomed px
  while style heights/widths are not. Every DOM-measuring layout pass
  (`PageBreak.ts`, `TabStop.ts`) divides by the live scale
  (`rect.width / offsetWidth` of the editor), and `tiptap-pagination-plus` is
  patched the same way (`frontend/patches/tiptap-pagination-plus+3.1.0.patch`,
  its page-count gap mixed zoomed rects with unzoomed page height). Spacer
  height is derived from the page grid, never from its own current height, and
  layout passes write only when a value really changes (every style write
  re-flows the paginator).
- Tabs: each Word tab is `<span data-tab>` (`TabStop.ts` node); paragraphs carry
  `data-tab-stops` (`[[align, px, leader], …]`) and `data-default-tab`. Widths
  are computed at runtime with Word's rule (next custom stop, else next default
  multiple; right/center stops subtract the following text). Runs of spaces keep
  their width via alternating U+00A0.
- Headings follow the same rule as paragraphs: the converter writes the source's
  own size, weight, alignment and spacing inline (`_heading_css`) and `CustomHeading`
  keeps that `style`. Title-page lines (centred lines before the first chapter) stay
  paragraphs. Applying a style tile writes a combined look onto the block
  (`combinedLook`, `styleCommands.ts`); the heading level is only a hidden structure
  tag, and a preset never overwrites a block that carries its own look.
- Tables are rebuilt from the source, not styled by the editor: borders come from
  tblBorders/tcBorders (style chain included), padding from tblCellMar/tcMar, shading
  only from `w:shd`, vertical alignment from `w:vAlign`. Cell style props must be in the
  editor whitelist as LONGHANDS (`padding-top`, not `padding`). Do not re-add the
  `!important` line-height/margin on `td p`; it flattened every cell's spacing.
- Drawn lines (`wps:wsp` straight connectors) become bordered empty paragraphs
  (`rule-line`); `mc:Fallback` copies of drawings are never rendered. Blank lines and a
  trailing `<br>` right before a page break are dropped (`_trim_page_ends`) so a page
  that runs a line long cannot spill onto a blank page.
- The library's 1px border on the page stack (border-box) made the text column 2px
  narrower than the page margins and re-wrapped lines Word fits; PagedEditor removes it.
  Keep the text column exactly page width minus margins.
- Page setup bottom margin (DOCX only): `_page_bottom_margin` takes the SMALLEST bottom margin of any
  section (floor 0.19in; a zero margin collapses the footer zone), not the most common one. A section
  cannot be shifted down at its bottom like left/right/top, so a section with a smaller bottom margin
  than the page setup lost its last lines to the next page and every later page sat one page behind Word.
  Measured: 0200725 16 -> 14 pages (Word 14), DM-OUHRODI 37 -> 35 (Word 32). PDF imports keep page one's margin.
  What is left is per-page body height (continuation pages of a section take the document's margins).
  Prototyped and NOT adopted (harness CSS: per-page `.rm-page-header-<n>` / `.rm-page-footer-<n>` padding plus
  `--rm-page-content-<n> !important`; this does keep every sheet at the same pitch): exact per-page top+bottom
  gave DM-OUHRODI 35 -> 33 pages (Word 32) but a worse median vertical error (38.6 vs 17.4pt), and 0200725
  14 -> 15 pages (editor content runs a few points taller than Word's, so a full page spills before a hard
  section break). It also needs each page's section from the laid-out `data-section` breaks, and a spilled page
  makes that measurement wrong in a stable way. Revisit only after the content-height drift (wrapped cell
  text, list row heights) is fixed.
- Section margin shifts also cover tables and numbered items: a table carries `data-inset="left,right,top"`
  (px; the `TableInset` extension draws it as a node decoration because the table node view drops inline
  style), and a list item's `data-mx` moves by the section's left difference.
- Known and not fixed: pinned footer art (copyright line, rule) is drawn from a page-sized box inside the
  footer zone (`zoneHtml` in `lib/pageLayout.ts`) with page-corner `top` values, so it lands on the NEXT
  page's body (~y 860-890px on 0200725), with the old and the new bottom margin alike.
- Equations: Word's OMML becomes KaTeX math nodes. `ml/src/omml.py` converts `m:oMath` to LaTeX (structure
  and symbol tables adapted from dwml, Apache-2.0; every command is one KaTeX supports; an equation it cannot
  convert returns None and the converter keeps the equation's own text, never drops it). An equation that
  is alone in its paragraph (or any `m:oMathPara`) is a block `<div data-type="block-math" data-latex
  data-number>`, a number after a tab ("(1)") or typed as `#(1)` becomes `data-number`; an equation in a
  line of text is `<span data-type="inline-math" data-latex>`. The editor nodes are in `MathNodes.ts`
  (extending `@tiptap/extension-mathematics`, pinned to the TipTap version; it also reads the old
  `data-academic-equation` markup): `$x$` follows Pandoc's rule so prices stay text, a whole paragraph
  `$$x$$` is a display equation, clicking an equation opens `MathEditPopover` (editor event `math-edit`),
  and `/equation` inserts one. Never remove the `span:empty` exception for `inline-math` in
  `sanitizeLoadedHtml`. KaTeX fonts change an equation's height when they load, so the nodes ask the editor
  to measure again once `document.fonts` has them. DOCX export (`ieeeExport.ts` + `lib/latexToMath.ts`)
  writes Word equations for fractions, scripts, roots, sums, integrals and brackets; anything else is
  written as its LaTeX source in italics. Not done: footnotes, `\begin{aligned}`/matrix export.
- IEEE two-column layout: the editor stays single-column. Two columns appear in three places that must
  agree: the print preview (`IeeePrintPreview.tsx`, Paged.js), the draft view (`ColumnsDraft`, pagination off) and
  the Word export (`ieeeExport.ts`, a continuous 2-column section). A table, figure (`imageResize`) or
  display equation can run across both columns: node attribute `span: 'full'` (`data-span="full"`), set by
  the `toggleFullSpan` command (IEEE toolbar button). The one rule for "what spans" is `ieeeSpan.ts`
  (a marked block plus the table caption above it or the figure caption below it); the preview wraps
  such a run in `.ieee-span {column-span: all}`, the draft view decorates it with the same class, and the
  export puts it in a single-column continuous section. Spike result (Paged.js 0.4.3 vs Chrome's own print
  layout, same content): both keep every word and span correctly; Paged.js needs the `text-align-last`
  override in `IEEE_PAGE_CSS` (it marks each block it splits and justifies its last line). WeasyPrint was not
  used (not installed; needs native libraries on Windows). The preview draws equations itself
  (`renderEquations`) because saved HTML holds only their LaTeX. The preview overlay sits above 9999 so the
  editor's table resize handles do not show through. Paragraph spacing (3pt) and small-caps level 1 match
  the Word export; these are the app's own values, not checked against IEEE's published template (it could
  not be fetched). An imported DOCX with most of its text in 2+ column sections gets
  `page_layout.two_column` (converter `_is_two_column_body`; short two-column memo headers do not count) and
  the document page offers the preview once (`TwoColumnPrompt`, "Not now" kept in localStorage).
- Imported list items carry `data-flat="1"` (`CustomListItem.flat`); the editor then drops the
  list/item margins (`ul/ol:has(> li[data-flat])`, `li[data-flat]`). Word puts no space around a list
  or between its items (the paragraphs carry it), while the editor's own lists keep 0.5em/0.2em. Each
  imported single-item list added ~5pt. Lists typed in the editor are unchanged.
- Numbered lists: a level the list's own counter can draw (one counter in the level's own format, from 1)
  keeps the `data-pre`/`data-post` + CSS counter path. Every other numbered level gets a literal
  `data-marker="1.2"` (`_literal_marker`): text that joins several counters (`%1.%2`), `isLgl` levels (digits
  for the levels above), a `w:start` above 1, `w:startOverride`, and `lvlRestart=0` (keeps counting). Counters
  come from `item_counts` in `_body_to_html`, which is updated BEFORE the item is built. A marker may only
  reference its own level or those above it; anything not plain text falls back to the counter path. The
  marker's width (`_marker_width_px`) decides whether the text starts at the hanging indent or the next tab
  stop: it uses glyph-class widths, not a flat half-em per character (flat widths pushed "B.ii" a tab too
  far). Checked against Word on a synthetic outline: numbers and text starts matched on every item.
- Footnotes/endnotes: a reference becomes a raised number in the text and the note's text goes under a "Notes" /
  "Endnotes" label at the END of the document in reference order (footnotes 1, 2..; endnotes i, ii..). The
  editor has no page-bottom note area and the paginator cannot reserve one, so page counts differ from Word's
  where notes would sit at the foot of a page. State lives on `doc.part._intellidocs_notes`; headers and
  footers collect none. Note ids are not numbers (Word numbers by reference order).
- Bold/italic follow Word's toggle rule: a direct setting on the run is absolute; otherwise the character style
  and paragraph style each give their nearest value and the two are toggled (both on = off).
- Not done on purpose: `w:tblStylePr` (conditional table formatting) and `contextualSpacing`: no fixture uses
  either; add them when one does.
- Fidelity is measured, not eyeballed: `tests/e2e/fidelity_run.py` converts every
  fixture and compares each page with its reference image (page count, words per page,
  blurred layout correlation). Run it after any converter or page-layout change.
- Production builds must set `VITE_API_URL` to the backend's full URL; `vite.config.ts`
  fails the build otherwise (a relative `/api` only works behind the dev proxy and
  returns 405 on a static host).
- Never use the opencode helper `start-stack.ps1` (in the Temp\opencode folder):
  it starts mock-supabase, which this project no longer uses.

---

## ML Pipeline Rules

- Base model MUST be pre-trained on WikiText-103 before deployment
- Grammar checker MUST use JFLEG dataset
- User behavior fine-tunes the base model — never replaces it
- All model files go in ml/models/
- Python never shares a process with Node — always HTTP via FastAPI
- pythonBridge.ts is the ONLY file that calls FastAPI

---

## MCP Chatbot Rules

- AIChatbot has exactly 3 UI states: collapsed, expanded, previewing
- applyFormatting ALWAYS calls preview mode first
- User MUST confirm before commit mode is called
- Rejection ALWAYS fires feedbackLoop.ts — never silently ignore
- NLP commands (short/surgical) are separate from MCP chatbot (agentic)

---

## AI Provider System

### Context
- Most of IntelliDocs does NOT use an AI API
  - Formatting prediction = Python ML model (scikit-learn)
  - Grammar checking = pyspellchecker + JFLEG dataset
  - Behavior tracking = Redis + DuckDB pipeline
  - Confidence scoring = ML model output

- The AI API is ONLY used for:
  - AIChatbot (MCP tool orchestration, preview/confirm UI)
  - Natural language command interpretation
  - The plagiarism council (five judges, possibly on different providers)

### Implementation Details

#### 1. AI Client File
`filepath: server/src/ai/aiClient.ts`

The provider must be abstracted behind `aiClient.ts` so switching providers
only requires changing that one file.

#### 2. Environment Variables

Use these env variables for all external AI providers:

```env
AI_PROVIDER=gemini
AI_API_KEY=your_provider_key
AI_MODEL=gemini-2.0-flash
```

Do NOT use:
- `OLLAMA_HOST`
- provider-specific env naming like `GEMINI_API_KEY` inside app logic

#### 2b. Multiple Providers (profiles)
- `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` is profile 1. Extra profiles use the same
  names with a numeric suffix (`AI_PROVIDER_2`, `AI_API_KEY_2`, `AI_MODEL_2` ... up to 9);
  incomplete profiles are ignored. Supported providers: gemini, nvidia, groq, openrouter,
  mistral. Parsing lives in `server/src/ai/aiProfiles.ts`.
- The chatbot / NLP commands fail over down the profile list (5xx, timeout, unknown model,
  or all keys rejected); malformed requests (400/422) are not retried.
- The plagiarism council runs a mixed panel: `server/src/skills/runCouncilScan.ts` sends all
  profiles plus a judge -> profile assignment to the ML service. Specialists are spread
  round-robin, the arbiter uses profile 1; `COUNCIL_<ROLE>_PROFILE=<n>` pins a judge (`COUNCIL_ARBITER_PROFILE` is a short name for the arbiter's pin; each API key runs `COUNCIL_CONCURRENCY_PER_KEY` calls at once, default 2). Each
  judge falls over to the other profiles, and transcript entries record `provider`/`model`.
  The council's request-scoped config lives in a ContextVar in `ml/council_pipeline.py`
  (never a module global).

#### 3. Provider Requirements
- Provider must support native function calling / tool use
- Provider must work with MCP tool definitions
- Provider selection is controlled only by the `AI_PROVIDER*` profile variables
- `aiClient.ts` is the only provider switch point for the backend (the council is the one
  exception: it calls its providers from the ML service, configured by the server)

#### 4. Current Provider Direction
IntelliDocs has moved away from Ollama and ngrok.

Providers under evaluation include:
- Gemini Flash
- Groq
- OpenRouter
- Mistral
- Cohere

#### 5. AI Client Rules
- No `any` types
- Every function explicitly typed
- Comment every function in plain English
- Keep `aiClient.ts` small and provider-focused
- Handle errors with try/catch
- Throw a clear error if `AI_PROVIDER`, `AI_API_KEY`, or `AI_MODEL` is not set
- Never hardcode API keys

#### 6. Provider Transparency
- MCP tools in `server/src/mcp/tools/` must work identically regardless of provider
- Skill files in `server/src/ai/skills/` must work identically regardless of provider
- Provider switching must be invisible to the rest of the backend

---

## Security Middleware

### Arcjet
- Arcjet provides entry-level protection for auth and AI-facing routes
- Arcjet lives in `server/src/middleware/arcjet.ts`
- Apply Arcjet per-router, not globally
- Use it on:
  - `/auth/*`
  - `/ai/*`
  - other AI-facing routes like `/predictions/*` while legacy routes still exist

### Arcjet Scope
- Rate limiting on auth and AI routes
- Shield protection for basic SQL injection / XSS style attacks
- Bot detection on signup routes
- This is capstone-level protection, not a full enterprise security program

### Relationship to Redis
- Arcjet = request-layer protection
- Redis = application-layer state, caching, quota tracking, and deduplication

---

## Validation

### Zod Rules
- Use Zod at runtime for all external boundaries
- Do NOT use Zod for internal function-to-function calls inside the TypeScript app
- Let TypeScript handle internal typing

### Where Zod Must Be Used
- HTTP request bodies validated in routes before controllers
- MCP tool call arguments validated with Zod schemas
- Python FastAPI responses parsed through Zod before use
- Redis behavior events validated before ingestion

### Schema Locations
- Backend schemas live in `server/schemas/`
- Frontend schemas live in `frontend/src/schemas/`

---

## Project Context

### Stack
- Frontend: React 18 + Vite + TypeScript + TSX
- Backend: Node.js 20 + Express + TypeScript
- ML Service: Python + FastAPI + scikit-learn + PyTorch
- Databases: Supabase, Redis, DuckDB
- Package managers: npm for frontend/backend, pip for ML

### Commands

#### Frontend
- Install: `cd frontend && npm install`
- Run locally: `cd frontend && npm run dev`
- Build: `cd frontend && npm run build`
- Lint: `cd frontend && npm run lint`
- Typecheck: `cd frontend && npm run type-check`

#### Backend
- Install: `cd server && npm install`
- Run locally: `cd server && npm run dev`
- Run locally with ML Python path: `cd server && npm run dev:ml`
- Build: `cd server && npm run build`
- Test: `cd server && npm test`
- Lint: `cd server && npm run lint`

#### ML
- Install: `cd ml && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
- Run locally: `cd ml && source venv/bin/activate && python src/main.py`
- Dataset download: `ml/venv/bin/python ml/dataset/download.py`
- Preprocess: `ml/venv/bin/python ml/dataset/preprocess.py`
- Train base model: `ml/venv/bin/python ml/training/base_trainer.py`

### Layout
- Frontend source lives in: `frontend/src`
- Backend source lives in: `server/src`
- ML source lives in: `ml/src`
- Tests live in: `tests/`
- Generated ML artifacts live under: `ml/dataset/raw`, `ml/dataset/processed`, `ml/models`
- Do not commit generated datasets or training artifacts unless explicitly requested

### Repo-Specific Conventions
- React must call the backend only through `frontend/src/services/api.ts`
- Controllers must not call Python directly; use the Python bridge path
- Keep route files thin and move logic into controllers/skills/models as appropriate
- Route files should handle Zod validation before controllers
- The editor must stay TipTap-based — custom toolbar/commands, never a prebuilt word-processor app
- Match the existing TypeScript style: explicit types, no `any`, minimal changes

## Coding Conventions

- No `any` types in TypeScript — ever
- All function parameters and return types must be explicitly typed
- Use `interface` for object shapes, `type` for unions
- Comment every function in plain English
- Keep files under 80 lines where possible
- Controllers never call DB directly — always through models
- Controllers never call Python directly — always through pythonBridge.ts
- No business logic in route files
- Route files are responsible for request validation
- Skills are single-purpose — one export per file
- New skills need a matching test in __tests__/
- All prompt strings in systemPrompts.ts — never inline
- Never commit API keys, Supabase URL, or anon key
- Never build custom auth — Supabase handles it
- Do not modify .env — reference process.env by name only

---

## Developer Machine

- OS: Nobara Linux (NVIDIA drivers pre-installed)
- RAM: 16GB
- GPU: RTX 3050 desktop, 6GB VRAM

Note:
- IntelliDocs no longer depends on Ollama for local development
- External provider selection now happens through `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL`

---

## Build Order

```
Phase 1 — Foundation
  1. Supabase setup (users + documents table + RLS)
  2. Express CRUD for documents (MVC strictly)
  3. Supabase Auth (login, register, JWT middleware)
  4. React pages (Login, Register, Home, Document)
  5. Custom TipTap editor (TiptapEditor toolbar + PagedEditor)
  6. Shadcn/ui for all non-editor UI

Phase 2 — Behavior Pipeline
  7.  Redis behavior event logger (BehaviorListener.ts)
  8.  DuckDB schema + aggregator.py
  9.  Feature extraction (featureExtractor.ts)

Phase 3 — Dataset + Base ML Model
  10. Download WikiText-103 and JFLEG datasets
  11. Preprocess and extract formatting features
  12. Train base hybrid model (base_trainer.py)
  13. Set up FastAPI prediction endpoint (predict.py)
  14. Wire pythonBridge.ts in Express

Phase 4 — Grammar + Spell Check
  15. grammar_checker.py using JFLEG
  16. spell_checker.py using pyspellchecker
  17. Wire into Express via pythonBridge.ts
  18. Display inline in editor via GrammarUnderlineExtension

Phase 5 — AI Suggestion UI
  19. SuggestionPanel with confidence score display
  20. FormatPrompt inside editor
  21. DiffPreview + ConfirmBar components (in AIChatbot)
  22. AIChatbot (preview/confirm UI)

Phase 6 — MCP Chatbot
  23. MCP server setup (mcpServer.ts)
  24. All 6 MCP tools
  25. Wire AIChatbot to MCP server
  26. External AI provider integration + tool-calling verification

Phase 7 — Learning Loop
  27. Accept/reject feedback capture
  28. fine_tuner.py (personalize base model per user)
  29. Measure prediction accuracy improvement over time

Phase 8 — Testing + Deploy
  30. pytest automation tests (ml/ and grammar/)
  31. Jest + Supertest API tests (server/)
  32. Deploy: Vercel + DigitalOcean + Azure + Supabase
```

---

## Research Context

This is a capstone research system. Every feature maps to a research question:

| Research Question | Feature | Measurement |
|---|---|---|
| RQ1: ML prediction accuracy | Formatting prediction | Accept/reject logs |
| RQ2: Formatting time reduction | Full editor + automation | Session timing |
| RQ3: User perception of AI | Chatbot + suggestion UI | Survey/interview |
| RQ4: Non-intrusive UI patterns | DiffPreview + ConfirmBar | UX observation |
| RQ5: Minimum data for prediction | Feedback loop | Early session data |

The diff preview + confirm/reject pattern is the primary data collection
mechanism for RQ1, RQ2, and RQ4 simultaneously.

IntelliDocs does NOT aim to replace Microsoft Word or Google Docs.
It addresses a specific gap: no existing editor learns individual
formatting behavior and predicts it automatically.

---

## Important Reminders

- Grammar checking is now a required feature (dean requirement)
- Editor is TipTap — prefer TipTap/community extensions before hand-rolling editor features
- ML must be pre-trained on a real dataset before user fine-tuning
- MVC is strictly enforced — panel will check this
- Supabase free tier pauses after 1 week of inactivity
- Arcjet is entry-level protection only; keep it scoped to the routes that need it
- Redis now serves both behavior-pipeline and app-layer AI responsibilities
- Zod belongs at external boundaries, not internal TypeScript calls
- sync-ai script: cp AGENTS.md .github/copilot-instructions.md
- Generated ML data should stay local unless explicitly needed: `ml/dataset/raw/`, `ml/dataset/processed/`, `ml/models/*.pkl`
- Keep provider-specific logic isolated inside `server/src/ai/aiClient.ts`
- **Body-text consistency (suggestions):** `lib/bodyConsistency.ts` flags prose (>=80 chars, after the first chapter heading, outside lists/tables) whose bold/italic/size/alignment differs from the body norm, only when >=80% of prose shares one look. Accepting reproduces the norm, including removing a stray bold/italic. A body that is mixed throughout (e.g. the heavy sabotage fixture) gets no verdict. Measure with `tests/e2e/tools/suggestion_fidelity.py` (needs vite on 5183).
- **Document-type offer:** `Document.tsx` calls `formatting/infer-structure` on a preset-less document with 200+ characters and shows `DocumentTypePrompt` once per document. Accepting sets only `formatting_preset` (suggestions use its blueprint); page geometry is never changed. The converter already resolves Normal-style sizes into inline styles, and fixtures show Normal says nothing about alignment (body is justified by direct formatting), so a Normal-style anchor was not added.
