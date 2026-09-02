#!/usr/bin/env node
/*
 * Zero-dependency static server for local development.
 *
 *   node serve.js            → http://localhost:5173
 *   node serve.js dist       → preview a build, exactly as it will ship
 *   PORT=8080 node serve.js
 *
 * ES modules need a real HTTP origin (opening index.html from the filesystem
 * will not work), so use this, or any other static server, while developing.
 * A live-reload snippet is injected into index.html on the fly; the file on
 * disk stays clean and deployable as-is.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const clients = [];

// An optional folder to serve instead of the source tree — `node serve.js dist`
// is how you look at a build before uploading it. A build is meant to be
// exactly what ships, so serving one turns live-reload off rather than
// injecting a script into it: what you see is the file.
const arg = process.argv[2];
const ROOT = arg ? path.resolve(HERE, arg) : HERE;
const isBuild = ROOT !== HERE;

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`\n  No index.html in ${ROOT}\n`);
  if (isBuild) console.error('  Did you mean to run `npm run build` first?\n');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const RELOAD = `
<script>
(function () {
  function connect() {
    try {
      var es = new EventSource('/__reload');
      es.onmessage = function (e) { if (e.data === 'reload') location.reload(); };
      es.onerror = function () { es.close(); setTimeout(connect, 1000); };
    } catch (e) { setTimeout(connect, 1000); }
  }
  connect();
})();
</script>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  if (url === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    clients.push(res);
    req.on('close', () => {
      const i = clients.indexOf(res);
      if (i >= 0) clients.splice(i, 1);
    });
    return;
  }

  let rel = url === '/' ? '/index.html' : url;
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + rel);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    if (ext === '.html' && !isBuild) {
      data = Buffer.from(data.toString('utf8').replace('</body>', RELOAD + '\n</body>'));
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// Watch the tree and nudge every connected browser when something changes.
// A build is a snapshot, so there is nothing to watch for.
let timer = null;
if (!isBuild) {
  fs.watch(ROOT, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      clients.forEach((c) => c.write('data: reload\n\n'));
    }, 90);
  });
}

// A busy port is the most common way to start this and the least interesting
// stack trace to read, so it is reported rather than thrown.
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  const find = process.platform === 'win32'
    ? `Get-NetTCPConnection -LocalPort ${PORT} -State Listen | Select OwningProcess`
    : `lsof -i :${PORT}`;
  console.error([
    '',
    `  Port ${PORT} is already in use.`,
    '  Another dev server is probably still running. Either close it, or pick',
    '  a different port:',
    '',
    `    PORT=${PORT + 1} node serve.js`,
    '',
    '  To find what is holding it:',
    '',
    `    ${find}`,
    '',
  ].join('\n'));
  process.exit(1);
});

server.listen(PORT, () => {
  console.log([
    '',
    isBuild ? '  Grimfall build preview (no live reload)' : '  Grimfall dev server',
    `  serving  ${ROOT}`,
    `  http://localhost:${PORT}`,
    '',
  ].join('\n'));
});
