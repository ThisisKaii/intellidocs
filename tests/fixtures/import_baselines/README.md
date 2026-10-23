# Import & Visual Baseline Test Fixtures

Drop your test assets here for automated and visual regression verification:

- **`documents/`**: Place raw test manuscripts here (`.docx`, `.txt`, `.html`, `.pdf`).
  - Example: `documents/ieee_sample_paper.docx`
- **`reference_screenshots/`**: Place expected "ground-truth" screenshots here.
  - Name matching recommendation: `<doc_name>_page1.png`, `<doc_name>_page2.png`
  - Example: `reference_screenshots/ieee_sample_paper_page1.png`

Automated visual and geometry tests (`scrollWidth > clientWidth`, page count assertions, and pixel diffs) will read from this directory.
