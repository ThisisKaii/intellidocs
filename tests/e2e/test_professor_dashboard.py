"""E2E Test for the Professor Dashboard.

Verifies:
1. A dedicated e2e professor account exists and is an *approved* professor (created or
   re-approved through the Supabase admin API, so the run never stalls on the 403 page).
   A class ("E2E Seed Class") with two e2e student submissions is seeded through the API.
2. /professor mounts with all 5 tabs: Overview, Classes, Submissions, Plagiarism, Compliance.
3. Every tab renders its panel without an error banner or a spinner that never settles.
4. Students show by their full first + last name in Classes (roster), Submissions and Plagiarism.
5. Plagiarism renders the similarity matrix with a row for each seeded student.
6. Grading: rubric scores fill the overall grade, notes and a comment save, and the
   Submissions row shows the grade without a reload; a re-grade replaces it.
7. The student opens the document and sees the grade, rubric, notes and the comment
   (with the professor's name and time) in the Feedback tab.
8. Captures screenshots for artifacts. Exits 1 when any check FAILs.
"""

import os
import sys
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright

WEB = "http://localhost:5173"
EMAIL = os.environ.get("E2E_PROFESSOR_EMAIL", "e2e-professor@intellidocs.test")
PASSWORD = os.environ.get("E2E_PROFESSOR_PASSWORD", "e2e-Professor-123")
TABS = ["Overview", "Classes", "Submissions", "Plagiarism", "Compliance"]
API = "http://localhost:3000"

SEED_CLASS = "E2E Seed Class"
STUDENT_PASSWORD = os.environ.get("E2E_STUDENT_PASSWORD", "e2e-Student-123")
_SHARED = (
    "<p>Machine learning models can adapt document formatting to the habits of each writer by observing "
    "which styles they apply to headings, captions, and body paragraphs over many editing sessions.</p>"
)
# Two submissions that share a passage, so the similarity matrix has a real overlap to show.
SEED_STUDENTS = [
    ("e2e-student-1@intellidocs.test", "Formatting Habits Essay",
     "<h1>Introduction</h1>" + _SHARED + "<p>This essay studies campus writing centers and peer review practice.</p>"),
    ("e2e-student-2@intellidocs.test", "Adaptive Editors Report",
     "<h1>Background</h1>" + _SHARED + "<p>This report compares rule-based style checkers with learned models.</p>"),
]
# First and last names stored in each account's Auth metadata.
STUDENT_NAMES = {
    "e2e-student-1@intellidocs.test": ("Ana", "Reyes"),
    "e2e-student-2@intellidocs.test": ("Ben", "Torres"),
}
PROFESSOR_NAME = ("Maria", "Santos")
FULL_NAMES = [f"{first} {last}" for (first, last) in STUDENT_NAMES.values()]

ARTIFACT_DIR = Path(os.environ.get("E2E_ARTIFACT_DIR", "C:/Users/asus/.gemini/antigravity/brain/9dcfe603-ca1e-4a77-a93d-644ee7188bc7"))
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
SERVER_ENV = Path(__file__).resolve().parents[2] / "server" / ".env"


def screenshot(page, name: str) -> str:
    path = str(ARTIFACT_DIR / f"{name}.png")
    page.screenshot(path=path)
    print(f"  [screenshot] -> {name}.png")
    return path


def supabase_admin() -> tuple[str, dict]:
    """Supabase URL and service-role headers, from the environment or server/.env."""
    env = dict(os.environ)
    if SERVER_ENV.exists():
        for line in SERVER_ENV.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.strip().partition("=")
            if sep and not key.startswith("#"):
                env.setdefault(key.strip(), value.strip().strip("'\""))
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_SERVICE_KEY")
    assert url and key, "SUPABASE_URL and SUPABASE_SERVICE_KEY are required to set up the professor account"
    return url.rstrip("/"), {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def ensure_account(email: str, password: str, role_name: str, names: tuple[str, str] | None = None) -> str:
    """Create the account if missing, store its first/last name, and give it an approved
    `role_name` profile. Returns an access token."""
    url, headers = supabase_admin()
    created = requests.post(
        f"{url}/auth/v1/admin/users",
        headers=headers,
        json={"email": email, "password": password, "email_confirm": True},
        timeout=20,
    )
    # 422 means the account already exists, which is fine.
    assert created.status_code in (200, 201, 422), f"creating {email} failed: {created.status_code} {created.text}"

    login = requests.post(
        f"{url}/auth/v1/token?grant_type=password",
        headers={"apikey": headers["apikey"], "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    assert login.status_code == 200, f"{email} sign-in failed: {login.status_code} {login.text}"
    user_id = login.json()["user"]["id"]

    if names:
        first, last = names
        metadata = {**(login.json()["user"].get("user_metadata") or {}),
                    "first_name": first, "last_name": last, "display_name": f"{first} {last}"}
        named = requests.put(f"{url}/auth/v1/admin/users/{user_id}", headers=headers,
                             json={"user_metadata": metadata}, timeout=20)
        assert named.status_code == 200, f"naming {email} failed: {named.status_code} {named.text}"

    role = requests.get(
        f"{url}/rest/v1/roles", headers=headers, params={"role_name": f"eq.{role_name}", "select": "role_id"}, timeout=20
    )
    assert role.status_code == 200 and role.json(), f"{role_name} role not found: {role.status_code} {role.text}"

    profile = requests.post(
        f"{url}/rest/v1/user_profiles",
        headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
        params={"on_conflict": "user_id"},
        json={"user_id": user_id, "role_id": role.json()[0]["role_id"], "verification_status": "approved"},
        timeout=20,
    )
    assert profile.status_code in (200, 201, 204), f"approving {email} failed: {profile.status_code} {profile.text}"
    print(f"[OK] Approved {role_name} account ready: {email}")
    return login.json()["access_token"]


def call(token: str, method: str, path: str, body: dict | None = None) -> requests.Response:
    """Call the Express API as the given user."""
    return requests.request(
        method, f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, json=body, timeout=30
    )


def seed_class_with_submissions() -> dict[str, str]:
    """Give the professor a class with two student submissions that partly overlap. Safe to rerun.
    Returns {submission title: document id}."""
    professor = ensure_account(EMAIL, PASSWORD, "professor", PROFESSOR_NAME)
    for (email, _title, _content) in SEED_STUDENTS:
        ensure_account(email, STUDENT_PASSWORD, "student", STUDENT_NAMES[email])

    folders = call(professor, "GET", "/folders")
    assert folders.status_code == 200, f"listing folders failed: {folders.status_code} {folders.text[:200]}"
    existing = [f for f in folders.json() if f.get("name") == SEED_CLASS and f.get("folder_type") == "class"]
    if existing:
        folder_id = existing[0]["folder_id"]
    else:
        created = call(professor, "POST", "/folders", {"name": SEED_CLASS, "folderType": "class"})
        assert created.status_code in (200, 201), f"creating class failed: {created.status_code} {created.text[:200]}"
        folder_id = created.json()["folder_id"]

    submitted = call(professor, "GET", f"/folders/{folder_id}/documents")
    assert submitted.status_code == 200, f"reading class failed: {submitted.status_code} {submitted.text[:200]}"
    if len(submitted.json()) >= len(SEED_STUDENTS):
        print(f"[OK] Seed class already has {len(submitted.json())} submissions")
        return {doc["title"]: doc["id"] for doc in submitted.json()}

    for (email, title, content) in SEED_STUDENTS:
        student = ensure_account(email, STUDENT_PASSWORD, "student")
        enrolled = call(professor, "POST", f"/folders/{folder_id}/enrollments", {"email": email})
        assert enrolled.status_code in (200, 201), f"enrolling {email} failed: {enrolled.status_code} {enrolled.text[:200]}"

        doc = call(student, "POST", "/documents", {"title": title})
        assert doc.status_code in (200, 201), f"{email} creating document failed: {doc.status_code} {doc.text[:200]}"
        doc_id = doc.json()["id"]
        saved = call(student, "PUT", f"/documents/{doc_id}", {"content": content})
        assert saved.status_code == 200, f"{email} saving document failed: {saved.status_code} {saved.text[:200]}"
        handed_in = call(student, "POST", f"/folders/{folder_id}/documents", {"documentId": doc_id})
        assert handed_in.status_code == 200, f"{email} submitting failed: {handed_in.status_code} {handed_in.text[:200]}"
    print(f"[OK] Seeded '{SEED_CLASS}' with {len(SEED_STUDENTS)} submissions")
    submitted = call(professor, "GET", f"/folders/{folder_id}/documents")
    return {doc["title"]: doc["id"] for doc in submitted.json()}


def panel_settled(page) -> bool:
    """True once no spinner is visible (waits up to 10s for loading to finish)."""
    for _ in range(20):
        if not page.locator("main [class*='animate-spin']").first.is_visible():
            return True
        page.wait_for_timeout(500)
    return False


GRADED_TITLE = SEED_STUDENTS[0][1]
GRADED_STUDENT = FULL_NAMES[0]
FIRST_RUBRIC = {"Content": "22", "Methodology": "20", "Formatting": "24", "Mechanics": "21"}  # = 87
SECOND_RUBRIC = {"Content": "23", "Methodology": "21", "Formatting": "24", "Mechanics": "23"}  # = 91
NOTES = "Strong structure; tighten the methodology section."


def submission_row(page):
    return page.locator("main table tbody tr", has_text=GRADED_TITLE).first


def fill_rubric_and_save(page, rubric: dict[str, str], notes: str) -> str:
    """Fill the four rubric scores in the open drawer, add notes, save. Returns the grade the rubric filled in."""
    drawer = page.get_by_role("dialog", name="Grade submission")
    for label, value in rubric.items():
        drawer.get_by_label(f"{label} score").fill(value)
    filled = drawer.locator("#grade-value").input_value()
    drawer.locator("#grade-notes").fill(notes)
    drawer.get_by_role("button", name="Save grade").click()
    page.wait_for_timeout(2500)
    return filled


def grade_and_comment(page, results: dict[str, str]) -> None:
    """Grade the first seeded submission with a rubric, comment on it, then re-grade it."""
    row = submission_row(page)
    if not row.is_visible():
        results["grading"] = "FAIL (seeded submission row missing)"
        return

    # First grade + comment.
    row.get_by_role("button", name="Review").click()
    page.wait_for_timeout(2000)
    drawer = page.get_by_role("dialog", name="Grade submission")
    comment = f"Please cite the 2021 survey in section 2. ({os.getpid()})"
    drawer.get_by_label("New comment").fill(comment)
    drawer.get_by_role("button", name="Add comment").click()
    page.wait_for_timeout(2000)
    thread = drawer.locator("[data-testid=feedback-comment]", has_text=comment).first
    has_author = thread.is_visible() and thread.get_by_text(f"{PROFESSOR_NAME[0]} {PROFESSOR_NAME[1]}").first.is_visible()
    has_time = thread.is_visible() and thread.locator("time").first.inner_text().strip() != ""
    results["comment_author_time"] = (
        "PASS" if has_author and has_time else f"FAIL (comment shown={thread.is_visible()}, author={has_author}, time={has_time})"
    )
    screenshot(page, "professor_grade_drawer_comment")
    filled = fill_rubric_and_save(page, FIRST_RUBRIC, NOTES)
    results["rubric_fills_grade"] = "PASS (87)" if filled == "87" else f"FAIL (grade field showed {filled!r})"

    grade_cell = submission_row(page).locator("td").nth(5)
    first = grade_cell.inner_text().strip()
    results["grade_row_updates"] = "PASS (87 without reload)" if first == "87" else f"FAIL (row shows {first!r})"
    screenshot(page, "professor_submissions_graded")

    # Re-grade: the newest grade replaces the first (the old .maybeSingle() lookup broke here).
    submission_row(page).get_by_role("button", name="Review").click()
    page.wait_for_timeout(2000)
    reloaded = page.get_by_role("dialog", name="Grade submission").locator("#grade-value").input_value()
    fill_rubric_and_save(page, SECOND_RUBRIC, NOTES + " Revised after resubmission.")
    second = submission_row(page).locator("td").nth(5).inner_text().strip()
    results["regrade"] = (
        "PASS (drawer reopened at 87, row now 91)" if reloaded == "87" and second == "91"
        else f"FAIL (drawer reopened at {reloaded!r}, row shows {second!r})"
    )
    results["comment_text"] = comment
    for key in ("comment_author_time", "rubric_fills_grade", "grade_row_updates", "regrade"):
        print(f"  {key}: {results[key]}")


def student_sees_feedback(browser, document_id: str | None, results: dict[str, str]) -> None:
    """Sign in as the graded student, open the document and read the Feedback tab."""
    comment = results.pop("comment_text", "")
    if not document_id:
        results["student_feedback"] = "FAIL (graded document id unknown)"
        return
    ctx = browser.new_context(viewport={"width": 1600, "height": 950})
    page = ctx.new_page()
    page.route("**fonts.googleapis.com**", lambda r: r.abort())
    page.route("**fonts.gstatic.com**", lambda r: r.abort())
    page.goto(f"{WEB}/login", wait_until="domcontentloaded")
    page.fill("input#email", SEED_STUDENTS[0][0])
    page.fill("input#password", STUDENT_PASSWORD)
    page.click("button[type=submit]")
    page.wait_for_url(f"{WEB}/dashboard", timeout=20000)
    page.goto(f"{WEB}/document/{document_id}", wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    tab = page.locator("button[title=Feedback]").first
    if not tab.is_visible():
        results["student_feedback"] = "FAIL (no Feedback tab)"
        screenshot(page, "student_feedback_missing")
        ctx.close()
        return
    tab.click()
    page.wait_for_timeout(1000)
    panel = page.locator("[data-testid=feedback-panel]")
    grade = panel.locator("[data-testid=feedback-grade]").inner_text().replace("\n", "").strip()
    checks = {
        "grade 91": grade.startswith("91"),
        "rubric": panel.get_by_label("Rubric").get_by_text("Methodology").first.is_visible(),
        "notes": panel.get_by_text("Revised after resubmission.", exact=False).first.is_visible(),
        "comment": bool(comment) and panel.get_by_text(comment).first.is_visible(),
        "professor name": panel.get_by_text(f"{PROFESSOR_NAME[0]} {PROFESSOR_NAME[1]}").first.is_visible(),
    }
    screenshot(page, "student_feedback_tab")
    missing = [name for name, ok in checks.items() if not ok]
    results["student_feedback"] = "PASS (" + ", ".join(checks) + ")" if not missing else f"FAIL (missing: {missing}; grade text {grade!r})"
    print(f"  student_feedback: {results['student_feedback']}")
    ctx.close()


def run_test() -> int:
    results: dict[str, str] = {}
    documents = seed_class_with_submissions()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        ctx = browser.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()

        page.route("**fonts.googleapis.com**", lambda r: r.abort())
        page.route("**fonts.gstatic.com**", lambda r: r.abort())

        # ── Step 1: Sign in ─────────────────────────────────────────────────
        print("\n=== STEP 1: Signing In ===")
        page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        page.fill("input#email", EMAIL)
        page.fill("input#password", PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_url(f"{WEB}/dashboard", timeout=20000)
        print("[OK] Authenticated")

        # ── Step 2: Navigate to Professor Dashboard ─────────────────────────
        print("\n=== STEP 2: Navigating to Professor Dashboard ===")
        page.goto(f"{WEB}/professor", wait_until="domcontentloaded")
        page.wait_for_timeout(2000)

        if page.get_by_text("403 Forbidden", exact=False).first.is_visible():
            results["professor_access"] = "FAIL (403 page shown to an approved professor)"
            screenshot(page, "professor_dashboard_403")
        else:
            results["professor_access"] = "PASS"
            print("[OK] Professor Dashboard loaded")
            screenshot(page, "professor_dashboard_home")

            # ── Step 3: Visit every tab ─────────────────────────────────────
            print("\n=== STEP 3: Visiting Each Tab ===")
            for tab_name in TABS:
                tab = page.locator("button", has_text=tab_name).first
                if not tab.is_visible():
                    results[f"tab_{tab_name.lower()}"] = "FAIL (tab button missing)"
                    continue
                tab.click()
                page.wait_for_timeout(800)
                settled = panel_settled(page)
                failed_banner = page.locator("[role=status].text-red-700, [role=alert]").first.is_visible()
                results[f"tab_{tab_name.lower()}"] = (
                    "PASS" if settled and not failed_banner else f"FAIL (settled={settled}, error banner={failed_banner})"
                )
                print(f"  Tab '{tab_name}': {results[f'tab_{tab_name.lower()}']}")
                screenshot(page, f"professor_tab_{tab_name.lower()}")

                if tab_name == "Classes":
                    roster = page.locator("button", has_text="Roster").first
                    named = []
                    if roster.is_visible():
                        roster.click()
                        page.wait_for_timeout(1500)
                        named = [name for name in FULL_NAMES if page.get_by_text(name).first.is_visible()]
                        screenshot(page, "professor_classes_roster_names")
                        page.get_by_role("dialog", name="Class roster").get_by_role("button", name="Close").click()
                        page.wait_for_timeout(400)
                    results["classes_full_names"] = (
                        f"PASS (roster shows {named})" if len(named) == len(FULL_NAMES) else f"FAIL (roster names found: {named})"
                    )
                    print(f"  Classes: {results['classes_full_names']}")

                if tab_name == "Submissions":
                    seeded = [title for (_, title, _) in SEED_STUDENTS if page.get_by_text(title).first.is_visible()]
                    results["submissions_content"] = (
                        f"PASS ({len(seeded)} seeded submissions listed)" if len(seeded) == len(SEED_STUDENTS)
                        else f"FAIL (seeded submissions missing; found {seeded})"
                    )
                    print(f"  Submissions: {results['submissions_content']}")
                    named = [name for name in FULL_NAMES if page.locator("main table").get_by_text(name).first.is_visible()]
                    results["submissions_full_names"] = (
                        f"PASS ({named})" if len(named) == len(FULL_NAMES) else f"FAIL (full names found: {named})"
                    )
                    print(f"  Submission names: {results['submissions_full_names']}")
                    grade_and_comment(page, results)

                if tab_name == "Plagiarism":
                    matrix = page.locator("main table").first
                    students = [
                        name for name in FULL_NAMES
                        if matrix.is_visible() and matrix.get_by_text(name).first.is_visible()
                    ]
                    results["similarity_matrix"] = (
                        f"PASS (matrix rows for {len(students)} seeded students)" if len(students) == len(SEED_STUDENTS)
                        else f"FAIL (matrix missing seeded students; found {students})"
                    )
                    print(f"  Similarity matrix: {results['similarity_matrix']}")

        # ── Step 4: The student sees the feedback ───────────────────────────
        print("\n=== STEP 4: Student Feedback Tab ===")
        student_sees_feedback(browser, documents.get(GRADED_TITLE), results)

        # ── Summary ──────────────────────────────────────────────────────────
        print("\n" + "=" * 56)
        print("PROFESSOR DASHBOARD TEST RESULTS:")
        print("=" * 56)
        for key, val in results.items():
            status = "[PASS]" if val.startswith("PASS") else ("[WARN]" if val.startswith("WARN") else "[FAIL]")
            print(f"  {status}  {key}: {val}")
        print("=" * 56)

        browser.close()

    return 1 if any(val.startswith("FAIL") for val in results.values()) else 0


if __name__ == "__main__":
    sys.exit(run_test())
