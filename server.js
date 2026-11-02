// Finance Calculator - local-only server. No dependencies, no network calls.
// Run:  node server.js   then open http://localhost:4545
// Data lives in data.json next to this file. Every save also drops a copy in backups/.
// If data.json does not exist the page keeps everything in the visitor's browser instead.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 4545;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'docs');
const DATA = path.join(ROOT, 'data.json');
const BACKUPS = path.join(ROOT, 'backups');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readData() {
  return fs.readFileSync(DATA, 'utf8');
}

function writeData(text) {
  // validate first so a bad payload never clobbers the file
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.investments)) {
    throw new Error('data must be an object with an investments array');
  }
  const pretty = JSON.stringify(parsed, null, 2) + '\n';
  fs.mkdirSync(BACKUPS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(DATA)) {
    fs.copyFileSync(DATA, path.join(BACKUPS, `data-${stamp}.json`));
  }
  const tmp = DATA + '.tmp';
  fs.writeFileSync(tmp, pretty);
  fs.renameSync(tmp, DATA);
  pruneBackups(30);
  return pretty;
}

function pruneBackups(keep) {
  const files = fs.readdirSync(BACKUPS).filter((f) => f.startsWith('data-') && f.endsWith('.json')).sort();
  while (files.length > keep) {
    fs.unlinkSync(path.join(BACKUPS, files.shift()));
  }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC, urlPath));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/data')) {
    if (req.method === 'GET') {
      // no data.json (e.g. a fresh copy) -> the page falls back to saving in the browser only
      if (!fs.existsSync(DATA)) return send(res, 404, 'no data.json');
      try {
        return send(res, 200, readData(), MIME['.json']);
      } catch (e) {
        return send(res, 500, String(e.message));
      }
    }
    if ((req.method === 'PUT' || req.method === 'POST') && fs.existsSync(DATA)) {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy(); });
      req.on('end', () => {
        try {
          const saved = writeData(body);
          send(res, 200, saved, MIME['.json']);
        } catch (e) {
          send(res, 400, 'not saved: ' + e.message);
        }
      });
      return;
    }
    return send(res, 405, 'method not allowed');
  }
  if (req.method !== 'GET') return send(res, 405, 'method not allowed');
  serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Finance Calculator running at http://localhost:${PORT}`);
  console.log(`Data file: ${DATA}`);
  console.log('Press Ctrl+C to stop.');
});
