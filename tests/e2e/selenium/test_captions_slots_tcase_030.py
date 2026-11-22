"""TCASE-030 | Module 3: TipTap Editor & Academic Presets | Unit: Captions and Slots | Non-Error (Contextual Captioning)

A user has a figure and a table in an IEEE document and captions them with Insert → Auto caption.
Expected (as the app behaves): the captions follow the IEEE caption style on their own: the figure
gets "Fig. 1." below it (its title taken from the picture's alt text) and the table gets "TABLE I"
above it, each numbered in document order.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, click, open_document, sign_in, visible, wait_for

SVG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzhhYiIvPjwvc3ZnPg=="
CONTENT = (
    "<h1>Introduction</h1><p>The study's design is shown in the figure below.</p>"
    f'<img src="{SVG}" alt="Methodology diagram" width="400">'
    "<p>The respondents are summarised in the table below.</p>"
    "<table><tbody><tr><th>Year level</th><th>Respondents</th></tr><tr><td>First year</td><td>40</td></tr></tbody></table>"
    "<p>Closing paragraph.</p>"
)

BLOCKS = """return [...document.querySelectorAll('.ProseMirror > *')]
  .filter(n => !n.className.includes('rm-page'))
  .map(n => (n.tagName === 'TABLE' || n.querySelector('table')) ? '[table]' : n.querySelector('img:not(.ProseMirror-separator)') ? '[figure]' : n.textContent.trim())
  .filter(Boolean)"""


def test_captions_slots_tcase_030(driver, student_api):
    doc_id = student_api.create_document("TCASE-030 IEEE Captions", CONTENT, formatting_preset="ieee")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)

    click(driver, visible(driver, By.XPATH, "//button[@title='Insert content into the document']"))
    click(driver, visible(driver, By.XPATH, "//button[starts-with(@title, 'Auto caption')]"))
    card = visible(driver, By.CSS_SELECTOR, "[data-testid=auto-caption-card]", timeout=60)
    click(driver, card.find_element(By.XPATH, ".//button[starts-with(normalize-space(), 'Add')]"))

    blocks = wait_for(driver, lambda d: (lambda b: b if any(t.startswith("Fig. 1") for t in b) else False)(d.execute_script(BLOCKS)), timeout=30, message="no figure caption")
    figure, table = blocks.index("[figure]"), blocks.index("[table]")
    assert blocks[figure + 1].startswith("Fig. 1."), f"the figure's caption is not 'Fig. 1.' below it: {blocks}"
    assert "Methodology diagram" in blocks[figure + 1]
    assert blocks[table - 1].startswith("TABLE I"), f"the table's caption is not 'TABLE I' above it: {blocks}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
