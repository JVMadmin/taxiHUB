@echo off
rem TaxiHUB - Lanzador de Servicios Silencioso para Windows
cd /d "%~dp0\.."

rem 1. Iniciar Backend FastAPI si no esta activo en puerto 8080
netstat -aon | find ":8080" | find "LISTENING" >nul
if errorlevel 1 (
    start "TaxiHub-Backend" /B powershell -WindowStyle Hidden -Command "$env:MONGO_URL='memory'; $env:DB_NAME='taxihub_demo'; $env:JWT_SECRET='dev-jwt-secret-taxihub'; $env:DEV_USER='admin'; $env:DEV_PASSWORD='admin123'; & 'C:\Users\Quantum\AppData\Local\Programs\Python\Python312\python.exe' -m uvicorn server:app --host 0.0.0.0 --port 8080"
    timeout /t 2 >nul
    curl -s -X POST http://localhost:8080/api/seed >nul
)

rem 2. Iniciar Terminal Web 3005 si no esta activo
netstat -aon | find ":3005" | find "LISTENING" >nul
if errorlevel 1 (
    start "TaxiHub-Terminal-3005" /B node -e "const http=require('http'),fs=require('fs'),path=require('path'),root=path.join(process.cwd(),'frontend','build'),mimes={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.apk':'application/vnd.android.package-archive','.zip':'application/zip'};http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);let fp=path.join(root,u==='/'?'index.html':u);if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory())fp=path.join(root,'index.html');const ext=path.extname(fp).toLowerCase();res.writeHead(200,{'Content-Type':mimes[ext]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);}).listen(3005,'0.0.0.0');"
)

rem 3. Iniciar App Operador 3006 si no esta activo
netstat -aon | find ":3006" | find "LISTENING" >nul
if errorlevel 1 (
    start "TaxiHub-Operador-3006" /B node -e "const http=require('http'),fs=require('fs'),path=require('path'),root=path.join(process.cwd(),'frontend','build-operador'),mimes={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);let fp=path.join(root,u==='/'?'index.html':u);if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory())fp=path.join(root,'index.html');const ext=path.extname(fp).toLowerCase();res.writeHead(200,{'Content-Type':mimes[ext]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);}).listen(3006,'0.0.0.0');"
)
