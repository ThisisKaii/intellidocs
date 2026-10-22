# IntelliDocs Design System — Clean Modern with an Academic Voice

> **Philosophy:** calm, professional surfaces (think Google Docs or Notion) that carry a little academic character: ink-dark text, one cobalt accent, an editorial display face for headlines and a technical mono face for small labels. The editor canvas is paper and is never restyled.

---

## 1. Principles

* **Calm first.** White and slate surfaces, soft 1px borders, light shadows. Nothing competes with the document.
* **One accent.** Cobalt `#1351AA` is the only brand colour. It marks the primary action, selection and progress. Never use it for decoration.
* **Plain language.** Copy is written for a non-technical student: sentence case, no jargon. Confidence is shown as "92% sure", never as a model score.
* **Always asks first.** Every automated change is a suggestion with an accept / not now choice.
* **Real content over chrome.** Document thumbnails show the actual first page; empty states explain what to do next.

---

## 2. Colour tokens (`frontend/src/styles/index.css`, `:root`)

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#f8fafc` | App background |
| `--surface` / `--card` | `#ffffff` | Cards, panels, modals |
| `--surface-sunken` | `#f1f5f9` | Chips, inputs, muted fills |
| `--border` | `#e2e8f0` | Default 1px borders and dividers |
| `--border-strong` | `#94a3b8` | Input outlines, emphasised dividers |
| `--text-primary` | `#3a342f` | Headings and body (warm ink) |
| `--text-secondary` | `#5c524a` | Supporting copy |
| `--text-muted` | `#7a7a7a` | Metadata, hints (non-body text only) |
| `--accent-strong` | `#1351aa` | Primary buttons, links, progress |
| `--accent-hover` | `#0f4189` | Hover/pressed state of the accent |
| `--accent-subtle` | `#e7edf8` | Accent tint behind icons and highlights |
| `--success` / `--warning` / `--error` | `#3e8e5a` / `#b5772b` / `#c0453f` | Status only |
| `--grammar` | `#7c3aed` | Grammar underline (distinct from spelling red) |

Public marketing surfaces may use Tailwind slate utilities (`slate-50 … slate-900`) that line up with these tokens.

---

## 3. Typography

| Role | Face | Notes |
|---|---|---|
| Headlines (landing, auth panel) | **Syne**, 800 | Sentence case, `-0.02em` tracking, `text-balance` |
| App UI and body | **Geist / Inter** | 14–16px, line-height 1.5 |
| Eyebrow labels, counters, scores | **Space Mono** (`.font-tech`) | 10–12px, uppercase eyebrows only, `tabular-nums` for numbers |

Inside the app (dashboard, panels) use the sans face for headings (`text-2xl font-semibold tracking-tight`). Syne and Space Mono are for the landing page and auth screen, not for every label.

---

## 4. Shape, elevation and spacing

* **Radius scale:** 6px (controls), 8px (buttons, inputs), 12px (cards), 16px (large panels and demo). Nested radius = outer radius − padding.
* **Elevation:** `shadow-sm` for cards at rest, `shadow-md` on hover, a single large soft shadow for hero artefacts. No glass/blur backgrounds on content cards (blur is for sticky headers only).
* **Spacing:** 4px base grid; sections 80–112px apart on marketing pages, 24px padding inside app cards.
* **Motion:** 150ms colour transitions, 200–400ms entrance; respect `prefers-reduced-motion`.

---

## 5. Patterns

* **Split auth screen** (`AuthShell`): brand panel with benefits on large screens, form on the right; mobile shows the form only.
* **Landing page** (`pages/Landing.tsx`): hero in plain words, live demo, "how it works" in three steps, feature cards, FAQ, closing call to action. The demo is lazy-loaded, offline and never saves anything.
* **Dashboard:** sidebar + search header; grid of cards that render each document's real first page (`DocumentPreview`: page size, margins, fonts and preset CSS applied), list view as an alternative.
* **Suggestions:** `InlineSuggestionChip` / `FormatPrompt` show a plain sentence, a confidence percentage and Accept / Not now. Rejections are always recorded.
* **Numbers:** every count, score or percentage uses `tabular-nums`.

---

## 6. Document editor canvas protection (strict rule)

The TipTap canvas (`PagedEditor.tsx`) is the printed page and keeps its own rules:

* White page sheets with realistic shadow; the surrounding chrome may change, the page may not.
* **Do not** alter ProseMirror DOM structure, `#pages.rm-pages-wrapper`, or `.page` heights.
* Zoom uses CSS `zoom` on the `.intellidocs-page-editor` container, never `transform: scale`. Layout code that measures the canvas must divide by the live zoom (see `PageBreak.ts`, `TabStop.ts`).
* The imported document's own spacing and fonts are authoritative; editor CSS must not override them.
