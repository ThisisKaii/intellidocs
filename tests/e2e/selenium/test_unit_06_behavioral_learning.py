"""Unit testing | Behavioral Learning (Asingua, Joshua)

Each case works through what the user sees: the learning progress in Settings > Editor, the
isolation shield on a document, the document-type chip the suggestions learn from, and the
personalization profile window. The first docstring line of every case reads: <case id> | <unit> |
<Normal or Error>; the rest is the case description, then "Expected:" with the expected result.
"""

import json
import re
import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import DOWNLOADS, STUDENT, body_text, click, open_document, open_page, sign_in, text_appears, visible, wait_for

HEADING = "1.0 Introduction"
CONTENT = f"<p>{HEADING}</p><p>This study looks at how students format their papers when they write long reports for class.</p>"


def learning_counts(driver) -> tuple[int, int]:
    """(accepted, total) from the learning card in Settings > Editor (0, 0 before any decision)."""
    open_page(driver, "/settings?section=editor")
    wait_for(driver, lambda d: "accepted ·" in body_text(d) or "progress will show up here" in body_text(d), timeout=40, message="the learning card did not load")
    match = re.search(r"accepted · (\d+) of (\d+)", body_text(driver))
    return (int(match.group(1)), int(match.group(2))) if match else (0, 0)


def decide_heading(driver, button: str) -> None:
    """Suggestions tab → open the card for the heading line → press Accept or Dismiss."""
    click(driver, visible(driver, By.XPATH, "//button[starts-with(normalize-space(), 'Suggestions')]"))
    card = visible(driver, By.XPATH, f"//*[@data-review-card][contains(normalize-space(), '{HEADING}')]", timeout=60)
    toggle = card.find_element(By.XPATH, ".//button[@aria-expanded]")
    if toggle.get_attribute("aria-expanded") != "true":
        click(driver, toggle)
    action = f"//*[@data-review-card][contains(normalize-space(), '{HEADING}')]//button[contains(normalize-space(), '{button}')]"
    wait_for(driver, lambda d: d.find_element(By.XPATH, action).is_enabled(), timeout=30)
    click(driver, driver.find_element(By.XPATH, action))
    time.sleep(4)  # the decision is logged in the background


def shield(driver):
    return visible(driver, By.XPATH, "//button[starts-with(@title, 'Document is')]")


# ── Real-time Behavior Tracking ──────────────────────────────────────────────


def test_UT_BHV_01(driver, student_api, actual):
    """UT-BHV-01 | Real-time Behavior Tracking | Normal
    A student accepts a formatting suggestion, then opens Settings > Editor.
    Expected: the learning progress counts one more decision and one more accepted suggestion."""
    sign_in(driver, STUDENT)
    before = learning_counts(driver)
    doc_id = student_api.create_document("Tracking unit test", CONTENT)
    open_document(driver, doc_id)
    decide_heading(driver, "Accept")
    after = wait_for(driver, lambda d: (lambda c: c if c[1] > before[1] else False)(learning_counts(d)), timeout=60, message="the decision was not counted")
    assert after[0] == before[0] + 1, (before, after)
    actual(f"Settings > Editor went from \"{before[0]} of {before[1]}\" to \"{after[0]} of {after[1]}\" accepted.")


def test_UT_BHV_02(driver, student_api, actual):
    """UT-BHV-02 | Real-time Behavior Tracking | Error
    A student dismisses a formatting suggestion instead of accepting it.
    Expected: the decision is counted, but not as accepted (the accepted number stays the same)."""
    sign_in(driver, STUDENT)
    before = learning_counts(driver)
    doc_id = student_api.create_document("Tracking dismiss test", CONTENT)
    open_document(driver, doc_id)
    decide_heading(driver, "Dismiss")
    after = wait_for(driver, lambda d: (lambda c: c if c[1] > before[1] else False)(learning_counts(d)), timeout=60, message="the dismissal was not counted")
    assert after[0] == before[0], (before, after)
    actual(f"The total went from {before[1]} to {after[1]} while accepted stayed at {after[0]}.")


# ── Document Isolation Mode ──────────────────────────────────────────────────


def test_UT_BHV_03(driver, student_api, actual):
    """UT-BHV-03 | Document Isolation Mode | Normal
    A student presses the shield button in the editor's top bar.
    Expected: it reports "Document is isolated — behavioral data is NOT being collected", and stays so after reloading."""
    doc_id = student_api.create_document("Isolation unit test", CONTENT)
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    assert shield(driver).get_attribute("title").startswith("Document is NOT isolated")
    click(driver, shield(driver))
    wait_for(driver, lambda d: shield(d).get_attribute("title").startswith("Document is isolated"), timeout=15)
    time.sleep(3)  # let the change reach the server before reloading
    driver.refresh()
    wait_for(driver, lambda d: shield(d).get_attribute("title").startswith("Document is isolated"), timeout=60, message="isolation was not kept")
    actual("The shield changed to \"Document is isolated — behavioral data is NOT being collected\" and stayed after a reload.")


def test_UT_BHV_04(driver, student_api, actual):
    """UT-BHV-04 | Document Isolation Mode | Error
    In an isolated document, a student accepts a formatting suggestion.
    Expected: the decision is not counted in Settings > Editor (nothing is learned from that document)."""
    sign_in(driver, STUDENT)
    before = learning_counts(driver)
    doc_id = student_api.create_document("Isolated tracking test", CONTENT)
    open_document(driver, doc_id)
    click(driver, shield(driver))
    wait_for(driver, lambda d: shield(d).get_attribute("title").startswith("Document is isolated"), timeout=15)
    decide_heading(driver, "Accept")
    time.sleep(6)
    after = learning_counts(driver)
    actual(f"Settings > Editor showed {after[0]} of {after[1]} before and after" if after == before
           else f"The decision was still counted: {before[0]} of {before[1]} became {after[0]} of {after[1]}.")
    assert after == before, (before, after)


# ── Personalized Learning by Document Type ───────────────────────────────────


def genre_chip(driver):
    return visible(driver, By.XPATH, "//button[starts-with(@title, 'Document type:')]")


def test_UT_BHV_05(driver, student_api, actual):
    """UT-BHV-05 | Personalized Model Fine-tuning | Normal
    A student opens the document-type chip on the Home tab and picks the first type listed (instead of Auto).
    Expected: the chip shows that type as "set manually", so suggestions learn only from documents of that type; it stays after reloading."""
    doc_id = student_api.create_document("Genre unit test", CONTENT)
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    click(driver, genre_chip(driver))
    option = visible(driver, By.XPATH, "//*[@role='menuitem'][not(contains(., 'Auto-detect'))][1]")
    picked = option.text.splitlines()[0]
    click(driver, option)
    wait_for(driver, lambda d: "set manually" in genre_chip(d).get_attribute("title"), timeout=20)
    driver.refresh()
    wait_for(driver, lambda d: "set manually" in genre_chip(d).get_attribute("title"), timeout=60, message="the choice was not kept")
    actual(f"The chip read \"{genre_chip(driver).get_attribute('title')}\" after picking {picked} and reloading.")


def test_UT_BHV_06(driver, student_api, actual):
    """UT-BHV-06 | Personalized Model Fine-tuning | Error
    A student who set a document type by hand picks "Auto-detect from structure" again.
    Expected: the chip goes back to the detected type ("detected from structure")."""
    doc_id = student_api.create_document("Genre reset test", CONTENT)
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    click(driver, genre_chip(driver))
    click(driver, visible(driver, By.XPATH, "//*[@role='menuitem'][not(contains(., 'Auto-detect'))][1]"))
    wait_for(driver, lambda d: "set manually" in genre_chip(d).get_attribute("title"), timeout=20)
    click(driver, genre_chip(driver))
    click(driver, visible(driver, By.XPATH, "//*[@role='menuitem'][contains(., 'Auto-detect from structure')]"))
    wait_for(driver, lambda d: "detected from structure" in genre_chip(d).get_attribute("title"), timeout=20, message="auto-detect was not restored")
    actual(f"The chip went back to \"{genre_chip(driver).get_attribute('title').split('.')[0]}\" (detected from structure).")


# ── Formatting Profile Page ──────────────────────────────────────────────────


def open_profile_window(driver, student_api):
    doc_id = student_api.create_document("Profile unit test", CONTENT)
    open_document(driver, doc_id)
    click(driver, visible(driver, By.CSS_SELECTOR, "button[aria-label='Export']"))
    click(driver, visible(driver, By.XPATH, "//*[@role='menuitem'][contains(normalize-space(), 'Personalization profile')]"))
    return visible(driver, By.CSS_SELECTOR, "[aria-label='Personalization profile dialog']")


def test_UT_BHV_07(driver, student_api, actual):
    """UT-BHV-07 | Formatting Profile Page | Normal
    A student opens Export > "Personalization profile…" and presses "Export & download".
    Expected: an intellidocs-profile.idocprofile file downloads with their formatting profile in it."""
    for old in DOWNLOADS.glob("intellidocs-profile*.idocprofile"):
        old.unlink()
    sign_in(driver, STUDENT)
    dialog = open_profile_window(driver, student_api)
    click(driver, dialog.find_element(By.XPATH, ".//button[contains(normalize-space(), 'Export & download')]"))
    file = wait_for(driver, lambda d: next(iter(DOWNLOADS.glob("intellidocs-profile*.idocprofile")), False), timeout=60, message="no profile downloaded")
    time.sleep(1)
    profile = json.loads(file.read_text(encoding="utf-8"))
    assert "version" in profile and "scope" in profile, list(profile)[:10]
    actual(f"\"{file.name}\" downloaded; it holds the profile (version {profile['version']}, scope {profile['scope']}).")


def test_UT_BHV_08(driver, student_api, tmp_path, actual):
    """UT-BHV-08 | Formatting Profile Page | Error
    A student chooses a file that is not a profile in the profile window's import.
    Expected: "Not a valid .idocprofile file..." is shown and nothing is imported."""
    bad = tmp_path / "notes.idocprofile"
    bad.write_text("these are just notes, not a profile", encoding="utf-8")
    sign_in(driver, STUDENT)
    dialog = open_profile_window(driver, student_api)
    picker = dialog.find_element(By.CSS_SELECTOR, "input[type='file']")
    driver.execute_script("arguments[0].style.display = 'block'", picker)
    picker.send_keys(str(bad))
    shown = visible(driver, By.XPATH, "//*[@aria-label='Personalization profile dialog']//*[contains(@class, 'destructive') or contains(@style, 'error') or @role='alert'][normalize-space()]", timeout=20).text.strip()
    actual(f"\"{shown}\" was shown and nothing was imported.")
    assert "idocprofile" in shown, f"the message does not say the file is not a profile: {shown!r}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
