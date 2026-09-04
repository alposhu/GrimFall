// ---------------------------------------------------------------------------
// world.js — the endless map.
//
// Nothing is stored: terrain, scenery and clutter are all pure functions of
// world position, so the map is infinite, seamless and costs no memory. Biome
// bands come from smooth noise and are dithered at the edges so one region
// bleeds into the next instead of ending on a straight line.
// ---------------------------------------------------------------------------

import { hash2, noise2, clamp, lerp } from '../core/util.js';
import { propSprite, PROP_KINDS } from '../art/props.js';
import { makeCanvas } from '../art/pixel.js';

export const BIOMES = [
  {
    id: 'meadow', name: 'Verdant Reach',
    ground: '#2b4a30', ground2: '#33562f', dirt: '#4a3a24',
    fog: '#0f1c14', ambient: 'firefly', ambientColor: '#d8ff8a',
    tint: { id: 'meadow', leaf: '#4f9a3c', leafDark: '#2f6a26', leafLight: '#7ec95a', flower: '#ff9ad2', crystal: '#8a5bff', crystalLight: '#c9a8ff', accent: '#d0453f' },
    props: [['tree_oak', 5], ['bush', 7], ['rock', 4], ['mushroom', 3], ['stump', 2], ['rock_small', 4]],
    decor: [['grass', 12], ['flower', 5], ['pebble', 3], ['fern', 3]],
  },
  {
    id: 'deepwood', name: 'Deepwood',
    ground: '#1e3826', ground2: '#24422a', dirt: '#3a2c1a',
    fog: '#0a150f', ambient: 'leaf', ambientColor: '#6fbf55',
    tint: { id: 'deepwood', leaf: '#357a34', leafDark: '#1f5222', leafLight: '#5fae4a', flower: '#c9a8ff', crystal: '#5ee8d0', crystalLight: '#b6fff2', accent: '#b1543f' },
    props: [['tree_pine', 9], ['tree_oak', 5], ['bush', 5], ['mushroom', 4], ['stump', 3], ['rock', 2]],
    decor: [['grass', 14], ['fern', 7], ['flower', 2], ['pebble', 2]],
  },
  {
    id: 'necropolis', name: 'Necropolis',
    ground: '#2b2b35', ground2: '#32323d', dirt: '#3a3038',
    fog: '#120f18', ambient: 'spirit', ambientColor: '#b08bff',
    tint: { id: 'necropolis', leaf: '#4a5a4a', leafDark: '#2c3a2e', leafLight: '#6f7f6a', flower: '#c8b6ff', crystal: '#8a5bff', crystalLight: '#c9a8ff', accent: '#7a5a9a' },
    props: [['gravestone', 8], ['pillar', 4], ['bones', 6], ['rock', 4], ['obelisk', 2], ['tree_pine', 2]],
    decor: [['grass', 6], ['pebble', 7], ['flower', 2]],
  },
  {
    id: 'frostmoor', name: 'Frostmoor',
    ground: '#42566b', ground2: '#4c6076', dirt: '#5b6c7e',
    fog: '#101a24', ambient: 'snow', ambientColor: '#e8f4ff',
    tint: { id: 'frostmoor', leaf: '#4d7a72', leafDark: '#2f5a58', leafLight: '#8fd8ff', flower: '#c9f2ff', crystal: '#7fd8ff', crystalLight: '#e0f7ff', accent: '#9fd6e8' },
    props: [['tree_pine', 6], ['rock', 6], ['crystal', 4], ['rock_small', 5], ['bones', 2]],
    decor: [['pebble', 8], ['grass', 4], ['flower', 2]],
  },
  {
    id: 'emberwaste', name: 'Emberwaste',
    ground: '#3d2622', ground2: '#472c25', dirt: '#5a3428',
    fog: '#1a0c0a', ambient: 'ember', ambientColor: '#ff9a3c',
    tint: { id: 'emberwaste', leaf: '#7a4a2a', leafDark: '#4f2916', leafLight: '#c2743c', flower: '#ff8a2a', crystal: '#ff6a3c', crystalLight: '#ffc07a', accent: '#e0602c' },
    props: [['rock', 7], ['obelisk', 3], ['bones', 5], ['brazier', 3], ['rock_small', 6], ['stump', 2]],
    decor: [['pebble', 10], ['grass', 2]],
  },
  {
    id: 'arcane', name: 'Arcane Wastes',
    ground: '#2e2550', ground2: '#352a5c', dirt: '#3d3168',
    fog: '#140f26', ambient: 'mote', ambientColor: '#9ad4ff',
    tint: { id: 'arcane', leaf: '#5a4a8a', leafDark: '#3a2e63', leafLight: '#8f7fd0', flower: '#8fd8ff', crystal: '#8a5bff', crystalLight: '#d0b6ff', accent: '#6f5bd0' },
    props: [['crystal', 8], ['obelisk', 4], ['pillar', 5], ['rock', 3], ['rock_small', 3]],
    decor: [['pebble', 6], ['grass', 3], ['flower', 4]],
  },
];

const TILE = 48;
const DECO_CELL = 56;
const PROP_CELL = 150;
const BIOME_SCALE = 1 / 1700;

let seed = 1;
export function setWorldSeed(s) { seed = (s | 0) || 1; }
export function getWorldSeed() { return seed; }

/** Smooth biome field, dithered at band edges so transitions look organic. */
export function biomeAt(x, y) {
  const n = noise2(x * BIOME_SCALE, y * BIOME_SCALE, seed * 7);
  const warp = noise2(x * BIOME_SCALE * 3.1, y * BIOME_SCALE * 3.1, seed * 13) * 0.12;
  const v = clamp(n + warp - 0.06, 0, 0.9999) * BIOMES.length;
  let idx = Math.floor(v);
  const frac = v - idx;
  // Dither the last 18% of a band against its neighbour.
  if (frac > 0.82 && hash2(Math.floor(x / TILE), Math.floor(y / TILE), seed * 31) < (frac - 0.82) / 0.18) idx++;
  return BIOMES[Math.min(BIOMES.length - 1, idx)];
}

// A tileable speckle overlay: one canvas, drawn as a pattern, adds grain to
// otherwise flat ground without costing per-pixel work each frame.
let grainPattern = null;
function grain(ctx) {
  if (grainPattern) return grainPattern;
  const { canvas, ctx: g } = makeCanvas(128, 128);
  for (let i = 0; i < 900; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.45 ? 'rgba(255,255,255,0.045)'
      : v < 0.8 ? 'rgba(0,0,0,0.10)'
      : 'rgba(180,220,180,0.05)';
    g.fillRect(Math.random() * 128, Math.random() * 128, Math.random() < 0.85 ? 2 : 3, Math.random() < 0.85 ? 2 : 3);
  }
  grainPattern = ctx.createPattern(canvas, 'repeat');
  return grainPattern;
}

// Memoised, because this is called once per ground tile per frame - a few
// hundred times at sixty frames a second - and every call used to build a new
// `rgb(...)` string. The inputs are a handful of biome colours crossed with
// fifteen brightness steps, so the whole space is a hundred-odd entries that
// are all computed within the first second and never again. It is the string
// churn that matters rather than the arithmetic: those were short-lived
// allocations at tens of thousands a second, which is how a phone ends up
// collecting garbage in the middle of a fight.
const shadeCache = new Map();
function shade(hex, amount) {
  const key = hex + amount;
  let out = shadeCache.get(key);
  if (out !== undefined) return out;
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amount, 0, 255) | 0;
  const g = clamp(((n >> 8) & 255) + amount, 0, 255) | 0;
  const b = clamp((n & 255) + amount, 0, 255) | 0;
  out = `rgb(${r},${g},${b})`;
  shadeCache.set(key, out);
  return out;
}

/**
 * Paint the ground for the visible rect (world coordinates).
 * Tiles are quantised so the camera never causes shimmer.
 */
const groundBuckets = new Map();

export function drawGround(ctx, view) {
  const x0 = Math.floor(view.left / TILE) - 1;
  const x1 = Math.ceil(view.right / TILE) + 1;
  const y0 = Math.floor(view.top / TILE) - 1;
  const y1 = Math.ceil(view.bottom / TILE) + 1;

  // Gathered by colour first, then drawn a colour at a time. Setting
  // `fillStyle` is a parse and a state change, and the tile colours are
  // deliberately noisy, so painting in tile order changed it on nearly every
  // one of the few hundred tiles on screen. There are only ever a few dozen
  // distinct colours in view, so bucketing turns hundreds of state changes into
  // a few dozen and leaves the same pixels behind.
  //
  // The buckets and their arrays are reused between frames - emptied, not
  // rebuilt - so the grouping itself allocates nothing.
  for (const arr of groundBuckets.values()) arr.length = 0;

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wx = tx * TILE, wy = ty * TILE;
      const b = biomeAt(wx + TILE / 2, wy + TILE / 2);
      const h = hash2(tx, ty, seed * 3);
      const patch = noise2(tx * 0.22, ty * 0.22, seed * 5);
      let col = h < 0.5 ? b.ground : b.ground2;
      if (patch > 0.74) col = b.dirt;
      const key = shade(col, Math.round((h - 0.5) * 14));
      let arr = groundBuckets.get(key);
      if (arr === undefined) groundBuckets.set(key, arr = []);
      arr.push(wx, wy);
    }
  }

  for (const [col, arr] of groundBuckets) {
    if (!arr.length) continue;
    ctx.fillStyle = col;
    for (let i = 0; i < arr.length; i += 2) ctx.fillRect(arr[i], arr[i + 1], TILE + 1, TILE + 1);
  }

  ctx.save();
  ctx.fillStyle = grain(ctx);
  ctx.globalAlpha = 0.55;
  const ox = Math.floor(view.left / 128) * 128;
  const oy = Math.floor(view.top / 128) * 128;
  ctx.translate(ox, oy);
  ctx.fillRect(0, 0, view.right - ox + 128, view.bottom - oy + 128);
  ctx.restore();
}

function weightedFromList(list, r) {
  let total = 0;
  for (const [, w] of list) total += w;
  let acc = r * total;
  for (const [k, w] of list) { acc -= w; if (acc <= 0) return k; }
  return list[0][0];
}

/**
 * Small ground clutter — drawn under everything else.
 * `density` thins the field by moving the acceptance threshold rather than by
 * changing the grid, so lowering quality never makes clutter jump around.
 */
export function drawDecor(ctx, view, density = 1) {
  if (density <= 0) return;
  const step = DECO_CELL;
  const x0 = Math.floor(view.left / step) - 1;
  const x1 = Math.ceil(view.right / step) + 1;
  const y0 = Math.floor(view.top / step) - 1;
  const y1 = Math.ceil(view.bottom / step) + 1;

  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const h = hash2(cx, cy, seed * 17);
      if (h > 0.72 * density) continue;
      const px = cx * step + hash2(cx, cy, seed * 19) * step;
      const py = cy * step + hash2(cx, cy, seed * 23) * step;
      const b = biomeAt(px, py);
      const kind = weightedFromList(b.decor, hash2(cx, cy, seed * 29));
      const variant = Math.floor(hash2(cx, cy, seed * 37) * 4);
      const img = propSprite(kind, variant, b.tint, 2);
      if (img) ctx.drawImage(img, Math.round(px - img.width / 2), Math.round(py - img.height));
    }
  }
}

/**
 * Collect scenery in view. Props are returned rather than drawn so the renderer
 * can depth-sort them together with creatures for a proper overlap.
 */
/**
 * The footprint a prop blocks, as a radius in world units — or 0 for scenery
 * you walk over.
 *
 * These are the BASE of the object, not its picture. A pine is thirty pixels
 * tall and almost all of that is canopy you should be able to walk behind, so
 * it blocks eight units at the trunk. Getting this wrong in the other
 * direction is what makes a wood feel like a corridor.
 *
 * Anything flat, soft or ankle-high is deliberately absent: bushes, mushrooms
 * and scattered bones are things you push through, and stopping the player dead
 * on a mushroom is worse than any realism it buys.
 */
const SOLID = {
  tree_pine: 8, tree_oak: 9, rock: 11, rock_small: 6, stump: 7,
  gravestone: 7, pillar: 10, crystal: 8, brazier: 7, obelisk: 11,
};

/** Props never move, so density must not decide what is solid. */
const SOLID_DENSITY = 1;

/**
 * Every solid prop whose footprint could touch a circle at (x, y).
 *
 * Scenery is not stored anywhere — it is a pure function of world position, and
 * that is what makes the map infinite and free. So collision regenerates the
 * handful of cells around the mover rather than looking anything up, which is a
 * few hashes over at most nine cells and cheaper than the array it would
 * otherwise have to maintain.
 *
 * It deliberately does NOT consult `density`. Quality settings thin out what
 * gets DRAWN; if they thinned out what blocks you as well, two players on the
 * same seed would be walking through different worlds, and lowering your
 * graphics would open shortcuts.
 */
export function forEachSolidProp(x, y, reach, fn) {
  const x0 = Math.floor((x - reach - PROP_CELL) / PROP_CELL);
  const x1 = Math.floor((x + reach + PROP_CELL) / PROP_CELL);
  const y0 = Math.floor((y - reach - PROP_CELL) / PROP_CELL);
  const y1 = Math.floor((y + reach + PROP_CELL) / PROP_CELL);

  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const h = hash2(cx, cy, seed * 41);
      if (h > 0.62 * SOLID_DENSITY) continue;
      const px = cx * PROP_CELL + hash2(cx, cy, seed * 43) * PROP_CELL;
      const py = cy * PROP_CELL + hash2(cx, cy, seed * 47) * PROP_CELL;
      const b = biomeAt(px, py);
      const kind = weightedFromList(b.props, hash2(cx, cy, seed * 53));
      const r = SOLID[kind];
      if (!r) continue;
      fn(px, py, r);
    }
  }
}

/**
 * Slide a circle out of any prop it is standing in.
 *
 * Resolved as a push-out rather than by refusing the move: refusing means
 * walking into a tree stops you dead and holding the stick keeps you stuck,
 * which reads as the game freezing. Pushing along the surface normal lets you
 * slide around the trunk while still being unable to walk through it, which is
 * what every game that does this well feels like.
 */
export function resolveProps(pos, radius) {
  forEachSolidProp(pos.x, pos.y, radius + 14, (px, py, pr) => {
    const dx = pos.x - px;
    // Footprints are read as ellipses, squashed to match the ground plane the
    // world is drawn on: a circle would block a step above a rock's base, where
    // the picture clearly shows floor.
    const dy = (pos.y - py) * 1.9;
    const min = radius + pr;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 === 0) return;
    const d = Math.sqrt(d2);
    const push = (min - d) / d;
    pos.x += dx * push;
    pos.y += dy * push / 1.9;
  });
}

export function collectProps(view, out, density = 1) {
  const pad = 64;
  const x0 = Math.floor((view.left - pad) / PROP_CELL);
  const x1 = Math.ceil((view.right + pad) / PROP_CELL);
  const y0 = Math.floor((view.top - pad) / PROP_CELL);
  const y1 = Math.ceil((view.bottom + pad) / PROP_CELL);

  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const h = hash2(cx, cy, seed * 41);
      if (h > 0.62 * density) continue;
      const px = cx * PROP_CELL + hash2(cx, cy, seed * 43) * PROP_CELL;
      const py = cy * PROP_CELL + hash2(cx, cy, seed * 47) * PROP_CELL;
      const b = biomeAt(px, py);
      const kind = weightedFromList(b.props, hash2(cx, cy, seed * 53));
      if (!PROP_KINDS.includes(kind)) continue;
      const variant = Math.floor(hash2(cx, cy, seed * 59) * 4);
      const img = propSprite(kind, variant, b.tint, 2);
      if (!img) continue;
      out.push({ x: px, y: py, img, sortY: py, prop: true });
    }
  }
  return out;
}

/** Colour used for the vignette and light haze at the screen edges. */
export function fogColorAt(x, y) { return biomeAt(x, y).fog; }

export function biomeNameAt(x, y) { return biomeAt(x, y).name; }

/** Interpolated ambient colour, used to tint particles and lighting. */
export function ambientAt(x, y) {
  const b = biomeAt(x, y);
  return { kind: b.ambient, color: b.ambientColor };
}

export { TILE, lerp };
