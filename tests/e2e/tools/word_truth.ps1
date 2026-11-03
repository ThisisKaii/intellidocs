param([string]$Docx, [string]$OutDir)
# Word's own layout of a DOCX: for each paragraph, the page Word puts it on. Opens the file hidden and
# read-only, exports Word's PDF, and writes <name>.word.json (and <name>.word.pdf) to OutDir.
#
# Fast by design. Asking Word for a paragraph's page (Range.Information(wdActiveEndPageNumber)) makes it
# check pagination on every call, which took 44+ minutes on the fixtures. Instead Word reports where
# each PAGE starts (one GoTo per page) and each paragraph's start offset (Range.Start, which needs no
# layout); a paragraph's page is then the last page that starts at or before it. Table membership comes
# from each table's range, not a per-paragraph query. Vertical positions are added afterwards from the
# exported PDF by word_truth_positions.py.
#
# Word automation traps, each measured: a path built with Join-Path (a PSObject-wrapped string) makes a
# hidden Word hang indefinitely when saving the PDF, while a plain string takes about a second; and
# Close(0)/Quit(0) throw from PowerShell (the argument must be a reference), which left a hidden
# WINWORD.EXE running after every run. The calls below avoid both.
$ErrorActionPreference = 'Stop'
# Word shows an invisible dialog (and waits forever) for a path it dislikes, such as one with forward
# slashes, so both paths are made absolute Windows paths first.
$Docx = [IO.Path]::GetFullPath($Docx)
$OutDir = [IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force $OutDir | Out-Null
$name = [IO.Path]::GetFileNameWithoutExtension($Docx)
$clock = [Diagnostics.Stopwatch]::StartNew()
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open($Docx, $false, $true)    # ConfirmConversions=false, ReadOnly=true
    $doc.Repaginate()
    Write-Host ("  opened and paginated  {0:N1}s" -f $clock.Elapsed.TotalSeconds)
    $pages = $doc.ComputeStatistics(2)                   # 2 = wdStatisticPages
    # A plain string, never Join-Path's output: Word's SaveAs2 hangs indefinitely on the PSObject-wrapped
    # string Join-Path returns (measured: the same call with a plain string takes about a second).
    [string]$pdf = [IO.Path]::Combine($OutDir, "$name.word.pdf")
    $doc.SaveAs2($pdf, 17)                               # 17 = wdFormatPDF; a read-only source is fine
    Write-Host ("  PDF exported          {0:N1}s" -f $clock.Elapsed.TotalSeconds)

    # Where each page starts in the main story: one GoTo per page.
    $pageStarts = New-Object 'System.Collections.Generic.List[int]'
    for ($n = 1; $n -le $pages; $n++) {
        $pageStarts.Add($doc.GoTo(1, 1, $n).Start)         # 1 = wdGoToPage, 1 = wdGoToAbsolute
    }

    Write-Host ("  page starts read      {0:N1}s" -f $clock.Elapsed.TotalSeconds)
    # Ranges of the top-level tables (a nested table lies inside its parent's range).
    $tables = @()
    foreach ($t in $doc.Tables) { $tables += , @($t.Range.Start, $t.Range.End) }

    Write-Host ("  tables read           {0:N1}s" -f $clock.Elapsed.TotalSeconds)
    $rows = New-Object 'System.Collections.Generic.List[object]'
    $i = 0
    $page = 1
    foreach ($p in $doc.Paragraphs) {
        $i++
        $r = $p.Range
        $start = $r.Start
        # Paragraphs come in document order, so the page only ever moves forward.
        while ($page -lt $pages -and $pageStarts[$page] -le $start) { $page++ }
        $inTable = $false
        foreach ($t in $tables) { if ($start -ge $t[0] -and $start -lt $t[1]) { $inTable = $true; break } }
        $text = $r.Text
        if ($text.Length -gt 60) { $text = $text.Substring(0, 60) }
        $rows.Add([pscustomobject]@{ i = $i; page = $page; start = $start; in_table = $inTable; text = $text.Trim() })
    }

    # The fixture's hash lets a gate refuse truth recorded for a different version of the file.
    $sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Docx).Hash.ToLower()
    $json = [pscustomobject]@{
        schema = 2; name = $name; sha256 = $sha256; word_version = $word.Version; word_build = $word.Build
        pages = $pages; page_starts = $pageStarts; paragraphs = $rows
    } | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText((Join-Path $OutDir "$name.word.json"), $json, [Text.UTF8Encoding]::new($false))
    $doc.Saved = $true
    $doc.Close()
    "{0} : {1} pages, {2} paragraphs, {3:N1}s" -f $name, $pages, $i, $clock.Elapsed.TotalSeconds
} finally {
    $word.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
