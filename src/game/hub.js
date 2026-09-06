// ---------------------------------------------------------------------------
// hub.js — the Hearthhall: the inn a co-op party stands in.
//
// Reached from Play Together and nowhere else. It is not a place on the menu;
// it is what a lobby looks like once you are in one.
//
// HOW A BIG HALL IS ACTUALLY LAID OUT, AND WHY IT MATTERS HERE.
//
// The first version of this room was furniture scattered on a floor, and it
// read as furniture scattered on a floor. Real halls are legible, and they are
// legible for reasons worth copying rather than guessing at:
//
//   It is LONG, and it has two ends. The high end has the dais, the great
//       fireplace and the table that runs crosswise; the low end has the door.
//       You can tell which way you are facing from anywhere in the room,
//       because the furniture tells you.
//
//   A SCREENS PASSAGE at the low end. A partition across the hall with two
//       doorways in it, keeping the draught of the front door out of the room.
//       It is the most characteristic thing about a hall of this kind and it
//       costs one wall and two gaps.
//
//   POSTS down the length, at a rhythm. This is what makes a room read as
//       architecture rather than as a field with things on it — the eye picks
//       up the repeat and measures the hall by it. Drawn in code
//       (src/art/inn.js) rather than tiled, because they answer to the layout.
//
//   Tables in BLOCKS with a clear aisle. Benched trestles down both sides, an
//       aisle up the middle, and the high table across the top.
//
//   The service rooms are OFF the hall, not in it. Kitchen, bar, market, snug
//       and the stair each open through a door in a real wall.
//
// And the last of it is light. The lighting pass in hubRender.js is the single
// biggest reason this reads as an interior at night rather than as a floor
// plan: warm pools under the fires and the lanterns, dark between them.
//
// HOW IT IS BUILT.
//
// Declared. Rooms are rectangles, walls are derived from the same declaration
// that makes them solid, carpets are laid as a nine-slice so the drawn border
// lands on the border, and the whole thing becomes tile grids once.
//
// Furniture is RPG Maker MZ material through the pipeline the Long Market uses
// (img/rtp/SOURCE.txt). Structure — posts, the door, the lanterns — is drawn in
// code. Everything falls back to flat colour if the atlas is missing.
// ---------------------------------------------------------------------------

import { clamp, makeRng } from '../core/util.js';

export const TILE = 48;

const WALK_SPEED = 168;
const BODY_R = 13;
const FOLK_SPEED = 46;
const FOLK_R = 11;

export const MATERIALS = [
  'grass', 'moss', 'dirt', 'sand', 'road', 'cobble', 'brick', 'clay', 'slab', 'dark',
  'plank', 'board', 'flag', 'hearthstone', 'rug_gold', 'rug_blue', 'rug_red',
  'wall', 'wall_dark',
  'oak', 'parquet', 'kitchen', 'marble',
  'carpet_tl', 'carpet_t', 'carpet_tr', 'carpet_l', 'carpet_c', 'carpet_r',
  'carpet_bl', 'carpet_b', 'carpet_br',
  'rugblue_tl', 'rugblue_t', 'rugblue_tr', 'rugblue_l', 'rugblue_c', 'rugblue_r',
  'rugblue_bl', 'rugblue_b', 'rugblue_br',
  'walltop', 'wallhigh', 'walllow',
];
const mat = (name) => Math.max(0, MATERIALS.indexOf(name));

// ---------------------------------------------------------------------------
// The ground floor
// ---------------------------------------------------------------------------
//
// The hall runs north to south. West of it, behind a wall, are the kitchen, the
// bar and the game room; east of it the market, the stair and the snug. The
// high end is north. The door is south, through the screens passage.
const GROUND = {
  id: 'ground',
  w: 52,
  h: 46,
  spawn: { x: 26, y: 39 },
  floor: 'oak',

  rooms: [
    [14, 3, 25, 34, 'oak'],          // the hall itself
    [17, 3, 19, 6, 'marble'],        // the dais, at the high end

    [4, 3, 8, 10, 'kitchen'],        // kitchen, north-west
    [4, 14, 8, 12, 'parquet'],       // the bar
    [4, 28, 8, 12, 'board'],         // the game room

    [41, 3, 8, 14, 'parquet'],       // market row
    [41, 18, 8, 8, 'flag'],          // the stair hall
    [41, 28, 8, 11, 'board'],        // the snug

    [16, 38, 21, 4, 'flag'],         // the vestibule, below the screens

    // Doorways, cut as little rooms straddling the walls. Written down rather
    // than punched afterwards, so a room nobody can enter is a room somebody
    // forgot to give a door — visible in the list, and caught by hub-smoke.
    [12, 7, 2, 2, 'kitchen'],
    [12, 18, 2, 3, 'parquet'],
    [12, 32, 2, 2, 'board'],
    [39, 8, 2, 2, 'parquet'],
    [39, 20, 2, 3, 'flag'],
    [39, 32, 2, 2, 'board'],
    [18, 37, 2, 1, 'flag'],          // the screens passage, west door
    [33, 37, 2, 1, 'flag'],          // and east
  ],

  walls: [],                          // the shell and the gaps do all of it

  carpets: [
    [23, 11, 7, 25, 'carpet'],        // the aisle, door to dais
    [21, 4, 11, 4, 'carpet'],         // under the high table
  ],

  /** Timber posts, drawn in code. Two rows, at a rhythm down the hall. */
  posts: [
    [21, 13], [21, 19], [21, 25], [21, 31],
    [31, 13], [31, 19], [31, 25], [31, 31],
  ],

  /** Wall lanterns. These are what the lighting pass reads. */
  lanterns: [
    [15, 12], [15, 22], [15, 32],
    [37, 12], [37, 22], [37, 32],
    [18, 39], [34, 39],
    [5, 18], [10, 18],
    [42, 8], [47, 8],
    [42, 33], [47, 33],
    [5, 33], [10, 33],
  ],

  /** The way out. The player walks through it; it opens as they go. */
  door: { x: 26, y: 42 },

  fixtures: [
    // --- the high end -----------------------------------------------------
    ['hearth', 26, 5, true],
    ['logs', 23, 6, true], ['logs', 30, 6, true],
    ['candelabra', 21, 5, true], ['candelabra', 32, 5, true],
    ['banner_red', 22, 3, true], ['banner_red', 31, 3, true],
    ['throne', 26, 8, true],
    ['longtable', 22, 7, true], ['longtable', 24, 7, true],
    ['longtable', 28, 7, true], ['longtable', 30, 7, true],
    ['stool_red', 22, 9, true], ['stool_red', 31, 9, true],

    // --- the hall's trestles, in two benched blocks with an aisle ----------
    ['longtable', 15, 13, true], ['longtable', 17, 13, true],
    ['longtable', 15, 19, true], ['longtable', 17, 19, true],
    ['longtable', 15, 25, true], ['longtable', 17, 25, true],
    ['longtable', 15, 31, true], ['longtable', 17, 31, true],
    ['longtable', 34, 13, true], ['longtable', 36, 13, true],
    ['longtable', 34, 19, true], ['longtable', 36, 19, true],
    ['longtable', 34, 25, true], ['longtable', 36, 25, true],
    ['longtable', 34, 31, true], ['longtable', 36, 31, true],
    ['stool', 15, 15, true], ['stool', 18, 15, true],
    ['stool', 15, 21, true], ['stool', 18, 21, true],
    ['stool', 15, 27, true], ['stool', 18, 27, true],
    ['stool', 15, 33, true], ['stool', 18, 33, true],
    ['stool', 34, 15, true], ['stool', 37, 15, true],
    ['stool', 34, 21, true], ['stool', 37, 21, true],
    ['stool', 34, 27, true], ['stool', 37, 27, true],
    ['stool', 34, 33, true], ['stool', 37, 33, true],

    // --- the screens passage and the vestibule ----------------------------
    ['banner_gold', 22, 36, true], ['banner_gold', 30, 36, true],
    ['plant_c', 17, 39, false], ['plant_a', 35, 39, false],
    ['clock', 16, 35, true],

    // --- the kitchen ------------------------------------------------------
    ['brickfire', 5, 4, true], ['bar_end', 7, 4, true],
    ['larder', 9, 3, true], ['cupboard', 11, 4, true],
    ['longtable', 6, 8, true], ['longtable', 8, 8, true],
    ['choppingboard', 10, 6, false], ['pan', 11, 6, false],
    ['sack_a', 4, 11, true], ['sack_b', 5, 11, true],
    ['basket_a', 7, 11, true], ['claypot', 9, 11, true], ['woodtub', 11, 11, true],

    // --- the bar ----------------------------------------------------------
    ['bar', 5, 17, true], ['bar', 7, 17, true], ['bar_end', 9, 17, true],
    ['shelf_kegs', 4, 15, true], ['shelf_jars', 5, 15, true],
    ['shelf_books', 6, 15, true], ['shelf_kegs', 7, 15, true],
    ['stool_red', 5, 19, true], ['stool_red', 7, 19, true], ['stool_red', 9, 19, true],
    ['keg', 4, 22, true], ['cask_a', 5, 22, true], ['cask_b', 4, 24, true],
    ['clothtable', 9, 23, true], ['stool', 8, 24, true], ['stool', 10, 24, true],
    ['plant_b', 11, 25, false],

    // --- the game room ----------------------------------------------------
    ['roundtable', 6, 31, true], ['stool', 5, 32, true], ['stool', 8, 32, true],
    ['roundtable', 6, 36, true], ['stool', 5, 37, true], ['stool', 8, 37, true],
    ['piano', 10, 30, true], ['stool', 10, 32, true],
    ['sofa', 4, 39, true], ['keg', 11, 38, true],
    ['banner_red', 6, 28, true], ['mirror', 11, 34, true],

    // --- market row -------------------------------------------------------
    ['counter', 42, 6, true], ['counter', 46, 6, true],
    ['case_wares', 42, 4, true], ['case_tools', 46, 4, true],
    ['bookcase', 44, 4, true],
    ['scales', 43, 5, false], ['goldbars', 47, 5, false],
    ['chest', 41, 10, true], ['chest_open', 43, 10, true],
    ['bolts', 45, 10, true], ['basket_b', 47, 10, true],
    ['sack_a', 41, 13, true], ['crate', 42, 13, true], ['cask_a', 47, 13, true],
    ['wallcrest', 44, 3, true], ['plant_d', 41, 15, false],

    // --- the stair, which is how you know there is an upstairs -------------
    ['stair', 45, 20, true],
    ['plant_a', 42, 19, false], ['mirror', 48, 21, true],
    ['sidetable', 42, 24, true], ['stool', 43, 24, true],

    // --- the snug ---------------------------------------------------------
    ['firepit', 44, 29, true],
    ['sofa', 42, 33, true], ['chair', 47, 32, true],
    ['roundtable', 45, 34, true], ['stool_red', 44, 35, true],
    ['bookcase', 41, 29, true], ['cask_b', 48, 35, true],
    ['wallblades', 46, 28, true], ['crossed', 42, 28, true],
    ['plant_c', 48, 37, false],
  ],

  laid: [
    [15, 13, 'roast'], [17, 13, 'jug'], [18, 13, 'cups'],
    [15, 19, 'pasta'], [17, 19, 'steins'], [18, 19, 'plates'],
    [15, 25, 'breakfast'], [17, 25, 'teapot'], [18, 25, 'sweets'],
    [15, 31, 'soup'], [17, 31, 'breadboard'], [18, 31, 'glasses'],
    [34, 13, 'roast_bird'], [36, 13, 'goblets'], [37, 13, 'wine'],
    [34, 19, 'shellfish'], [36, 19, 'ale'], [37, 19, 'cups'],
    [34, 25, 'greens'], [36, 25, 'bottles'], [37, 25, 'plates'],
    [34, 31, 'tart'], [36, 31, 'stewpot'], [37, 31, 'goblets'],
    [23, 7, 'roast'], [25, 7, 'fruit'], [28, 7, 'sweets'], [30, 7, 'wine'],
    [6, 8, 'breadboard'], [7, 8, 'stewpot'], [8, 8, 'greens'], [9, 8, 'roast'],
    [6, 17, 'steins'], [8, 17, 'ale'], [9, 23, 'goblets'],
    [42, 6, 'fruit'], [46, 6, 'phials'], [45, 34, 'bottles'],
    [6, 31, 'cups'], [6, 36, 'supper'],
  ],

  // [id, name, folkIndex, x, y, dir, range, lines[]]
  // `range` is how far they wander from where they stand. Zero is somebody with
  // a job to be at.
  folk: [
    ['keeper', 'Bryn the Keeper', 15, 7, 16, 'south', 0, [
      'Sit where you like. The run will still be there when you are ready.',
      'Nobody leaves until the one at the head table says so. House rule.',
      'Four of you at most. More than that and I cannot hear myself pour.',
      'Rooms are upstairs if you want quiet. Down here if you want company.',
    ]],
    ['cook', 'Marta the Cook', 10, 8, 6, 'south', 2, [
      'Eat before you go. A dish carries you further than a prayer.',
      'Stand at the range if you want to be useful. Tickets in, dishes out.',
      'Two of you is twice the tickets, not half the work. Take one each.',
      'The stew is always on. It has been on for some years now.',
    ]],
    ['quartermaster', 'Oswin', 16, 43, 7, 'south', 1, [
      'Range is a choice, not a gift. Take the upgrade and you fight further out.',
      'Rocks and trees stop you as surely as they stop them. Use that.',
      'Down is not dead. A friend can stand you back up if they reach you in time.',
    ]],
    ['coinweigher', 'The Coinweigher', 17, 47, 7, 'south', 1, [
      'Gold you bank is kept. Gold in your pocket when you fall is not.',
      'I weigh what you bring back. I do not ask where it came from.',
    ]],
    ['bard', 'Piet the Bard', 2, 10, 22, 'west', 2, [
      'Three cups, one coin. No luck in it at all — that is what people hate.',
      'I have a song about the Sovereign. It is short. Nobody survives the chorus.',
      'Watch the cup, not my hands. Everyone watches the hands.',
    ]],
    ['gambler', 'Old Ren', 4, 7, 32, 'north', 1, [
      'Five dice, one re-roll, highest total takes it. That is the whole of it.',
      'I have lost more here than I ever earned out there. Worth it.',
      'Sit down. Nobody plays for anything that matters.',
    ]],
    ['scholar', 'The Chronicler', 6, 45, 32, 'north', 2, [
      'Your weapons grow. Take the same one twice and it becomes something else.',
      'A creature ringed in light is an elite. It hits harder and it drops better.',
      'Twenty minutes is the whole of it. Survive that and the Sovereign comes.',
    ]],
    ['stranger', 'A Stranger', 8, 30, 33, 'west', 4, [
      'I came in from the road. I do not remember which one.',
      'Something out there is unmaking the words for things. Start with the trees.',
    ]],
  ],

  // [variant, x, y, dir, range]. The room's noise floor. The two with a long
  // range are carrying things between the kitchen and the hall, which is most
  // of what makes an inn look staffed.
  regulars: [
    [3, 19, 16, 'east', 3], [11, 33, 21, 'west', 3], [13, 20, 28, 'east', 3],
    [1, 33, 30, 'west', 3], [7, 24, 22, 'south', 2], [9, 28, 27, 'north', 2],
    [5, 19, 34, 'east', 2], [12, 34, 35, 'west', 2],
    [0, 6, 20, 'north', 1], [14, 10, 25, 'west', 1],
    [6, 44, 22, 'south', 2], [2, 44, 12, 'north', 2],
    [4, 9, 35, 'north', 1], [8, 25, 40, 'north', 1],
    [10, 26, 18, 'south', 9], [15, 26, 30, 'north', 9],
  ],

  points: [
    { id: 'door', x: 26, y: 40, r: 92, label: 'The door — begin the run' },
    { id: 'settings', x: 26, y: 8, r: 86, label: 'The high table — the terms of the run' },
    { id: 'party', x: 26, y: 22, r: 84, label: 'The hall — who is here' },
    { id: 'sanctuary', x: 44, y: 7, r: 84, label: 'Market row — the Sanctuary' },
    { id: 'arena', x: 7, y: 17, r: 76, label: 'The bar — the Boss Arena' },
    { id: 'supper', x: 8, y: 7, r: 80, label: "Marta's kitchen — work the supper rush" },
    { id: 'cups', x: 10, y: 23, r: 68, label: "Piet's cups — find the coin" },
    { id: 'dice', x: 6, y: 33, r: 76, label: "Old Ren's table — a game of dice" },
    { id: 'knives', x: 44, y: 29, r: 74, label: 'The knife board — three throws' },
    { id: 'help', x: 45, y: 33, r: 70, label: 'The snug — how to play' },
    { id: 'upstairs', x: 45, y: 21, r: 76, label: 'The stair — rooms above' },
  ],
};

// ---------------------------------------------------------------------------
// Upstairs
// ---------------------------------------------------------------------------
const UPPER = {
  id: 'upper',
  w: 44,
  h: 30,
  spawn: { x: 38, y: 23 },
  floor: 'board',
  rooms: [
    [3, 3, 38, 24, 'oak'],
    [5, 5, 10, 8, 'parquet'],        // the study
    [18, 5, 8, 8, 'oak'],            // guest rooms
    [29, 5, 8, 8, 'oak'],
    [5, 17, 10, 8, 'oak'],
    [18, 17, 8, 8, 'parquet'],       // the long room
    [34, 17, 6, 8, 'flag'],          // the stairhead
  ],
  walls: [
    [4, 13, 12, 1], [16, 4, 1, 10],
    [17, 13, 10, 1], [28, 13, 10, 1],
    [26, 4, 1, 9], [37, 4, 1, 9],
    [4, 25, 12, 1], [16, 16, 1, 10],
    [17, 25, 10, 1], [26, 16, 1, 10],
    [17, 16, 4, 1], [23, 16, 4, 1],
    [33, 16, 1, 10],
  ],
  carpets: [
    [6, 6, 8, 6, 'rugblue'],
    [19, 18, 6, 6, 'carpet'],
  ],
  posts: [[17, 8], [17, 21], [28, 8], [28, 21]],
  lanterns: [[16, 15], [28, 15], [8, 4], [21, 4], [32, 4], [8, 16], [21, 16], [36, 19]],
  door: null,
  fixtures: [
    ['bookcase', 6, 5, true], ['bookcase', 7, 5, true], ['bookcase', 8, 5, true],
    ['bookcase', 12, 5, true], ['bookcase', 13, 5, true],
    ['roundtable', 9, 9, true], ['stool', 8, 10, true], ['stool', 11, 10, true],
    ['clock', 14, 8, true], ['candelabra', 5, 8, true],

    ['sofa', 19, 7, true], ['sidetable', 23, 7, true], ['mirror', 25, 6, true],
    ['sofa', 30, 7, true], ['sidetable', 34, 7, true], ['clock', 36, 6, true],
    ['sofa', 6, 19, true], ['sidetable', 10, 19, true], ['plant_b', 13, 19, false],

    ['longtable', 19, 20, true], ['longtable', 21, 20, true],
    ['stool', 19, 22, true], ['stool', 22, 22, true], ['stool_red', 24, 21, true],
    ['banner_gold', 20, 17, true], ['banner_gold', 24, 17, true],
    ['throne', 22, 18, true],

    ['stair', 36, 21, true],
    ['plant_a', 31, 15, false], ['plant_c', 12, 15, false],
    ['wallblades', 27, 4, true], ['wallcrest', 32, 4, true],
    ['chest', 39, 6, true], ['cask_a', 39, 8, true],
  ],
  laid: [
    [9, 9, 'tome'], [10, 9, 'scrolls'],
    [19, 20, 'map'], [21, 20, 'ledger'], [22, 20, 'goblets'],
    [23, 7, 'cups'], [34, 7, 'teapot'], [10, 19, 'wine'],
  ],
  folk: [
    ['archivist', 'The Archivist', 6, 10, 7, 'south', 2, [
      'Everything anyone did here is written down. Most of it twice.',
      'The Sovereign has been ended forty-one times. It keeps happening.',
      'Read if you like. Nothing up here will kill you.',
    ]],
    ['warden', 'The Warden', 4, 22, 19, 'south', 1, [
      'This is where a party decides what it is doing. Sit, argue, then go.',
      'Different nights, different rules. Ask the one at the head of the table.',
    ]],
  ],
  regulars: [
    [11, 33, 10, 'south', 2], [8, 7, 22, 'east', 2], [1, 26, 21, 'west', 2],
    [3, 20, 8, 'south', 1],
  ],
  points: [
    { id: 'downstairs', x: 36, y: 22, r: 78, label: 'The stair — back to the hall' },
    { id: 'help', x: 10, y: 8, r: 78, label: 'The study — how to play' },
    { id: 'variants', x: 22, y: 20, r: 86, label: 'The long room — how you will play' },
  ],
};

const AREA_DEFS = { ground: GROUND, upper: UPPER };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export const H = {
  built: false,
  areas: {},
  area: 'ground',
  player: { x: 0, y: 0, dir: 'north', frame: 0, moving: false, anim: 0 },
  others: [],
  cam: { x: 0, y: 0 },
  near: null,
  nearFolk: null,
  speech: null,
  t: 0,
  /** The walk-out. `null`, or { t } while the player is leaving. */
  leaving: null,
};

export const A = () => H.areas[H.area];
export const MAP_W = () => A().w;
export const MAP_H = () => A().h;
export const WORLD_W = () => A().w * TILE;
export const WORLD_H = () => A().h * TILE;
export const SPAWN = () => ({
  x: AREA_DEFS[H.area].spawn.x * TILE + TILE / 2,
  y: AREA_DEFS[H.area].spawn.y * TILE + TILE / 2,
});

const inArea = (a, tx, ty) => tx >= 0 && ty >= 0 && tx < a.w && ty < a.h;
const at = (a, tx, ty) => ty * a.w + tx;

function layCarpet(a, x, y, w, h, prefix) {
  if (w < 2 || h < 2) return;
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (!inArea(a, tx, ty)) continue;
      const vy = ty === y ? 't' : ty === y + h - 1 ? 'b' : '';
      const vx = tx === x ? 'l' : tx === x + w - 1 ? 'r' : '';
      a.floor[at(a, tx, ty)] = mat(`${prefix}_${(vy + vx) || 'c'}`);
    }
  }
}

/**
 * Which wall tile a solid square shows.
 *
 * Two tiles of panelling above every floor edge — a skirting board and the
 * panel above it — and masonry behind. It is the difference between a wall you
 * could lean on and a coloured rectangle, and it costs one lookup per tile.
 */
function dressWalls(a) {
  const open = (tx, ty) => inArea(a, tx, ty) && !a.solidBase[at(a, tx, ty)];
  for (let ty = 0; ty < a.h; ty++) {
    for (let tx = 0; tx < a.w; tx++) {
      if (!a.solidBase[at(a, tx, ty)]) continue;
      let name = 'walltop';
      if (open(tx, ty + 1)) name = 'walllow';
      else if (open(tx, ty + 2)) name = 'wallhigh';
      a.floor[at(a, tx, ty)] = mat(name);
    }
  }
}

const PROP_TILES = {
  hearth: 2, bar: 2, piano: 2, longtable: 2, sofa: 3, counter: 2, stair: 2,
};
const propWidth = (name) => PROP_TILES[name] || 1;

function buildArea(def) {
  const a = {
    id: def.id, w: def.w, h: def.h,
    floor: new Uint8Array(def.w * def.h),
    solid: new Uint8Array(def.w * def.h),
    solidBase: new Uint8Array(def.w * def.h),
    props: [], folk: [], points: def.points,
    posts: (def.posts || []).map(([x, y]) => ({
      x: x * TILE + TILE / 2, y: y * TILE + TILE, sortY: y * TILE + TILE, post: true,
    })),
    lanterns: (def.lanterns || []).map(([x, y]) => ({
      x: x * TILE + TILE / 2, y: y * TILE + TILE / 2,
    })),
    door: def.door ? { ...def.door, frame: 0, open: 0 } : null,
    lights: [],
  };
  const rng = makeRng(0x4e11 + def.w);

  a.floor.fill(mat('walltop'));
  a.solid.fill(1);

  for (const [x, y, w, h, material] of def.rooms) {
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (!inArea(a, tx, ty)) continue;
        a.floor[at(a, tx, ty)] = mat(material);
        a.solid[at(a, tx, ty)] = 0;
      }
    }
  }
  for (const [x, y, w, h] of def.walls || []) {
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) if (inArea(a, tx, ty)) a.solid[at(a, tx, ty)] = 1;
    }
  }
  a.solidBase.set(a.solid);
  dressWalls(a);
  for (const [x, y, w, h, prefix] of def.carpets) layCarpet(a, x, y, w, h, prefix);

  const add = (prop, tx, ty, isSolid, lift = 0) => {
    a.props.push({
      prop,
      x: tx * TILE + TILE / 2,
      y: ty * TILE + TILE - lift,
      sortY: ty * TILE + TILE + (lift ? 1 : 0),
    });
    if (isSolid) {
      for (let ox = 0; ox < propWidth(prop); ox++) {
        if (inArea(a, tx + ox, ty)) a.solid[at(a, tx + ox, ty)] = 1;
      }
    }
  };
  for (const [prop, tx, ty, isSolid] of def.fixtures) add(prop, tx, ty, isSolid);
  for (const [tx, ty, item] of def.laid || []) add(item, tx, ty, false, 20);

  for (const [x, y] of def.posts || []) if (inArea(a, x, y)) a.solid[at(a, x, y)] = 1;

  // What throws light: every fire, every candle, every lantern. Read off the
  // furniture rather than listed twice, so moving a hearth moves its light.
  const FIRE = { hearth: 200, firepit: 150, brickfire: 150, candelabra: 110, sconce: 95 };
  for (const p of a.props) {
    const reach = FIRE[p.prop];
    if (reach) a.lights.push({ x: p.x, y: p.y - 24, r: reach, warm: 1, flicker: rng() * 6.28 });
  }
  for (const l of a.lanterns) {
    a.lights.push({ x: l.x, y: l.y, r: 105, warm: 0.9, flicker: rng() * 6.28 });
  }

  for (const [id, name, variant, tx, ty, dir, range, lines] of def.folk) {
    a.folk.push(makeFolk(id, name, variant, tx, ty, dir, range, lines, rng));
  }
  for (const [variant, tx, ty, dir, range] of def.regulars) {
    a.folk.push(makeFolk(null, null, variant, tx, ty, dir, range, null, rng));
  }

  a.props.sort((p, q) => p.sortY - q.sortY);
  return a;
}

function makeFolk(id, name, variant, tx, ty, dir, range, lines, rng) {
  const x = tx * TILE + TILE / 2;
  const y = ty * TILE + TILE / 2;
  return {
    id, name, folk: variant, lines, said: 0,
    x, y, homeX: x, homeY: y, range: (range || 0) * TILE,
    dir, frame: 0, anim: rng() * 4, moving: false,
    // Everybody starts on a different beat, or the whole room steps off
    // together and reads as a chorus line.
    wait: rng() * 5, tx: x, ty: y,
    chat: rng() * 12, says: null,
  };
}

export function buildHub() {
  if (H.built) return;
  for (const key of Object.keys(AREA_DEFS)) H.areas[key] = buildArea(AREA_DEFS[key]);
  H.built = true;
}

export const floorAt = (tx, ty) => {
  const a = A();
  return inArea(a, tx, ty) ? MATERIALS[a.floor[at(a, tx, ty)]] : 'walltop';
};
export const isSolid = (tx, ty) => {
  const a = A();
  return !inArea(a, tx, ty) ? true : !!a.solid[at(a, tx, ty)];
};

function blockedTiles(x, y, r) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (isSolid(tx, ty)) return true;
  }
  return false;
}

/**
 * People are obstacles too, and they move.
 *
 * They are NOT in the tile grid any more: a walking crowd baked into a static
 * array is a crowd that leaves solid holes wherever it has been. So they are
 * checked as circles, which is a handful of comparisons and always current.
 */
function blockedByFolk(x, y, r, skip) {
  for (const f of A().folk) {
    if (f === skip) continue;
    if (Math.hypot(f.x - x, f.y - y) < r + FOLK_R) return true;
  }
  return false;
}

export function goToArea(id) {
  if (!H.areas[id]) return;
  H.area = id;
  const s = SPAWN();
  H.player.x = s.x;
  H.player.y = s.y;
  H.cam.x = s.x;
  H.cam.y = s.y;
  H.near = null;
  H.nearFolk = null;
  H.speech = null;
}

export function enterHub() {
  buildHub();
  H.area = 'ground';
  goToArea('ground');
  H.player.dir = 'north';
  H.player.moving = false;
  H.others = [];
  H.leaving = null;
  H.t = 0;
  const a = A();
  if (a.door) { a.door.frame = 0; a.door.open = 0; }
}

/** X first, then Y, so a body that clips a corner slides instead of stopping. */
function move(p, dx, dy, dt, speed, r, skip) {
  const step = speed * dt;
  const nx = p.x + dx * step;
  if (!blockedTiles(nx, p.y, r) && !blockedByFolk(nx, p.y, r, skip)) p.x = nx;
  const ny = p.y + dy * step;
  if (!blockedTiles(p.x, ny, r) && !blockedByFolk(p.x, ny, r, skip)) p.y = ny;
  p.x = clamp(p.x, TILE, WORLD_W() - TILE);
  p.y = clamp(p.y, TILE, WORLD_H() - TILE);
}

const CHATTER = [
  'Another.', 'Not for me. Not after last time.', 'Did you see the size of it?',
  'They went out at dawn and came back at dawn.', 'Pay the man, Ren.',
  'One more round and I am going home.', 'It is not the walking, it is the coming back.',
  'She took the west road on purpose.', 'That is not what happened and you know it.',
  'To the ones who did not.', 'Quiet night. Good.', 'Play something, Piet.',
  'Mind your feet.', 'Two more of these.', 'He has not paid since spring.',
];

/**
 * The room, moving.
 *
 * Wander, not pathfinding: pick somewhere within reach of where you belong,
 * walk at it, and give up if something is in the way. A tavern crowd does not
 * need to solve mazes — it needs to not be a row of statues, and the difference
 * between those two is about twenty lines.
 *
 * Somebody with a range of zero has a job to be at. They still turn, and they
 * still talk.
 */
function updateFolk(a, dt, t) {
  for (const f of a.folk) {
    if (f.says && t > f.says.until) f.says = null;

    if (f.range > 0) {
      const dx = f.tx - f.x, dy = f.ty - f.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        const fromX = f.x, fromY = f.y;
        move(f, dx / d, dy / d, dt, FOLK_SPEED, FOLK_R, f);
        f.moving = true;
        if (Math.abs(dx) > Math.abs(dy)) f.dir = dx > 0 ? 'east' : 'west';
        else f.dir = dy > 0 ? 'south' : 'north';
        // Stuck against something: give up on this one rather than shuffling
        // into a wall for the rest of the evening.
        if (Math.hypot(f.x - fromX, f.y - fromY) < dt * FOLK_SPEED * 0.25) {
          f.tx = f.x; f.ty = f.y; f.wait = 1 + Math.random() * 3;
        }
        f.anim += dt * 7;
        f.frame = Math.floor(f.anim) % 4;
        continue;
      }
      f.moving = false;
      f.frame = 0;
      f.wait -= dt;
      if (f.wait <= 0) {
        f.wait = 2 + Math.random() * 7;
        const angle = Math.random() * Math.PI * 2;
        const reach = f.range * (0.35 + Math.random() * 0.65);
        const nx = f.homeX + Math.cos(angle) * reach;
        const ny = f.homeY + Math.sin(angle) * reach;
        if (!blockedTiles(nx, ny, FOLK_R)) { f.tx = nx; f.ty = ny; }
      }
    } else {
      f.moving = false;
      f.frame = 0;
      f.wait -= dt;
      if (f.wait <= 0) {
        f.wait = 4 + Math.random() * 8;
        // Somebody standing still still looks up now and then.
        f.dir = ['south', 'east', 'west', 'south'][Math.floor(Math.random() * 4)];
      }
    }
  }

  for (const f of a.folk) {
    if (f.lines) continue;
    f.chat -= dt;
    if (f.chat > 0) continue;
    f.chat = 7 + Math.random() * 16;
    const near = a.folk.find((g) => g !== f && Math.hypot(g.x - f.x, g.y - f.y) < TILE * 3.5);
    if (!near) continue;
    f.says = { text: CHATTER[Math.floor(Math.random() * CHATTER.length)], until: t + 3.5 };
    const dx = near.x - f.x, dy = near.y - f.y;
    f.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
  }
}

/**
 * Leaving.
 *
 * The player walks the last few steps themselves, the door swings, and the
 * screen goes with them. A door that cuts straight to black is a screen change;
 * this is the same thing with the walk left in, and the walk is the whole
 * difference between the two.
 */
export function beginLeaving() {
  const a = A();
  if (!a.door || H.leaving) return false;
  H.leaving = { t: 0 };
  return true;
}

export const LEAVE_SECONDS = 1.9;
export const leaveProgress = () => (H.leaving ? Math.min(1, H.leaving.t / LEAVE_SECONDS) : 0);

function updateLeaving(a, dt) {
  H.leaving.t += dt;
  const k = leaveProgress();
  const p = H.player;

  // The door opens first, then they walk through it.
  if (a.door) {
    a.door.open = Math.min(1, k / 0.45);
    a.door.frame = Math.min(3, Math.floor(a.door.open * 3.999));
  }
  if (k > 0.3 && a.door) {
    const doorX = a.door.x * TILE + TILE / 2;
    const dx = doorX - p.x;
    p.x += clamp(dx, -60 * dt, 60 * dt);
    p.y += 52 * dt;
    p.dir = 'south';
    p.moving = true;
    p.anim += dt * 8;
    p.frame = Math.floor(p.anim) % 4;
  }
  return k >= 1;
}

/** Returns true on the frame the walk-out finishes. */
export function updateHub(dt, input, view) {
  if (!H.built) return false;
  H.t += dt;
  const a = A();
  const p = H.player;

  if (H.leaving) {
    const done = updateLeaving(a, dt);
    updateFolk(a, dt, H.t);
    followCamera(view);
    return done;
  }

  let dx = input?.x || 0;
  let dy = input?.y || 0;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  p.moving = len > 0.08;

  if (p.moving) {
    move(p, dx, dy, dt, WALK_SPEED, BODY_R, null);
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'east' : 'west';
    else p.dir = dy > 0 ? 'south' : 'north';
    p.anim += dt * 8;
    p.frame = Math.floor(p.anim) % 4;
  } else {
    p.anim = 0;
    p.frame = 0;
  }

  for (const o of H.others) {
    o.anim = (o.anim || 0) + (o.moving ? dt * 8 : 0);
    o.frame = o.moving ? Math.floor(o.anim) % 4 : 0;
  }
  updateFolk(a, dt, H.t);
  followCamera(view);

  let bestFolk = null, folkD = Infinity;
  for (const f of a.folk) {
    if (!f.lines) continue;
    const d = Math.hypot(f.x - p.x, f.y - p.y);
    if (d < 82 && d < folkD) { bestFolk = f; folkD = d; }
  }
  H.nearFolk = bestFolk;

  let best = null, bestD = Infinity;
  if (!bestFolk) {
    for (const pt of a.points) {
      const wx = pt.x * TILE + TILE / 2, wy = pt.y * TILE + TILE / 2;
      const d = Math.hypot(wx - p.x, wy - p.y);
      if (d < pt.r && d < bestD) { best = pt; bestD = d; }
    }
  }
  H.near = best;

  if (H.speech && H.t > H.speech.until) H.speech = null;
  return false;
}

function followCamera(view) {
  const p = H.player;
  const halfW = (view?.w || 960) / 2;
  const halfH = (view?.h || 540) / 2;
  H.cam.x = WORLD_W() <= halfW * 2 ? WORLD_W() / 2 : clamp(p.x, halfW, WORLD_W() - halfW);
  H.cam.y = WORLD_H() <= halfH * 2 ? WORLD_H() / 2 : clamp(p.y, halfH, WORLD_H() - halfH);
}

export function talkToFolk() {
  const f = H.nearFolk;
  if (!f || !f.lines) return false;
  const text = f.lines[f.said % f.lines.length];
  f.said++;
  H.speech = { who: f, text, until: H.t + 5.5 };
  const dx = H.player.x - f.x, dy = H.player.y - f.y;
  f.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
  // They stop wandering while they are talking to you.
  f.tx = f.x; f.ty = f.y; f.wait = 6;
  return true;
}

export const hubTarget = () => H.near;
export const hubFolkTarget = () => H.nearFolk;
export const AREAS = AREA_DEFS;
