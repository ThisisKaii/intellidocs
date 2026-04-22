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

- Editor must be built from scratch using contentEditable API
  Do NOT use TipTap, ProseMirror, Quill, or any pre-built editor library
  Build the toolbar, formatting commands, and selection handling manually
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
- contentEditable API (the custom editor)

### Back-end
- Node.js 20 + Express
- TypeScript

### Databases
- Supabase — PostgreSQL + pgvector + Auth + Realtime
  Supabase Auth handles ALL authentication (no custom auth)
  pgvector enabled for embedding storage
  Realtime for auto-save functionality
  Never commit Supabase URL or anon key
- Redis — behavior buffer, suggestion cache, debounced auto-save dirty flags,
  per-user AI quota tracking, and NLP command deduplication
- DuckDB — analytical store for ML training data

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
│   │   │   ├── editor/               ← custom contentEditable editor
│   │   │   │   ├── EditorCore.tsx    ← contentEditable div + event handlers
│   │   │   │   ├── Toolbar.tsx       ← bold, italic, heading buttons
│   │   │   │   ├── SelectionManager.ts  ← handles text selection
│   │   │   │   ├── FormattingCommands.ts← applies formatting to selection
│   │   │   │   ├── BehaviorListener.ts  ← fires events on every format action
│   │   │   │   └── SuggestionOverlay.tsx← confidence-scored suggestion UI
│   │   │   ├── ChatOverlay/          ← floating AI chatbot
│   │   │   │   ├── ChatBubble.tsx    ← collapsed corner button
│   │   │   │   ├── ChatPanel.tsx     ← messages + input
│   │   │   │   ├── DiffPreview.tsx   ← before/after formatting diff
│   │   │   │   ├── ConfirmBar.tsx    ← apply/reject buttons
│   │   │   │   └── useChatOverlay.ts ← state machine (collapsed/expanded/previewing)
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
│   │   └── predictionModel.ts        ← DuckDB queries
│   ├── controllers/                  ← request handlers (Controller layer)
│   │   ├── authController.ts
│   │   ├── documentController.ts
│   │   ├── behaviorController.ts
│   │   └── predictionController.ts
│   ├── routes/                       ← URL mapping only, no logic
│   │   ├── authRoutes.ts
│   │   ├── documentRoutes.ts
│   │   └── aiRoutes.ts
│   ├── ai/
│   │   ├── aiClient.ts               ← external provider abstraction
│   │   ├── bridge/
│   │   │   └── pythonBridge.ts       ← HTTP calls to FastAPI only
│   │   ├── skills/                   ← single-purpose async functions
│   │   │   ├── behaviorTracker.ts
│   │   │   ├── formatPredictor.ts
│   │   │   ├── nlpCommands.ts
│   │   │   ├── feedbackLoop.ts
│   │   │   ├── featureExtractor.ts
│   │   │   └── stream.ts
│   │   ├── memory/
│   │   │   └── vectorStore.ts        ← pgvector RAG queries
│   │   └── prompts/
│   │       └── systemPrompts.ts      ← ALL prompt strings live here
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
│   ├── redis/
│   │   └── behaviorBuffer.ts         ← real-time event capture
│   ├── schemas/                      ← Zod schemas for external boundaries
│   │   ├── authSchemas.ts
│   │   ├── behaviorSchemas.ts
│   │   ├── documentSchemas.ts
│   │   └── predictionSchemas.ts
│   ├── config/
│   │   ├── db.ts                     ← Supabase client setup
│   │   └── env.ts                    ← environment variables
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

## Custom Editor Rules (contentEditable)

- NEVER use TipTap, ProseMirror, Quill, or any editor library
- Use browser's native contentEditable API
- Use document.execCommand() or Selection API for formatting
- EditorCore.tsx is the only file that touches contentEditable
- All formatting goes through FormattingCommands.ts
- All behavior events go through BehaviorListener.ts
- SuggestionOverlay renders inside the editor, not outside it

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

- ChatOverlay has exactly 3 states: collapsed, expanded, previewing
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
  - ChatOverlay chatbot (MCP tool orchestration)
  - Natural language command interpretation

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

#### 3. Provider Requirements
- Provider must support native function calling / tool use
- Provider must work with MCP tool definitions
- Provider selection is controlled only by `AI_PROVIDER`
- `aiClient.ts` is the only provider switch point

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
- The custom editor must stay `contentEditable`-based
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
  5. Custom contentEditable editor (EditorCore + Toolbar)
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
  18. Display inline in editor via SuggestionOverlay

Phase 5 — AI Suggestion UI
  19. SuggestionBar with confidence score display
  20. SuggestionOverlay inside editor
  21. DiffPreview + ConfirmBar components
  22. ChatOverlay (ChatBubble, ChatPanel, useChatOverlay)

Phase 6 — MCP Chatbot
  23. MCP server setup (mcpServer.ts)
  24. All 6 MCP tools
  25. Wire ChatOverlay to MCP server
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
- Editor must use contentEditable — no editor libraries
- ML must be pre-trained on a real dataset before user fine-tuning
- MVC is strictly enforced — panel will check this
- Supabase free tier pauses after 1 week of inactivity
- Arcjet is entry-level protection only; keep it scoped to the routes that need it
- Redis now serves both behavior-pipeline and app-layer AI responsibilities
- Zod belongs at external boundaries, not internal TypeScript calls
- sync-ai script: cp AGENTS.md .github/copilot-instructions.md
- Generated ML data should stay local unless explicitly needed: `ml/dataset/raw/`, `ml/dataset/processed/`, `ml/models/*.pkl`
- Keep provider-specific logic isolated inside `server/src/ai/aiClient.ts`