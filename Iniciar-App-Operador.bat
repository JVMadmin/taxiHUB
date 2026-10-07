@echo off
title TaxiHUB - App Exclusiva de Operador (Puerto 3006)
echo Iniciando App de Operador en http://localhost:3006 ...
start http://localhost:3006/login
cd /d "%~dp0"
node -e "const http=require('http'),fs=require('fs'),path=require('path'),root=path.join(__dirname,'frontend','build-operador'),mimes={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);let fp=path.join(root,u==='/'?'index.html':u);if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory())fp=path.join(root,'index.html');const ext=path.extname(fp).toLowerCase();res.writeHead(200,{'Content-Type':mimes[ext]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);}).listen(3006,'0.0.0.0',()=>console.log('App de Operador activa en http://localhost:3006'));"
