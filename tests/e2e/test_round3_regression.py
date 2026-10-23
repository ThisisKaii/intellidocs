"""Regression tests for the survey-driven features: panel navigator, grammar per block,
document Q&A with sources, citation styles, unsaved-change recovery, help sheet.

Run with the dev stack up:  pytest tests/e2e/test_round3_regression.py -v
"""

from __future__ import annotations

import re

from harness import Api, Requires, e2e, open_document, sign_in

LONG_FILLER = "".join(f"<p>Filler paragraph {i} with ordinary body text to push content down.</p>" for i in range(25))


def _open(page, api: Api, content: str = "<p>e2e scratch document</p>") -> str:
    """Sign in through the UI, then open a fresh document with the given content."""
    sign_in(page)
    return open_document(page, api, content)


def _open_suggestions(page, tab: str) -> None:
    page.get_by_role("button", name="Suggestions").first.click()
    page.get_by_role("tab", name=tab).click()


@e2e("grammar", requires=(), layer="browser")
def test_grammar_is_checked_per_block_not_as_one_run_on_text(page, api: Api):
    """Separate blocks must never be read as one sentence by the checker."""
    _open(
        page,
        api,
        "<h1>Methods</h1><table><tr><td>a</td><td>b</td></tr></table><p>between the parts</p><p>This is teh test.</p>",
    )
    _open_suggestions(page, "Grammar")
    page.wait_for_timeout(9000)
    rows = page.locator("aside").last.locator("button", has_text="→").all_inner_texts()
    assert any("teh" in row for row in rows), rows
    assert not any("Methods" in row and "between" in row for row in rows), rows


@e2e("suggestions", requires=(), layer="browser")
def test_grammar_row_opens_fix_popover_in_document(page, api: Api):
    _open(page, api, "<p>I recieve many mistakes here.</p>")
    _open_suggestions(page, "Grammar")
    page.wait_for_timeout(9000)
    page.locator("aside").last.locator("button", has_text="→").first.click()
    page.wait_for_timeout(900)
    page.get_by_role("button", name="Apply", exact=True).first.click()
    page.wait_for_timeout(600)
    text = page.evaluate("document.querySelector('.ProseMirror').innerText")
    assert "receive" in text and "recieve" not in text


@e2e("suggestions", requires=(), layer="browser")
def test_suggestion_switches_hide_their_lists(page, api: Api):
    _open(page, api, "<p>CHAPTER 1: INTRODUCTION</p><p>I recieve teh text.</p>")
    _open_suggestions(page, "Grammar")
    page.get_by_role("switch", name="Turn grammar and spelling checks on or off").uncheck()
    page.wait_for_timeout(1200)
    assert "Turned off" in page.locator("aside").last.inner_text()
    page.get_by_role("switch", name="Turn grammar and spelling checks on or off").check()


@e2e("suggestions", requires=(), layer="browser")
def test_help_sheet_opens_from_panel_and_closes_with_escape(page, api: Api):
    _open(page, api)
    page.get_by_role("button", name="Help", exact=True).click()
    assert page.get_by_role("dialog", name="Help").is_visible()
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    assert page.get_by_role("dialog", name="Help").count() == 0


@e2e("citations", requires=(), layer="browser")
def test_citation_style_changes_the_inserted_text(page, api: Api):
    _open(page, api, "<p>Cited sentence</p>")
    page.get_by_role("button", name="Tools").first.click()
    page.get_by_role("button", name="Manage", exact=True).first.click()
    page.get_by_role("button", name="Add Reference").click()
    page.get_by_placeholder("Author 1 (Last, First)").fill("Jane Smith")
    page.get_by_placeholder("Title of work").fill("Deep Formatting")
    page.get_by_role("button", name="Add Reference").last.click()
    page.wait_for_timeout(400)
    page.locator("select").last.select_option("mla")
    page.locator(".ProseMirror").first.click()
    page.keyboard.press("Control+End")
    page.get_by_role("button", name="Insert", exact=True).first.click()
    page.locator('button[title="Insert citation at cursor"]').first.click()
    page.wait_for_timeout(500)
    assert "(Smith)" in page.evaluate("document.querySelector('.ProseMirror').innerText")


@e2e("autosave", requires=(), layer="browser")
def test_unsaved_edits_are_offered_back_after_a_failed_save(page, api: Api):
    doc_id = _open(page, api, "<p>Original text</p>")
    page.route(re.compile(r".*/documents/" + doc_id + r"(\?.*)?$"), lambda r: r.abort() if r.request.method == "PUT" else r.continue_())
    page.locator(".ProseMirror p").first.click()
    page.keyboard.press("End")
    page.keyboard.type(" EDITED-OFFLINE")
    page.wait_for_timeout(7000)
    page.unroute(re.compile(r".*/documents/" + doc_id + r"(\?.*)?$"))
    page.reload()
    page.wait_for_selector(".ProseMirror p", state="attached")
    page.wait_for_timeout(6000)
    banner = page.get_by_text("We found unsaved changes")
    assert banner.count() > 0
    page.get_by_role("button", name="Restore my changes").click()
    page.wait_for_timeout(1500)
    assert "EDITED-OFFLINE" in page.evaluate("document.querySelector('.ProseMirror').innerText")


@e2e("chat", requires=(), layer="browser")
def test_chat_answers_from_a_later_section_and_names_it(page, api: Api):
    _open(
        page,
        api,
        "<h1>CHAPTER I: INTRODUCTION</h1><p>Opening words.</p>"
        + LONG_FILLER
        + "<h1>CHAPTER III: RESEARCH METHODOLOGY</h1><p>The study uses a design science research design with student surveys.</p>",
    )
    page.get_by_role("button", name="Assistant", exact=True).first.click()
    box = page.get_by_placeholder("Ask for writing or formatting help...")
    box.fill("What research design does the study use?")
    box.press("Enter")
    chip = page.get_by_role("button", name=re.compile(r"From: CHAPTER III"))
    chip.wait_for(timeout=60000)
    assert chip.count() >= 1


@e2e("originality", requires=(Requires.ML,), layer="browser")
def test_originality_card_is_available_in_tools(page, api: Api):
    _open(page, api, "<p>Some unique text that no other document has.</p>")
    page.get_by_role("button", name="Tools").first.click()
    assert page.get_by_text("Originality", exact=False).first.is_visible()


@e2e("suggestions", requires=(), layer="browser")
def test_all_view_groups_items_by_page_and_rows_show_page_numbers(page, api: Api):
    _open(page, api, "<p>I recieve many mistakes here.</p>")
    _open_suggestions(page, "All")
    page.wait_for_timeout(9000)
    panel = page.locator("aside").last.inner_text()
    assert "page 1" in panel.lower(), panel[:300]
    assert "recieve" in panel


@e2e("citations", requires=(), layer="api")
def test_citation_lookup_by_doi_returns_a_reference(api: Api):
    import pytest

    r = api.post("/citations/lookup", {"query": "10.1145/3313831.3376727"})
    if r.status_code == 502:
        pytest.skip("Crossref is not reachable from this network")
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert body["title"] and body["authors"] and body["year"] >= 2019


@e2e("learning", requires=(), layer="api")
def test_learning_stats_report_accept_rates(api: Api):
    api.post("/ai/feedback", {"predictionType": "format_prompt", "predictedFormat": "bold", "confidence": 0.8, "accepted": True})
    r = api.get("/ai/feedback/stats")
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert body["overall"]["total"] >= 1
    assert body["byType"]["format_prompt"]["acceptRate"] is not None
