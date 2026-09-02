// ---------------------------------------------------------------------------
// balloons.js — expression balloons.
//
// The vocabulary is the one every 2D RPG has converged on, because it works:
// ten symbols that read instantly at a glance and need no translation. A
// merchant who has noticed you pops an exclamation; two townsfolk gossiping
// trade notes and hearts; somebody who cannot help you sweats.
//
// Two versions of the same ten symbols exist here. The drawn one takes the
// game's own ink and parchment and animates the glyph inside the bubble — the
// note bobs, the heart beats, the sleeper's z's drift upward. The sheeted one
// is the RPG Maker MZ balloon sheet, eight authored frames per symbol, which
// is what the market uses when its atlas has decoded.
//
// `drawBalloon` picks whichever is available and keeps the same pop-in and
// fade-out envelope either way, so the two never look like different effects.
// ---------------------------------------------------------------------------

import { rasterize, sprite, pixelSurface, outlinePixels, upscale } from './pixel.js';
import { rtpBalloon, rtpBalloonFrames } from './rtp.js';

const INK = '#241d30';
const PAPER = '#f2ead6';
const PAPER_2 = '#d8ceb4';

export const BALLOON_KINDS = [
  'exclaim', 'question', 'note', 'heart', 'anger',
  'sweat', 'confused', 'silence', 'idea', 'sleep',
];

// ---------------------------------------------------------------------------
// The bubble
// ---------------------------------------------------------------------------
const W = 26, H = 22, BODY_H = 17;

/** A rounded bubble with a tail on the lower left, in one piece. */
function buildBubble() {
  const s = pixelSurface(W, H);
  // Body: a rounded rectangle built from three stacked spans.
  s.rect(2, 0, W - 4, BODY_H, PAPER);
  s.rect(1, 2, W - 2, BODY_H - 4, PAPER);
  s.rect(0, 4, W, BODY_H - 8, PAPER);
  // A shaded lower lip gives the paper a little thickness.
  s.rect(2, BODY_H - 3, W - 4, 2, PAPER_2);
  s.rect(1, BODY_H - 4, 1, 2, PAPER_2);
  s.rect(W - 2, BODY_H - 4, 1, 2, PAPER_2);
  // Tail, tapering down-left towards whoever is speaking.
  s.rect(8, BODY_H - 1, 6, 1, PAPER);
  s.rect(8, BODY_H, 5, 1, PAPER_2);
  s.rect(8, BODY_H + 1, 3, 1, PAPER_2);
  s.rect(8, BODY_H + 2, 2, 1, PAPER_2);
  s.rect(8, BODY_H + 3, 1, 1, PAPER_2);
  outlinePixels(s.canvas, INK);
  return s.canvas;
}

export const balloonBubble = (scale = 2) =>
  sprite(`balloon:bubble:${scale}`, () => upscale(buildBubble(), scale));

// ---------------------------------------------------------------------------
// The glyphs
// ---------------------------------------------------------------------------
// Palette keys: o outline  a accent  A accent light  b body  w white
const GLYPHS = {
  exclaim: {
    pal: { o: '#7a2a10', a: '#ff8a2a', A: '#ffd75e' },
    map: [
      '..oooo..',
      '.oaAAao.',
      '.oaAAao.',
      '.oaAAao.',
      '.oaAAao.',
      '..oaao..',
      '..oaao..',
      '..oooo..',
      '........',
      '..oooo..',
      '.oaAAao.',
      '.oaAAao.',
      '..oooo..',
    ],
  },
  question: {
    pal: { o: '#123a5a', a: '#3c8fd8', A: '#9ad4ff' },
    map: [
      '..oooo..',
      '.oaAAao.',
      'oaAoooAo',
      'oaAo.oao',
      'oooo.oao',
      '....oaAo',
      '...oaAoo',
      '..oaAoo.',
      '..oaao..',
      '..oooo..',
      '........',
      '..oooo..',
      '.oaAAao.',
      '.oaAAao.',
      '..oooo..',
    ],
  },
  note: {
    pal: { o: '#1f1a2e', a: '#5a4f7a', A: '#b9a8cf' },
    map: [
      '.....ooo',
      '....oaAo',
      '...oaAAo',
      '..oaAoao',
      '..oaoooo',
      '..oaAo..',
      '..oaAo..',
      '..oaAo..',
      '.ooaAo..',
      'oaaaAo..',
      'oaAAoo..',
      'oaaao...',
      '.oooo...',
    ],
  },
  heart: {
    pal: { o: '#7a1030', a: '#ff4d8a', A: '#ffa8c4' },
    map: [
      '.oo..oo.',
      'oAaooaAo',
      'oAaaaaAo',
      'oaaaaaao',
      '.oaaaao.',
      '..oaaao.',
      '...oao..',
      '....o...',
    ],
  },
  anger: {
    pal: { o: '#5a0f18', a: '#e02a3c', A: '#ff6a7a' },
    map: [
      '..o..o..',
      '.oao.oao',
      'ooaoooao',
      'oaaaaaao',
      'ooaoooao',
      '.oao.oao',
      'ooaoooao',
      'oaaaaaao',
      'ooaoooao',
      '.oao.oao',
      '..o..o..',
    ],
  },
  sweat: {
    pal: { o: '#123a5a', a: '#3c8fd8', A: '#9ad4ff' },
    map: [
      '...oo...',
      '...oo...',
      '..oaao..',
      '..oaao..',
      '.oaAaao.',
      '.oaAaao.',
      'oaAaaaao',
      'oaaaaaao',
      '.oaaaao.',
      '..oooo..',
    ],
  },
  confused: {
    pal: { o: '#3a3444', a: '#6b6280', A: '#a89ec2' },
    map: [
      '..oooo..',
      '.oaAAao.',
      'oaAooAao',
      'oAo..oAo',
      'oAo.ooAo',
      'oaAooaao',
      '.oaAAao.',
      'ooaaaaoo',
      'oAoooooA',
      '.o....o.',
    ],
  },
  silence: {
    pal: { o: '#2b2536', a: '#6b6280', A: '#b9b0cf' },
    map: [
      '........',
      'oo.oo.oo',
      'oAo.oAo.',
      'oo.oo.oo',
      '........',
    ],
  },
  idea: {
    pal: { o: '#6b4a0a', a: '#ffd75e', A: '#fff6c0', w: '#8a7a56' },
    map: [
      '..oooo..',
      '.oaAAao.',
      'oaAAAAao',
      'oaAAAAao',
      'oaAAAAao',
      '.oaAAao.',
      '.oaaaao.',
      '..owwo..',
      '..owwo..',
      '..oooo..',
    ],
  },
  sleep: {
    pal: { o: '#1e2a3a', a: '#5a7a9a', A: '#9ad4ff' },
    map: [
      'ooooo...',
      'oaaAo...',
      'ooaoo.oo',
      '.oao.oao',
      'oaaoooao',
      'ooooooao',
      '....ooo.',
    ],
  },
};

export function balloonGlyph(kind, scale = 2) {
  return sprite(`balloon:glyph:${kind}:${scale}`, () => {
    const d = GLYPHS[kind] || GLYPHS.exclaim;
    return rasterize(d.map, { scale, palette: d.pal });
  });
}

// ---------------------------------------------------------------------------
// Drawing one
// ---------------------------------------------------------------------------
/**
 * `p` is the balloon's life, 0 to 1. It pops in with a slight overshoot, holds
 * while the glyph does its own small movement, then shrinks away — so a balloon
 * reads as an event rather than a label that blinked on.
 */
export function drawBalloon(ctx, x, y, kind, p, scale = 2) {
  if (p <= 0 || p >= 1) return;

  let grow, alpha = 1;
  if (p < 0.14) {
    // Overshoot on the way in, which is what makes it feel like a pop.
    const k = p / 0.14;
    grow = 0.35 + 0.85 * k + Math.sin(k * Math.PI) * 0.16;
  } else if (p > 0.88) {
    const k = (p - 0.88) / 0.12;
    grow = 1 - k * 0.45;
    alpha = 1 - k;
  } else {
    grow = 1;
  }

  // The sheeted balloon is one image per frame, so it replaces bubble and
  // glyph together. It keeps the envelope computed above.
  const sheeted = sheetedBalloon(kind, p, scale);
  if (sheeted) {
    const sw = sheeted.width * grow, sh = sheeted.height * grow;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheeted, Math.round(x - sw * 0.38), Math.round(y - sh),
      Math.round(sw), Math.round(sh));
    ctx.restore();
    return;
  }

  const bubble = balloonBubble(scale);
  const glyph = balloonGlyph(kind, scale);
  const bw = bubble.width * grow, bh = bubble.height * grow;
  // The tail sits at the bottom of the sprite and points at the speaker.
  const left = Math.round(x - bw * 0.38);
  const top = Math.round(y - bh);

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bubble, left, top, Math.round(bw), Math.round(bh));

  // The glyph lives in the bubble's body, above the tail.
  const cx = left + bw / 2;
  const cy = top + (BODY_H / 2) * scale * grow;
  drawGlyph(ctx, glyph, cx, cy, grow, kind, p);
  ctx.restore();
}

/**
 * The authored frame for this moment, or null if the sheet has not decoded.
 * The eight frames are an intro that settles: the first few play once as the
 * balloon appears, then the last frames hold, which is how the sheet was drawn
 * to be used. The bubble is 48px at scale 1, so the scale is halved to sit at
 * the same size as the 26px drawn one.
 */
function sheetedBalloon(kind, p, scale) {
  const row = BALLOON_KINDS.indexOf(kind);
  if (row < 0) return null;
  const last = rtpBalloonFrames - 1;
  // Run the intro over the first third of the balloon's life, then hold.
  const frame = Math.min(last, 1 + Math.floor(p * 3 * last));
  return rtpBalloon(row, frame, scale * 0.62);
}

function drawGlyph(ctx, img, cx, cy, grow, kind, p) {
  const t = p * 12;                     // a shared clock for the small movements
  let dx = 0, dy = 0, s = grow, a = 1;

  switch (kind) {
    case 'note':
      dy = Math.sin(t * 1.6) * 1.6;     // bobbing along to the tune
      dx = Math.cos(t * 0.8) * 1.2;
      break;
    case 'heart':
      s = grow * (1 + Math.sin(t * 2.4) * 0.1);   // a heartbeat
      break;
    case 'sweat':
      dy = ((p * 2.2) % 1) * 3;         // the drop slides down
      break;
    case 'anger':
      dx = Math.sin(t * 9) * 0.9;       // a furious vibration
      dy = Math.cos(t * 11) * 0.7;
      break;
    case 'confused':
      dx = Math.sin(t * 1.1) * 1.4;
      break;
    case 'idea':
      a = 0.62 + 0.38 * Math.abs(Math.sin(t * 1.5));  // the bulb flickers on
      break;
    case 'sleep':
      dy = -((p * 1.6) % 1) * 3;        // z's drift upward
      dx = ((p * 1.6) % 1) * 1.5;
      break;
    case 'exclaim':
      // A hard snap on arrival, then still.
      dy = p < 0.2 ? -Math.sin((p / 0.2) * Math.PI) * 2.5 : 0;
      break;
    default:
      break;
  }

  const w = img.width * s, h = img.height * s;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.drawImage(img, Math.round(cx + dx - w / 2), Math.round(cy + dy - h / 2), Math.round(w), Math.round(h));
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------
/**
 * Give something a balloon. Anything with `bal` on it is drawn by the renderer
 * and expires on its own, so callers never have to tidy up.
 */
export function say(entity, kind, seconds = 2.2) {
  entity.bal = { kind, t: 0, life: seconds };
}

/** Advance an entity's balloon. Returns true while it is still showing. */
export function tickBalloon(entity, dt) {
  const b = entity.bal;
  if (!b) return false;
  b.t += dt;
  if (b.t >= b.life) { entity.bal = null; return false; }
  return true;
}

export const balloonProgress = (entity) => (entity.bal ? entity.bal.t / entity.bal.life : 0);
