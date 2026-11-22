"""TCASE-048 | Module 6: Originality Scanner | Unit: Originality Scanner | Non-Error (Forensics Modal)

After a council scan of a submission that copies a classmate's paragraph, the professor opens
the report: Professor dashboard → Plagiarism → the class → the student in the similarity matrix.

Expected (as the app behaves): the "Academic Integrity Inspection" dialog (CouncilInspectionModal)
shows the originality and peer-similarity scores, the judge count and quorum, the flagged passage
("Verbatim Copy", 100%) beside the source text it matches (labelled "matched peer · <class>",
without naming the classmate), the council verdict and final reasoning, and a Forensics tab
with the authorship timeline verdict and composition metrics.
"""

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select

from selenium_helpers import PROFESSOR, SEED_CLASS, click, open_page, sign_in, submit_copied_pair, visible, wait_for, wait_for_scan


def test_originality_scanner_tcase_048(driver, professor_api, student_api, student2_api):
    folder, original, copy = submit_copied_pair(professor_api, student_api, student2_api, "TCASE-048")
    started = professor_api.call("POST", "/plagiarism/scans", {"documentId": copy, "folderId": folder, "scope": "local"})
    assert started.status_code == 202, started.text[:300]
    detail = wait_for_scan(professor_api, started.json()["scanId"])
    assert detail["scan"]["scan_status"] == "completed"
    copier = next(r for r in professor_api.call("GET", f"/folders/{folder}/enrollments").json() if r.get("student_id") == student2_api.user_id)
    copier_name = copier.get("display_name") or copier["email"]

    sign_in(driver, PROFESSOR)
    open_page(driver, "/professor")
    click(driver, visible(driver, By.XPATH, "//button[normalize-space()='Plagiarism']"))
    Select(visible(driver, By.CSS_SELECTOR, "select[aria-label='Class']")).select_by_visible_text(SEED_CLASS)
    student = visible(driver, By.XPATH, f"//button[@title={copier_name!r} or starts-with(@title, {copier_name + ' ('!r})]", timeout=60)
    click(driver, student)

    dialog = visible(driver, By.XPATH, "//h2[normalize-space()='Academic Integrity Inspection']/ancestor::*[@role='dialog' or contains(@class,'fixed')][1]")
    text = dialog.text.lower()  # labels are upper-cased by CSS
    assert "originality" in text and "peer similarity" in text and "100%" in text, dialog.text[:400]
    assert "final reasoning" in text, f"no council reasoning shown: {dialog.text[:800]}"
    assert "teachers in rural public schools" in text, f"the flagged passage is not shown: {dialog.text[:800]}"
    # The classmate is not named: the source is labelled as a matched peer in the class.
    assert "source text (matched peer" in text and "e2e seed class" in text, f"no matched source shown: {dialog.text[:800]}"
    assert "verbatim copy" in text and "council verdict: plagiarism" in text

    click(driver, dialog.find_element(By.XPATH, ".//button[contains(., 'Forensics')]"))
    wait_for(driver, lambda d: "timeline verdict" in d.find_element(By.XPATH, "//h2[normalize-space()='Academic Integrity Inspection']/ancestor::*[@role='dialog' or contains(@class,'fixed')][1]").text.lower(),
             message="the Forensics tab shows no authorship timeline")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
