"""TCASE-032 | Module 3: TipTap Editor & Academic Presets | Unit: Captions and Slots | Error (Invalid Image Type)

A user chooses a file that is not a picture (a .txt) for a picture slot. Expected (as the app behaves): the file
is refused with a message asking for a picture (PNG, JPEG, WebP...), and the slot stays a slot.
"""

import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, choose_file_in_dialog, click, open_document, sign_in, visible, wait_for

SLOT = (
    '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMjAwIi8+" '
    'alt="Research framework" data-placeholder-slot="true" width="400">'
)
CONTENT = f"<h1>Methodology</h1><p>The framework is shown below.</p>{SLOT}<p>Figure 1. Research framework</p>"


def test_captions_slots_tcase_032(driver, student_api, tmp_path):
    not_a_picture = tmp_path / "notes.txt"
    not_a_picture.write_text("These are notes, not a picture.")
    doc_id = student_api.create_document("TCASE-032 Picture Slot", CONTENT)
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)

    click(driver, visible(driver, By.CSS_SELECTOR, ".ProseMirror .intellidocs-picture-slot, .ProseMirror [data-placeholder-slot]"))
    replace = visible(driver, By.XPATH, "//button[@title='Replace the slot with a picture from your computer']")
    choose_file_in_dialog(driver, lambda: click(driver, replace), not_a_picture)
    # Judge the result only once the editor has finished with the file ("Adding the picture…" gone).
    wait_for(
        driver,
        lambda d: not any("Adding the picture" in e.text for e in d.find_elements(By.CSS_SELECTOR, "[role=alert], [role=status]")),
        timeout=60,
        message="the editor never finished with the chosen file",
    )
    time.sleep(1)

    still_slot = driver.execute_script("return !!document.querySelector('.ProseMirror .intellidocs-picture-slot, .ProseMirror [data-placeholder-slot]')")
    embedded_text = driver.execute_script("return [...document.querySelectorAll('.ProseMirror img')].some(i => i.src.startsWith('data:text/'))")
    assert not embedded_text, "the text file was embedded as a picture"
    assert still_slot, "the slot was replaced by a file that is not a picture"
    messages = [e.text for e in driver.find_elements(By.CSS_SELECTOR, "[role=alert], [role=status]")]
    assert any("PNG" in m or "JPEG" in m for m in messages), f"no message asks for a picture file: {messages}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
