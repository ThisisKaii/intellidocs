# IntelliDocs — Claude Code Instructions

> **Primary Source of Truth**: See [AGENTS.md](./AGENTS.md) for full architecture, invariant rules, and deep implementation details.

---

## 🚀 Core Operating Rules

### 1. The Open-Source Research Rule (Non-Negotiable)
**For unfamiliar features, complex algorithms, or layout mechanics, do NOT write from scratch.**
- First, search GitHub, established open-source projects, and community extensions (TipTap, ProseMirror, Mammoth, etc.) to see how battle-tested implementations solve the problem.
- **Context7 MCP**: Context7 is installed and connected to Claude (`https://mcp.context7.com/mcp`). Use Context7 tools (`resolve-library-id`, `query-docs`) to look up official, version-specific documentation and code examples for modern libraries (TipTap v2+, ProseMirror, Tailwind, Vite, DuckDB, Radix UI) instead of relying on outdated training data.
- Compare approaches, pick the cleanest and most reliable pattern, and adapt it to our codebase.
- **Guardrails**:
  - Do NOT introduce unrequested heavy external dependencies or npm/pip bloat.
  - Adapted patterns must strictly respect our strict MVC architecture.
  - Never violate Dean requirements (e.g. no prebuilt word processors; custom TipTap only).

---

### 2. General Agent Operating Standards
- **Ship working code only**: Plausibility is not correctness.
- **Read before editing**: Always read the files and calling code you intend to touch.
- **Surgical edits only**: Touch only what the task requires. No drive-by refactoring or unsolicited cleanup.
- **Verify claims**: Run tests, check outputs, and read files rather than guessing or assuming.
- **Loop Circuit Breaker**: If you run the exact same command/test/tool more than twice without progress, **abort immediately**, summarize the blocker, and ask the user for direction. Never attempt a 3rd blind retry.
- **Zero `any` in TypeScript**: Strictly typed boundaries with Zod schemas.
- **Dev Stack Hygiene**: When finishing tasks, ensure local dev services on ports 3000, 5173, and 8001 are stopped. Helper: `C:\Users\asus\AppData\Local\Temp\opencode\stop-stack.ps1`.

---

## 🏛️ Strict MVC Architecture

Never violate these boundaries:
```
Route (routes/)         → Receives HTTP request, calls Controller ONLY. Zero logic, zero DB queries.
Controller (controllers/)→ Handles req/res, calls Models and Skills. Zero direct DB/Supabase/Redis calls.
Model (models/)         → ALL data access lives here ONLY (Supabase, Redis, DuckDB). Zero req/res objects.
React View (frontend/)  → Calls Express via fetch() in services/api.ts. Zero direct Supabase DB queries.
AI Skills (skills/)     → Single-purpose async service functions called by controllers.
```

---

## 📝 Custom Editor Rules (TipTap / ProseMirror)
- **Editor-First Rule**: Check TipTap / ProseMirror community extensions before hand-rolling any editor behavior (pagination, tables, menus).
- **Custom-built**: Built on TipTap; custom React toolbar and selection handling (no prebuilt office suites).
- **Import Transactionality**: Load imported documents in ONE transactional `setContent` with pagination paused. Never stream as chunked fragments.
- **PageBreaks**: Schema-owned (`PageBreak` node, priority 110). Stretches DOM spacer at runtime without modifying document content state.
- **Authoritative Spacing**: Paragraph spacing and font sizing are extracted down the style inheritance chain (`w:spacing` → styles → `docDefaults`). Never override with `!important` in CSS.

---

## 🔬 Testing & Verification
- **Fidelity Run**: Run `python tests/e2e/fidelity_run.py` to measure document rendering fidelity against reference fixtures.
- **Python Suite**: Run `pytest tests/python/` in `ml/`.
- **Node Suite**: Run `npm test` in `server/`.
