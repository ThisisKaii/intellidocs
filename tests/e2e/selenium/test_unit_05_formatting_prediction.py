"""Unit testing | Formatting Prediction (Asingua, Joshua)

Each case drives the editor the way a user does and checks what the user sees: the outlined line in
the document, the suggestion card in the Suggestions tab, its confidence, Accept and Dismiss, custom
presets and academic presets. The first docstring line of every case reads: <case id> | <unit> |
<Normal or Error>; the rest is the case description, then "Expected:" with the expected result.
"""

import os
import re
import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import (
    FIXTURES,
    STUDENT,
    apply_preset_from_ribbon,
    body_text,
    click,
    delete_account,
    open_document,
    open_preset_manager,
    page_and_text,
    register_account,
    restore_suggestion_switches,
    sign_in,
    text_appears,
    unique_email,
    user_presets,
    visible,
    wait_for,
)

HEADING = "1.0 Introduction"
BODY = "This study looks at how students format their papers when they write long reports for class."
CONTENT = f"<p>{HEADING}</p><p>{BODY}</p>"


@pytest.fixture
def suggesting(driver, student_api):
    """A document whose first line reads like a section heading, open with the Suggestions tab showing."""
    doc_id = student_api.create_document("Prediction unit test", CONTENT)
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    open_suggestions(driver)
    return doc_id


def open_suggestions(driver) -> None:
    click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'Suggestions')]"))
    time.sleep(1)


def card(driver, text: str, timeout: float = 60):
    """The suggestion card in the Suggestions tab that quotes `text`."""
    return visible(driver, By.XPATH, f"//*[@data-review-card][contains(normalize-space(), '{text}')]", timeout=timeout)


def open_card(driver, text: str):
    found = card(driver, text)
    toggle = found.find_element(By.XPATH, ".//button[@aria-expanded]")
    if toggle.get_attribute("aria-expanded") != "true":
        click(driver, toggle)
    wait_for(driver, lambda d: card(d, text).find_element(By.XPATH, ".//button[contains(normalize-space(), 'Accept')]").is_enabled(), timeout=30)
    return card(driver, text)


def block_tag(driver, text: str) -> str:
    return driver.execute_script(
        "const b = [...document.querySelectorAll('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3')].find(e => e.textContent.includes(arguments[0])); return b ? b.tagName.toLowerCase() : null",
        text,
    )


def outlined(driver, text: str) -> bool:
    return bool(driver.execute_script(
        "const b = [...document.querySelectorAll('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3')].find(e => e.textContent.includes(arguments[0])); return !!b && /highlight|suggest/.test(b.className)",
        text,
    ))


# ── Inline Suggestion Display ────────────────────────────────────────────────


def test_UT_PRD_01(driver, suggesting, actual):
    """UT-PRD-01 | Inline Suggestion Display | Normal
    A student opens a document whose first line, "1.0 Introduction", is typed as plain text.
    Expected: the line is outlined in the document and the Suggestions tab lists a card for it with the suggested format."""
    found = card(driver, HEADING)
    wait_for(driver, lambda d: outlined(d, HEADING), timeout=30, message="the line is not outlined")
    label = found.text.splitlines()[0]
    actual(f"\"{HEADING}\" was outlined in the document and the Suggestions tab listed it as \"{label}\".")


@pytest.fixture
def switches_restored(student_api):
    yield
    restore_suggestion_switches(student_api)


def test_UT_PRD_02(driver, suggesting, switches_restored, actual):
    """UT-PRD-02 | Inline Suggestion Display | Error
    A student turns the "Formatting suggestions" switch off in the Suggestions tab.
    Expected: the suggestion cards and the outline in the document go away; the text is not changed."""
    card(driver, HEADING)
    click(driver, visible(driver, By.CSS_SELECTOR, "[aria-label='Turn formatting suggestions on or off']"))
    wait_for(driver, lambda d: not d.find_elements(By.XPATH, f"//*[@data-review-card][contains(normalize-space(), '{HEADING}')]"), timeout=20, message="the card is still listed")
    wait_for(driver, lambda d: not outlined(d, HEADING), timeout=20, message="the line is still outlined")
    assert block_tag(driver, HEADING) == "p"
    actual("With the switch off, the card and the outline disappeared and the line stayed plain text.")


# ── Confidence Score Visibility ──────────────────────────────────────────────


def test_UT_PRD_03(driver, suggesting, actual):
    """UT-PRD-03 | Confidence Score Visibility | Normal
    A student opens the suggestion card for "1.0 Introduction".
    Expected: the card shows how sure the system is as a percentage between 0% and 100%."""
    opened = open_card(driver, HEADING)
    percents = [int(p) for p in re.findall(r"(\d{1,3})%", opened.text)]
    assert percents and all(0 <= p <= 100 for p in percents), opened.text
    actual(f"The card showed a confidence of {percents[0]}%.")


# ── Accept Suggestion ────────────────────────────────────────────────────────


def test_UT_PRD_04(driver, suggesting, actual):
    """UT-PRD-04 | Accept Suggestion | Normal
    A student opens the card for "1.0 Introduction" and presses Accept.
    Expected: the line is formatted as a heading in the document and its card leaves the list."""
    opened = open_card(driver, HEADING)
    label = opened.text.splitlines()[0]
    click(driver, opened.find_element(By.XPATH, ".//button[contains(normalize-space(), 'Accept')]"))
    wait_for(driver, lambda d: block_tag(d, HEADING) in ("h1", "h2", "h3"), timeout=20, message="the line was not formatted")
    wait_for(driver, lambda d: not d.find_elements(By.XPATH, f"//*[@data-review-card][contains(normalize-space(), '{HEADING}')]"), timeout=20)
    actual(f"After Accept the line became a {block_tag(driver, HEADING).upper()} ({label}) and its card left the list.")


def test_UT_PRD_05(driver, suggesting, actual):
    """UT-PRD-05 | Accept Suggestion | Error
    A student accepts the suggestion, then presses Undo (Ctrl+Z).
    Expected: the line goes back to plain text exactly as before."""
    opened = open_card(driver, HEADING)
    click(driver, opened.find_element(By.XPATH, ".//button[contains(normalize-space(), 'Accept')]"))
    wait_for(driver, lambda d: block_tag(d, HEADING) in ("h1", "h2", "h3"), timeout=20)
    click(driver, visible(driver, By.CSS_SELECTOR, "button[title='Undo (Ctrl+Z)']"))
    wait_for(driver, lambda d: block_tag(d, HEADING) == "p", timeout=15, message="Undo did not restore the line")
    actual("Undo put the line back as plain text.")


# ── Reject Suggestion ────────────────────────────────────────────────────────


def test_UT_PRD_06(driver, suggesting, actual):
    """UT-PRD-06 | Reject Suggestion | Normal
    A student opens the card for "1.0 Introduction" and presses Dismiss.
    Expected: the card leaves the list, the outline goes away and the line keeps its own formatting."""
    opened = open_card(driver, HEADING)
    click(driver, opened.find_element(By.XPATH, ".//button[contains(normalize-space(), 'Dismiss')]"))
    wait_for(driver, lambda d: not d.find_elements(By.XPATH, f"//*[@data-review-card][contains(normalize-space(), '{HEADING}')]"), timeout=20, message="the card is still listed")
    assert block_tag(driver, HEADING) == "p"
    actual("After Dismiss the card left the list and the line stayed plain text.")


def test_UT_PRD_07(driver, suggesting, actual):
    """UT-PRD-07 | Reject Suggestion | Error
    A student dismisses the suggestion, then keeps typing in the document.
    Expected: the dismissed suggestion does not come back while they keep working."""
    opened = open_card(driver, HEADING)
    click(driver, opened.find_element(By.XPATH, ".//button[contains(normalize-space(), 'Dismiss')]"))
    wait_for(driver, lambda d: not d.find_elements(By.XPATH, f"//*[@data-review-card][contains(normalize-space(), '{HEADING}')]"), timeout=20)
    editor = driver.find_element(By.CSS_SELECTOR, ".ProseMirror")
    click(driver, driver.find_elements(By.CSS_SELECTOR, ".ProseMirror p")[-1])
    from selenium.webdriver.common.keys import Keys
    editor.send_keys(Keys.CONTROL, Keys.END, " More text typed afterwards.")
    time.sleep(10)
    back = driver.find_elements(By.XPATH, f"//*[@data-review-card][contains(normalize-space(), '{HEADING}')]")
    actual("The dismissed suggestion came back after typing." if back else "The dismissed suggestion did not come back after 10 s of further typing.")
    assert not back, "the dismissed suggestion came back"


# ── Custom Format Bindings (presets made from your own document) ─────────────

SAMPLE = FIXTURES / "import_baselines" / "documents" / "ieee_sample_paper.docx"


def test_UT_PRD_08(driver, student_api, actual):
    """UT-PRD-08 | Custom Format Bindings | Normal
    A student opens Styles > "Add or remove your own styles and presets" and uploads a sample .docx.
    Expected: a new preset named after the file appears under "Presets from your documents"."""
    before = {p["preset_id"] for p in user_presets(student_api)}
    doc_id = student_api.create_document("Custom preset unit test", "<h1>Introduction</h1><p>Body.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    open_preset_manager(driver).send_keys(str(SAMPLE))
    try:
        assert text_appears(driver, "ieee_sample_paper", timeout=180), "no preset tile for the uploaded document"
        visible(driver, By.XPATH, "//h4[contains(., 'Presets from your documents')]")
        actual("A preset tile \"ieee_sample_paper\" appeared under \"Presets from your documents\".")
    finally:
        for preset in user_presets(student_api):
            if preset["preset_id"] not in before:
                student_api.call("DELETE", f"/formatting/user-presets/{preset['preset_id']}")


def test_UT_PRD_09(driver, student_api, tmp_path, actual):
    """UT-PRD-09 | Custom Format Bindings | Error
    A student uploads a damaged file renamed to .docx as a preset.
    Expected: "This file is not a readable Word document (.docx)..." is shown and no preset is added."""
    fake = tmp_path / "department_sample.docx"
    fake.write_bytes(os.urandom(4000))
    before = {p["preset_id"] for p in user_presets(student_api)}
    doc_id = student_api.create_document("Custom preset error test", "<h1>Introduction</h1><p>Body.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    open_preset_manager(driver).send_keys(str(fake))
    error = visible(driver, By.XPATH, "//p[@role='alert']", timeout=120)
    assert "not a readable Word document" in error.text, error.text
    assert {p["preset_id"] for p in user_presets(student_api)} == before
    actual(f"\"{error.text}\" was shown and no preset was added.")


# ── Formatting Presets ───────────────────────────────────────────────────────


def test_UT_PRD_10(driver, student_api, actual):
    """UT-PRD-10 | Formatting Presets | Normal
    A student picks "IEEE Conference" in Styles > Presets and presses "Apply to existing paragraphs".
    Expected: the page margins and the body text change to IEEE's (Times New Roman 10 pt, 0.625 in sides)."""
    doc_id = student_api.create_document("Preset unit test", "<h1>Introduction</h1><p>Body paragraph of the study.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    apply_preset_from_ribbon(driver, "IEEE Conference")
    assert text_appears(driver, "Applied IEEE Conference"), "no confirmation"
    click(driver, visible(driver, By.XPATH, "//button[contains(normalize-space(), 'Apply to existing paragraphs')]"))
    page = page_and_text(driver)
    assert page["left"] == "60px" and "Times New Roman" in page["font"] and page["size"] == "13.3333px", page
    actual("\"Applied IEEE Conference\" was shown; the side margins became 0.625 in and the body Times New Roman 10 pt.")


def test_UT_PRD_11(driver, actual):
    """UT-PRD-11 | Formatting Presets | Error
    A new, not yet verified account picks the "UCLM Capstone (Thesis)" preset.
    Expected: the preset is not applied; the editor says "Thesis presets are part of verified student access." with a link to apply."""
    email = unique_email("ut-prd-11")
    account = register_account(email, "Chapter4-Pass!")
    try:
        doc_id = account.create_document("Locked preset test", "<h1>Introduction</h1><p>Body.</p>")
        sign_in(driver, (email, "Chapter4-Pass!"))
        open_document(driver, doc_id)
        apply_preset_from_ribbon(driver, "UCLM Capstone (Thesis)")
        assert text_appears(driver, "Thesis presets are part of verified student access."), "no explanation"
        visible(driver, By.XPATH, "//a[contains(., 'Apply for verification')]")
        assert account.call("GET", f"/documents/{doc_id}").json().get("formatting_preset") is None
        actual("The preset was not applied; \"Thesis presets are part of verified student access.\" was shown with \"Apply for verification\".")
    finally:
        delete_account(account.token or "", email)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
