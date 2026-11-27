# IntelliDocs — Verification Results

**Last updated:** 2026-10-15 (previous run: 2026-10-13)
**Branch:** `freebuff-calibration` @ `3cafd842`
**Services:** started for this run, then **stopped** — all three ports (3000 / 5173 / 8001) are free and refuse connections.
**Verdict:** `PASS WITH 2 MASKED SUB-CHECKS` — the master runner reports 100% and exits 0, but two sub-checks inside its "PASS" suites actually failed. Both are **test-side** issues (timing budget / selection-gated automation), not application defects. **0 real application defects found.**

> Supersedes the 2026-10-13 run on every measured number. The 2026-10-13 raw UI/UX measurements
> are still valid and remain open — see §7. Raw data: `Temp/ui_audit/audit_v2_summary.json`.

---

## 1. Environment

| Item | Value |
|---|---|
| Project root | `/c/Users/asus/Desktop/Prog proj/intellidocs` (matches the runner's hard-coded `ROOT_DIR`) |
| Node / Python | v22.20.0 / Python 3.14.2 (`ml/venv/Scripts/python.exe`) |
| AI provider | `AI_PROVIDER=nvidia`, `AI_MODEL=meta/llama-3.2-11b-vision-instruct` — the handoff's required `.env` change is already applied |
| Test account / doc | `test@test.com` / `asd123`, doc `a3c5c8ac-29c6-4f9a-a996-884ba169f81d` |
| Run duration | master 158.97s · e2e 618.70s · jest ~60s |

**Readiness probe** (`GET /health/ready`):

```json
{"status":"ready","checks":{"supabase":{"ok":true,"latencyMs":1026,"detail":"reachable"},
 "redis":{"ok":true,"latencyMs":138,"detail":"PONG"},
 "ml":{"ok":true,"latencyMs":6,"detail":"OK"}}}
```

> **Shell gotcha (not an app defect):** in this shell `localhost:3000` returns an *empty* response
> while `127.0.0.1:3000` returns 200 — `localhost` resolves to `::1` and the API binds IPv4 only.
> Vite's proxy uses Node's `autoSelectFamily`, so the browser path works; only shell `curl` needs
> `127.0.0.1`.

---

## 2. Master runner — `tests/e2e/run_full_system_test.py`

**Result: 6/6 PASS, exit 0, 158.97s.** Log: `Temp/test-logs/master_2026-10-15.log`

| Suite | Reported | Reality |
|---|---|---|
| 1. AI Chatbot & Continuations | PASS | ⚠️ **`q1_preview_card: FAIL`** — masked by the suite's gate (§4) |
| 2. Overlays & Collision Handling | PASS | PASS (2 documented WARNs, below) |
| 3. Professor Dashboard & Similarity Matrix | PASS | PASS (10/10 checks) |
| 4. Table & Image Wrap Options | PASS | ⚠️ **`image_alignment_button: FAIL`** — masked by the suite's gate (§4) |
| 5. ML Microservice & Prediction | PASS | `16 passed, 1 skipped in 6.05s` |
| 6. Node Intent Parser & Skill Tests | PASS | `22 passed, 22 total` |

**Why two failures are masked:** the runner's pass conditions are
`"q3_continuation_preview_card: PASS"` (Suite 1) and `table_toolbar_button` +
`image_toolbar_button` (Suite 4). Neither includes `q1_preview_card` or
`image_alignment_button`, so the suites print `PASS` regardless. The raw log shows both:

```
[FAIL]  q1_preview_card: FAIL
[FAIL]  image_alignment_button: FAIL
Total Duration: 158.97s
Verdict: ALL SYSTEMS GO (100% PASS)
```

**Suite 2 warnings (unchanged, by design):**
- `grammar_underline_appears: WARN` / `wavy_click_opens_grammar: SKIP` — no `.grammar-issue`
  element was visible in that run.
- `outline_click_opens_chooser: PASS (chip)` — no grammar/format collision existed on the
  outlined block (`'introduction'` is well spelled; the flagged word is `'introduciton'`),
  so the chip correctly fires instead of the chooser.

---

## 3. Full suites

| Suite | Command | Result |
|---|---|---|
| Python unit | `pytest tests/python -q` | ✅ **260 passed, 1 skipped** (exit 0, 16.26s) |
| E2E pytest | `pytest tests/e2e -q` | ✅ **75 passed, 4 skipped, 0 failed** (exit 0, 618.70s) |
| Node Jest | `cd server && npm run test:lowmem` | ⚠️ **17/18 suites, 146/146 tests pass** (exit 1 — see §7) |
| Server types | `cd server && npx tsc --noEmit` | ✅ clean (exit 0) |
| Frontend types | `cd frontend && npm run type-check` | ✅ clean (exit 0) |
| Frontend build | `cd frontend && npm run build` | ✅ exit 0, built in 14.03s (pre-existing >500 kB chunk warning) |

The E2E suite **improved** on the 2026-10-13 run: 72 passed / 3 failed / 4 skipped →
**75 passed / 0 failed**, consistent with the E1/E2/E3 fixes landed since.

---

## 4. The two masked failures — root causes

### 🟠 M1 — `q1_preview_card: FAIL` → **test wait budget, not an app defect**

Q1 (`"Format the entire document into APA style"`) **does** produce a preview. Verified two ways:

**Direct API probe** (`Temp/probe_ai_chat.py`, real JWT via `POST /auth/login`):

```
Q1: 'Format the entire document into APA style'
    status=200  elapsed=15.45s  keys=['mode','model','preview','provider','reply']
    mode='preview'    ← the app returns a preview payload

Q2: 'Now format all headings and make them bold and centered'
    status=200  elapsed=2.68s   mode='preview'
```

**UI timing probe** (`Temp/probe_q1_timing.py`, Playwright, polls instead of fixed waits):

```
Q1 time-to-preview-card: 11.36s
spinners still in DOM at end: 0
page errors: none
```

**Why the test misses it:** `test_chatbot_bulk_formatting.py` budgets roughly **≤12s** for Q1 —
`wait_for_chat_response()` swallows a 15s spinner-detach timeout (it returns immediately when no
`.animate-spin` element is attached), then sleeps 2s, then waits 10s for the Apply button. The
first, uncached provider round-trip on the NVIDIA free tier measures **11.4–15.5s** across runs,
so it straddles that budget. Q2 passes because it is warm (2.7s).

**Classification:** flaky test budget driven by provider latency. A poll-until-visible loop (as in
the probe) or a larger timeout makes it deterministic.

### 🟠 M2 — `image_alignment_button: FAIL` → **selection-gated automation gap, by design**

The test requires `button[title^='Image Alignment']` to be visible. In
`frontend/src/components/editor/TiptapEditor.tsx:2177` the control is explicitly gated:

```tsx
{/* Image alignment only makes sense with an image selected. */}
{imageContext && (
  <ToolButton icon={AlignCenter} title={`Image Alignment: ${imageContext.imageAlignment}`} … />
```

A synthetic click cannot reliably produce the ProseMirror node selection that sets `imageContext`
in the paginated editor, so the script reports `WARN (selection-gated; verified manually)` while
still recording a hard `FAIL` for the button-visibility check. The image tool itself is present and
works (`image_toolbar_button: PASS`).

**Classification:** automation gap, not a defect.

---

## 5. Live service probes (the interfaces the app actually uses)

| Probe | Result |
|---|---|
| `POST :8001/predict` | `{"predicted_format":"heading1","confidence":0.98}` from `base_model.pkl` |
| `POST :8001/grammar/check` | `Found 2 grammar issue(s)` — `"She go" → "She goes"` (subject-verb agreement, `source: pos`) |
| `GET :3000/health/ready` | ready — supabase 1026ms, redis PONG 138ms, ml 6ms |
| `POST :3000/auth/login` | 200 in ~1s for `test@test.com` |
| `POST :3000/ai/chat` | 200, `mode=preview`, correct preview payloads |

---

## 6. Summary

| Result | Count | Detail |
|---|---|---|
| ✅ Passing | 10 | readiness (3 deps), ML predict, ML grammar, login, `/ai/chat`, tsc ×2, frontend build, pytest python |
| ✅ Suites green | 2 | master runner 6/6 (exit 0); e2e pytest 75 passed / 0 failed |
| 🟠 Masked sub-checks | 2 | `q1_preview_card` (test budget), `image_alignment_button` (selection-gated) |
| ⚠️ Warnings | 3 | Jest fixture suite (intentional); Suite 2 grammar-underline WARN + collision SKIP |
| 🔴 Real application defects | **0** | none found this run |

**Nothing regressed relative to 2026-10-13**, and the E2E suite improved (0 failures vs 3).

---

## 7. Carried over from the 2026-10-13 run — still open

### 7.1 Fixed since (verified)

| ID | Fix | Status |
|---|---|---|
| **E1** | `CustomBlockquote.addCommands()` now spreads `...this.parent?.()` (`TiptapEditor.tsx`) — restores `toggleBlockquote`/`setBlockquote` and callouts | ✅ done + verified |
| **E1b/E1c** | Bonus same-pattern fixes in `AlignedImageResize.addCommands()` and `TableAlignmentExtension.addCommands()` — restored Insert Image and all table commands | ✅ done + verified |
| **E2** | `test_table_and_image_options.py` clicks the Insert tab; inner selectors de-staled | ✅ done + verified |
| **E3** | `harness.py::filter_console_noise` also filters `[vite]`, React DevTools, Chrome autofill, `harper_wasm` teardown abort | ✅ done + verified |

### 7.2 UI/UX — FIXED + re-measured (2026-10-17)

Fixed by the builder (commit-pending working tree); the whole audit was re-run (`Temp/ui_audit/audit_v2.py`, same machine/stack) and `audit_v2_summary.json` + `shots/` now hold the fresh run. Before → after:

| Finding | Before | After (re-run) | Fix |
|---|---|---|---|
| Teal accent contrast | 4.21:1 / 3.95:1 fails | **0 contrast failures on all 5 pages** | Teal replaced by cobalt `#1351aa` token set (`index.css`) |
| Sub-12px labels (dashboard) | 93 | **0** | Sidebar/table/meta labels ≥12px; avatar initials `text-xs` (also covers the 155 counted in the fresh pass) |
| Small tap targets | 4 controls <24px | **0 in-scope** (remaining: `yesterday.to` 77×17 inline link — exception; nav text links unchanged) | Steppers 22→24px, Collapse panel 22→24px, zoom slider hit area 24px tall |
| Unnamed controls | 4 (3 editor, 1 professor) | **0** | aria-labels: editor back link, professor back link, offline-compact button, chatbot send button |
| Low-contrast save pill | 2.96–3.79:1 | **0 pill contrast failures** | New `--success-text` `#1f6b3f` / `--error-text` `#a0342f` text tokens (fills/dots unchanged) |
| Presence avatar white text | 3.68:1 (editor "E2") | **0** | `AVATAR_COLORS` darkened to 700-level hues (also applied in `SimilarityMatrix.getAvatarColor`) |
| Hidden buttons (dashboard) | 90 (tab-hidden toolbar content) | 158 in fresh run (scales with rendered rows; unchanged behavior) | Not in fix scope — discoverability design decision still open |

Not changed (out of scope, still <12px in the editor only): `Quote`/`Caption` tab labels (11px), status-bar stats (11.5px), `E2`/`3 headings`/`Ctrl+\` (10px) — none of these were in the audit's fix list.

Original measurement table (2026-10-13 run) kept for reference:

| Finding | Measurement | Fix direction |
|---|---|---|
| Teal accent contrast | `#388087` = **4.21:1** as link text on the canvas (`Login` "Create one", Editor active tab) and **3.95:1** for the 10px "Academic Suite" badge — both below AA 4.5:1 | Introduce a **darker** accent token for text on the light theme (keep `#388087` for fills/borders). Note: the 2026-10-13 doc's note about needing a *lighter* token applies to a future dim theme, not the current light canvas |
| Sub-12px labels | **93** text elements < 12px on the dashboard (10–11px: `Academic Suite`, stat numbers, `Folders`, `Student Tier`) | Raise dashboard labels to ≥12px |
| Hidden buttons | **90** hidden buttons on the dashboard (tab-hidden toolbar content) | Same discoverability issue that made Suite 4 fail; consider surfacing Table/Image outside the Insert tab |
| Small tap targets | Font-size steppers `22x24`, "Collapse panel" `22x22` (WCAG 2.5.8 min 24x24). Inline text links (`77x17`, `66x17`) are covered by the inline-link exception | Enlarge the four controls to ≥24px |
| Unnamed controls | 3 on the editor page, 1 on the professor page (`a.inline-flex …` = the icon-only back link) | Add `aria-label`s |
| Low-contrast status text | Save pill fails AA in **every** state (measured, steady-state): `Saving…` **3.30:1**, `Saved` **2.96:1**, `Save failed` **3.79:1** | Darken the status text colors (keep the dot/tint). Measured by `Temp/contrast_check.py` — the audit's 3.89:1 reading for `Saving…` was a mid-transition artifact (the pill animates `transition: all 200ms`) |

Full per-page numbers: `Temp/ui_audit/audit_v2_summary.json`; screenshots in `Temp/ui_audit/shots/`.

**Candidate replacement tokens, already verified numerically** (`Temp/contrast_check.py`) — darker teal/green/red for *text* only, keeping the current values for fills, borders and dots:

```
accent-text  #2c6a70 on canvas          -> 5.70:1  PASS
accent-text  #2c6a70 on accent-subtle   -> 5.18:1  PASS
info-text    #27595e on info tint 20%   -> 5.68:1  PASS
success-text #1f6b3f on success tint    -> 4.78:1  PASS
error-text   #a0342f on error tint 15%   -> 5.22:1  PASS
```

Also measured: `#388087` on the `accent-subtle` tint is **3.83:1** — a second instance of the same failing pairing.


### 7.3 Still open — other

| Item | Detail |
|---|---|
| **Jest fixture suite** | `server/src/controllers/__tests__/auditController.test.ts` imports `vitest` → `TS2307: Cannot find module 'vitest'`, `TS2304: Cannot find name 'vi'`. Intentional per `CALIBRATION.md`; the other 17 suites and all 146 tests pass |
| **Doc drift** | `TESTING_GUIDE.md` §2 says `curl localhost:3000/api/health` → `{"status":"ok"}`; routes mount at the **root** (`/health/live` → `{"status":"OK",…}`), `/api` is only added by the Vite proxy. Area B also omits the **Insert** tab |
| **Calibration fixture** | `auditController.ts` / `auditRoutes.ts` (controller queries Supabase directly, `any`, no Zod, route not mounted) — deliberate, leave alone |
| **Tracked artifacts** | `ml/models/base_model.pkl`, `ml/models/grammar_model.pkl` are tracked, contradicting `AGENTS.md` → `git rm --cached …` |

---

## 8. Not verified — handed off

- **Visual / pixel review.** This runner has no image-decoding capability (PIL not installed, no
  OCR, no image input channel), so all verification here is DOM/geometry/JSON level. Screenshots
  exist but were only confirmed as files, never viewed. The visual judgment pass is deliberately
  left to a vision-capable model.
- **A11y/contrast fixes** (§7.2) — work was started and stopped before any edit; **no application
  source was changed by this run**.

---

## 9. Reproduce

```bash
# services — restart when needed
ml/venv/Scripts/python.exe ml/src/main.py &          # ML   -> :8001
(cd server   && npm run dev) &                        # API  -> :3000
(cd frontend && npm run dev) &                        # Vite -> :5173

# use 127.0.0.1 for the API in this shell (localhost -> ::1 fails)
curl -s http://127.0.0.1:3000/health/ready

export PYTHONIOENCODING=utf-8
ml/venv/Scripts/python.exe tests/e2e/run_full_system_test.py     # master, 6 suites
ml/venv/Scripts/pytest.exe tests/python -q                       # 260 tests
ml/venv/Scripts/pytest.exe tests/e2e -q                          # 75 tests
(cd server && npm run test:lowmem && npx tsc --noEmit)
(cd frontend && npm run type-check && npm run build)

# investigation probes written for the 2026-10-15 run
ml/venv/Scripts/python.exe Temp/probe_ai_chat.py        # Q1/Q2 via the API
ml/venv/Scripts/python.exe Temp/probe_q1_timing.py      # UI time-to-preview-card
ml/venv/Scripts/python.exe Temp/contrast_check.py       # WCAG ratios for the flagged tokens (no browser)
```

**Logs:** `Temp/test-logs/master_2026-10-15.log`, `chatbot_rerun.log`, `pytest_python.log`,
`pytest_e2e_full.log`, `jest_full.log`

> `freebuff-calibration` is a throwaway branch per `CALIBRATION.md`; do not merge. The `audit*`
> files and their violations are intentional.
