"""IEEE regression tests: blueprint, renumbering, convert, captions, citations, forked presets.

Run with the dev stack up:  pytest tests/e2e/test_ieee_regression.py -v
"""

from __future__ import annotations

import re

from harness import Api, e2e, open_document, sign_in

TABLE = "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>"


def _open(page, api: Api, content: str, preset: str | None = "ieee") -> str:
    """Sign in, create a document with an IEEE preset bound, and open it."""
    sign_in(page)
    doc_id = open_document(page, api, content)
    if preset:
        api.put(f"/documents/{doc_id}", {"formatting_preset": preset})
        page.reload()
        page.wait_for_selector(".ProseMirror p", state="attached")
        page.wait_for_timeout(6000)
    return doc_id


def _headings(page) -> list[str]:
    return page.evaluate("[...document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')].map(e => e.textContent)")


def _text(page) -> str:
    return page.evaluate("document.querySelector('.ProseMirror').innerText")


@e2e("ieee", requires=(), layer="browser")
def test_new_ieee_document_has_template_page_setup_and_numbered_sections(page, api: Api):
    sign_in(page)
    page.goto("http://localhost:5173/dashboard")
    page.wait_for_timeout(2500)
    page.get_by_text("New document").first.click()
    page.wait_for_timeout(400)
    page.get_by_text("New document").nth(1).click()
    page.wait_for_timeout(700)
    page.get_by_text("IEEE Conference Template").first.click()
    page.get_by_role("button", name="Create document").click()
    page.wait_for_url(re.compile(r"/document/"), timeout=30000)
    page.wait_for_timeout(6000)
    doc_id = page.url.rsplit("/", 1)[-1]
    doc = api.get(f"/documents/{doc_id}").json()
    assert doc["page_size"] == "letter"
    assert doc["margins"] == {"top": 0.75, "bottom": 1, "left": 0.625, "right": 0.625}
    headings = _headings(page)
    assert headings[1].startswith("I. Introduction"), headings
    assert any(h.startswith("VI. Conclusion") for h in headings), headings


@e2e("ieee", requires=(), layer="browser")
def test_renumber_is_correct_keeps_bold_and_is_idempotent(page, api: Api):
    _open(page, api, "<h1>Intro</h1><p>a</p><h1><strong>Method</strong>s</h1><p>b</p><h2>Scope</h2><h1>Results</h1><h1>References</h1>")
    button = page.locator('[title^="Renumber IEEE headings"]').first
    button.click()
    page.wait_for_timeout(800)
    assert _headings(page) == ["I. Intro", "II. Methods", "A. Scope", "III. Results", "References"]
    assert page.evaluate("document.querySelector('.ProseMirror h1:nth-of-type(2) strong') !== null")
    button.click()
    page.wait_for_timeout(500)
    assert _headings(page) == ["I. Intro", "II. Methods", "A. Scope", "III. Results", "References"]


@e2e("ieee", requires=(), layer="browser")
def test_convert_keeps_all_content_and_undo_restores_the_document(page, api: Api):
    original = (
        "<p>Alice Smith</p><h1>Introduction</h1><p>Intro text.</p><h2>Prior Approaches</h2><p>Sub text.</p>"
        + TABLE
        + "<h1>Methodology</h1><p>Method text.</p><h1>Weird Extra</h1><p>Extra text.</p>"
    )
    _open(page, api, original)
    before = _text(page)
    page.on("dialog", lambda d: d.accept())
    page.locator('[title="Restructure into IEEE format"]').first.click()
    page.wait_for_timeout(2000)
    after = _text(page)
    for kept in ("Alice Smith", "Intro text.", "Prior Approaches", "Sub text.", "Method text.", "Weird Extra", "Extra text."):
        assert after.count(kept) == 1, (kept, after[:400])
    assert "Explain the problem" not in after and "Author Name" not in after
    assert page.evaluate("document.querySelectorAll('.ProseMirror table').length") == 1
    page.locator(".ProseMirror").first.click()
    page.keyboard.press("Control+z")
    page.wait_for_timeout(1000)
    assert "Alice Smith" in _text(page) and "Weird Extra" in _text(page)
    assert "Abstract" not in _text(page) or "Abstract" in before


@e2e("ieee", requires=(), layer="browser")
def test_ieee_captions_use_fig_and_roman_table_labels(page, api: Api):
    _open(page, api, "<p>Intro</p>" + TABLE + "<p>After</p>")
    page.locator("table td").first.click()
    page.locator('[title="Insert content into the document"]').first.click()
    page.wait_for_timeout(300)
    page.locator('[title="Insert & Manage Table"]').first.click()
    page.wait_for_timeout(300)
    page.get_by_text("Add numbered caption").first.click()
    page.wait_for_timeout(800)
    caps = page.evaluate("[...document.querySelectorAll('p[data-caption-kind=table]')].map(e => e.textContent)")
    assert caps and caps[0].startswith("TABLE I."), caps


@e2e("ieee", requires=(), layer="browser")
def test_deleting_a_reference_renumbers_the_markers_in_the_text(page, api: Api):
    _open(page, api, "<p>Claim one. Claim two.</p>")
    page.get_by_role("button", name="Tools").first.click()
    page.get_by_role("button", name="Manage", exact=True).first.click()
    for title in ("First Source", "Second Source"):
        page.get_by_role("button", name="Add Reference").click()
        page.get_by_placeholder("Author 1 (Last, First)").fill("Jane Smith")
        page.get_by_placeholder("Title of work").fill(title)
        page.get_by_role("button", name="Add Reference").last.click()
        page.wait_for_timeout(300)
    page.locator(".ProseMirror").first.click()
    page.keyboard.press("Control+End")
    page.get_by_role("button", name="Insert", exact=True).first.click()
    inserts = page.locator('button[title="Insert citation at cursor"]')
    inserts.nth(0).click()
    page.keyboard.type(" and ")
    inserts.nth(1).click()
    page.wait_for_timeout(500)
    assert "[1]" in _text(page) and "[2]" in _text(page)
    page.get_by_role("button", name="Manage", exact=True).first.click()
    page.locator('button[title="Delete"]').first.click()
    page.wait_for_timeout(800)
    text = _text(page)
    assert "[?]" in text and "[1]" in text and "[2]" not in text, text


@e2e("ieee", requires=(), layer="browser")
def test_forked_ieee_preset_keeps_the_ieee_tools(page, api: Api):
    _open(page, api, "<h1>Introduction</h1><p>Text.</p>", preset="ieee__v2")
    assert page.locator('[title^="Renumber IEEE headings"]').count() > 0


@e2e("ieee", requires=(), layer="browser")
def test_two_column_draft_toggles_columns_and_back(page, api: Api):
    _open(page, api, "<h1>Introduction</h1>" + "".join(f"<p>Paragraph {i} of body text for the columns check.</p>" for i in range(20)))
    toggle = page.locator('[title^="Two-column draft"], [title^="Back to"]').first
    toggle.click()
    page.wait_for_timeout(1500)
    columns = page.evaluate("[...document.querySelectorAll('.ProseMirror, .tiptap, .intellidocs-page-editor *')].map(e => getComputedStyle(e).columnCount).filter(c => c === '2').length")
    assert columns > 0
    page.locator('[title^="Two-column draft"], [title^="Back to"], [title*="paged"]').first.click()
    page.wait_for_timeout(1500)


@e2e("ieee", requires=(), layer="browser")
def test_ieee_export_and_print_preview_are_offered(page, api: Api):
    _open(page, api, "<h1>Paper Title</h1><p>Author</p><h1>Introduction</h1><p>Body.</p>")
    assert page.locator('[title="Exact IEEE print preview (two columns, PDF)"]').count() > 0
    page.get_by_role("button", name="Export").first.click()
    page.wait_for_timeout(400)
    assert page.get_by_text("IEEE paper (Word)").count() > 0
