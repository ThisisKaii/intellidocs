# IntelliDocs Complete System Verification & Testing Guide

## 1. Environment & Recommended Model
- **Agent Model to use in Freebuff**: `DeepSeek V4.1 Flash` (or `Claude Haiku 5.5` on paid tier).
- **Backend AI Provider**: NVIDIA NIM with `AI_MODEL=meta/llama-3.2-11b-vision-instruct` configured in `server/.env`.
- **Test Credentials**: `test@test.com` / `asd123`
- **Test Document ID**: `a3c5c8ac-29c6-4f9a-a996-884ba169f81d`

---

## 2. Server Startup Check
Before running any tests, make sure all three servers are active:
1. **ML Microservice** (FastAPI on Port 8001):
   ```bash
   cd ml && source venv/bin/activate && python src/main.py
   # or on Windows:
   ml\venv\Scripts\python.exe ml\src\main.py --port 8001
   ```
2. **Backend Server** (Express on Port 3000):
   ```bash
   cd server && npm run dev
   ```
3. **Frontend Client** (Vite on Port 5173):
   ```bash
   cd frontend && npm run dev
   ```

Health Probe check:
- `curl http://localhost:8001/health` -> returns `{"status": "OK"}`
- `curl http://localhost:3000/api/health` -> returns `{"status": "ok"}`

---

## 3. One-Command Master Automated Test
To execute the automated end-to-end test suite across all 6 subsystems:
```powershell
$env:PYTHONIOENCODING='utf-8'; ml\venv\Scripts\python.exe tests\e2e\run_full_system_test.py
```
This script tests:
- **Suite 1**: AI Chatbot bulk formatting, APA style, and "format the rest" continuations.
- **Suite 2**: Idle state popups, grammar underlines, scanner highlights, and collision chooser.
- **Suite 3**: Professor Dashboard, all 5 tabs, class folder filtering, and Similarity Matrix.
- **Suite 4**: Table insertion, row/col operations, and all 6 Image Wrap modes.
- **Suite 5**: Python ML service predictions and compliance checks.
- **Suite 6**: Node.js intent parser (22/22 Jest tests).

---

## 4. Manual / Step-by-Step Verification Guide

### Area A: Editor, Autonomous Formatting & Grammar
1. Navigate to `http://localhost:5173/document/a3c5c8ac-29c6-4f9a-a996-884ba169f81d`.
2. **Autonomous Formatting**:
   - Type `Introduction` on an empty line and press Enter.
   - Wait ~3 seconds: a blue dashed outline (`.agentic-highlight-overlay`) should outline the block.
   - Click the outline: the `InlineSuggestionChip` (pill) should appear showing `Heading 1 · 95%`. Click "Apply" to convert it.
3. **Grammar & Spell Checking**:
   - Type `teh quick brown fox`.
   - Wait ~2.5 seconds: a wavy red/amber underline appears under `teh`.
   - Click the wavy underline: `GrammarOverlay` opens showing `the` with [Apply] and [Ignore] buttons.

### Area B: Table Options & Image Text Wrapping
1. **Tables**:
   - In the top toolbar, click the **Table** icon.
   - Click **Insert Table**: verify a 3×3 table with a header row is inserted into the editor.
   - Click into any table cell and open the Table menu again: verify options to "Add Row Before/After", "Add Column Before/After", and "Table Styles".
2. **Images & Text Wrapping**:
   - In the top toolbar, click the **Image** icon.
   - Verify alignment options: Left, Center, Right, Full Width.
   - Verify **Text Wrapping** modes are present:
     `inline`, `square`, `tight`, `top-bottom`, `behind`, and `in-front`.

### Area C: AI Chatbot & Continuations
1. Open the right sidebar and select the **AI Assistant** tab.
2. Type: `"Format the entire document into APA style"`
   - Verify: An actionable `PREVIEW SUGGESTION` card appears with [Apply] and [Reject] buttons. Click **Apply**.
3. Type: `"Now format all headings and make them bold and centered"`
   - Verify: A scoped preview card (`Bold + Align Center — all headings`) appears. Click **Apply**.
4. Type: `"Can you format the rest of the document for me automatically?"`
   - Verify: The chatbot detects continuation and renders an actionable `Preview Suggestion` card (`Bold + Align Center — entire document`) with [Apply] and [Reject] buttons (no instructional prose fallback).

### Area D: Professor Dashboard, Similarity Matrix & Forensics
1. Navigate to `http://localhost:5173/professor`.
2. Verify all 5 tabs render:
   - `Template Rubrics`
   - `Compliance Audit`
   - `Document Reviews`
   - `Classroom Folders`
   - `Similarity Matrix`
3. Click **Similarity Matrix**:
   - Verify the tab loads without an infinite spinner.
   - Select a class folder from the dropdown and click **"Scan submissions"**.
   - Verify the 5-judge Council completes deliberations and updates the similarity score matrix.
4. Click on any student row in the matrix to open the **Council Inspection Modal**:
   - **Transcript Tab**: Deliberations of the 5 judges (Forensic Linguist, Domain Specialist, Rhetorical Analyst, Attribution Auditor, Juror Arbiter).
   - **Forensics Tab**: Authorship verdict (`Original Author` vs. `Derivative Paste`), typing speed, typing events, bulk paste bursts, and paragraph-level attribution.
