# IntelliDocs Progress Summary

**Last Updated:** Current Thread  
**Phase:** Phase 5 — AI Suggestion UI / Chatbot ✅ In Progress  
**Status:** Auth ✅ Complete. Editor ✅ Complete. Drive-style Home UI ✅ Complete. Behavior pipeline ✅ Complete. Dataset pipeline ✅ Complete. Base formatting model ✅ Trained. Prediction API ✅ Wired end-to-end. Grammar/spelling ML API ✅ Working. Inline grammar suggestion UI ✅ Working. Grammar/spell quality refinement ✅ In Progress. Backend validation + Arcjet + Redis AI cache/quota ✅ Implemented. Gemini-backed read-only chatbot ✅ Working. Improved chatbot context shaping ✅ Implemented. Backend chat-context test coverage ✅ Added. Chatbot rejection feedback loop ✅ Implemented. Accepted chatbot preview feedback ✅ Logged. Broader chatbot formatting preview support ✅ Covered. Hosting strategy ✅ Defined. Academic paper extraction scaffold ✅ Implemented.

---

## ✅ Completed

### Backend (Express + Supabase)
- ✅ Supabase setup + RLS
- ✅ Document CRUD (MVC strict)
- ✅ Auth routes (login/register)
- ✅ Auth middleware protects `/documents`
- ✅ Types defined for documents

### Hosting / Deployment Strategy
- ✅ Development and groupmate testing will use Cloudflare Tunnel with temporary random URLs
- ✅ Production/capstone defense target is Oracle Cloud Free Tier on ARM Ampere A1
- ✅ Production stack is planned as one VPS instance:
  - Nginx reverse proxy
  - Express serving React build + API
  - FastAPI on `localhost:8000`
  - Redis on `localhost:6379`
  - DuckDB as a local file-based analytical store
- ✅ PM2 will keep Express and FastAPI processes alive
- ✅ Local machine remains a Cloudflare Tunnel hot spare only

### Frontend (React + Vite)
- ✅ AuthContext + useAuth hook
- ✅ Protected routes
- ✅ Login/Register wired to auth
- ✅ Token persistence
- ✅ API client typed (User/DocumentRecord)

### Editor (contentEditable)
- ✅ EditorCore + formatting toolbar
- ✅ Selection handling and formatting commands
- ✅ Lists/blockquote nesting fixes
- ✅ Save/load content to backend
- ✅ Autosave every ~8s (only when content changes)
- ✅ Formatting history tracking and persistence

### Home UI (Drive-style)
- ✅ Split into components:
  - `DriveHeader.tsx`
  - `DriveSidebar.tsx`
  - `DriveSearchSection.tsx`
  - `DriveTable.tsx`
- ✅ Sidebar pills + New button styled
- ✅ Drive-style search + filters
- ✅ Document list with inline rename + delete
- ✅ Row actions use shadcn dropdown

### Behavior Pipeline (Phase 2)
- ✅ Behavior events captured from editor and sent to backend
- ✅ Redis buffer active for real-time event capture
- ✅ Redis now also backs short-lived AI suggestion caching
- ✅ Redis now tracks per-user AI request quotas
- ✅ DuckDB schema + aggregator pipeline
- ✅ Feature extraction to `formatting_features`
- ✅ CSV/Parquet feature exports
- ✅ Manual API triggers: `/behavior/aggregate`, `/behavior/features`, `/behavior/export`

### Dataset + Base ML Model (Phase 3)
- ✅ WikiText-103 downloaded with Hugging Face datasets
- ✅ JFLEG downloaded with Hugging Face datasets
- ✅ Raw dataset snapshots saved under `ml/dataset/raw/`
- ✅ Preprocessing pipeline writes:
  - `formatting_examples.csv`
  - `grammar_examples.csv`
- ✅ Base formatting model trained and saved to `ml/models/base_model.pkl`
- ✅ FastAPI prediction endpoint added in `ml/src/main.py`
- ✅ Python bridge wired into Express
- ✅ Backend prediction route exposed for frontend/backend consumers
- ✅ Academic paper extraction scaffold implemented:
  - `ml/dataset/extract_academic_papers.py` extracts formatting metadata from completed capstone research paper PDFs
  - uses PyMuPDF for font size, bold/italic flags, coordinates, and line context
  - classifies page types such as title, signature, TOC, chapter start, body, and bibliography
  - builds context → format pairs and can merge them with WikiText formatting examples
- ⚠️ Baseline validation accuracy is very high because labels are currently heuristic and should be refined later

### Grammar + Spell Check (Phase 4)
- ✅ `ml/grammar/grammar_checker.py` created
- ✅ `ml/grammar/spell_checker.py` created
- ✅ FastAPI endpoints added:
  - `/grammar/check`
  - `/spelling/check`
- ✅ ML-side curl testing works
- ✅ Express grammar/spelling routes wired through `pythonBridge.ts`
- ✅ Inline editor suggestion overlay added for grammar/spelling issues
- ✅ Suggestion apply/dismiss flow implemented in the editor UI
- ✅ Existing document grammar checks now work without requiring a fresh edit first
- ✅ Grammar/spell quality pass started:
  - obvious unknown words like `asda` / `asdas` are now flagged without unsafe auto-corrections
  - capitalization + missing punctuation are grouped into one sentence-boundary issue when possible
  - non-actionable spelling flags are shown as manual review items instead of one-click replacements
- ⚠️ Grammar model scoring still needs improvement beyond the current baseline rules

### AI Chatbot (Phase 5)
- ✅ `server/src/ai/aiClient.ts` now supports Gemini-backed chat requests
- ✅ `POST /ai/chat` added as an authenticated AI chat endpoint
- ✅ Chat request bodies validated with Zod
- ✅ AI provider errors now surface meaningful messages instead of generic failures
- ✅ Frontend chatbot now calls the real backend endpoint instead of using a placeholder response
- ✅ Short conversation history is sent with chat requests
- ✅ Current chatbot behavior is read-only / advisory only
- ✅ Chatbot uses current document content as context
- ✅ Document context shaping moved into `server/src/skills/buildChatContext.ts`
- ✅ Chatbot system prompt moved into `server/src/ai/prompts/systemPrompts.ts`
- ✅ Chat context now normalizes saved editor HTML into readable excerpts
- ✅ Chat context includes title, document ID, word count, paragraph count, heading count, detected headings, opening excerpt, and recent excerpt
- ✅ Focused Jest coverage added for chat context shaping
- ✅ Chatbot preview rejection feedback loop added for current chat sessions
- ✅ Rejected formatting previews are logged as behavior events such as `chat_preview_rejected:bold`
- ✅ Accepted formatting previews are logged as behavior events such as `chat_preview_accepted:bold`
- ✅ Rejected preview formats are sent back to `/ai/chat` so the prompt can acknowledge prior rejection
- ✅ Repeated rejected previews should be shown again when the user explicitly asks, with copy that reconfirms they want to apply the previously rejected action
- ✅ Chatbot formatting preview apply path now focuses the editor before restoring selection and running formatting commands
- ✅ Non-bold formatting intents now have focused backend test coverage for underline, italic, headings, lists, blockquote, and no-intent messages
- ⚠️ Tool-backed formatting actions are not wired yet

---

## ✅ Testing Confirmed
- Auth flow works end-to-end
- Editor saves and reloads content
- Autosave persists updates
- Manual save button works
- Formatting history saved to `formatting_history`
- Drive-style Home UI loads documents and actions work
- Redis buffer receives behavior events
- DuckDB aggregation and feature extraction complete
- Feature export to CSV/Parquet succeeds
- WikiText-103 and JFLEG download successfully
- Preprocessing produces formatting and grammar datasets
- Base model training completes and saves `ml/models/base_model.pkl`
- FastAPI prediction endpoint returns formatting predictions
- Express prediction route successfully calls the Python bridge
- Grammar endpoint returns grammar scoring payloads
- Spelling endpoint returns structured issue lists
- Spell checker flags obvious unknown non-words while suppressing low-confidence replacement suggestions
- Grammar checker groups related capitalization and terminal punctuation issues into a single actionable issue
- Server build passes after adding Zod validation, Arcjet middleware, `/ai` route alias, and Redis AI cache/quota models
- Gemini-backed chatbot replies successfully through the real backend AI route
- Chatbot now maintains short conversation history across recent turns
- Chatbot document context shaping now has backend unit coverage
- Backend Jest is configured for TypeScript skill tests and ignores generated `dist/` output
- Chatbot rejected-preview loop now logs behavior feedback and reconfirms repeated current-session preview requests
- Chatbot accepted-preview path now logs behavior feedback for applied formatting previews
- Chatbot preview apply now follows the toolbar pattern by focusing the editor before restoring selection
- `npm --prefix server test -- --runInBand` passes for the chat-context and formatting-intent skill tests
- `npm --prefix server run build` passes after the chatbot context refactor, rejection feedback loop, and broader formatting preview support
- `npm --prefix frontend run type-check` passes after the chatbot rejection feedback and editor-focus preview changes
- Provider-side quota/rate-limit errors now return readable messages to the UI

---

## 🐛 Known Issues
- Grammar rule quality still needs improvement beyond the current baseline heuristics
- Grammar/spell quality work has resumed as a focused quality + overlay pass
- Current chatbot is advisory only and cannot apply formatting yet
- Chatbot replies still need live provider QA against real documents after context shaping improvements
- Chatbot rejection feedback is currently session-level and behavior-log based; persistent server-side feedback modeling is still future work
- Rejected chat previews should not make a requested action disappear; only automatic suggestions should suppress previously rejected actions without user re-confirmation

---

## 🚀 Next Step (resume point)
- Continue Phase 5 work from the updated backend foundation
- Chatbot document context shaping now lives in:
  - `server/src/skills/buildChatContext.ts`
  - `server/src/ai/prompts/systemPrompts.ts`
  - `server/src/controllers/aiController.ts`
  - Arcjet-protected AI routes
  - Zod-validated route boundaries
- Keep the chatbot read-only until preview/confirm formatting flows exist
- Next chatbot pass should verify provider output quality against real saved documents
- Later chatbot feedback work should persist accepted/rejected preview outcomes beyond the current frontend session
- Repeated chat requests for a previously rejected preview should prompt for explicit confirmation instead of treating the suggestion as unavailable
- Next ML/data pass should place the completed paper PDFs under `ml/dataset/raw/academic-papers/`, run the implemented extraction scaffold locally, inspect generated labels, then train against the merged formatting dataset
- Future grammar improvement should synthetically corrupt clean WikiText sentences to generate 50,000+ bad → good pairs, but only after the formatting model baseline is improved
- Continue grammar/spell quality as a combined quality + overlay pass:
  - improve unknown-word detection and safe correction filtering
  - group related sentence issues into one actionable flag
  - reduce noisy multi-flag output in the editor panel/overlay
  - keep unsafe replacements as manual review items instead of accepting them automatically
- Expand Redis usage later for autosave dirty-flag coordination and NLP deduplication

---

## 📁 Key Files (Recent)
- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/Document.tsx`
- `frontend/src/components/editor/*`
- `frontend/src/components/editor/SuggestionOverlay.tsx`
- `server/src/controllers/behaviorController.ts`
- `server/src/controllers/predictionController.ts`
- `server/src/routes/behaviorRoutes.ts`
- `server/src/routes/predictionRoutes.ts`
- `server/src/routes/aiRoutes.ts`
- `server/src/controllers/aiController.ts`
- `server/src/skills/buildChatContext.ts`
- `server/src/skills/__tests__/buildChatContext.test.ts`
- `server/src/skills/__tests__/parseFormattingIntent.test.ts`
- `server/src/ai/prompts/systemPrompts.ts`
- `server/jest.config.cjs`
- `server/src/middleware/arcjet.ts`
- `server/src/middleware/validate.ts`
- `server/src/models/aiCacheModel.ts`
- `server/src/models/aiQuotaModel.ts`
- `server/src/ai/aiClient.ts`
- `server/src/ai/bridge/pythonBridge.ts`
- `server/schemas/authSchemas.ts`
- `server/schemas/aiSchemas.ts`
- `server/schemas/documentSchemas.ts`
- `server/schemas/behaviorSchemas.ts`
- `server/schemas/predictionSchemas.ts`
- `frontend/src/components/editor/AIChatbot.tsx`
- `frontend/src/services/api.ts`
- `server/src/skills/runAggregator.ts`
- `server/src/skills/featureExtractor.ts`
- `server/src/skills/featureExport.ts`
- `server/src/skills/predictFormat.ts`
- `ml/aggregator.py`
- `ml/feature_extractor.py`
- `ml/export_features.py`
- `ml/dataset/download.py`
- `ml/dataset/preprocess.py`
- `ml/dataset/extract_academic_papers.py`
- `ml/training/base_trainer.py`
- `ml/src/main.py`
- `ml/grammar/grammar_checker.py`
- `ml/grammar/spell_checker.py`
- `ml/models/base_model.pkl`
- `ml/models/grammar_model.pkl`
- `db/duckdb/behavior.duckdb`

---

## ✅ Next Thread Checklist
- [x] Verify Express grammar/spelling routes
- [x] Wire grammar/spelling into the editor UI
- [x] Add route-level Zod validation on backend request boundaries
- [x] Add Arcjet route protection for auth/AI-facing routes
- [x] Add Redis-backed AI suggestion cache and quota tracking
- [x] Add `/ai/*` route alias without breaking `/predictions/*`
- [x] Resume AI/chatbot implementation from the new backend foundation
- [x] Wire frontend chatbot to the real backend AI route
- [x] Add short conversation history support to chat
- [x] Verify Gemini-backed read-only chatbot works
- [x] Improve chatbot document context shaping
- [x] Add backend test coverage for chatbot context shaping
- [x] Add current-session rejection feedback for chatbot formatting previews
- [x] Add accepted feedback logging for chatbot formatting previews
- [x] Add tests for non-bold chatbot formatting intents
- [x] Focus the editor before applying chatbot formatting previews
- [ ] Keep chatbot read-only until preview/confirm formatting flow is ready
- [ ] Continue improving grammar scoring quality as a grouped overlay-quality pass
- [x] Add unknown-word detection for obvious non-words like `asda`
- [x] Merge related punctuation/capitalization issues into a single actionable issue where appropriate
- [ ] Revisit baseline labels/features to reduce artificial accuracy inflation
