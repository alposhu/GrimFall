// ---------------------------------------------------------------------------
// hub.js — the Hearthhall: the inn a co-op party stands in.
//
// Reached from Play Together and nowhere else. It is not a place on the menu;
// it is what a lobby looks like once you are in one.
//
// WHAT THE ROOM IS TRYING TO BE.
//
// A working inn at supper time, not a lobby with furniture in it. That means
// three things, and all of them are in the data below rather than in clever
// code:
//
//   The floor is warm.  Oak boards, a red carpet with a gold border down the
//       middle, stone only where stone belongs — the kitchen and the doorway.
//       The rest of the game is dark on purpose; this is the one room with a
//       fire going, and arriving somewhere warm is the point of it.
//
//   The tables are LAID.  Every table in the hall carries a supper: a roast, a
//       jug, cups, a bowl of something. An empty table reads as a showroom. The
//       same table with plates on it reads as somewhere people are eating, and
//       that difference is thirty lines of placement, not a system.
//
//   There is somewhere to go.  A bar, a kitchen behind it, a market row, a
//       game room with dice on the table, and a staircase to rooms upstairs.
//       A single room, however pretty, is a screen. A building is a place.
//
// HOW IT IS BUILT.
//
// Declared. Rooms are rectangles with a floor, walls are derived from the same
// declaration that makes them solid, carpets are laid as a nine-slice so the
// drawn border lands on the border, and the whole thing is turned into tile
// grids once at boot. A hand-painted map would be thousands of numbers nobody
// could read or change.
//
// The tiles and furniture are RPG Maker MZ material through the pipeline the
// Long Market already uses — see img/rtp/SOURCE.txt for the licence position.
// Everything falls back to flat colour if the atlas is missing.
// ---------------------------------------------------------------------------

import { clamp, makeRng } from '../core/util.js';

export const TILE = 48;

const WALK_SPEED = 168;
const BODY_R = 13;

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
const GROUND = {
  id: 'ground',
  w: 60,
  h: 42,
  spawn: { x: 30, y: 37 },
  floor: 'oak',

  // [x, y, w, h, material]. Later wins, so the wings are cut out of the hall.
  rooms: [
    [3, 3, 54, 36, 'oak'],           // the hall itself
    [26, 36, 8, 3, 'flag'],          // the doorway, flagged so boots have somewhere to be
    [4, 4, 12, 9, 'kitchen'],        // the kitchen, behind the bar
    [4, 15, 11, 12, 'parquet'],      // the taproom floor in front of the bar
    [44, 4, 13, 12, 'parquet'],      // market row
    [43, 26, 14, 12, 'parquet'],     // the game room
    [24, 4, 14, 8, 'parquet'],       // the hearth end
  ],

  // Partition walls, [x, y, w, h], put back AFTER the rooms are cut. This is
  // what makes the kitchen a kitchen rather than a differently-coloured patch
  // of the same room: you cannot see into it, and you go in through a door.
  //
  // Doorways are gaps in this list rather than holes punched afterwards, so a
  // wall that seals a room off is a wall somebody has to have written down.
  walls: [
    [16, 4, 1, 10],                  // kitchen, east side
    [4, 13, 5, 1], [11, 13, 6, 1],   // kitchen, south side — door at x 9-10
    [43, 4, 1, 6], [43, 12, 1, 5],   // market row, west side — door at y 10-11
    [44, 16, 13, 1],                 // market row, south side
    [42, 26, 1, 4], [42, 33, 1, 6],  // game room, west side — door at y 30-32
    [43, 25, 14, 1],                 // game room, north side
  ],

  // Carpets, laid as a nine-slice: [x, y, w, h, prefix].
  carpets: [
    [20, 14, 20, 20, 'carpet'],      // the great hall's runner
    [26, 5, 10, 6, 'carpet'],        // in front of the fire
  ],

  // [prop, x, y, solid]
  fixtures: [
    // --- the hearth, at the head of the room -----------------------------
    ['hearth', 30, 6, true],
    ['logs', 27, 7, true], ['logs', 34, 7, true],
    ['sofa', 26, 10, true], ['chair', 24, 8, true], ['chair', 36, 8, true],
    ['banner_red', 28, 5, true], ['banner_red', 33, 5, true],
    ['candelabra', 25, 5, true], ['candelabra', 36, 5, true],

    // --- the long bar, down the west wall ---------------------------------
    ['bar', 6, 17, true], ['bar', 8, 17, true], ['bar', 10, 17, true],
    ['bar_end', 12, 17, true],
    ['shelf_kegs', 5, 15, true], ['shelf_jars', 6, 15, true],
    ['shelf_books', 7, 15, true], ['shelf_kegs', 8, 15, true],
    ['keg', 5, 20, true], ['keg', 6, 20, true], ['cask_a', 5, 22, true],
    ['cask_b', 6, 22, true], ['woodtub', 8, 22, true],
    ['stool_red', 6, 19, true], ['stool_red', 8, 19, true], ['stool_red', 10, 19, true],
    ['plant_a', 4, 25, false], ['plant_c', 13, 25, false],

    // --- the kitchen ------------------------------------------------------
    ['brickfire', 5, 6, true], ['bar_end', 7, 6, true],
    ['choppingboard', 9, 6, false], ['pan', 10, 6, false],
    ['stewpot', 11, 6, false],
    ['cupboard', 13, 5, true], ['cupboard', 14, 5, true],
    ['larder', 9, 4, true], ['sconce', 11, 4, true],
    ['sack_a', 5, 11, true], ['sack_b', 6, 11, true], ['basket_a', 8, 11, true],
    ['basket_b', 9, 11, true], ['claypot', 11, 11, true],
    ['longtable', 9, 9, true], ['longtable', 11, 9, true],
    ['cupboard', 4, 8, true], ['woodtub', 14, 8, true], ['keg', 14, 10, true],
    ['larder', 13, 4, true], ['plant_d', 12, 11, false],

    // --- market row, along the east wall ----------------------------------
    ['counter', 46, 7, true], ['counter', 50, 7, true], ['counter', 54, 7, true],
    ['case_wares', 46, 5, true], ['case_tools', 50, 5, true], ['bookcase', 54, 5, true],
    ['scales', 47, 6, false], ['goldbars', 51, 6, false], ['phials', 55, 6, false],
    ['chest', 45, 11, true], ['chest_open', 47, 11, true],
    ['bolts', 51, 11, true], ['basket_b', 53, 11, true],
    ['plant_b', 44, 14, false], ['plant_d', 56, 14, false],
    ['wallcrest', 48, 4, true], ['wallblades', 52, 4, true],
    ['sconce', 45, 4, true], ['sconce', 55, 4, true],
    ['cask_a', 44, 9, true], ['cask_b', 45, 9, true],
    ['sack_a', 49, 11, true], ['sack_b', 50, 11, true],
    ['basket_a', 55, 11, true], ['crate', 56, 11, true],
    ['bolts', 44, 12, true], ['stool', 48, 9, true], ['stool', 52, 9, true],
    ['shelf_kegs', 48, 5, true], ['shelf_jars', 52, 5, true],
    ['mirror', 56, 5, true], ['clock', 44, 5, true],
    ['banner_gold', 46, 15, true], ['banner_gold', 54, 15, true],

    // --- the game room ----------------------------------------------------
    ['roundtable', 47, 30, true], ['stool', 46, 31, true], ['stool', 49, 31, true],
    ['roundtable', 53, 30, true], ['stool', 52, 31, true], ['stool', 55, 31, true],
    // the knife board, hung where there is a wall to bury a blade in
    ['wallblades', 50, 26, true], ['crossed', 51, 26, true], ['swords', 49, 26, true],
    ['sidetable', 50, 28, true], ['keg', 55, 27, true],
    // Piet's end of the bar
    ['clothtable', 13, 20, true], ['stool_red', 12, 21, true], ['stool_red', 14, 21, true],
    ['clothtable', 47, 35, true], ['clothtable', 53, 35, true],
    ['stool_red', 46, 36, true], ['stool_red', 54, 36, true],
    ['piano', 44, 28, true], ['stool', 44, 30, true],
    ['mirror', 56, 28, true], ['plant_a', 44, 37, false],
    ['sofa', 44, 34, true], ['sidetable', 48, 33, true],
    ['keg', 56, 35, true], ['cask_b', 56, 33, true],
    ['stool_red', 50, 33, true], ['stool', 51, 33, true],
    ['banner_red', 47, 26, true], ['banner_red', 53, 26, true],
    ['sconce', 44, 26, true], ['sconce', 56, 26, true],
    ['bookcase', 55, 37, true], ['plant_c', 43, 31, false],
    ['case_tools', 52, 37, true],

    // --- the great hall's tables ------------------------------------------
    ['longtable', 22, 17, true], ['longtable', 24, 17, true],
    ['longtable', 34, 17, true], ['longtable', 36, 17, true],
    ['longtable', 22, 23, true], ['longtable', 24, 23, true],
    ['longtable', 34, 23, true], ['longtable', 36, 23, true],
    ['longtable', 22, 29, true], ['longtable', 24, 29, true],
    ['longtable', 34, 29, true], ['longtable', 36, 29, true],
    ['stool', 22, 19, true], ['stool', 25, 19, true],
    ['stool', 35, 19, true], ['stool', 38, 19, true],
    ['stool', 22, 25, true], ['stool', 25, 25, true],
    ['stool', 35, 25, true], ['stool', 38, 25, true],
    ['stool_red', 23, 31, true], ['stool_red', 36, 31, true],

    // --- the way out, and the way up --------------------------------------
    ['banner_gold', 27, 35, true], ['banner_gold', 32, 35, true],
    ['clock', 20, 35, true], ['plant_c', 39, 35, false],
    ['bookcase', 41, 5, true], ['bookcase', 41, 7, true],
  ],

  // A supper on every table. [x, y, item] — drawn on the table's surface and
  // never solid: you walk up to a table, not through its dinner.
  laid: [
    [22, 17, 'roast'], [24, 17, 'jug'], [25, 17, 'cups'],
    [34, 17, 'roast_bird'], [36, 17, 'goblets'], [37, 17, 'wine'],
    [22, 23, 'pasta'], [24, 23, 'steins'], [25, 23, 'plates'],
    [34, 23, 'shellfish'], [36, 23, 'ale'], [37, 23, 'cups'],
    [22, 29, 'breakfast'], [24, 29, 'teapot'], [25, 29, 'sweets'],
    [34, 29, 'soup'], [36, 29, 'breadboard'], [37, 29, 'glasses'],
    [47, 30, 'bottles'], [53, 30, 'tart'],
    [47, 35, 'supper'], [53, 35, 'casserole'],
    [9, 17, 'steins'], [11, 17, 'goblets'], [7, 17, 'ale'],
    [13, 20, 'cups'], [50, 28, 'bottles'],
    [9, 9, 'breadboard'], [10, 9, 'stewpot'], [11, 9, 'greens'], [12, 9, 'roast'],
    [48, 33, 'goblets'], [48, 9, 'fruit'], [52, 9, 'sweets'],
    [46, 7, 'fruit'], [50, 7, 'greens'], [54, 7, 'sweets'],
  ],

  // [id, name, folkIndex, x, y, dir, lines[]]
  folk: [
    ['keeper', 'Bryn the Keeper', 15, 9, 16, 'south', [
      'Sit where you like. The run will still be there when you are ready.',
      'Nobody leaves until the one at the head table says so. House rule.',
      'Four of you at most. More than that and I cannot hear myself pour.',
      'Upstairs if you want quiet. Down here if you want company.',
    ]],
    ['cook', 'Marta the Cook', 10, 10, 8, 'south', [
      'Eat before you go. A dish carries you further than a prayer.',
      'Stand at the range if you want to be useful. Tickets come in, dishes go out.',
      'Two of you is twice the tickets, not half the work. Take one each.',
      'The stew is always on. It has been on for some years now.',
    ]],
    ['quartermaster', 'Oswin', 16, 48, 8, 'south', [
      'Range is a choice, not a gift. Take the upgrade and you fight further out.',
      'Rocks and trees stop you as surely as they stop them. Use that.',
      'Down is not dead. A friend can stand you back up if they reach you in time.',
    ]],
    ['coinweigher', 'The Coinweigher', 17, 52, 8, 'south', [
      'Gold you bank is kept. Gold in your pocket when you fall is not.',
      'I weigh what you bring back. I do not ask where it came from.',
    ]],
    ['bard', 'Piet the Bard', 2, 13, 19, 'west', [
      'Three cups, one coin. No luck in it at all — that is what people hate.',
      'I have a song about the Sovereign. It is short. Nobody survives the chorus.',
      'Watch the cup, not my hands. Everyone watches the hands.',
    ]],
    ['gambler', 'Old Ren', 4, 50, 31, 'north', [
      'Five dice, one re-roll, highest total takes it. That is the whole of it.',
      'I have lost more here than I ever earned out there. Worth it.',
      'Sit down. Nobody plays for anything that matters.',
    ]],
    ['scholar', 'The Chronicler', 6, 42, 6, 'west', [
      'Your weapons grow. Take the same one twice and it becomes something else.',
      'A creature ringed in light is an elite. It hits harder and it drops better.',
      'Twenty minutes is the whole of it. Survive that and the Sovereign comes.',
    ]],
    ['stranger', 'A Stranger', 8, 26, 32, 'east', [
      'I came in from the road. I do not remember which one.',
      'Something out there is unmaking the words for things. Start with the trees.',
    ]],
  ],

  // Drinkers and idlers. Decorative, and the reason the room has a noise floor.
  regulars: [
    [3, 21, 25, 'north'], [11, 25, 20, 'west'], [13, 35, 21, 'east'],
    [1, 23, 26, 'east'], [7, 37, 26, 'south'], [9, 12, 20, 'north'],
    [5, 30, 31, 'west'], [12, 38, 31, 'north'], [0, 7, 18, 'north'],
    [14, 10, 24, 'east'], [2, 51, 33, 'south'], [6, 45, 34, 'east'],
  ],

  points: [
    { id: 'door', x: 30, y: 37, r: 100, label: 'The door — begin the run' },
    { id: 'settings', x: 30, y: 8, r: 96, label: 'The head of the hall — the terms of the run' },
    { id: 'party', x: 27, y: 22, r: 92, label: 'The long table — who is here' },
    { id: 'sanctuary', x: 50, y: 8, r: 92, label: 'Market row — the Sanctuary' },
    { id: 'help', x: 41, y: 6, r: 74, label: 'The shelves — how to play' },
    { id: 'arena', x: 9, y: 18, r: 84, label: 'The bar — the Boss Arena' },
    { id: 'dice', x: 50, y: 31, r: 74, label: "Old Ren's table — a game of dice" },
    { id: 'cups', x: 13, y: 21, r: 70, label: "Piet's cups — find the coin" },
    { id: 'knives', x: 50, y: 27, r: 72, label: 'The knife board — three throws' },
    { id: 'supper', x: 10, y: 10, r: 82, label: "Marta's kitchen — work the supper rush" },
    { id: 'upstairs', x: 55, y: 20, r: 78, label: 'The stair — rooms above' },
  ],
};

// ---------------------------------------------------------------------------
// Upstairs
// ---------------------------------------------------------------------------
const UPPER = {
  id: 'upper',
  w: 44,
  h: 30,
  spawn: { x: 38, y: 21 },
  floor: 'board',
  rooms: [
    [3, 3, 38, 24, 'oak'],           // the landing and corridor
    [5, 5, 10, 8, 'parquet'],        // the study
    [18, 5, 8, 8, 'oak'],            // a guest room
    [29, 5, 8, 8, 'oak'],            // another
    [5, 17, 10, 8, 'oak'],           // a third
    [18, 17, 8, 8, 'parquet'],       // the long room, for other ways to play
    [34, 17, 6, 8, 'flag'],          // the stairhead
  ],
  // Upstairs is corridors and closed doors, which is what makes it upstairs.
  walls: [
    [4, 13, 12, 1],                              // the study's south wall
    [16, 4, 1, 10],                              // and its east wall
    [17, 13, 10, 1], [28, 13, 10, 1],            // the two guest rooms
    [26, 4, 1, 9], [37, 4, 1, 9],
    [4, 25, 12, 1], [16, 16, 1, 10],             // the third room
    [17, 25, 10, 1], [26, 16, 1, 10],            // the long room
    [17, 16, 4, 1], [23, 16, 4, 1],              // its doorway, at x 21-22
    [33, 16, 1, 10],                             // the stairhead
  ],

  carpets: [
    [6, 6, 8, 6, 'rugblue'],
    [19, 18, 6, 6, 'carpet'],
  ],
  fixtures: [
    // the study
    ['bookcase', 6, 5, true], ['bookcase', 7, 5, true], ['bookcase', 8, 5, true],
    ['bookcase', 12, 5, true], ['bookcase', 13, 5, true],
    ['roundtable', 9, 9, true], ['stool', 8, 10, true], ['stool', 11, 10, true],
    ['clock', 14, 8, true], ['candelabra', 5, 8, true],

    // guest rooms, plainly furnished
    ['sofa', 19, 7, true], ['sidetable', 23, 7, true], ['mirror', 25, 6, true],
    ['sofa', 30, 7, true], ['sidetable', 34, 7, true], ['clock', 36, 6, true],
    ['sofa', 6, 19, true], ['sidetable', 10, 19, true], ['plant_b', 13, 19, false],

    // the long room — where a party settles on what to play
    ['longtable', 19, 20, true], ['longtable', 21, 20, true],
    ['stool', 19, 22, true], ['stool', 22, 22, true], ['stool_red', 24, 21, true],
    ['banner_gold', 20, 17, true], ['banner_gold', 24, 17, true],
    ['throne', 22, 18, true],

    // the landing
    ['plant_a', 16, 15, false], ['plant_c', 28, 15, false],
    ['wallblades', 27, 4, true], ['wallcrest', 32, 4, true],
    ['chest', 39, 6, true], ['cask_a', 39, 8, true],
  ],
  laid: [
    [9, 9, 'tome'], [10, 9, 'scrolls'],
    [19, 20, 'map'], [21, 20, 'ledger'], [22, 20, 'goblets'],
    [23, 7, 'cups'], [34, 7, 'teapot'], [10, 19, 'wine'],
  ],
  folk: [
    ['archivist', 'The Archivist', 6, 10, 7, 'south', [
      'Everything anyone did here is written down. Most of it twice.',
      'The Sovereign has been ended forty-one times. It keeps happening.',
      'Read if you like. Nothing up here will kill you.',
    ]],
    ['warden', 'The Warden', 4, 22, 19, 'south', [
      'This is where a party decides what it is doing. Sit, argue, then go.',
      'Different nights, different rules. Ask the one at the head of the table.',
    ]],
  ],
  regulars: [
    [11, 33, 10, 'south'], [8, 7, 22, 'east'], [1, 26, 21, 'west'],
  ],
  points: [
    { id: 'downstairs', x: 37, y: 21, r: 82, label: 'The stair — back to the hall' },
    { id: 'help', x: 10, y: 8, r: 80, label: 'The study — how to play' },
    { id: 'variants', x: 22, y: 20, r: 90, label: 'The long room — how you will play' },
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
};

/** The area the player is standing in. */
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

/**
 * A rectangle of carpet, laid as a nine-slice.
 *
 * The border tiles are drawn art, not a tint — the corner tile has the corner
 * of the pattern on it — so a rug is only a rug if the right tile lands in the
 * right place. Anything narrower than two tiles has no middle and is skipped
 * rather than drawn wrong.
 */
function layCarpet(a, x, y, w, h, prefix) {
  if (w < 2 || h < 2) return;
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (!inArea(a, tx, ty)) continue;
      const vy = ty === y ? 't' : ty === y + h - 1 ? 'b' : '';
      const vx = tx === x ? 'l' : tx === x + w - 1 ? 'r' : '';
      const part = (vy + vx) || 'c';
      a.floor[at(a, tx, ty)] = mat(`${prefix}_${part}`);
    }
  }
}

/**
 * Which wall tile a solid square should show.
 *
 * A room drawn with one flat colour behind it is a floor plan. Two tiles of
 * panelling above every floor edge — a skirting board and the panel above it —
 * is what makes it read as a wall you could lean on, and it costs one lookup
 * per tile rather than a lighting model.
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
  hearth: 2, bar: 2, piano: 2, longtable: 2, sofa: 3, counter: 2,
};
const propWidth = (name) => PROP_TILES[name] || 1;

function buildArea(def) {
  const a = {
    id: def.id, w: def.w, h: def.h,
    floor: new Uint8Array(def.w * def.h),
    solid: new Uint8Array(def.w * def.h),
    solidBase: new Uint8Array(def.w * def.h),
    props: [], folk: [], points: def.points,
  };
  const rng = makeRng(0x4e11 + def.w);

  // Everything is wall until a room is cut out of it, so the shell can never
  // be left with a hole by mistake.
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
      for (let tx = x; tx < x + w; tx++) {
        if (inArea(a, tx, ty)) a.solid[at(a, tx, ty)] = 1;
      }
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
  // Supper sits ON the table: lifted onto its surface and sorted just after it,
  // so it draws over the table rather than under it.
  for (const [tx, ty, item] of def.laid || []) add(item, tx, ty, false, 20);

  for (const [id, name, variant, tx, ty, dir, lines] of def.folk) {
    a.folk.push({
      id, name, folk: variant, lines, said: 0,
      x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
      dir, frame: 0, anim: rng() * 4, sortY: ty * TILE + TILE / 2,
      home: dir, chat: 0,
    });
    if (inArea(a, tx, ty)) a.solid[at(a, tx, ty)] = 1;
  }
  for (const [variant, tx, ty, dir] of def.regulars) {
    a.folk.push({
      id: null, name: null, folk: variant, lines: null,
      x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
      dir, frame: 0, anim: rng() * 4, sortY: ty * TILE + TILE / 2,
      home: dir, chat: 0,
    });
    if (inArea(a, tx, ty)) a.solid[at(a, tx, ty)] = 1;
  }

  a.props.sort((p, q) => p.sortY - q.sortY);
  return a;
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

function blocked(x, y, r) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (isSolid(tx, ty)) return true;
  }
  return false;
}

/** Move to another floor of the inn, landing on its own arrival mark. */
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
  H.t = 0;
}

/** X first, then Y, so a body that clips a corner slides instead of stopping. */
function move(p, dx, dy, dt) {
  const step = WALK_SPEED * dt;
  const nx = p.x + dx * step;
  if (!blocked(nx, p.y, BODY_R)) p.x = nx;
  const ny = p.y + dy * step;
  if (!blocked(p.x, ny, BODY_R)) p.y = ny;
  p.x = clamp(p.x, TILE, WORLD_W() - TILE);
  p.y = clamp(p.y, TILE, WORLD_H() - TILE);
}

/**
 * The regulars talk to each other.
 *
 * Not a conversation system — a timer, a nearby neighbour, and a line over one
 * head at a time. The point is that the room is audibly doing something when
 * nobody is doing anything, and that costs a few lines rather than a schedule
 * and a pathfinder.
 */
const CHATTER = [
  'Another.', 'Not for me. Not after last time.', 'Did you see the size of it?',
  'They went out at dawn and came back at dawn.', 'Pay the man, Ren.',
  'One more round and I am going home.', 'It is not the walking, it is the coming back.',
  'She took the west road on purpose.', 'That is not what happened and you know it.',
  'To the ones who did not.', 'Quiet night. Good.', 'Play something, Piet.',
];

function updateChatter(a, dt, t) {
  for (const f of a.folk) {
    if (f.lines) continue;                 // the named cast speak when spoken to
    f.chat -= dt;
    if (f.chat > 0) continue;
    f.chat = 6 + Math.random() * 14;
    // Somebody has to be near enough to be talking TO, or it is a person
    // muttering at a wall.
    const near = a.folk.find((g) => g !== f
      && Math.hypot(g.x - f.x, g.y - f.y) < TILE * 3.5);
    if (!near) continue;
    f.says = { text: CHATTER[Math.floor(Math.random() * CHATTER.length)], until: t + 3.5 };
    // They turn to whoever they are speaking to.
    const dx = near.x - f.x, dy = near.y - f.y;
    f.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
  }
}

export function updateHub(dt, input, view) {
  if (!H.built) return;
  H.t += dt;
  const a = A();
  const p = H.player;

  let dx = input?.x || 0;
  let dy = input?.y || 0;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  p.moving = len > 0.08;

  if (p.moving) {
    move(p, dx, dy, dt);
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
  for (const f of a.folk) {
    f.anim += dt * 1.4;
    f.frame = Math.floor(f.anim) % 4;
    if (f.says && H.t > f.says.until) f.says = null;
  }
  updateChatter(a, dt, H.t);

  const halfW = (view?.w || 960) / 2;
  const halfH = (view?.h || 540) / 2;
  H.cam.x = WORLD_W() <= halfW * 2 ? WORLD_W() / 2 : clamp(p.x, halfW, WORLD_W() - halfW);
  H.cam.y = WORLD_H() <= halfH * 2 ? WORLD_H() / 2 : clamp(p.y, halfH, WORLD_H() - halfH);

  // Somebody to talk to beats something to open: the person is the rarer thing
  // and the one you have to be closer to.
  let bestFolk = null, folkD = Infinity;
  for (const f of a.folk) {
    if (!f.lines) continue;
    const d = Math.hypot(f.x - p.x, f.y - p.y);
    if (d < 78 && d < folkD) { bestFolk = f; folkD = d; }
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
}

/** Talk to whoever is in front of you. Returns true if somebody answered. */
export function talkToFolk() {
  const f = H.nearFolk;
  if (!f || !f.lines) return false;
  const text = f.lines[f.said % f.lines.length];
  f.said++;
  H.speech = { who: f, text, until: H.t + 5.5 };
  const dx = H.player.x - f.x, dy = H.player.y - f.y;
  f.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
  return true;
}

export const hubTarget = () => H.near;
export const hubFolkTarget = () => H.nearFolk;

/** Everything the map declares, for the tests to walk over. */
export const AREAS = AREA_DEFS;
