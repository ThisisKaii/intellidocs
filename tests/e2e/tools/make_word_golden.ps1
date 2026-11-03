# Record Word's own layout of every Word fixture as golden data for tests/e2e/word_gate.py.
# Needs Microsoft Word (Windows). Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File tests\e2e\tools\make_word_golden.ps1
# Only the per-paragraph JSON is kept; Word's PDF goes to a temporary folder once positions are read.
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$docs = Join-Path $root 'tests\fixtures\import_baselines\documents'
$golden = Join-Path $root 'tests\fixtures\import_baselines\word_truth'
$python = Join-Path $root 'ml\venv\Scripts\python.exe'   # PyMuPDF reads Word's PDF
$work = Join-Path ([IO.Path]::GetTempPath()) ('word_golden_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $golden, $work | Out-Null
try {
    foreach ($docx in Get-ChildItem -LiteralPath $docs -Filter *.docx | Sort-Object Name) {
        & (Join-Path $PSScriptRoot 'word_truth.ps1') -Docx $docx.FullName -OutDir $work
        $name = [IO.Path]::GetFileNameWithoutExtension($docx.Name)
        $json = Join-Path $work "$name.word.json"
        & $python (Join-Path $PSScriptRoot 'word_truth_positions.py') $json (Join-Path $work "$name.word.pdf")
        if ($LASTEXITCODE -ne 0) { throw "positions failed for $name" }
        Copy-Item -LiteralPath $json -Destination (Join-Path $golden "$name.json") -Force
    }
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
Get-ChildItem -LiteralPath $golden -Filter *.json | ForEach-Object { "{0}  {1:N0} bytes" -f $_.Name, $_.Length }
