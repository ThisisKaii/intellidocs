"""TCASE-020 | Module 2: Document Management & Cloud Storage | Unit: Tab Management | Non-Error (Tab Chapter Switch)

A student opens a thesis split into chapter tabs and clicks "Chapter 3: Methodology". Expected (as
the app behaves): the chapter opens as the active tab with its own text, without reloading the
page; each switch saves the open tab and loads the next one from the server, which took about
0.6–2.9 s per switch when measured (the test allows up to 5 s and prints each time). The other tabs
stay listed and openable.

The thesis is built in the test: five chapters split into tabs through the same split endpoint an
import uses (the full DATASENSEI manuscript needs ~200 MB, more than the test account's quota).
"""

import statistics

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, create_tabbed_document, open_document, sign_in, visible

CHAPTERS = ["Introduction", "Review of Related Literature", "Methodology", "Results and Discussion", "Conclusion"]
PARAGRAPH = "<p>" + "Research design, respondents, instruments and the data gathering procedure of the study. " * 30 + "</p>"
LIMIT_MS = 5000

SWITCH = """
const done = arguments[arguments.length - 1];
const target = arguments[0];
const button = [...document.querySelectorAll('nav[aria-label="Document tabs"] button')].find(b => b.title === target);
if (!button) { done(-1); return }
const heading = target.split(': ')[1].toUpperCase();
const started = performance.now();
button.click();
const check = () => {
  const editor = document.querySelector('.ProseMirror');
  if (editor && editor.textContent.includes(heading) && button.getAttribute('aria-current') === 'page') { done(Math.round(performance.now() - started)); return }
  if (performance.now() - started > 20000) { done(-2); return }
  requestAnimationFrame(check);
};
check();
"""


def test_tab_management_tcase_020(driver, student_api):
    chapters = [(f"Chapter {n}: {name}", f"<h1>CHAPTER {n}</h1><h1>{name.upper()}</h1>" + PARAGRAPH * 12) for n, name in enumerate(CHAPTERS, 1)]
    doc_id = create_tabbed_document(student_api, "TCASE-020 Thesis in Tabs", chapters)

    sign_in(driver, STUDENT)
    open_document(driver, doc_id)
    driver.set_script_timeout(30)
    visible(driver, By.CSS_SELECTOR, "nav[aria-label='Document tabs']")

    timings = []
    for target in ["Chapter 3: Methodology", "Chapter 1: Introduction", "Chapter 3: Methodology"]:
        elapsed = driver.execute_async_script(SWITCH, target)
        assert elapsed >= 0, f"switching to {target!r} failed ({elapsed})"
        timings.append(elapsed)
    print(f"tab switch times (ms): {timings}, median {statistics.median(timings)}")

    assert max(timings) <= LIMIT_MS, f"a tab switch took longer than {LIMIT_MS} ms: {timings}"
    active = driver.find_element(By.CSS_SELECTOR, "nav[aria-label='Document tabs'] button[aria-current='page']")
    assert active.get_attribute("title") == "Chapter 3: Methodology"
    listed = [b.get_attribute("title") for b in driver.find_elements(By.CSS_SELECTOR, "nav[aria-label='Document tabs'] button[title^='Chapter']")]
    assert len(set(listed)) == len(CHAPTERS), f"not every chapter tab is listed: {listed}"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v", "-s"]))
