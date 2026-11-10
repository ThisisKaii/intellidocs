"""Chatbot formatting accuracy benchmark: 12 standard student commands, full stack.

Each prompt runs on a fresh copy of tests/fixtures/chat_benchmark/thesis.html
(created through the API, deleted permanently afterwards): the request goes to
the real /api/ai/chat endpoint, the preview's Apply button is pressed, and the
resulting document is scored.

Run with the real stack up (server :3000, frontend :5173):
    ml/venv/Scripts/python tests/e2e/chat_accuracy_benchmark.py
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path
from typing import Callable

from playwright.sync_api import Page, sync_playwright

WEB = "http://localhost:5173"
EMAIL = "test@test.com"
PASSWORD = "asd123"
FIXTURE = (Path(__file__).resolve().parents[1] / "fixtures" / "chat_benchmark" / "thesis.html").read_text(encoding="utf-8")
BUBBLE = "div[style*='max-width: 85%']"

Block = dict  # {tag, style, text, html, bold}
Check = Callable[[list[Block], dict], tuple[bool, str]]


def blocks_of(page: Page) -> list[Block]:
    """Top-level document blocks (pagination widgets left out)."""
    return page.evaluate(
        """() => [...document.querySelector('.ProseMirror').children]
          .filter(e => !e.classList.contains('ProseMirror-widget') && e.textContent.trim().length > 0)
          .map(e => {
            const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
            let allBold = true, any = false;
            while (walker.nextNode()) {
              const n = walker.currentNode; if (!n.textContent.trim()) continue; any = true;
              if (!n.parentElement.closest('strong, b')) allBold = false;
            }
            return { tag: e.tagName, style: e.getAttribute('style') || '', text: e.textContent.trim(), html: e.innerHTML, bold: any && allBold };
          })"""
    )


def find(blocks: list[Block], text: str) -> Block | None:
    key = text.lower()
    return next((b for b in blocks if b["text"].lower().startswith(key)), None)


def body(blocks: list[Block]) -> list[Block]:
    """Body paragraphs: plain (not all-bold) paragraphs of sentence length inside the chapters (after CHAPTER 1)."""
    start = next((i for i, b in enumerate(blocks) if b["text"].upper().startswith("CHAPTER 1")), 0)
    return [b for b in blocks[start:] if b["tag"] == "P" and len(b["text"]) > 40 and not b["bold"]]


# Body paragraphs in the untouched fixture, so a check can never pass because
# a command turned the body into something else (e.g. every paragraph a heading).
BODY_COUNT = sum(1 for text in re.findall(r'<p style="text-align: justify">([^<]+)</p>', FIXTURE) if len(text.strip()) > 40)


def has_style(block: Block | None, prop: str, pattern: str) -> bool:
    if not block:
        return False
    decl = re.search(rf"{prop}\s*:\s*([^;]+)", block["style"] + ";" + block["html"])
    return bool(decl and re.search(pattern, decl.group(1)))


def all_spans_have(block: Block, prop: str, pattern: str) -> bool:
    markup = html.unescape(block["html"])  # font-family values come quoted: &quot;Times New Roman&quot;
    values = re.findall(rf"{prop}\s*:\s*([^;\"]+|\"[^\"]+\")", markup)
    return len(values) > 0 and all(re.search(pattern, v) for v in values)


def heading_count(blocks: list[Block], tag: str) -> int:
    return sum(1 for b in blocks if b["tag"] == tag)


# ── Checks ──────────────────────────────────────────────────────────────


def c1(blocks, _):
    target = find(blocks, "Statement of the Problem")
    ok = bool(target and target["tag"] == "H2") and heading_count(blocks, "H2") == 3
    return ok, f"'Statement of the Problem' is {target and target['tag']}; H2 count {heading_count(blocks, 'H2')} (want 3)"


def c2(blocks, _):
    ch = find(blocks, "CHAPTER 1")
    first_body = body(blocks)[0]
    ok = bool(ch and ch["bold"] and has_style(ch, "text-align", "center")) and "<strong" not in first_body["html"]
    return ok, f"CHAPTER 1 bold={ch and ch['bold']} style='{ch and ch['style']}'; body untouched={'<strong' not in first_body['html']}"


def c3(blocks, _):
    target = find(blocks, "Background of the Study")
    ok = bool(target and target["tag"] == "H2") and heading_count(blocks, "H2") == 3
    return ok, f"'Background of the Study' is {target and target['tag']}; H2 count {heading_count(blocks, 'H2')} (want 3)"


def c4(blocks, _):
    lists = [b for b in blocks if b["tag"] == "OL"]
    intro = find(blocks, "This study aims")
    ok = len(lists) == 1 and lists[0]["text"].count("?") == 3 and intro is not None and intro["tag"] == "P"
    return ok, f"{len(lists)} numbered list(s); questions inside: {lists[0]['text'].count('?') if lists else 0}/3"


SECTION_TITLES = ["Background of the Study", "Statement of the Problem", "Significance of the Study", "Scope and Delimitation", "Conceptual Framework"]


def c5(blocks, _):
    hits = [t for t in SECTION_TITLES if (b := find(blocks, t)) and b["bold"] and all_spans_have(b, "font-size", r"14pt")]
    leaks = [b["text"][:30] for b in body(blocks) if "14pt" in b["html"]]
    ok = len(hits) == len(SECTION_TITLES) and not leaks
    return ok, f"{len(hits)}/{len(SECTION_TITLES)} section headings 14pt+bold; body leaks: {len(leaks)}"


def c6(blocks, _):
    paras = body(blocks)
    indented = [b for b in paras if has_style(b, "text-indent", r"(0\.5in|36pt|48px)")]
    leaks = [b["text"][:30] for b in blocks if b["tag"].startswith("H") and "text-indent" in b["style"]]
    ok = len(paras) == BODY_COUNT and len(indented) == len(paras) and not leaks
    return ok, f"{len(indented)}/{len(paras)} body paragraphs indented 0.5in; headings indented: {len(leaks)}"


def c7(blocks, _):
    paras = body(blocks)
    spaced = [b for b in paras if has_style(b, "line-height", r"^\s*2(\.0+)?\s*$")]
    ok = len(paras) == BODY_COUNT and len(spaced) == len(paras)
    return ok, f"{len(spaced)}/{len(paras)} body paragraphs at line-height 2 (fixture has {BODY_COUNT})"


def c8(blocks, _):
    font = [b for b in blocks if all_spans_have(b, "font-family", r"Times New Roman")]
    size = [b for b in blocks if all_spans_have(b, "font-size", r"12pt")]
    ok = len(font) == len(blocks) and len(size) == len(blocks)
    return ok, f"Times New Roman on {len(font)}/{len(blocks)} blocks; 12pt on {len(size)}/{len(blocks)}"


def c9(blocks, _):
    title = blocks[0]
    ok = title["text"] == title["text"].upper() and has_style(title, "text-align", "center")
    return ok, f"title='{title['text'][:40]}' style='{title['style']}'"


def c10(_blocks, ctx):
    ok = ctx.get("apa_active", False)
    return ok, f"APA preset active after Apply: {ctx.get('apa_active')}; preview: {ctx.get('preview', '')[:60]}"


def c11(blocks, _):
    ch2 = find(blocks, "CHAPTER 2")
    rrl = find(blocks, "REVIEW OF RELATED LITERATURE")
    paras = body(blocks)
    left = [b for b in paras if has_style(b, "text-align", "left")]
    ok = bool(ch2 and ch2["tag"] == "H1" and rrl and rrl["tag"] == "H2") and len(paras) == BODY_COUNT and len(left) == len(paras)
    return ok, f"CHAPTER 2={ch2 and ch2['tag']} RRL={rrl and rrl['tag']} left-aligned body {len(left)}/{len(paras)} (fixture has {BODY_COUNT})"


def c12(_blocks, ctx):
    reply = ctx.get("reply", "")
    ok = not ctx.get("had_preview") and bool(re.search(r"reduc|time|format", reply, re.I))
    return ok, f"preview shown={ctx.get('had_preview')}; reply: {reply[:90]!r}"


BENCH: list[tuple[str, str, Check]] = [
    ("1", "Format Statement of the Problem as Heading 2", c1),
    ("2", "Make Chapter 1 bold and center it", c2),
    ("3", "Turn 'Background of the Study' into Heading 2", c3),
    ("4", "Convert the research questions into a numbered list", c4),
    ("5", "Make all section headings 14pt and bold", c5),
    ("6", "Indent all body paragraphs", c6),
    ("7a", "Double space the document", c7),
    ("7b", "Set line spacing to 2.0", c7),
    ("8", "Change font to Times New Roman 12pt for the whole document", c8),
    ("9", "Capitalize the title and center it", c9),
    ("10", "Format in APA style", c10),
    ("11", "Format Chapter 2 as Heading 1, Review of Related Literature as Heading 2, and left-align the paragraphs", c11),
    ("12", "What is the main objective of this study?", c12),
]


def api(page: Page, method: str, path: str, body: dict | None = None) -> dict | None:
    return page.evaluate(
        """async ([method, path, body]) => {
          const token = localStorage.getItem('authToken');
          const res = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
          const text = await res.text();
          return text ? JSON.parse(text) : null;
        }""",
        [method, path, body],
    )


def run_prompt(page: Page, prompt: str) -> tuple[list[Block], dict]:
    doc = api(page, "POST", "documents", {"title": "chat accuracy benchmark", "content": FIXTURE, "unique_title": True})
    doc_id = doc["id"]
    ctx: dict = {}
    try:
        page.goto(f"{WEB}/document/{doc_id}", wait_until="domcontentloaded")
        page.wait_for_selector(".ProseMirror", timeout=30000)
        page.wait_for_timeout(2500)
        chat = page.locator("[placeholder^='Ask for writing']").first
        before = page.locator(BUBBLE).count()
        chat.fill(prompt)
        chat.press("Enter")
        page.wait_for_function(f"document.querySelectorAll(\"{BUBBLE}\").length >= {before + 2}", timeout=90000)
        page.wait_for_timeout(600)
        last = page.locator(BUBBLE).last
        ctx["reply"] = last.inner_text()
        apply = last.get_by_role("button", name="Apply", exact=True)
        ctx["had_preview"] = apply.count() > 0
        ctx["preview"] = ctx["reply"].split("PREVIEW SUGGESTION")[-1].strip() if ctx["had_preview"] else ""
        if ctx["had_preview"]:
            apply.click()
            page.wait_for_timeout(1500)
            ctx["applied"] = page.locator(BUBBLE).last.inner_text()
        if prompt.startswith("Format in APA"):
            page.locator("button[title='Styles and academic presets']").first.click()
            page.wait_for_timeout(500)
            weight = page.evaluate(
                "() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'APA 7th Edition'); return b ? getComputedStyle(b).fontWeight : null }"
            )
            ctx["apa_active"] = weight is not None and int(weight) >= 700
        return blocks_of(page), ctx
    finally:
        api(page, "POST", f"documents/{doc_id}/trash")
        api(page, "DELETE", f"documents/{doc_id}/permanent")


def main() -> int:
    only = set(sys.argv[1:])
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        page = browser.new_context(viewport={"width": 1600, "height": 950}).new_page()
        page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        page.fill("input#email", EMAIL)
        page.fill("input#password", PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_url(f"{WEB}/dashboard", timeout=30000)
        for number, prompt, check in BENCH:
            if only and number not in only:
                continue
            try:
                blocks, ctx = run_prompt(page, prompt)
                ok, detail = check(blocks, ctx)
            except Exception as error:  # noqa: BLE001 - a crash is a failed prompt, not a stopped benchmark
                ok, detail = False, f"error: {type(error).__name__}: {str(error)[:120]}"
            results.append({"n": number, "prompt": prompt, "pass": ok, "detail": detail})
            print(f"[{'PASS' if ok else 'FAIL'}] #{number} {prompt}\n        {detail}", flush=True)
        browser.close()
    passed = sum(1 for r in results if r["pass"])
    print(f"\nScore: {passed}/{len(results)}")
    out = Path(__file__).parent / "artifacts" / "chat_accuracy_benchmark.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
