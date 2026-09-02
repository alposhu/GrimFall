/*
 * Export every sprite as a PNG you can open in Piskel.
 *
 *   npm install --no-save @napi-rs/canvas
 *   node tools/assets/export-for-editing.mjs [outDir]
 *
 * Almost none of this game's art is a file. Sprites are pixel maps — arrays of
 * strings, one character per pixel, rasterised into canvases when the game
 * boots — and the world is a pure function of position. That is why the whole
 * thing is a few hundred kilobytes of text, and it is also why there has never
 * been anything to open in an image editor.
 *
 * So this runs the real art modules against a real canvas and writes out what
 * they actually draw. Nothing is re-implemented here: every PNG below is the
 * output of the same function the game calls, so what you see in Piskel is
 * exactly what a player sees.
 *
 * WHAT SCALE
 *   Pixel maps are authored at one character per pixel and upscaled on the way
 *   out. These are exported at 1:1 — the true resolution, the grid the art was
 *   actually drawn on. A 12x12 sprite looks absurd in a file browser and is
 *   correct in Piskel, which is a pixel editor and zooms.
 *
 *   A few things are not pixel maps: the five bosses and the dragon are drawn
 *   with canvas geometry, so there is no "true" resolution. Those are exported
 *   large, as reference rather than as a source to edit and put back.
 *
 * WHAT SHAPE
 *   Anything that animates is written as a horizontal strip, one frame per
 *   cell. Piskel reads those directly: Import, tick "as spritesheet", and give
 *   it the frame width printed in the manifest.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let canvasLib;
try {
  canvasLib = await import('@napi-rs/canvas');
} catch (e) {
  console.error('\n  This needs a real canvas to draw into:\n');
  console.error('      npm install --no-save @napi-rs/canvas\n');
  process.exit(1);
}
const { createCanvas } = canvasLib;

// --- the shim ---------------------------------------------------------------
// `makeCanvas` in art/pixel.js asks the document for a canvas. Give it one that
// really rasterises and the entire art layer runs unmodified.
globalThis.document = {
  createElement: (tag) => {
    if (tag !== 'canvas') throw new Error(`the art layer asked for a <${tag}>`);
    return createCanvas(1, 1);
  },
};
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const OUT = path.resolve(ROOT, '..', process.argv[2] || 'ALL_ASSETS');

const art = {
  hero: await import('../../src/art/hero.js'),
  bestiary: await import('../../src/art/bestiary.js'),
  props: await import('../../src/art/props.js'),
  food: await import('../../src/art/food.js'),
  items: await import('../../src/art/items.js'),
  market: await import('../../src/art/market.js'),
  folk: await import('../../src/art/folk.js'),
  balloons: await import('../../src/art/balloons.js'),
  bosses: await import('../../src/art/bosses.js'),
  dragon: await import('../../src/art/dragon.js'),
};
const { BIOMES } = await import('../../src/game/world.js');
const config = await import('../../src/game/config.js');

// --- writing ----------------------------------------------------------------
const manifest = [];
let written = 0;

function dir(...parts) {
  const p = path.join(OUT, ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

// Folder labels are always written with forward slashes. `path.join` hands
// back the platform separator, so without this the same manifest reads
// differently on Windows and on Linux for no reason anyone benefits from.
const label = (p) => p.split(path.sep).join('/');

function save(canvas, folder, name, note) {
  if (!canvas || !canvas.width) return;
  fs.writeFileSync(path.join(dir(folder), `${name}.png`), canvas.toBuffer('image/png'));
  manifest.push({ folder: label(folder), name, w: canvas.width, h: canvas.height, note });
  written++;
}

/** Lay frames out left to right — the shape Piskel's spritesheet import wants. */
function strip(frames) {
  const list = (frames || []).filter(Boolean);
  if (!list.length) return null;
  const w = Math.max(...list.map((f) => f.width));
  const h = Math.max(...list.map((f) => f.height));
  const out = createCanvas(w * list.length, h);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  list.forEach((f, i) => ctx.drawImage(f, i * w + (w - f.width) / 2, h - f.height));
  out.frameWidth = w;
  return out;
}

function saveStrip(frames, folder, name, note) {
  const s = strip(frames);
  if (!s) return;
  save(s, folder, name, `${note} — ${frames.length} frames, ${s.frameWidth}px wide each`);
}

// --- 01 heroes --------------------------------------------------------------
// Ada and Leon ship as hand-drawn sheets, and five of the seven wear a slice of
// the RPG Maker party sheet. Neither decodes here, so what comes out is the
// code-drawn body underneath — which is the version that is actually editable.
for (const ch of art.hero.CHARACTERS) {
  const set = art.hero.heroSprites(ch.id, 1);
  for (const facing of ['south', 'north', 'east', 'west']) {
    saveStrip(set[facing], `01-heroes/${ch.id}`, `${ch.id}-${facing}`, `${ch.name} walking ${facing}`);
  }
  save(art.hero.heroPortrait(ch.id, 1), `01-heroes/${ch.id}`, `${ch.id}-portrait`, `${ch.name} portrait`);
}

// --- 02 enemies -------------------------------------------------------------
for (const k of art.bestiary.MOB_KEYS) {
  save(art.bestiary.mobSprite(k, 1), '02-enemies/mobs', k, `${k} (enemy)`);
}
for (const k of art.bestiary.CHAMPION_KEYS) {
  save(art.bestiary.championSprite(k, 1), '02-enemies/champions', k, `${k} (champion)`);
}

// --- 03 bosses --------------------------------------------------------------
for (const id of art.bosses.REDESIGNED) {
  save(art.bosses.bossArt(id, 3), '03-bosses', id, `${id} — canvas geometry, reference only`);
  save(art.bosses.bossPortraitArt(id, 2), '03-bosses', `${id}-portrait`, `${id} portrait`);
}
{
  const parts = art.dragon.dragonParts(2);
  for (const [name, c] of Object.entries(parts || {})) {
    if (c && c.width) save(c, '03-bosses/parduin-dragon', name, `Parduin: ${name}`);
  }
}

// --- 04 icons ---------------------------------------------------------------
for (const id of config.WEAPON_IDS) {
  const def = config.WEAPONS[id];
  save(art.props.iconSprite(def.icon, 1), '04-icons/weapons', def.icon, def.name);
  save(art.props.iconSprite(def.evolution.icon, 1), '04-icons/weapon-evolutions',
    def.evolution.icon, def.evolution.name);
}
for (const id of [...config.PASSIVE_IDS, 'luck']) {
  const icon = config.PASSIVES[id]?.icon || id;
  save(art.props.iconSprite(icon, 1), '04-icons/passives', icon, config.PASSIVES[id]?.name || id);
}

// --- 05 pickups -------------------------------------------------------------
for (const k of ['gem1', 'gem2', 'gem3', 'coin', 'heart', 'magnet', 'bombpick', 'chest']) {
  save(art.props.pickupSprite(k, 1), '05-pickups', k, k);
}

// --- 06 food ----------------------------------------------------------------
for (const id of art.food.FOOD_IDS) {
  save(art.food.foodSprite(id, 1), '06-food', id, art.food.foodName(id));
}

// --- 07 the market ----------------------------------------------------------
for (let v = 0; v < 4; v++) {
  save(art.market.cobbleTile(v, 32), '07-market/ground', `cobble-${v}`, 'paving variant');
}
for (const k of art.market.STALL_KINDS) {
  save(art.market.stallSprite(k, 1), '07-market/stalls', k, `${k} stall`);
}
for (const k of art.market.PROP_KINDS) {
  save(art.market.marketProp(k, 1), '07-market/props', k, k);
}
for (const id of art.market.VENDOR_IDS) {
  save(art.market.vendorSprite(id, 1), '07-market/vendors', id, `${id} (merchant)`);
  save(art.market.vendorPortrait(id, 1), '07-market/vendors', `${id}-portrait`, `${id} portrait`);
}

// --- 08 townsfolk -----------------------------------------------------------
for (let v = 0; v < art.folk.FOLK_COUNT; v++) {
  const set = art.folk.folkSprites(v, 1);
  const body = art.folk.folkBodyOf(v);
  for (const facing of ['south', 'north', 'east', 'west']) {
    saveStrip(set[facing], `08-townsfolk/${body}`, `${body}-${v}-${facing}`,
      `${body} variant ${v}, ${facing}`);
  }
}

// --- 09 balloons ------------------------------------------------------------
save(art.balloons.balloonBubble(1), '09-balloons', 'bubble', 'the empty bubble');
for (const k of art.balloons.BALLOON_KINDS) {
  save(art.balloons.balloonGlyph(k, 1), '09-balloons', k, `${k} glyph`);
}

// --- 10 shop items ----------------------------------------------------------
for (const k of art.items.ITEM_ICONS) {
  save(art.items.itemIcon(k, 1), '10-shop-items', k, k);
}

// --- 11 world scenery -------------------------------------------------------
BIOMES.forEach((b, i) => {
  const label = b.id || b.key || b.name || `biome-${i}`;
  for (const [kind] of [...(b.props || []), ...(b.decor || [])]) {
    for (let v = 0; v < 4; v++) {
      save(art.props.propSprite(kind, v, b.tint, 1), `11-world/${label}`, `${kind}-${v}`,
        `${kind}, variant ${v}`);
    }
  }
});

// --- 12 things that were already images -------------------------------------
function copyTree(from, to, note) {
  if (!fs.existsSync(from)) return;
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    if (fs.statSync(src).isDirectory()) { copyTree(src, path.join(to, name), note); continue; }
    if (!/\.(png|gif|jpe?g)$/i.test(name)) continue;
    fs.mkdirSync(path.join(OUT, to), { recursive: true });
    fs.copyFileSync(src, path.join(OUT, to, name));
    manifest.push({
      folder: label(to), name: name.replace(/\.[^.]+$/, ''), w: '-', h: '-',
      note: `${note} (${Math.round(fs.statSync(src).size / 1024)} kb)`,
    });
    written++;
  }
}
copyTree(path.join(ROOT, 'img', 'rtp'), '12-rpgmaker-atlases', 'RPG Maker MZ atlas');
copyTree(path.join(ROOT, 'img', 'chr_'), '13-hand-drawn', 'hand-drawn character sheet');
copyTree(path.join(ROOT, 'art-source'), '14-logo-and-store', 'logo / store art');
for (const f of ['logo.png', 'logo-small.png', 'icon-192.png', 'icon-512.png']) {
  const src = path.join(ROOT, 'img', f);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.join(OUT, '14-logo-and-store'), { recursive: true });
  fs.copyFileSync(src, path.join(OUT, '14-logo-and-store', f));
  manifest.push({ folder: '14-logo-and-store', name: f.replace('.png', ''), w: '-', h: '-', note: 'shipped logo / icon' });
  written++;
}

// --- the manifest -----------------------------------------------------------
const byFolder = new Map();
for (const m of manifest) {
  if (!byFolder.has(m.folder)) byFolder.set(m.folder, []);
  byFolder.get(m.folder).push(m);
}

const lines = [
  'GRIMFALL — every sprite, as PNG',
  '='.repeat(64),
  '',
  'Generated by tools/assets/export-for-editing.mjs. Regenerate it any time.',
  'This folder is a COPY: editing these files does not change the game.',
  '',
  'Most of these never existed as files. Grimfall draws its sprites from pixel',
  'maps when it boots, so these were produced by running the real art code',
  'against a real canvas — what is here is what a player sees.',
  '',
  'OPENING THEM IN PISKEL  (piskelapp.com)',
  '  One sprite     Import → Browse → pick the PNG.',
  '  A walk cycle   The -south / -north / -east / -west files are horizontal',
  '                 strips. Import → Browse, tick "Import as spritesheet", and',
  '                 set the frame width to the number listed below. Piskel',
  '                 splits the frames for you.',
  '',
  'SCALE',
  '  Sprites are exported at 1:1 — the grid the art was actually drawn on, one',
  '  character of a pixel map to one pixel. They look tiny in a file browser.',
  '  That is correct: Piskel zooms, and editing at 1:1 is the only way to keep',
  '  pixel art crisp. Editing an upscaled copy blurs it the moment you save.',
  '',
  '  Folder 03 is the exception. The bosses are drawn with canvas geometry',
  '  rather than pixel maps, so they have no true resolution; they are exported',
  '  large, as reference.',
  '',
  'GETTING CHANGES BACK INTO THE GAME',
  '  There is no importer yet. A sprite in the game is a pixel map in',
  '  src/art/*.js — an array of strings plus a palette — so a redrawn PNG has',
  '  to be turned back into one of those. Ask and it can be automated.',
  '',
  '  The folders that ARE plain files, and can be edited and dropped straight',
  '  back, are 12 (img/rtp), 13 (img/chr_) and 14 (the logo).',
  '',
  '='.repeat(64),
  '',
];
for (const [folder, items] of [...byFolder].sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`${folder}/   (${items.length} files)`);
  for (const it of items.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    lines.push(`    ${String(it.name).padEnd(30)} ${String(it.w).padStart(4)}x${String(it.h).padEnd(5)} ${it.note || ''}`.trimEnd());
  }
  lines.push('');
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'README.txt'), lines.join('\n'));

console.log(`  ${written} files -> ${OUT}\n`);
for (const [folder, items] of [...byFolder].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`    ${folder.padEnd(34)} ${String(items.length).padStart(4)}`);
}
console.log('\n  README.txt lists every file, its size, and the frame width for each strip.');
