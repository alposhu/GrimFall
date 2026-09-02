/*
 * Deployment build.
 *
 *   node tools/build.mjs              -> dist/
 *   node tools/build.mjs --zip        -> dist/ and grimfall-web.zip
 *   node tools/build.mjs --out ../out
 *
 * Produces a folder that is the whole game and nothing else: no build tools, no
 * test harness, no dev server, no source recording of where the assets came
 * from that is not legally required to travel with them. Drop it on GitHub
 * Pages, or upload the zip to itch.io as an HTML5 project — it needs no server
 * of its own, no configuration and no build step at the far end.
 *
 * What the build actually does beyond copying:
 *   - adds a Content-Security-Policy, so a hosted page cannot be talked into
 *     loading anything the game did not ship
 *   - adds `.nojekyll`, without which GitHub Pages hides files that begin
 *     with an underscore
 *   - collects every SOURCE.txt into one CREDITS.txt, because two of the audio
 *     packs are CC BY and the credit is a licence condition, not a courtesy
 *   - refuses to finish if anything the game references is missing, or if a
 *     development file made it in
 *
 * It deliberately does not minify. There is no bundler in this project and
 * rewriting ES modules with regular expressions to save a few hundred
 * kilobytes against 45 MB of audio would trade a real risk of breaking the
 * game for nothing worth having.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const wantZip = args.includes('--zip');
const outArg = args.indexOf('--out');
const OUT = path.resolve(ROOT, outArg >= 0 ? args[outArg + 1] : 'dist');

// What ships. Everything else does not — the list is an allowlist rather than
// an ignore list, so a new development folder cannot leak by being forgotten.
const SHIP_DIRS = ['src', 'css', 'img', 'audio', 'fonts', 'video'];
const SHIP_FILES = ['index.html', 'manifest.webmanifest', 'LICENSE'];

// Inside those folders, these never ship. Tested against the path with
// forward slashes, so no pattern has to spell out both separators - the
// Windows one is a backslash, and a pattern that matched only "/" quietly
// shipped a developer note to every player.
const EXCLUDE = [
  /(^|[/])\./,                    // dotfiles
  /\.map$/,                       // source maps
  /(^|[/])node_modules([/]|$)/,
  /\.(md|py|zip|psd|aseprite)$/i,
  /(^|[/])video[/]README\.txt$/i, // a note to the developer
];

// Referenced but allowed to be absent. The intro plays a film if one is there
// and draws its own if not, so a missing intro.mp4 is a supported state rather
// than a broken link — but it still has to be listed here on purpose, so that
// a genuinely missing file is never waved through by accident.
const OPTIONAL = new Set(['video/intro.mp4']);

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------
const shipped = [];

function copyTree(rel) {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) { problems.push(`missing source: ${rel}`); return; }
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(from).sort()) copyTree(path.join(rel, name));
    return;
  }
  const posix = rel.split(path.sep).join("/");
  if (EXCLUDE.some((re) => re.test(posix))) return;
  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  shipped.push({ rel: rel.split(path.sep).join('/'), size: stat.size });
}

// The output folder is emptied rather than deleted and recreated. On Windows a
// directory that is some shell's working directory cannot be removed — and the
// obvious thing to do after a build is `cd dist`, so the next build would fail
// on the folder the last one just told you to look at. Its contents are not
// locked that way, so clearing them works from inside it.
function emptyDir(dir) {
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); return; }
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    } catch (err) {
      console.error(`\n  Could not clear ${path.join(dir, name)}`);
      console.error(`  ${err.code || err.message}\n`);
      console.error('  Something is holding a file in the build folder — a preview');
      console.error('  server (`npm run preview`), an editor, or a file manager.');
      console.error('  Close it and run the build again.\n');
      process.exit(1);
    }
  }
}

emptyDir(OUT);
for (const d of [...SHIP_DIRS, ...SHIP_FILES]) copyTree(d);

// ---------------------------------------------------------------------------
// index.html: security headers the file can carry itself
// ---------------------------------------------------------------------------
const indexPath = path.join(OUT, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// An inline script would need its hash in the policy. There are none today;
// if one is ever added, hash it rather than opening the policy up.
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
const hashes = inline.map((m) => {
  const h = crypto.createHash('sha256').update(m[1], 'utf8').digest('base64');
  return `'sha256-${h}'`;
});

// Nothing is loaded from anywhere but this origin — the fonts are vendored
// into fonts/, so there is no third-party host left to allow. That makes the
// policy about as tight as a policy can be: if the page is ever modified to
// fetch something from elsewhere, by a bad edit or by whatever is hosting it,
// the browser refuses outright.
//
// `frame-ancestors` is deliberately absent: it is ignored in a meta tag, and
// itch.io serves HTML5 games inside an iframe, so it must not be set anyway.
const CSP = [
  "default-src 'none'",
  `script-src 'self'${hashes.length ? ' ' + hashes.join(' ') : ''}`,
  // `unsafe-inline` covers style *attributes* — the UI sets element.style
  // directly in a dozen places — and cannot be replaced by a hash.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

// A page that asks for none of these should say so. Cheap, and it is the kind
// of thing a security review looks for first.
const PERMISSIONS = [
  'accelerometer=()', 'camera=()', 'geolocation=()', 'gyroscope=()',
  'magnetometer=()', 'microphone=()', 'payment=()', 'usb=()', 'interest-cohort=()',
].join(', ');

const head = `<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta http-equiv="Permissions-Policy" content="${PERMISSIONS}">
<meta name="referrer" content="no-referrer">
`;
check(html.includes('<meta charset="UTF-8">'), 'index.html has no charset to anchor the injection to');
html = html.replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n${head.trim()}`);
fs.writeFileSync(indexPath, html);

// GitHub Pages runs Jekyll by default, which drops anything starting with `_`.
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// ---------------------------------------------------------------------------
// Credits — a licence condition for two of the packs, not a nicety
// ---------------------------------------------------------------------------
const sources = shipped.filter((f) => f.rel.endsWith('SOURCE.txt'));
check(sources.length >= 3, `only ${sources.length} SOURCE.txt files shipped — attribution is incomplete`);

const credits = [
  'GRIMFALL — credits and licences',
  '='.repeat(50),
  '',
  'The game itself is MIT licensed; see LICENSE.',
  '',
  'Everything below travels with the files it describes. Two of the audio',
  'packs are Creative Commons Attribution 4.0, which makes crediting the',
  'author, linking the licence and stating that the files were changed a',
  'condition of use rather than a courtesy. Do not remove this file, and do',
  'not remove the credits screen inside the game.',
  '',
];
for (const s of sources) {
  credits.push('', '-'.repeat(50), `FROM ${s.rel}`, '-'.repeat(50), '');
  credits.push(fs.readFileSync(path.join(OUT, s.rel), 'utf8').trimEnd());
}
fs.writeFileSync(path.join(OUT, 'CREDITS.txt'), credits.join('\n') + '\n');

// ---------------------------------------------------------------------------
// Deployment notes, in the folder they apply to
// ---------------------------------------------------------------------------
// The note is a plain file rather than a template literal in here: it is a page
// of prose with backticks and dollar signs in it, and every one of those has to
// be escaped to survive being source code. Keeping it as text means it can be
// edited like text.
const notes = path.join(ROOT, 'tools', 'deploy-notes.txt');
check(fs.existsSync(notes), 'tools/deploy-notes.txt is missing');
if (fs.existsSync(notes)) fs.copyFileSync(notes, path.join(OUT, 'DEPLOY.txt'));

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------
// Nothing from the development side of the project may have come along.
const FORBIDDEN = ['tools', 'serve.js', 'package.json', 'package-lock.json', 'README.md', '.git'];
for (const f of FORBIDDEN) {
  check(!fs.existsSync(path.join(OUT, f)), `${f} was copied into the build`);
}

// Every path the built game asks for must exist inside the build. Same idea as
// link-check, but pointed at dist rather than at the source tree, so a file
// that exists in development but was not shipped is caught here.
const exists = new Set(walk(OUT).map((p) => path.relative(OUT, p).split(path.sep).join('/')));
const REF = /(?:src|href)="([^"#?:]+)"|from\s+'(\.[^']+)'|new URL\('([^']+)'/g;
let refs = 0;
for (const rel of [...exists]) {
  if (!/\.(html|js|css|webmanifest)$/.test(rel)) continue;
  const text = fs.readFileSync(path.join(OUT, rel), 'utf8');
  for (const m of text.matchAll(REF)) {
    const raw = m[1] || m[2] || m[3];
    if (!raw || /^(https?:|data:|blob:|\/\/)/.test(raw)) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), raw));
    if (OPTIONAL.has(resolved)) continue;
    refs++;
    check(exists.has(resolved), `${rel} refers to ${raw}, which is not in the build`);
  }
}

// The three things that make the build worth calling a build.
const built = fs.readFileSync(indexPath, 'utf8');
check(built.includes('Content-Security-Policy'), 'the CSP did not get injected');
// Nothing may *load* from off this origin. Credit links in the copy are fine
// and expected — an <a href> is somewhere a player can choose to go, not a
// request the page makes. Only resource-fetching attributes count: any `src`,
// and `href` on a <link>. This is the check that would have caught the Google
// Fonts stylesheet if it had been left in.
const external = [];
for (const m of built.matchAll(/<link\b[^>]*\bhref="(https?:[^"]+)"/gi)) external.push(m[1]);
for (const m of built.matchAll(/\bsrc="(https?:[^"]+)"/gi)) external.push(m[1]);
check(external.length === 0, `index.html loads from another origin: ${external[0]}`);
for (const rel of [...exists].filter((f) => f.endsWith('.css'))) {
  const text = fs.readFileSync(path.join(OUT, rel), 'utf8');
  const urls = [...text.matchAll(/url\(\s*['"]?(https?:[^'")]+)/g)].map((m) => m[1]);
  check(urls.length === 0, `${rel} loads ${urls[0]} from another origin`);
}
check(!built.includes('livereload') && !built.includes('EventSource'),
  'a development snippet is baked into index.html');
check(fs.existsSync(path.join(OUT, 'CREDITS.txt')), 'CREDITS.txt was not written');

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zip, for itch.io
// ---------------------------------------------------------------------------
// A minimal, dependency-free ZIP writer. Deflate via zlib, no directory
// entries, forward slashes — which is exactly what itch's unpacker wants.
function writeZip(dir, zipPath) {
  const files = walk(dir).sort();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const abs of files) {
    const name = path.relative(dir, abs).split(path.sep).join('/');
    const data = fs.readFileSync(abs);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useStore = deflated.length >= data.length;
    const body = useStore ? data : deflated;
    const method = useStore ? 0 : 8;
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);          // time
    local.writeUInt16LE(0x21, 12);       // date: an arbitrary fixed date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(0, 38);             // external attributes
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(zipPath, Buffer.concat([...chunks, centralBuf, end]));
  return fs.statSync(zipPath).size;
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[i] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const all = walk(OUT);
const total = all.reduce((n, f) => n + fs.statSync(f).size, 0);
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

const byTop = new Map();
for (const f of all) {
  const top = path.relative(OUT, f).split(path.sep)[0];
  byTop.set(top, (byTop.get(top) || 0) + fs.statSync(f).size);
}

console.log(`built             ${path.relative(ROOT, OUT) || OUT}`);
for (const [top, size] of [...byTop].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${top.padEnd(22)} ${mb(size).padStart(9)}`);
}
console.log(`total             ${all.length} files, ${mb(total)}`);
console.log(`csp               ok (${CSP.split(';').length} directives, ${hashes.length} inline hashes)`);
console.log(`references        ok (${refs} resolved inside the build)`);
console.log(`credits           ok (${sources.length} SOURCE.txt files gathered)`);

if (wantZip) {
  const zipPath = path.join(ROOT, 'grimfall-web.zip');
  const size = writeZip(OUT, zipPath);
  console.log(`zip               ${path.basename(zipPath)}  ${mb(size)}  (index.html at the top level)`);
}

if (problems.length) {
  console.error('\nFAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('\nBuild clean.');
