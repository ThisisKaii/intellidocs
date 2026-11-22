"""TCASE-031 | Module 3: TipTap Editor & Academic Presets | Unit: Captions and Slots | Non-Error (Picture Slot Swap)

A user selects a picture slot (a placeholder made with Insert → "Insert picture slot") and chooses
"Replace the slot with a picture from your computer". Expected (as the app behaves): the chosen PNG
takes the slot's place as an ordinary picture, keeping the slot's alignment and width and its
caption below it.
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, choose_file_in_dialog, click, open_document, sign_in, visible, wait_for, write_png

SLOT = (
    '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMjAwIi8+" '
    'alt="Research framework" data-placeholder-slot="true" width="400">'
)
CONTENT = f"<h1>Methodology</h1><p>The framework is shown below.</p>{SLOT}<p>Figure 1. Research framework</p><p>Closing text.</p>"
STATE = """const img = document.querySelector('.ProseMirror img'); const wrap = img.closest('[data-node-view-wrapper], .image-resize, div') || img;
return {src: img.src.slice(0, 40), slot: !!img.closest('[data-placeholder-slot], .intellidocs-picture-slot'), width: img.getBoundingClientRect().width,
        align: (s => s.marginLeft === s.marginRight ? 'centered' : s.marginLeft === '0px' ? 'left' : 'right')(getComputedStyle(img.closest('[style*=margin]') || img)),
        caption: [...document.querySelectorAll('.ProseMirror p')].map(p => p.textContent.trim()).find(t => t.startsWith('Figure 1'))}"""


def test_captions_slots_tcase_031(driver, student_api, tmp_path):
    picture = write_png(tmp_path / "framework.png", 600, 300)
    doc_id = student_api.create_document("TCASE-031 Picture Slot", CONTENT)
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)

    slot = visible(driver, By.CSS_SELECTOR, ".ProseMirror .intellidocs-picture-slot, .ProseMirror [data-placeholder-slot]")
    click(driver, slot)
    before = driver.execute_script(STATE)
    assert before["slot"], f"the placeholder did not load as a picture slot: {before}"

    replace = visible(driver, By.XPATH, "//button[@title='Replace the slot with a picture from your computer']")
    choose_file_in_dialog(driver, lambda: click(driver, replace), picture)

    after = wait_for(driver, lambda d: (lambda s: s if not s["slot"] else False)(d.execute_script(STATE)), timeout=90, message="the slot was not replaced")
    assert after["caption"] == "Figure 1. Research framework", f"the caption was lost: {after}"
    # The slot's dashed border is 1px a side, so the widths may differ by a couple of pixels.
    assert abs(after["width"] - before["width"]) <= 3, f"the picture did not keep the slot's width: {before} -> {after}"
    assert after["align"] == before["align"], f"the picture did not keep the slot's alignment: {before} -> {after}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
