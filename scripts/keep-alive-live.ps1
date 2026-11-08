<#
.SYNOPSIS
    Lightweight keep-alive pinger for live Render services (Server + ML).
.DESCRIPTION
    Pings both live endpoints every 10 minutes to prevent Render free instances
    from falling asleep during presentations, exhibits, or active testing.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\keep-alive-live.ps1
#>

$ServerUrl = "https://intellidocs-server-1yxr.onrender.com/health"
$MlUrl     = "https://intellidocs-885t.onrender.com/health"
$UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

function Ping-Endpoint {
    param(
        [string]$Name,
        [string]$Url
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest -Uri $Url -UserAgent $UserAgent -TimeoutSec 75 -UseBasicParsing -ErrorAction Stop
        $sw.Stop()
        Write-Host "[$([DateTime]::Now.ToString('HH:mm:ss'))] [SUCCESS] $Name -> $($response.StatusCode) in $([math]::Round($sw.Elapsed.TotalSeconds, 2))s" -ForegroundColor Green
    } catch {
        $sw.Stop()
        Write-Host "[$([DateTime]::Now.ToString('HH:mm:ss'))] [WARNING] $Name -> $($_.Exception.Message) ($([math]::Round($sw.Elapsed.TotalSeconds, 2))s)" -ForegroundColor Yellow
    }
}

Write-Host "=== IntelliDocs Live Services Keep-Alive ===" -ForegroundColor Cyan
Write-Host "Server: $ServerUrl"
Write-Host "ML:     $MlUrl"
Write-Host "Interval: 10 minutes (Render sleep threshold: 15 min)"
Write-Host "Press Ctrl+C to stop.`n"

while ($true) {
    Write-Host "--- Ping round starting at $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss')) ---" -ForegroundColor DarkGray
    Ping-Endpoint -Name "Server" -Url $ServerUrl
    Ping-Endpoint -Name "ML    " -Url $MlUrl
    Write-Host "Sleeping 10 minutes until next ping...`n" -ForegroundColor DarkGray
    Start-Sleep -Seconds 600
}
