# IntelliDocs — IDE Context & Development Guide
> Read this before generating or suggesting any code.
> This is the single source of truth for the entire project.

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
- Redis — live behavior buffer (real-time formatting events)
- DuckDB — analytical store for ML training data

### AI / ML
- Python 3 + FastAPI — ML prediction microservice
- scikit-learn + PyTorch — hybrid rule-based + neural model
- Ollama (qwen2.5:7b) — local AI brain during development
- Claude API — AI brain for research demo and production
- MCP server (Express) — exposes app tools to AI brain

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

## System Features

1. Custom contentEditable Document Editor
2. Behavioral Tracking and Formatting Learning
3. ML-Based Formatting Prediction with Confidence Scoring
4. User Transparency and Suggestion Presentation
5. Natural Language Command Interface
6. Continuous Learning from User Feedback
7. Context-Aware Editing Assistance
8. Real-Time Document Editing with Auto-Save
9. Cloud-Based Document Storage and Organization
10. Grammar and Spell Check Assistance
11. AI-Assisted Content Scaffolding

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
├── client/                           ← React 18 + Vite (View layer)
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
│   │   ├── skills/                   ← single-purpose async functions
│   │   │   ├── behaviorTracker.ts
│   │   │   ├── formatPredictor.ts
│   │   │   ├── nlpCommands.ts
│   │   │   ├── feedbackLoop.ts
│   │   │   ├── featureExtractor.ts
│   │   │   └── stream.ts
│   │   ├── bridge/
│   │   │   └── pythonBridge.ts       ← HTTP calls to FastAPI only
│   │   ├── memory/
│   │   │   └── vectorStore.ts        ← pgvector RAG queries
│   │   └── prompts/
│   │       └── systemPrompts.ts      ← ALL prompt strings live here
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
│   ├── config/
│   │   ├── db.ts                     ← Supabase client setup
│   │   └── env.ts                    ← environment variables
│   ├── middleware/
│   │   ├── authMiddleware.ts         ← verify Supabase JWT
│   │   └── errorHandler.ts          ← global error handling
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
│   ├── predict.py                    ← FastAPI prediction endpoint
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

Support two providers via `AI_PROVIDER` env variable:
- `"ollama"` → development (local GPU, free)
- `"gemini"` → production (Gemini free tier)

#### 2. Environment Variables

**server/.env.development**
```
AI_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
```

**server/.env.production**
```
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key_from_aistudio.google.com
GEMINI_MODEL=gemini-1.5-flash
```

#### 3. Dependencies
- Ollama: `ollama` (npm package)
- Gemini: `@google/generative-ai`

#### 4. AI Client Interface

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface AIResponse {
  text: string
  provider: 'ollama' | 'gemini'
  model: string
}

type AIProvider = 'ollama' | 'gemini'

interface AIClient {
  // Send a message and get a response
  chat(
    messages: Message[],
    systemPrompt?: string
  ): Promise<string>

  // Send a message and stream the response
  // for real-time chatbot responses
  stream(
    messages: Message[],
    systemPrompt?: string,
    onChunk: (chunk: string) => void
  ): Promise<void>
}
```

#### 5. Rules
- No `any` types
- Every function explicitly typed
- Comment every function in plain English
- Keep `aiClient.ts` under 80 lines
- Handle errors with try/catch
- Log which provider is active on server start:
  ```
  console.log(`AI Provider: ${process.env.AI_PROVIDER}`)
  console.log(`Model: ${process.env.AI_PROVIDER === 'ollama' 
    ? process.env.OLLAMA_MODEL 
    : process.env.GEMINI_MODEL}`)
  ```
- Throw a clear error if `AI_PROVIDER` is not set
- Never hardcode API keys

#### 6. Provider Transparency
- MCP tools in `server/src/mcp/tools/` must work identically regardless of provider
- Skill files in `server/src/ai/skills/` must work identically regardless of provider
- Provider switch is invisible to them — they only call `aiClient`

---

## Coding Conventions

- No any types in TypeScript — ever
- All function parameters and return types must be explicitly typed
- Use interface for object shapes, type for unions
- Comment every function in plain English
- Keep files under 80 lines where possible
- Controllers never call DB directly — always through models
- Controllers never call Python directly — always through pythonBridge.ts
- No logic in route files
- Skills are single-purpose — one export per file
- New skills need a matching test in __tests__/
- All prompt strings in systemPrompts.ts — never inline
- Never commit API keys, Supabase URL, or anon key
- Never build custom auth — Supabase handles it
- Do not modify .env — reference process.env by name only

---

## Hosting Plan

| Service           | Platform              | Cost                    |
|-------------------|-----------------------|-------------------------|
| React front-end   | Vercel                | Free                    |
| Express           | DigitalOcean          | paid (???)              |
| Express           | DigitalOcean          | Free                    |
| Python FastAPI    | Azure                 | Free                    |
| PostgreSQL + Auth | Supabase              | Free tier               |
| AI (dev)          | Ollama qwen2.5:7b     | Free (local GPU)        |
| AI (demo)         | Claude API            | Pay per token           |

---

## Developer Machine

- OS: Nobara Linux (NVIDIA drivers pre-installed)
- RAM: 16GB
- GPU: RTX 3050 desktop, 6GB VRAM
- Ollama model: qwen2.5:7b (~4.7GB VRAM, runs fully on GPU)
- RAM stays free for all services when Ollama runs on GPU

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
  26. Ollama + OpenClaw for local dev testing

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
- Keep Ollama off when not testing the chatbot to save RAM
- Run nvidia-smi to verify Ollama is using GPU not RAM
- sync-ai script: cp AGENTS.md .github/copilot-instructions.md
