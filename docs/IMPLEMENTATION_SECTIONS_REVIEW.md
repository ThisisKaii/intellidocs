# Implementation Plan — Section-by-Section Review

**Date:** 2026-09-30
**Plan reviewed:** `implementation_plan.md` (11 sections, 5 execution phases)
**Method:** every claim below was verified by reading source, not from the plan's
own descriptions. Where the plan and the code disagree, the code is treated as
truth and the disagreement is called out.

**Headline:** Sections 1, 6, 8, and 9 are substantially complete. Sections 3, 7
are complete as of this session. Sections 4, 5, and 10 are largely complete but
have real defects. Section 2 has one blocking config bug. Section 11 is the only
section that is essentially not built, and it is the largest.

---

## Status summary

| # | Section | Status | Blocking issues |
|---|---|---|---|
| 1 | Multi-Dataset Pipeline & Compliance Auditor | Complete | 0 |
| 2 | Load Balancing & Microservice HA | Blocked | **1 critical** |
| 3 | Full-Spectrum Behavioral Learning | Complete (this session) | 0 |
| 4 | Large-File Drive Streaming Import | Largely complete | 2 high |
| 5 | Landing Page Revamp | Complete | 0 |
| 6 | SVG Logo Suite | Complete | 0 |
| 7 | Per-User Drive OAuth Isolation | Complete | 0 |
| 8 | Class vs Personal Folders | Complete (code) | 0 — migration pending |
| 9 | Blueprint Modal & V2 Versioning | Complete | 0 |
| 10 | Overlay DOM Hierarchy | Largely complete | 1 medium |
| 11 | Real-Time Collaboration (CRDT) | **Not built** | 0 — scope decision needed |

---

## 1. Multi-Dataset Pipeline & Hybrid Compliance Auditor — COMPLETE

The plan specifies 4 datasets and a 2-tier auditor. All of it exists.

**Datasets** (`ml/dataset/download.py`): the registry at `:66-84` holds 5 entries
with per-dataset `required` flags. `wikitext-103` and `jfleg` are required and
fail hard; `nucle`, `conll2014`, and `thesis-structural` are optional. Preprocessing
(`ml/dataset/preprocess.py`) merges them into the two unified schemas the plan
asked for: `grammar_examples.csv` (jfleg + nucle + conll2014, provenance kept in
`source_dataset`) and `formatting_examples.csv` (wikitext + thesis-structural +
synthetic rows).

**Compliance auditor** — genuinely two-tier as specified:
- Tier 1 rules: `ml/grammar/compliance_rules.py` (560 lines) — margins, page
  numbers, heading capitalization, table captions, and APA 7th / IEEE reference
  patterns. Blocking issues are enumerated at `:46`.
- Tier 2 ML: `ml/grammar/compliance_auditor.py` — RandomForest style consistency
  (`:228-272`) plus LSTM document flow (`:275-312`), blended 0.65/0.35 (`:41-42`)
  into a readiness score with threshold 80.
- Both model artifacts are on disk, so the ML tier actually runs.

**Full stack is wired**: `/audit/compliance` endpoint (`ml/src/main.py:673-697`)
→ `pythonBridge.requestComplianceAudit` (`:316-348`) → `skills/auditCompliance.ts`
→ `POST /api/professor/audit/compliance` behind Arcjet → `ProfessorDashboard.tsx`
"Compliance Audit" tab → `ThesisChecklist.tsx`.

**Comments:**
- Both files the plan named as needing modification were created instead, which
  is the correct outcome. Nothing was stubbed.
- One honest gap: `conll2014` and `thesis-structural` are declared in the registry
  but their raw directories are absent on disk, so the current training data is
  effectively JFLEG + NUCLE for grammar. NUCLE carries the same 28 error
  categories, so the taxonomy claim still holds — but the plan's "FCE / CoNLL-2014"
  is satisfied by NUCLE's reannotation rather than by CoNLL itself. Worth saying
  out loud in the defense, since CoNLL-2014 is LDC-licensed and cannot be shipped.
- `ThesisChecklist.tsx` exists twice — `components/ThesisChecklist.tsx` (imported)
  and `components/editor/ThesisChecklist.tsx` (orphaned, 8/27). Dead file; safe
  to delete, I left it alone rather than widen the diff.

---

## 2. Load Balancing & Microservice HA — BLOCKED (1 critical defect)

The architecture is fully specified and mostly built: `nginx/nginx.conf` (198
lines) with sticky-hash upstream for Express and least-conn for ML, rate-limit
zones, TLS 1.2/1.3, and 100 MB body limit matched to Express's
`express.json({limit:'100mb'})`. `docker-compose.prod.yml` (250 lines) has
2 Express replicas, 2 ML replicas, Redis primary + replica + 3 sentinels, memory
caps, and log rotation. Readiness semantics are genuinely well designed — ML is
treated as *optional* so an ML blip degrades instead of evicting a replica and
taking down editing.

### The critical bug

`docker-compose.prod.yml:25` sets `ML_API_URL: http://ml:8000` and `:43-44`
lists `ml: { condition: service_healthy }` in `depends_on` — **but the file only
defines `ml1` and `ml2`.** There is no service named `ml`.

Consequences: `docker compose up` fails outright on the undefined `depends_on`
reference, and even if forced, `http://ml:8000` cannot resolve because no compose
network alias `ml` exists. Express has no working address for the ML service in
the production stack.

This is a small, self-contained fix (the failure mode is exactly what the health
checks and `/health/ready` degraded path were designed to expose), but it needs
your call on intent before I change it, because the two sane fixes differ in
behavior:

- **Option A — round-robin alias:** rename to `ml1` and depend on both `ml1`/`ml2`
  for startup ordering. Express then always talks to `ml1`, so the two ML replicas
  only load-balance for browser-originated `/ml/` traffic, not for Express calls.
  Simple, but one replica takes all server-side ML load.
- **Option B — route Express through nginx:** `ML_API_URL: http://nginx/ml` and
  depend on `nginx` instead. Every ML call then gets least-conn balancing and
  the node-level failover, at the cost of one extra hop and a dependency on
  nginx being healthy for the server to reach ML at all.

`docs/DEPLOYMENT.md:125` already assumes Express talks to ML by URL, so either
works with the documented troubleshooting.

### Other comments

- **The dev stack is also broken, differently.** `docker-compose.yml:31` sets
  `ML_SERVICE_URL=http://ml:8000`, which `pythonBridge.ts:62` never reads. The
  dev compose stack cannot reach ML either. `.env.example` already documents that
  `ML_SERVICE_URL` is dead, so the compose file is simply stale.
- **No PM2 config exists at all**, despite the plan naming it. The `SETUP.md`
  references are prose describing a *different* single-VPS topology, which
  contradicts the Docker multi-replica design. There are two incompatible
  descriptions of "how this is deployed" in the repo and no single source of
  truth. I'd resolve this by deleting the PM2 prose rather than adding a config
  the Docker stack doesn't use.
- **Sentinel failover is documented but not wired**: `REDIS_URL` points straight
  at the primary, so a failover requires a manual `REDIRECT` per
  `DEPLOYMENT.md:110-114`. Acceptable for a capstone, honest as long as it's
  stated.
- `nginx/certs/` does not exist; nginx cannot start until certs are provisioned.
  This is a deployment prerequisite, not a code defect.

---

## 3. Full-Spectrum Behavioral Learning — COMPLETE (this session)

All 8 action types the plan lists are wired and reporting.

The plan named `behaviorListener.ts` and `behaviorModel.ts` as files to modify.
`behaviorListener.ts` was extended; `behaviorModel.ts` needed no change because
the payload schema was already generic.

What each control required:

| Action | Implementation |
|---|---|
| `table_header_toggle` | `toggleHeaderRow()` + `tableHasHeader` snapshot |
| `table_alignment_change` | new `alignment` attr + `setTableAlignment` command |
| `image_alignment` | new `alignment` attr + `setImageAlignment`, 4 variants |
| `image_resize` | new `ImageResizeBehaviorExtension.ts` plugin |
| `callout_insert` | blockquote-based labelled callout, 4 variants |
| `image_caption_add` | caption paragraph + `data-caption` marker |

**Comments on the decisions I had to make:**

- **TipTap does not ship what the plan assumes.** I checked the installed
  `.d.ts` files rather than trusting the plan: `setTableAlign` and `setImageAlign`
  do not exist. Only `toggleHeaderRow`/`toggleHeaderColumn`/`toggleHeaderCell` are
  built in, and `tiptap-extension-resize-image` exposes no resize command or event
  at all. So three of these controls required writing the commands. The plan's
  list reads as if they were drop-in.

- **`image_resize` had no event to hook.** The resize package writes width
  straight into `containerStyle` with no notification, so I built a ProseMirror
  plugin that diffs image sizes across transactions. My first attempt fired on any
  edit while an image existed — I caught that reviewing my own code and rewrote it
  to compare actual widths, otherwise typing a paragraph would have logged dozens
  of bogus resize events and poisoned the training data. A drag emits many
  transactions, so reports are coalesced on a 250 ms timer: one drag, one event.

- **`callout_insert` — I chose a labelled blockquote, not a new node type.** A new
  node would have required content-model, serialization, and CSS work; a blockquote
  carries all of it already. Variants are note / warning / key / example.
  Two things worth flagging: the label needs its own `data-callout-label`
  attribute because CSS `attr()` cannot transform text; and `--info` and
  `--accent-strong` resolve to the **same hex value in both themes**, so note and
  key would have been visually identical — `key` gets a heavier tint instead.
  This is the kind of thing that only shows up in the editor, not in the code.

- **`image_caption_add` — I deliberately did not adopt the package's
  `Figure` node.** The resize package does ship `Figure` + `Figcaption` with
  `addCaption`, and using it would be the "correct" implementation — but it
  renames the node from `image` to `figure`, which breaks every saved document,
  `snapshotImageContext`, and the resize plugin from this session. The caption is
  a real paragraph tagged `style_source: image_caption` with a `data-caption`
  marker on the image. **The tradeoff: the caption is styled with inline CSS + an
  italic mark, so it renders correctly but is not semantically a `<figcaption>`.**
  If a requirement later needs real figure semantics, that is the Figure-node
  migration, and it should be scoped deliberately rather than drifted into.

- **A latent bug from the earlier session surfaced here.** `snapshotImageContext`
  used an ancestor walk, which returns nothing for a *top-level* image where TipTap
  uses a `NodeSelection` (depth 0). The image alignment menu would never have
  appeared on an image that wasn't nested inside a paragraph. Fixed with a
  `resolveImage` helper that handles both node selections and ranged selections.

- **This section is compile-verified only.** Typecheck, lint, and build are clean,
  but nobody has opened the editor and confirmed a table actually left-aligns or
  that a resize logs exactly one event. That needs human eyes.

---

## 4. Large-File Drive Streaming Import — LARGELY COMPLETE, 2 high-severity defects

The streaming requirement is genuinely met. `driveController.exportFile()`
branches at 15 MB (`processImportJob.ts:21`): above the threshold the file is
streamed via `pipeline()` to a temp file and `readFile` is never called; below it,
buffering is acceptable. `streamDownload.ts` reports progress from `content-length`
with whole-percent dedupe so Redis isn't thrashed. Temp files are removed in
`finally`. This is the right implementation of what the plan asked for.

Progress UI exists: `useImportJob.ts` polls at 1.5 s with a 15-minute ceiling,
`DriveImportDialog.tsx` and `ImportFileModal.tsx` both exist, and `Home.tsx`
discriminates 202-vs-200 responses correctly.

### High issue 1: the queue is dead state, and there is no worker

`importJobModel.ts:74` pushes the job id onto `drive:import:queue`, but **nothing
ever drains that list** — no `BRPOP`/`BLPOP`, no consumer anywhere in the repo. The
only other reference is removal on failure. So the queue provides no durability.

Worse, the job runs *in the HTTP-serving Express process*:
`processImportJob.ts:163` is `void processImportJob(job)` — deliberately not
awaited, with a comment that the client polls instead. Under the Section 2
topology that means a `server1` restart, deploy, or OOM kill mid-import aborts the
download permanently. `isStaleJob` (`importJobModel.ts:149-152`) detects this
reactively and the UI says "server may have restarted," but the job is never
resumed or retried.

This is the most serious architectural gap in the section. A real queue needs a
consumer process — the natural fit is a dedicated worker container in
`docker-compose.prod.yml` that `BRPOP`s the list, which also makes the
`ML`/BullMQ discussion moot: the plan's "BullMQ or Redis job list" was an
either/or, and a Redis list plus one worker container is the option that doesn't
require adopting BullMQ.

### High issue 2: converted HTML is stored in Redis

`importJobModel.ts:105-113` writes the full converted HTML into the job hash for up
to an hour. For a large document that is a multi-megabyte Redis value — against a
512 MB `maxmemory` with `allkeys-lru` (`docker-compose.prod.yml:107-108`), where
one large import can evict unrelated keys. This needs a size cap or a move to
Supabase storage.

### Other comments

- **No Realtime or WebSocket notification exists** — zero matches for
  `WebSocket|socket.io|ws://` in `server/src`, and no `ws` dependency. The plan
  asked for Realtime/WebSocket completion notification; the app polls instead. This
  is defensible (1.5 s polling is a normal UX) but it is not what the plan said,
  and it is the same polling that makes a dead replica look like a stuck import.
- **No concurrency limit.** Every oversized import spawns an unbounded in-process
  stream plus a conversion. N concurrent 500 MB imports will exhaust the replica's
  1 GB cap. A semaphore or per-user cap is the missing piece.
- `.doc` is rejected outright and PDF import hard-depends on the Python converter.
  Deliberate, but worth being explicit about in the docs.
- No HTTP Range / resume, so a dropped connection restarts from byte 0. Acceptable
  scope; just noting it.

---

## 5. Landing Page Revamp — COMPLETE

Messaging shift applied, audience reframed from developers to students/researchers.
`LogoLockup` renders on the page (`Landing.tsx:164`). One line was changed from
"Loved by writers" to "Loved by students" to match the plan's audience framing; per
your instruction the rest of the copy was left alone.

**Comment:** the plan's "before/after interactive slider" showcase is the one
sub-item I can't confirm is present. Worth a visual check.

---

## 6. SVG Logo Suite — COMPLETE

All four concepts exist as standalone interactive HTML previews in
`docs/logo-concepts/`, each with inline `<symbol>` markup, a favicon size ladder
(16/32/64/128), a navbar lockup, a copy-SVG button, and a light/dark toggle.
`Logo.tsx` implements Concept 4 ("Focus Beacon") as the shipped `LogoMark`, and
`frontend/public/favicon.svg` carries a `prefers-color-scheme` dark variant.

**Comments:** no written rationale for why Concept 4 won — only a code comment. If
this is ever presented, the design decision should be on paper. Also no PNG/ICO
raster variants or `manifest.webmanifest`, so there is no real installed-app icon
yet; the SVG favicon covers the browser tab only.

---

## 7. Per-User Drive OAuth Isolation — COMPLETE

Tokens are user-scoped in `driveModel.ts`, disconnect is per-user, and the OAuth
`state` is HMAC-signed with `timingSafeEqual` and a 10-minute TTL
(`driveController.ts:48-80`). `linkProviderTokenIfAbsent` (`driveModel.ts:117-130`)
binds a Google-login provider token to that user's own account, which is the exact
cross-user leak the plan warned about.

**Comments — two things I could not verify without a real browser:**
- The OAuth callback redirect splits across Render and Vercel. The backend
  redirects to `/drive-callback`, and `req.headers.origin` is absent on a
  top-level redirect, so production depends on `FRONTEND_URL` being set correctly.
- Whether the Google-login provider token actually carries the Drive scope is
  unconfirmed. If Google doesn't return one, users land on the consent flow anyway —
  acceptable, but the "invisible" path may not be as invisible as designed.

**One security item that must not be forgotten:** the OAuth state secret was
exposed during development and **must be rotated before any production deploy**.

---

## 8. Professor Class vs Personal Folders — COMPLETE (code), migration pending

Backend and UI both exist. `folderModel.getAuthDirectory()` returns class folders
with roster metadata; `ClassRosterModal.tsx` handles list / enroll-by-email /
unenroll with optimistic rollback; `DriveTable.tsx` gates "Manage roster" to the
owner via `canManageRoster`; `Home.tsx` refreshes badges on change.

**Comments:**
- **A real pagination bug was found and fixed here.** `getAuthDirectory()` called
  `listUsers()` once and treated anyone past page 1 as non-existent, so any
  student beyond the first page silently could not be enrolled. It now walks all
  pages. This is the kind of bug that only shows up with realistic data volume —
  worth mentioning in the defense as an example of the access-control path being
  tested properly.
- **`db/supabase/022_class_folders.sql` has not been applied.** The roster
  endpoint will 500 until you run it in the Supabase SQL editor. This is the one
  blocker in this section and it is entirely manual.

---

## 9. Blueprint Modal & V2 Versioning — COMPLETE

This section is more complete than the plan implies. `DocumentCreateModal.tsx`
(478 lines) with 4 blueprints (blank, APA 7th, IEEE, UCLM capstone), the dashed
guide boxes via `BlueprintGuideExtension` + `.doc-guide` CSS, and **full-stack V2
forking**: migration `023_user_presets.sql` with `base_key`/`version` columns,
`createUserPreset` auto-bumping to `apa_7th__v2` / `"APA 7th Edition (Custom v2)"`,
`PresetForkPrompt.tsx` offering "Save as my version" / "Keep standard", and
`evaluatePresetDrift` in `Document.tsx` to detect the drift that triggers it. The
fork deliberately does not pollute the standard blueprints, exactly as specified.

**Comments:**
- **A migration may not be applied in the live project.** `Home.tsx:194` has a
  comment noting migration 023 might be missing; the fetch failure is swallowed to
  `[]`, so the symptom is silently "only standard blueprints appear." Same class
  of manual step as migration 022.
- `EditorStylesPanel`'s "custom preset" is **client-only** — it mints an id like
  `p-${Date.now()}` and never persists to `user_presets`. Only the drift-fork path
  actually saves. If the intent was for both to persist, that's a gap.
- `DELETE /user-presets/:id` exists on the server but **no frontend ever calls
  it** — there is no UI to delete a saved fork. Dead endpoint.
- No visual thumbnail previews in the modal cards; they are text-only.

---

## 10. Overlay DOM Hierarchy — LARGELY COMPLETE (under a different name), 1 medium issue

The plan says to replace absolute coordinate polling in
`SuggestionHighlightOverlay.tsx` with something in-flow. **That file does not
exist** — it was replaced by `SuggestionDecorationsExtension.ts`, which uses
`Decoration.node` inside the content flow. The file header documents the rationale
explicitly: no measured coordinates, no scroll/resize listeners, and it structurally
cannot render behind the floating chips. The desired DOM hierarchy is achieved by
being decoration nodes rather than siblings. Blueprint guides, grammar underlines,
and style guides all follow the same pattern, and the anchor measurement in
`Document.tsx:691-739` is event-driven, not polling.

### Medium issue: there is no z-index contract

`PagedEditor.tsx` (394 lines) sets only width and margin — **no z-index, no
stacking context, no `isolation`** on the paginated canvas. Overlays escape it via
`position: fixed` rather than an explicit stacking contract, and the z-index values
in use are ad-hoc magic numbers: 20, 40, 50, 60, 61, 100, 300, 900, 940, 950, 1000,
2000, 10000, 10050. The plan asked for a documented `z-index: 1000+` band; there is
one number that high, but no system.

The plan's core requirement — overlays must not render behind suggestion panels —
is met in practice by the decoration approach, but it's met by construction accident
rather than by an enforced contract. A small set of named layer tokens
(`--z-page`, `--z-overlay`, `--z-chip`, `--z-modal`) would make it deliberate and
prevent the next person from inventing 10050.

**Comment:** `FormatPrompt.tsx` (351 lines) is **orphaned** — not rendered by
`Document.tsx`. Only `InlineSuggestionChip` is. Either wire it or remove it.

---

## 11. True Real-Time Collaboration (CRDT) — NOT BUILT

This is the one section that is essentially unimplemented, and it is the largest
piece of work remaining.

**What exists is not CRDT collaboration.** `Document.tsx:288-354` opens a Supabase
channel and broadcasts `doc_sync`, whose payload is the **full document HTML**
(`:74-82`). The receiver calls `setContent(payload.content)` — a whole-document
replacement with no character-level merge, so concurrent edits clobber each other
exactly as the plan predicted. The sender fires only *after* a successful 3-second
autosave (`:1074-1091`), so peers see changes at autosave cadence, not per
keystroke. Persistence is pure last-write-wins with no version precondition, no 409,
and no conflict detection.

Presence *is* live and works — avatar stack with name, colour hash, and
"(You) / (Owner) / (Collaborator)" tooltips. But it is **presence only**: there is
no cursor broadcast, no remote selection highlight, no awareness state beyond
`user_id`/`display_name`/`color`/`updated_at`.

**Missing entirely:** `@tiptap/extension-collaboration`,
`@tiptap/extension-collaboration-cursor`, `yjs`, `y-webrtc`/`y-websocket` are all
absent from `package.json` and `package-lock.json`. No WebSocket server, no Yjs
persistence layer, no per-user undo isolation, no migration for a shared CRDT store.

**Comment — and this is a decision I don't think I should make for you:**

`useOfflineBuffer.ts` (115 lines, an IndexedDB write-ahead draft store) is written
and **never imported anywhere**. It looks like abandoned groundwork for this
section. That, plus a CRDT migration touching every saved document, is why I stopped
and flagged this rather than starting.

Adopting Yjs is not a small feature — it changes the document storage model, needs
a persistence layer and a provider choice, and every existing saved document needs
a migration path. There is a real argument for **not** doing it for this capstone
and instead documenting the snapshot model's limitations honestly: the current
implementation is fine for a professor leaving comments while a student writes, and
it is genuinely wrong for two people typing in the same paragraph. Note that
`docs/SURVEY_QUESTIONNAIRE_REVISED.md` includes survey items promising "real-time
co-editing" — if that ships, the promise exceeds the implementation.

I'd want your decision on scope before touching this.

---

## Recommended order

1. **Section 2 critical fix** — the prod stack cannot start as written. Small, but
   it needs a choice between Option A and Option B above.
2. **Section 4 worker + Redis size cap** — dead queue plus full HTML in Redis is
   the most likely production incident.
3. **Apply migrations 022 and 023** in Supabase — manual, five minutes, and two
   features are non-functional without them.
4. **Section 10 z-index tokens** — small, prevents a future stacking bug.
5. **Section 11 scope decision** — your call, not mine.
6. **Rotate the OAuth state secret** before any deploy.

Everything else is either complete or a documented, deliberate limitation.
