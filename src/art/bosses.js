// ---------------------------------------------------------------------------
// bosses.js — the four hierarchs, rebuilt.
//
// Design language borrowed from Spanish Baroque religious painting by way of
// Blasphemous: bodies fused with architecture and objects, halos that are
// gilded cages rather than rings, penitent's conical hoods, crowns of nails,
// heavy velvet drapery with deep folds, gold leaf over desaturated stone, and
// faces that are absent, hidden or carried in the hands.
//
// The designs are original — the vocabulary is the influence, not the figures.
//
// Like the dragon, each boss is assembled from separately rasterised parts and
// composed every frame, so robes sway, censers swing, halos turn and molten
// cracks pulse without a single hand-drawn animation frame.
// ---------------------------------------------------------------------------

import { pixelSurface, outlinePixels, upscale, mirrorHalf, makeCanvas, glow, sprite } from './pixel.js';
import { clamp, TAU } from '../core/util.js';

// Palette drawn from the source material: gold leaf and bone against
// desaturated stone, with saturated accents reserved for what matters.
const C = {
  out:      '#0b0710',
  gold:     '#d9a441',
  goldHi:   '#ffe9a8',
  goldLo:   '#8a5f1e',
  bone:     '#e8dfc8',
  boneLo:   '#a89a78',
  flesh:    '#c9a184',
  fleshLo:  '#8a6349',
  crimson:  '#8e1f2a',
  crimsonLo:'#4a0d14',
  crimsonHi:'#c8404a',
  stone:    '#6b6558',
  stoneLo:  '#3f3b33',
  stoneHi:  '#9a9382',
  verdigris:'#4f7a6a',
  bronze:   '#9a6b32',
  bronzeHi: '#d0994a',
  bronzeLo: '#5a3a17',
  violet:   '#4a2a6e',
  violetLo: '#26143a',
  violetHi: '#8a5fc4',
  ice:      '#bfe0f0',
  iceLo:    '#6d95ad',
  iceHi:    '#f0fbff',
  void:     '#1a1026',
  voidLo:   '#0d0715',
};

const W = 120, H = 132, CX = 60;

// ---------------------------------------------------------------------------
// Shared ornament
// ---------------------------------------------------------------------------

/** Vertical fold shading over a drape — the weight that makes cloth read heavy. */
function folds(p, x0, x1, yTop, yBot, dark, light, count = 5) {
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = x0 + (x1 - x0) * t;
    const lean = (t - 0.5) * 6;
    p.poly([
      [x - 1, yTop], [x + 1, yTop],
      [x + 2 + lean, yBot], [x - 2 + lean, yBot],
    ], i % 2 ? dark : light);
  }
}

/** A row of studs / nail heads, the small repeated motif Baroque metalwork lives on. */
function studs(p, x0, x1, y, step, col, hi) {
  for (let x = x0; x <= x1; x += step) {
    p.rect(x, y, 2, 2, col);
    p.px(x, y, hi);
  }
}

/** A hanging chain, drawn link by link. */
function chain(p, x0, y0, x1, y1, col, hi) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    p.rect(x - 1, y - 1, 2, 2, i % 2 ? col : hi);
  }
}

// ---------------------------------------------------------------------------
// 1. The Hollow Magus — a penitent whose hood contains nothing
// ---------------------------------------------------------------------------
function buildMagus() {
  const p = pixelSurface(W, H);

  // Capirote: the tall conical hood of a Holy Week penitent.
  p.poly([[CX, 4], [CX - 22, 62], [CX, 62]], C.violet);
  p.poly([[CX, 4], [CX - 13, 62], [CX, 62]], C.violetLo);
  p.poly([[CX, 6], [CX - 20, 58], [CX - 15, 58]], C.violetHi);
  // Embroidered band and eye-slit void.
  p.rect(CX - 20, 44, 20, 3, C.gold);
  studs(p, CX - 19, CX - 4, 44, 4, C.goldLo, C.goldHi);
  p.poly([[CX - 14, 50], [CX, 49], [CX, 56], [CX - 13, 55]], C.voidLo);

  // Shoulders and the great robe, weighted and wide at the hem.
  p.poly([[CX - 12, 60], [CX, 58], [CX, 120], [CX - 40, 118]], C.violet);
  p.poly([[CX - 10, 62], [CX, 60], [CX, 82], [CX - 22, 80]], C.violetLo);
  folds(p, CX - 38, CX - 4, 80, 118, C.violetLo, C.violetHi, 4);
  // Gold hem, the one bright line at the bottom of the silhouette.
  p.rect(CX - 40, 116, 40, 4, C.gold);
  studs(p, CX - 38, CX - 4, 117, 5, C.goldLo, C.goldHi);

  // A skeletal hand emerging from the sleeve, holding the censer chain.
  p.poly([[CX - 30, 84], [CX - 22, 82], [CX - 20, 96], [CX - 30, 96]], C.violetLo);
  p.rect(CX - 30, 94, 6, 5, C.bone);
  p.px(CX - 28, 97, C.out);

  // Thorn-crown wound around the base of the hood.
  for (let i = 0; i < 7; i++) {
    const x = CX - 22 + i * 3;
    p.px(x, 61, C.boneLo);
    p.poly([[x, 60], [x + 2, 60], [x + 1, 57]], C.bone);
  }

  mirrorHalf(p.canvas);
  return outlinePixels(p.canvas, C.out);
}

/** The censer swings on its chain, so it is a separate part. */
function buildCenser() {
  const p = pixelSurface(22, 26);
  chain(p, 11, 0, 11, 9, C.goldLo, C.gold);
  p.ellipse(11, 16, 8, 7, C.gold);
  p.ellipse(11, 15, 6, 5, C.goldHi);
  p.ellipse(11, 17, 7, 4, C.goldLo);
  p.rect(4, 13, 15, 2, C.goldLo);
  // Pierced vents the smoke escapes through.
  for (const x of [7, 11, 15]) p.rect(x, 17, 2, 3, C.voidLo);
  p.poly([[8, 23], [14, 23], [11, 26]], C.goldLo);
  return outlinePixels(p.canvas, C.out);
}

// ---------------------------------------------------------------------------
// 2. Cinder Tyrant — a martyr fused with the bell that was cast around him
// ---------------------------------------------------------------------------
function buildTyrant() {
  const p = pixelSurface(W, H);

  // The bell IS the body: cracked bronze, molten seams, hung on a yoke.
  p.poly([[CX - 42, 116], [CX - 34, 54], [CX + 34, 54], [CX + 42, 116]], C.bronze);
  p.poly([[CX - 34, 116], [CX - 28, 56], [CX - 6, 56], [CX - 10, 116]], C.bronzeHi);
  p.poly([[CX + 16, 116], [CX + 20, 56], [CX + 34, 54], [CX + 42, 116]], C.bronzeLo);
  p.rect(CX - 44, 112, 88, 8, C.bronzeLo);
  p.rect(CX - 44, 112, 88, 2, C.bronzeHi);
  studs(p, CX - 40, CX + 40, 114, 6, C.gold, C.goldHi);
  // Decorative bands.
  for (const y of [70, 88]) {
    p.rect(CX - 37 + (y - 54) * 0.13, y, 74 - (y - 54) * 0.26, 3, C.goldLo);
  }

  // Molten cracks: drawn dark here, lit at runtime.
  const cracks = [
    [[CX - 20, 58], [CX - 24, 74], [CX - 16, 90], [CX - 22, 112]],
    [[CX + 8, 56], [CX + 14, 72], [CX + 6, 96], [CX + 12, 114]],
    [[CX - 2, 78], [CX + 2, 92], [CX - 4, 110]],
  ];
  for (const path of cracks) {
    for (let i = 0; i < path.length - 1; i++) {
      p.line(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], C.crimsonLo, 3);
      p.line(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], '#ff8a2a', 1);
    }
  }

  // The martyr above the rim: shoulders, and a head crowned with nails.
  p.poly([[CX - 22, 54], [CX + 22, 54], [CX + 16, 40], [CX - 16, 40]], C.fleshLo);
  p.ellipse(CX, 30, 15, 14, C.flesh);
  p.ellipse(CX - 4, 27, 10, 9, C.fleshLo);
  // No eyes: two hollows, in the manner of a carved effigy.
  p.ellipse(CX - 6, 29, 3, 3, C.voidLo);
  p.ellipse(CX + 6, 29, 3, 3, C.voidLo);
  p.poly([[CX - 7, 38], [CX + 7, 38], [CX + 4, 43], [CX - 4, 43]], C.crimsonLo);
  // Crown of nails, driven inward.
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI + (i / 8) * Math.PI;
    const x = CX + Math.cos(a) * 15, y = 30 + Math.sin(a) * 14;
    p.line(x, y, x + Math.cos(a) * 6, y + Math.sin(a) * 6, C.stoneHi, 2);
    p.px(x + Math.cos(a) * 7, y + Math.sin(a) * 7, C.bone);
  }
  // The yoke it hangs from, chained.
  p.rect(CX - 30, 14, 60, 6, C.stoneLo);
  p.rect(CX - 30, 14, 60, 2, C.stone);
  chain(p, CX - 24, 20, CX - 20, 42, C.stoneLo, C.stoneHi);
  chain(p, CX + 24, 20, CX + 20, 42, C.stoneLo, C.stoneHi);

  return outlinePixels(p.canvas, C.out);
}

// ---------------------------------------------------------------------------
// 3. Rime Colossus — a tomb effigy that stood up
// ---------------------------------------------------------------------------
function buildColossus() {
  const p = pixelSurface(W, H);

  // Carved marble figure, arms crossed over the chest as on a sarcophagus lid.
  p.poly([[CX - 30, 124], [CX - 24, 52], [CX, 46], [CX, 124]], C.iceLo);
  p.poly([[CX - 22, 120], [CX - 18, 56], [CX, 50], [CX, 120]], C.ice);
  folds(p, CX - 28, CX - 2, 66, 122, C.iceLo, C.iceHi, 4);

  // Hooded head, face a smooth blank plane — no features, like weathered stone.
  p.ellipse(CX, 30, 16, 17, C.iceLo);
  p.ellipse(CX, 30, 13, 14, C.ice);
  p.poly([[CX - 13, 24], [CX, 20], [CX, 40], [CX - 11, 38]], C.iceHi);
  // Two frozen tear-tracks where the eyes would be.
  p.rect(CX - 7, 30, 2, 12, C.iceHi);
  p.rect(CX + 5, 30, 2, 9, C.iceHi);

  // Crossed arms, hands holding a shattered votive candle.
  p.poly([[CX - 26, 68], [CX, 62], [CX, 74], [CX - 24, 80]], C.iceLo);
  p.poly([[CX - 24, 78], [CX, 72], [CX, 82], [CX - 22, 88]], C.ice);
  p.rect(CX - 6, 60, 5, 14, C.bone);
  p.rect(CX - 6, 60, 2, 14, C.boneLo);

  // Rime spurs breaking outward through the marble.
  for (const [x, y, len, ang] of [[-28, 62, 16, -2.5], [-30, 90, 13, -2.9], [-22, 44, 11, -2.2]]) {
    const bx = CX + x, by = y;
    p.poly([
      [bx, by - 3], [bx + Math.cos(ang) * len, by + Math.sin(ang) * len], [bx, by + 3],
    ], C.iceHi);
  }

  // Gilded reliquary collar — the one warm colour on a cold figure.
  p.rect(CX - 20, 50, 20, 4, C.gold);
  studs(p, CX - 19, CX - 3, 51, 5, C.goldLo, C.goldHi);

  mirrorHalf(p.canvas);
  return outlinePixels(p.canvas, C.out);
}

// ---------------------------------------------------------------------------
// 4. Void Sovereign — enthroned, headless, carrying its own crown
// ---------------------------------------------------------------------------
function buildSovereign() {
  const p = pixelSurface(W, H);

  // Baldachin throne: a tower of stone behind the figure.
  p.rect(CX - 34, 20, 34, 100, C.stoneLo);
  p.rect(CX - 34, 20, 8, 100, C.stone);
  p.poly([[CX - 34, 20], [CX, 6], [CX, 20]], C.stone);
  for (let y = 30; y < 110; y += 12) {
    p.rect(CX - 32, y, 30, 2, C.stoneHi);
  }

  // Velvet drapery spilling down over the throne and pooling at the base.
  p.poly([[CX - 30, 40], [CX, 34], [CX, 126], [CX - 40, 124]], C.crimson);
  p.poly([[CX - 26, 44], [CX, 38], [CX, 70], [CX - 24, 74]], C.crimsonHi);
  folds(p, CX - 38, CX - 2, 60, 124, C.crimsonLo, C.crimsonHi, 5);
  p.rect(CX - 40, 122, 40, 4, C.gold);

  // The seated body: shoulders, no head. A ragged stump of neck.
  p.poly([[CX - 24, 56], [CX, 52], [CX, 74], [CX - 22, 76]], C.violet);
  p.poly([[CX - 20, 58], [CX, 54], [CX, 64], [CX - 18, 66]], C.violetHi);
  p.poly([[CX - 8, 50], [CX, 48], [CX, 56], [CX - 7, 56]], C.crimsonLo);

  // Arms cradling the crowned head in its lap.
  p.poly([[CX - 24, 74], [CX - 12, 78], [CX - 10, 92], [CX - 24, 90]], C.violetLo);

  mirrorHalf(p.canvas);

  // The head is held asymmetrically — deliberately off the mirror line.
  const q = p;
  q.ellipse(CX + 6, 92, 11, 12, C.flesh);
  q.ellipse(CX + 3, 89, 8, 8, C.fleshLo);
  q.ellipse(CX + 2, 91, 3, 3, C.voidLo);
  q.ellipse(CX + 11, 91, 2, 3, C.voidLo);
  // Its crown, still on.
  q.rect(CX - 4, 80, 21, 4, C.gold);
  for (let i = 0; i < 5; i++) {
    const x = CX - 4 + i * 5;
    q.poly([[x, 80], [x + 3, 80], [x + 1, 74]], C.goldHi);
    q.px(x + 1, 73, C.violetHi);
  }

  return outlinePixels(q.canvas, C.out);
}

// ---------------------------------------------------------------------------
// A halo that is a cage, not a ring. Drawn at runtime so it can turn.
// ---------------------------------------------------------------------------
function drawCageHalo(ctx, x, y, r, t, color, opts = {}) {
  const bars = opts.bars ?? 12;
  const tilt = opts.tilt ?? 0.42;          // squash, to read as a ring in perspective
  const spin = t * (opts.speed ?? 0.35);

  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = opts.weight ?? 2;
  ctx.globalAlpha = opts.alpha ?? 0.9;

  // Two rails and the bars between them: a baldachin cage seen edge-on.
  for (const rr of [r, r * 0.72]) {
    ctx.beginPath();
    ctx.ellipse(0, 0, rr, rr * tilt, 0, 0, TAU);
    ctx.stroke();
  }
  for (let i = 0; i < bars; i++) {
    const a = spin + (i / bars) * TAU;
    const px = Math.cos(a) * r, py = Math.sin(a) * r * tilt;
    const qx = Math.cos(a) * r * 0.72, qy = Math.sin(a) * r * 0.72 * tilt;
    // Bars on the far side are dimmer, which sells the rotation.
    ctx.globalAlpha = (opts.alpha ?? 0.9) * (Math.sin(a) > 0 ? 1 : 0.35);
    ctx.beginPath();
    ctx.moveTo(px, py - (opts.height ?? 9));
    ctx.lineTo(qx, qy + 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Build + cache
// ---------------------------------------------------------------------------
const BUILDERS = {
  magus: buildMagus,
  demon: buildTyrant,
  frosttitan: buildColossus,
  sovereign: buildSovereign,
};

export const REDESIGNED = Object.keys(BUILDERS);

export function bossArt(id, scale = 2) {
  return sprite(`bossart:${id}:${scale}`, () => {
    const body = upscale(BUILDERS[id](), scale);
    const extra = id === 'magus' ? upscale(buildCenser(), scale) : null;
    return { body, extra, w: W * scale, h: H * scale };
  });
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------
/**
 * @param state { t, hurt, rage, casting, airborne }
 *   casting 0..1 — the wind-up before an attack, which every boss shows
 *   differently: the Magus's void brightens, the Tyrant's cracks run molten.
 */
export function drawBossFigure(ctx, id, x, y, scale, state = {}) {
  const art = bossArt(id, 2);
  const t = state.t || 0;
  const cast = clamp(state.casting || 0, 0, 1);
  const rage = clamp(state.rage || 0, 0, 1);
  const bw = art.w * scale, bh = art.h * scale;
  const lowFx = !!state.lowFx;

  // Everything hovers slightly; these are not creatures that walk.
  const hover = Math.sin(t * 1.3) * 3 * scale;
  const sway = Math.sin(t * 0.9) * 0.022;

  ctx.save();
  ctx.translate(x, y + hover);

  switch (id) {
    // ---- Magus: cage halo behind, censer swinging from the hand ----
    case 'magus': {
      if (!lowFx) {
        drawCageHalo(ctx, 0, -bh * 0.30, bw * 0.42, t, C.gold,
          { alpha: 0.55 + cast * 0.4, speed: 0.5, bars: 14, height: 11 * scale });
      }
      ctx.save();
      ctx.rotate(sway);
      ctx.drawImage(art.body, -bw / 2, -bh / 2, bw, bh);
      ctx.restore();
      // The censer swings on its chain, out of phase with the robe.
      const sw = Math.sin(t * 1.7) * 0.5;
      ctx.save();
      ctx.translate(-bw * 0.26, -bh * 0.12);
      ctx.rotate(sw);
      const cw = art.extra.width * scale, chh = art.extra.height * scale;
      ctx.drawImage(art.extra, -cw / 2, 0, cw, chh);
      ctx.restore();
      ctx.restore();

      // The hood is empty, and what is inside it looks back.
      const faceY = y + hover - bh * 0.13;
      glow(ctx, x, faceY, (14 + cast * 16) * scale, C.violetHi, 0.6 + cast * 0.4);
      glow(ctx, x, faceY, 6 * scale, '#ffffff', 0.35 + cast * 0.5);
      if (!lowFx) {
        const sx = x - bw * 0.26 * Math.cos(sway) - Math.sin(t * 1.7) * 6 * scale;
        glow(ctx, sx, y + hover + bh * 0.06, 10 * scale, C.gold, 0.4);
      }
      return;
    }

    // ---- Tyrant: the bell rocks, and the cracks run molten ----
    case 'demon': {
      ctx.rotate(Math.sin(t * 1.15) * 0.045);
      ctx.drawImage(art.body, -bw / 2, -bh / 2, bw, bh);
      ctx.restore();

      const heat = 0.45 + 0.35 * Math.sin(t * 3.4) + cast * 0.5 + rage * 0.3;
      if (!lowFx) {
        glow(ctx, x, y + hover + bh * 0.18, bw * 0.44, '#ff6a1e', 0.3 * heat);
        glow(ctx, x - bw * 0.14, y + hover + bh * 0.1, 16 * scale, '#ffb648', 0.5 * heat);
        glow(ctx, x + bw * 0.09, y + hover + bh * 0.16, 13 * scale, '#ff8a2a', 0.45 * heat);
      }
      // Nails in the crown catch the light.
      glow(ctx, x, y + hover - bh * 0.30, 12 * scale, '#ffd9a0', 0.25 + rage * 0.25);
      return;
    }

    // ---- Colossus: barely moves; the cold does the work ----
    case 'frosttitan': {
      ctx.drawImage(art.body, -bw / 2, -bh / 2, bw, bh);
      ctx.restore();

      if (!lowFx) {
        drawCageHalo(ctx, x, y + hover - bh * 0.36, bw * 0.36, -t, C.iceHi,
          { alpha: 0.5, speed: 0.22, bars: 10, tilt: 0.32, height: 7 * scale });
        glow(ctx, x, y + hover, bw * 0.5, C.ice, 0.16 + cast * 0.3);
      }
      // Breath fogs in front of the blank face.
      const b = 0.5 + 0.5 * Math.sin(t * 0.8);
      glow(ctx, x, y + hover - bh * 0.18, (10 + b * 8) * scale, C.iceHi, 0.22 * b + cast * 0.3);
      return;
    }

    // ---- Sovereign: throne still, drapery and held head alive ----
    case 'sovereign': {
      ctx.drawImage(art.body, -bw / 2, -bh / 2, bw, bh);
      ctx.restore();

      if (!lowFx) {
        drawCageHalo(ctx, x, y + hover - bh * 0.44, bw * 0.44, t, C.gold,
          { alpha: 0.6 + cast * 0.35, speed: 0.28, bars: 16, height: 13 * scale });
      }
      // The neck stump, and the eyes of the head in its lap.
      glow(ctx, x, y + hover - bh * 0.14, (9 + cast * 12) * scale, C.violetHi, 0.5 + cast * 0.4);
      glow(ctx, x + bw * 0.05, y + hover + bh * 0.20, 9 * scale, '#c05bff', 0.55);
      if (rage > 0.02) glow(ctx, x, y + hover, bw * 0.6, C.violetHi, 0.2 * rage);
      return;
    }

    default:
      ctx.drawImage(art.body, -bw / 2, -bh / 2, bw, bh);
      ctx.restore();
  }
}

/** Portrait for the arena card and the sprite preview. */
export function bossPortraitArt(id, scale = 1) {
  return sprite(`bossportrait:${id}:${scale}`, () => {
    const art = bossArt(id, 2);
    const w = art.w * scale, h = art.h * scale;
    const { canvas, ctx } = makeCanvas(w, h * 1.06);
    ctx.imageSmoothingEnabled = false;
    drawBossFigure(ctx, id, w / 2, h / 2 + h * 0.03, scale, { t: 1.1, lowFx: true });
    return canvas;
  });
}

export const BOSS_ART_COLORS = C;
