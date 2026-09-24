@echo off
REM Backend taxiHUB para pruebas locales (BD en memoria, sin Mongo/Docker).
REM Uso: doble clic. Dejar la ventana abierta mientras se prueba.
cd /d "%~dp0backend"
set MONGO_URL=memory
set DB_NAME=taxihub_test
set JWT_SECRET=dev-jwt-secret-taxihub
set CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
py -m uvicorn server:app --port 8000 --host 127.0.0.1
pause
