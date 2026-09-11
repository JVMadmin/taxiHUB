@echo off
title TaxiHUB 2.0 - Local Runner (Sin Docker)
echo ===================================================
echo   Iniciando TaxiHUB 2.0 en modo Local (Sin Docker)
echo ===================================================
echo.

cd /d "%~dp0"

:: 1. Backend Python FastAPI en puerto 8080
echo [1/2] Iniciando Backend en http://127.0.0.1:8080 ...
set MONGO_URL=memory
set DB_NAME=taxihub_test
set JWT_SECRET=dev-jwt-secret-taxihub
start "TaxiHUB Backend (8080)" /min "%~dp0venv\Scripts\uvicorn.exe" server:app --host 127.0.0.1 --port 8080 --app-dir "%~dp0backend"

:: 2. Frontend SPA Server en puerto 3000
echo [2/2] Iniciando Frontend en http://localhost:3000 ...
timeout /t 2 /nobreak >nul
start http://localhost:3000/
node "%~dp0serve_spa.js"

pause
