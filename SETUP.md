# IntelliDocs Setup Guide

This guide covers the full local setup flow for IntelliDocs, including:

- frontend
- backend
- ML service
- Redis
- dataset download
- preprocessing
- model training
- common verification steps
- common failure cases

Use this instead of the short Quick Start when you want the full development environment running end-to-end.

---

## 1. What IntelliDocs needs locally

IntelliDocs currently runs as three main local services:

1. **Frontend**
   - React + Vite
   - default URL: `http://localhost:5173`

2. **Backend**
   - Express + TypeScript
   - default URL: `http://localhost:3000`

3. **ML Service**
   - FastAPI + Python
   - default URL: `http://localhost:8000`

It also uses two local data services:

4. **Redis**
   - used for behavior buffering, short-lived suggestion caching, per-user AI quota tracking, and autosave coordination
   - default URL: `redis://localhost:6379`

5. **DuckDB**
   - local analytical store
   - stored as a file under `db/duckdb/`

### Hosting strategy

Development and groupmate testing use **Cloudflare Tunnel**. Temporary random URLs are acceptable during development. The local machine can also act as a hot spare through Cloudflare Tunnel only.

Production and capstone defense target **Oracle Cloud Free Tier**, preferably one ARM Ampere A1 VPS instance. The intended production stack is:

1. **Nginx**
   - public reverse proxy
   - routes frontend/API traffic to Express

2. **Express**
   - serves the React production build
   - serves the backend API
   - runs under PM2

3. **FastAPI**
   - runs locally on the VPS at `localhost:8000`
   - called only by Express through the Python bridge
   - runs under PM2

4. **Redis**
   - runs locally on the VPS at `localhost:6379`

5. **DuckDB**
   - remains file-based
   - does not need a server process

Supabase remains the hosted provider for Auth, PostgreSQL, and pgvector.

---

## 2. Prerequisites

Install these before starting:

- **Git**
- **Node.js 20+**
- **npm**
- **Python 3.12 recommended**
- **Redis**
- **Supabase project access**

### Why Python 3.12 is recommended
The ML stack in this repo works more reliably on Python 3.12 than on newer versions like Python 3.14. If you use a too-new Python version, you may hit compatibility issues with the Hugging Face datasets stack.

---

## 3. Repository layout

Important paths in this repo:

- `frontend/` → Vite React app
- `server/` → Express API
- `ml/` → FastAPI + training scripts
- `db/duckdb/` → DuckDB file and exports
- `ml/dataset/raw/` → downloaded raw datasets
- `ml/dataset/processed/` → processed CSVs
- `ml/models/` → trained ML artifacts

Generated ML artifacts are intentionally kept local and should usually not be committed.

---

## 4. Frontend setup

### Install frontend dependencies
From the repo root:

```bash
cd frontend
npm install
```

### Frontend environment
Create:

- `frontend/.env.local`

Typical values:

```env
VITE_API_URL=http://localhost:3000
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Notes:

- If `VITE_API_URL` is empty or missing, the frontend falls back to `http://localhost:3000`.
- Do not commit real `.env.local` values.

### Run frontend
```bash
cd frontend
npm run dev
```

Default frontend URL:

- `http://localhost:5173`

### Frontend verification
Open the app in the browser and confirm:

- login page loads
- register page loads
- no frontend startup errors
- API requests point to the backend correctly

---

## 5. Backend setup

### Install backend dependencies
```bash
cd server
npm install
```

### Backend environment
Create:

- `server/.env`

The backend currently uses these environment variables:

```env
PORT=3000
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_KEY=YOUR_SUPABASE_SERVICE_KEY
ML_API_URL=http://localhost:8000
REDIS_URL=redis://localhost:6379
PYTHON_BIN=/absolute/path/to/intellidocs/ml/venv/bin/python

AI_PROVIDER=gemini
AI_API_KEY=YOUR_PROVIDER_API_KEY
AI_MODEL=gemini-2.0-flash

ARCJET_KEY=YOUR_ARCJET_SITE_KEY
AI_REQUEST_QUOTA_LIMIT=30
AI_REQUEST_QUOTA_WINDOW_SECONDS=60
```

Important notes:

- `SUPABASE_SERVICE_KEY` is required by the current backend implementation.
- `ML_API_URL` defaults to `http://localhost:8000` if unset.
- `REDIS_URL` must use the `redis://` protocol, not `http://`.
- `PYTHON_BIN` should point to the Python inside your ML virtual environment.
- `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL` are now the only AI provider config values the backend should rely on.
- Do not add `OLLAMA_HOST` back into the backend env.
- `ARCJET_KEY` is optional for local development, but required if you want Arcjet protection active.

### Run backend
Normal backend run:

```bash
cd server
npm run dev
```

Backend run with ML Python path already baked into the script:

```bash
cd server
npm run dev:ml
```

### Backend verification
Check:

- `http://localhost:3000/health`

Expected response:
- JSON health payload
- no boot error in server logs

Also verify:
- login works
- protected routes require auth
- prediction routes respond after ML service is running
- AI routes respond under both `/predictions/*` and `/ai/*`
- auth and AI-facing routes can be protected by Arcjet when `ARCJET_KEY` is set

---

## 6. ML setup

### Create the ML virtual environment
From the repo root:

```bash
python3.12 -m venv ml/venv
```

If `python3.12` is not available, use Python 3.11. Python 3.12 is preferred.

### Install ML dependencies
```bash
ml/venv/bin/pip install -r ml/requirements.txt
```

### Optional: upgrade packaging tools
If dependency installation behaves strangely, run:

```bash
ml/venv/bin/pip install --upgrade pip setuptools wheel
```

### ML environment
You can optionally create:

- `ml/.env`

Common values:

```env
BASE_MODEL_PATH=ml/models/base_model.pkl
GRAMMAR_MODEL_PATH=ml/models/grammar_model.pkl
DUCKDB_PATH=db/duckdb/behavior.duckdb
FEATURE_EXPORT_DIR=db/duckdb/exports
REDIS_URL=redis://localhost:6379
AGGREGATOR_INTERVAL_SECONDS=10
```

These all have defaults in code, so the ML service can still run without setting every value.

---

## 7. Redis setup

Redis is required for the behavior pipeline and now also supports:
- short-lived suggestion caching
- per-user AI quota tracking
- autosave dirty-flag / debounce coordination
- NLP command deduplication

### Verify Redis is installed
```bash
redis-cli ping
```

Expected:
```bash
PONG
```

If Redis is not installed, install it with your OS package manager or use Docker.

### Start Redis
If Redis is installed as a service:
```bash
sudo systemctl start redis
```

Or if you run it directly:
```bash
redis-server
```

### Redis verification
```bash
redis-cli ping
```

Expected:
```bash
PONG
```

---

## 8. Supabase setup

You need a working Supabase project with the required tables and auth enabled.

The backend expects:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

The frontend expects:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Make sure:
- your backend and frontend point to the same Supabase project
- RLS and auth are configured according to your schema
- the `documents` table exists

If login/register works and document CRUD works, your Supabase wiring is likely correct.

---

## 9. Dataset download flow

This project uses:

- **WikiText-103**
  - raw formatting pre-training data
  - currently about 539MB raw
  - produces `base_model.pkl`
- **JFLEG**
  - grammar correction pre-training data
  - currently about 780KB raw
  - produces `grammar_model.pkl`
- **Academic capstone papers**
  - extracted from completed capstone research paper PDFs
  - used to improve academic formatting metadata beyond WikiText heuristics
  - extracted with PyMuPDF

### Download datasets
From repo root:

```bash
ml/venv/bin/python ml/dataset/download.py
```

This should create:

- `ml/dataset/raw/wikitext-103/`
- `ml/dataset/raw/jfleg/`

### Expected outputs
You should see saved JSONL split files such as:

- `ml/dataset/raw/wikitext-103/train.jsonl`
- `ml/dataset/raw/wikitext-103/validation.jsonl`
- `ml/dataset/raw/wikitext-103/test.jsonl`
- `ml/dataset/raw/jfleg/validation.jsonl`
- `ml/dataset/raw/jfleg/test.jsonl`

### Verification
Check that the raw folders contain files:

```bash
ls ml/dataset/raw/wikitext-103
ls ml/dataset/raw/jfleg
```

---

## 10. Preprocessing flow

After datasets are downloaded, preprocess them.

### Run preprocessing
```bash
ml/venv/bin/python ml/dataset/preprocess.py
```

### Expected outputs
This writes:

- `ml/dataset/processed/formatting_examples.csv`
- `ml/dataset/processed/grammar_examples.csv`

### Verification
You should see output showing non-zero row counts.

You can also inspect the files:

```bash
ls ml/dataset/processed
```

---

### Optional: academic paper extraction

Academic-paper extraction adds capstone-specific formatting examples from completed research paper PDFs. This is intended to improve the formatting model with real paper structure such as title pages, signature pages, tables of contents, chapter starts, body text, and bibliography pages.

Put source PDFs here:

```bash
ml/dataset/raw/academic-papers/
```

Run extraction from the repo root:

```bash
ml/venv/bin/python ml/dataset/extract_academic_papers.py
```

Expected outputs:

- `ml/dataset/processed/academic_paper_formatting_examples.csv`
- `ml/dataset/processed/formatting_examples_merged.csv`

The extractor reads PDF line metadata such as:

- font size
- bold flag
- italic flag
- page number
- page type
- nearby line context
- inferred format label

If you only want the academic-paper CSV and do not want to merge it with WikiText yet, run:

```bash
ml/venv/bin/python ml/dataset/extract_academic_papers.py --no-merge
```

To train the formatting model with the merged dataset:

```bash
FORMATTING_DATASET_PATH=ml/dataset/processed/formatting_examples_merged.csv ml/venv/bin/python ml/training/base_trainer.py
```

Keep source PDFs and generated extraction CSVs local unless they are explicitly needed in version control.

## 11. Train the base formatting model

### Run training
```bash
ml/venv/bin/python ml/training/base_trainer.py
```

### Expected output
You should get a trained model saved to:

- `ml/models/base_model.pkl`

### Verification
Check the model file exists:

```bash
ls ml/models
```

You should see:
- `base_model.pkl`

### Note about validation accuracy
The current baseline may report very high validation accuracy because the labels are still heuristic. That does not necessarily mean the model is production-quality.

---

## 12. Train the grammar model

### Run grammar model training
```bash
ml/venv/bin/python ml/grammar/grammar_checker.py
```

### Expected output
This should create:

- `ml/models/grammar_model.pkl`

### Verification
```bash
ls ml/models
```

You should see:
- `grammar_model.pkl`

---

## 13. Run the FastAPI ML service

### Start the ML API
From repo root:

```bash
ml/venv/bin/python ml/src/main.py
```

Default ML API URL:
- `http://localhost:8000`

### Health check
```bash
curl http://localhost:8000/health
```

### ML routes currently available
- `GET /`
- `GET /health`
- `POST /predict`
- `POST /grammar/check`
- `POST /spelling/check`

### Express AI routes currently available
Protected AI-facing routes are exposed by the backend under:
- `POST /predictions/predict`
- `POST /predictions/grammar-check`
- `POST /predictions/spelling-check`

The same handlers are also available under:
- `POST /ai/predict`
- `POST /ai/grammar-check`
- `POST /ai/spelling-check`

### Verify prediction route
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"== Research Notes ==\"}"
```

### Verify grammar route
```bash
curl -X POST http://localhost:8000/grammar/check \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"This are a grammar\"}"
```

### Verify spelling route
```bash
curl -X POST http://localhost:8000/spelling/check \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"Thiss sentense has spleling issues.\"}"
```

---

## 14. Behavior pipeline flow

The current behavior pipeline is:

1. formatting action happens in the editor
2. frontend sends behavior event to backend
3. backend validates the payload before controller execution
4. backend writes event to Redis
5. aggregator moves Redis events into DuckDB
6. feature extractor writes `formatting_features`
7. export script writes CSV/Parquet if needed

### Verify Redis events exist
```bash
redis-cli keys "behavior:*"
```

To inspect a specific list:
```bash
redis-cli lrange "behavior:USER_ID:DOCUMENT_ID" 0 -1
```

---

## 15. Run the aggregator

### Manual one-shot aggregation
Use the backend manual route or run the Python script directly.

Direct Python run:
```bash
ml/venv/bin/python ml/aggregator.py
```

If you use the looped version, it may stay running and aggregate on an interval.

### Verify DuckDB file exists
You should get:

- `db/duckdb/behavior.duckdb`

### Query DuckDB with Python
From repo root:

```bash
python - <<'PY'
import duckdb
con = duckdb.connect('db/duckdb/behavior.duckdb')
rows = con.execute("select * from behavior_events limit 5").fetchall()
print(rows)
con.close()
PY
```

---

## 16. Run feature extraction

### Run extractor
```bash
ml/venv/bin/python ml/feature_extractor.py
```

### Expected result
It writes/updates:
- `formatting_features` table inside DuckDB

### Verify
```bash
python - <<'PY'
import duckdb
con = duckdb.connect('db/duckdb/behavior.duckdb')
rows = con.execute("select * from formatting_features limit 5").fetchall()
print(rows)
con.close()
PY
```

---

## 17. Export features

### Run export
```bash
ml/venv/bin/python ml/export_features.py
```

### Expected outputs
- `db/duckdb/exports/formatting_features.csv`
- `db/duckdb/exports/formatting_features.parquet`

### Verify
```bash
ls db/duckdb/exports
```

---

## 18. Start the full local stack

Use three terminals.

### Terminal 1 — frontend
```bash
cd frontend
npm run dev
```

### Notes on backend protection and validation
- Request bodies are validated at HTTP boundaries before controllers run.
- Python FastAPI responses are validated before the backend uses them.
- Route-level protection is applied per router, not globally.
- Arcjet currently belongs on auth-facing and AI-facing backend routes.
- Redis and Arcjet are complementary:
  - Arcjet = request-layer protection
  - Redis = application-layer state, cache, quota, and debounce support

### Terminal 2 — backend
Use the ML-aware backend command if available:
```bash
cd server
npm run dev:ml
```

If you use plain `npm run dev`, make sure `PYTHON_BIN` is set in your shell.

### Terminal 3 — ML API
```bash
ml/venv/bin/python ml/src/main.py
```

### Optional Terminal 4 — Redis
If Redis is not running as a service:
```bash
redis-server
```

---

## 19. Full system smoke test

After all services are up:

1. open frontend
2. register or log in
3. create a document
4. type in the editor
5. apply formatting
6. confirm autosave works
7. open grammar/spell check panel
8. run prediction
9. verify backend and ML responses
10. verify Redis receives events
11. run aggregator if needed
12. verify DuckDB gets rows

---

## 20. Common problems and fixes

### Problem: frontend uses wrong backend URL
Check:
- `frontend/.env.local`
- `VITE_API_URL`

If blank or missing, it falls back to:
- `http://localhost:3000`

Restart Vite after changing env values.

---

### Problem: Redis says invalid protocol
Your `REDIS_URL` is wrong.

Wrong:
```env
REDIS_URL=http://localhost:6379
```

Correct:
```env
REDIS_URL=redis://localhost:6379
```

---

### Problem: ML service says `ModuleNotFoundError`
Usually caused by:
- using the wrong Python
- not using the ML venv
- Python import path mismatch

Always prefer:
```bash
ml/venv/bin/python ...
```

---

### Problem: backend cannot run Python ML scripts
Set:
```env
PYTHON_BIN=/absolute/path/to/intellidocs/ml/venv/bin/python
```

Or use:
```bash
cd server
npm run dev:ml
```

---

### Problem: dataset download fails with Python package errors
You are probably using a bad Python version for the ML venv.

Recommended:
- Python 3.12

Then recreate the venv:
```bash
rm -rf ml/venv
python3.12 -m venv ml/venv
ml/venv/bin/pip install -r ml/requirements.txt
```

---

### Problem: preprocessing writes zero rows
That means dataset download failed or raw files are missing.

Check:
- `ml/dataset/raw/wikitext-103/`
- `ml/dataset/raw/jfleg/`

Do not run preprocessing before download succeeds.

---

### Problem: Git push rejected because files are too large
Do not commit generated ML artifacts.

Ignore these:
- `ml/dataset/raw/`
- `ml/dataset/processed/`
- `ml/models/*.pkl`
- `ml/models/user_models/`

The repo should contain:
- scripts
- code
- configs
- documentation

not generated training artifacts.

---

### Problem: grammar endpoint works but quality is weak
That is expected for the current baseline.

Current grammar support is:
- a baseline rule-based detector
- still improving

Wiring success and model quality are different things.

---

## 21. Recommended setup order

If you are starting from zero, use this order:

1. clone repo
2. install frontend deps
3. install backend deps
4. create ML venv
5. install ML deps
6. configure frontend env
7. configure server env
8. start Redis
9. verify backend health
10. download datasets
11. preprocess datasets
12. train base model
13. train grammar model
14. start ML API
15. start backend
16. start frontend
17. run smoke test

---

## 22. Minimal daily workflow

Once everything is already installed, your usual local workflow is:

### Start Redis
```bash
redis-server
```

or ensure the service is running.

### Start ML API
```bash
ml/venv/bin/python ml/src/main.py
```

### Start backend
```bash
cd server
npm run dev:ml
```

### Start frontend
```bash
cd frontend
npm run dev
```

---

## 23. Files you should usually not commit

Keep these local unless you intentionally need them in version control:

- `ml/dataset/raw/`
- `ml/dataset/processed/`
- `ml/models/*.pkl`
- `ml/models/user_models/`
- local `.env` files
- any temporary Base44 dump or mockup workspace

---

## 24. Final note

If something breaks, verify each layer separately instead of guessing:

1. frontend request
2. backend route
3. Python bridge
4. ML API route
5. Redis or DuckDB output

Do not assume a plausible diff means the system works. Run it and check.

For deployment-specific checks, verify each service separately before exposing the VPS publicly:

1. Nginx reverse proxy route
2. Express health route and API routes
3. React production build served by Express
4. FastAPI health route on `localhost:8000`
5. Redis connection on `localhost:6379`
6. PM2 process status for Express and FastAPI
7. Supabase Auth and document access
8. Arcjet-protected auth and AI-facing routes when `ARCJET_KEY` is configured