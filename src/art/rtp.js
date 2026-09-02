// ---------------------------------------------------------------------------
// rtp.js — the Long Market's artwork.
//
// The rest of the game draws itself: sprites are pixel maps rasterised at boot
// and the world is a function of position. The market is the exception. It is
// a place you walk into between runs, it wants to feel busier and warmer than
// anywhere else in the game, and the owner's RPG Maker MZ licence covers the
// art that does exactly that — so the square is furnished, peopled and signed
// with it. See img/rtp/SOURCE.txt for the licence and for what each file is.
//
// Nothing here is load-bearing. Every slice this module hands out has a
// code-drawn twin that shipped first, and every accessor returns null until
// its atlas has decoded. Callers ask, and fall back without branching on why:
//
//     const img = rtpProp('barrel', 2) || marketProp('barrel', 2);
//
// So the market renders identically offline, on a file:// origin, in the first
// frames before decoding finishes, and in Node — where there is no Image at
// all and the tests exercise the fallback path exclusively.
// ---------------------------------------------------------------------------

import { makeCanvas, sprite } from './pixel.js';

const T = 48;                    // the source tile
const PROP_CELL = 3 * T;         // props are packed on a 144px grid
const PROP_COLS = 8;
const ICON = 32;
const ICON_COLS = 6;
const BALLOON_FRAMES = 8;
// A "block" is one person: three walk frames across, four facings down.
const BLOCK_COLS = 3;
const BLOCK_ROWS = 4;
const FOLK_ATLAS_COLS = 6;       // how many people per row in folk.png
const ACTOR_COLS = 12;           // actors.png is still a stock 12x8 sheet
const ACTOR_ROWS = 8;
const ACTOR_BLOCKS = 8;
const FACE = 144;                // one portrait cell on a face sheet

const LOAD_TIMEOUT = 6000;       // matches sheets.js: art must never hang boot

const ATLASES = [
  'ground', 'props', 'signs', 'banners', 'items', 'balloons',
  'folk', 'actors', 'actor_faces', 'vendor_faces',
];
const img = new Map();

// ---------------------------------------------------------------------------
// What is in the atlases. Order matters — it is the order build-rtp-art.py
// writes them, and these two lists are the only place that coupling lives.
// ---------------------------------------------------------------------------
export const RTP_PROPS = [
  'lamppost', 'stall_wood', 'stall_stone', 'tent', 'tent_red', 'barrel', 'tub', 'bucket',
  'washtub', 'urn', 'crate', 'well', 'trestle', 'signpost', 'fence', 'basket',
  'firewood', 'pebbles', 'haystack', 'wheat', 'cabbages', 'berries', 'stump', 'log',
  'flowers', 'shrub', 'crate_tall', 'shelf_bare', 'shelf_bread', 'shelf_fish', 'arch', 'awning',
  'counter',
];

export const RTP_SIGNS = [
  'sign_smith', 'sign_potion', 'sign_coin', 'sign_blade', 'sign_armour',
  'sign_inn', 'sign_ale', 'sign_food', 'sign_charm',
];

// Keyed by the shop good's own id, so a good cannot end up sharing a picture
// with something it has nothing to do with — which is what happened when these
// were named after the object and two goods both wanted "a flask".
export const RTP_ICONS = [
  'mend', 'feast', 'tonic', 'flask_heal', 'flask_stone', 'flask_swift',
  'whet', 'commission', 'temper', 'oil', 'spring', 'boots',
  'reroll', 'banish', 'charm', 'lodestone', 'tithe', 'effigy',
];

const PROP_INDEX = new Map(RTP_PROPS.map((n, i) => [n, i]));
const SIGN_INDEX = new Map(RTP_SIGNS.map((n, i) => [n, i]));
const ICON_INDEX = new Map(RTP_ICONS.map((n, i) => [n, i]));

// A prop's cell is 144px square but the art inside it is not: it sits flush
// with the bottom of the cell, horizontally centred. Trimming to the real
// bounds would need pixel access we do not have in every context, so the sizes
// are recorded instead — they come from the build script's own output.
const PROP_SIZE = {
  lamppost: [48, 144], stall_wood: [96, 96], stall_stone: [96, 96],
  tent: [144, 144], tent_red: [144, 144], counter: [96, 96],
  crate_tall: [48, 96], shelf_bare: [48, 96], shelf_bread: [48, 96],
  shelf_fish: [48, 96], arch: [48, 96],
};
const sizeOf = (name) => PROP_SIZE[name] || [T, T];

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
const atlasUrl = (name) => new URL(`../../img/rtp/${name}.png`, import.meta.url).href;

function loadImage(url) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), LOAD_TIMEOUT);

    const el = new Image();
    el.onload = () => finish(el.naturalWidth ? el : null);
    el.onerror = () => finish(null);
    el.decoding = 'async';
    el.src = url;
    if (el.complete && el.naturalWidth) finish(el);
  });
}

/**
 * Decode the market's atlases. Always resolves; a file that fails to load just
 * leaves that part of the market drawn in code. Returns the names that loaded.
 */
export async function preloadRtp(names = ATLASES) {
  try {
    await Promise.all(names.map((n) => loadImage(atlasUrl(n)).then((el) => {
      if (el) img.set(n, el);
    })));
  } catch (e) {
    /* one bad atlas must not stop the boot */
  }
  return loadedAtlases();
}

export const hasRtp = (name) => img.has(name);
export const loadedAtlases = () => ATLASES.filter(hasRtp);
/** True once enough has decoded for the market to look like the RTP version. */
export const rtpReady = () => img.has('props') && img.has('ground');

// ---------------------------------------------------------------------------
// Slicing
// ---------------------------------------------------------------------------
function cut(src, sx, sy, sw, sh, dw, dh) {
  const { canvas, ctx } = makeCanvas(Math.max(1, Math.round(dw)), Math.max(1, Math.round(dh)));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** One of the five paving stones, drawn at `size`. */
export function rtpGround(variant, size = 32) {
  const src = img.get('ground');
  if (!src) return null;
  const n = Math.max(1, Math.round(src.width / T));
  const i = ((variant % n) + n) % n;
  return sprite(`rtp:ground:${i}:${size}`, () => cut(src, i * T, 0, T, T, size, size));
}

/** How many paving variants the atlas actually holds. */
export const rtpGroundCount = () => (img.has('ground') ? Math.round(img.get('ground').width / T) : 0);

/**
 * A market prop, trimmed to its own footprint and scaled. `scale` is relative
 * to the 48px source tile, so scale 1 gives a 48px barrel.
 */
export function rtpProp(name, scale = 1) {
  const src = img.get('props');
  const idx = PROP_INDEX.get(name);
  if (!src || idx === undefined) return null;
  return sprite(`rtp:prop:${name}:${scale}`, () => {
    const [w, h] = sizeOf(name);
    const cx = (idx % PROP_COLS) * PROP_CELL + (PROP_CELL - w) / 2;
    const cy = Math.floor(idx / PROP_COLS) * PROP_CELL + (PROP_CELL - h);
    return cut(src, cx, cy, w, h, w * scale, h * scale);
  });
}

/** The natural size of a prop before scaling, or null if it is not shipped. */
export const rtpPropSize = (name) => (PROP_INDEX.has(name) ? sizeOf(name) : null);

/** A hanging trade sign. */
export function rtpSign(name, scale = 1) {
  const src = img.get('signs');
  const idx = SIGN_INDEX.get(name);
  if (!src || idx === undefined) return null;
  return sprite(`rtp:sign:${name}:${scale}`,
    () => cut(src, idx * T, 0, T, T, T * scale, T * scale));
}

/** One of four cloth banners, 48x96 at scale 1. */
export function rtpBanner(i, scale = 1) {
  const src = img.get('banners');
  if (!src) return null;
  const n = Math.max(1, Math.round(src.width / T));
  const k = ((i % n) + n) % n;
  return sprite(`rtp:banner:${k}:${scale}`,
    () => cut(src, k * T, 0, T, 2 * T, T * scale, 2 * T * scale));
}

/** A shop icon at `size` pixels square. */
export function rtpIcon(name, size = 32) {
  const src = img.get('items');
  const idx = ICON_INDEX.get(name);
  if (!src || idx === undefined) return null;
  return sprite(`rtp:icon:${name}:${size}`, () => cut(
    src,
    (idx % ICON_COLS) * ICON, Math.floor(idx / ICON_COLS) * ICON, ICON, ICON,
    size, size,
  ));
}

/**
 * One frame of an expression balloon. `kindIndex` is the row — the same order
 * `BALLOON_KINDS` uses — and `frame` runs 0..7, where 0 is the empty bubble
 * the animation pops in on.
 */
export function rtpBalloon(kindIndex, frame, scale = 1) {
  const src = img.get('balloons');
  if (!src) return null;
  const rows = Math.max(1, Math.round(src.height / T));
  const r = ((kindIndex % rows) + rows) % rows;
  const f = ((frame % BALLOON_FRAMES) + BALLOON_FRAMES) % BALLOON_FRAMES;
  return sprite(`rtp:balloon:${r}:${f}:${scale}`,
    () => cut(src, f * T, r * T, T, T, T * scale, T * scale));
}

export const rtpBalloonFrames = BALLOON_FRAMES;

// ---------------------------------------------------------------------------
// The crowd
// ---------------------------------------------------------------------------
// `folk.png` is a cast, not a copy. The RPG Maker People sheets hold thirty-two
// characters and most of them have no business in a market square — People3 is
// an entire royal court, and there are more nobles, a bride and a priestess
// scattered through the others. Somebody haggling over turnips in ermine is
// absurd, so the build script cuts out only the fifteen who look like they buy
// their own food, plus the three traders, and leaves the rest behind.
//
// So a "variant" is an index into that cast, 0..17: 0..14 are the crowd and
// 15..17 are the merchants. Nothing at runtime has to filter anything.
const ROW_DIR = ['south', 'west', 'east', 'north'];
const COL_CYCLE = [1, 2, 1, 0];        // stand, step, stand, other step
// Code-drawn folk are bottom-aligned against a taller frame; padding the sheet
// cell the same way makes the two interchangeable to the renderer.
const PAD_TOP = 6;

// Who is who, in the order build-rtp-art.py packs them. Descriptions are here
// so a reader can tell whether an index is the farmer or the old woman without
// opening the atlas in an image editor.
export const RTP_FOLK = [
  'young man, green tunic',
  'girl in a red dress',
  'youth in a blue tunic',
  'red-haired girl in an apron',
  'man in a work coat',
  'young woman, cream frock',
  'old man in a green cap',
  'old woman',
  'old man in white and gold',
  'grey-haired man in a brown coat',
  'white-haired woman in an apron',
  'man in a plaid waistcoat',
  'farmer in a straw hat',
  'woman in an orange headscarf',
  'woman in a brown work coat',
  'oswin — bearded, sleeves rolled up',
  'marta — headband and apron',
  'coinweigher — goggles pushed up',
];

export const RTP_FOLK_COUNT = RTP_FOLK.length;

/** The three traders, as indices into the same cast their customers come from. */
export const RTP_VENDOR = { oswin: 15, marta: 16, coinweigher: 17 };

/** The indices a shopper may wear — the ordinary townsfolk, and only those. */
export const RTP_CROWD_POOL = Array.from({ length: 15 }, (_, i) => i);

/** True once the crowd atlas has decoded. */
export const hasRtpFolk = () => img.has('folk');

/** How many people are available to draw right now: all of them, or none. */
export const rtpFolkCount = () => (img.has('folk') ? RTP_FOLK_COUNT : 0);

/**
 * `{ south, north, east, west }`, each a four-frame array — the same shape the
 * code-drawn `folkSprites` returns, so the renderer cannot tell them apart.
 */
export function rtpFolkSprites(variant, scale = 1) {
  const src = img.get('folk');
  if (!src) return null;
  const n = RTP_FOLK_COUNT;
  const v = ((variant % n) + n) % n;
  return sprite(`rtp:folk:${v}:${scale}`, () => {
    const bx = (v % FOLK_ATLAS_COLS) * BLOCK_COLS;
    const by = Math.floor(v / FOLK_ATLAS_COLS) * BLOCK_ROWS;
    return cutBlock(src, bx, by, T, T, scale);
  });
}

/** A merchant's walk cycle, by vendor id. Same shape as `rtpFolkSprites`. */
export function rtpVendorSprites(id, scale = 1) {
  const i = RTP_VENDOR[id];
  return i === undefined ? null : rtpFolkSprites(i, scale);
}

/**
 * Cut one person's twelve cells out of a sheet. `bx`/`by` are in cells, not
 * pixels, and the result is padded on top so a sheeted figure and a code-drawn
 * one bottom-align identically.
 */
function cutBlock(src, bx, by, cw, ch, scale) {
  const w = Math.round(cw * scale);
  const h = Math.round((ch + PAD_TOP) * scale);
  const out = {};
  ROW_DIR.forEach((dir, row) => {
    out[dir] = COL_CYCLE.map((col) => {
      const { canvas, ctx } = makeCanvas(w, h);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        src,
        (bx + col) * cw, (by + row) * ch, cw, ch,
        0, Math.round(PAD_TOP * scale), w, Math.round(ch * scale),
      );
      return canvas;
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// The merchants' faces
// ---------------------------------------------------------------------------
// `vendor_faces.png` is three 144px cells cut from People2's face sheet, in
// vendor order. It is a separate atlas from `actor_faces` because it is a
// different sheet, and separate from `folk` because a portrait is not a walk
// cycle — but the indices below are deliberately the SAME order as the walking
// merchants in `folk`, since People2's portraits are index-matched to its
// characters. The face on the shop card is the person standing at the stall.
const VENDOR_FACE = { oswin: 0, marta: 1, coinweigher: 2 };
const VENDOR_FACE_COUNT = 3;

export const hasRtpVendorFaces = () => img.has('vendor_faces');

/**
 * A merchant's portrait, square, at `size` pixels. Null until the atlas has
 * decoded — callers fall back to the code-drawn portrait, which is why a
 * blocked file costs the shop card its photograph and nothing else.
 */
export function rtpVendorFace(id, size = 144) {
  const src = img.get('vendor_faces');
  const i = VENDOR_FACE[id];
  if (!src || i === undefined) return null;
  return sprite(`rtp:vendorface:${id}:${size}`, () => cut(
    src, i * FACE, 0, FACE, FACE, size, size,
  ));
}

// ---------------------------------------------------------------------------
// The player's characters
// ---------------------------------------------------------------------------
// `actors.png` is the party sheet, copied whole because all eight are usable —
// eight adventurers in a stock 12x8 grid — and `actor_faces.png` holds the
// matching portraits in the same order. Which hero wears which block is decided
// in `art/hero.js`, next to the rest of what a hero is; this only knows how to
// cut them out.
export const RTP_ACTOR_COUNT = ACTOR_BLOCKS;

export const hasRtpActors = () => img.has('actors');
export const hasRtpFaces = () => img.has('actor_faces');

/** One adventurer's four-direction walk cycle, or null if nothing decoded. */
export function rtpActorSprites(block, scale = 1) {
  const src = img.get('actors');
  if (!src) return null;
  const b = ((block % ACTOR_BLOCKS) + ACTOR_BLOCKS) % ACTOR_BLOCKS;
  return sprite(`rtp:actor:${b}:${scale}`, () => cutBlock(
    src,
    (b % 4) * BLOCK_COLS, Math.floor(b / 4) * BLOCK_ROWS,
    src.width / ACTOR_COLS, src.height / ACTOR_ROWS, scale,
  ));
}

/** The matching portrait, square, at `size` pixels. */
export function rtpActorFace(block, size = 144) {
  const src = img.get('actor_faces');
  if (!src) return null;
  const b = ((block % ACTOR_BLOCKS) + ACTOR_BLOCKS) % ACTOR_BLOCKS;
  return sprite(`rtp:actorface:${b}:${size}`, () => cut(
    src, (b % 4) * FACE, Math.floor(b / 4) * FACE, FACE, FACE, size, size,
  ));
}
