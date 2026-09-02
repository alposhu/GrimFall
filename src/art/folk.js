// ---------------------------------------------------------------------------
// folk.js — the market crowd.
//
// A crowd of one body in eight colours reads as a crowd of clones the moment
// you stand still and look at it. What sells a market square is *silhouette*
// variety: a hooded figure, a porter with a crate at his waist, somebody in a
// long gown, a stooped elder. You recognise those shapes from across the square
// before you can make out a single colour.
//
// So there are five body types here, each with its own front, back and side
// maps, crossed with palettes chosen to suit the archetype — a porter gets
// workwear, a hooded figure gets dyed wool. Legs are shared where they can be
// and replaced with a swaying hem where they cannot.
// ---------------------------------------------------------------------------

import { rasterize, mirror, flipX, sprite } from './pixel.js';
import { SHARED } from './hero.js';

// ---------------------------------------------------------------------------
// Legs
// ---------------------------------------------------------------------------
// A gown or a robe has no visible stride; the hem swings and the feet peek out
// from under it, which is what makes the walk read as a walk at all.
const LEGS_HEM = {
  stand:    ['...o22222222o...', '..o2222222222o..', '..o22oLLLLo22o..'],
  apart:    ['...o22222222o...', '.o222222222222o.', '.o22oLL..LLo22o.'],
  together: ['...o22222222o...', '..o2222222222o..', '...o22oLLo22o...'],
};

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------
// Palette keys, as elsewhere:
//   1 garment   2 garment dark   3 trim   h hair   H hair light
//   s skin      S skin shade     l belt   L boot   c carried   C carried light
//   w whiskers  o outline
const HOODED_FRONT = mirror([
  '....oooo',
  '..oo1111',
  '.o111111',
  '.o11ssss',       // the cowl overhangs the face
  '.o1sssss',
  '.o1sosss',
  '.o1sssss',
  '..o11sss',
  '...o1111',
  '...o1111',
  '..os1111',
  '..os1331',
  '..os1331',
  '...o1111',
  '...o1111',
]);

const HOODED_BACK = mirror([
  '....oooo',
  '..oo1111',
  '.o111111',
  '.o111111',
  '.o111111',
  '.o111111',
  '.o111111',
  '..o11111',
  '...o1111',
  '...o1111',
  '..os1111',
  '..os1111',
  '..os1111',
  '...o1111',
  '...o1111',
]);

const HOODED_SIDE = [
  '.....oooooo.....',
  '....o111111oo...',
  '...o1111111sso..',
  '...o1111sssso...',
  '...o111sossso...',
  '...o111ssssso...',
  '....o11Ssssso...',
  '.....o11ss1o....',
  '.....o1111o.....',
  '....o111111o....',
  '...o11133111o...',
  '...os1133111o...',
  '...os1111111o...',
  '....o111111o....',
  '....o111111o....',
];

const PORTER_FRONT = mirror([
  '....oooo',
  '..oohhhh',
  '.ohhhhhh',
  '.ohhssss',
  '.ohsssss',
  '.ohsosss',
  '.ohsssss',
  '..oSssss',
  '.ooo1111',       // shoulders set wider than a commoner's
  'os111111',
  'os111111',
  'occccccc',       // a crate carried at the waist
  'occCCCCc',
  'occccccc',
  '...ollll',
]);

const PORTER_BACK = mirror([
  '....oooo',
  '..oohhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '..oHhhhh',
  '.ooo1111',
  'os111111',
  'os111111',
  'os111111',
  'occccccc',       // the crate showing round his sides
  'occccccc',
  '...ollll',
]);

const PORTER_SIDE = [
  '.....oooooo.....',
  '....ohhhhhhoo...',
  '...ohhhhhhhsso..',
  '...ohhhhsssso...',
  '...ohhhsossso...',
  '...ohhhssssso...',
  '....ohhSsssso...',
  '.....ooSsso.....',
  '....o1111ooo....',
  '...o111111cco...',
  '...o111111cco...',
  '...os11111cco...',
  '...os111111o....',
  '....o111111o....',
  '....ollllllo....',
];

const GOWN_FRONT = mirror([
  '....oooo',
  '..oohhhh',
  '.ohhhhhh',
  '.ohhssss',
  '.ohsssss',
  '.ohsosss',
  '.ohsssss',
  '.ohhSsss',
  '..ohoSss',
  '...o1111',
  '..os1111',
  '..os1331',
  '...o1111',
  '..o11111',       // the gown widens towards the hem
  '.o111111',
]);

const GOWN_BACK = mirror([
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
  '...o1111',
  '..o11111',
  '.o111111',
]);

const GOWN_SIDE = [
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
  '...o11111111o...',
  '..o1111111111o..',
];

const ELDER_FRONT = mirror([
  '....oooo',
  '..oohhhh',
  '.ohhhhhh',
  '.ohhssss',
  '.ohsssss',
  '.ohsosss',
  '.ohwwsss',       // whiskers
  '..owwwss',
  '...o1111',
  '..os1111',
  '..os1111',
  '..os1331',
  '...o1111',
  '...o1111',
  '...ollll',
]);

const ELDER_BACK = mirror([
  '....oooo',
  '..oohhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '.ohhhhhh',
  '..oHhhhh',
  '...o1111',
  '..os1111',
  '..os1111',
  '..os1111',
  '...o1111',
  '...o1111',
  '...ollll',
]);

// Stooped, and leaning on a stick that plants beside him.
const ELDER_SIDE = [
  '.....oooooo.....',
  '....ohhhhhhoo...',
  '...ohhhhhhhsso..',
  '...ohhhhsssso...',
  '...ohhhsossso...',
  '...ohhwwwssso...',
  '....owwwwsso....',
  '.....ooSsso.....',
  '.....o1111oo3...',
  '....o111111o3...',
  '...o11111111o3..',
  '...os1111111o3..',
  '...os111111o.3..',
  '....o111111o.3..',
  '....ollllllo.3..',
];

const BODIES = {
  commoner: { front: SHARED.front, back: SHARED.back, side: SHARED.side, legs: SHARED.legsFront, legsSide: SHARED.legsSide },
  hooded:   { front: HOODED_FRONT, back: HOODED_BACK, side: HOODED_SIDE, legs: LEGS_HEM, legsSide: LEGS_HEM },
  porter:   { front: PORTER_FRONT, back: PORTER_BACK, side: PORTER_SIDE, legs: SHARED.legsFront, legsSide: SHARED.legsSide },
  gown:     { front: GOWN_FRONT,   back: GOWN_BACK,   side: GOWN_SIDE,   legs: LEGS_HEM, legsSide: LEGS_HEM },
  elder:    { front: ELDER_FRONT,  back: ELDER_BACK,  side: ELDER_SIDE,  legs: SHARED.legsFront, legsSide: SHARED.legsSide },
};

export const FOLK_BODIES = Object.keys(BODIES);

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------
// Grouped by archetype so a porter never turns up in court silks. `c` is the
// carried crate, `w` the whiskers, `3` the stick — unused keys cost nothing.
const PALETTES = {
  commoner: [
    { 1: '#6b5433', 2: '#4a3a22', 3: '#c9a45c', h: '#3b2a18', H: '#5f4527', l: '#4a3a22', L: '#2b2016' },
    { 1: '#4a5a6b', 2: '#33404d', 3: '#9fb4c9', h: '#6b6b6b', H: '#9a9a9a', l: '#333d47', L: '#1f262d' },
    { 1: '#7a3f4a', 2: '#552a33', 3: '#d99a9a', h: '#2b1a1a', H: '#4a2f2f', l: '#552a33', L: '#301a1e' },
    { 1: '#3f6b4a', 2: '#2a4a33', 3: '#a8cf9a', h: '#4a3a18', H: '#6f5827', l: '#2a4a33', L: '#1b2f21' },
    { 1: '#8a6a3a', 2: '#5f4826', 3: '#f0d9a4', h: '#7a2a12', H: '#a8451f', l: '#5f4826', L: '#382a16' },
  ],
  hooded: [
    { 1: '#4b3a63', 2: '#2f2440', 3: '#b76bff', h: '#241c2e', H: '#443859', l: '#2f2440', L: '#1c1526' },
    { 1: '#3a4f5a', 2: '#26363f', 3: '#8fc4d8', h: '#1f1a14', H: '#3d3225', l: '#26363f', L: '#161f25' },
    { 1: '#5a3a2a', 2: '#3d271c', 3: '#c9a45c', h: '#2b1a1a', H: '#4a2f2f', l: '#3d271c', L: '#241610' },
    { 1: '#2f3f2a', 2: '#1f2a1b', 3: '#7fa05a', h: '#1a1a14', H: '#33332a', l: '#1f2a1b', L: '#141a10' },
  ],
  porter: [
    { 1: '#7a6a4a', 2: '#544733', 3: '#c9b78c', h: '#3b2a18', H: '#5f4527', l: '#3f3524', L: '#2b2016', c: '#7a5334', C: '#96683a' },
    { 1: '#5a5f6b', 2: '#3d4149', 3: '#a8aeba', h: '#4a3218', H: '#6b4a25', l: '#33373d', L: '#1f2227', c: '#6b4a25', C: '#8a6234' },
    { 1: '#6b4a3a', 2: '#4a3227', 3: '#c98d5a', h: '#2b2f38', H: '#4a4f5c', l: '#4a3227', L: '#2b1a12', c: '#5a3a22', C: '#7a5334' },
  ],
  gown: [
    { 1: '#7a3f6b', 2: '#552a4a', 3: '#e0a8d0', h: '#3b2a18', H: '#5f4527', l: '#552a4a', L: '#301a28' },
    { 1: '#3f5a7a', 2: '#2a3d55', 3: '#a8c4e0', h: '#6b4326', H: '#96683a', l: '#2a3d55', L: '#1a2733' },
    { 1: '#8a7a3a', 2: '#5f5426', 3: '#f0e2a4', h: '#2b1a1a', H: '#4a2f2f', l: '#5f5426', L: '#382f16' },
    { 1: '#5a3a4a', 2: '#3d2733', 3: '#c98da8', h: '#d8d2c0', H: '#f4f0e2', l: '#3d2733', L: '#241620' },
  ],
  elder: [
    { 1: '#5a5450', 2: '#3d3936', 3: '#8a8580', h: '#d8d2c0', H: '#f4f0e2', w: '#e8e4dc', l: '#3d3936', L: '#242220' },
    { 1: '#4a4055', 2: '#332b3a', 3: '#8a7a9a', h: '#c0bcc8', H: '#e2dee8', w: '#d8d4e0', l: '#332b3a', L: '#1f1a24' },
    { 1: '#6b5a3a', 2: '#493d27', 3: '#a8946a', h: '#c8c4b0', H: '#e8e4d0', w: '#dcd8c4', l: '#493d27', L: '#2b2416' },
  ],
};

/** Every (body, palette) pair, so callers can index the crowd with one number. */
export const FOLK_VARIANTS = [];
for (const body of FOLK_BODIES) {
  for (let i = 0; i < PALETTES[body].length; i++) FOLK_VARIANTS.push({ body, pal: i });
}
export const FOLK_COUNT = FOLK_VARIANTS.length;

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------
function buildFrames(baseRows, legsSet, palette, scale) {
  return SHARED.cycle.map((pose) => rasterize([...baseRows, ...legsSet[pose]], { scale, palette }));
}

/**
 * A townsperson's walk cycle. `variant` indexes FOLK_VARIANTS, so the caller
 * only ever deals in one number and the pairing stays here.
 */
export function folkSprites(variant, scale = 3) {
  const v = FOLK_VARIANTS[((variant % FOLK_COUNT) + FOLK_COUNT) % FOLK_COUNT];
  return sprite(`folk:${v.body}:${v.pal}:${scale}`, () => {
    const b = BODIES[v.body];
    const p = PALETTES[v.body][v.pal];
    const south = buildFrames(b.front, b.legs, p, scale);
    const north = buildFrames(b.back, b.legs, p, scale);
    const east = buildFrames(b.side, b.legsSide, p, scale);
    const west = east.map(flipX);
    return { south, north, east, west };
  });
}

export const folkBodyOf = (variant) => FOLK_VARIANTS[((variant % FOLK_COUNT) + FOLK_COUNT) % FOLK_COUNT].body;

// A real market square is mostly ordinary people, with the odd hooded stranger
// and the occasional porter shouldering through. Rolling the variant table flat
// would give a crowd that is two-fifths porters — which looks like a loading
// dock, and (since a porter on an errand does not stop to gossip) leaves the
// square oddly silent.
const WEIGHT = { commoner: 5, gown: 2.6, hooded: 2, elder: 1.9, porter: 1.1 };

/** Pick a townsperson, weighted by how common that sort of person is. */
export function pickFolkVariant(rng) {
  const total = FOLK_BODIES.reduce((sum, b) => sum + (WEIGHT[b] || 1), 0);
  let r = rng() * total;
  let body = FOLK_BODIES[0];
  for (const b of FOLK_BODIES) {
    r -= WEIGHT[b] || 1;
    if (r <= 0) { body = b; break; }
  }
  const pal = (rng() * PALETTES[body].length) | 0;
  const i = FOLK_VARIANTS.findIndex((v) => v.body === body && v.pal === pal);
  return i < 0 ? 0 : i;
}
