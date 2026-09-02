// ---------------------------------------------------------------------------
// hero.js — the playable characters.
//
// One shared 16x18 body is authored as pixel maps (front and back are written
// as an 8px half and mirrored); each character is that body re-coloured, so a
// new hero costs a palette, not a spritesheet.
// ---------------------------------------------------------------------------

import { rasterize, mirror, flipX, sprite } from './pixel.js';
import { hasSheet, hasFace, sheetSprites, sheetFace } from './sheets.js';
import { rtpActorSprites, rtpActorFace } from './rtp.js';

// Which block of the RPG Maker party sheet each hero wears.
//
// Ada and Leon are deliberately absent: they are the owner's own drawings and
// go through `sheets.js` instead. Everyone else was a code-drawn placeholder,
// and the placeholders are what these replace. The code-drawn bodies stay as
// the fallback for when the sheet has not decoded — offline, a blocked file,
// the first frames of boot, and every test, since Node decodes no images.
const ACTOR_BLOCK = {
  frostwarden: 0,   // blue-haired, which is the whole character
  warden: 1,        // the one in the helm
  pyromancer: 4,    // green crest, red scarf
  ranger: 6,        // green cloak
  revenant: 7,      // grey and grim
};

// Palette keys used by the hero maps:
//   1 tunic   2 tunic dark   3 trim   h hair   H hair light   s skin   S skin shade
//   l belt    L boot         o outline

const FRONT_BODY = mirror([
  '....oooo',
  '..oohhhh',
  '.ohhhhhh',
  '.ohhssss',
  '.ohsssss',
  '.ohsosss',
  '.ohsssss',
  '..oSssss',
  '...ooSss',
  '...o1111',
  '..os1111',
  '..os1331',
  '..os1331',
  '...o1111',
  '...ollll',
]);

const BACK_BODY = mirror([
  '....oooo',
  '..oohhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '..oHhhhh',
  '...oohhh',
  '...o1111',
  '..os1111',
  '..os1111',
  '..os1111',
  '...o1111',
  '...ollll',
]);

const SIDE_BODY = [
  '.....oooooo.....',
  '....ohhhhhhoo...',
  '...ohhhhhhhsso..',
  '...ohhhhsssso...',
  '...ohhhsossso...',
  '...ohhhssssso...',
  '....ohhSsssso...',
  '.....ooSsso.....',
  '.....o1111o.....',
  '....o111111o....',
  '...o11133111o...',
  '...os1133111o...',
  '...os1111111o...',
  '....o111111o....',
  '....ollllllo....',
];

// Leg poses. The walk cycle is stand -> apart -> stand -> together.
const LEGS_FRONT = {
  stand:    ['...o22222222o...', '...o22o..o22o...', '...oLLo..oLLo...'],
  apart:    ['...o22222222o...', '..o22o....o22o..', '..oLLo....oLLo..'],
  together: ['...o22222222o...', '....o22oo22o....', '....oLLooLLo....'],
};

const LEGS_SIDE = {
  stand:    ['....o222222o....', '.....o2222o.....', '....oLLLLLLo....'],
  apart:    ['....o222222o....', '...o222o22o.....', '...oLLo..oLLo...'],
  together: ['....o222222o....', '.....o2222o.....', '.....oLLLLo.....'],
};

const WALK_CYCLE = ['stand', 'apart', 'stand', 'together'];

/**
 * The shared body, exported so the market crowd can build on it rather than
 * duplicating it. `folk.js` adds its own silhouettes alongside these.
 */
export const SHARED = {
  front: FRONT_BODY, back: BACK_BODY, side: SIDE_BODY,
  legsFront: LEGS_FRONT, legsSide: LEGS_SIDE, cycle: WALK_CYCLE,
};

// ---------------------------------------------------------------------------
// Silhouette overrides
//
// Five of the heroes share the body above and differ only by palette. Two do
// not: Ada's bob hangs past the jaw and Leon's jacket has a fur collar across
// the shoulders, and neither reads as itself without the shape. A character may
// therefore supply its own upper body; the legs stay shared so the walk cycle
// lines up.
// ---------------------------------------------------------------------------
const ADA_FRONT = mirror([
  '....oooo',
  '..oohhhh',
  '.ohhhhhh',
  '.ohhssss',
  '.ohsssss',
  '.ohsosss',
  '.ohsssss',
  '.ohhSsss',       // the bob keeps its width down beside the jaw
  '..ohoSss',
  '...o1111',
  '..os1111',
  '..os1331',
  '..os1131',
  '...o1111',
  '...o1111',       // a skirt hem, not a belt
]);

const ADA_BACK = mirror([
  '....oooo',
  '..oohhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhHhhh',
  '..ohohhh',
  '...o1111',
  '..os1111',
  '..os1111',
  '..os1111',
  '...o1111',
  '...o1111',
]);

const ADA_SIDE = [
  '.....oooooo.....',
  '....ohhhhhhoo...',
  '...ohhhhhhhsso..',
  '...ohhhhsssso...',
  '...ohhhsossso...',
  '...ohhhssssso...',
  '...ohhhSsssso...',
  '...ohhooSsso....',
  '.....o1111o.....',
  '....o111111o....',
  '...o11133111o...',
  '...os1133111o...',
  '...os1111111o...',
  '....o111111o....',
  '....o111111o....',
];

const LEON_FRONT = mirror([
  '....oooo',
  '..oohhhh',
  '.ohhhhhh',
  '.ohhssss',
  '.ohsssss',
  '.ohsosss',
  '.ohsssss',
  '..oSssss',
  '..o33Sss',       // fur collar sitting proud of the shoulder
  '..o31111',
  '..os1111',
  '..os1111',
  '..os1221',
  '...o1111',
  '...ollll',
]);

const LEON_BACK = mirror([
  '....oooo',
  '..oohhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '..oHhhhh',
  '..o33hhh',
  '..o31111',
  '..os1111',
  '..os1111',
  '..os1111',
  '...o1111',
  '...ollll',
]);

const LEON_SIDE = [
  '.....oooooo.....',
  '....ohhhhhhoo...',
  '...ohhhhhhhsso..',
  '...ohhhhsssso...',
  '...ohhhsossso...',
  '...ohhhssssso...',
  '....ohhSsssso...',
  '.....ooSsso.....',
  '....o333333o....',
  '....o111111o....',
  '...o11122111o...',
  '...os1122111o...',
  '...os1111111o...',
  '....o111111o....',
  '....ollllllo....',
];

const BODIES = {
  ada: { front: ADA_FRONT, back: ADA_BACK, side: ADA_SIDE },
  leon: { front: LEON_FRONT, back: LEON_BACK, side: LEON_SIDE },
};

const bodyFor = (id) => BODIES[id] || { front: FRONT_BODY, back: BACK_BODY, side: SIDE_BODY };

/** Roster. `unlock` is the gold price; 0 means available from the start. */
export const CHARACTERS = [
  {
    id: 'ranger', name: 'Ranger', title: 'Swift and steady',
    weapon: 'bolt', unlock: 0,
    blurb: 'A dependable start. Extra move speed and a faster opening weapon.',
    stats: { hp: 100, speed: 118, might: 1.0, cooldown: 0.94, magnet: 1.15, armor: 0, luck: 1.0 },
    palette: { 1: '#3f7d4a', 2: '#2a5533', 3: '#d9c07a', h: '#6b4326', H: '#96683a', l: '#6b4a25', L: '#3a2b18' },
  },
  {
    id: 'warden', name: 'Warden', title: 'Holds the line',
    weapon: 'slash', unlock: 350,
    blurb: 'Plated and stubborn. More health and armour, a little slower.',
    stats: { hp: 145, speed: 104, might: 1.05, cooldown: 1.0, magnet: 1.0, armor: 2, luck: 1.0 },
    palette: { 1: '#8b93a8', 2: '#5a6274', 3: '#e2e7f2', h: '#c9c4b6', H: '#efe9dc', l: '#4a4f5c', L: '#2b2f38' },
  },
  {
    id: 'pyromancer', name: 'Pyromancer', title: 'Burns twice as bright',
    weapon: 'firebomb', unlock: 900,
    blurb: 'Glass cannon. Big damage, thin skin — do not get surrounded.',
    stats: { hp: 82, speed: 112, might: 1.25, cooldown: 0.92, magnet: 1.0, armor: 0, luck: 1.0 },
    palette: { 1: '#c2431a', 2: '#8a2a12', 3: '#ffb648', h: '#2b1a1a', H: '#5a3226', l: '#7a3a1a', L: '#40200f' },
  },
  {
    id: 'frostwarden', name: 'Frostwarden', title: 'Everything slows',
    weapon: 'nova', unlock: 1600,
    blurb: 'Crowd control specialist. Her chill lingers on everything she hits.',
    stats: { hp: 105, speed: 110, might: 1.0, cooldown: 0.85, magnet: 1.2, armor: 1, luck: 1.0 },
    palette: { 1: '#3f7fa8', 2: '#27546f', 3: '#c9f2ff', h: '#e6f3ff', H: '#ffffff', l: '#3a5a70', L: '#22384a' },
  },
  {
    id: 'leon', name: 'Leon', title: 'Sees it through',
    weapon: 'lightning', unlock: 1200,
    blurb: 'Unshakeable. Good health, steady damage, and he keeps his footing when he is hit.',
    stats: { hp: 128, speed: 112, might: 1.08, cooldown: 0.96, magnet: 1.05, armor: 1, luck: 1.05, poise: 0.5 },
    palette: { 1: '#2b2f3a', 2: '#1a1d24', 3: '#e8e4d8', h: '#a8823f', H: '#d6b978', l: '#3a3f4a', L: '#20242c' },
  },
  {
    id: 'ada', name: 'Ada', title: 'Never where you swung',
    weapon: 'glaive', unlock: 2400,
    blurb: 'Quick and opportunistic. The fastest hero alive, and the luckiest — if she is still standing.',
    stats: { hp: 84, speed: 128, might: 1.12, cooldown: 0.9, magnet: 1.25, armor: 0, luck: 1.3 },
    palette: { 1: '#c8203c', 2: '#8a1226', 3: '#f2d0d6', h: '#17161c', H: '#3a3a48', l: '#5a1020', L: '#241018' },
  },
  {
    id: 'revenant', name: 'Revenant', title: 'Death is a formality',
    weapon: 'orbit', unlock: 3000,
    blurb: 'Starts fragile but greedier: more luck, more gold, one free revive.',
    stats: { hp: 78, speed: 116, might: 1.1, cooldown: 0.95, magnet: 1.4, armor: 0, luck: 1.35, revives: 1 },
    palette: { 1: '#4b2f70', 2: '#301c4a', 3: '#b76bff', h: '#1a1626', H: '#3b3252', l: '#2c2140', L: '#181026' },
  },
];

export const characterById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

function buildFrames(baseRows, legsSet, palette, scale) {
  return WALK_CYCLE.map((pose) =>
    rasterize([...baseRows, ...legsSet[pose]], { scale, palette })
  );
}

/**
 * Returns { south, north, east, west } where each is a 4-frame array.
 * Frames are cached per character id + scale.
 */
export function heroSprites(charId, scale = 3) {
  // Ada and Leon ship as hand-drawn sheets. If the artwork decoded, it wins;
  // if it did not, the code-drawn version of the same character stands in, so
  // the game looks right either way and nothing has to check first.
  if (hasSheet(charId)) {
    const art = sheetSprites(charId, scale);
    if (art) return art;
  }
  if (ACTOR_BLOCK[charId] !== undefined) {
    const art = rtpActorSprites(ACTOR_BLOCK[charId], scale / 3);
    if (art) return art;
  }
  return sprite(`hero:${charId}:${scale}`, () => {
    const ch = characterById(charId);
    const p = ch.palette;
    const b = bodyFor(charId);
    const south = buildFrames(b.front, LEGS_FRONT, p, scale);
    const north = buildFrames(b.back, LEGS_FRONT, p, scale);
    const east = buildFrames(b.side, LEGS_SIDE, p, scale);
    const west = east.map(flipX);
    return { south, north, east, west };
  });
}

/** A small portrait (front, standing) for menus and the HUD. */
export function heroPortrait(charId, scale = 5) {
  if (hasSheet(charId)) {
    const art = sheetSprites(charId, scale);
    if (art) return art.south[0];
  }
  if (ACTOR_BLOCK[charId] !== undefined) {
    const art = rtpActorSprites(ACTOR_BLOCK[charId], scale / 3);
    if (art) return art.south[0];
  }
  return sprite(`portrait:${charId}:${scale}`, () =>
    rasterize([...bodyFor(charId).front, ...LEGS_FRONT.stand], { scale, palette: characterById(charId).palette })
  );
}

/**
 * A drawn portrait, where one exists. Menus with room for a face use it; the
 * rest fall back to the small standing figure from `heroPortrait`.
 */
export function heroFace(charId, size = 144) {
  if (hasFace(charId)) return sheetFace(charId, size);
  if (ACTOR_BLOCK[charId] !== undefined) return rtpActorFace(ACTOR_BLOCK[charId], size);
  return null;
}

