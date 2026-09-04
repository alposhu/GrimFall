// ---------------------------------------------------------------------------
// particles.js — pooled effects: sparks, smoke, rings, shards, floating text
// and the drifting ambience that gives each biome its own weather.
// ---------------------------------------------------------------------------

import { rand, randInt, TAU, clamp } from '../core/util.js';
import { q } from '../core/quality.js';

const MAX = 1400;
const pool = [];
let count = 0;
let live = 0;

for (let i = 0; i < MAX; i++) {
  pool.push({ alive: false, kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff', drag: 0.9, grav: 0, rot: 0, spin: 0, glow: false });
}

function acquire() {
  // Past the tier's budget, new effects are simply dropped. Skipping a spark is
  // invisible; dropping a frame is not.
  if (live >= q.particleBudget) return null;
  for (let i = 0; i < MAX; i++) {
    const p = pool[(i + count) % MAX];
    if (!p.alive) { count = (count + i + 1) % MAX; p.alive = true; live++; return p; }
  }
  return null;
}

export function emit(kind, x, y, opts = {}) {
  const p = acquire();
  if (!p) return null;
  p.kind = kind;
  p.x = x; p.y = y;
  p.vx = opts.vx ?? 0;
  p.vy = opts.vy ?? 0;
  p.maxLife = p.life = opts.life ?? 0.5;
  p.size = opts.size ?? 3;
  p.color = opts.color ?? '#ffffff';
  p.drag = opts.drag ?? 0.86;
  p.grav = opts.grav ?? 0;
  p.rot = opts.rot ?? 0;
  p.spin = opts.spin ?? 0;
  p.glow = opts.glow ?? false;
  p.growth = opts.growth ?? 0;
  return p;
}

/** A radial spray — the workhorse for hits, deaths and impacts. */
export function burst(x, y, n, color, opts = {}) {
  const speed = opts.speed ?? 120;
  const spread = opts.spread ?? 0.6;
  for (let i = 0; i < n; i++) {
    const a = opts.angle !== undefined ? opts.angle + rand(-spread, spread) : rand(0, TAU);
    const s = speed * rand(0.35, 1.15);
    emit(opts.kind || 'spark', x, y, {
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: (opts.life ?? 0.42) * rand(0.7, 1.3),
      size: opts.size ?? rand(2, 4),
      color, drag: opts.drag ?? 0.9, grav: opts.grav ?? 0, glow: opts.glow ?? false,
    });
  }
}

export function ring(x, y, radius, color, opts = {}) {
  emit('ring', x, y, {
    life: opts.life ?? 0.4, size: opts.start ?? 4, color,
    growth: (radius - (opts.start ?? 4)) / (opts.life ?? 0.4),
    glow: true,
  });
}

export function smoke(x, y, n, color = '#4a4a55') {
  for (let i = 0; i < n; i++) {
    emit('puff', x + rand(-6, 6), y + rand(-6, 6), {
      vx: rand(-18, 18), vy: rand(-34, -8),
      life: rand(0.5, 1.1), size: rand(5, 11), color, drag: 0.94, growth: 12,
    });
  }
}

export function updateParticles(dt) {
  for (let i = 0; i < MAX; i++) {
    const p = pool[i];
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; live--; continue; }
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const d = Math.pow(p.drag, dt * 60);
    p.vx *= d; p.vy *= d;
    p.rot += p.spin * dt;
    if (p.growth) p.size += p.growth * dt;
  }
}

// Drawing a particle is cheap; CHANGING THE COMPOSITE MODE is not. Setting
// `globalCompositeOperation` can force the compositor to resolve the render
// target, and this loop used to set it once per particle - up to twelve hundred
// times a frame, alternating, because glowing and ordinary particles are
// interleaved in the pool. On a desktop that is invisible. On a phone GPU it
// was one of the most expensive things the renderer did.
//
// So the pool is walked twice and the mode is set twice: everything ordinary,
// then everything additive. Two passes over an array that is already in cache
// costs less than one avoidable state change, and the visual result is
// identical - additive particles were always drawn over the plain ones anyway,
// since they are sparks and flashes on top of debris.
function drawOne(ctx, p) {
  const t = clamp(p.life / p.maxLife, 0, 1);
  ctx.globalAlpha = t;
  ctx.fillStyle = p.color;

  switch (p.kind) {
    case 'ring':
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, 3 * t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.stroke();
      break;
    case 'puff':
      ctx.globalAlpha = t * 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
      break;
    case 'shard': {
      // `save`/`restore` per shard is a full state push for one rectangle.
      // The transform is undone by hand instead, which is the only piece of
      // state this branch actually touches.
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.rotate(-p.rot);
      ctx.translate(-p.x, -p.y);
      break;
    }
    case 'dot':
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, TAU);
      ctx.fill();
      break;
    default: {
      const s = p.size * (0.4 + t * 0.6);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }
}

export function drawParticles(ctx, lowFx = false) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  let additive = 0;
  for (let i = 0; i < MAX; i++) {
    const p = pool[i];
    if (!p.alive) continue;
    if (p.glow && !lowFx) { additive++; continue; }
    drawOne(ctx, p);
  }

  if (additive) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (p.alive && p.glow) drawOne(ctx, p);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

export function clearParticles() {
  for (const p of pool) p.alive = false;
  live = 0;
}

// ---------------------------------------------------------------------------
// Floating combat text
// ---------------------------------------------------------------------------
const texts = [];

export function floatText(x, y, text, color = '#fff', opts = {}) {
  if (texts.length >= q.textBudget) texts.shift();
  texts.push({
    x, y, text, color,
    vx: opts.vx ?? rand(-14, 14),
    vy: opts.vy ?? -46,
    life: opts.life ?? 0.75,
    maxLife: opts.life ?? 0.75,
    size: opts.size ?? 11,
    crit: !!opts.crit,
  });
}

export function updateTexts(dt) {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt;
    if (t.life <= 0) { texts.splice(i, 1); continue; }
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    t.vy += 60 * dt;
  }
}

export function drawTexts(ctx) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of texts) {
    const k = t.life / t.maxLife;
    const pop = t.crit ? 1 + (1 - k) * 0.25 : 1;
    ctx.globalAlpha = Math.min(1, k * 1.8);
    ctx.font = `${Math.round(t.size * pop)}px "Chakra Petch", system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
}

export function clearTexts() { texts.length = 0; }

// ---------------------------------------------------------------------------
// Ambience — biome weather that follows the camera
// ---------------------------------------------------------------------------
const ambient = [];
const AMBIENT_COUNT = 70;

export function initAmbient(view) {
  ambient.length = 0;
  for (let i = 0; i < AMBIENT_COUNT; i++) {
    ambient.push({
      x: rand(view.left, view.right),
      y: rand(view.top, view.bottom),
      seed: rand(0, TAU),
      speed: rand(0.4, 1.4),
      size: rand(1.5, 3.2),
      phase: rand(0, TAU),
    });
  }
}

export function updateAmbient(dt, view, kind, time) {
  if (!ambient.length) initAmbient(view);
  const w = view.right - view.left, h = view.bottom - view.top;
  for (const a of ambient) {
    switch (kind) {
      case 'snow':
        a.x += Math.sin(time * 0.6 + a.seed) * 14 * dt + 12 * dt;
        a.y += 34 * a.speed * dt;
        break;
      case 'ember':
        a.x += Math.sin(time * 1.3 + a.seed) * 20 * dt;
        a.y -= 30 * a.speed * dt;
        break;
      case 'leaf':
        a.x += (Math.sin(time * 0.8 + a.seed) * 26 + 10) * dt;
        a.y += 18 * a.speed * dt;
        break;
      case 'spirit':
      case 'mote':
      default:
        a.x += Math.cos(time * 0.5 + a.seed) * 16 * dt;
        a.y += Math.sin(time * 0.42 + a.seed * 1.7) * 16 * dt;
    }
    // Wrap into the visible rect so ambience always surrounds the player.
    if (a.x < view.left - 40) a.x += w + 80;
    if (a.x > view.right + 40) a.x -= w + 80;
    if (a.y < view.top - 40) a.y += h + 80;
    if (a.y > view.bottom + 40) a.y -= h + 80;
  }
}

export function drawAmbient(ctx, color, time, kind) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  for (const a of ambient) {
    const twinkle = kind === 'firefly' || kind === 'spirit' || kind === 'mote'
      ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 3 + a.phase))
      : 0.7;
    ctx.globalAlpha = 0.5 * twinkle;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function particleCount() {
  let n = 0;
  for (const p of pool) if (p.alive) n++;
  return n;
}

export { randInt };
