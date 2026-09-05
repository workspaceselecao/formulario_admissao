const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = (() => {
  const envPort = parseInt(process.env.PORT || '', 10);
  if (!Number.isNaN(envPort)) return envPort;
  // npm run dev -> 5999 (avoids the 5500 occupied by another node process)
  if (process.env.npm_lifecycle_event === 'dev') return 5999;
  return 5500;
})();
const ROOT = __dirname;

// Log startup to the preview log file so we can confirm the server chose its port.
try {
  const logPath = path.resolve(process.env.HOME || process.env.USERPROFILE, '.freebuff', 'preview-96c3ca86-05aa-45b1-9d37-028b8570f7aa.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `Server starting on port ${PORT} (root=${ROOT})\n`);
} catch (_) { /* best effort */ }

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  const filePath = path.join(ROOT, url);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}, serving ${ROOT}`);
  try {
    fs.appendFileSync(logPath, `Server listening on http://localhost:${PORT}\n`);
  } catch (_) { /* best effort */ }
});
