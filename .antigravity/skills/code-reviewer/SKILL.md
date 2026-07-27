---
name: code-reviewer
description: Use before finalizing any pull request or significant code change in IntelliDocs. Reviews code changes against the rules defined in AGENTS.md (strict MVC, no direct DB access from controllers, no `any` in TypeScript, Zod validation at every external boundary).
---

# IntelliDocs Code Reviewer Skill

Use this checklist to review changes against the non-negotiable architectural rules of IntelliDocs.

## Checklist

### 1. Strict MVC Architecture
- [ ] **Routes**: Thin URL mappings only. Zero business logic, zero DB calls, handles Zod validation middleware before calling controller.
- [ ] **Controllers**: Handles req/res only. Never executes direct DB queries or Supabase/Redis calls. Delegates all data access to Models.
- [ ] **Models**: All Supabase, Redis, and DuckDB queries live strictly here. Zero req/res references.
- [ ] **React (View)**: Calls Express backend via `frontend/src/services/api.ts` only. No direct Supabase calls.

### 2. Custom Editor Rules (contentEditable)
- [ ] **No Editor Libraries**: Uses native contentEditable API (no TipTap, ProseMirror, Quill, Draft.js).
- [ ] **Editor Core**: `EditorCore.tsx` is the ONLY component touching contentEditable directly.
- [ ] **Formatting & Selection**: Handled via `FormattingCommands.ts` and `SelectionManager.ts`.

### 3. Type Safety & Validation
- [ ] **TypeScript**: Zero `any` types. All parameters and return types explicitly typed.
- [ ] **Interfaces vs Types**: `interface` for object shapes, `type` for unions.
- [ ] **Zod Boundaries**: Applied to all incoming HTTP request bodies, MCP tool arguments, Redis events, and Python bridge responses.

### 4. AI & Python Microservice Bridge
- [ ] **FastAPI Bridge**: Express controllers never call FastAPI directly; all HTTP calls pass through `server/src/ai/bridge/pythonBridge.ts`.
- [ ] **Supervised ML**: No reinforcement learning, policy networks, or reward functions. Model updates use labeled supervised fine-tuning.
- [ ] **AI Provider Abstraction**: External AI LLM API calls pass through `server/src/ai/aiClient.ts` configured via `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`.

### 5. Security & Hygiene
- [ ] **No Hardcoded Keys**: Secrets read from `process.env` / `os.getenv`.
- [ ] **Auth**: Managed entirely by Supabase Auth (`authMiddleware.ts`).
- [ ] **Route Protection**: Arcjet protection applied per-router on `/auth/*`, `/ai/*`, `/predictions/*`.
- [ ] **Comments**: All exported functions commented in plain English.
