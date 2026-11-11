"""Browser layer: the modernised ribbon at a 1366x768 laptop viewport.

Screenshots land in tests/e2e/artifacts/ribbon-*.png. Each test opens a fresh
document, switches tabs with the real tab buttons and measures the one tool row.

Run with the dev stack up:  pytest tests/e2e/test_ui_ribbon.py -v
"""

from __future__ import annotations

import re

from harness import Api, e2e, open_document, screenshot, sign_in

M = "ui/ribbon"
VIEWPORT = {"width": 1366, "height": 768}
ROW = '[data-testid="ribbon-row"]'
TABS = {"home": "Text editing and formatting", "insert": "Insert content into the document", "styles": "Styles and academic presets"}

IEEE_CONTENT = (
    "<h1>Adaptive Editors</h1><p>A. Author, B. Author</p>"
    "<h1>Abstract</h1><p>We study adaptive editors.</p><p>Index Terms—editors, layout</p>"
    "<h1>Introduction</h1>" + "".join(f"<p>Paragraph {i} of body text.</p>" for i in range(12))
)


def _open(page, api: Api, content: str, preset: str | None = None) -> str:
    page.set_viewport_size(VIEWPORT)
    sign_in(page)
    doc_id = open_document(page, api, content)
    if preset:
        api.put(f"/documents/{doc_id}", {"formatting_preset": preset})
        page.reload()
        page.wait_for_selector(".ProseMirror p", state="attached")
        page.wait_for_timeout(5000)
    page.click(".ProseMirror")
    page.wait_for_timeout(400)
    # On a 768px-high window the ribbon starts folded to its tab strip; picking a tab unfolds it.
    _tab(page, "home")
    return doc_id


def _tab(page, name: str) -> None:
    page.locator(f'[title="{TABS[name]}"]').first.click()
    page.wait_for_timeout(400)


def _row_metrics(page) -> dict:
    return page.evaluate(
        """() => {
          const row = document.querySelector('[data-testid="ribbon-row"]');
          const bar = document.querySelector('.intellidocs-toolbar');
          const r = row.getBoundingClientRect();
          return { height: r.height, rowScroll: row.scrollWidth, rowClient: row.clientWidth,
                   barScroll: bar.scrollWidth, barClient: bar.clientWidth };
        }"""
    )


@e2e(M, requires=(), layer="browser")
def test_toolbar_is_one_row_on_every_tab_at_1366(page, auth_client: Api):
    _open(page, auth_client, "<p>Ribbon fit check.</p>")
    for name in ("home", "insert", "styles"):
        _tab(page, name)
        m = _row_metrics(page)
        assert 30 <= m["height"] <= 56, (name, m)
        assert m["rowScroll"] <= m["rowClient"] + 1, (name, m)
        assert m["barScroll"] <= m["barClient"] + 1, (name, m)
        screenshot(page, f"ribbon-{name}")


@e2e(M, requires=(), layer="browser")
def test_insert_tab_offers_table_picker_page_break_and_equation(page, auth_client: Api):
    _open(page, auth_client, "<p>Insert tab check.</p>")
    _tab(page, "insert")
    for title in ("Insert & Manage Table", "Callout", "Insert Image", "Page Break", "Horizontal Line", "Math Equation (LaTeX block)"):
        assert page.locator(f'[title="{title}"]').count() > 0, title
    assert page.locator('[title^="Import Document"]').count() > 0
    page.locator('[title="Insert & Manage Table"]').first.click()
    page.wait_for_timeout(300)
    assert page.get_by_role("grid", name="Table size").count() == 1
    screenshot(page, "ribbon-insert-table-picker")
    page.get_by_role("gridcell", name="2 by 3").click()
    page.wait_for_timeout(600)
    assert page.evaluate("document.querySelectorAll('.ProseMirror table').length") == 1
    assert page.evaluate("document.querySelector('.ProseMirror table tr').children.length") == 3


@e2e(M, requires=(), layer="browser")
def test_styles_tab_shows_preview_tiles_with_active_state(page, auth_client: Api):
    _open(page, auth_client, "<h2>Section heading</h2><p>Body.</p>")
    page.locator(".ProseMirror h2").first.click()
    _tab(page, "styles")
    tiles = page.locator('[data-testid="ribbon-row"] button[aria-pressed]:visible')
    assert tiles.count() >= 7
    assert page.locator('[data-testid="ribbon-row"] button[aria-pressed="true"][title^="Heading 2"]:visible').count() == 1
    screenshot(page, "ribbon-styles")


@e2e(M, requires=(), layer="browser")
def test_restructure_opens_a_dialog_and_cancel_keeps_the_text(page, auth_client: Api):
    _open(page, auth_client, IEEE_CONTENT, preset="ieee")
    before = page.evaluate("document.querySelector('.ProseMirror').innerText")
    page.locator('[title="IEEE layout"]').first.click()
    page.wait_for_timeout(300)
    page.locator('[title="Restructure into IEEE format"]').first.click()
    dialog = page.get_by_role("dialog", name="Restructure into IEEE format?")
    dialog.wait_for(state="visible", timeout=5000)
    assert dialog.get_by_text("Unmapped Content").count() == 1
    screenshot(page, "ribbon-ieee-restructure-dialog")
    dialog.get_by_role("button", name="Cancel").click()
    page.wait_for_timeout(300)
    assert page.get_by_role("dialog").count() == 0
    assert page.evaluate("document.querySelector('.ProseMirror').innerText") == before


@e2e(M, requires=(), layer="browser")
def test_print_preview_is_a_centered_modal_not_a_takeover(page, auth_client: Api):
    _open(page, auth_client, IEEE_CONTENT, preset="ieee")
    page.locator('[title="IEEE layout"]').first.click()
    page.wait_for_timeout(300)
    page.locator('[title="Exact IEEE print preview (two columns, PDF)"]').first.click()
    status = page.locator('[data-testid="ieee-preview-status"]')
    status.wait_for(state="visible", timeout=10000)
    page.wait_for_function(
        "() => /\\d+ pages?/.test(document.querySelector('[data-testid=\"ieee-preview-status\"]').textContent)",
        timeout=30000,
    )
    box = page.locator("#ieee-print-preview .ieee-preview-panel").bounding_box()
    assert box is not None
    assert box["width"] < VIEWPORT["width"] - 20 and box["height"] < VIEWPORT["height"] - 20, box
    assert box["x"] > 10 and box["y"] > 10, box
    # The abstract spans both columns: it sits inside the front matter, before the body.
    assert page.evaluate("!!document.querySelector('#ieee-print-preview .ieee-front h1 + p')")
    screenshot(page, "ribbon-ieee-preview-modal")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    assert page.locator("#ieee-print-preview").count() == 0


@e2e(M, requires=(), layer="browser")
def test_two_column_draft_keeps_front_matter_full_width(page, auth_client: Api):
    _open(page, auth_client, IEEE_CONTENT, preset="ieee")
    page.locator('[title="IEEE layout"]').first.click()
    page.wait_for_timeout(300)
    page.locator('[title^="Two-column draft"]').first.click()
    page.wait_for_timeout(1500)
    front = page.evaluate("[...document.querySelectorAll('.ProseMirror.ieee-columns-draft > .ieee-front')].map(e => e.textContent)")
    assert any(t.startswith("Abstract") for t in front), front
    assert any(t.startswith("Index Terms") for t in front), front
    assert not any(t.startswith("Introduction") for t in front), front
    span = page.evaluate("getComputedStyle(document.querySelector('.ProseMirror.ieee-columns-draft > .ieee-front')).columnSpan")
    assert span == "all"
    screenshot(page, "ribbon-two-column-draft")


@e2e(M, requires=(), layer="browser")
def test_spread_view_is_disabled_on_long_ieee_documents(page, auth_client: Api):
    long_doc = "<h1>Long Paper</h1>" + "".join(f"<p>{'Body text. ' * 60}</p>" for _ in range(60))
    _open(page, auth_client, long_doc, preset="ieee")
    page.wait_for_timeout(2000)
    page.locator('[title="IEEE layout"]').first.click()
    page.wait_for_timeout(300)
    item = page.locator('[title="Double-page view is optimized for 2-page papers"]').first
    assert item.count() == 1
    assert item.get_attribute("data-disabled") is not None or item.get_attribute("aria-disabled") == "true"
    screenshot(page, "ribbon-spread-disabled")
    page.keyboard.press("Escape")


@e2e(M, requires=(), layer="browser")
def test_bubble_menu_heading_uses_the_style_command(page, auth_client: Api):
    _open(page, auth_client, "<p><strong>Bold line</strong></p><p>Body.</p>")
    page.locator(".ProseMirror p").first.click(click_count=3)
    page.wait_for_timeout(500)
    page.locator('[title="Heading 1"]').first.click()
    page.wait_for_timeout(600)
    info = page.evaluate(
        """() => { const h = document.querySelector('.ProseMirror h1');
                   return { tag: h && h.tagName, strong: !!(h && h.querySelector('strong')), src: h && h.getAttribute('data-style-source') }; }"""
    )
    assert info["tag"] == "H1" and info["strong"] is False and info["src"] == "applied_style", info
    assert re.search(r"\d", page.evaluate("document.querySelector('.ProseMirror h1').getAttribute('style') || ''") or "") is not None
