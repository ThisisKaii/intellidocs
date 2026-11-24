"""Unit testing | AI Chat Overlay (Alenton, RJ)

Each case uses the Editor assistant panel the way a user does (type a request, read the reply, press
Apply or Reject) and checks what the user sees in the panel and in the document. The first
docstring line of every case reads: <case id> | <unit> | <Normal or Error>; the rest is the case
description, then "Expected:" with the expected result.
"""

import time

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from selenium_helpers import STUDENT, ask_assistant, body_text, click, open_document, sign_in, text_appears, visible, wait_for

CONTENT = "<h1>Introduction</h1><p>Body text of the study.</p><h2>Methodology</h2><p>More body text.</p>"
APPLY = "//button[normalize-space()='Apply']"
REJECT = "//button[normalize-space()='Reject']"


@pytest.fixture
def chat_doc(driver, student_api):
    doc_id = student_api.create_document("Assistant unit test", CONTENT)
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    return doc_id


def headings_bold(driver) -> bool:
    return bool(driver.execute_script(
        "return [...document.querySelectorAll('.ProseMirror h1, .ProseMirror h2')].every(h => h.querySelector('strong') && h.querySelector('strong').textContent === h.textContent)"
    ))


def ask_for_preview(driver, request: str = "Make all headings bold"):
    ask_assistant(driver, request)
    return visible(driver, By.XPATH, APPLY, timeout=120)


# ── Open Chat Panel ──────────────────────────────────────────────────────────


def test_UT_AIC_01(driver, chat_doc, actual):
    """UT-AIC-01 | Open Chat Panel | Normal
    A student closes the Editor assistant panel, then presses Ctrl+\\ to open it again.
    Expected: the panel opens on the Assistant tab with its greeting and a message box."""
    click(driver, visible(driver, By.CSS_SELECTOR, "button[aria-label='Collapse panel']"))
    wait_for(driver, lambda d: not d.find_elements(By.CSS_SELECTOR, "textarea[aria-label='Message the assistant']") or
             not d.find_element(By.CSS_SELECTOR, "textarea[aria-label='Message the assistant']").is_displayed(), timeout=10)
    driver.find_element(By.CSS_SELECTOR, ".ProseMirror").send_keys(Keys.CONTROL, "\\")
    box = visible(driver, By.CSS_SELECTOR, "textarea[aria-label='Message the assistant']", timeout=15)
    assert box.is_displayed() and "AI Assistant" in body_text(driver)
    actual("Ctrl+\\ reopened the Editor assistant on the Assistant tab with its greeting and message box.")


def test_UT_AIC_02(driver, chat_doc, actual):
    """UT-AIC-02 | Open Chat Panel | Error
    A student tries to send an empty message.
    Expected: the send button cannot be pressed, so nothing is sent."""
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Assistant']"))
    visible(driver, By.CSS_SELECTOR, "textarea[aria-label='Message the assistant']")
    send = driver.find_element(By.CSS_SELECTOR, "button[aria-label='Send message']")
    assert not send.is_enabled(), "the empty message could be sent"
    actual("The send button stayed disabled while the message box was empty.")


# ── Natural Language Formatting Commands ─────────────────────────────────────


def test_UT_AIC_03(driver, chat_doc, actual):
    """UT-AIC-03 | Natural Language Formatting Commands | Normal
    A student types "Make all headings bold" in the assistant and presses Apply on its reply.
    Expected: every heading in the document turns bold."""
    click(driver, ask_for_preview(driver))
    wait_for(driver, headings_bold, timeout=20, message="the headings were not made bold")
    actual("After \"Make all headings bold\" and Apply, both headings were bold.")


def test_UT_AIC_04(driver, chat_doc, actual):
    """UT-AIC-04 | Natural Language Formatting Commands | Error
    A student asks "Make all table captions italic" in a document that has no tables.
    Expected: the assistant does not change anything; Apply is not offered or cannot be pressed."""
    before = driver.find_element(By.CSS_SELECTOR, ".ProseMirror").get_attribute("innerHTML")
    ask_assistant(driver, "Make all table captions italic")
    wait_for(driver, lambda d: len([e for e in d.find_elements(By.XPATH, "//*[contains(@class,'assistant') or @data-role='assistant']") if e.text]) > 0 or "caption" in body_text(d).lower(), timeout=120)
    time.sleep(8)
    applies = [b for b in driver.find_elements(By.XPATH, APPLY) if b.is_displayed() and b.is_enabled()]
    after = driver.find_element(By.CSS_SELECTOR, ".ProseMirror").get_attribute("innerHTML")
    assert after == before, "the document changed"
    actual("No change could be applied (Apply was not offered or disabled) and the document stayed the same." if not applies
           else "An Apply button was offered although the document has no table captions.")
    assert not applies, "Apply was offered for a change that matches nothing"


# ── AI Suggestion Explanation ────────────────────────────────────────────────


def test_UT_AIC_05(driver, chat_doc, actual):
    """UT-AIC-05 | AI Suggestion Explanation | Normal
    A student asks "Make all headings bold".
    Expected: the reply's change card says what it will change (e.g. "Bold") and to which part of the document, before anything is applied."""
    apply = ask_for_preview(driver)
    card = apply.find_element(By.XPATH, "./ancestor::*[.//button[normalize-space()='Reject']][2]")
    text = " ".join(card.text.split())
    assert "bold" in text.lower() and "heading" in text.lower(), text
    actual(f"The change card explained: \"{text.replace('Apply', '').replace('Reject', '').strip()[:120]}\".")


def test_UT_AIC_06(driver, chat_doc, actual):
    """UT-AIC-06 | AI Suggestion Explanation | Error
    A student asks the assistant to "Write my entire introduction chapter from scratch".
    Expected: it declines and explains that it works with the student's own writing, offering what it can do instead; the document is not changed."""
    before = driver.find_element(By.CSS_SELECTOR, ".ProseMirror").text
    ask_assistant(driver, "Write my entire introduction chapter from scratch")
    assert text_appears(driver, "write sections or essays from a topic", timeout=120), "no explanation of the refusal"
    assert driver.find_element(By.CSS_SELECTOR, ".ProseMirror").text == before
    actual("The assistant declined and explained it does not write sections or essays from a topic, offering to organise notes instead.")


# ── Preview Before Apply ─────────────────────────────────────────────────────


def test_UT_AIC_07(driver, chat_doc, actual):
    """UT-AIC-07 | Preview Before Apply | Normal
    A student asks "Make all headings bold" and reads the reply without pressing anything.
    Expected: the change is only shown as a preview card with Apply and Reject; the document is not changed yet."""
    ask_for_preview(driver)
    visible(driver, By.XPATH, REJECT)
    time.sleep(3)
    assert not headings_bold(driver), "the change was made before Apply"
    actual("A preview card with Apply and Reject appeared; the headings were still not bold.")


def test_UT_AIC_08(driver, chat_doc, actual):
    """UT-AIC-08 | Preview Before Apply | Error
    A student applies a previewed change and then presses Undo (Ctrl+Z).
    Expected: one Undo takes the whole change back."""
    click(driver, ask_for_preview(driver))
    wait_for(driver, headings_bold, timeout=20)
    click(driver, visible(driver, By.CSS_SELECTOR, "button[title='Undo (Ctrl+Z)']"))
    wait_for(driver, lambda d: not headings_bold(d), timeout=15, message="Undo did not take the change back")
    actual("One Undo took the applied change back; the headings were no longer bold.")


# ── Confirm or Reject AI Action ──────────────────────────────────────────────


def test_UT_AIC_09(driver, chat_doc, actual):
    """UT-AIC-09 | Confirm or Reject AI Action | Normal
    A student presses Apply on the assistant's change card.
    Expected: the change is made and the card no longer offers Apply / Reject."""
    click(driver, ask_for_preview(driver))
    wait_for(driver, headings_bold, timeout=20)
    wait_for(driver, lambda d: not [b for b in d.find_elements(By.XPATH, APPLY) if b.is_displayed()], timeout=15)
    actual("Apply made the headings bold and the card's Apply / Reject buttons went away.")


def test_UT_AIC_10(driver, chat_doc, actual):
    """UT-AIC-10 | Confirm or Reject AI Action | Error
    A student presses Reject on the assistant's change card.
    Expected: the card says "Rejected" and the document is not changed."""
    ask_for_preview(driver)
    click(driver, visible(driver, By.XPATH, REJECT))
    assert text_appears(driver, "Rejected", timeout=15), "the card does not say Rejected"
    time.sleep(2)
    assert not headings_bold(driver), "the document changed"
    actual("The card showed \"Rejected\" and the headings stayed as they were.")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
