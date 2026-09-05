// ---------------------------------------------------------------------------
// hub.js — the Waystation, a walkable camp that sits in front of a run.
//
// WHAT THIS IS, AND WHY IT IS NOT A MENU.
//
// Co-op used to be a form: type a name, type a code, watch a list of names
// appear. That form told you four people were present and gave you no reason to
// believe it. A room you walk around in does the same job by demonstration —
// you see the others move, you see them stand by the gate when they are ready
// to go, and standing next to somebody is enough to mean something without a
// single line of interface saying so.
//
// It is deliberately reachable ALONE as well. A lobby you can only see when
// three friends are already online is a lobby nobody can look at, and the whole
// point of a place is that it is there when you arrive.
//
// HOW THE MAP IS BUILT.
//
// Declared, not painted. The districts below are rectangles with a material and
// a scatter of props, and `build()` turns them into a tile grid and a collision
// grid once, at boot. A hand-painted 72x56 array would be four thousand numbers
// nobody could read or change; this is thirty lines that say what the place is.
// The scatter is seeded, so the camp is the same camp every time — a waystation
// that rearranges itself between visits is not somewhere you can learn.
//
// The tiles are RPG Maker MZ material, cut and toned by
// tools/assets/build-rtp-art.py exactly like the Long Market's — see
// img/rtp/SOURCE.txt for the licence position. Everything falls back to
// code-drawn colour if the atlas is missing, so the camp is walkable even when
// the artwork is not there.
// ---------------------------------------------------------------------------

import { clamp, makeRng } from '../core/util.js';

export const TILE = 48;
export const MAP_W = 72;
export const MAP_H = 56;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/**
 * Where somebody arriving stands: on the road below the yard's well, facing
 * north up the gate road. Not the yard's exact centre — the well is there, and
 * spawning inside a solid is a bug that presents as "the controls do nothing".
 */
export const SPAWN = { x: 36 * TILE + TILE / 2, y: 33 * TILE + TILE / 2 };

const WALK_SPEED = 168;          // units per second; the run's hero does ~200
const BODY_R = 13;               // the walking circle, matched to the sprite

// ---------------------------------------------------------------------------
// The place
// ---------------------------------------------------------------------------
//
// Coordinates are in TILES. Rectangles are [x, y, w, h].
//
// The layout follows the same law the rest of the game's spaces do: distance
// carries meaning. The gate is north and unmissable, because leaving is what
// everyone is here to do. The fire is south, behind you as you face the gate,
// because that is where you wait. The Blight is in the far corner, as far from
// the fire as the map allows, and nothing points at it.
const DISTRICTS = [
  { id: 'yard', name: 'Muster Yard', rect: [28, 24, 16, 12], floor: 'slab' },
  { id: 'gateway', name: 'The Gate', rect: [32, 6, 8, 10], floor: 'dark' },
  { id: 'chronicle', name: 'The Chronicle', rect: [8, 14, 14, 12], floor: 'cobble' },
  { id: 'market', name: 'Market Row', rect: [48, 18, 16, 14], floor: 'brick' },
  { id: 'training', name: 'Training Yard', rect: [46, 38, 16, 12], floor: 'sand' },
  { id: 'fire', name: 'The Fire', rect: [26, 40, 16, 12], floor: 'dirt' },
  { id: 'blight', name: 'The Blight', rect: [5, 41, 14, 13], floor: 'dark' },
];

/** Roads, as [x1, y1, x2, y2] in tiles. Drawn 3 tiles wide, corners included. */
const ROADS = [
  [36, 12, 36, 30],        // gate -> yard
  [22, 30, 52, 30],        // chronicle -> yard -> market
  [36, 30, 36, 46],        // yard -> fire
  [36, 46, 52, 46],        // fire -> training
  [26, 46, 14, 46],        // fire -> the blight, the one road nobody takes
];

// Props placed by hand, because these are the ones that mean something. Each is
// [prop, tileX, tileY, solid].
const FIXTURES = [
  // The gate itself, flanked and lit.
  ['arch', 36, 11, false], ['lamppost', 34, 11, true], ['lamppost', 38, 11, true],
  ['lamppost', 34, 15, true], ['lamppost', 38, 15, true],

  // The yard: a brazier at the centre of everything, and something to sit on.
  ['well', 36, 30, true],
  ['lamppost', 31, 26, true], ['lamppost', 41, 26, true],
  ['lamppost', 31, 34, true], ['lamppost', 41, 34, true],
  ['crate', 33, 33, true], ['barrel', 34, 33, true], ['crate_tall', 39, 33, true],

  // The Chronicle: a counter you read the records off.
  ['counter', 14, 19, true], ['shelf_bare', 12, 18, true], ['shelf_bare', 17, 18, true],
  ['signpost', 21, 30, true],

  // Market Row: stalls along the top, awnings, trade signs.
  ['stall_wood', 50, 21, true], ['stall_stone', 54, 21, true], ['stall_wood', 58, 21, true],
  ['shelf_bread', 51, 25, true], ['shelf_fish', 55, 25, true], ['crate_tall', 59, 25, true],
  ['awning', 50, 24, false], ['awning', 54, 24, false], ['awning', 58, 24, false],
  ['signpost', 47, 30, true],

  // The Training Yard: things to hit.
  ['trestle', 50, 42, true], ['trestle', 54, 42, true], ['trestle', 58, 42, true],
  ['haystack', 50, 46, true], ['haystack', 54, 46, true], ['haystack', 58, 46, true],
  ['fence', 48, 39, true], ['fence', 60, 39, true],

  // The Fire: tents around it, logs to sit on.
  ['tent', 29, 43, true], ['tent_red', 39, 43, true],
  ['firewood', 34, 45, true], ['log', 33, 47, true], ['log', 39, 47, true],
  ['stump', 31, 47, true], ['stump', 41, 45, true],

  // The Blight. Dead things, and nothing that gives light.
  ['dead_tree', 9, 45, true], ['dead_birch', 12, 44, true], ['dead_tree', 15, 46, true],
  ['dead_birch', 8, 49, true], ['dead_tree', 13, 50, true],
  ['toadstool', 11, 47, false], ['mushrooms', 14, 48, false], ['toadstool', 10, 51, false],
  ['stump', 16, 50, true],
];

// Scattered, seeded. Trees on the greens between districts, so the camp has
// edges without a wall being drawn around it.
//
// The counts are high on purpose. At a third of these the camp was six paved
// islands adrift in a bright green field, which reads as an unfinished map
// rather than as a clearing — the districts need woodland pressing in on them
// to look like somewhere carved out of a forest instead of somewhere placed on
// a lawn.
const SCATTER = [
  { prop: 'tree', solid: true, count: 130, avoid: 2 },
  { prop: 'thicket', solid: true, count: 70, avoid: 2 },
  { prop: 'shrub', solid: false, count: 90, avoid: 1 },
  { prop: 'flowers', solid: false, count: 46, avoid: 1 },
  { prop: 'pebbles', solid: false, count: 34, avoid: 1 },
  { prop: 'stump', solid: true, count: 12, avoid: 2 },
];

// ---------------------------------------------------------------------------
// Interactive things
// ---------------------------------------------------------------------------
//
// Each is a point with a radius, a label, and an id the game reacts to. The
// hub itself knows nothing about what any of them DO — main.js wires the ids to
// screens, which keeps this file about the place rather than about the menus.
export const POINTS = [
  { id: 'gate', x: 36 * TILE, y: 14 * TILE, r: 76, label: 'The Gate — begin a run' },
  { id: 'chronicle', x: 14 * TILE, y: 21 * TILE, r: 66, label: 'The Chronicle — how to play' },
  { id: 'sanctuary', x: 54 * TILE, y: 23 * TILE, r: 80, label: 'Market Row — the Sanctuary' },
  { id: 'fire', x: 34 * TILE, y: 45 * TILE, r: 74, label: 'The Fire — play together' },
  { id: 'arena', x: 54 * TILE, y: 44 * TILE, r: 86, label: 'Training Yard — the Boss Arena' },
  { id: 'blight', x: 12 * TILE, y: 47 * TILE, r: 88, label: 'The Blight — something is wrong here' },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export const H = {
  built: false,
  floor: null,              // Uint8Array, MAP_W * MAP_H — index into MATERIALS
  solid: null,              // Uint8Array, 1 where nothing may walk
  props: [],                // { prop, x, y, sortY }
  player: { x: SPAWN.x, y: SPAWN.y, dir: 'north', frame: 0, moving: false, anim: 0 },
  others: [],               // remote avatars, filled by the net layer
  cam: { x: SPAWN.x, y: SPAWN.y },
  near: null,               // the POINT within reach, or null
  t: 0,
};

/** The materials, in the order the floor array indexes them. */
export const MATERIALS = ['grass', 'moss', 'dirt', 'sand', 'road', 'cobble', 'brick', 'clay', 'slab', 'dark'];
const mat = (name) => Math.max(0, MATERIALS.indexOf(name));

const idx = (tx, ty) => ty * MAP_W + tx;
const inMap = (tx, ty) => tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H;

function fill(floor, [x, y, w, h], material) {
  const v = mat(material);
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) if (inMap(tx, ty)) floor[idx(tx, ty)] = v;
  }
}

function road(floor, [x1, y1, x2, y2], width = 3) {
  const v = mat('road');
  const half = (width - 1) / 2;
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i++) {
    const cx = Math.round(x1 + ((x2 - x1) * i) / steps);
    const cy = Math.round(y1 + ((y2 - y1) * i) / steps);
    for (let oy = -half; oy <= half; oy++) {
      for (let ox = -half; ox <= half; ox++) {
        const tx = cx + ox, ty = cy + oy;
        if (inMap(tx, ty)) floor[idx(tx, ty)] = v;
      }
    }
  }
}

/**
 * Mark a prop's footprint solid.
 *
 * Only the BOTTOM row of a tall prop blocks. A tree is drawn two tiles high but
 * you walk past its canopy, not through it — blocking the whole rectangle makes
 * every tree a two-tile wall and the camp feels like a corridor.
 */
function block(solid, tx, ty, w) {
  for (let ox = 0; ox < w; ox++) {
    const x = tx + ox;
    if (inMap(x, ty)) solid[idx(x, ty)] = 1;
  }
}

const PROP_TILES = {
  tree: 2, thicket: 2, counter: 2, stall_wood: 2, stall_stone: 2, tent: 3, tent_red: 3,
};
const propWidth = (name) => PROP_TILES[name] || 1;

export function buildHub() {
  if (H.built) return;
  const floor = new Uint8Array(MAP_W * MAP_H);
  const solid = new Uint8Array(MAP_W * MAP_H);
  const props = [];
  const rng = makeRng(0x6a17);

  // Grass everywhere, then the districts cut into it, then the roads over the
  // top — later wins, which is what makes a road read as laid ON the ground.
  floor.fill(mat('grass'));
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (rng() < 0.06) floor[idx(tx, ty)] = mat('moss');
    }
  }
  for (const d of DISTRICTS) fill(floor, d.rect, d.floor);
  for (const r of ROADS) road(floor, r);

  // The map's rim is solid, so nobody walks off the edge of the world.
  for (let tx = 0; tx < MAP_W; tx++) { solid[idx(tx, 0)] = 1; solid[idx(tx, MAP_H - 1)] = 1; }
  for (let ty = 0; ty < MAP_H; ty++) { solid[idx(0, ty)] = 1; solid[idx(MAP_W - 1, ty)] = 1; }

  const add = (prop, tx, ty, isSolid) => {
    props.push({ prop, x: tx * TILE + TILE / 2, y: ty * TILE + TILE, sortY: ty * TILE + TILE });
    if (isSolid) block(solid, tx, ty, propWidth(prop));
  };
  for (const [prop, tx, ty, isSolid] of FIXTURES) add(prop, tx, ty, isSolid);

  // Scatter. Kept off every district and every road, so the greens fill in and
  // the places people actually stand do not.
  const open = [];
  for (let ty = 2; ty < MAP_H - 2; ty++) {
    for (let tx = 2; tx < MAP_W - 2; tx++) {
      const f = floor[idx(tx, ty)];
      if (f !== mat('grass') && f !== mat('moss')) continue;
      if (solid[idx(tx, ty)]) continue;
      open.push([tx, ty]);
    }
  }
  for (const s of SCATTER) {
    for (let n = 0; n < s.count && open.length; n++) {
      const at = Math.floor(rng() * open.length);
      const [tx, ty] = open.splice(at, 1)[0];
      // Keep a scattered prop off its neighbours, or twenty-six trees land in
      // one thicket and the rest of the map is bare.
      let clear = true;
      for (const p of props) {
        if (Math.abs(p.x - (tx * TILE + 24)) < s.avoid * TILE
          && Math.abs(p.y - (ty * TILE + 48)) < s.avoid * TILE) { clear = false; break; }
      }
      if (!clear) { n--; continue; }
      add(s.prop, tx, ty, s.solid);
    }
  }

  props.sort((a, b) => a.sortY - b.sortY);
  H.floor = floor;
  H.solid = solid;
  H.props = props;
  H.built = true;
}

export const floorAt = (tx, ty) => (inMap(tx, ty) ? MATERIALS[H.floor[idx(tx, ty)]] : 'grass');
export const isSolid = (tx, ty) => (!inMap(tx, ty) ? true : !!H.solid[idx(tx, ty)]);

/** Is this world point inside something solid, for a body of `r`? */
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
  H.t = 0;
}

/**
 * Walk, one axis at a time.
 *
 * Resolving both together makes a body that touches a corner stop dead; doing X
 * and then Y means it slides along the wall instead, which is what every player
 * expects and nobody can articulate.
 */
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
    // The facing follows the DOMINANT axis, so a diagonal walk does not flicker
    // between two sprites every frame.
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'east' : 'west';
    else p.dir = dy > 0 ? 'south' : 'north';
    p.anim += dt * 8;
    p.frame = Math.floor(p.anim) % 4;
  } else {
    p.anim = 0;
    p.frame = 0;
  }

  // Remote avatars walk themselves between the samples the network gave them —
  // see src/net/session.js for why that is done rather than snapping.
  for (const o of H.others) {
    o.anim = (o.anim || 0) + (o.moving ? dt * 8 : 0);
    o.frame = o.moving ? Math.floor(o.anim) % 4 : 0;
  }

  // The camera is clamped so the world never shows its own edge, unless the
  // view is wider than the map, in which case it centres instead.
  const halfW = (view?.w || 960) / 2;
  const halfH = (view?.h || 540) / 2;
  H.cam.x = WORLD_W <= halfW * 2 ? WORLD_W / 2 : clamp(p.x, halfW, WORLD_W - halfW);
  H.cam.y = WORLD_H <= halfH * 2 ? WORLD_H / 2 : clamp(p.y, halfH, WORLD_H - halfH);

  // What is in reach. Nearest wins, so two overlapping points cannot argue.
  let best = null, bestD = Infinity;
  for (const pt of POINTS) {
    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (d < pt.r && d < bestD) { best = pt; bestD = d; }
  }
  H.near = best;
}

/** What the player is standing at, for the interact key. */
export const hubTarget = () => H.near;
