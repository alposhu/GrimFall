// ---------------------------------------------------------------------------
// sheets.js — hand-drawn character sheets.
//
// Every other sprite in this game is generated from pixel maps at boot. Ada and
// Leon are the exception: they are the project owner's own hand-drawn art,
// supplied as sheets (see img/chr_/SOURCE.txt), so they are loaded and sliced
// rather than drawn in code.
//
// The sheets use the layout the owner's editor saved them in: a 12x8 grid of
// cells with one character in the top-left block — three walk frames across,
// four facings down, in the order down, left, right, up. A separate sheet holds
// a 144px portrait.
//
// Loading is asynchronous and the rest of the game is not, so the boot awaits
// `preloadHeroSheets()` and everything afterwards slices synchronously from the
// decoded image. If a sheet is missing or blocked — offline, a bad path, a
// file:// origin — nothing here throws: `hasSheet` stays false and the caller
// falls back to the code-drawn version of the same character.
// ---------------------------------------------------------------------------

import { makeCanvas, sprite } from './pixel.js';

/** Characters that ship as artwork instead of pixel maps. */
export const SHEET_HEROES = ['ada', 'leon'];

const CELL = 48;                 // one walk frame
const SHEET_COLS = 12;           // the grid the sheets are saved in
const SHEET_ROWS = 8;
const FACE = 144;

// The sheet's rows, in the order they are stored.
const ROW_DIR = ['south', 'west', 'east', 'north'];
// Our four-frame cycle is stand-step-stand-step; the sheet's middle column is
// the standing pose, so the cycle reads columns 1, 2, 1, 0.
const COL_CYCLE = [1, 2, 1, 0];

// The code-drawn heroes are 18 rows at scale 3, so 54px tall, and the renderer
// bottom-aligns them. A sheet cell is 48px with the feet flush to its base, so
// padding six transparent pixels on top makes the two interchangeable and no
// drawing code has to know which kind of sprite it received.
const PAD_TOP = 6;
const FRAME_H = CELL + PAD_TOP;

const loaded = new Map();        // `${id}:${kind}` -> HTMLImageElement

const sheetUrl = (id, kind) =>
  new URL(`../../img/chr_/${id}/${id}_${kind}.png`, import.meta.url).href;

// A request that never settles would leave the player staring at the boot bar
// forever, so decoding is given a deadline as well as an error handler. Six
// seconds is far longer than a local file needs and short enough that a hung
// connection costs a hero's artwork rather than the whole game.
const LOAD_TIMEOUT = 6000;

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

    const img = new Image();
    img.onload = () => finish(img.naturalWidth ? img : null);
    img.onerror = () => finish(null);           // a missing sheet is not fatal
    img.decoding = 'async';
    img.src = url;

    // Some environments hand back an already-complete image synchronously.
    if (img.complete && img.naturalWidth) finish(img);
  });
}

/**
 * Decode every hand-drawn sheet. Always resolves — a character whose art fails
 * to load simply keeps its code-drawn form.
 */
export async function preloadHeroSheets(ids = SHEET_HEROES) {
  const jobs = [];
  for (const id of ids) {
    for (const kind of ['walking', 'face']) {
      jobs.push(loadImage(sheetUrl(id, kind)).then((img) => {
        if (img) loaded.set(`${id}:${kind}`, img);
      }));
    }
  }
  try {
    await Promise.all(jobs);
  } catch (e) {
    /* one bad sheet must not stop the boot */
  }
  return SHEET_HEROES.filter(hasSheet);
}

/** True once this character's walk sheet is decoded and ready to slice. */
export const hasSheet = (id) => loaded.has(`${id}:walking`);
export const hasFace = (id) => loaded.has(`${id}:face`);

/** Which characters actually loaded — used by the boot log and the tests. */
export const loadedSheets = () => SHEET_HEROES.filter(hasSheet);

// ---------------------------------------------------------------------------
// Slicing
// ---------------------------------------------------------------------------
function cutFrame(img, col, row, scale) {
  // Sheets are authored at a fixed cell size, but a caller may ask for the
  // sprite at a different scale than the code-drawn heroes use.
  const k = scale / 3;
  const w = Math.round(CELL * k);
  const h = Math.round(FRAME_H * k);
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingEnabled = false;
  const cw = img.width / SHEET_COLS;
  const ch = img.height / SHEET_ROWS;
  ctx.drawImage(
    img,
    col * cw, row * ch, cw, ch,
    0, Math.round(PAD_TOP * k), w, Math.round(CELL * k)
  );
  return canvas;
}

/**
 * `{ south, north, east, west }`, each a four-frame array — the same shape
 * `heroSprites` returns for a code-drawn character.
 */
export function sheetSprites(id, scale = 3) {
  return sprite(`sheet:${id}:${scale}`, () => {
    const img = loaded.get(`${id}:walking`);
    if (!img) return null;
    const out = {};
    ROW_DIR.forEach((dir, row) => {
      out[dir] = COL_CYCLE.map((col) => cutFrame(img, col, row, scale));
    });
    return out;
  });
}

/** The standing south-facing frame, for menus that want a small figure. */
export function sheetStanding(id, scale = 3) {
  const set = sheetSprites(id, scale);
  return set ? set.south[0] : null;
}

/** The drawn portrait, trimmed to its opaque bounds so menus can crop it. */
export function sheetFace(id, size = 144) {
  return sprite(`sheetface:${id}:${size}`, () => {
    const img = loaded.get(`${id}:face`);
    if (!img) return null;
    const { canvas, ctx } = makeCanvas(size, size);
    const src = Math.min(FACE, img.width, img.height);
    ctx.drawImage(img, 0, 0, src, src, 0, 0, size, size);
    return canvas;
  });
}
