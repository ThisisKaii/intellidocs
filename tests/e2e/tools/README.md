# Import fidelity tools

Find out where an imported DOCX stops matching Word. Word itself is the ground truth, so
these need Microsoft Word installed (Windows). Run them from the repo root.

`fidelity_run.py` compares page *i* with page *i*, so one early drift marks every later page
wrong. These tools find the FIRST place the editor diverges instead.

## The gate

`tests/e2e/word_gate.py` is the pass/fail check: for every Word fixture it counts the paragraphs the
editor puts on the page Word puts them on, against `tests/fixtures/import_baselines/word_gate_baseline.json`.
It needs only the frontend dev server, not Word, because Word's layout is committed in
`tests/fixtures/import_baselines/word_truth/`. Re-record that with `make_word_golden.ps1` (needs Word)
when a fixture changes; the gate refuses truth whose SHA-256 does not match its fixture.

```powershell
ml\venv\Scripts\python tests\e2e\word_gate.py                    # exit 0 ok, 1 regression, 2 could not measure
ml\venv\Scripts\python tests\e2e\word_gate.py --update-baseline  # deliberate: review the diff
ml\venv\Scripts\python tests\e2e\word_gate.py --roundtrip        # also reopen each fixture from its saved editor JSON
```

`--roundtrip` measures every fixture twice: as first opened, then reopened from the editor JSON that
autosave would store. The reopened layout must match the first open exactly, and saved JSON that the
editor rejects is an error, not a quiet fallback to the HTML.

The tools below explain a drop the gate reports.

## Workflow

1. **Word's layout (truth).** Opens the file hidden and read-only, exports a PDF, and writes
   each paragraph's page and vertical position (pt) to JSON:

   ```powershell
   tests\e2e\tools\word_truth.ps1 -Docx "C:\path\file.docx" -OutDir "C:\temp\word"
   ml\venv\Scripts\python tests\e2e\tools\word_truth_positions.py "C:\temp\word\file.word.json" "C:\temp\word\file.word.pdf"
   ```

   Seconds per file: Word reports where each page starts (one call per page) and each paragraph's
   start offset, and a paragraph's page follows from those; asking Word for every paragraph's page
   was far slower. The second command adds each paragraph's vertical position from Word's PDF
   (`y: null` where its first line is not found). Never pass Word a path built with `Join-Path`:
   saving the PDF with one hangs a hidden Word indefinitely.

2. **First divergence.** Needs the frontend dev server on 5173 (`cd frontend; npm run dev`);
   the converter runs in-process, so the ML service is not needed:

   ```powershell
   ml\venv\Scripts\python tests\e2e\tools\diverge.py "C:\path\file.docx" "C:\temp\word\file.word.json"
   ```

   It prints the page delta per Word page (editor - Word) and each point where the page
   offset or the vertical drift changes, with the paragraphs just before it.

3. **Find the cause.**
   - `sections.py <docx>` lists every section's size, margins, columns and header/footer.
   - `picture_positions.py <docx> <word.pdf>` compares where every picture sits (page, left edge,
     width) in Word's exported PDF and in the editor.
   - `anchors.py <docx> [--images-only]` lists every floating picture, text box and shape with its
     position, wrap mode and size, which decides whether the converter pins it to the page,
     merges it into a row, or leaves it in the text.
   - `xml_before.py <docx> <text> [n]` prints the raw WordprocessingML of the n-th paragraph
     containing the text and the two before it (searches content controls and tables too).
   - `html_around.py <docx> <text>` shows the HTML the converter emitted around some text.
   - `probe_break_geometry.py <docx> <heading>` prints live editor geometry around a heading
     and its page break.
   - `compare_fid.py <before.json> <after.json>` compares two `fidelity_run.py` summaries.

## Editor JSON references (Stage 2a)

`editor_json_reference.py` records, for every fixture (DOCX and PDF), the converter's HTML and the
editor JSON the real import path makes from it (`tests/fixtures/import_baselines/editor_json/`,
gzipped, pictures replaced by a hash of their data). While the converter moves onto its own model,
`check` must keep reporting `same`: the HTML stays byte-identical, and the converter's new JSON writer
has to reproduce the recorded editor JSON. It names the first differing character or JSON path.
`--json` pairs each body paragraph the writer produced with the reference paragraph and reports
how many are identical; differences listed in `KNOWN_DIFFERENCES` name the slice that removes them.
`--doc` compares the whole document the converter returns as `content_json` (what an import now stores
and opens from) with the recorded editor JSON; the only allowances are what the editor adds at runtime
after any load (the trailing empty paragraph, the image width cap). `editor_json_cases.py` (frontend on
5173) covers shapes no fixture has, such as a page break inside a line of text: it builds small DOCX
files, loads their converted HTML in the editor, and compares the editor's JSON with the writer's, piece
by piece and as the whole `content_json`. The references are always the editor's parse of the HTML:
`record` never hands the harness the converter's JSON.

`fidelity_run.py` and `word_gate.py` open each import from the converter's JSON, as the app does;
`fidelity_run.py --from-html` parses the HTML instead (how a document without stored JSON opens).

```powershell
ml\venv\Scripts\python tests\e2e\tools\editor_json_reference.py check              # needs the frontend on 5173
ml\venv\Scripts\python tests\e2e\tools\editor_json_reference.py check --html-only  # converter only, no browser
ml\venv\Scripts\python tests\e2e\tools\editor_json_reference.py record             # deliberate: review the diff
ml\venv\Scripts\python tests\e2e\tools\editor_json_reference.py check --json       # the converter's own JSON writer, no browser
ml\venv\Scripts\python tests\e2e\tools\editor_json_reference.py check --doc        # the whole content_json, no browser
```

## Fonts

The editor draws the common Word fonts itself on every computer. `frontend/src/styles/wordFontAliases.css`
declares each Word name (Times New Roman, Arial, Calibri, Cambria, Courier New, Bookman Old Style,
Arial Narrow, Segoe UI Symbol) as a web font that points at its free stand-in, with the Word font's
line metrics. `make_font_metrics.py` generates it on Windows with the Word fonts installed; never edit
it by hand:

```powershell
ml\venv\Scripts\python tests\e2e\tools\make_font_metrics.py           # measure and write
ml\venv\Scripts\python tests\e2e\tools\make_font_metrics.py --check   # exit 1 when stale
```

`word_gate.py --shipped-fonts-only` lays every fixture out as a computer without those fonts would.
It keeps only the families the editor ships, and it fails when installed fonts draw more than 0.5% of
a document's glyphs (only rare symbols should). CI runs this mode on Linux
(`.github/workflows/word-gate.yml`) with only `tests/e2e/requirements-gate.txt` installed.

## Pitfalls

- Measure where the first line of text is drawn (a `Range`), never a block's own box: the
  paginator draws its page boundary inside the next block, so the block's top looks like it is
  on the previous page.
- Word's page counts matched the reference PDFs for every fixture, so a mismatch is the
  editor's, not the reference's.
