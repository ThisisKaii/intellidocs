"""Shared helpers for the Chapter 4 Selenium suite: the running stack's addresses, the test
accounts, an HTTP client for setting up and cleaning up test data, and browser helpers.

Every test file imports from here and uses the fixtures in conftest.py, so each file still runs on
its own (pytest, or the IDE's run button) against the real stack: server on :3000, frontend on
:5173 and, for the ML cases, the Python service on :8001.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import os
import struct
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import requests
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.ui import WebDriverWait

API = os.environ.get("API_URL", "http://localhost:3000").rstrip("/")
WEB = os.environ.get("WEB_URL", "http://localhost:5173").rstrip("/")
# 127.0.0.1, not localhost: on Windows "localhost" tries IPv6 first and adds ~2 s to every ML call.
ML = os.environ.get("ML_URL", "http://127.0.0.1:8001").rstrip("/")

REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "tests" / "fixtures"
FIGURES = REPO / "docs" / "manuscript" / "figures" / "chapter_4"

# Test accounts (no 2FA). The professor owns the seeded class; the students submit to it.
PROFESSOR = ("e2e-professor@intellidocs.test", "e2e-Professor-123")
STUDENT = ("e2e-student-1@intellidocs.test", "e2e-Student-123")
STUDENT_2 = ("e2e-student-2@intellidocs.test", "e2e-Student-123")

WAIT = 30


# ── HTTP client ───────────────────────────────────────────────────────────────


@dataclass
class Api:
    """A signed-in (or anonymous) client for the IntelliDocs API."""

    token: str | None = None
    user_id: str | None = None
    created_documents: list[str] = field(default_factory=list)

    @classmethod
    def sign_in(cls, account: tuple[str, str]) -> "Api":
        response = requests.post(f"{API}/auth/login", json={"email": account[0], "password": account[1]}, timeout=60)
        if not response.ok:  # a Supabase timeout during sign-in comes back as 400/5xx: retry once
            time.sleep(4)
            response = requests.post(f"{API}/auth/login", json={"email": account[0], "password": account[1]}, timeout=60)
        response.raise_for_status()
        body = response.json()
        return cls(token=body["session"]["access_token"], user_id=body["user"]["id"])

    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def call(self, method: str, path: str, json: Any = None, **kwargs: Any) -> requests.Response:
        """One API call. The server checks every token against Supabase; when that check or the
        database times out it answers 401 or 502-504, so those are retried once after a pause
        (no test here expects a 401, so a real refusal still comes back)."""
        timeout = kwargs.pop("timeout", 120)
        response = requests.request(method, f"{API}{path}", json=json, headers=self.headers(), timeout=timeout, **kwargs)
        if response.status_code in (401, 502, 503, 504):
            time.sleep(4)
            response = requests.request(method, f"{API}{path}", json=json, headers=self.headers(), timeout=timeout, **kwargs)
        return response

    def create_document(self, title: str, content: str = "<p>Chapter 4 test document.</p>", **fields: Any) -> str:
        """A document owned by this account, deleted again by `cleanup`."""
        created = self.call("POST", "/documents", {"title": title})
        created.raise_for_status()
        doc_id = created.json()["id"]
        self.created_documents.append(doc_id)
        update = {"content": content, **fields}
        self.call("PUT", f"/documents/{doc_id}", update).raise_for_status()
        return doc_id

    def cleanup(self) -> None:
        # Deleting moves a document to trash; the permanent delete frees its storage too.
        for doc_id in self.created_documents:
            try:
                self.call("DELETE", f"/documents/{doc_id}", timeout=60)
                self.call("DELETE", f"/documents/{doc_id}/permanent", timeout=60)
            except requests.RequestException:
                pass
        self.created_documents.clear()


SEED_CLASS = "E2E Seed Class"


def seed_class_id(professor: Api, students: tuple[str, ...] = (STUDENT[0], STUDENT_2[0])) -> str:
    """The professor's seeded class (the same one the Playwright professor suite uses), created and
    its students enrolled if missing. Safe to rerun."""
    folders = professor.call("GET", "/folders")
    folders.raise_for_status()
    found = [f for f in folders.json() if f.get("name") == SEED_CLASS and f.get("folder_type") == "class"]
    if found:
        folder_id = found[0]["folder_id"]
    else:
        created = professor.call("POST", "/folders", {"name": SEED_CLASS, "folderType": "class"})
        created.raise_for_status()
        folder_id = created.json()["folder_id"]
    roster = {row.get("email") for row in professor.call("GET", f"/folders/{folder_id}/enrollments").json()}
    for email in students:
        if email not in roster:
            professor.call("POST", f"/folders/{folder_id}/enrollments", {"email": email})
    return folder_id


def register_account(email: str, password: str, first: str = "Chapter", last: str = "Four") -> Api:
    """Create a throwaway account through the API and sign it in (deleted again by delete_account)."""
    created = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "first_name": first, "last_name": last}, timeout=60)
    created.raise_for_status()
    return Api.sign_in((email, password))


def delete_account(token: str, email: str) -> int:
    """Delete an account with its own (fully signed-in) session. Returns the HTTP status."""
    return requests.delete(f"{API}/auth/account", json={"confirmEmail": email}, headers={"Authorization": f"Bearer {token}"}, timeout=60).status_code


def session_token(driver: WebDriver) -> str | None:
    """The access token of the browser's Supabase session (after 2FA, the upgraded one)."""
    return driver.execute_script(
        "for (const k of Object.keys(localStorage)) { if (k.startsWith('sb-') && k.endsWith('-auth-token')) {"
        " try { return JSON.parse(localStorage.getItem(k)).access_token } catch (e) {} } } return localStorage.getItem('authToken')"
    )


def write_png(path: Path, width: int, height: int, seed: int = 4) -> Path:
    """A width x height RGB PNG of random pixels (random pixels do not compress, so the file is
    about width*height*3 bytes): a stand-in for a large, detailed diagram."""
    import random
    import zlib

    rng = random.Random(seed)
    rows = b"".join(b"\x00" + rng.randbytes(width * 3) for _ in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 1)) + chunk(b"IEND", b"")
    path.write_bytes(png)
    return path


def upload_into_editor(driver: WebDriver, file_path: Path) -> None:
    """Pick a picture through the ribbon's Insert → Illustrations → Insert Image file input."""
    click(driver, visible(driver, By.XPATH, "//button[@title='Insert content into the document']"))
    picker = driver.find_element(By.CSS_SELECTOR, "input[type=file][accept^='image/png']")
    driver.execute_script("arguments[0].style.display = 'block'", picker)
    picker.send_keys(str(file_path))


CATCH_FILE_DIALOG = """
// The app opens the system file dialog through a file input it never adds to the page, which a
// browser test cannot reach. Put that input on the page instead, so the test chooses the file;
// everything after (reading, uploading, filling the slot) runs as in the app.
if (!window.__catchFileDialog) {
  window.__catchFileDialog = true;
  const click = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file' && !this.isConnected) {
      this.setAttribute('data-test-file-dialog', '1');
      document.body.appendChild(this);
      return;
    }
    return click.call(this);
  };
}
"""


def choose_file_in_dialog(driver: WebDriver, open_dialog: Callable[[], None], file_path: Path) -> None:
    """Choose `file_path` in the file dialog that `open_dialog` opens (see CATCH_FILE_DIALOG)."""
    driver.execute_script(CATCH_FILE_DIALOG)
    open_dialog()
    picker = visible_or_present(driver, "input[data-test-file-dialog]")
    picker.send_keys(str(file_path))


def visible_or_present(driver: WebDriver, css: str, timeout: float = WAIT) -> WebElement:
    return wait_for(driver, lambda d: (d.find_elements(By.CSS_SELECTOR, css) or [False])[-1], timeout, f"no element {css}")


def tab_marker(title: str) -> str:
    """The empty block that starts a tab in a document's body (the format the server splits on)."""
    return f'<div data-tab-break="" data-title="{html.escape(title, quote=True)}"></div>'


def create_tabbed_document(api: Api, title: str, chapters: list[tuple[str, str]]) -> str:
    """A document split into one tab per (tab title, chapter HTML), through the same split
    endpoint the editor uses after an import."""
    # A split only places markers: the saved text must already be the chapters' text.
    doc_id = api.create_document(title, "".join(chapter for _title, chapter in chapters))
    body = "".join(tab_marker(tab_title) + chapter for tab_title, chapter in chapters)
    split = api.call("POST", f"/documents/{doc_id}/tabs/split", {"content": body})
    split.raise_for_status()
    return doc_id


def unique_email(prefix: str) -> str:
    """A fresh address on the test domain for accounts a test creates and deletes again."""
    return f"{prefix}-{int(time.time())}-{uuid.uuid4().hex[:6]}@intellidocs.test"


# ── Browser helpers ───────────────────────────────────────────────────────────

SKIP_NAME_PROMPT = "try { sessionStorage.setItem('intellidocs:profileNameLater', '1') } catch (e) {}"


def wait_for(driver: WebDriver, condition: Callable[[WebDriver], Any], timeout: float = WAIT, message: str = "") -> Any:
    return WebDriverWait(driver, timeout, poll_frequency=0.25).until(condition, message)


def visible(driver: WebDriver, by: str, value: str, timeout: float = WAIT) -> WebElement:
    def find(d: WebDriver) -> WebElement | bool:
        for element in d.find_elements(by, value):
            if element.is_displayed():
                return element
        return False

    return wait_for(driver, find, timeout, f"no visible element {by}={value}")


def click(driver: WebDriver, element: WebElement) -> None:
    """Scroll an element to the middle of the window and click it, the way a user would reach it.
    If a floating element (a toast, the review button) still covers it, click it directly."""
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'})", element)
    try:
        element.click()
    except Exception:
        driver.execute_script("arguments[0].click()", element)


def text_appears(driver: WebDriver, text: str, timeout: float = WAIT) -> bool:
    """Wait until the page shows `text` (case-sensitive) anywhere in its visible text."""
    try:
        wait_for(driver, lambda d: text in d.find_element(By.TAG_NAME, "body").text, timeout)
        return True
    except TimeoutException:
        return False


def body_text(driver: WebDriver) -> str:
    return driver.find_element(By.TAG_NAME, "body").text


def open_page(driver: WebDriver, path: str) -> None:
    driver.get(f"{WEB}{path}")
    driver.execute_script(SKIP_NAME_PROMPT)


def sign_in(driver: WebDriver, account: tuple[str, str]) -> None:
    """Sign in through the login form and wait for the dashboard."""
    open_page(driver, "/login")
    visible(driver, By.ID, "email").send_keys(account[0])
    driver.find_element(By.ID, "password").send_keys(account[1])
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    wait_for(driver, lambda d: "/dashboard" in d.current_url, message="login did not reach /dashboard")


def wait_for_text(driver: WebDriver, timeout: float = 60) -> None:
    """Wait until the editor shows text: the editor element appears before a slow load fills it."""
    try:
        wait_for(driver, lambda d: d.execute_script("const e = document.querySelector('.ProseMirror'); return !!e && e.textContent.trim().length > 0"), timeout=timeout)
    except TimeoutException:
        pass  # an empty document is a valid state; the test's own checks decide


def open_document(driver: WebDriver, doc_id: str) -> WebElement:
    """Open a document in the editor and wait until it has loaded."""
    open_page(driver, f"/document/{doc_id}")
    editor = visible(driver, By.CSS_SELECTOR, ".ProseMirror", timeout=60)
    wait_for_text(driver)
    time.sleep(2)
    return editor


def apply_preset_from_ribbon(driver: WebDriver, preset_name: str) -> None:
    """Styles tab → Presets → the preset's chip."""
    click(driver, visible(driver, By.XPATH, "//button[@title='Styles and academic presets']"))
    click(driver, visible(driver, By.XPATH, f"//button[contains(normalize-space(), '{preset_name}')]"))


def open_preset_manager(driver: WebDriver) -> WebElement:
    """Styles tab → "Add or remove your own styles and presets"; returns the preset file input."""
    click(driver, visible(driver, By.XPATH, "//button[@title='Styles and academic presets']"))
    click(driver, visible(driver, By.XPATH, "//button[@title='Add or remove your own styles and presets']"))
    visible(driver, By.XPATH, "//h3[contains(., 'Manage Styles')]")
    # The dialog's own input: the ribbon's Import File input also accepts .docx.
    picker = driver.find_element(
        By.XPATH,
        "//h3[contains(., 'Manage Styles')]/ancestor::div[.//input[@type='file']][1]//input[@type='file' and starts-with(@accept, '.docx,.pdf')]",
    )
    driver.execute_script("arguments[0].style.display = 'block'", picker)
    return picker


def user_presets(api: Api) -> list[dict[str, Any]]:
    response = api.call("GET", "/formatting/user-presets")
    response.raise_for_status()
    body = response.json()
    return body if isinstance(body, list) else body.get("presets", [])


PAGE_AND_TEXT = """
const editor = document.querySelector('.ProseMirror');
const p = [...editor.querySelectorAll('p')].find(n => n.textContent.trim());
const h = editor.querySelector('h1');
const e = getComputedStyle(editor), ps = getComputedStyle(p), hs = h ? getComputedStyle(h) : null;
return {left: e.paddingLeft, right: e.paddingRight, font: ps.fontFamily, size: ps.fontSize, line: ps.lineHeight,
        indent: ps.textIndent, headingCaps: hs ? hs.fontVariantCaps : null};
"""


def page_and_text(driver: WebDriver) -> dict[str, Any]:
    """The editor's page margins (as padding) and the first body paragraph's text style."""
    return driver.execute_script(PAGE_AND_TEXT)


def open_new_document_modal(driver: WebDriver) -> WebElement:
    """On the dashboard, open the "New document" template picker and return its title field."""
    open_page(driver, "/dashboard")
    # The sidebar's "New document" button opens a menu whose first item opens the picker.
    visible(driver, By.XPATH, "//button[contains(normalize-space(), 'New document')]").click()
    click(driver, visible(driver, By.XPATH, "//*[@role='menuitem'][contains(normalize-space(), 'New document')]"))
    visible(driver, By.ID, "document-create-title")
    return visible(driver, By.ID, "document-create-name")


def create_from_modal(driver: WebDriver, blueprint: str, title: str) -> str:
    """Create a document from a template card in the "New document" picker; returns its id."""
    title_field = open_new_document_modal(driver)
    click(driver, visible(driver, By.XPATH, f"//div[@role='dialog' or @aria-labelledby='document-create-title']//button[.//*[normalize-space()='{blueprint}'] or normalize-space()='{blueprint}'] | //button[.//span[normalize-space()='{blueprint}']]"))
    title_field.send_keys(Keys.CONTROL, "a")
    title_field.send_keys(title)
    click(driver, driver.find_element(By.XPATH, "//button[@type='submit' and contains(., 'Create document')]"))
    wait_for(driver, lambda d: "/document/" in d.current_url, timeout=60, message="the new document did not open")
    visible(driver, By.CSS_SELECTOR, ".ProseMirror", timeout=60)
    time.sleep(2)
    return driver.current_url.split("/document/")[1].split("?")[0]


def field_validity(driver: WebDriver, element: WebElement) -> dict[str, Any]:
    """The browser's own form validation state of an input (required, type=email...)."""
    return driver.execute_script(
        "const v = arguments[0].validity; return {valid: v.valid, valueMissing: v.valueMissing, typeMismatch: v.typeMismatch, message: arguments[0].validationMessage}",
        element,
    )


def show_evidence(driver: WebDriver, title: str, rows: list[tuple[str, Any]]) -> None:
    """For a case with nothing to see in the app, show what the test observed as a labelled
    evidence page, so its screenshot is the measured result and never a staged screen."""
    cells = "".join(f"<tr><th>{html.escape(str(k))}</th><td>{html.escape(str(v))}</td></tr>" for k, v in rows)
    page = (
        "<html><head><meta charset='utf-8'><title>Test evidence</title><style>"
        "body{font-family:Segoe UI,Arial,sans-serif;margin:32px;color:#1b1f24}"
        "h1{font-size:20px;margin:0 0 4px}p{color:#57606a;margin:0 0 16px}"
        "table{border-collapse:collapse;width:100%}th,td{border:1px solid #d0d7de;padding:8px 10px;text-align:left;vertical-align:top;font-size:14px}"
        "th{background:#f6f8fa;width:32%}</style></head><body>"
        f"<h1>{html.escape(title)}</h1><p>Test evidence: values measured by the automated test against the running services (not an application screen).</p>"
        f"<table>{cells}</table></body></html>"
    )
    driver.get("data:text/html;base64," + base64.b64encode(page.encode("utf-8")).decode("ascii"))


def enroll_totp(driver: WebDriver) -> str:
    """In Settings → Security, enable the authenticator app for the signed-in account the way a
    user does: read the manual secret, type the current code, verify. Returns the secret."""
    open_page(driver, "/settings")
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Security'] | //a[normalize-space()='Security']"))
    click(driver, visible(driver, By.XPATH, "//button[contains(., 'Enable Authenticator App')]"))
    secret_box = visible(driver, By.XPATH, "//span[contains(., 'Manual secret key')]/following-sibling::code")
    secret = secret_box.text.replace(" ", "")
    visible(driver, By.ID, "verify-2fa").send_keys(totp(secret))
    click(driver, driver.find_element(By.XPATH, "//button[contains(., 'Verify & Activate')]"))
    return secret


def token_claims(token: str) -> dict[str, Any]:
    """The payload of a JWT (no signature check: only to read what the server issued)."""
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


# ── TOTP (RFC 6238), so 2FA can be tested without an extra package ───────────


def totp(secret: str, at: float | None = None, step: int = 30, digits: int = 6) -> str:
    key = base64.b32decode(secret.replace(" ", "").upper() + "=" * (-len(secret.replace(" ", "")) % 8))
    counter = int((at if at is not None else time.time()) // step)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % (10**digits)
    return str(code).zfill(digits)


# ---- ML service (Module 4) -------------------------------------------------------------

ML_DIR = REPO / "ml"


def ml_predict(text: str, genre: str = "general", **fields: Any) -> tuple[dict[str, Any], float]:
    """POST the ML service's /predict; returns (response JSON, round-trip milliseconds)."""
    started = time.perf_counter()
    response = requests.post(f"{ML}/predict", json={"text": text, "genre": genre, **fields}, timeout=120)
    elapsed = (time.perf_counter() - started) * 1000
    response.raise_for_status()
    return response.json(), elapsed


def ml_in_process(module: str) -> Any:
    """Import one of the ML service's own modules in this process (same code, same models,
    same .env) for the cases that check what happens inside one request."""
    import importlib

    for folder in (ML_DIR, ML_DIR / "src"):
        if str(folder) not in sys.path:
            sys.path.insert(0, str(folder))
    try:
        from dotenv import load_dotenv

        load_dotenv(ML_DIR / ".env")
    except ImportError:
        pass
    return importlib.import_module(module)


def ml_is_up(timeout: float = 5) -> bool:
    try:
        return requests.get(f"{ML}/health", timeout=timeout).ok
    except requests.RequestException:
        return False


def _ml_listener_pids() -> set[str]:
    import re
    import subprocess

    listing = subprocess.run(["netstat", "-ano"], capture_output=True, text=True).stdout
    return {line.split()[-1] for line in listing.splitlines() if re.search(r":8001\s+\S+\s+LISTENING", line)}


def stop_ml_service() -> None:
    """Stop whatever process serves the ML port (the test restarts it with start_ml_service)."""
    import subprocess

    for pid in _ml_listener_pids():
        subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
    deadline = time.time() + 30
    while ml_is_up(timeout=1) and time.time() < deadline:
        time.sleep(1)


def start_ml_service(log_path: Path, timeout: float = 240) -> None:
    """Start the ML service in the background (detached) and wait until /health answers."""
    import subprocess

    flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    with open(log_path, "ab") as log:
        subprocess.Popen([str(ML_DIR / "venv" / "Scripts" / "python.exe"), str(ML_DIR / "src" / "main.py")], cwd=str(REPO), stdout=log, stderr=log, creationflags=flags)
    deadline = time.time() + timeout
    while not ml_is_up(timeout=3):
        if time.time() > deadline:
            raise RuntimeError("the ML service did not come back up")
        time.sleep(3)


# ---- Grammar and spelling (Module 5) -----------------------------------------------------

UNDERLINES = """return [...document.querySelectorAll('.ProseMirror .grammar-issue, .ProseMirror .harper-underline')].map(e => {
  const s = getComputedStyle(e);
  return {text: e.textContent, kind: (e.className.match(/(?:grammar|harper)-kind-([\\w-]+)/) || [])[1] || '',
          source: e.classList.contains('harper-underline') ? 'harper' : 'server',
          color: s.textDecorationColor, style: s.textDecorationStyle};
})"""


def type_paragraph(driver: WebDriver, editor: WebElement, text: str) -> None:
    """Type a new paragraph at the end of the document, key by key like a user."""
    click(driver, driver.find_elements(By.CSS_SELECTOR, ".ProseMirror > *")[-1])
    editor.send_keys(Keys.CONTROL, Keys.END)
    editor.send_keys(Keys.ENTER, text)


def underlines(driver: WebDriver) -> list[dict[str, str]]:
    return driver.execute_script(UNDERLINES)


def wait_for_checks(driver: WebDriver, seconds: float = 15) -> list[dict[str, str]]:
    """Give both checkers (Harper in the browser, the server's checker) time to answer."""
    time.sleep(seconds)
    return underlines(driver)


ACCEPT_CARD = "//button[normalize-space()='Accept']/ancestor::*[contains(., '→')][1]"


# ---- Originality (Module 6) --------------------------------------------------------------

COPIED_PARAGRAPH = (
    "Teachers in rural public schools reported that limited internet access delayed the submission "
    "of online learning modules by an average of three days per week during the first semester. "
    "Most of them relied on mobile data bought with their own money, and several schools shared a "
    "single connection among all of their faculty members."
)


def submit_copied_pair(professor: Api, first: Api, second: Api, label: str) -> tuple[str, str, str]:
    """Two classmates submit to the seeded class; the second copied a paragraph from the first.
    Returns (class folder id, first document id, second document id)."""
    folder = seed_class_id(professor)
    original = first.create_document(f"{label} Source", f"<h1>Introduction</h1><p>{COPIED_PARAGRAPH}</p><p>The study used a descriptive survey design with one hundred twenty respondents from four districts.</p>")
    copy = second.create_document(f"{label} Submission", f"<h1>Background</h1><p>{COPIED_PARAGRAPH}</p><p>Interviews with principals complemented the survey results across the region.</p>")
    for api, doc_id in ((first, original), (second, copy)):
        api.call("POST", f"/folders/{folder}/documents", {"documentId": doc_id}).raise_for_status()
    return folder, original, copy


def select_paragraph(driver: WebDriver, contains: str) -> None:
    """Select the whole text of the editor paragraph containing `contains`, as a user drag would."""
    found = driver.execute_script(
        """const p = [...document.querySelectorAll('.ProseMirror p')].find(e => e.textContent.includes(arguments[0]));
        if (!p) return false;
        document.querySelector('.ProseMirror').focus();
        const range = document.createRange(); range.selectNodeContents(p);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        return true;""",
        contains,
    )
    assert found, f"no paragraph contains {contains!r}"
    time.sleep(0.5)


def ask_assistant(driver: WebDriver, message: str) -> None:
    """Open the assistant's chat and send a message the way a user types it (Shift+Enter for
    new lines)."""
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Assistant']"))
    box = visible(driver, By.CSS_SELECTOR, "textarea[aria-label='Message the assistant']")
    driver.execute_script("arguments[0].focus()", box)
    for index, line in enumerate(message.split("\n")):
        if index:
            box.send_keys(Keys.SHIFT, Keys.ENTER)
        box.send_keys(line)
    click(driver, driver.find_element(By.CSS_SELECTOR, "button[aria-label='Send message']"))


# ---- Import (Module 8) ----------------------------------------------------------------

DOCUMENTS = FIXTURES / "import_baselines" / "documents"


def choose_import_file(driver: WebDriver, path: Path) -> WebElement:
    """Dashboard → New document → Import from file → pick the file. Returns the dialog."""
    open_page(driver, "/dashboard")
    visible(driver, By.XPATH, "//button[contains(normalize-space(), 'New document')]").click()
    click(driver, visible(driver, By.XPATH, "//*[@role='menuitem'][contains(normalize-space(), 'Import from file')]"))
    dialog = visible(driver, By.CSS_SELECTOR, "[role='dialog'][aria-label='Import file dialog']")
    field = dialog.find_element(By.CSS_SELECTOR, "input[type='file']")
    driver.execute_script("arguments[0].style.display='block'; arguments[0].style.opacity=1", field)
    field.send_keys(str(path))
    return dialog


def import_through_dashboard(driver: WebDriver, path: Path, timeout: float = 600) -> tuple[str, float]:
    """Import a file the way a user does and open the result. Returns (document id, seconds from
    clicking Import to the document being ready)."""
    dialog = choose_import_file(driver, path)
    started = time.time()
    click(driver, dialog.find_element(By.XPATH, ".//button[starts-with(normalize-space(), 'Import')]"))
    opener = visible(driver, By.XPATH, "//*[@role='status']//button[normalize-space()='Open document']", timeout=timeout)
    ready = time.time() - started
    click(driver, opener)
    wait_for(driver, lambda d: "/document/" in d.current_url, timeout=60)
    visible(driver, By.CSS_SELECTOR, ".ProseMirror", timeout=120)
    wait_for_text(driver, timeout=120)
    time.sleep(1)
    return document_id_from_url(driver), ready


def document_id_from_url(driver: WebDriver) -> str:
    return driver.current_url.split("/document/")[1].split("?")[0].split("/")[0].split("#")[0]


PAGE_LAYOUT = """const wrapper = document.querySelector('.rm-pages-wrapper'); const pm = document.querySelector('.ProseMirror');
if (!wrapper || !pm) return null;
const pageH = parseFloat(getComputedStyle(wrapper).getPropertyValue('--rm-page-height'));
const height = pm.getBoundingClientRect().height;
return {breaks: document.querySelectorAll('.rm-page-break').length, height: Math.round(height),
        pages: Math.max(1, Math.round((height + 40) / (pageH + 40)))};"""


def settled_page_count(driver: WebDriver, timeout: float = 240) -> int:
    """Pages in the editor once the paginator stops adding them (same measure as fidelity_run.py:
    pages are --rm-page-height tall with a 40 px gap)."""
    deadline = time.time() + timeout
    last, stable = None, 0
    while time.time() < deadline:
        layout = driver.execute_script(PAGE_LAYOUT)
        signature = (layout["breaks"], layout["height"]) if layout else None
        stable = stable + 1 if signature == last and layout else 0
        last = signature
        if stable >= 3:
            return int(layout["pages"])
        time.sleep(1)
    return int(driver.execute_script(PAGE_LAYOUT)["pages"])


def import_failure(driver: WebDriver, timeout: float = 300) -> str:
    """The error the import toast shows for a file that could not be imported."""
    failure = visible(driver, By.XPATH, "//*[@role='status']//p[contains(@style, 'var(--error)')]", timeout=timeout)
    return failure.text


def wait_for_card(driver: WebDriver, testid: str, timeout: float = 120) -> WebElement:
    return visible(driver, By.CSS_SELECTOR, f"[data-testid='{testid}']", timeout=timeout)


def wait_for_scan(professor: Api, scan_id: str, timeout: float = 300) -> dict[str, Any]:
    """Poll a council scan until it leaves 'running' (the way the professor's page polls)."""
    deadline = time.time() + timeout
    while True:
        detail = professor.call("GET", f"/plagiarism/scans/{scan_id}").json()
        if detail["scan"]["scan_status"] != "running" or time.time() > deadline:
            return detail
        time.sleep(4)
