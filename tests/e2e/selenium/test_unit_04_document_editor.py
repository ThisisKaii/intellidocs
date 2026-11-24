"""Unit testing | Document Editor (Amamence, Marjun)

Each case drives the editor's ribbon the way a user does (select text, press a button) and checks
what the page shows. The first docstring line of every case reads: <case id> | <unit> | <Normal or
Error>; the rest is the case description, then "Expected:" with the expected result.
"""

import re
import time

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

from selenium_helpers import STUDENT, body_text, click, open_document, select_paragraph, sign_in, visible, wait_for

TEXT = "The quick brown fox studies document formatting."
SECOND = "A second paragraph stays as it is."


@pytest.fixture
def editor(driver, student_api):
    """A signed-in student's document with two paragraphs, open in the editor."""
    doc_id = student_api.create_document("Editor unit test", f"<p>{TEXT}</p><p>{SECOND}</p>")
    sign_in(driver, STUDENT)
    return open_document(driver, doc_id)


def press(driver, title: str) -> None:
    """Press a ribbon button by its tooltip (the ribbon acts on mouse down, as a click does)."""
    click(driver, visible(driver, By.CSS_SELECTOR, f"button[title='{title}']"))
    time.sleep(0.6)


def ribbon_tab(driver, name: str) -> None:
    click(driver, visible(driver, By.XPATH, f"//*[contains(@class, 'ribbon-tabs')]//button[normalize-space()='{name}']"))


BLOCK = """
const block = [...document.querySelectorAll('.ProseMirror > *')].find(e => e.textContent.includes(arguments[0]));
if (!block) return null;
const inner = block.querySelector('span[style]') || block;
const s = getComputedStyle(inner);
return {tag: block.tagName.toLowerCase(), html: block.innerHTML, align: getComputedStyle(block).textAlign,
        margin: block.style.marginLeft || '', font: s.fontFamily, size: inner.style.fontSize || '', color: s.color,
        list: block.closest('ul,ol') ? block.closest('ul,ol').tagName.toLowerCase() : null};
"""
LIST_BLOCK = """
const li = [...document.querySelectorAll('.ProseMirror li')].find(e => e.textContent.includes(arguments[0]));
return li ? {list: li.parentElement.tagName.toLowerCase(), margin: li.querySelector('p') ? li.querySelector('p').style.marginLeft : ''} : null;
"""


def block(driver, text: str = TEXT) -> dict:
    return driver.execute_script(BLOCK, text) or {}


def footer_words(driver) -> int:
    match = re.search(r"([\d,]+)\s*\n?\s*words", body_text(driver))
    return int(match.group(1).replace(",", "")) if match else -1


# ── Bold, Italic, Underline, Strikethrough ───────────────────────────────────


def test_UT_EDT_01(driver, editor, actual):
    """UT-EDT-01 | Bold, Italic, Underline, Strikethrough | Normal
    A student selects a sentence and presses Bold, Italic, Underline and Strikethrough on the Home tab.
    Expected: the sentence shows bold, italic, underlined and struck through; the next paragraph is unchanged."""
    select_paragraph(driver, TEXT)
    for title in ("Bold (Ctrl+B)", "Italic (Ctrl+I)", "Underline (Ctrl+U)", "Strikethrough"):
        press(driver, title)
    html = block(driver)["html"]
    for tag in ("<strong", "<em", "<u", "<s"):
        assert tag in html, f"{tag} missing: {html[:200]}"
    assert "<strong" not in block(driver, SECOND)["html"]
    actual("The sentence turned bold, italic, underlined and struck through; the second paragraph stayed plain.")


def test_UT_EDT_02(driver, editor, actual):
    """UT-EDT-02 | Bold, Italic, Underline, Strikethrough | Error
    A student presses Bold twice on the same selection (turns it on, then off again).
    Expected: the sentence ends up plain, not bold."""
    select_paragraph(driver, TEXT)
    press(driver, "Bold (Ctrl+B)")
    assert "<strong" in block(driver)["html"]
    press(driver, "Bold (Ctrl+B)")
    assert "<strong" not in block(driver)["html"], "the second press did not remove bold"
    actual("The first press made the sentence bold; the second press made it plain again.")


# ── Headings ─────────────────────────────────────────────────────────────────


def style_tile(driver, label: str) -> None:
    click(driver, visible(driver, By.XPATH, f"//*[@role='group' and @aria-label='Styles']//button[contains(normalize-space(), '{label}')]"))
    time.sleep(0.6)


def test_UT_EDT_03(driver, editor, actual):
    """UT-EDT-03 | Headings | Normal
    A student puts the cursor in a paragraph and picks "Heading 1" in the Styles gallery.
    Expected: the paragraph becomes a Heading 1 and is listed in the Outline on the left."""
    select_paragraph(driver, TEXT)
    style_tile(driver, "Heading 1")
    assert block(driver)["tag"] == "h1", block(driver)
    wait_for(driver, lambda d: "The quick brown fox" in d.find_element(By.XPATH, "//*[contains(normalize-space(), 'OUTLINE') or contains(normalize-space(), 'Outline')]/ancestor::*[3]").text, timeout=15)
    actual("The paragraph became a Heading 1 and appeared in the Outline.")


def test_UT_EDT_04(driver, editor, actual):
    """UT-EDT-04 | Headings | Error
    A student makes a heading, then picks "Normal" to undo it.
    Expected: the heading goes back to a normal paragraph and leaves the Outline."""
    select_paragraph(driver, TEXT)
    style_tile(driver, "Heading 1")
    select_block(driver, "quick brown")
    style_tile(driver, "Normal")
    assert block(driver)["tag"] == "p", block(driver)
    actual("Picking Normal turned the heading back into a normal paragraph.")


def select_block(driver, contains: str) -> None:
    """Select the whole text of any block (paragraph or heading) containing `contains`."""
    found = driver.execute_script(
        """const b = [...document.querySelectorAll('.ProseMirror > *')].find(e => e.textContent.includes(arguments[0]));
        if (!b) return false;
        document.querySelector('.ProseMirror').focus();
        const r = document.createRange(); r.selectNodeContents(b);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange'));
        return true;""", contains)
    assert found, f"no block contains {contains!r}"
    time.sleep(0.5)


# ── Text Alignment ───────────────────────────────────────────────────────────


def test_UT_EDT_05(driver, editor, actual):
    """UT-EDT-05 | Text Alignment | Normal
    A student selects a paragraph and presses Align center, then Align right, then Justify.
    Expected: the paragraph moves to the center, then the right, then is justified."""
    seen = []
    for title, want in (("Align Center", "center"), ("Align Right", "right"), ("Justify", "justify")):
        select_paragraph(driver, TEXT)
        press(driver, title)
        seen.append(block(driver)["align"])
        assert seen[-1] == want, f"{title}: {seen[-1]}"
    actual(f"The paragraph's alignment changed to {', then '.join(seen)}.")


def test_UT_EDT_06(driver, editor, actual):
    """UT-EDT-06 | Text Alignment | Error
    A student centers one paragraph.
    Expected: only that paragraph is centered; the other paragraph keeps its alignment."""
    select_paragraph(driver, TEXT)
    press(driver, "Align Center")
    assert block(driver)["align"] == "center"
    other = block(driver, SECOND)["align"]
    assert other != "center", "the other paragraph was centered too"
    actual(f"Only the selected paragraph was centered; the other stayed aligned {other}.")


# ── Font, Font Size and Font Color ───────────────────────────────────────────


def test_UT_EDT_07(driver, editor, actual):
    """UT-EDT-07 | Font, Font Size and Font Color | Normal
    A student selects a sentence, picks the font "Lora", the size 14 pt and a red text color.
    Expected: the sentence shows in Lora, at 14 pt, in red."""
    select_paragraph(driver, TEXT)
    click(driver, visible(driver, By.CSS_SELECTOR, "button[title='Font Family']"))
    click(driver, visible(driver, By.XPATH, "//span[normalize-space()='Lora']"))
    select_paragraph(driver, TEXT)
    click(driver, visible(driver, By.XPATH, "//button[not(@title) and translate(normalize-space(), '0123456789', '')='pt']"))
    click(driver, visible(driver, By.XPATH, "//*[normalize-space()='14 pt']"))
    select_paragraph(driver, TEXT)
    click(driver, visible(driver, By.CSS_SELECTOR, "button[title='Text Color']"))
    click(driver, visible(driver, By.CSS_SELECTOR, "button[title='#dc2626']"))
    time.sleep(0.6)
    style = block(driver)
    assert "Lora" in style["font"], style
    assert style["size"] == "14pt", style
    assert style["color"] in ("rgb(220, 38, 38)",), style
    actual("The sentence showed in Lora, 14 pt, red (#dc2626).")


def test_UT_EDT_08(driver, editor, actual):
    """UT-EDT-08 | Font, Font Size and Font Color | Error
    A student sets the size to 9 pt and keeps pressing "Decrease Font Size" past the smallest size.
    Expected: the size stops at 8 pt; it never goes below the minimum."""
    select_paragraph(driver, TEXT)
    click(driver, visible(driver, By.XPATH, "//button[not(@title) and translate(normalize-space(), '0123456789', '')='pt']"))
    click(driver, visible(driver, By.XPATH, "//*[normalize-space()='9 pt']"))
    for _ in range(4):
        select_paragraph(driver, TEXT)
        press(driver, "Decrease Font Size")
    size = block(driver)["size"]
    assert size == "8pt", size
    actual("After four presses from 9 pt the size stopped at 8 pt.")


# ── Ordered and Unordered Lists ──────────────────────────────────────────────


def test_UT_EDT_09(driver, editor, actual):
    """UT-EDT-09 | Ordered and Unordered Lists | Normal
    A student selects a paragraph and presses Bullet List, then Numbered List.
    Expected: the paragraph becomes a bulleted item, then a numbered item."""
    select_paragraph(driver, TEXT)
    press(driver, "Bullet List")
    first = driver.execute_script(LIST_BLOCK, TEXT)
    assert first and first["list"] == "ul", first
    select_paragraph(driver, TEXT)
    press(driver, "Numbered List")
    second = driver.execute_script(LIST_BLOCK, TEXT)
    assert second and second["list"] == "ol", second
    actual("The paragraph became a bulleted item, then a numbered item.")


def test_UT_EDT_10(driver, editor, actual):
    """UT-EDT-10 | Ordered and Unordered Lists | Error
    A student presses Bullet List twice on the same paragraph.
    Expected: the second press takes the bullet off and the text is a normal paragraph again."""
    select_paragraph(driver, TEXT)
    press(driver, "Bullet List")
    select_paragraph(driver, TEXT)
    press(driver, "Bullet List")
    assert driver.execute_script(LIST_BLOCK, TEXT) is None, "it is still a list item"
    assert block(driver)["tag"] == "p"
    actual("The second press removed the bullet; the text was a normal paragraph again.")


# ── Text Indentation ─────────────────────────────────────────────────────────


def test_UT_EDT_11(driver, editor, actual):
    """UT-EDT-11 | Text Indentation | Normal
    A student puts the cursor in a paragraph and presses Indent twice.
    Expected: the paragraph moves right one step per press (0.25 in each)."""
    margins = []
    for _ in range(2):
        select_paragraph(driver, TEXT)
        press(driver, "Indent")
        margins.append(block(driver)["margin"])
    assert margins == ["24px", "48px"], margins
    actual(f"The paragraph moved right to {margins[0]}, then {margins[1]} (0.25 in per press).")


def test_UT_EDT_12(driver, editor, actual):
    """UT-EDT-12 | Text Indentation | Error
    A student presses Outdent on a paragraph that has no indent.
    Expected: nothing changes; the paragraph stays at the left margin."""
    select_paragraph(driver, TEXT)
    press(driver, "Outdent")
    margin = block(driver)["margin"]
    assert margin in ("", "0px"), margin
    actual("The paragraph stayed at the left margin; Outdent did nothing.")


# ── Superscript and Subscript ────────────────────────────────────────────────


def select_word(driver, word: str) -> None:
    driver.execute_script(
        """const p = [...document.querySelectorAll('.ProseMirror p')].find(e => e.textContent.includes(arguments[0]));
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n;
        while ((n = walker.nextNode())) { const i = n.textContent.indexOf(arguments[0]); if (i >= 0) {
          document.querySelector('.ProseMirror').focus();
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + arguments[0].length);
          const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); return; } }""",
        word,
    )
    time.sleep(0.5)


def test_UT_EDT_13(driver, editor, actual):
    """UT-EDT-13 | Superscript and Subscript | Normal
    A student selects the word "quick" and presses Superscript, then selects "brown" and presses Subscript.
    Expected: "quick" is raised above the line and "brown" is lowered below it."""
    select_word(driver, "quick")
    press(driver, "Superscript")
    select_word(driver, "brown")
    press(driver, "Subscript")
    html = block(driver)["html"]
    assert re.search(r"<sup[^>]*>quick</sup>", html) and re.search(r"<sub[^>]*>brown</sub>", html), html[:200]
    actual("\"quick\" was raised (superscript) and \"brown\" was lowered (subscript).")


def test_UT_EDT_14(driver, editor, actual):
    """UT-EDT-14 | Superscript and Subscript | Error
    A student makes a word superscript, then presses Subscript on it.
    Expected: the word is only subscript; it is never both raised and lowered."""
    select_word(driver, "quick")
    press(driver, "Superscript")
    select_word(driver, "quick")
    press(driver, "Subscript")
    html = block(driver)["html"]
    both = "<sub" in html and "<sup" in html
    actual("The word became superscript and subscript at the same time (nested), instead of switching to subscript."
           if both else "The word switched from superscript to subscript; it was not both.")
    assert "<sub" in html and "<sup" not in html, html[:200]


# ── Markdown Command Shortcuts ───────────────────────────────────────────────


def type_new_line(driver, editor, text: str) -> None:
    click(driver, driver.find_elements(By.CSS_SELECTOR, ".ProseMirror > *")[-1])
    editor.send_keys(Keys.CONTROL, Keys.END)
    editor.send_keys(Keys.ENTER)
    editor.send_keys(text)
    time.sleep(0.8)


def test_UT_EDT_15(driver, editor, actual):
    """UT-EDT-15 | Markdown Command Shortcuts | Normal
    On new lines a student types "## Methods", "- first point" and "1. first step".
    Expected: they turn into a Heading 2, a bulleted item and a numbered item as they are typed."""
    type_new_line(driver, editor, "## Methods")
    type_new_line(driver, editor, "x")  # leave the heading on a new paragraph
    editor.send_keys(Keys.BACKSPACE)
    editor.send_keys("- first point")
    editor.send_keys(Keys.ENTER, Keys.ENTER, "1. first step")
    time.sleep(1)
    heading = block(driver, "Methods")
    assert heading["tag"] == "h2", heading
    bullet = driver.execute_script(LIST_BLOCK, "first point")
    number = driver.execute_script(LIST_BLOCK, "first step")
    assert bullet and bullet["list"] == "ul", bullet
    assert number and number["list"] == "ol", number
    actual("\"## \" made a Heading 2, \"- \" a bulleted item and \"1. \" a numbered item.")


def test_UT_EDT_16(driver, editor, actual):
    """UT-EDT-16 | Markdown Command Shortcuts | Error
    A student types "#" in the middle of a sentence (not at the start of a line).
    Expected: the text stays a normal paragraph with the "#" kept as written."""
    type_new_line(driver, editor, "Item # 5 stays plain")
    shown = block(driver, "Item # 5 stays plain")
    assert shown["tag"] == "p", shown
    actual("\"Item # 5 stays plain\" stayed a normal paragraph with the # kept.")


# ── Word Count ───────────────────────────────────────────────────────────────


def test_UT_EDT_17(driver, editor, actual):
    """UT-EDT-17 | Word Count | Normal
    A student types five more words at the end of the document.
    Expected: the word count at the bottom of the editor goes up by five."""
    before = footer_words(driver)
    type_new_line(driver, editor, "one two three four five")
    wait_for(driver, lambda d: footer_words(d) == before + 5, timeout=15, message=f"count did not go from {before} to {before + 5}")
    actual(f"The word count went from {before} to {before + 5} words.")


def test_UT_EDT_18(driver, student_api, actual):
    """UT-EDT-18 | Word Count | Error
    A student opens an empty document.
    Expected: the word count shows 0 words (no error and no negative or blank count)."""
    doc_id = student_api.create_document("Editor empty count", "<p></p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    words = footer_words(driver)
    assert words == 0, words
    actual("The empty document showed 0 words.")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
