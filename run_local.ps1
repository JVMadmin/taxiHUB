# TaxiHUB Local Runner (Sin Docker)
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Iniciando TaxiHUB 2.0 Localmente (Sin Docker)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# 1. Iniciar Backend FastAPI en puerto 8080
Write-Host "[1/2] Levantando Backend en http://127.0.0.1:8080..." -ForegroundColor Green
$env:MONGO_URL = "memory"
$env:DB_NAME = "taxihub_test"
$env:JWT_SECRET = "dev-jwt-secret-taxihub"

$backendProcess = Start-Process -FilePath "$scriptDir\venv\Scripts\uvicorn.exe" `
    -ArgumentList "server:app --host 127.0.0.1 --port 8080 --app-dir `"$scriptDir\backend`"" `
    -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 2

# 2. Iniciar Frontend SPA en puerto 3005
Write-Host "[2/2] Levantando Frontend en http://localhost:3005..." -ForegroundColor Green
Start-Process "http://localhost:3005/"

& node "$scriptDir\serve_spa.js"
