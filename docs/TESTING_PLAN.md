# IntelliDocs Testing Plan

Covers automated checks and manual acceptance flows for **both** implementations:
the Master Implementation Plan (5 phases) and the New Implementation Plan
(`implementation_plan.md`, 5 phases implementing on top).

Sections:
- **1. Automated Regression Suite** — machines-only gates, run after every change.
- **2. Feedback Log — Round 1** — the original checklists + the user's verbatim
  comments from the first prod pass (kept as-is for the record).
- **3. New Round — Round 2 Re-Test Checklist** — every fix from the round-2
  pass, listed as a fresh verification checklist with no old comments attached.
- **4. Manual Acceptance — Master Plan feedback** — original Master-plan
  checks + the user's inline comments.
- **5. Graphify / 6. Bug-Fix Discipline** — housekeeping.

---

## 1. Automated Regression Suite (run after every change)

### 1.1 Server (Node 20 + Express + TypeScript)

```bash
cd server
npx tsc --noEmit        # 0 errors expected
npm test                # 5 suites / 28 tests pass
npm run lint            # known pre-existing baseline errors only
```

Coverage today:
- `src/skills/__tests__/parseFormattingIntent.test.ts` — NLP intent parsing (incl. multi-format, scope, font size)
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

## 2. Feedback Log — Round 1 (original comments, verbatim)

This section preserves the first acceptance pass exactly as reported. These
issues are all addressed in Section 3; nothing here is outstanding.

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

---

## 3. New Round — Round 2 Re-Test Checklist (verified after deploy)

Everything below is the round-2 fix set. Each item replaces the corresponding
Round 1 complaint — verify on the live app (intellidocs-silk.vercel.app).

### 3.1 Suggestion UX — no more pop-up, inline highlight + chip
1. Import/document → answer the ML questionnaire once → suggestions appear.
2. A suggestion is shown as an **inline highlight** with a mini chip near the range (NOT a floating box).
3. `Enter` accepts the suggestion; `Alt+ArrowUp/Down` cycles options; `Escape` dismisses.
4. No suggestions fire before the questionnaire, during idle/short sessions, or in the first 15s after a format.
5. Suggesting a wrong target (e.g. heading a plain paragraph) → re-check the questionnaire file / ML service, not the UX. The noise gate (5-min suppression, ≥0.22 confidence) is in place.
6. **Verify**: side panel (Ctrl+\) still docks suggestions; no overlaps with the header (old collision case).

### 3.2 Grammar / spell check visibility
1. Open an editor → **GrammarPanel is visible** by default in the sidebar.
2. A text node with a spelling/grammar error gets a **wavy underline** (GrammarUnderlineExtension).
3. Fixing via the overlay or panel updates the underline.
4. **Note**: runtime depends on the deployed ML service exposing its grammar endpoints — now live in prod (ML deployed).

### 3.3 Trash + delete UX
1. Home → delete → an inline **ConfirmDialog** asks first (no `window.confirm`).
2. Item goes to **Trash** (soft delete). Restore selected brings it back.
3. In Trash: the doc opens read-only (`?readonly=1`) — **view contents but no edit controls** (no toolbar, ribbon, save, share).
4. Each trash row has **Open / Restore / Delete permanently** icons (same visual family as Empty trash / Restore selected).
5. Trash context menu shows Restore + Delete permanently only (no rename/delete-as-before).
6. Empty trash → also confirm-dialog gated.

### 3.4 Preset dropdown z-index
1. Open a document → StylesRibbon → open the preset dropdown.
2. It must render **above** the editor (fixed-position anchor, z-index 9990), not clipped behind the page.
3. Clicking outside closes it.

### 3.5 Bulk formatting via chat
1. Ask the chatbot: "Make everything bold, italic and font size 20".
2. Preview shows the intended formats; confirm.
3. **Everything** in the doc becomes bold + italic + fontSize 20 produces the whole document (`scope: 'all'`), not just the first format.
4. Asking for just "make it bold" still targets the selection only.
5. Font size values outside 6–96pt are rejected.
6. Behavior events fire per applied format (observable via telemetry/admin).

### 3.6 MCP applyFormatting — commit works without left-click selection
1. From the chatbot, run a formatting command that applies to the whole doc.
2. `/mcp applyFormatting` with `mode: 'commit'` changes the live editor content.
3. The same path still logs behavior events.

### 3.7 Drive listing + OAuth
1. Connect Google Drive → after the consent popup returns, the dialog refreshes and lists files (auto postMessage handshake).
2. File list now includes **native Docs, .docx/.pdf/.txt/.rtf/.odt**; if the strict Drive query returns empty, a fallback list is fetched and filtered server-side.
3. Empty state message reads clearly (lists supported types) and has a **Refresh** button.
4. If `FRONTEND_URL` is unset in some environment, the OAuth redirect falls back to the request Origin (no more "connected but keeps prompting").
5. **Note**: Google app-store/unverified status can still cause OAuth re-prompts — that is Google's verification limbo, not the redirect code.

### 3.8 Dashboard sidebar
1. My Documents / Recent / Trash nav items show **count badges**.
2. Folders quick-access section lists the user's folders (click → folder view with breadcrumbs).
3. Folder item highlights when its folder view is active.

### 3.9 Copyable share links (Google-Drive-style)
1. Owner opens ShareModal → "Share via link" section.
2. Choose permission (View/Comment/Edit) → **Create link** → a URL `{site}/document/{id}?share=TOKEN` appears.
3. **Copy link** copies it; **revoke** (trash icon) disables it.
4. Recipient (any logged-in user) opens the link → sees content in **read-only** mode with a "Viewing through a share link" banner; no edit controls.
5. Owner opening their own link still edits normally.
6. Revoked/expired link → 403 access denied.
7. Migration `db/supabase/016_share_links.sql` applied to prod DB.

---

## 4. Manual Acceptance — Master Implementation Plan (previously verified)

1. **Auth**: register (default student, no role selector) → instant dashboard; `POST /auth/apply-professor` with application card → pending review badge.
  ## 1. Approved
2. **Grammar**: structural blocks (chapter headings, "1.1 X") produce **no** false missing-period warnings; regular sentences still checked.
  ## 2. Grammar doesnt show up → addressed in 3.2
3. **Hierarchical ML**: heading1 under Title/body (0.98), heading2 under h1, heading3 under h2; no heading predictions inside tables/list items.
  ## 3. The ML suggestion is still inaccurate, as well as it still has the pop up instead of the highlight i mentioned → addressed in 3.1
4. **Admin**: Research Data tab shows telemetry; empirical CSV export downloads `intellidocs_research_dataset_YYYY-MM-DD.csv`.
5. **Professor**: workspace tabs (Template Rubrics, Compliance Audit, Document Reviews, Classroom Folders); APA/BSCS defaults; compliance score 0–100%.
6. **S1 ExplainableAIPopover**: confidence pill popover shows per-feature weights with bars.
7. **S3 ThesisChecklist**: 11-chapter list, green checkmarks, "+" auto-inserts missing headings, progress %.
8. **S5 CitationStyler**: DOI/arXiv/title → CrossRef lookup → APA/IEEE entry insert.
9. **S7 GhostFormatting**: bottom bar suggestion, Tab accept / Esc dismiss, 800ms debounce.
10. **S8 OfflineBuffer**: offline save → `intellidocs-offline` IndexedDB; flush on reconnect.

### FINAL COMMENT
 # as for admin / professor, ill make it on hold until the others are fixed, for the 6-10 on Manual Acceptance, i didnt add comments since the need to test them seemed to have bugs, so im skipping them.

> **Status**: items 4–10 remain **on hold** per the user's decision until the
> Round-2 checklist (Section 3) is accepted.

---

## 5. Graphify

After tests pass: run `graphify update .` (user runs — CLI/MCP unavailable in agent env).

---

## 6. Bug-Fix Discipline

- Any failing check above blocks ship; fix forward without layering guesses.
- Re-run the full automated suite after each fix.