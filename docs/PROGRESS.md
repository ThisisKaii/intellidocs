# IntelliDocs Progress Summary

**Last Updated:** Current Thread  
**Phase:** Phase 3 — Dataset + Base ML Model (Steps 10–12) ✅ In Progress  
**Status:** Auth ✅ Complete. Editor ✅ Complete. Drive-style Home UI ✅ Complete. Behavior pipeline ✅ Complete. Dataset pipeline ✅ Complete. Base formatting model ✅ Trained.

---

## ✅ Completed

### Backend (Express + Supabase)
- ✅ Supabase setup + RLS
- ✅ Document CRUD (MVC strict)
- ✅ Auth routes (login/register)
- ✅ Auth middleware protects `/documents`
- ✅ Types defined for documents

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
- ⚠️ Baseline validation accuracy is very high because labels are currently heuristic and should be refined later

---

## ✅ Testing Confirmed
- Auth flow works end-to-end
- Editor saves and reloads content
- Autosave persists updates
- Formatting history saved to `formatting_history`
- Drive-style Home UI loads documents and actions work
- Redis buffer receives behavior events
- DuckDB aggregation and feature extraction complete
- Feature export to CSV/Parquet succeeds
- WikiText-103 and JFLEG download successfully
- Preprocessing produces formatting and grammar datasets
- Base model training completes and saves `ml/models/base_model.pkl`

---

## 🐛 Known Issues
- None reported after latest UI fixes

---

## 🚀 Next Step (Phase 3: Steps 13–14)
- Add FastAPI prediction endpoint for the base model
- Wire the Python bridge into Express
- Expose prediction through backend routes/controllers

---

## 📁 Key Files (Recent)
- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/Document.tsx`
- `frontend/src/components/editor/*`
- `server/src/controllers/behaviorController.ts`
- `server/src/routes/behaviorRoutes.ts`
- `server/src/skills/runAggregator.ts`
- `server/src/skills/featureExtractor.ts`
- `server/src/skills/featureExport.ts`
- `ml/aggregator.py`
- `ml/feature_extractor.py`
- `ml/export_features.py`
- `ml/dataset/download.py`
- `ml/dataset/preprocess.py`
- `ml/training/base_trainer.py`
- `ml/models/base_model.pkl`
- `db/duckdb/behavior.duckdb`

---

## ✅ Next Thread Checklist
- [ ] Add FastAPI prediction endpoint
- [ ] Wire Python bridge into Express
- [ ] Expose prediction route for backend consumers
- [ ] Revisit baseline labels/features to reduce artificial accuracy inflation
