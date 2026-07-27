# IntelliDocs — Start all services (Windows PowerShell)
# Usage: .\scripts\run.ps1

Write-Host "Starting IntelliDocs..." -ForegroundColor Cyan

# Start Express server
Write-Host "Starting Express backend..." -ForegroundColor Yellow
Start-Process -NoNewWindow powershell -ArgumentList "-Command", "Set-Location server; npm run dev"

# Start frontend
Write-Host "Starting React frontend..." -ForegroundColor Yellow
Start-Process -NoNewWindow powershell -ArgumentList "-Command", "Set-Location frontend; npm run dev"

# Start ML server
Write-Host "Starting FastAPI ML service..." -ForegroundColor Yellow
$env:BASE_MODEL_PATH = "ml\models\base_model.pkl"
Set-Location ml
& .\venv\Scripts\python.exe src\main.py
