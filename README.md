# IntelliDocs

> An intelligent document editor that learns your formatting behavior and automatically predicts formatting with confidence scoring.

---

## What is IntelliDocs?

IntelliDocs is a capstone research system — an intelligent web-based document editor that learns individual user formatting behavior over time and automatically suggests formatting choices with confidence scoring.

It is built specifically for students and professors writing academic research documents (theses, capstones, manuscripts).

### The Problem It Solves

Existing editors (Microsoft Word, Google Docs, Grammarly, ChatGPT) do not learn an individual user's formatting habits. They either rely on static rules or react to one-off natural language prompts. IntelliDocs fills this specific gap: it continuously captures behavior, personalizes a hybrid ML model per user, and predicts formatting choices automatically before the user even applies them.

---

## Key Features

- **TipTap Document Editor**: Rebuilt with a clean single top-level `useEditor` reactive state hook, custom `EditorCanvas` presenter, and rich extensions.
- **Glassmorphic Floating Toolbar**: Modern translucent pill toolbar featuring custom interactive popovers, font/size steppers, swatch pickers, table tools, and page layout presets.
- **Custom `IndentExtension`**: Native TipTap indent/outdent extension supporting `Tab` / `Shift+Tab` keyboard shortcuts, paragraph margin-left levels, and list item nesting.
- **Direct File Import Module**: Import local `.docx`, `.pdf`, `.txt`, and `.html` documents directly into the active editor instance using the toolbar import button.
- **Hybrid ML Prediction**: Combines a **RandomForest** classifier for fast instance-level text feature classification with an **LSTM** network for sequential behavioral modeling.
- **Supervised Fine-Tuning**: Personalizes predictions per user using supervised feedback (accepted vs. rejected suggestions).
- **Grammar & Spell Checking**: Real-time writing assistance trained on the JFLEG dataset and `pyspellchecker`.
- **Professor Review System**: Professors can review submitted student documents, highlight text, leave comments, and assign grades with automated student notifications.
- **AI Chatbot Overlay**: Natural language assistant using Model Context Protocol (MCP) tool orchestration.
- **Real-Time Collaboration**: Collaborative editing engine powered by Yjs CRDT and WebSockets (`y-websocket`).

---

## Tech Stack Overview

| Tier | Technologies |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, TipTap 3, Shadcn/ui, Tailwind CSS, Yjs CRDT |
| **Backend** | Node.js 20, Express, TypeScript, Zod validation, Arcjet security middleware, Mammoth docx converter |
| **ML Microservice** | Python 3, FastAPI, scikit-learn, PyTorch (LSTM), PyMuPDF, NLTK |
| **Databases** | **Supabase** (PostgreSQL + Auth + RLS), **Redis** (Behavior buffer & quota), **DuckDB** (Analytical feature store) |
| **AI / LLM** | Provider-abstracted API client (`aiClient.ts` targeting Gemini Flash and external providers) via MCP |

---

## Quick Start

For detailed setup instructions, see **[SETUP.md](./SETUP.md)**.

### Prerequisites
- Node.js 20+
- Python 3.10+
- Redis server
- Supabase account (free tier)

### 3-Terminal Development Setup

**Terminal 1 — Frontend (React + Vite)**
```bash
cd frontend
npm install
npm run dev
# Running on http://localhost:5173
```

**Terminal 2 — Backend (Express)**
```bash
cd server
npm install
npm run dev
# Running on http://localhost:3000
```

**Terminal 3 — ML API (FastAPI)**
```bash
cd ml
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python src/main.py
# Running on http://localhost:8000
```

---

## Research Context

IntelliDocs is an academic capstone research system designed to evaluate 5 core Research Questions (RQs):

| RQ | Question | Measurement |
|---|---|---|
| **RQ1** | ML Prediction Accuracy | Accept/reject feedback logs |
| **RQ2** | Formatting Time Reduction | Automated session timing |
| **RQ3** | User Perception of AI | Surveys & interview feedback |
| **RQ4** | Non-intrusive UI Patterns | UX observation & diff preview adoption |
| **RQ5** | Minimum Data Required | Personalization curves over time |

---

## Architecture & Code Standards

IntelliDocs enforces strict architectural principles across all services:
- **Strict MVC**: Routes only handle URL mapping and Zod validation; Controllers handle req/res; Models handle database access.
- **Python Microservice Separation**: Python never shares a process with Node — communication happens strictly via HTTP (`pythonBridge.ts`).
- **No `any` Types**: Strict TypeScript type definitions throughout frontend and server.

For complete technical specifications and development rules, refer to **[AGENTS.md](./AGENTS.md)**.

---

## License & Author

**Author**: Joshua Asingua  
**Project**: Capstone Research Project  
*See institutional guidelines for licensing details.*