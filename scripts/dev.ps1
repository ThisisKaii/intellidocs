# IntelliDocs — Concurrent Local Dev Runner (Windows PowerShell)
# Usage: .\scripts\dev.ps1

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Starting IntelliDocs Dev Environment    " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$root = Split-Path -Parent $PSScriptRoot

# Check Python virtualenv
$pythonExe = Join-Path $root "ml\venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Warning "Python venv not found at ml\venv\Scripts\python.exe. Falling back to global python..."
    $pythonExe = "python"
}

Write-Host "[1/3] Launching Backend Server (port 3000)..." -ForegroundColor Yellow
$serverProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\server'; Write-Host '--- Backend Server (port 3000) ---' -ForegroundColor Green; npm run dev" -PassThru

Write-Host "[2/3] Launching Frontend App (port 5173)..." -ForegroundColor Yellow
$frontendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; Write-Host '--- Frontend App (port 5173) ---' -ForegroundColor Green; npm run dev" -PassThru

Write-Host "[3/3] Launching ML Microservice (port 8001)..." -ForegroundColor Yellow
$mlProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\ml'; Write-Host '--- ML Service (port 8001) ---' -ForegroundColor Green; & '$pythonExe' src\main.py" -PassThru

Write-Host ""
Write-Host "All 3 services launched in separate windows." -ForegroundColor Green
Write-Host "  - Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  - Server:   http://localhost:3000" -ForegroundColor White
Write-Host "  - ML API:   http://localhost:8001" -ForegroundColor White
Write-Host ""
Write-Host "Press Enter to stop all 3 services..." -ForegroundColor DarkYellow
[void][System.Console]::ReadLine()

Write-Host "Stopping services..." -ForegroundColor Red
Stop-Process -Id $serverProcess.Id, $frontendProcess.Id, $mlProcess.Id -ErrorAction SilentlyContinue
Write-Host "All services stopped." -ForegroundColor Gray
