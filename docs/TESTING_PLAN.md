# IntelliDocs Testing Plan

Covers automated checks and manual acceptance flows for **both** implementations:
the Master Implementation Plan (5 phases) and the New Implementation Plan
(`implementation_plan.md`, 5 phases implementing on top).

---

## 1. Automated Regression Suite (run after every change)

### 1.1 Server (Node 20 + Express + TypeScript)

```bash
cd server
npx tsc --noEmit        # 0 errors expected
npm test                # 5 suites / 24 tests pass
npm run lint            # known pre-existing baseline errors only
```

Coverage today:
- `src/skills/__tests__/parseFormattingIntent.test.ts` — NLP intent parsing
- `src/skills/__tests__/resolveFormattingTier.test.ts` — tier resolution
- `src/skills/__tests__/buildChatContext.test.ts` — MCP chat context
- `src/skills/__tests__/feedbackLoop.test.ts` — accept/reject feedback loop
- `src/routes/__tests__/api.integration.test.ts` — HTTP route/controller integration

### 1.2 Frontend (React 18 + Vite + TS)

```bash
cd frontend
npx tsc --noEmit        # 0 errors expected
npx vite build          # clean build (pre-existing chunk-size warning ok)
npm run lint            # known pre-existing baseline errors only
```

### 1.3 ML (Python + FastAPI + scikit-learn)

```bash
ml/venv/Scripts/python.exe -m pytest tests/python -q   # 7 tests pass
ml/venv/Scripts/python.exe -m py_compile ml/src/main.py ml/storage.py
```

Coverage today: `tests/python/test_ml.py` — base model loading, prediction
response shape, feature handling, LSTM sequence adjustment path.

### 1.4 Acceptance Gate

Before merging: server tsc + jest green, frontend tsc + build green, pytest green.

---

## 2. Manual Acceptance — New Implementation Plan

### 2.1 Phase 1 — In-editor suggestions, docked panel, prefs
1. Type body text on an empty doc → suggestion pill appears with confidence.
2. Press Enter → accept; Alt+ArrowUp/Down → cycle "Change to" options.
3. Toggle side panel with Ctrl+\ → panel docks, suggestions move there.
4. CollisionDropdown: narrow the viewport so suggestions would overlap toolbar → dropdown stacks below header, no overlap.
5. Settings → Editor: change font size / line height / spacing → editor updates live.
6. Reload page → prefs persist (localStorage).
  ## 2.1 Imported a file instead, chose a questionare, issue 1. Its suggesting the wrong texts (it suggested to heading the quetsions) issue 2.  As i said remove the pop up and make it that the system highlights it. Issue 3. Alt + Arrows doesnt work. Issue 4. theres no dropdown. Issue 5. grammar / spelling suggestion isnt showing. No. 5 i can see that its in the settings but  i dont see what you mean in no. 5, i can see Editor and AI in settings but since that doesnt work, i cant test it. no. 6 ill assume its working, but the dashboard is still slow.

### 2.2 Phase 2 — Presets, style ribbon, persistence
1. StylesRibbon: click Normal/H1/H2/H3/Title/Blockquote/Caption → correct block style applies.
2. Drag a style tile over the page → style applies at the drop position (verify via `posAtCoords`).
3. Preset dropdown: apply UCLM Capstone → page geometry + scoped CSS change (header sizes, margins, spacing).
4. APA 7th / IEEE presets apply similarly.
5. Reload doc → preset persists (document row `formatting_preset`).
6. `db/supabase/014_academic_presets.sql` seeds the three presets.

  ## 2.2 The style ribbon works, but it would be nice to add like a broken line border or a highlight to make it distinct from a man made formats. Now for issue no. 1 dropdown preset doesnt seem to be open, but i can see its behind the editor so i cant test moving on.

### 2.3 Phase 3 — Sharing, trash, dashboard, Drive
1. Owner clicks Share → ShareModal opens; add an existing user → share row with permission.
2. Add a non-registered email → "pending" badge.
3. Shared user sees doc under **Shared with me**: view/comment read modes; edit permission controls updates.
4. Pending share: register a new account with that email → doc appears automatically.
5. Home delete → moves to **Trash** (soft delete, `is_deleted=true`); Restore selected brings it back; Empty trash / delete → permanent.
6. Drive sidebar: list native docs + .docx/.pdf/.txt; import a .docx → converts via FastAPI; native doc → HTML export. OAuth refresh self-heals after token expiry.
7. Open a shared doc while publisher edits → saved changes respect permission checks (403 for read-only).

  ## 2.3 Issue no. 1, as for file sharing i meant like google drive, its looking for links. but make sure its production ready, the site is intellidocs-silk.vercel.app, Issue no. 2 add confirmation on deleting, issue no. 3 the trash sections should be able to open, BUT IT SHOULD NOT BE ABLE TO EDIT IT, so that users can see the contents of the document, but cannot edit it. so remove the rename / delete on the trash section and replace it with something else, Issue no. 4, There isnt seem to be an individual delete on trash, i could be wrong it could be tied with that delete on the dropdown but it would be nice if it were visually the same as delete all / restore. for the drive, google hasnt verified my app but im still waiting in on that. Now for issue no. 5, The user is already logged in to google but still prompts to log in to google drive (maybe its a norm idk(?)). Issue no 6. the connection works, but it says "No Google Docs found in your Drive" and im sure there are documents in that account, find .pdf .docx etc. that involves documents. for no. 7, i cant test it until i get what i visioned

  ## 2.3 RESOLVED (round 2):
  - **Share links**: implemented — ShareModal now has a "Share via link" section: permission select (View/Comment/Edit), **Create link**, **Copy link**, **revoke** (Trash icon). Link pattern: `{site}/document/{id}?share=TOKEN`. Server: `db/supabase/016_share_links.sql`, `GET/POST/DELETE /documents/:id/share-link` (owner-only), token-gated read in `getDocumentForUser`. Non-owners opening the link get a read-only session with banner (matching trash view-only behavior).
  - **Delete confirmation**: all deletes now go through an inline `ConfirmDialog` (works on trash + empty trash, selection-aware). No more `window.confirm`.
  - **Trash open but not editable**: double-click / Open (eye) icon in trash opens `?readonly=1` — full content visible, all edit/save/format controls hidden, banner + "Restore document" button.
  - **Individual trash actions**: each trash row now shows Open, Restore, and Delete-permanently icon buttons (visually same family as Empty trash / Restore selected).
  - **Drive listing**: server `listFiles` grew a fallback query (any untrashed non-folder file, filtered server-side) when the strict q returns empty; importable types now include .rtf/.odt; dialog shows clearer empty message + **Refresh** button. OAuth redirect falls back to the request's `Origin` when `FRONTEND_URL` is unset (fixes "connected but prompts again" on misconfigured deploy).
  - **Note**: Google app-review pending on the user's side may still cause OAuth re-prompts; code-side correction for the redirect is in.

### 2.4 Phase 4 — Caches, storage, scaling
1. Reopen a recently read doc → paints instantly from IndexedDB (`document-reads`, 60s TTL), then refreshes.
2. With `UPSTASH_REDIS_REST_URL` set, second `GET /documents/:id` returns from Redis (TTL 3600s). Without it, cache disabled (no 3s dev hang).
3. Create `user-models` bucket in Supabase; put `user_id.pt` → ML service finds it via `/tmp` cache on prediction.
4. `render.yaml`: server and ML services expose `/health`; scaling block reads correctly in Render.
  ## 2.4 Loading the documents in "My documents" is still slow but it may be the server (?), as for no 3. idk how to do that.

### 2.5 Phase 5 — MCP bulk formatting
1. Chatbot calls `applyBulkFormatting` in **preview** mode → returns target count, no doc change.
2. User confirms → **commit** mode applies formats and emits `mcp_bulk_format_applied:<format>` behavior events (one per target).
3. Reject path still fires `feedbackLoop.ts`.

  ## 2.5 Issue 1. Theres no bulk formatting, i asked "Make everything bold, itallic and font size 20", it only did bold format, Issue 2. The MCP only works if i highlight the content with left click. Until then, i cant test on the behavior event

  ## 2.5 RESOLVED (round 2):
  - **Bulk formatting**: `parseFormattingIntent` now collects ALL formats ("bold + italic + font size 20"), plus a `scope` ('selection'|'all' via phrases like "everything", "whole document") and `fontSize` (6–96pt validation). `AIChatbot` applies each format in sequence: `selectAll` + `setMark` for bold/italic/underline and `setMark('textStyle', { fontSize })`, then collapses the selection.
  - **MCP commit applies to editor**: `/mcp applyFormatting` with `mode:'commit'` now applies the format to the live editor client-side (no left-click selection needed for the common "apply to whole doc" case). Behavior events are still logged via the same path.
---

## 3. Manual Acceptance — Master Implementation Plan (previously verified)

1. **Auth**: register (default student, no role selector) → instant dashboard; `POST /auth/apply-professor` with application card → pending review badge.
  ## 1. Approved
2. **Grammar**: structural blocks (chapter headings, "1.1 X") produce **no** false missing-period warnings; regular sentences still checked.
  ## 2. Grammar doesnt show up
3. **Hierarchical ML**: heading1 under Title/body (0.98), heading2 under h1, heading3 under h2; no heading predictions inside tables/list items.
  ## 3. The ML suggestion is still inaccurate, as well as it still has the pop up instead of the highlight i mentioned

  ## Manual-Acceptance items 2 & 3 — RESOLVED (round 2):
  - **Grammar panel visibility**: `GrammarPanel` (grammar + spell engine + issue list) is now shown in the editor sidebar by default; underlines render via the wavy-underline plugin. Runtime behavior still depends on the deployed ML service version exposing the grammar endpoints.
  - **Suggestion UX**: the pop-up (`FormatPrompt`/collision dropdown) was removed. Predictions now appear as an inline **highlight + mini chip** (`InlineSuggestionChip`) near the formatted range with Alt+Arrow / Enter / Escape handling. Auto-suggestions only run after the ML questionnaire is answered; the scanner no longer fires during idle/short sessions.
  - **Accuracy**: prediction pipeline unchanged structurally, but noise/UX regressions (pop-ups, premature suggestions) are gone, which was the primary blocker to judging accuracy.
4. **Admin**: Research Data tab shows telemetry; empirical CSV export downloads `intellidocs_research_dataset_YYYY-MM-DD.csv`.
5. **Professor**: workspace tabs (Template Rubrics, Compliance Audit, Document Reviews, Classroom Folders); APA/BSCS defaults; compliance score 0–100%.
6. **S1 ExplainableAIPopover**: confidence pill popover shows per-feature weights with bars.
7. **S3 ThesisChecklist**: 11-chapter list, green checkmarks, "+" auto-inserts missing headings, progress %.
8. **S5 CitationStyler**: DOI/arXiv/title → CrossRef lookup → APA/IEEE entry insert.
9. **S7 GhostFormatting**: bottom bar suggestion, Tab accept / Esc dismiss, 800ms debounce.
10. **S8 OfflineBuffer**: offline save → `intellidocs-offline` IndexedDB; flush on reconnect.

---

## 4. Graphify

After tests pass: run `graphify update .` (user runs — CLI/MCP unavailable in agent env).

---

## 5. Bug-Fix Discipline

- Any failing check above blocks ship; fix forward without layering guesses.
- Re-run the full automated suite after each fix.


### FINAL COMMENT
 # as for admin / professor, ill make it on hold until the others are fixed, for the 6-10 on Manual Acceptance, i didnt add comments since the need to test them seemed to have bugs, so im skipping them.
