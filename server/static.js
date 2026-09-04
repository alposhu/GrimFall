// ---------------------------------------------------------------------------
// static.js — serve the built game from the co-op server.
//
// WHY THE GAME SERVER SERVES THE GAME.
//
// It removes the hardest problem in deploying this. A page loaded over https
// may only open a `wss://` socket, and `wss://` needs a TLS certificate for
// whatever host it points at. If the game lives on itch.io and the co-op server
// lives somewhere else, that is a second host, a second certificate, a CORS
// story, and an address that has to be baked into the build BEFORE the deploy
// that produces the address.
//
// Serve both from one process and all of that disappears. The page and the
// socket share an origin, so the platform's own certificate covers both, the
// Content-Security-Policy needs no exception because `'self'` already permits a
// same-origin socket, and nothing has to be configured because the server can
// read its own address off the request that just arrived.
//
// The game stays a static site — this changes nothing about how it is built,
// and the itch.io upload is unaffected. It is one extra way to run what is
// already there.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';

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
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Where the built game is, or null if it has not been built.
 *
 * Absent, the server is exactly what it was before: co-op only. That is the
 * right default for anyone who wants the game on itch.io and only the sockets
 * here, and it means this file can never break a deployment that does not use
 * it.
 */
export function findRoot(here) {
  const dist = path.resolve(here, '..', 'dist');
  return fs.existsSync(path.join(dist, 'index.html')) ? dist : null;
}

/**
 * Rewrite index.html so the game connects back to whoever served it.
 *
 * The address is taken from the request's Host header, which is the one place
 * it is knowable without being told: the server does not know its own public
 * name — the platform assigns it, it may be a preview URL, a custom domain or
 * a bare IP, and it can differ per request. Reading it here is what makes this
 * deploy anywhere with no configuration at all.
 *
 * `wss` when the request arrived over TLS. Behind a platform's proxy the
 * connection to this process is plain http and the original scheme survives
 * only in `x-forwarded-proto` — getting that wrong produces a page that loads
 * perfectly and cannot open a socket, with a console error most people will
 * never see.
 */
function withServerAddress(html, req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = proto === 'https' || !!req.socket.encrypted;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return html;
  const url = `${secure ? 'wss' : 'ws'}://${host}`;

  // A build made with GRIMFALL_SERVER already carries an address and a policy
  // that permits it; leave that alone rather than fighting it.
  if (html.includes('name="grimfall-server"')) return html;

  // Same origin, so `connect-src 'self'` already allows the socket and the
  // policy does not need widening. Some older engines did not treat 'self' as
  // covering ws/wss, so the exact origin is added too — it grants nothing the
  // page could not already reach.
  const tag = `<meta name="grimfall-server" content="${url}">`;
  return html
    .replace(/(connect-src 'self')/, `$1 ${url}`)
    .replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n${tag}`);
}

/**
 * Try to answer a request from the built game. Returns true if it did.
 */
export function serveStatic(root, req, res) {
  if (!root) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';

  // Resolved and then checked to be inside the root. Refusing paths that merely
  // CONTAIN ".." is the version of this check that gets bypassed; comparing the
  // resolved path is the version that does not.
  const file = path.resolve(root, '.' + rel);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end('no');
    return true;
  }

  let stat;
  try {
    stat = fs.statSync(file);
  } catch (e) {
    // Anything unrecognised falls back to the game itself, so a deep link or a
    // refresh lands somewhere rather than on a 404.
    return serveIndex(root, req, res);
  }
  if (stat.isDirectory()) return serveStatic(root, { ...req, url: rel + '/' }, res);

  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  if (path.basename(file) === 'index.html') return serveIndex(root, req, res);

  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    // The build's filenames are not hashed, so nothing may be cached forever.
    // An hour is long enough to matter over a session and short enough that an
    // update is not invisible.
    'cache-control': 'public, max-age=3600',
  });
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).pipe(res);
  return true;
}

function serveIndex(root, req, res) {
  let html;
  try {
    html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  } catch (e) {
    return false;
  }
  const out = withServerAddress(html, req);
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    // Never cached: it carries the server address, which differs per host.
    'cache-control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : out);
  return true;
}
