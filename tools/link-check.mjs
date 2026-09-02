/*
 * Link check — development only.
 *
 *   node tools/link-check.mjs
 *
 * Starts the dev server, then walks index.html and every module import path to
 * confirm nothing 404s. Catches a renamed file or a mistyped relative path
 * before the browser does.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

const server = spawn(process.execPath, [path.join(ROOT, 'serve.js')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(500);

const seen = new Set();
const missing = [];
let checked = 0;

async function get(url) {
  const res = await fetch(url);
  return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : '' };
}

async function visit(url, from) {
  if (seen.has(url)) return;
  seen.add(url);
  const { ok, status, text } = await get(url);
  checked++;
  if (!ok) { missing.push(`${status} ${url.replace(BASE, '')}  (from ${from})`); return; }

  const here = url.slice(0, url.lastIndexOf('/') + 1);
  const refs = [];

  if (url.endsWith('.html')) {
    for (const m of text.matchAll(/(?:src|href)="([^"#:]+)"/g)) refs.push(m[1]);
  } else if (url.endsWith('.js')) {
    for (const m of text.matchAll(/from\s*'([^']+)'/g)) refs.push(m[1]);
    for (const m of text.matchAll(/import\s*\(\s*'([^']+)'\s*\)/g)) refs.push(m[1]);
  } else if (url.endsWith('.css')) {
    for (const m of text.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
      if (!m[2].startsWith('data:') && !m[2].startsWith('http')) refs.push(m[2]);
    }
  }

  for (const ref of refs) {
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) continue;
    const next = new URL(ref, here).href;
    if (!next.startsWith(BASE)) continue;
    await visit(next, url.replace(BASE, '') || '/');
  }
}

await visit(`${BASE}/index.html`, 'entry');
// Files the HTML references only indirectly.
for (const extra of ['/manifest.webmanifest', '/img/icon-192.png', '/img/icon-512.png']) {
  await visit(BASE + extra, 'manifest');
}

server.kill();

console.log(`checked ${checked} files`);
if (missing.length) {
  console.error('\nMISSING:');
  missing.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}
console.log('every referenced file resolves.');

// ---------------------------------------------------------------------------
// Inline scripts must parse
// ---------------------------------------------------------------------------
// A syntax error in an inline <script> is completely silent: the browser skips
// the block and you get a blank page with no clue why. Nothing else in the
// suite loads these — the dev preview pages in tools/ are not imported by any
// test — so they are parsed here.
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const htmlFiles = [
  path.join(ROOT, 'index.html'),
  ...fs.readdirSync(path.join(ROOT, 'tools'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => path.join(ROOT, 'tools', f)),
];

const bad = [];
let blocks = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grimfall-syntax-'));

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(html))) {
    const isModule = /type\s*=\s*["']module["']/i.test(m[1]);
    const code = m[2];
    if (!code.trim()) continue;
    blocks++;
    // `node --check` honours module syntax for .mjs and script syntax for .cjs,
    // so each block is checked as the browser would parse it.
    const scratch = path.join(tmp, `b${i++}${isModule ? '.mjs' : '.cjs'}`);
    fs.writeFileSync(scratch, code);
    try {
      execFileSync(process.execPath, ['--check', scratch], { stdio: 'pipe' });
    } catch (e) {
      const detail = String(e.stderr || e.message).split('\n').slice(0, 4).join(' ').trim();
      bad.push(`${path.relative(ROOT, file)} — inline ${isModule ? 'module' : 'script'} does not parse: ${detail}`);
    }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });

if (bad.length) {
  console.error('\nSYNTAX:');
  bad.forEach((b) => console.error('  - ' + b));
  process.exit(1);
}
console.log(`inline scripts    ok (${blocks} blocks across ${htmlFiles.length} pages parse)`);
