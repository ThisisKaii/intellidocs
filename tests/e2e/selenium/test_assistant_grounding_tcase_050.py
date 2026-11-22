"""TCASE-050 | Module 7: AI Assistant Grounding | Unit: Assistant Grounding | Non-Error (Note Structuring)

A user gives the assistant rough bullet points for their methodology and asks it to organise
them into a formal section.

Expected (as the app behaves): the assistant answers with a preview card ("Outline of your
notes") that places every note exactly once under the section's rhetorical moves (for a
Methods section, e.g. setting and data, procedure, analysis; the model picks the grouping), and
joins each group into a formal paragraph
built only from the notes (every figure in the preview comes from the notes), and inserts
nothing until "Insert into document" is clicked; then the section appears at the cursor.
"""

import re

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, ask_assistant, click, open_document, sign_in, wait_for, wait_for_card

NOTES = [
    "survey of 120 teachers in 4 districts",
    "questionnaire with 25 Likert items",
    "pilot test with 15 teachers, Cronbach alpha 0.87",
    "data analysed with weighted mean and ANOVA",
    "informed consent from all respondents",
]
MESSAGE = "Organize my notes for the methodology into a formal section:\n" + "\n".join(f"- {note}" for note in NOTES)


def test_assistant_grounding_tcase_050(driver, student_api):
    doc_id = student_api.create_document("TCASE-050 Notes", "<h1>Chapter 3</h1><p>Opening sentence of the chapter.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    click(driver, driver.find_element(By.CSS_SELECTOR, ".ProseMirror p"))
    before = driver.find_element(By.CSS_SELECTOR, ".ProseMirror").text

    ask_assistant(driver, MESSAGE)
    card = wait_for_card(driver, "structure-card")
    text = card.text
    assert "outline of your notes" in text.lower()  # card labels are upper-cased by CSS
    outline = text.split("\n")[1:text.split("\n").index("PREVIEW") if "PREVIEW" in text.split("\n") else None]
    for note in NOTES:
        assert outline.count(note) == 1, f"note {note!r} is not placed exactly once in the outline"
    moves = [line for line in outline if line not in NOTES]
    assert len(moves) >= 2, f"the notes were not grouped into moves: {outline}"
    numbers_in_notes = set(re.findall(r"\d+(?:\.\d+)?", " ".join(NOTES)))
    preview = text.split("PREVIEW", 1)[1] if "PREVIEW" in text else text.split("Preview", 1)[1]
    invented = set(re.findall(r"\d+(?:\.\d+)?", preview)) - numbers_in_notes
    assert not invented, f"the preview has figures that are not in the notes: {invented}"
    assert driver.find_element(By.CSS_SELECTOR, ".ProseMirror").text == before, "the document changed before Insert"

    click(driver, card.find_element(By.XPATH, ".//button[normalize-space()='Insert into document']"))
    wait_for(driver, lambda d: "Inserted at your cursor" in d.find_element(By.CSS_SELECTOR, "[data-testid='structure-card']").text)
    first_paragraph = card.find_elements(By.XPATH, ".//p")[0].text.strip()
    wait_for(driver, lambda d: first_paragraph[:60] in d.find_element(By.CSS_SELECTOR, ".ProseMirror").text,
             message=f"the section was not inserted; preview starts {first_paragraph[:60]!r}, document: {driver.find_element(By.CSS_SELECTOR, '.ProseMirror').text[:400]!r}")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
