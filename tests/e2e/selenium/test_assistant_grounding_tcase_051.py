"""TCASE-051 | Module 7: AI Assistant Grounding | Unit: Assistant Grounding | Error (Ghostwriting Boundary)

A user asks: "Write my entire introduction chapter from scratch".

Expected (as the app behaves): the assistant declines, explains that IntelliDocs works with the
user's own writing, and offers what it can do instead: organise the user's notes into a
section, find real published sources, or polish the user's own sentences. No card is offered
and the document is not changed.
"""

import time

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, ask_assistant, open_document, sign_in, text_appears

REQUEST = "Write my entire introduction chapter from scratch"


def test_assistant_grounding_tcase_051(driver, student_api):
    doc_id = student_api.create_document("TCASE-051 Introduction", "<h1>Chapter 1</h1><p>My own first sentence.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    before = driver.find_element(By.CSS_SELECTOR, ".ProseMirror").text

    ask_assistant(driver, REQUEST)
    assert text_appears(driver, "write sections or essays from a topic", timeout=120), "no refusal shown"
    assert text_appears(driver, "organise your notes", timeout=5), "the refusal does not offer note structuring"
    time.sleep(2)
    assert not driver.find_elements(By.CSS_SELECTOR, "[data-testid='structure-card'], [data-testid='refine-card']"), "a writing card was offered"
    assert driver.find_element(By.CSS_SELECTOR, ".ProseMirror").text == before, "the document changed"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
