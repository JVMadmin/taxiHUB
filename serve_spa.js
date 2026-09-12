const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 3005;
const BUILD_DIR = path.join(__dirname, 'frontend', 'build');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

const server = http.createServer((req, res) => {
  // Proxy transparente para llamadas /api hacia el Backend en puerto 8080
  if (req.url.startsWith('/api')) {
    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port: 8080,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: '127.0.0.1:8080' }
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'No se pudo conectar con el Backend (puerto 8080)' }));
    });
    req.pipe(proxyReq);
    return;
  }

  const urlPath = req.url.split('?')[0];
  let filePath = path.join(BUILD_DIR, urlPath);
  
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(BUILD_DIR, 'index.html');
    }
  } catch (e) {
    filePath = path.join(BUILD_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Internal Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

// Proxy para WebSockets en vivo (/api/ws/terminal, etc.)
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port: 8080,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: '127.0.0.1:8080' }
    });
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      socket.write(`HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`);
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        socket.write(`${key}: ${value}\r\n`);
      }
      socket.write('\r\n');
      if (proxyHead && proxyHead.length) socket.write(proxyHead);
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });
    proxyReq.on('error', () => {
      socket.destroy();
    });
    proxyReq.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TaxiHUB Frontend running at http://localhost:${PORT}/`);
});
