# Import fidelity tools

Find out where an imported DOCX stops matching Word. Word itself is the ground truth, so
these need Microsoft Word installed (Windows). Run them from the repo root.

`fidelity_run.py` compares page *i* with page *i*, so one early drift marks every later page
wrong. These tools find the FIRST place the editor diverges instead.

## Workflow

1. **Word's layout (truth).** Opens the file hidden and read-only, exports a PDF, and writes
   each paragraph's page and vertical position (pt) to JSON:

   ```powershell
   tests\e2e\tools\word_truth.ps1 -Docx "C:\path\file.docx" -OutDir "C:\temp\word"
   ```

2. **First divergence.** Needs the frontend dev server on 5173 (`cd frontend; npm run dev`);
   the converter runs in-process, so the ML service is not needed:

   ```powershell
   ml\venv\Scripts\python tests\e2e\tools\diverge.py "C:\path\file.docx" "C:\temp\word\file.word.json"
   ```

   It prints the page delta per Word page (editor - Word) and each point where the page
   offset or the vertical drift changes, with the paragraphs just before it.

3. **Find the cause.**
   - `sections.py <docx>` lists every section's size, margins, columns and header/footer.
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
