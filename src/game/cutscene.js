// ---------------------------------------------------------------------------
// cutscene.js — boss entrances.
//
// Every boss gets the same five-beat cinematic skeleton (letterbox in, the
// summoning, the name card, the roar, letterbox out) but its own entrance
// effect and its own way of arriving: the Magus condenses out of a rune circle,
// the Tyrant erupts through a fissure, the Colossus shatters out of ice, the
// Sovereign steps through a tear, and Parduin falls out of the sky.
//
// Drawn in screen space over a frozen world, so it composes with the existing
// renderer without the game loop needing to know anything about it.
// ---------------------------------------------------------------------------

import { TAU, clamp, rand, makeRng } from '../core/util.js';
import { sfx, playMusic } from '../core/audio.js';
import { say } from '../core/voice.js';
import { drawBossFigure as drawBossArt } from '../art/bosses.js';
import { drawParduin } from '../art/dragon.js';
import { S, addShake, screenFlash } from './state.js';

const PHASES = [
  ['open', 0.55],
  ['summon', 2.5],
  ['name', 1.9],
  ['roar', 1.05],
  ['close', 0.5],
];
const TOTAL = PHASES.reduce((n, p) => n + p[1], 0);

export function startCutscene(def) {
  S.cutscene = {
    def,
    t: 0,
    total: TOTAL,
    rng: makeRng((def.id.length * 7919 + 13) | 0),
    roared: false,
    skipped: false,
    sparks: [],
  };
  playMusic(`boss:${def.id}`);
}

export function skipCutscene() {
  const cs = S.cutscene;
  if (!cs || cs.skipped) return;
  cs.skipped = true;
  // Jump to the tail of the roar so the fight still opens on an impact.
  cs.t = Math.max(cs.t, TOTAL - PHASES[4][1] - 0.15);
}

export const cutsceneActive = () => !!S.cutscene;

/** Which phase we are in, and how far through it (0..1). */
function phaseAt(t) {
  let acc = 0;
  for (const [name, dur] of PHASES) {
    if (t < acc + dur) return { name, k: (t - acc) / dur, local: t - acc, dur };
    acc += dur;
  }
  return { name: 'done', k: 1, local: 0, dur: 1 };
}

export function updateCutscene(dt) {
  const cs = S.cutscene;
  if (!cs) return false;
  cs.t += dt;
  const ph = phaseAt(cs.t);

  if (ph.name === 'roar' && !cs.roared) {
    cs.roared = true;
    sfx(`boss-${cs.def.id}-arrive`);
    addShake(22);
    screenFlash(cs.def.color, 0.5);
    setTimeout(() => say('battlecry', { force: true }), 620);
  }

  // Embers and motes drifting through the frame during the summon.
  if (ph.name === 'summon' && cs.sparks.length < 90) {
    for (let i = 0; i < 3; i++) {
      cs.sparks.push({
        x: rand(-0.1, 1.1), y: rand(0.2, 1.15),
        vy: -rand(0.04, 0.16), vx: rand(-0.03, 0.03),
        r: rand(1.2, 3.4), life: rand(0.6, 1),
      });
    }
  }
  for (let i = cs.sparks.length - 1; i >= 0; i--) {
    const s = cs.sparks[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 0.35;
    if (s.life <= 0) cs.sparks.splice(i, 1);
  }

  if (cs.t >= cs.total) { S.cutscene = null; return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Entrance effects
// ---------------------------------------------------------------------------
function sigil(ctx, cx, cy, r, k, color) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 2) * (1 - Math.max(0, k - 0.85) * 6);
  ctx.strokeStyle = color;
  ctx.translate(cx, cy);

  for (let ring = 0; ring < 3; ring++) {
    const rr = r * (0.45 + ring * 0.28);
    const dir = ring % 2 ? -1 : 1;
    ctx.save();
    ctx.rotate(k * 2.4 * dir + ring);
    ctx.lineWidth = ring === 1 ? 3 : 1.6;
    // Rings draw themselves in, arc by arc.
    const segs = 12 + ring * 6;
    for (let i = 0; i < segs; i++) {
      if (i / segs > k * 1.5) break;
      const a0 = (i / segs) * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, rr, a0, a0 + TAU / segs * 0.62);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Runic ticks radiating outward.
  ctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + k * 1.1;
    if (i / 16 > k * 1.4) break;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
    ctx.lineTo(Math.cos(a) * r * (0.9 + (i % 3) * 0.06), Math.sin(a) * r * (0.9 + (i % 3) * 0.06));
    ctx.stroke();
  }
  ctx.restore();
}

function fissure(ctx, cx, cy, w, k, color, rng) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 2.5);
  const r = makeRng(4242);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    const len = w * (0.25 + r() * 0.55) * Math.min(1, k * 1.4);
    ctx.strokeStyle = i % 2 ? color : '#ffd75e';
    ctx.lineWidth = 6 * (1 - i / 9);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    let x = cx, y = cy;
    for (let seg = 0; seg < 5; seg++) {
      x += Math.cos(a + (r() - 0.5) * 0.7) * (len / 5);
      y += Math.sin(a + (r() - 0.5) * 0.7) * (len / 5) * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Heat haze pooling in the crack.
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5 * k);
  g.addColorStop(0, 'rgba(255,180,72,0.55)');
  g.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - w, cy - w, w * 2, w * 2);
  ctx.restore();
}

function iceShards(ctx, cx, cy, r, k, color) {
  ctx.save();
  const rng = makeRng(909);
  const conv = Math.pow(k, 0.7);
  for (let i = 0; i < 22; i++) {
    const a = rng() * TAU;
    const start = r * 2.6;
    const d = start * (1 - conv) + r * 0.5 * conv;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.8;
    const s = 6 + rng() * 16;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + k * 3);
    ctx.globalAlpha = clamp(k * 1.6, 0, 1) * (1 - Math.max(0, k - 0.8) * 5);
    ctx.fillStyle = i % 3 ? color : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.32, 0);
    ctx.lineTo(0, s * 0.7);
    ctx.lineTo(-s * 0.32, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Frost creeping in from the frame edges.
  ctx.globalAlpha = k * 0.4;
  ctx.strokeStyle = '#dff4ff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const y = (i / 14) * ctx.canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(60 * k + (i % 3) * 20, y + 12);
    ctx.moveTo(ctx.canvas.width, y);
    ctx.lineTo(ctx.canvas.width - 60 * k - (i % 3) * 20, y + 12);
    ctx.stroke();
  }
  ctx.restore();
}

function rift(ctx, cx, cy, h, k, color) {
  ctx.save();
  const open = Math.sin(Math.min(1, k * 1.2) * Math.PI * 0.5);
  const w = 12 + open * 90;
  const grd = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.5, '#000000');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w, h * 0.62, 0, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w, h * 0.62, 0, 0, TAU);
  ctx.stroke();
  // Filaments arcing across the tear.
  const rng = makeRng(77);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 12; i++) {
    const y0 = cy + (rng() - 0.5) * h * 1.1;
    ctx.globalAlpha = 0.35 + rng() * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.9, y0);
    ctx.quadraticCurveTo(cx + (rng() - 0.5) * 40, y0 + (rng() - 0.5) * 30, cx + w * 0.9, y0 + (rng() - 0.5) * 20);
    ctx.stroke();
  }
  ctx.restore();
}

function skyDescent(ctx, cx, groundY, k, w, h) {
  ctx.save();
  // Wind streaks tearing down the frame.
  ctx.globalAlpha = 0.5 * Math.min(1, k * 3);
  ctx.strokeStyle = 'rgba(255,200,150,0.55)';
  ctx.lineWidth = 2;
  const rng = makeRng(313);
  for (let i = 0; i < 26; i++) {
    const x = rng() * w;
    const len = 60 + rng() * 160;
    const y = (rng() * h + k * 900) % (h + 200) - 100;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 8, y + len);
    ctx.stroke();
  }
  // The shadow on the ground grows as he drops — the thing you notice first.
  const s = 0.15 + k * 0.85;
  ctx.globalAlpha = 0.45 * Math.min(1, k * 1.6);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, groundY, 200 * s, 44 * s, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The cutscene frame
// ---------------------------------------------------------------------------
export function renderCutscene(ctx, w, h) {
  const cs = S.cutscene;
  if (!cs) return;
  const { def } = cs;
  const ph = phaseAt(cs.t);
  const cx = w / 2;
  const cy = h * 0.46;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // --- dim + letterbox ---
  const barK = ph.name === 'open' ? ph.k : ph.name === 'close' ? 1 - ph.k : 1;
  const eased = 1 - Math.pow(1 - clamp(barK, 0, 1), 3);
  ctx.globalAlpha = 0.72 * eased;
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  const bar = h * 0.12 * eased;
  ctx.fillRect(0, 0, w, bar);
  ctx.fillRect(0, h - bar, w, bar);

  if (ph.name === 'open') { ctx.restore(); return; }

  const summonK = ph.name === 'summon' ? ph.k : 1;
  const scaleBase = Math.min(w, h) / 620;

  // --- entrance effect ---
  ctx.save();
  switch (def.cutscene) {
    case 'sigil': sigil(ctx, cx, cy, 190 * scaleBase, summonK, def.color); break;
    case 'fissure': fissure(ctx, cx, cy + 90 * scaleBase, 300 * scaleBase, summonK, def.color); break;
    case 'ice': iceShards(ctx, cx, cy, 170 * scaleBase, summonK, def.color); break;
    case 'rift': rift(ctx, cx, cy, 240 * scaleBase, summonK, def.color); break;
    case 'descent': skyDescent(ctx, cx, cy + 150 * scaleBase, summonK, w, h); break;
  }
  ctx.restore();

  // --- the boss itself ---
  stageBoss(ctx, cs, def, cx, cy, summonK, ph, scaleBase);

  // --- roar shockwave ---
  if (ph.name === 'roar') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const rk = clamp(ph.k * 1.4 - i * 0.18, 0, 1);
      if (rk <= 0) continue;
      ctx.globalAlpha = (1 - rk) * 0.7;
      ctx.strokeStyle = i === 1 ? '#ffffff' : def.color;
      ctx.lineWidth = 10 * (1 - rk) + 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rk * Math.max(w, h) * 0.7, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- drifting embers ---
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = def.color;
  for (const s of cs.sparks) {
    ctx.globalAlpha = clamp(s.life, 0, 1) * 0.6;
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // --- name card ---
  if (ph.name === 'name' || ph.name === 'roar' || ph.name === 'close') {
    const nk = ph.name === 'name' ? clamp(ph.k * 2.2, 0, 1) : 1;
    const out = ph.name === 'close' ? 1 - ph.k : 1;
    drawNameCard(ctx, def, cx, h * 0.78, nk, out, scaleBase);
  }

  ctx.restore();
}

/** Places the boss in frame: how it arrives, and how it is lit. */
function stageBoss(ctx, cs, def, cx, cy, k, ph, scaleBase) {
  // How the boss arrives depends on the entrance.
  let alpha = 1, yOff = 0, sx = 1, sy = 1;
  const settle = ph.name === 'summon' ? k : 1;

  switch (def.cutscene) {
    case 'sigil':
      alpha = clamp((k - 0.25) * 2, 0, 1);
      sy = sx = 0.75 + settle * 0.25;
      break;
    case 'fissure':
      alpha = clamp(k * 2, 0, 1);
      yOff = (1 - Math.pow(settle, 0.55)) * 260 * scaleBase;
      break;
    case 'ice':
      alpha = clamp((k - 0.35) * 3, 0, 1);
      sx = 0.9 + settle * 0.1;
      break;
    case 'rift':
      alpha = clamp((k - 0.4) * 3, 0, 1);
      sx = clamp((k - 0.35) * 3, 0.05, 1);
      break;
    case 'descent':
      alpha = clamp(k * 2.2, 0, 1);
      // Falls fast, then brakes hard just above the ground.
      yOff = -(1 - Math.pow(settle, 2.4)) * 520 * scaleBase;
      break;
  }

  const bob = ph.name === 'roar' ? Math.sin(ph.k * 40) * 3 : 0;
  const y = cy + yOff + bob;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (def.sprite === 'parduin') {
    // Wings beat hard on the way down, then settle once he lands.
    const flap = def.cutscene === 'descent' ? clamp(1.1 - settle, 0.25, 1) : 0.35;
    drawParduin(ctx, cx, y, 1.55 * scaleBase, {
      t: cs.t * 1.6,
      flap,
      airborne: settle < 0.95,
      breath: ph.name === 'roar' ? clamp(ph.k * 2, 0, 1) : clamp(k - 0.7, 0, 1),
      rage: ph.name === 'roar' ? 1 : 0.3,
    });
  } else {
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(sx, sy);
    drawBossArt(ctx, def.sprite, 0, 0, 1.5 * scaleBase, {
      t: cs.t * 1.4,
      casting: ph.name === 'roar' ? 1 : clamp(k - 0.5, 0, 1) * 1.4,
      rage: ph.name === 'roar' ? 1 : 0,
    });
    ctx.restore();
  }
  ctx.restore();

  // A pool of the boss's own colour under it, so it reads as lit.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.22 * alpha * (ph.name === 'roar' ? 2 : 1);
  const g = ctx.createRadialGradient(cx, y, 0, cx, y, 260 * scaleBase);
  g.addColorStop(0, def.color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - 300 * scaleBase, y - 300 * scaleBase, 600 * scaleBase, 600 * scaleBase);
  ctx.restore();
}

function drawNameCard(ctx, def, cx, y, k, out, scaleBase) {
  const ease = 1 - Math.pow(1 - k, 3);
  const size = Math.round(34 * scaleBase);
  const name = (def.cutsceneName || def.name).toUpperCase();

  ctx.save();
  ctx.globalAlpha = out;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // The name slams in: wide letter-spacing collapsing to tight.
  const spacing = (1 - ease) * 26;
  ctx.font = `${size}px 'Silkscreen', 'Courier New', monospace`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;

  ctx.shadowColor = def.color;
  ctx.shadowBlur = 26 * ease;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = out * ease;
  ctx.fillText(name, cx, y);
  ctx.shadowBlur = 0;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  // Rule that wipes outward from the centre.
  const ruleW = Math.min(520 * scaleBase, name.length * size * 0.72) * ease;
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = out * ease * 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - ruleW / 2, y + size * 0.78);
  ctx.lineTo(cx + ruleW / 2, y + size * 0.78);
  ctx.stroke();

  if (def.title) {
    ctx.globalAlpha = out * clamp((k - 0.4) * 2.2, 0, 1);
    ctx.font = `${Math.round(13 * scaleBase)}px 'Chakra Petch', system-ui, sans-serif`;
    ctx.fillStyle = '#c9c0e0';
    ctx.fillText(def.title, cx, y + size * 1.5);
  }
  ctx.restore();
}
