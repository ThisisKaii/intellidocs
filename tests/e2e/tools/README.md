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
```

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

## Pitfalls

- Measure where the first line of text is drawn (a `Range`), never a block's own box: the
  paginator draws its page boundary inside the next block, so the block's top looks like it is
  on the previous page.
- Word's page counts matched the reference PDFs for every fixture, so a mismatch is the
  editor's, not the reference's.
