"""TCASE-052 | Module 7: AI Assistant Grounding | Unit: Assistant Grounding | Non-Error (Literature Grounding)

A user asks for citations supporting a claim about transformer models.

Expected (as the app behaves): the assistant searches Crossref and Semantic Scholar (never the
language model) and shows a "Published sources" card: each paper with its authors, year,
venue, source and DOI, a reminder to check that each paper supports the claim, and nothing
cited until the user ticks papers and clicks "Cite N selected". Every DOI shown is registered
(checked against the DOI resolver's handle API). Ticking one and citing it inserts an in-text
citation and adds it to the references.
"""

import re

import pytest
import requests
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, ask_assistant, click, open_document, sign_in, wait_for, wait_for_card

REQUEST = "Find citations for attention mechanisms in transformer models"
DOI = re.compile(r"10\.\d{4,9}/\S+")


def doi_registered(doi: str) -> bool:
    answer = requests.get(f"https://doi.org/api/handles/{doi}", timeout=30)
    return answer.ok and answer.json().get("responseCode") == 1


def test_assistant_grounding_tcase_052(driver, student_api):
    doc_id = student_api.create_document("TCASE-052 Literature", "<h1>Review of Related Literature</h1><p>Attention lets a model weigh the parts of its input.</p>")
    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    click(driver, driver.find_element(By.CSS_SELECTOR, ".ProseMirror p"))

    ask_assistant(driver, REQUEST)
    card = wait_for_card(driver, "citations-card")
    text = card.text
    assert "published sources" in text.lower() and "Check that each one supports your claim" in text
    dois = sorted({d.rstrip(".,)") for d in DOI.findall(text)})
    assert dois, f"no DOIs shown: {text[:500]}"
    unregistered = [d for d in dois if not doi_registered(d)]
    assert not unregistered, f"DOIs that do not resolve: {unregistered}"
    assert re.search(r"crossref|semantic scholar", text, re.I), "the source of each paper is not shown"

    boxes = card.find_elements(By.CSS_SELECTOR, "input[type='checkbox']")
    click(driver, boxes[0])
    click(driver, card.find_element(By.XPATH, ".//button[normalize-space()='Cite 1 selected']"))
    wait_for(driver, lambda d: "Cited and added to your references" in d.find_element(By.CSS_SELECTOR, "[data-testid='citations-card']").text)
    body = driver.find_element(By.CSS_SELECTOR, ".ProseMirror").text
    assert re.search(r"\[\d+\]|\([A-Z][^()]*\d{4}\)", body), f"no in-text citation inserted: {body[-200:]}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
