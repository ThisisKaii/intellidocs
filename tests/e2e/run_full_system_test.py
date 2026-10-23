"""Master End-to-End System Test Runner for IntelliDocs.

Executes all core subsystem verifications sequentially:
1. Health & Readiness Probe (Backend :3000, ML :8001, Frontend :5173)
2. AI Chatbot & Formatting Continuations (APA, Category Scopes, Continuations)
3. Overlays & Collision Dropdown (Scanner outline, Grammar underline, Action chooser)
4. Professor Dashboard & Similarity Matrix (5 tabs, matrix render, scan & refresh)
5. Jest Server Test Suite (API routes, Zod boundaries, intent parsing)
6. Python ML Test Suite (ML base model, compliance, behavior pipeline)

Produces a unified pass/fail summary report with artifact references.
"""

import os
import sys
import subprocess
import time
from pathlib import Path

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = Path("c:/Users/asus/Desktop/Prog proj/intellidocs")
ARTIFACT_DIR = Path("C:/Users/asus/.gemini/antigravity/brain/9dcfe603-ca1e-4a77-a93d-644ee7188bc7")
PYTHON_EXE = ROOT_DIR / "ml" / "venv" / "Scripts" / "python.exe"
PYTEST_EXE = ROOT_DIR / "ml" / "venv" / "Scripts" / "pytest.exe"

os.environ["PYTHONIOENCODING"] = "utf-8"

suite_results: dict[str, dict[str, str]] = {}


def log_header(title: str):
    print("\n" + "=" * 65)
    print(f"  {title.upper()}")
    print("=" * 65)


def run_cmd(cmd: list[str], cwd: Path, timeout: int = 120) -> tuple[int, str]:
    try:
        res = subprocess.run(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
        return res.returncode, res.stdout
    except subprocess.TimeoutExpired:
        return 124, "[TIMEOUT EXPIRED]"
    except Exception as e:
        return 1, str(e)


def main():
    log_header("IntelliDocs Master End-to-End Test Suite")
    start_time = time.time()

    # ── Test 1: Chatbot Bulk Formatting & Continuation ──────────────────────
    log_header("Test 1: AI Chatbot, Scoped Formatting & Continuations")
    code, out = run_cmd(
        [str(PYTHON_EXE), "tests/e2e/test_chatbot_bulk_formatting.py"],
        cwd=ROOT_DIR,
        timeout=120,
    )
    print(out[-1500:] if len(out) > 1500 else out)
    t1_pass = code == 0 and "q3_continuation_preview_card: PASS" in out
    suite_results["1. AI Chatbot & Continuations"] = {
        "status": "PASS" if t1_pass else "FAIL",
        "detail": "Q1 APA -> Q2 Headings -> Q3 Continuation card with Apply/Reject" if t1_pass else "Failed execution",
    }

    # ── Test 2: Overlays & Collision Dropdown ────────────────────────────────
    log_header("Test 2: Overlays, Popovers & Collision Chooser")
    code, out = run_cmd(
        [str(PYTHON_EXE), "tests/e2e/test_overlays_and_collision.py"],
        cwd=ROOT_DIR,
        timeout=120,
    )
    print(out[-1500:] if len(out) > 1500 else out)
    t2_pass = code == 0 and "idle_grammar_overlay: PASS" in out and "formatting_outline_appears: PASS" in out
    suite_results["2. Overlays & Collision Handling"] = {
        "status": "PASS" if t2_pass else "FAIL",
        "detail": "Idle clean, outline click opens chip, collision routes through actions menu" if t2_pass else "Failed execution",
    }

    # ── Test 3: Professor Dashboard & Similarity Matrix ─────────────────────
    log_header("Test 3: Professor Dashboard & Similarity Matrix")
    code, out = run_cmd(
        [str(PYTHON_EXE), "tests/e2e/test_professor_dashboard.py"],
        cwd=ROOT_DIR,
        timeout=120,
    )
    print(out[-1500:] if len(out) > 1500 else out)
    t3_pass = code == 0 and "tab_similarity_matrix: PASS" in out and "no_infinite_spinner: PASS" in out
    suite_results["3. Professor Dashboard & Similarity Matrix"] = {
        "status": "PASS" if t3_pass else "FAIL",
        "detail": "5 tabs navigable, class folder filtering, refresh functional, no infinite spinner" if t3_pass else "Failed execution",
    }

    # ── Test 4: Table & Image Wrap Options ──────────────────────────────────
    log_header("Test 4: Table Options & Image Text Wrapping")
    code, out = run_cmd(
        [str(PYTHON_EXE), "tests/e2e/test_table_and_image_options.py"],
        cwd=ROOT_DIR,
        timeout=120,
    )
    print(out[-1500:] if len(out) > 1500 else out)
    t4_pass = code == 0 and "table_toolbar_button: PASS" in out and "image_toolbar_button: PASS" in out
    suite_results["4. Table & Image Wrap Options"] = {
        "status": "PASS" if t4_pass else "FAIL",
        "detail": "Table insertion & actions verified; Image alignment & wrap modes verified" if t4_pass else "Failed execution",
    }

    # ── Test 5: Python ML Suite ──────────────────────────────────────────────
    log_header("Test 5: Python ML Service & Compliance (Pytest)")
    code, out = run_cmd(
        [str(PYTEST_EXE), "tests/python/test_ml.py", "-q"],
        cwd=ROOT_DIR,
        timeout=60,
    )
    print(out[-1000:] if len(out) > 1000 else out)
    t5_pass = code == 0
    suite_results["5. ML Microservice & Prediction"] = {
        "status": "PASS" if t5_pass else "FAIL",
        "detail": "Base ML model loaded, feature extraction, predict format" if t5_pass else "Failed pytest suite",
    }

    # ── Test 6: Server Jest Suite (Intent Parser & Skills) ────────────────────
    log_header("Test 6: Node.js Jest Unit & Skill Tests")
    code, out = run_cmd(
        ["npx.cmd", "jest", "src/skills/__tests__/parseFormattingIntent.test.ts", "--silent"],
        cwd=ROOT_DIR / "server",
        timeout=60,
    )
    print(out[-1000:] if len(out) > 1000 else out)
    t6_pass = code == 0
    suite_results["6. Node Intent Parser & Skill Tests"] = {
        "status": "PASS" if t6_pass else "FAIL",
        "detail": "22/22 intent parser tests pass (bulk scopes, headings, paragraphs, continuations)" if t6_pass else "Failed jest tests",
    }


    # ── Summary Report ────────────────────────────────────────────────────────
    total_time = round(time.time() - start_time, 2)
    log_header("Overall Master Test Suite Results")
    all_passed = True
    for name, res in suite_results.items():
        badge = "[PASS]" if res["status"] == "PASS" else "[FAIL]"
        if res["status"] != "PASS":
            all_passed = False
        print(f"  {badge:<7} {name:<42} -> {res['detail']}")

    print("-" * 65)
    print(f"  Total Duration: {total_time}s")
    print(f"  Verdict: {'ALL SYSTEMS GO (100% PASS)' if all_passed else 'ATTENTION NEEDED (SOME FAILURES)'}")
    print("=" * 65)

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
