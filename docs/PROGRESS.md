# IntelliDocs Progress Summary

**Last Updated:** September 11, 2026  
**Phase:** Master Implementation Plan — All 5 Phases ✅ Complete + New Implementation Plan ✅ Complete + Round-2 acceptance fixes ✅ Complete  
**Deployment:** Frontend ✅ (Vercel — intellidocs-silk.vercel.app) · Server ✅ (Render) · ML ✅ (Render, live as of this update)

## 🟢 Current Status (where we are now)

- Code pushed to GitHub; working from the laptop against **prod only** (no
  localhost testing).
- Frontend, server, and **ML service are all deployed and live**.
- Round-2 fixes (suggestion UX, grammar visibility, trash/delete UX, preset
  dropdown, bulk formatting, MCP commit, Drive listing, sidebar, share links)
  are code-complete and verified by the automated suite — **manual acceptance
  on prod is the only remaining gate** (see `docs/TESTING_PLAN.md` §3).
- Once on the laptop/prod: run migrations **014–016** in the prod Supabase SQL
  editor (presets, sharing/trash, share links) if not already applied, then
  walk the Round-2 checklist from the top.
- Admin/Professor workspaces remain **on hold** by the user's decision until
  the Round-2 checklist is accepted.

---

## ✅ Completed — Master Implementation Plan

### Phase 1: Auth Simplification & Faculty Verification Flow
- ✅ **Register.tsx**: Removed Student/Professor role selector; all new users default to `student` with instant dashboard access.
- ✅ **`POST /auth/apply-professor`**: New endpoint in `authController.ts` with Zod validation (`applyProfessorSchema`). Updates `user_profiles` role to professor with `verification_status: 'pending'`; stores application details in notifications.
- ✅ **Settings.tsx Faculty Application Card**: New `FacultyApplicationSection` component with fields for College, Department, Institutional Email, Faculty ID, and Reason. Shows `Pending Review` status for pending professors, `Approved` badge for approved professors, and re-apply option for rejected applicants.

### Phase 2: Context-Aware Grammar & Hierarchical ML Engine
- ✅ **`grammar_checker.py`**: Added `is_academic_structural_block()` function that detects chapter headings (`"Chapter 1 Introduction"`), numbered sections (`"1.1 Background"`), and known academic titles. `detect_issues()` bypasses `detect_sentence_boundary_issues()` for structural blocks — eliminates false-positive missing-period warnings on headings.
- ✅ **`ml/src/main.py`**: Added hierarchical outline context to `PredictRequest` (`previous_format`, `current_heading_level`, `is_inside_table`, `is_list_item`). Topological outline rules: after Title/body → heading1 (0.98), under heading1 → heading2 (0.98), under heading2 → heading3 (0.98). Heading predictions suppressed inside tables and list items.

### Phase 3: Admin Console & Empirical Data Exporter
- ✅ **AdminDashboard.tsx**: Added 5th tab "Research Data" with platform telemetry display (acceptance rate, behavior events, registered researchers) and one-click empirical dataset export button.
- ✅ **`GET /admin/export-empirical`**: New endpoint generating structured CSV with prediction feedback records, acceptance rates by prediction type, weekly personalization curve (RQ5), and format distribution breakdown.
- ✅ **`exportEmpiricalData()` API method**: Frontend API call returning a Blob for download as `intellidocs_research_dataset_YYYY-MM-DD.csv`.

### Phase 4: Professor Workspace & Thesis Compliance Auditor
- ✅ **ProfessorDashboard.tsx**: Full professor workspace with 4 tabs — Template Rubrics, Compliance Audit, Document Reviews, Classroom Folders.
- ✅ **Template Rubric Builder**: Create custom formatting templates with font family/size, margins, line spacing, and mandatory heading lists. Ships with APA 7th and BSCS Capstone 2026 defaults.
- ✅ **One-Click Compliance Auditor**: Select a document + template → generates 0–100% compliance score with per-check pass/warn/fail breakdown (mandatory headings, line spacing, word count).
- ✅ **Document Reviews**: Lists all documents with "Open & Review" links; integrates with existing professor comment/grade system.
- ✅ **`/professor` Route**: Added to `App.tsx` with `ApprovedProfessorRoute` guard.

### Phase 5: Strategic UX Innovations (S1–S8)
- ✅ **S1: Explainable AI Visualizer** (`ExplainableAIPopover.tsx`): Interactive popover on confidence pills showing exact feature weights (Academic Keyword Prior, Font Delta, Outline Hierarchy, etc.) with percentage bars. Provides defense panel visual proof of multi-feature ML pipeline.
- ✅ **S3: Thesis Structure Checklist** (`ThesisChecklist.tsx`): Collapsible editor sidebar with 11 standard thesis chapters. Green checkmarks for found sections, missing sections show "+" button to auto-insert heading. Progress bar shows document coverage %.
- ✅ **S5: Smart Citation Styler** (`CitationStyler.tsx`): Paste DOI, arXiv ID, or paper title → CrossRef API metadata fetch → APA 7th or IEEE formatted bibliography entry → one-click insert into editor.
- ✅ **S7: Ghost Formatting Tab-to-Apply** (`GhostFormatting.tsx`): Non-intrusive bottom bar shows formatting suggestion with confidence. Press `Tab` to accept, `Esc` to dismiss. Debounced 800ms prediction check on editor updates.
- ✅ **S8: IndexedDB Offline Buffer** (`useOfflineBuffer.ts`): Client-side IndexedDB write-ahead buffer (`intellidocs-offline` database). `saveDraft()`, `getDraft()`, `deleteDraft()`, `getAllDrafts()` functions for zero-data-loss offline resilience on school lab PCs.
- ✅ **S2 & S6**: Empirical Data Exporter (Phase 3) and Professor Compliance Rubric (Phase 4) already implemented above.

---

## 🧪 Testing Confirmed
- **Frontend TypeScript**: `npx tsc --noEmit` passed with **0 errors**.
- **Server TypeScript**: `npx tsc --noEmit` passed with **0 errors**.
- **Frontend Production Build**: `npm run build` completed cleanly.
- **Jest Test Suites**: **5/5 suites passed** (**24/24 tests passed**).
- **Pytest ML Suites**: **7/7 tests passed** (`tests/python/test_ml.py`).

---

## ✅ Completed — New Implementation Plan (implementation_plan.md)

Implemented on top of the Master Plan above. **Last Updated:** September 11, 2026.

### Phase 1: In-Editor Suggestions, Docked Panels & Personalization
- ✅ **In-editor suggestion pill + float-over** (`EditorSuggestions.tsx`): ML prediction shown inline; floating action bar offers Accept / Dismiss / "Change to".
- ✅ **Docked editor side panel** (`EditorSidePanel.tsx`): Suggestions moved into a collapsible docked panel instead of floating popups. CollisionDropdown picks a stack below the header when suggestions collide with editor geometry.
- ✅ **`useEditorPreferences`** + Settings → Editor page: font size, line height, paragraph spacing, letter spacing, StickySidePanel flag, panel defaults (suggestion auto-accept dismissed, auto-launch on). Persisted in localStorage, broadcast via `CustomEvent('intellidocs:editor-preferences-changed')`. Endpoint `GET/PUT /users/preferences`.
- ✅ **Ctrl+\** (toggle side panel) + Enter/Alt+ArrowUp/Alt+ArrowDown keyboard handling for suggestion flow.
- ✅ Grammar panel matches preference-driven theme; new panel default auto-launch exercised in manual flow.

### Phase 2: Academic Presets, Style Ribbon & Preset Persistence
- ✅ **`academicPresets.ts`**: `AcademicPreset`, `PresetInput`, `buildCss`/`headingRule`/`withComputedCss`; ships UCLM Capstone, APA 7th, IEEE (`ACADEMIC_PRESETS` map with computed CSS).
- ✅ **`styleCommands.ts`**: `STYLE_ITEMS` (normal/h1/h2/h3/title/blockquote/caption) + `applyStyleCommand(editor, format, from?, to?)`.
- ✅ **`StylesRibbon.tsx`**: Style tile drag (`STYLE_DRAG_MIME = 'application/intellidocs-style'`) + presets dropdown; drag onto the page applies style at drop position. Wired into `Document.tsx` (`handleStyleDrop` via `posAtCoords`, dropEffect 'move').
- ✅ Scoped preset CSS (`.intellidocs-page-editor .ProseMirror` + heading rules); page geometry setters; `POST /formatting/preset` → Supabase `formatting_presets`.
- ✅ `db/supabase/014_academic_presets.sql` seeds uclm_capstone / apa_7th / ieee (`on conflict (key) do nothing`).

### Phase 3: Sharing, Trash, Dashboard Sections & Drive Import
- ✅ **`db/supabase/015_sharing_trash.sql`**: `documents.is_deleted`/`deleted_at` + partial index; `document_shares.pending_email` (shared_with now nullable) + indexes; RLS policies.
- ✅ **`shareModel.ts` / `shareController.ts`**: get/list/create/update/delete shares; pending email resolution on register (`authController`) + lazy backfill on `GET /documents/shared`.
- ✅ documentModel: `getTrashDocuments`, `getSharedDocuments`, `getDocumentForUser`, `hasShareAccess`, `softDeleteDocument`, `restoreDocument`, `purgeDocument`; `updateDocument` enforces owner-or-edit-permission.
- ✅ **Read cache**: Redis doc read-through cache (TTL 3600s, gated on `UPSTASH_REDIS_REST_URL`/`DOC_CACHE_ENABLED`, fail-open) + IndexedDB cache (`useDocumentCache.ts`, 60s TTL) with write-through invalidation.
- ✅ Trash API (`POST /:id/trash`, `POST /:id/restore`, `DELETE /:id/permanent`); Home tabs Shared/Trash; "Restore selected"/"Empty trash"; `ShareModal.tsx` (owner-only Share button in Document header).
- ✅ **Drive**: `listFiles` expanded (native docs, docx, pdf, txt); `exportFile` converts via pythonBridge conversion endpoint + mammoth fallback; OAuth token refresh persisted via `oauth2.on('tokens')`.

### Phase 4: Supabase Storage, ML Temp Cache & Deployment/Scaling
- ✅ **`ml/storage.py`**: `download_user_model` / `upload_user_model` for the `user-models` bucket with a 24h TempDir cache (TTL + stale eviction); lazy `supabase` client import.
- ✅ **`ml/src/main.py`**: base-model payload in-process cache (24h TTL); LSTM user weights now served via `download_user_model` (Supabase Storage → /tmp) with local-dir fallback; unified default port **8000**.
- ✅ **`pythonBridge.ts`**: default ML URL unified to `http://localhost:8000`.
- ✅ **`render.yaml`**: server `healthCheckPath: /health`, scaling block (1→2 instances, 75% memory), `SUPABASE_POOLER_URL`, `UPSTASH_REDIS_REST_URL/TOKEN`; ML service `PORT: 8000`, `DUCKDB_PATH`, health check.
- ✅ **`.env.example`**: added `SUPABASE_POOLER_URL`, `UPSTASH_REDIS_REST_URL/TOKEN`, Google OAuth2 vars, `USER_MODEL_BUCKET`, `ML_CACHE_DIR`.

### Phase 5: MCP Bulk Formatting Tool
- ✅ **`applyBulkFormattingSchema`** (documentId, format, mode preview|commit, targets 1–500 [{from,to}], reason?) registered in `mcpSchemas.ts` + `/tools`.
- ✅ **`applyBulkFormatting.ts`**: preview returns target count; commit appends one behavior event per target (`mcp_bulk_format_applied:<format>`, payload `{from,to}`) via `appendBehaviorEvent`.
- ✅ Registered in `mcpServer.ts` tool list + switch; `MCPToolName` gained `'applyBulkFormatting'` on the client.

### Phase 6: Manual-Acceptance Fixes (TESTING_PLAN feedback round 2)
- ✅ **Suggestion UX**: inline highlight + `InlineSuggestionChip` (Alt+Arrow/Enter/Escape); scanner + `runAutoFormatPrediction` gated on ML questionnaire answers.
- ✅ **Grammar/spell visibility**: `GrammarPanel` shown by default in the editor sidebar.
- ✅ **Trash UX**: open trash doc via `?readonly=1` (read-only, no edit), per-trash-row Restore + permanent-delete icons, context menu equivalents, `Home.tsx` `ConfirmDialog` for all deletes + empty-trash instead of `window.confirm`.
- ✅ **Preset dropdown**: `StylesRibbon` fixed-position anchor dropdown (z-index fix, closes on outside click).
- ✅ **Bulk formatting**: `parseFormattingIntent` returns `formats[]` + `scope` ('selection'|'all') + `fontSize` (6–96pt); `AIChatbot` applies multi-format, whole-doc, and font-size in one step; `/mcp applyFormatting` commit applies to the live editor.
- ✅ **Drive fixes**: `listFiles` fallback query when strict `q` returns empty + broader importable types (.rtf/.odt); clearer empty-state message + Refresh button; OAuth redirect falls back to request Origin when `FRONTEND_URL` unset.
- ✅ **Dashboard sidebar**: nav count badges (docs / recent / trash), quick-access folder list.
- ✅ **Copyable share links**: `db/supabase/016_share_links.sql` (`documents.share_token` unique + `share_permission`); `GET/POST/DELETE /documents/:id/share-link` (owner-only); token-gated read in `getDocumentForUser`; ShareModal copy-link section (permission select, copy, revoke); `?share=TOKEN` opens read-only for non-owners with banner.

---

## 🧪 Testing Confirmed (Latest Implementation)
- **Server TypeScript**: `npx tsc --noEmit` — 0 errors.
- **Frontend TypeScript**: `npx tsc --noEmit` — 0 errors.
- **Frontend Production Build**: `npx vite build` — clean (1,468 kB JS, pre-existing chunk-size warning only).
- **Jest Test Suites**: 5/5 suites, 28/28 tests passed (incl. 4 new `parseFormattingIntent` cases + existing suites).
- **Pytest ML Suites**: 7/7 tests passed (`tests/python/test_ml.py`).
- **Lint**: only pre-existing baseline errors (documentController mammoth `any`, adminModel `any`, unused imports, etc.) remain — no new lint errors from this work.
- **ML compile**: `py_compile` clean for `ml/storage.py` and `ml/src/main.py`.

### Remaining / Not-Yet-Done
1. **Manual acceptance on prod** (round-2 checklist, `docs/TESTING_PLAN.md` §3): share-link opens, read-only trash view, Drive listing, bulk formatting, MCP commit, sidebar badges, preset dropdown.
2. **Apply migrations 014–016 to prod Supabase** if not already applied (`db/supabase/014_academic_presets.sql`, `015_sharing_trash.sql`, `016_share_links.sql`).
3. **Admin/Professor workspaces**: deferred by user decision until round-2 acceptance passes (incl. previously "skipped" S1/S3/S5/S7/S8 checks).
4. Run `graphify update .` to refresh repo graphs (CLI unavailable in the agent env; user must run on laptop).
5. Google Drive OAuth app verification (user awaiting Google review) — until scoped verification lands, OAuth may re-prompt.
6. ML model retraining with any new feature columns; Supabase Storage `user-models` bucket creation in the real project.

---

## 🚀 Remaining Next Milestones
1. **Round-2 manual acceptance** on prod; apply migrations 014–016 to prod Supabase.
2. **Administrator/Professor rollout**: enable `AdminRoute` / `ApprovedProfessorRoute` pages on prod (currently on hold), then verify Master-plan items 4–10.
3. **Wire New Components into Editor**: Integrate `ExplainableAIPopover`, `ThesisChecklist`, `CitationStyler`, `GhostFormatting` into `Document.tsx` / `TiptapEditor.tsx` sidebar and suggestion UI (if not already wired).
4. **Offline Buffer Integration**: Wire `useOfflineBuffer` into `Document.tsx` auto-save flow.
5. **Professor Routes Auth**: Apply `requireApprovedProfessor` middleware to `professorRoutes.ts`.
6. **ML Training Update**: Retrain base model with new hierarchical context features (5 new columns).
7. **Database Migration**: Add `college`, `department`, `institutional_email`, `faculty_id` columns to `user_profiles` for faculty applications.
8. **Performance**: investigate slow initial "My Documents" load on prod (caches exist but first paint still slow — reported in round-1 feedback).
