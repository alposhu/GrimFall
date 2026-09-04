// ---------------------------------------------------------------------------
// util.js — small math / random / helper library shared by the whole game.
// No dependencies, no DOM. Everything here is pure.
// ---------------------------------------------------------------------------

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Frame-rate independent easing factor: approach `target` by `rate` per second. */
export const damp = (rate, dt) => 1 - Math.pow(1 - rate, dt * 60);

// ---------------------------------------------------------------------------
// The run's random number generator.
//
// Everything below used to call Math.random() directly. That is fine for one
// person and impossible for several: in co-op each client simulates the same
// enemies locally and only corrects against the owner, and two clients rolling
// different numbers diverge immediately — a boss picking a different attack on
// every screen, spawn positions that do not agree, crits that land for one
// player and not another.
//
// So the run seeds this once and everyone gets the same stream. It is a
// mulberry32: thirty-two bits of state, uniform enough for a game, and about as
// fast as Math.random. Unseeded it falls back to Math.random, which keeps every
// non-run use (menus, the title sky, cosmetic sparks before a run begins)
// behaving exactly as before.
let rngState = 0;
let seeded = false;

export function seedRandom(seed) {
  rngState = (seed >>> 0) || 1;
  seeded = true;
}

export function unseedRandom() { seeded = false; }

/** Uniform [0, 1). The single source every helper below draws from. */
export function random() {
  if (!seeded) return Math.random();
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** So a client can be told exactly where in the stream the owner is. */
export const randomState = () => rngState;
export const setRandomState = (v) => { rngState = v >>> 0; };

export const rand = (a = 1, b) => (b === undefined ? random() * a : a + random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(random() * arr.length) | 0];
export const chance = (p) => random() < p;

/** Fisher-Yates, in place. */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Weighted pick. `items` is [{ weight, ... }]. */
export function weightedPick(items, weightOf = (x) => x.weight) {
  let total = 0;
  for (const it of items) total += weightOf(it);
  let r = random() * total;
  for (const it of items) { r -= weightOf(it); if (r <= 0) return it; }
  return items[items.length - 1];
}

/** A tiny deterministic PRNG (mulberry32) so seeded worlds are reproducible. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 2D hash in [0,1) — used for infinite, repeatable terrain. */
export function hash2(ix, iy, seed = 0) {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  n = n ^ (n >>> 13);
  n = Math.imul(n, 1274126177);
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

/** Value noise built on hash2 — smooth, cheap, good enough for ground tinting. */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.floor(n));
}

/**
 * Swap-remove: O(1) removal that does not preserve order. Every entity array in
 * the game is unordered, so this is the removal used everywhere in the hot loop.
 */
export function swapRemove(arr, i) {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.pop();
}

/** Filters an array in place, keeping entries where `e.dead` is falsy. */
export function pruneDead(arr) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[w++] = arr[i];
  arr.length = w;
}
