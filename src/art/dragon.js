// ---------------------------------------------------------------------------
// dragon.js — Parduin, the Drake God.
//
// Every other creature in the game is a flat sprite. Parduin is not: he is
// built as separate anatomical pieces — body, each wing, the tail — rasterised
// once and then composed every frame with their own transforms. That is what
// buys the wingbeat, the tail sway, the breathing chest and the throat that
// lights up before he breathes, none of which a fixed spritesheet could do
// without a dozen hand-drawn frames.
//
// The body is drawn on its left half and mirrored, so he is exactly symmetric.
// ---------------------------------------------------------------------------

import { pixelSurface, outlinePixels, upscale, mirrorHalf, makeCanvas, flipX, glow } from './pixel.js';
import { clamp } from '../core/util.js';

// Scales run from a hot, near-molten belly to cold volcanic-rock ridges.
const C = {
  out:      '#0a0510',
  scale:    '#8e2a1c',
  scaleLo:  '#59150e',
  scaleHi:  '#c9502c',
  scaleTop: '#e8763f',
  belly:    '#e0a955',
  bellyLo:  '#a26a29',
  horn:     '#e6dcc4',
  hornLo:   '#9d9075',
  claw:     '#f2ebd8',
  eye:      '#ffe066',
  eyeHot:   '#fff6c9',
  fire:     '#ff8a2a',
  fireHot:  '#ffd75e',
  membrane: '#7d2b22',
  membraneLo: '#4a150f',
  membraneHi: '#b8503a',
  vein:     '#e07a45',
};

const BODY_W = 100;      // drawn at 1px per unit, upscaled at build time
const BODY_H = 104;
const CX = 50;           // centre line for the mirrored half

// ---------------------------------------------------------------------------
// Body: horns, skull, neck, chest, limbs. Only x <= CX is drawn.
// ---------------------------------------------------------------------------
function buildBody() {
  const p = pixelSurface(BODY_W, BODY_H);

  // --- great swept horns -----------------------------------------------
  for (const [sx, sy, ex, ey, thick] of [
    [34, 20, 6, 2, 4],     // outer horn
    [37, 16, 20, 1, 3],    // inner horn
  ]) {
    // Taper the horn by walking it and shrinking the brush.
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const x = sx + (ex - sx) * k - Math.sin(k * 1.6) * 3;
      const y = sy + (ey - sy) * k;
      const t = Math.max(1, Math.round(thick * (1 - k * 0.75)));
      p.rect(x - t / 2, y - t / 2, t, t, k < 0.55 ? C.horn : C.hornLo);
    }
  }
  // Cheek spikes.
  p.poly([[30, 34], [16, 40], [31, 41]], C.hornLo);
  p.poly([[31, 40], [19, 47], [32, 46]], C.horn);

  // --- skull -------------------------------------------------------------
  p.ellipse(CX, 32, 20, 15, C.scale);
  p.ellipse(CX, 29, 19, 12, C.scaleHi);
  p.ellipse(CX, 24, 15, 7, C.scaleTop);          // lit crown
  // Brow ridge, heavy and overhanging.
  p.poly([[27, 30], [CX, 25], [CX, 33], [29, 37]], C.scaleLo);
  p.poly([[28, 29], [CX, 25], [CX, 30], [30, 33]], C.scaleHi);

  // --- snout -------------------------------------------------------------
  p.poly([[36, 38], [CX, 36], [CX, 62], [40, 56]], C.scale);
  p.poly([[38, 40], [CX, 38], [CX, 47], [41, 46]], C.scaleHi);
  p.poly([[40, 56], [CX, 58], [CX, 64], [42, 60]], C.scaleLo);   // jaw underside
  p.px(41, 45, C.out); p.px(42, 45, C.out);                       // nostril
  p.px(41, 46, C.out);

  // --- eye: deep socket, glowing slit ------------------------------------
  p.poly([[30, 33], [40, 31], [41, 38], [31, 39]], C.out);
  p.poly([[32, 34], [39, 33], [39, 37], [33, 37]], C.eye);
  p.rect(35, 33, 2, 5, C.out);                    // vertical drake pupil
  p.px(33, 34, C.eyeHot); p.px(34, 34, C.eyeHot);

  // --- jaw and fangs -----------------------------------------------------
  p.rect(40, 54, 11, 3, C.bellyLo);
  for (const fx of [42, 45, 48]) {
    p.poly([[fx, 54], [fx + 2, 54], [fx + 1, 59]], C.claw);
  }

  // --- neck: chevron scale rows ------------------------------------------
  p.poly([[38, 60], [CX, 60], [CX, 78], [36, 76]], C.scale);
  for (let i = 0; i < 4; i++) {
    const y = 62 + i * 4;
    p.poly([[39 + i * 0.5, y], [CX, y + 1], [CX, y + 3], [40 + i * 0.5, y + 3]], C.scaleHi);
  }

  // --- chest and belly scutes -------------------------------------------
  p.poly([[24, 78], [CX, 74], [CX, 100], [30, 98]], C.scale);
  p.poly([[27, 80], [CX, 77], [CX, 84], [30, 86]], C.scaleHi);   // pectoral
  for (let i = 0; i < 6; i++) {
    const y = 78 + i * 4;
    const w = 13 - Math.abs(i - 2) * 1.2;
    p.rect(CX - w, y, w, 3, i % 2 ? C.belly : C.bellyLo);
  }

  // --- shoulder spikes ---------------------------------------------------
  p.poly([[26, 76], [14, 68], [24, 82]], C.scaleLo);
  p.poly([[27, 77], [18, 71], [26, 81]], C.scaleHi);

  // --- foreleg with talons ----------------------------------------------
  p.poly([[24, 82], [16, 88], [18, 100], [28, 96]], C.scale);
  p.poly([[19, 88], [17, 96], [22, 96]], C.scaleLo);
  for (const [tx, ty] of [[13, 99], [17, 102], [22, 102]]) {
    p.poly([[tx, ty - 4], [tx + 3, ty - 4], [tx + 1, ty + 2]], C.claw);
  }

  // --- hind leg ----------------------------------------------------------
  p.poly([[30, 92], [24, 98], [26, 104], [36, 102]], C.scaleLo);
  for (const [tx, ty] of [[25, 104], [30, 104]]) {
    p.poly([[tx, ty - 3], [tx + 3, ty - 3], [tx + 1, ty + 2]], C.claw);
  }

  // --- spinal ridge ------------------------------------------------------
  for (let i = 0; i < 7; i++) {
    const y = 66 + i * 5;
    const h = 3 + Math.sin(i * 0.8) * 2;
    p.poly([[CX - 2, y], [CX, y - h], [CX, y + 2]], C.hornLo);
  }

  mirrorHalf(p.canvas);
  return outlinePixels(p.canvas, C.out);
}

// ---------------------------------------------------------------------------
// Wing: finger bones, membrane, scalloped trailing edge. Right wing; the left
// is a mirror. The shoulder pivot sits at the sprite's (2, 10).
// ---------------------------------------------------------------------------
const WING_W = 92;
const WING_H = 62;
const PIVOT = { x: 3, y: 12 };

function buildWing() {
  const p = pixelSurface(WING_W, WING_H);

  // Finger bones fan out from the shoulder; the membrane is stretched between.
  const fingers = [
    { ex: 88, ey: 4 },
    { ex: 84, ey: 24 },
    { ex: 70, ey: 42 },
    { ex: 50, ey: 55 },
    { ex: 26, ey: 58 },
  ];

  // Membrane first, as one polygon following the finger tips.
  const membrane = [[PIVOT.x, PIVOT.y]];
  for (const f of fingers) membrane.push([f.ex, f.ey]);
  membrane.push([12, 40]);
  p.poly(membrane, C.membrane);

  // Scalloped trailing edge: bite an arc out between each pair of fingertips.
  for (let i = 0; i < fingers.length - 1; i++) {
    const a = fingers[i], b = fingers[i + 1];
    const mx = (a.ex + b.ex) / 2, my = (a.ey + b.ey) / 2;
    const nx = -(b.ey - a.ey), ny = b.ex - a.ex;
    const nl = Math.hypot(nx, ny) || 1;
    const depth = 7;
    // Erase the scallop rather than paint it — the membrane is already there.
    p.ctx.save();
    p.ctx.globalCompositeOperation = 'destination-out';
    p.poly([
      [a.ex, a.ey],
      [mx + (nx / nl) * depth, my + (ny / nl) * depth],
      [b.ex, b.ey],
      [mx, my],
    ], '#000');
    p.ctx.restore();
  }

  // Shading: darker toward the trailing edge, lit along the leading edge.
  p.ctx.save();
  p.ctx.globalCompositeOperation = 'source-atop';
  p.poly([[PIVOT.x, PIVOT.y], [88, 4], [70, 30], [20, 44]], C.membraneHi);
  p.poly([[20, 44], [70, 34], [50, 55], [26, 58]], C.membraneLo);
  p.ctx.restore();

  // Veins tracing each finger, then the bones themselves.
  for (const f of fingers) {
    p.line(PIVOT.x + 1, PIVOT.y + 1, (PIVOT.x + f.ex) / 2, (PIVOT.y + f.ey) / 2 + 3, C.vein, 1);
  }
  for (const f of fingers) {
    p.line(PIVOT.x, PIVOT.y, f.ex, f.ey, C.scaleLo, 3);
    p.line(PIVOT.x, PIVOT.y, f.ex, f.ey, C.scale, 1);
  }

  // Shoulder mass and the thumb claw at the wing's leading joint.
  p.ellipse(PIVOT.x + 4, PIVOT.y + 2, 7, 6, C.scale);
  p.ellipse(PIVOT.x + 3, PIVOT.y, 5, 4, C.scaleHi);
  p.poly([[30, 6], [40, 1], [34, 12]], C.scaleLo);
  p.poly([[38, 3], [46, -1], [41, 7]], C.claw);

  return outlinePixels(p.canvas, C.out);
}

// ---------------------------------------------------------------------------
// Tail: drawn as a curve so it can sway behind the body.
// ---------------------------------------------------------------------------
const TAIL_W = 40;
const TAIL_H = 78;

function buildTail() {
  const p = pixelSurface(TAIL_W, TAIL_H);
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const x = 20 + Math.sin(k * 2.4) * 13 * k;
    const y = 2 + k * 68;
    const t = Math.max(2, Math.round(11 * (1 - k * 0.82)));
    p.rect(x - t / 2, y - t / 2, t, t, k < 0.5 ? C.scale : C.scaleLo);
    if (i % 4 === 0 && k < 0.85) {
      p.poly([[x - 1, y - t / 2], [x + 1, y - t / 2 - 4], [x + 2, y - t / 2]], C.hornLo);
    }
  }
  // Blade at the tip.
  const tipX = 20 + Math.sin(2.4) * 13, tipY = 70;
  p.poly([[tipX - 8, tipY], [tipX, tipY - 5], [tipX + 8, tipY], [tipX, tipY + 8]], C.hornLo);
  p.poly([[tipX - 4, tipY], [tipX, tipY - 3], [tipX + 4, tipY], [tipX, tipY + 4]], C.horn);
  return outlinePixels(p.canvas, C.out);
}

// ---------------------------------------------------------------------------
let parts = null;
export function dragonParts(scale = 2) {
  if (parts && parts.scale === scale) return parts;
  parts = {
    scale,
    body: upscale(buildBody(), scale),
    wing: upscale(buildWing(), scale),
    wingL: null,
    tail: upscale(buildTail(), scale),
    pivot: { x: PIVOT.x * scale, y: PIVOT.y * scale },
    bodyW: BODY_W * scale,
    bodyH: BODY_H * scale,
  };
  parts.wingL = flipX(parts.wing);
  return parts;
}

/**
 * Compose Parduin at world position (x, y).
 *
 * @param state  { t, flap, breath, hurt, dead, rage }
 *   flap   0..1 how hard he is beating his wings (1 while airborne)
 *   breath 0..1 throat charge — the glow that warns a fire breath is coming
 *   rage   0..1 phase-three heat, which reddens the whole silhouette
 */
export function drawParduin(ctx, x, y, scale, state = {}) {
  const P = dragonParts(2);
  const t = state.t || 0;
  const flap = clamp(state.flap ?? 0.25, 0, 1);
  const breath = clamp(state.breath || 0, 0, 1);
  const rage = clamp(state.rage || 0, 0, 1);

  const beat = Math.sin(t * (2.4 + flap * 4.5));
  const wingAngle = beat * (0.16 + flap * 0.5);
  const hover = state.airborne ? Math.sin(t * 2.2) * 7 * scale : 0;
  const breathe = 1 + Math.sin(t * 1.7) * 0.018;      // slow chest swell

  const bw = P.bodyW * scale, bh = P.bodyH * scale;

  ctx.save();
  ctx.translate(x, y + hover);

  // --- tail, behind everything ---
  const tailSway = Math.sin(t * 1.1) * 0.16;
  ctx.save();
  ctx.translate(0, bh * 0.32);
  ctx.rotate(tailSway);
  ctx.drawImage(P.tail, -P.tail.width * scale * 0.5, 0, P.tail.width * scale, P.tail.height * scale);
  ctx.restore();

  // --- wings, pivoting at the shoulders ---
  const shoulderY = -bh * 0.06;
  const shoulderX = bw * 0.19;
  const ww = P.wing.width * scale, wh = P.wing.height * scale;
  const px = P.pivot.x * scale, py = P.pivot.y * scale;

  ctx.save();
  ctx.translate(shoulderX, shoulderY);
  ctx.rotate(-wingAngle);
  ctx.drawImage(P.wing, -px, -py, ww, wh);
  ctx.restore();

  ctx.save();
  ctx.translate(-shoulderX, shoulderY);
  ctx.rotate(wingAngle);
  ctx.scale(-1, 1);
  ctx.drawImage(P.wing, -px, -py, ww, wh);
  ctx.restore();

  // --- body ---
  ctx.save();
  ctx.scale(1, breathe);
  ctx.drawImage(P.body, -bw / 2, -bh / 2, bw, bh);
  ctx.restore();

  ctx.restore();

  // --- light: eyes always, throat only while charging ---
  const headY = y + hover - bh * 0.19;
  const eyeDx = bw * 0.15;
  const eyePulse = 0.55 + 0.45 * Math.sin(t * 3.1);
  const TAU = Math.PI * 2;
  glow(ctx, x - eyeDx, headY, 9 * scale * (0.8 + eyePulse * 0.3), C.eye, 0.55 + rage * 0.3);
  glow(ctx, x + eyeDx, headY, 9 * scale * (0.8 + eyePulse * 0.3), C.eye, 0.55 + rage * 0.3);

  if (breath > 0.02) {
    const throatY = y + hover - bh * 0.05;
    glow(ctx, x, throatY, 26 * scale * breath, C.fire, 0.85 * breath);
    glow(ctx, x, throatY, 12 * scale * breath, C.fireHot, breath);
  }
  if (rage > 0.02) {
    glow(ctx, x, y + hover, bw * 0.75, '#ff4a1e', 0.22 * rage);
  }
}

/** Portrait used by the cutscene name card and the bestiary preview. */
export function dragonPortrait(scale = 2) {
  const P = dragonParts(2);
  const w = (P.bodyW + P.wing.width * 1.7) * scale * 0.5;
  const h = (P.bodyH + 30) * scale * 0.5;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingEnabled = false;
  drawParduin(ctx, w / 2, h / 2, scale * 0.5, { t: 0.8, flap: 0.5 });
  return canvas;
}

export const DRAGON_COLORS = C;
