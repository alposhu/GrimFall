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

import crypto from 'node:crypto';
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

// Injected into index.html on the way out. Two things it does that a plain
// "reload on any change" does not:
//
//   A stylesheet is swapped in place. Reloading the page to see a colour change
//   throws away the run you were looking at, which is the one thing you were
//   changing the colour of.
//
//   A reload during a run is deferred until the run ends. The watcher used to
//   fire on anything anywhere under the folder - a build writing dist/, the
//   48 MB zip, a tool touching node_modules - and the page would reload faster
//   than the boot sequence could finish, so the game never launched and every
//   run reset. The watcher below no longer fires for those, and this is the
//   second belt: a live run is never yanked out from under you.
const RELOAD = `
<script>
(function () {
  function busy() {
    // main.js sets this for the length of a run.
    return !!window.__grimfallRunning;
  }

  function swapCss() {
    var links = document.querySelectorAll('link[rel=stylesheet]');
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      var href = l.getAttribute('href');
      // Deliberately not a regular expression. This whole snippet is a
      // template literal that gets embedded in someone else's document, and a
      // backslash does not survive that trip: an escaped slash in a template
      // literal is just a slash, so the regex that read as
      //     ^(https?:)? followed by two escaped slashes
      // arrived at the browser with the escapes gone, as an unterminated
      // literal, and took live reload down with it. Plain string tests cannot
      // be broken by the medium they travel through.
      if (!href || href.slice(0, 2) === '//' || href.indexOf('://') > 0) continue;
      l.setAttribute('href', href.split('?')[0] + '?v=' + Date.now());
    }
  }

  function badge(on) {
    var el = document.getElementById('__reload_badge');
    if (!on) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = '__reload_badge';
    el.textContent = 'reload waiting — finish the run';
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;' +
      'font:11px/1 system-ui,sans-serif;letter-spacing:.06em;padding:6px 9px;' +
      'background:#0b0812;color:#ffd75e;outline:1px solid #c9922a;pointer-events:none';
    document.body.appendChild(el);
  }

  function go() {
    if (busy()) { badge(true); setTimeout(go, 500); return; }
    location.reload();
  }

  function connect() {
    try {
      var es = new EventSource('/__reload');
      es.onmessage = function (e) {
        if (e.data === 'css') swapCss();
        else if (e.data === 'reload') go();
      };
      es.onerror = function () {
        // Fires on a transient reconnect too, so only tear down a socket that
        // is actually finished. Closing a CONNECTING one guarantees the churn
        // it was meant to avoid.
        if (es.readyState === 2) { es.close(); setTimeout(connect, 1000); }
      };
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
    // Node closes an idle request at `requestTimeout`; a stream that is meant
    // to stay open for the length of a session must opt out of it.
    req.socket.setTimeout(0);
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

// Watch the source and nudge every connected browser when something changes.
// A build is a snapshot, so there is nothing to watch for.
//
// This used to be `fs.watch(ROOT, { recursive: true })`, which is the whole
// folder: node_modules, .git, dist, art-source and a 48 MB zip included.
// Writing a build therefore produced a continuous stream of events, each one
// re-arming the 90 ms timer, and the page reloaded over and over - faster than
// the boot sequence could finish, so the game never launched and any run in
// progress was lost. Nothing in those folders is served to the page, so
// nothing in them should reload it.
const WATCH = ['src', 'css', 'tools', 'img', 'fonts'];
const LIVE = new Set(['.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.png', '.svg']);

// Editors do not write a file once. They write a temp file, rename it, touch
// the original, and often write again a beat later; Windows reports each step
// separately. Worse, plenty of things rewrite a file byte-for-byte identically
// - a formatter with nothing to do, a save on focus loss, `git checkout` of the
// branch you are already on - and none of those are a reason to throw away the
// run on screen.
//
// So the test is the CONTENT, not the notification and not the timestamp. These
// are source files of a few tens of kilobytes and the read only happens on an
// event that already passed the extension filter, which is far cheaper than the
// reload it prevents.
const seen = new Map();
function changed(file) {
  let hash;
  try {
    hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  } catch {
    seen.delete(file);          // gone, or a directory — either way, not a change
    return false;
  }
  if (seen.get(file) === hash) return false;
  seen.set(file, hash);
  return true;
}

let timer = null;
let cssOnly = true;
function nudge(rel) {
  const ext = path.extname(rel).toLowerCase();
  if (!LIVE.has(ext)) return;
  if (!changed(path.join(ROOT, rel))) return;
  // A stylesheet is swapped in place; anything else needs the document rebuilt.
  if (ext !== '.css') cssOnly = false;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const msg = cssOnly ? 'css' : 'reload';
    cssOnly = true;
    console.log(`  ${msg === 'css' ? 'restyle' : 'reload '}  ${rel}`);
    clients.forEach((c) => c.write(`data: ${msg}\n\n`));
  }, 120);
}

if (!isBuild) {
  fs.watch(ROOT, (ev, name) => { if (name) nudge(name); });
  for (const dir of WATCH) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    fs.watch(full, { recursive: true }, (ev, name) => {
      if (name) nudge(path.join(dir, name));
    });
  }
}

// Server-sent events die quietly on an idle socket - Node closes the request
// at `requestTimeout`, and the browser reports it as an error rather than a
// clean end. A comment line every twenty seconds keeps it alive and costs
// three bytes.
setInterval(() => {
  clients.forEach((c) => c.write(': ping\n\n'));
}, 20000).unref();

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
