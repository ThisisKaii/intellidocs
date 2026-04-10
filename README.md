# IntelliDocs

> An intelligent document editor that learns your formatting behavior and automatically suggests improvements.

## What is IntelliDocs?

IntelliDocs is a research system designed to answer a simple question: **Can an editor learn how you format documents and predict your next formatting choice?**

Unlike Word or Google Docs, IntelliDocs fills a specific gap: it's the first editor to combine machine learning with behavioral analysis to predict and suggest formatting automatically—before you even apply it.

### Key Features

- Custom Editor - Built from scratch with the contentEditable API (no pre-built editor libraries)
- ML-Powered Predictions - Learns your formatting patterns over time
- Grammar & Spell Check - Real-time writing assistance
- AI Chatbot - Natural language commands to format your document
- Behavioral Insights - Understand how you format and why
- Real-Time Sync - Auto-save to cloud with Supabase
- Research-Ready - Built for academic validation and user studies

---

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.10+
- Git
- A Supabase account (free tier works)

### Installation

```bash
# Clone the repository
git clone https://github.com/ThisisKaii/intellidocs.git
cd intellidocs

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install backend dependencies
cd server && npm install && cd ..

# Install ML dependencies
cd ml
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### Running the System

Open three terminals:

**Terminal 1 - Frontend (React)**
```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
```

**Terminal 2 - Backend (Express)**
```bash
cd server
npm run dev
# Runs on http://localhost:3000
```

**Terminal 3 - ML API (FastAPI)**
```bash
cd ml
source venv/bin/activate
python src/main.py
# Runs on http://localhost:8000
```

Visit http://localhost:5173 in your browser to get started!

---

## Architecture

IntelliDocs is built with **strict MVC separation** across three main services:

### Frontend (React + Vite)
- Custom contentEditable editor (no TipTap, Quill, or ProseMirror)
- Real-time suggestion overlays with confidence scores
- Floating AI chatbot for natural language commands
- Document management and user authentication

### Backend (Node.js + Express)
- Document CRUD operations
- User behavior tracking
- ML prediction orchestration
- MCP server for AI tool integration
- JWT-based authentication

### ML Service (Python + FastAPI)
- Formatting prediction model (pre-trained on WikiText-103)
- Grammar checking (trained on JFLEG dataset)
- User behavior fine-tuning
- Real-time spell checking

### Database Layer
- **Supabase** - PostgreSQL + pgvector for embeddings
- **Redis** - Real-time behavior buffering
- **DuckDB** - Analytical data storage for ML training

---

## Research Goals

This is a **capstone research system** designed to validate 5 key research questions:

| RQ | Question | Measurement |
|---|---|---|
| RQ1 | Can we predict formatting with >70% accuracy? | Accept/reject logs |
| RQ2 | Does AI reduce formatting time? | Session timing data |
| RQ3 | Do users trust AI suggestions? | Survey responses |
| RQ4 | What UI patterns feel least intrusive? | User observation |
| RQ5 | How much data is needed for prediction? | Early accuracy curves |

---

## Tech Stack

| Component | Technology | Why |
|---|---|---|
| Editor | contentEditable API | Custom control + research flexibility |
| Frontend | React 18 + Vite | Fast, typed, modern |
| Backend | Express + TypeScript | Simple, reliable, type-safe |
| Database | Supabase | Built-in auth + pgvector for embeddings |
| ML | Python + scikit-learn | Best ML libraries available |
| Prediction | PyTorch | Neural networks for pattern recognition |
| Grammar | pyspellchecker + JFLEG | Pre-trained models ready to use |
| AI Chat | Ollama / Gemini API | Local dev (Ollama) + cloud production (Gemini) |

---

## Documentation

- **[AGENTS.md](./AGENTS.md)** - Technical guide for developers and AI tools
- **[Folder Structure](./AGENTS.md#folder-structure)** - Complete codebase layout
- **[Build Order](./AGENTS.md#build-order)** - 8-phase development roadmap
- **[MVC Architecture](./AGENTS.md#mvc-architecture)** - Strict separation of concerns
- **[Coding Conventions](./AGENTS.md#coding-conventions)** - Standards and rules

---

## Development Roadmap

### Phase 1: Foundation
- Supabase setup with database
- Express CRUD for documents
- Supabase Auth integration
- React pages (Login, Home, Editor)
- Custom contentEditable editor

### Phase 2: Behavior Pipeline
- Redis event logger
- DuckDB schema
- Behavior feature extraction

### Phase 3: ML Training
- Download WikiText-103 dataset
- Pre-train base formatting model
- FastAPI prediction endpoint

### Phase 4: Grammar & Spelling
- Grammar checker (JFLEG-trained)
- Spell checker integration
- Inline suggestions in editor

### Phase 5: AI Suggestions
- Confidence score display
- Suggestion overlay UI
- Diff preview + confirm/reject

### Phase 6: MCP Chatbot
- Model Context Protocol setup
- Natural language commands
- AI-assisted formatting

### Phase 7: Learning Loop
- User feedback capture
- Per-user model fine-tuning
- Accuracy improvement tracking

### Phase 8: Testing & Deploy
- Automated test suite
- Production deployment
- Research validation

---

## For Researchers

IntelliDocs is designed to be a complete research platform:

- **User Study Ready** - Built-in session tracking and behavior logging
- **Data Privacy** - Row-level security with Supabase RLS
- **Reproducible** - All models pre-trained on public datasets
- **Extensible** - Easy to add new ML models or UI experiments
- **Measurable** - Every interaction logged and timestamped

### Collecting Research Data

1. **Formatting Behavior** - Captured in `behavior_events` table
2. **Prediction Accuracy** - Tracked in `ml_predictions` table with feedback
3. **User Sessions** - Timestamped with document and user context
4. **Model Performance** - Real-time accuracy improvements over time

---

## Security & Privacy

- **No custom auth** - Delegated to Supabase Auth
- **RLS policies** - Row-level security on all tables
- **No API keys in code** - All keys in `.env` (gitignored)
- **pgvector embeddings** - Secure embedding storage
- **JWT tokens** - Secure session management

---

## System Requirements

### Development Machine
- OS: Linux, macOS, or Windows
- RAM: 8GB minimum (16GB recommended)
- GPU: Optional (for running Ollama locally)
- Node.js: 20+
- Python: 3.10+

### Production Deployment
- Frontend: Vercel (free)
- Backend: DigitalOcean or similar
- ML Service: Azure or similar
- Database: Supabase (free tier)

---

## License

This is a capstone research project. See your institution's guidelines for licensing.

---

## Author

**Joshua Asingua**
Capstone Research Project
Built with dedication for better document editing

---

## Contributing

This is a capstone project. For contributions, please contact the maintainer.

---

## Support

For technical documentation, see [AGENTS.md](./AGENTS.md)
For setup issues, check the [Quick Start](#quick-start) section
For research collaboration, reach out via GitHub issues