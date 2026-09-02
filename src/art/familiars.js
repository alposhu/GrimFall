// ---------------------------------------------------------------------------
// familiars.js — the four budgies that fly with you.
//
// The source art is four 64x64 spritesheets, and the useful thing about them is
// that all four are palette swaps of one drawing: the same 420 opaque pixels in
// the same places, recoloured. So this holds ONE flight cycle and four
// palettes, which is how the rest of the game's art already works — see
// `hero.js`, where every character shares a body map and differs by palette.
//
// Frames are the four-step flap from the first column of the sheet, trimmed to
// their common bounding box (16x15). The bird faces east; west is the same
// canvas flipped, so nothing is drawn twice.
//
// Palette keys, consistent across all four variants:
//   1 body      2 body shade    3 cap/crown    4 wing light
//   5 wing shade  6 face/highlight  o outline+eye  k beak
// ---------------------------------------------------------------------------

import { rasterize, sprite, flipX, makeCanvas } from './pixel.js';

const m = (s) => s.split('/');

/** The flap, east-facing. Four frames, 16x15. */
const FLIGHT = [
  m('................/55555.........../45455555..3334../.55446644333546./..4522164435oo6./..5442116455oo6k/...554211665444./....45421111544./.....5541111112./......11111112../.....111111112../....111122222.../...12222.oo...../..12............/12..............'),
  m('................/..........3334../.........333546./.........335oo6./.........355oo6k/........1665444./........4666544./.......4o66o112./......14666612../.....1544o6112../....15o544222.../...155555oo...../..12............/12............../................'),
  m('................/..........3334../.........333546./.........335oo6./.........355oo6k/........66o5444./........6666544./.......16666612./......114o6o12../.....111446442../....111155455.../...12222.o5o5.../..12......55..../12.........5..../................'),
  m('..555.........../..45455........./..5555555.3334../...454665533546./...542114435oo6./....54216445oo6k/....45421645444./.....5421661544./......541111112./......11111112../.....111111112../....111122222.../...12222.oo...../..12............/12..............'),
];

export const BUDGIE_FRAMES = FLIGHT.length;

/**
 * The four birds. Colours are lifted straight off the source sheets, so a
 * budgie in the game is the same bird as the one in the file.
 *
 * `trail` is the colour its magic reads as — the lightning, the shockwave, the
 * fire, the reaping — and it is deliberately not the body colour, because a
 * pale bird still needs a visible effect.
 */
// An evolved bird is the same bird lit differently — brighter body, hotter
// crown. That matters more than it sounds: it means an evolution is legible in
// the field at a glance, not only on the card that announced it.
export const BUDGIES = {
  // Lightning. The blue one, with the darker blue crown.
  storm: {
    name: 'Storm Budgie',
    pal:    { 1: '#67c7d3', 2: '#40a0aa', 3: '#678ed3', 4: '#cdc6bc', 5: '#a99d9f', 6: '#fff6ec', k: '#ff8f20', o: '#0d0a14' },
    palEvo: { 1: '#b8f0ff', 2: '#67c7d3', 3: '#ffffff', 4: '#e8f6ff', 5: '#9ad4ff', 6: '#ffffff', k: '#ffd75e', o: '#0d0a14' },
    trail: '#9ad4ff', glow: '#e8f6ff',
  },
  // Shockwaves. Blue body, yellow crown.
  chime: {
    name: 'Chime Budgie',
    pal:    { 1: '#78cce2', 2: '#5cb3ca', 3: '#ffe168', 4: '#cdc6bc', 5: '#a99d9f', 6: '#fff6ec', k: '#ffb368', o: '#0d0a14' },
    palEvo: { 1: '#c9f2ff', 2: '#78cce2', 3: '#fff3c4', 4: '#e8e6f2', 5: '#c9d2e0', 6: '#ffffff', k: '#ffd75e', o: '#0d0a14' },
    trail: '#8fe6ff', glow: '#ffe168',
  },
  // Fire. Yellow body, green crown and wings.
  ember: {
    name: 'Ember Budgie',
    pal:    { 1: '#efee2b', 2: '#d8d607', 3: '#5eb921', 4: '#a4eb54', 5: '#80d04a', 6: '#cfff98', k: '#ffb921', o: '#0d0a14' },
    palEvo: { 1: '#ff9a3c', 2: '#e0402c', 3: '#ffe86a', 4: '#ffd75e', 5: '#c2431a', 6: '#fff3c4', k: '#ffffff', o: '#0d0a14' },
    trail: '#ff8a2a', glow: '#ffd75e',
  },
  // The reaper. White, and it is the only one that leaves your side.
  wraith: {
    name: 'Wraith Budgie',
    pal:    { 1: '#fff6ec', 2: '#cdc6bc', 3: '#fff6ec', 4: '#cdc6bc', 5: '#a99d9f', 6: '#fff6ec', k: '#ffe747', o: '#0d0a14' },
    palEvo: { 1: '#ffffff', 2: '#c9a8ff', 3: '#e8dcff', 4: '#dfe6f2', 5: '#b76bff', 6: '#ffffff', k: '#c9f2ff', o: '#0d0a14' },
    trail: '#dfe6f2', glow: '#ffffff',
  },
};

export const BUDGIE_IDS = Object.keys(BUDGIES);

const paletteFor = (def, evolved) => (evolved && def.palEvo) || def.pal;

/**
 * One frame of one bird.
 * @param {string} id       a key of BUDGIES
 * @param {number} frame    0..3, wrapped
 * @param {number} scale    integer pixel scale
 * @param {boolean} west    true to face the other way
 * @param {boolean} evolved use the brighter palette
 */
export function budgieSprite(id, frame = 0, scale = 2, west = false, evolved = false) {
  const def = BUDGIES[id] || BUDGIES.storm;
  const f = ((frame % BUDGIE_FRAMES) + BUDGIE_FRAMES) % BUDGIE_FRAMES;
  const tag = `${id}:${f}:${scale}:${west ? 'w' : 'e'}:${evolved ? 'x' : 'b'}`;
  return sprite(`budgie:${tag}`, () => {
    const east = rasterize(FLIGHT[f], { scale, palette: paletteFor(def, evolved) });
    return west ? flipX(east) : east;
  });
}

/**
 * The bird as a weapon icon.
 *
 * Weapon icons elsewhere are 10x10 maps, so this pads the 16x15 bird into the
 * same 10*scale square the rest of the icon set occupies. Without that the
 * budgies would sit a third larger than every other card in the level-up
 * screen, which reads as a mistake rather than as emphasis.
 */
export function budgieIcon(id, evolved = false, scale = 3) {
  return sprite(`budgieicon:${id}:${evolved ? 'x' : 'b'}:${scale}`, () => {
    const box = 10 * scale;
    const inner = Math.max(1, Math.round((box * 0.94) / 16));
    const bird = budgieSprite(id, 0, inner, false, evolved);
    const { canvas, ctx } = makeCanvas(box, box);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bird, Math.round((box - bird.width) / 2), Math.round((box - bird.height) / 2));
    return canvas;
  });
}

/** The still frame used for menus and cards. */
export const budgiePortrait = (id, scale = 4, evolved = false) =>
  budgieSprite(id, 1, scale, false, evolved);
