param([string]$Docx, [string]$OutDir)
# Opens a DOCX in Word (hidden, read-only), exports it to PDF and dumps, per paragraph,
# the page number and vertical position Word lays it out at.
New-Item -ItemType Directory -Force $OutDir | Out-Null
$name = [IO.Path]::GetFileNameWithoutExtension($Docx)
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open($Docx, $false, $true)   # ConfirmConversions=false, ReadOnly=true
    $doc.Repaginate()
    $pdf = Join-Path $OutDir "$name.word.pdf"
    $doc.ExportAsFixedFormat($pdf, 17)                   # 17 = wdExportFormatPDF
    $pages = $doc.ComputeStatistics(2)                   # 2 = wdStatisticPages
    $rows = @()
    $i = 0
    foreach ($p in $doc.Paragraphs) {
        $i++
        $r = $p.Range
        $text = $r.Text
        if ($text.Length -gt 60) { $text = $text.Substring(0, 60) }
        $start = $r.Duplicate; $start.Collapse(1)         # 1 = wdCollapseStart
        $rows += [pscustomobject]@{
            i    = $i
            page = $start.Information(3)                  # 3 = wdActiveEndPageNumber
            y    = [math]::Round($start.Information(6), 1)  # 6 = wdVerticalPositionRelativeToPage (pt)
            text = $text.Trim()
        }
    }
    $json = [pscustomobject]@{ name = $name; pages = $pages; paragraphs = $rows } | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText((Join-Path $OutDir "$name.word.json"), $json, [Text.UTF8Encoding]::new($false))
    "$name : $pages pages, $i paragraphs"
    $doc.Close(0)
} finally {
    $word.Quit(0)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
