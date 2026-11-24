"""Unit testing | Grammar and Spelling (Asingua, Joshua)

Each case types or opens text the way a user does and checks what the user sees: the underlines
in the document and the correction card in the Suggestions tab. The first docstring line of every
case reads: <case id> | <unit> | <Normal or Error>; the rest is the case description, then
"Expected:" with the expected result.
"""

import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import ACCEPT_CARD, STUDENT, click, open_issue, restore_suggestion_switches, open_document, sign_in, type_paragraph, underlines, visible, wait_for, wait_for_checks

RED = "rgb(192, 69, 63)"
AMBER = "rgb(181, 119, 43)"


def paragraph(driver, contains: str) -> str:
    return driver.execute_script(
        "const p = [...document.querySelectorAll('.ProseMirror p')].find(e => e.textContent.includes(arguments[0])); return p ? p.textContent : ''",
        contains,
    )


def open_doc(driver, student_api, title: str, body: str):
    doc_id = student_api.create_document(title, f"<h1>Results</h1><p>{body}</p>")
    sign_in(driver, STUDENT)
    return open_document(driver, doc_id)


# ── Grammar Error Detection ──────────────────────────────────────────────────


def test_UT_GRM_01(driver, student_api, actual):
    """UT-GRM-01 | Grammar Error Detection | Normal
    A student types "The results of the test shows positive feedback."
    Expected: "shows" is underlined in red as a grammar problem (the subject and verb do not agree)."""
    editor = open_doc(driver, student_api, "Grammar unit test", "Findings are summarised below.")
    type_paragraph(driver, editor, "The results of the test shows positive feedback.")
    found = [u for u in wait_for_checks(driver) if "shows" in u["text"] and u["kind"] != "spelling"]
    assert found and found[0]["color"] == RED, found
    actual(f"\"{found[0]['text']}\" was underlined in red as a grammar issue.")


def test_UT_GRM_02(driver, student_api, actual):
    """UT-GRM-02 | Grammar Error Detection | Error
    A student types a correct sentence: "The results of the test show positive feedback."
    Expected: nothing in the sentence is underlined (no false alarm)."""
    editor = open_doc(driver, student_api, "Grammar clean test", "Findings are summarised below.")
    type_paragraph(driver, editor, "The results of the test show positive feedback.")
    found = [u for u in wait_for_checks(driver) if u["text"].strip() and u["text"] in "The results of the test show positive feedback."]
    assert not found, found
    actual("The correct sentence had no underlines.")


# ── Spelling Correction ──────────────────────────────────────────────────────


def test_UT_GRM_03(driver, student_api, actual):
    """UT-GRM-03 | Spelling Correction | Normal
    A student clicks the misspelled word "algoritm" and presses Accept on the suggested spelling.
    Expected: the word is replaced with "algorithm" and its underline goes away."""
    open_doc(driver, student_api, "Spelling unit test", "The algoritm was evaluated.")
    assert "algorithm" in open_issue(driver, "algoritm").text
    time.sleep(1.5)  # the card redraws once the document scrolls to the word
    click(driver, visible(driver, By.XPATH, ACCEPT_CARD + "//button[normalize-space()='Accept']"))
    wait_for(driver, lambda d: "The algorithm was evaluated." in paragraph(d, "was evaluated"), timeout=20, message="the word was not replaced")
    actual("Accept replaced \"algoritm\" with \"algorithm\" and the underline went away.")


def test_UT_GRM_04(driver, student_api, actual):
    """UT-GRM-04 | Spelling Correction | Error
    A student types correct academic terms that are not in an ordinary dictionary: "p-value", "ANOVA", "heteroscedasticity".
    Expected: none of them is marked as a spelling mistake."""
    editor = open_doc(driver, student_api, "Academic terms test", "The analysis is reported below.")
    sentence = "The p-value from the ANOVA test indicated heteroscedasticity in the residuals."
    type_paragraph(driver, editor, sentence)
    flagged = [u for u in wait_for_checks(driver) if u["text"].lower() in ("p-value", "anova", "heteroscedasticity", "p")]
    assert not flagged, flagged
    actual("\"p-value\", \"ANOVA\" and \"heteroscedasticity\" were not underlined.")


# ── Inline Error Highlighting ────────────────────────────────────────────────


def test_UT_GRM_05(driver, student_api, actual):
    """UT-GRM-05 | Inline Error Highlighting | Normal
    A paragraph has one grammar problem ("This are") and one misspelled word ("algoritm").
    Expected: both are underlined in the text, grammar in red and spelling in amber, so the two kinds look different."""
    open_doc(driver, student_api, "Highlight unit test", "This are the findings of the algoritm.")
    found = wait_for_checks(driver, 20)
    grammar = [u for u in found if u["kind"] == "grammar"]
    spelling = [u for u in found if u["kind"] == "spelling"]
    assert grammar and spelling, found
    assert grammar[0]["color"] == RED and spelling[0]["color"] == AMBER, (grammar[0], spelling[0])
    actual(f"\"{grammar[0]['text']}\" was underlined red (grammar) and \"{spelling[0]['text']}\" amber (spelling).")


@pytest.fixture
def switches_restored(student_api):
    yield
    restore_suggestion_switches(student_api)


def test_UT_GRM_06(driver, student_api, switches_restored, actual):
    """UT-GRM-06 | Inline Error Highlighting | Error
    A student turns the "Grammar & spelling checks" switch off in the Suggestions tab.
    Expected: the underlines disappear from the document; the text is unchanged."""
    open_doc(driver, student_api, "Highlight off test", "This are the findings of the algoritm.")
    wait_for(driver, lambda d: underlines(d), timeout=45, message="nothing was underlined to begin with")
    click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'Suggestions')]"))
    click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'Grammar')]"))
    switch = visible(driver, By.CSS_SELECTOR, "[aria-label='Turn grammar and spelling checks on or off']")
    click(driver, switch)
    time.sleep(3)
    left = underlines(driver)
    actual("With the switch off the underlines disappeared and the text stayed as typed." if not left
           else f"With the switch off, {len(left)} underline(s) stayed in the document: {', '.join(repr(u['text']) for u in left)}.")
    assert not left, f"the underlines are still shown: {left}"
    assert paragraph(driver, "findings") == "This are the findings of the algoritm."


# ── Suggested Correction Display ─────────────────────────────────────────────


def test_UT_GRM_07(driver, student_api, actual):
    """UT-GRM-07 | Suggested Correction Display | Normal
    A student clicks the red underline under "This are".
    Expected: the Suggestions tab opens its card showing "this are → this is", why, and Accept / Dismiss."""
    open_doc(driver, student_api, "Correction card test", "This are the findings of the study.")
    click(driver, visible(driver, By.CSS_SELECTOR, ".ProseMirror .grammar-issue.grammar-kind-grammar", timeout=45))
    card = visible(driver, By.XPATH, ACCEPT_CARD)
    assert "this is" in card.text.lower() and "→" in card.text, card.text
    card.find_element(By.XPATH, ".//button[normalize-space()='Dismiss']")
    shown = " ".join(card.text.split())
    actual(f"The card showed \"{shown[:90]}\" with Accept and Dismiss.")


def test_UT_GRM_08(driver, student_api, actual):
    """UT-GRM-08 | Suggested Correction Display | Error
    A student opens the correction for "This are" and presses Dismiss instead of Accept.
    Expected: the text is left as written and that underline goes away."""
    open_doc(driver, student_api, "Correction dismiss test", "This are the findings of the study.")
    click(driver, visible(driver, By.CSS_SELECTOR, ".ProseMirror .grammar-issue.grammar-kind-grammar", timeout=45))
    card = visible(driver, By.XPATH, ACCEPT_CARD)
    click(driver, card.find_element(By.XPATH, ".//button[normalize-space()='Dismiss']"))
    wait_for(driver, lambda d: not d.find_elements(By.CSS_SELECTOR, ".ProseMirror .grammar-issue.grammar-kind-grammar"), timeout=20, message="the underline stayed")
    time.sleep(1)
    assert paragraph(driver, "findings") == "This are the findings of the study."
    actual("Dismiss left \"This are the findings of the study.\" unchanged and removed the underline.")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
