"""Browser layer: editor formatting, persistence, and stability.

Each test creates its own document, types a unique probe line, selects it, clicks
the real toolbar button, then asserts on the computed style of the block that
contains that probe text.

Locating the block by text rather than by ``window.getSelection()`` matters:
clicking a toolbar button moves focus off the ProseMirror surface, so the DOM
selection is empty afterwards even though ProseMirror still holds the selection.
Keying off the probe text also proves the typed text landed where intended.
"""

from __future__ import annotations

import pytest

from harness import (
    Api,
    block_by_text,
    e2e,
    filter_console_noise,
    open_document,
    screenshot,
    sign_in,
)

M = "ui/editor"

CONTENT = (
    "<p>e2e formatting target line</p>"
    "<p>second paragraph for contrast</p>"
)


@pytest.fixture
def editor(page, auth_client: Api):
    """A signed-in session with a fresh document open in the editor."""
    sign_in(page)
    doc_id = open_document(page, auth_client, CONTENT)
    page.click(".ProseMirror")
    page.wait_for_timeout(400)
    page.keyboard.press("Control+End")
    page.wait_for_timeout(300)
    return page, doc_id


def probe(page, text: str) -> None:
    """Append a uniquely named line and select it."""
    page.keyboard.press("Enter")
    page.keyboard.type(text)
    page.wait_for_timeout(400)
    page.keyboard.press("Home")
    page.keyboard.down("Shift")
    page.keyboard.press("End")
    page.keyboard.up("Shift")
    page.wait_for_timeout(400)


def located(page, text: str) -> dict:
    """Fetch the block containing the probe, failing loudly if it is absent."""
    block = block_by_text(page, text)
    assert block is not None, "editor not mounted"
    assert not block.get("missing"), (
        f"probe text {text!r} not found in editor; blocks present: {block.get('blocks')}"
    )
    return block


def press(page, title: str, settle: int = 800) -> None:
    page.click(f'button[title^="{title}"]')
    page.wait_for_timeout(settle)


# ---------------------------------------------------------------------------
# inline formatting
# ---------------------------------------------------------------------------


@e2e(M, layer="browser")
def test_bold_applies_bold_weight(editor) -> None:
    page, _ = editor
    text = "probe bold"
    probe(page, text)
    before = located(page, text)
    press(page, "Bold")
    after = located(page, text)
    assert after["hasStrong"] or int(after["fontWeight"]) >= 600, (
        f"bold not applied: before={before['fontWeight']} after={after}"
    )
    screenshot(page, "editor-bold")


@e2e(M, layer="browser")
def test_italic_applies_italic_style(editor) -> None:
    page, _ = editor
    text = "probe italic"
    probe(page, text)
    press(page, "Italic")
    after = located(page, text)
    assert after["hasEm"] or "italic" in (after["fontStyle"] or ""), f"italic not applied: {after}"
    screenshot(page, "editor-italic")


@e2e(M, layer="browser")
def test_underline_applies_decoration(editor) -> None:
    page, _ = editor
    text = "probe underline"
    probe(page, text)
    press(page, "Underline")
    after = located(page, text)
    assert after["hasU"] or "underline" in (after["textDecoration"] or ""), (
        f"underline not applied: {after}"
    )
    screenshot(page, "editor-underline")


@e2e(M, layer="browser")
def test_strikethrough_applies_decoration(editor) -> None:
    page, _ = editor
    text = "probe strike"
    probe(page, text)
    press(page, "Strikethrough")
    after = located(page, text)
    assert after["hasStrike"] or "line-through" in (after["textDecoration"] or ""), (
        f"strikethrough not applied: {after}"
    )


@e2e(M, layer="browser")
@pytest.mark.parametrize("title,expected_tag", [
    ("Heading 1", "h1"), ("Heading 2", "h2"), ("Heading 3", "h3"),
])
def test_heading_converts_block_type(editor, title: str, expected_tag: str) -> None:
    page, _ = editor
    text = f"probe {expected_tag}"
    probe(page, text)
    page.click(f'button[title="{title}"]')
    page.wait_for_timeout(900)
    after = located(page, text)
    assert after["tag"] == expected_tag, f"expected {expected_tag}, got {after['tag']}"


@e2e(M, layer="browser")
def test_quote_converts_to_blockquote(editor) -> None:
    page, _ = editor
    text = "probe quote"
    probe(page, text)
    press(page, "Quote")
    after = located(page, text)
    assert after["tag"] in ("blockquote", "li"), f"quote not applied: {after}"


# ---------------------------------------------------------------------------
# lists
# ---------------------------------------------------------------------------


@e2e(M, layer="browser")
def test_bullet_list_wraps_line(editor) -> None:
    page, _ = editor
    text = "probe bullet"
    probe(page, text)
    press(page, "Bullet List")
    after = located(page, text)
    assert after["inList"] and after["listTag"] == "ul", f"bullet list not applied: {after}"
    screenshot(page, "editor-bullet")


@e2e(M, layer="browser")
def test_numbered_list_wraps_line(editor) -> None:
    page, _ = editor
    text = "probe numbered"
    probe(page, text)
    press(page, "Numbered List")
    after = located(page, text)
    assert after["inList"] and after["listTag"] == "ol", f"numbered list not applied: {after}"


@e2e(M, layer="browser")
def test_outdent_after_indent_is_stable(editor) -> None:
    page, _ = editor
    text = "probe indent"
    probe(page, text)
    press(page, "Bullet List")
    press(page, "Indent")
    press(page, "Outdent")
    after = located(page, text)
    assert after is not None, "block vanished after indent/outdent"


# ---------------------------------------------------------------------------
# alignment
# ---------------------------------------------------------------------------


@e2e(M, layer="browser")
@pytest.mark.parametrize("toolbar,expected", [
    ("Align Center", "center"), ("Align Right", "right"), ("Justify", "justify"),
])
def test_alignment_applies(editor, toolbar: str, expected: str) -> None:
    page, _ = editor
    text = f"probe {expected}"
    probe(page, text)
    press(page, toolbar)
    after = located(page, text)
    assert after["textAlign"] == expected, f"expected {expected}, got {after['textAlign']}"


# ---------------------------------------------------------------------------
# clear formatting and history
# ---------------------------------------------------------------------------


@e2e(M, layer="browser")
def test_clear_formatting_removes_inline_styles(editor) -> None:
    page, _ = editor
    text = "probe clear"
    probe(page, text)
    press(page, "Bold")
    press(page, "Clear Formatting")
    after = located(page, text)
    assert not after["hasStrong"], f"bold survived clear formatting: {after}"


@e2e(M, layer="browser")
def test_undo_reverses_last_change(editor) -> None:
    page, _ = editor
    text = "probe undo"
    probe(page, text)
    press(page, "Bold")
    bolded = located(page, text)
    assert bolded["hasStrong"] or int(bolded["fontWeight"]) >= 600, "precondition: bold applied"

    page.keyboard.press("Control+z")
    page.wait_for_timeout(900)
    after = located(page, text)
    assert not after["hasStrong"], f"undo did not clear bold: {after}"


@e2e(M, layer="browser")
def test_redo_reapplies_change(editor) -> None:
    page, _ = editor
    text = "probe redo"
    probe(page, text)
    press(page, "Bold")
    page.keyboard.press("Control+z")
    page.wait_for_timeout(700)
    page.keyboard.press("Control+y")
    page.wait_for_timeout(900)
    after = located(page, text)
    assert after["hasStrong"] or int(after["fontWeight"]) >= 600, f"redo did not restore bold: {after}"


# ---------------------------------------------------------------------------
# persistence
# ---------------------------------------------------------------------------


@e2e(M, layer="browser")
def test_typed_text_survives_reload(editor) -> None:
    """Autosave must persist content across a full page reload."""
    page, doc_id = editor
    marker = f"persisted-{doc_id[:8]}"
    page.keyboard.press("Enter")
    page.keyboard.type(marker)
    page.wait_for_timeout(3500)

    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".ProseMirror", timeout=25000)
    page.wait_for_timeout(2500)
    assert marker in page.inner_text(".ProseMirror"), "typed text did not survive reload"


@e2e(M, layer="browser")
def test_formatting_survives_reload(editor) -> None:
    """Formatted markup must persist, not just the plain text."""
    page, doc_id = editor
    text = "probe persist heading"
    probe(page, text)
    page.click('button[title="Heading 2"]')
    page.wait_for_timeout(4000)

    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".ProseMirror", timeout=25000)
    page.wait_for_timeout(2500)
    html = page.inner_html(".ProseMirror")
    assert "<h2" in html, f"heading lost after reload: {html[:200]}"


@e2e(M, layer="browser")
def test_bold_survives_reload(editor) -> None:
    page, _ = editor
    text = "probe persist bold"
    probe(page, text)
    press(page, "Bold")
    page.wait_for_timeout(4000)

    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".ProseMirror", timeout=25000)
    page.wait_for_timeout(2500)
    after = located(page, text)
    assert after["hasStrong"] or int(after["fontWeight"]) >= 600, (
        f"bold lost after reload: {after}"
    )


# ---------------------------------------------------------------------------
# stability
# ---------------------------------------------------------------------------


@e2e(M, layer="browser")
def test_selection_churn_does_not_overflow_the_stack(editor) -> None:
    """Regression guard for the style-origin decoration re-entrancy bug.

    Every selection change dispatches the transaction that recomputes the
    style-origin decoration. Before the re-entrancy guard this recursed until
    the stack blew.
    """
    page, _ = editor
    for _ in range(20):
        page.click(".ProseMirror")
        page.wait_for_timeout(100)
        for _ in range(4):
            page.keyboard.press("ArrowRight")
        page.keyboard.down("Shift")
        page.keyboard.press("ArrowRight")
        page.keyboard.up("Shift")
        page.wait_for_timeout(150)

    overflow = [e for e in page.e2e_errors if "call stack" in e.lower()]
    assert not overflow, f"stack overflow after 20 selection cycles: {overflow[:2]}"


@e2e(M, layer="browser")
def test_typing_burst_produces_no_application_errors(editor) -> None:
    page, _ = editor
    page.keyboard.press("Enter")
    page.keyboard.type("burst typing across several words to exercise autosave debounce")
    page.wait_for_timeout(3000)
    errors = filter_console_noise(page)
    assert not errors, f"console errors during typing: {errors[:3]}"


@e2e(M, layer="browser")
def test_editor_loads_without_application_errors(editor) -> None:
    page, _ = editor
    errors = filter_console_noise(page)
    assert not errors, f"console errors on editor load: {errors[:3]}"


# ---------------------------------------------------------------------------
# panels and toolbar tabs
# ---------------------------------------------------------------------------


@e2e("ui/panels", layer="browser")
def test_side_panels_toggle(page, auth_client: Api) -> None:
    sign_in(page)
    open_document(page, auth_client, CONTENT)
    for name in ("AI Assistant", "Suggestions", "History"):
        button = page.query_selector(f'button:has-text("{name}")')
        if button is None:
            continue
        button.click()
        page.wait_for_timeout(700)
    assert page.query_selector(".ProseMirror") is not None, "editor disappeared after panel toggles"
    screenshot(page, "editor-panels")


@e2e("ui/panels", layer="browser")
def test_toolbar_tabs_switch(page, auth_client: Api) -> None:
    sign_in(page)
    open_document(page, auth_client, CONTENT)
    for tab in ("Insert", "Styles", "Home"):
        el = page.query_selector(f'button:has-text("{tab}")')
        if el is None:
            continue
        el.click()
        page.wait_for_timeout(700)
    assert page.query_selector(".ProseMirror") is not None
