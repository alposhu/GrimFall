// ---------------------------------------------------------------------------
// hub.js — the Hearthhall, the room a co-op party stands in.
//
// WHAT THIS REPLACED, AND WHY.
//
// The lobby was a form: type a name, type a code, watch a list of names appear.
// It told you three people were present and gave you no reason to believe it.
// This is the same lobby as a ROOM — an inn hall you walk around, where the
// others are people moving and standing next to somebody means something
// without a line of interface saying so.
//
// It is reached from Play Together and from nowhere else. It is not a place on
// the menu: it is what the lobby looks like once you are in one.
//
// WHY AN INTERIOR.
//
// A hall has walls, and walls are what make a lobby feel like somewhere you are
// waiting rather than somewhere you are passing through. Everyone is pushed
// into the same few hundred square metres, so you end up near each other
// without being made to stand on a marker — and the room has a middle, which an
// open field does not, so "meet by the fire" is a thing somebody can say.
//
// HOW THE MAP IS BUILT.
//
// Declared, not painted. Rooms are rectangles with a floor, walls are drawn
// from the same declaration that makes them solid, and `buildHub()` turns the
// lot into a tile grid and a collision grid once. A hand-painted array would be
// two thousand numbers nobody could read; this is a floor plan you can follow.
//
// The tiles and furniture are RPG Maker MZ material through the pipeline the
// Long Market already uses — see img/rtp/SOURCE.txt. Everything falls back to
// flat colour if the atlas is missing, so the hall stays walkable when the
// artwork is not there.
// ---------------------------------------------------------------------------

import { clamp, makeRng } from '../core/util.js';

export const TILE = 48;
export const MAP_W = 56;
export const MAP_H = 44;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/** Just inside the door, facing up the hall. */
export const SPAWN = { x: 28 * TILE, y: 39 * TILE + TILE / 2 };

const WALK_SPEED = 168;
const BODY_R = 13;

// ---------------------------------------------------------------------------
// The floor plan
// ---------------------------------------------------------------------------
//
// Tiles, as [x, y, w, h]. Drawn in order, so a later room cuts into an earlier
// one — which is how the wings are carved out of the hall rather than fitted
// around it.
const ROOMS = [
  { id: 'hall', rect: [4, 4, 48, 36], floor: 'plank' },        // the whole room
  { id: 'hearthside', rect: [20, 5, 16, 8], floor: 'hearthstone' },
  { id: 'dais', rect: [5, 5, 12, 9], floor: 'flag' },           // the head table
  { id: 'library', rect: [39, 5, 12, 11], floor: 'board' },
  { id: 'bar', rect: [5, 17, 9, 12], floor: 'flag' },
  { id: 'music', rect: [5, 31, 11, 8], floor: 'board' },
  { id: 'armoury', rect: [41, 19, 10, 9], floor: 'flag' },
  { id: 'door', rect: [24, 36, 8, 4], floor: 'flag' },          // the way out
];

/** Runners of carpet, laid over the boards. [x, y, w, h, material]. */
const RUGS = [
  [26, 14, 4, 22, 'rug_red'],       // the long aisle, door to hearth
  [7, 6, 8, 6, 'rug_gold'],         // under the head table
  [41, 7, 8, 7, 'rug_blue'],        // the library
];

// Furniture. [prop, tileX, tileY, solid].
const FIXTURES = [
  // --- the hearth, at the head of the room ---------------------------------
  ['hearth', 27, 9, true],
  ['logs', 24, 11, true], ['logs', 31, 11, true],
  ['sofa', 23, 13, true], ['chair', 33, 12, true], ['chair', 21, 12, true],
  ['banner_red', 25, 6, true], ['banner_red', 30, 6, true],

  // --- the head table: where the host sets the terms ------------------------
  ['throne', 11, 8, true],
  ['clothtable', 9, 10, true], ['clothtable', 10, 10, true],
  ['clothtable', 11, 10, true], ['clothtable', 12, 10, true],
  ['banner_gold', 8, 6, true], ['banner_gold', 14, 6, true],
  ['stool', 9, 12, true], ['stool', 12, 12, true],

  // --- the bar --------------------------------------------------------------
  ['bar', 7, 20, true], ['bar', 9, 20, true], ['bar_end', 11, 20, true],
  ['shelf_kegs', 6, 18, true], ['shelf_jars', 7, 18, true], ['shelf_books', 8, 18, true],
  ['keg', 6, 23, true], ['keg', 7, 23, true], ['woodtub', 9, 23, true],
  ['stool_red', 7, 22, true], ['stool_red', 9, 22, true], ['stool_red', 11, 22, true],
  ['pot', 12, 26, true], ['washpot', 6, 26, true],

  // --- the library ----------------------------------------------------------
  ['bookcase', 40, 6, true], ['bookcase', 41, 6, true], ['bookcase', 42, 6, true],
  ['bookcase', 48, 6, true], ['bookcase', 49, 6, true], ['bookcase', 50, 6, true],
  ['roundtable', 44, 10, true], ['stool', 43, 11, true], ['stool', 46, 11, true],
  ['cupboard', 40, 13, true], ['clock', 50, 13, true],

  // --- the armoury wall -----------------------------------------------------
  ['swords', 43, 20, true], ['crossed', 45, 20, true], ['shield', 47, 20, true],
  ['mirror', 49, 21, true],
  ['cupboard', 42, 24, true], ['cupboard', 43, 24, true],
  ['sidetable', 46, 25, true], ['sidetable', 47, 25, true],

  // --- the music corner -----------------------------------------------------
  ['piano', 7, 34, true],
  ['stool', 7, 36, true], ['stool_red', 9, 36, true],
  ['sofa', 12, 36, true],

  // --- the long tables, down the middle of the hall -------------------------
  ['longtable', 20, 20, true], ['longtable', 22, 20, true],
  ['longtable', 20, 24, true], ['longtable', 22, 24, true],
  ['longtable', 33, 20, true], ['longtable', 35, 20, true],
  ['longtable', 33, 24, true], ['longtable', 35, 24, true],
  ['longtable', 20, 30, true], ['longtable', 22, 30, true],
  ['longtable', 33, 30, true], ['longtable', 35, 30, true],
  ['stool', 20, 22, true], ['stool', 23, 22, true], ['stool', 34, 22, true],
  ['stool', 21, 26, true], ['stool', 24, 26, true], ['stool', 35, 26, true],
  ['stool_red', 20, 32, true], ['stool_red', 34, 32, true],

  // --- odds and ends --------------------------------------------------------
  ['keg', 17, 34, true], ['keg', 18, 34, true], ['woodtub', 44, 34, true],
  ['clothtable', 44, 32, true], ['stool', 45, 33, true],
  ['mirror', 17, 18, true],
];

// ---------------------------------------------------------------------------
// The people who live here
// ---------------------------------------------------------------------------
//
// `folk` indexes the townsfolk atlas (src/art/rtp.js, RTP_FOLK). Their lines
// are the game explaining itself — the things a new player learns by dying
// twice, said by somebody standing in a room instead of printed on a help
// screen nobody opens.
//
// Each line is spoken in turn and then the list starts again, so talking to
// somebody twice is never the same answer twice.
export const FOLK = [
  {
    id: 'keeper', name: 'The Keeper', folk: 15, x: 9, y: 21, dir: 'south',
    lines: [
      'Sit where you like. The run will still be there when you are ready.',
      'Nobody starts until the one at the head table says so. That is the rule.',
      'Four of you at most. More than that and the hall gets loud.',
    ],
  },
  {
    id: 'chronicler', name: 'The Chronicler', folk: 6, x: 45, y: 9, dir: 'south',
    lines: [
      'Your weapons grow. Take the same one twice and it becomes something else.',
      'A creature ringed in light is an elite. It hits harder and it drops better.',
      'Twenty minutes is the whole of it. Survive that and the Sovereign comes.',
      'Gold you bank is kept. Gold you are carrying when you fall is not.',
    ],
  },
  {
    id: 'quartermaster', name: 'The Quartermaster', folk: 4, x: 45, y: 22, dir: 'south',
    lines: [
      'Range is a choice, not a gift. Take the upgrade and you fight further out.',
      'Rocks and trees stop you as surely as they stop them. Use that.',
      'Down is not dead. A friend can stand you back up if they reach you in time.',
    ],
  },
  {
    id: 'bard', name: 'The Bard', folk: 2, x: 9, y: 34, dir: 'east',
    lines: [
      'I have a song about the Sovereign. It is short. Nobody survives the chorus.',
      'They say the Blight took the west road. I say the west road took itself.',
    ],
  },
  {
    id: 'cook', name: 'The Cook', folk: 10, x: 12, y: 26, dir: 'east',
    lines: [
      'Eat before you go. A dish carries you further than a prayer.',
      'The market opens between bouts. Spend there, not here.',
    ],
  },
  {
    id: 'stranger', name: 'A Stranger', folk: 8, x: 38, y: 33, dir: 'west',
    lines: [
      'I came in from the road. I do not remember which one.',
      'Something out there is unmaking the words for things. Start with the trees.',
    ],
  },
];

// Drinkers and idlers, so the hall is not empty between parties. Purely
// decorative: they are drawn and they are solid, and they do nothing else.
const REGULARS = [
  [3, 19, 26, 'south'], [11, 21, 30, 'north'], [13, 35, 22, 'west'],
  [1, 22, 32, 'east'], [7, 36, 30, 'south'], [9, 16, 30, 'north'],
  [5, 30, 33, 'west'], [12, 42, 30, 'north'],
];

// ---------------------------------------------------------------------------
// The things you can use
// ---------------------------------------------------------------------------
export const POINTS = [
  { id: 'door', x: 28 * TILE, y: 38 * TILE, r: 90, label: 'The door — begin the run' },
  { id: 'settings', x: 11 * TILE, y: 10 * TILE, r: 92, label: 'The head table — the terms of the run' },
  { id: 'party', x: 28 * TILE, y: 11 * TILE, r: 96, label: 'The hearth — who is here' },
  { id: 'sanctuary', x: 9 * TILE, y: 21 * TILE, r: 78, label: 'The bar — the Sanctuary' },
  { id: 'help', x: 45 * TILE, y: 10 * TILE, r: 84, label: 'The library — how to play' },
  { id: 'arena', x: 46 * TILE, y: 21 * TILE, r: 84, label: 'The armoury — the Boss Arena' },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export const H = {
  built: false,
  floor: null,
  solid: null,
  props: [],
  folk: [],                 // the NPCs, as drawable entities
  player: { x: SPAWN.x, y: SPAWN.y, dir: 'north', frame: 0, moving: false, anim: 0 },
  others: [],
  cam: { x: SPAWN.x, y: SPAWN.y },
  near: null,               // POINT in reach, or null
  nearFolk: null,           // NPC in reach, or null
  speech: null,             // { who, text, until }
  t: 0,
};

export const MATERIALS = [
  'grass', 'moss', 'dirt', 'sand', 'road', 'cobble', 'brick', 'clay', 'slab', 'dark',
  'plank', 'board', 'flag', 'hearthstone', 'rug_gold', 'rug_blue', 'rug_red',
  'wall', 'wall_dark',
];
const mat = (name) => Math.max(0, MATERIALS.indexOf(name));

const idx = (tx, ty) => ty * MAP_W + tx;
const inMap = (tx, ty) => tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H;

function fill(floor, [x, y, w, h], material) {
  const v = mat(material);
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) if (inMap(tx, ty)) floor[idx(tx, ty)] = v;
  }
}

/**
 * Only the bottom row of a tall prop blocks.
 *
 * A bookcase is drawn two tiles high and you walk past its top, not through it.
 * Blocking the whole rectangle turns every piece of furniture into a wall twice
 * its real size, and a room furnished that way plays like a maze.
 */
function block(solid, tx, ty, w) {
  for (let ox = 0; ox < w; ox++) if (inMap(tx + ox, ty)) solid[idx(tx + ox, ty)] = 1;
}

const PROP_TILES = {
  hearth: 2, bar: 2, piano: 2, longtable: 2, sofa: 3,
};
const propWidth = (name) => PROP_TILES[name] || 1;

export function buildHub() {
  if (H.built) return;
  const floor = new Uint8Array(MAP_W * MAP_H);
  const solid = new Uint8Array(MAP_W * MAP_H);
  const props = [];
  const folk = [];
  const rng = makeRng(0x4e11);

  // Everything outside the hall is wall. The room is then cut out of it, which
  // means there is no way to leave a gap in the shell by mistake.
  floor.fill(mat('wall_dark'));
  solid.fill(1);

  for (const room of ROOMS) {
    fill(floor, room.rect, room.floor);
    const [x, y, w, h] = room.rect;
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) if (inMap(tx, ty)) solid[idx(tx, ty)] = 0;
    }
  }
  for (const [x, y, w, h, material] of RUGS) fill(floor, [x, y, w, h], material);

  // The inside face of the shell, one tile of dressed stone, so the wall reads
  // as masonry from in here rather than as the void the outside is.
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (!solid[idx(tx, ty)]) continue;
      let touchesFloor = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = tx + dx, ny = ty + dy;
        if (inMap(nx, ny) && !solid[idx(nx, ny)]) { touchesFloor = true; break; }
      }
      if (touchesFloor) floor[idx(tx, ty)] = mat('wall');
    }
  }

  const add = (prop, tx, ty, isSolid) => {
    props.push({ prop, x: tx * TILE + TILE / 2, y: ty * TILE + TILE, sortY: ty * TILE + TILE });
    if (isSolid) block(solid, tx, ty, propWidth(prop));
  };
  for (const [prop, tx, ty, isSolid] of FIXTURES) add(prop, tx, ty, isSolid);

  // The named cast, then the regulars.
  for (const f of FOLK) {
    folk.push({
      id: f.id, name: f.name, folk: f.folk, lines: f.lines, said: 0,
      x: f.x * TILE + TILE / 2, y: f.y * TILE + TILE / 2,
      dir: f.dir, frame: 0, anim: rng() * 4, sortY: f.y * TILE + TILE / 2,
    });
    solid[idx(f.x, f.y)] = 1;
  }
  for (const [variant, tx, ty, dir] of REGULARS) {
    folk.push({
      id: null, name: null, folk: variant, lines: null,
      x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
      dir, frame: 0, anim: rng() * 4, sortY: ty * TILE + TILE / 2,
    });
    solid[idx(tx, ty)] = 1;
  }

  props.sort((a, b) => a.sortY - b.sortY);
  H.floor = floor;
  H.solid = solid;
  H.props = props;
  H.folk = folk;
  H.built = true;
}

export const floorAt = (tx, ty) => (inMap(tx, ty) ? MATERIALS[H.floor[idx(tx, ty)]] : 'wall_dark');
export const isSolid = (tx, ty) => (!inMap(tx, ty) ? true : !!H.solid[idx(tx, ty)]);

function blocked(x, y, r) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (isSolid(tx, ty)) return true;
  }
  return false;
}

export function enterHub(at = SPAWN) {
  buildHub();
  H.player.x = at.x;
  H.player.y = at.y;
  H.player.dir = 'north';
  H.player.moving = false;
  H.cam.x = at.x;
  H.cam.y = at.y;
  H.others = [];
  H.near = null;
  H.nearFolk = null;
  H.speech = null;
  H.t = 0;
}

/** X first, then Y, so a body that clips a corner slides instead of stopping. */
function move(p, dx, dy, dt) {
  const step = WALK_SPEED * dt;
  const nx = p.x + dx * step;
  if (!blocked(nx, p.y, BODY_R)) p.x = nx;
  const ny = p.y + dy * step;
  if (!blocked(p.x, ny, BODY_R)) p.y = ny;
  p.x = clamp(p.x, TILE, WORLD_W - TILE);
  p.y = clamp(p.y, TILE, WORLD_H - TILE);
}

export function updateHub(dt, input, view) {
  if (!H.built) return;
  H.t += dt;
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

  // The regulars shift their weight. Nothing moves position — a crowd that
  // walks needs pathfinding, and a crowd that never twitches looks embalmed.
  for (const f of H.folk) {
    f.anim += dt * 1.4;
    f.frame = Math.floor(f.anim) % 4;
  }

  const halfW = (view?.w || 960) / 2;
  const halfH = (view?.h || 540) / 2;
  H.cam.x = WORLD_W <= halfW * 2 ? WORLD_W / 2 : clamp(p.x, halfW, WORLD_W - halfW);
  H.cam.y = WORLD_H <= halfH * 2 ? WORLD_H / 2 : clamp(p.y, halfH, WORLD_H - halfH);

  // Somebody to talk to beats something to open: the person is the rarer thing
  // and the one you have to be closer to.
  let bestFolk = null, folkD = Infinity;
  for (const f of H.folk) {
    if (!f.lines) continue;
    const d = Math.hypot(f.x - p.x, f.y - p.y);
    if (d < 78 && d < folkD) { bestFolk = f; folkD = d; }
  }
  H.nearFolk = bestFolk;

  let best = null, bestD = Infinity;
  if (!bestFolk) {
    for (const pt of POINTS) {
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
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
  // They turn to face you, which is most of what makes it feel like being
  // spoken to rather than at.
  const dx = H.player.x - f.x, dy = H.player.y - f.y;
  f.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
  return true;
}

export const hubTarget = () => H.near;
export const hubFolkTarget = () => H.nearFolk;
