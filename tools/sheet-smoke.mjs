/*
 * Hand-drawn character sheet test — development only.
 *
 *   node tools/sheet-smoke.mjs
 *
 * Ada and Leon are the only characters in the game whose art is a file rather
 * than code, which makes them the only ones that can fail to appear. Two things
 * matter: the files on disk really are the layout the slicer assumes, and a
 * sheet that does not load falls back to the code-drawn hero instead of leaving
 * a hole where a character should be.
 *
 * Node cannot decode a PNG, so the slicing itself is checked against the raw
 * files here and the fallback is checked through the real module.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import './dom-stub.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

// ---------------------------------------------------------------------------
// A very small PNG reader — enough for size and alpha coverage
// ---------------------------------------------------------------------------
function readPng(file) {
  const buf = fs.readFileSync(file);
  check(buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${file} is not a PNG`);
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  return { width, height, bitDepth, colorType, idat: Buffer.concat(idat) };
}

/** Un-filter a truecolour-alpha PNG into an alpha-only grid. */
function alphaGrid(png) {
  if (png.colorType !== 6 || png.bitDepth !== 8) return null;   // only RGBA8
  const raw = zlib.inflateSync(png.idat);
  const bpp = 4;
  const stride = png.width * bpp;
  const out = new Uint8Array(png.width * png.height);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < png.height; y++) {
    const filter = raw[p++];
    raw.copy(cur, 0, p, p + stride);
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < png.width; x++) out[y * png.width + x] = cur[x * bpp + 3];
    prev.set(cur);
  }
  return out;
}

const anyOpaque = (alpha, w, x0, y0, cw, ch) => {
  for (let y = y0; y < y0 + ch; y++) {
    for (let x = x0; x < x0 + cw; x++) if (alpha[y * w + x] > 8) return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// The files match the layout the slicer assumes
// ---------------------------------------------------------------------------
const { SHEET_HEROES } = await import('../src/art/sheets.js');
const { CHARACTERS } = await import('../src/art/hero.js');

check(SHEET_HEROES.length > 0, 'no characters are marked as hand-drawn');
for (const id of SHEET_HEROES) {
  check(CHARACTERS.some((c) => c.id === id), `"${id}" has artwork but is not on the roster`);
}

for (const id of SHEET_HEROES) {
  const dir = path.join(ROOT, 'img', 'chr_', id);
  check(fs.existsSync(dir), `img/chr_/${id}/ is missing`);

  const walkFile = path.join(dir, `${id}_walking.png`);
  check(fs.existsSync(walkFile), `${id}_walking.png is missing`);
  if (!fs.existsSync(walkFile)) continue;

  const png = readPng(walkFile);
  // 12 columns x 8 rows of 48px cells is the layout sheets.js slices.
  check(png.width % 12 === 0 && png.height % 8 === 0,
    `${id}_walking.png is ${png.width}x${png.height} — not a 12x8 grid`);
  const cw = png.width / 12, ch = png.height / 8;
  check(cw === 48 && ch === 48, `${id} cells are ${cw}x${ch}, the slicer assumes 48x48`);

  const alpha = alphaGrid(png);
  check(alpha, `${id}_walking.png is not 8-bit RGBA — the slicer expects that`);
  if (alpha) {
    // The character must occupy the top-left block: 3 frames across, 4 down.
    let filled = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        if (anyOpaque(alpha, png.width, c * cw, r * ch, cw, ch)) filled++;
        else problems.push(`${id}: walk frame col ${c} row ${r} is empty — a facing will be blank`);
      }
    }
    check(filled === 12, `${id} has ${filled} of 12 walk frames drawn`);

    // Feet flush to the bottom of the cell is what the six-pixel pad assumes.
    for (let r = 0; r < 4; r++) {
      const lastRow = anyOpaque(alpha, png.width, 0, r * ch + ch - 3, cw * 3, 3);
      check(lastRow, `${id} row ${r} does not reach the bottom of its cell — feet will float`);
    }
  }

  const faceFile = path.join(dir, `${id}_face.png`);
  if (fs.existsSync(faceFile)) {
    const fp = readPng(faceFile);
    check(fp.width % 4 === 0 && fp.height % 2 === 0, `${id}_face.png is ${fp.width}x${fp.height}`);
    check(fp.width / 4 === 144, `${id} face cells are ${fp.width / 4}px, expected 144`);
  }
}
console.log(`sheets on disk    ok (${SHEET_HEROES.length} characters, 12 frames each, 48x48 cells)`);

// ---------------------------------------------------------------------------
// A sheet that cannot load must fall back, not vanish
// ---------------------------------------------------------------------------
// Node has no image decoder, so every load fails here — which is exactly the
// case that must degrade cleanly.
const sheets = await import('../src/art/sheets.js');
const loadedList = await sheets.preloadHeroSheets();
check(Array.isArray(loadedList), 'preloadHeroSheets did not resolve to a list');
check(loadedList.length === 0, 'the stub decoded an image, so the fallback path went untested');

const { heroSprites, heroPortrait, heroFace } = await import('../src/art/hero.js');
for (const id of SHEET_HEROES) {
  check(!sheets.hasSheet(id), `${id} reports a sheet that never decoded`);
  check(sheets.sheetSprites(id, 3) === null, `${id} sliced a sheet it does not have`);
  check(heroFace(id) === null, `${id} returned a face it does not have`);

  const set = heroSprites(id, 3);
  check(set && set.south && set.south.length === 4,
    `${id} lost its walk cycle when the artwork failed to load`);
  for (const dir of ['south', 'north', 'east', 'west']) {
    check(set[dir]?.every((f) => f && f.width > 0), `${id} ${dir} fell back to nothing`);
  }
  check(set.south[0].width === 48, `${id} fallback is ${set.south[0].width}px, expected 48`);
  check(heroPortrait(id, 4), `${id} has no portrait when the artwork is missing`);
}
console.log(`fallback          ok (${SHEET_HEROES.length} characters stay playable with no artwork)`);

// Preloading twice, and preloading nothing, must both be harmless.
await sheets.preloadHeroSheets([]);
await sheets.preloadHeroSheets();
check(true, 'unreachable');
console.log('reload            ok (preloading repeatedly is safe)');

// ---------------------------------------------------------------------------
// The market's atlases
// ---------------------------------------------------------------------------
// These are cut from the RPG Maker MZ library by tools/assets/build-rtp-art.py
// and indexed positionally by src/art/rtp.js. Nothing at runtime can notice a
// mismatch between the two — a wrong index just draws the wrong barrel — so
// the sizes and the ordering are checked here instead.
const rtp = await import('../src/art/rtp.js');
const RTPDIR = path.join(ROOT, 'img', 'rtp');
const T = 48, ICON = 32;

const ATLAS_SHAPE = {
  // name         cell w, cell h, expected columns (or null for "derived")
  ground:   [T, T, null],
  props:    [3 * T, 3 * T, 8],
  signs:    [T, T, null],
  banners:  [T, 2 * T, null],
  items:    [ICON, ICON, 6],
  balloons: [T, T, 8],
  folk:     [144, 192, 6],
  actors:   [576, 384, 1],
  actor_faces: [576, 288, 1],
  vendor_faces: [144, 144, 3],
};

for (const [name, [cw, ch, cols]] of Object.entries(ATLAS_SHAPE)) {
  const file = path.join(RTPDIR, `${name}.png`);
  if (!fs.existsSync(file)) { problems.push(`img/rtp/${name}.png is missing`); continue; }
  const png = readPng(file);
  check(png.width % cw === 0, `${name}.png is ${png.width}px wide, not a multiple of ${cw}`);
  check(png.height % ch === 0, `${name}.png is ${png.height}px tall, not a multiple of ${ch}`);
  if (cols) check(png.width / cw === cols, `${name}.png has ${png.width / cw} columns, expected ${cols}`);
}

// Every name the code can ask for must have a cell that actually exists.
const propsPng = readPng(path.join(RTPDIR, 'props.png'));
const propCells = (propsPng.width / (3 * T)) * (propsPng.height / (3 * T));
check(rtp.RTP_PROPS.length <= propCells,
  `rtp.js names ${rtp.RTP_PROPS.length} props but props.png only holds ${propCells}`);
check(new Set(rtp.RTP_PROPS).size === rtp.RTP_PROPS.length, 'RTP_PROPS has a duplicate name');

const signsPng = readPng(path.join(RTPDIR, 'signs.png'));
check(rtp.RTP_SIGNS.length === signsPng.width / T,
  `rtp.js names ${rtp.RTP_SIGNS.length} signs but signs.png holds ${signsPng.width / T}`);

const itemsPng = readPng(path.join(RTPDIR, 'items.png'));
const iconCells = (itemsPng.width / ICON) * (itemsPng.height / ICON);
check(rtp.RTP_ICONS.length <= iconCells,
  `rtp.js names ${rtp.RTP_ICONS.length} icons but items.png only holds ${iconCells}`);

// The build script is the other half of that coupling. Its table is read as
// text rather than run, because it needs Pillow and the owner's MZ install.
const buildSrc = fs.readFileSync(path.join(ROOT, 'tools', 'assets', 'build-rtp-art.py'), 'utf8');
// The PROPS table is sliced out first and matched inside, rather than scanned
// for across the whole file. The earlier version matched on the sheet filename,
// which quietly stopped seeing props the moment the hall's furniture started
// coming from Inside_B — the test went on passing while the two lists drifted,
// which is the one thing it exists to prevent. TERRAIN entries have the same
// shape as PROPS entries, so the slice is what keeps them out.
const propsBlock = buildSrc.slice(buildSrc.indexOf('PROPS = ['), buildSrc.indexOf('TERRAIN = ['));
const builtProps = [...propsBlock.matchAll(/\("([a-z_]+)",\s*"\w+\.png"/g)].map((m) => m[1]);

// The terrain atlas names its tiles in a manifest the build script writes, and
// rtp.js has to agree with it exactly — the atlas is indexed by position, so a
// tile inserted rather than appended renames every floor after it, and the
// symptom is a room that silently paves itself in the wrong stone.
//
// Compared against the emitted manifest rather than against the script's source
// table: the carpets are COMPOSED from autotile quarters, not cropped, so they
// never appear in a table any regex could read. The manifest says what was
// actually built.
const manifest = fs.readFileSync(path.join(RTPDIR, 'terrain.txt'), 'utf8')
  .split('\n').map((l) => l.trim()).filter(Boolean);
check(manifest.length > 0, 'img/rtp/terrain.txt is empty — re-run build-rtp-art.py');
check(manifest.join() === rtp.RTP_TERRAIN.join(),
  `terrain.txt and rtp.js disagree:\n      atlas: ${manifest.join(' ')}\n      code:  ${rtp.RTP_TERRAIN.join(' ')}`);

const terrainPng = readPng(path.join(RTPDIR, 'terrain.png'));
check(terrainPng.width / 48 === manifest.length,
  `terrain.png holds ${terrainPng.width / 48} tiles but the manifest names ${manifest.length}`);
console.log(`terrain           ok (${manifest.length} named tiles, atlas and code agree)`);
check(builtProps.length > 0, 'could not read the prop table out of build-rtp-art.py');
check(builtProps.join() === rtp.RTP_PROPS.join(),
  `build-rtp-art.py and rtp.js disagree on prop order:
      built: ${builtProps.join(' ')}
      code:  ${rtp.RTP_PROPS.join(' ')}`);

// Every good the shop can sell needs its own picture, and the point of keying
// them by good id is that no two share one. Both halves are checked against the
// real vendor tables rather than against a hand-written list, so a good added
// to a vendor without an icon fails here instead of appearing as a flask.
const { GOOD_ICONS, ITEM_ICONS } = await import('../src/art/items.js');
const { VENDORS } = await import('../src/game/shop.js');
const goodIds = Object.values(VENDORS).flatMap((v) => v.goods.map((g) => g.id));
check(goodIds.length >= 18, `only ${goodIds.length} goods found across the vendors`);
for (const id of goodIds) {
  check(rtp.RTP_ICONS.includes(id), `shop good '${id}' has no icon in items.png`);
  // The code-drawn fallback may let goods share a picture — it has fewer of
  // them — but every good still has to resolve to one that exists.
  check(ITEM_ICONS.includes(GOOD_ICONS[id]),
    `shop good '${id}' falls back to '${GOOD_ICONS[id]}', which is not drawn`);
}
check(new Set(rtp.RTP_ICONS).size === rtp.RTP_ICONS.length, 'two goods share a sheeted icon');
for (const name of rtp.RTP_ICONS) {
  check(goodIds.includes(name), `items.png ships '${name}', which no vendor sells`);
}
// The crowd, the merchants and the heroes all come out of the same 4x2 block
// layout, and the indices are hand-written — so they are checked for range and
// for the one thing that would be invisible at runtime: a merchant's face also
// turning up on a shopper.
// The crowd is cast in the build script and addressed by index here, so the
// two lists have to agree on both length and order — an off-by-one would put
// the farmer behind Marta's counter and nothing at runtime would notice.
const buildFolk = [...buildSrc.matchAll(/\("(People\d)",\s*(\d+),\s*"([^"]*)"\)/g)]
  .map((m) => m[3]);
check(buildFolk.length > 0, 'could not read the crowd cast out of build-rtp-art.py');
check(buildFolk.length === rtp.RTP_FOLK.length,
  `build-rtp-art.py casts ${buildFolk.length} people, rtp.js names ${rtp.RTP_FOLK.length}`);
// The descriptions are written with an em dash in JS and a hyphen in Python,
// so compare on the part before the dash — which is the person.
const who = (t) => t.split(/[—-]/)[0].trim().toLowerCase();
buildFolk.forEach((desc, i) => {
  check(who(desc) === who(rtp.RTP_FOLK[i] || ''),
    `folk #${i}: build says "${desc}", rtp.js says "${rtp.RTP_FOLK[i]}"`);
});

const folkPng = readPng(path.join(RTPDIR, 'folk.png'));
const folkCells = (folkPng.width / 144) * (folkPng.height / 192);
check(rtp.RTP_FOLK_COUNT <= folkCells,
  `rtp.js names ${rtp.RTP_FOLK_COUNT} people but folk.png only holds ${folkCells}`);

const vendorFolk = Object.values(rtp.RTP_VENDOR);
check(vendorFolk.length === 3, `${vendorFolk.length} merchants mapped, expected 3`);
check(new Set(vendorFolk).size === vendorFolk.length, 'two merchants share a face');
for (const [id, i] of Object.entries(rtp.RTP_VENDOR)) {
  check(Number.isInteger(i) && i >= 0 && i < rtp.RTP_FOLK_COUNT,
    `merchant '${id}' is folk index ${i}, which is out of range`);
  check(!rtp.RTP_CROWD_POOL.includes(i), `merchant '${id}' is also in the crowd pool`);
  // The cast list names each merchant, so a renumbering that silently swapped
  // two of them would be caught here rather than in the square.
  check((rtp.RTP_FOLK[i] || '').toLowerCase().startsWith(id),
    `merchant '${id}' points at "${rtp.RTP_FOLK[i]}"`);
}
check(rtp.RTP_CROWD_POOL.length === rtp.RTP_FOLK_COUNT - vendorFolk.length,
  `crowd pool is ${rtp.RTP_CROWD_POOL.length}, expected ${rtp.RTP_FOLK_COUNT - vendorFolk.length}`);

// The square must never show two of the same person, so the crowd it spawns is
// capped at the size of the cast. That is only true if the cap is actually
// applied — check the market honours it rather than trusting the constant.
{
  const { enterMarket, M } = await import('../src/game/market.js');
  const { startRun } = await import('../src/game/game.js');
  startRun('ranger', 'normal');
  let worst = 0;
  for (let visit = 1; visit <= 6; visit++) {
    enterMarket({ visit, bossName: 'Test', onExit: () => {} });
    const seen = M.folk.map((f) => f.sheet);
    check(new Set(seen).size === seen.length,
      `visit ${visit}: two shoppers wear the same face`);
    check(M.folk.every((f) => rtp.RTP_CROWD_POOL.includes(f.sheet)),
      `visit ${visit}: a shopper is wearing a merchant or a royal`);
    check(M.folk.every((f) => f.scale === 3),
      `visit ${visit}: a shopper is not full size`);
    worst = Math.max(worst, M.folk.length);
  }
  console.log(`crowd casting     ok (up to ${worst} shoppers, all different, all full size)`);
}

// Each hero either wears a party-sheet block or is one of the owner's own
// drawings. Nothing may be left on a code-drawn placeholder by accident, and
// two heroes must not wear the same face.
const heroSrc = fs.readFileSync(path.join(ROOT, 'src/art/hero.js'), 'utf8');
const actorBlock = [...heroSrc.matchAll(/^\s{2}(\w+):\s*(\d+),/gm)
].filter((m) => heroSrc.slice(0, m.index).lastIndexOf('const ACTOR_BLOCK') >
                heroSrc.slice(0, m.index).lastIndexOf('};'))
  .map((m) => [m[1], Number(m[2])]);
check(actorBlock.length >= 5, `only ${actorBlock.length} heroes mapped to the party sheet`);
const blocks = actorBlock.map(([, b]) => b);
check(new Set(blocks).size === blocks.length, 'two heroes wear the same party-sheet block');
for (const [id, b] of actorBlock) {
  check(b >= 0 && b < rtp.RTP_ACTOR_COUNT, `hero '${id}' wants block ${b}, out of range`);
}
const mapped = new Set(actorBlock.map(([id]) => id));
for (const ch of CHARACTERS) {
  check(mapped.has(ch.id) || SHEET_HEROES.includes(ch.id),
    `hero '${ch.id}' has neither a party-sheet block nor a drawn sheet`);
}
console.log(`atlases           ok (${Object.keys(ATLAS_SHAPE).length} files, ${rtp.RTP_PROPS.length} props, ${rtp.RTP_ICONS.length} icons, ` +
  `${rtp.RTP_CROWD_POOL.length} townsfolk + 3 merchants, ${actorBlock.length} heroes on the party sheet)`);

// As with the character sheets, Node decodes nothing — so this is the
// fallback path, and every accessor must return null rather than throw.
const loadedAtlases = await rtp.preloadRtp();
check(loadedAtlases.length === 0, 'an atlas decoded in Node, which has no image decoder');
check(rtp.rtpReady() === false, 'rtpReady() is true with nothing loaded');
check(rtp.rtpGround(0, 32) === null, 'rtpGround returned something with no atlas');
check(rtp.rtpProp('barrel', 1) === null, 'rtpProp returned something with no atlas');
check(rtp.rtpProp('not_a_prop', 1) === null, 'rtpProp accepted an unknown name');
check(rtp.rtpSign('sign_smith', 1) === null, 'rtpSign returned something with no atlas');
check(rtp.rtpIcon('draught', 22) === null, 'rtpIcon returned something with no atlas');
check(rtp.rtpBalloon(0, 3, 1) === null, 'rtpBalloon returned something with no atlas');
check(rtp.rtpFolkSprites(0, 1) === null, 'rtpFolkSprites returned something with no atlas');
check(rtp.rtpFolkCount() === 0, 'rtpFolkCount is not zero with no atlas');
check(rtp.rtpVendorSprites('oswin', 1) === null, 'rtpVendorSprites returned something with no atlas');
check(rtp.rtpVendorSprites('nobody', 1) === null, 'rtpVendorSprites accepted an unknown merchant');
check(rtp.rtpActorSprites(0, 1) === null, 'rtpActorSprites returned something with no atlas');
check(rtp.rtpActorFace(0, 96) === null, 'rtpActorFace returned something with no atlas');
await rtp.preloadRtp([]);
console.log('atlas fallback    ok (every accessor returns null, nothing throws)');

// The licence and the recipe travel with the files.
const rtpSource = path.join(RTPDIR, 'SOURCE.txt');
check(fs.existsSync(rtpSource), 'img/rtp/SOURCE.txt is missing');
if (fs.existsSync(rtpSource)) {
  const text = fs.readFileSync(rtpSource, 'utf8');
  for (const needle of ['RPG Maker MZ', 'build-rtp-art.py', 'Gotcha Gotcha Games']) {
    check(text.includes(needle), `img/rtp/SOURCE.txt does not mention ${needle}`);
  }
}
const helpHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check(helpHtml.includes('RPG Maker MZ'), 'the game never says on screen where the market art came from');
console.log('rtp attribution   ok (SOURCE.txt, in-game)');

// ---------------------------------------------------------------------------
// Provenance is recorded
// ---------------------------------------------------------------------------
const src = path.join(ROOT, 'img', 'chr_', 'SOURCE.txt');
check(fs.existsSync(src), 'img/chr_/SOURCE.txt is missing — the artwork has no provenance note');
if (fs.existsSync(src)) {
  const text = fs.readFileSync(src, 'utf8');
  const names = SHEET_HEROES.map((id) => CHARACTERS.find((c) => c.id === id)?.name || id);
  for (const needle of [...SHEET_HEROES, ...names]) {
    check(text.toLowerCase().includes(needle.toLowerCase()),
      `img/chr_/SOURCE.txt does not mention ${needle}`);
  }
}
console.log('provenance        ok (SOURCE.txt records where the art came from)');

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log('\nAll sheet checks passed.');
