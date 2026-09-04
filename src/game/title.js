// ---------------------------------------------------------------------------
// title.js — the moving sky behind the main menu.
//
// This replaces a looping video. The video is gone from the project entirely:
// it was three quarters of a megabyte, it could not be recoloured, and on a
// phone it was a decode running for as long as anyone sat on the menu.
//
// WHAT MAKES THIS READ AS PIXEL ART RATHER THAN AS AN EFFECT
//
// Three rules, and they are the whole trick:
//
//   Everything is drawn into a SMALL buffer and blown up by a WHOLE NUMBER with
//       nearest-neighbour. The scene is about 200 pixels tall no matter how big
//       the screen is, so a pixel is a visible, square, honest pixel. Drawing at
//       full resolution and hoping for a pixel look is what produces the soft,
//       vector-ish sky that gives away a generated background - and it costs
//       forty times the fill.
//
//   Nine colours. Not "a palette inspired by" - the exact nine sampled out of
//       img/ui/mobile.png, which is the artwork this scene stands in for on
//       desktop. A locked palette is the single strongest signal that a human
//       chose the colours, because a machine reaches for a gradient.
//
//   No gradients, no blur, no glow, no alpha ramps. Where one colour has to
//       become another it is DITHERED - a 4x4 Bayer threshold, the way a
//       sixteen-colour machine would have had to do it. Every edge in this file
//       is a hard edge and every coordinate is an integer.
//
// The clouds are built once as sprites and moved, rather than redrawn per
// frame, so the per-frame cost is a handful of drawImage calls over a buffer
// the size of a postage stamp.
// ---------------------------------------------------------------------------

import { makeCanvas } from '../art/pixel.js';

// Sampled from img/ui/mobile.png — all nine of them, nothing added.
const SKY = '#6aadff';
const HAZE = '#afb7ce';
const CLOUD_LIT = '#fbeac8';
const CLOUD_MID = '#ffd8ae';
const CLOUD_WARM = '#f6c39b';
const CLOUD_SHADE = '#eda78c';
const CANOPY_LIT = '#cc968c';
const CANOPY_MID = '#be877d';
const CANOPY_DARK = '#b37b7d';

// The scene is authored at this height and scaled up by a whole number. 200 is
// chosen so the common phone and desktop heights land on a clean factor and the
// pixels stay chunky enough to be unmistakable.
const SCENE_H = 200;

// A 4x4 Bayer matrix — an ordered dither, so the transition between two sky
// bands is a fixed, repeatable pattern rather than noise. Noise sparkles when
// it scrolls; this does not move at all, which is what you want from sky.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Deterministic, so the clouds are the same clouds after a resize. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Cloud sprites
// ---------------------------------------------------------------------------
/**
 * Paint a set of discs as one silhouette.
 */
function lobes(ctx, list, dx, dy) {
  for (const l of list) {
    ctx.beginPath();
    ctx.arc(l.x + dx, l.y + dy, l.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Force every pixel to be either fully there or not there at all. The
 * rasteriser leaves half-covered pixels around every arc, and at a 5x
 * nearest-neighbour blow-up each one is a visible grey fringe - a soft halo
 * around a hard-edged picture, which is exactly the tell that gives away art
 * that was filtered rather than drawn.
 */
function harden(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 128 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
}

/**
 * One cumulus.
 *
 * The first attempt at this stacked discs and then laid a straight bar of
 * shadow across the bottom, which produced a pancake: you could see the seam,
 * and the shadow cut through the form instead of describing it.
 *
 * This is the way the shape is actually built in pixel art. The silhouette is
 * filled with the DARKEST tone, then the same silhouette is stamped again a
 * little up and to the left in a lighter one, and again lighter still. Every
 * band therefore follows the contour of the cloud rather than the axes of the
 * canvas, and the light lands consistently across every lobe because it is the
 * same shape each time - which is what your eye reads as a single lit object
 * rather than a heap of circles.
 */
function buildCloud(w, h, seed, lit, mid, shade) {
  const { canvas, ctx } = makeCanvas(w, h);
  const r = rng(seed);

  // A cumulus is a broad base with a mound piled on it, so the lobes are placed
  // in two passes rather than scattered - scattering is what makes procedural
  // clouds look like foam.
  const list = [];
  const baseY = Math.round(h * 0.70);
  const baseR = Math.round(h * 0.26);
  for (let x = baseR; x < w - baseR * 0.4; x += Math.round(baseR * 1.15)) {
    list.push({ x: Math.round(x), y: baseY, r: Math.round(baseR * (0.85 + r() * 0.35)) });
  }
  const mound = 3 + Math.floor(r() * 3);
  for (let i = 0; i < mound; i++) {
    const k = (i + 0.5) / mound;
    // A rounded profile: tallest in the middle, tapering to the shoulders.
    const lift = Math.sin(k * Math.PI);
    list.push({
      x: Math.round(w * (0.14 + k * 0.68) + (r() - 0.5) * 6),
      y: Math.round(baseY - lift * h * 0.34 - r() * 4),
      r: Math.round(h * (0.18 + lift * 0.16 + r() * 0.06)),
    });
  }

  ctx.fillStyle = shade;
  lobes(ctx, list, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = mid;
  lobes(ctx, list, -1, -Math.max(2, Math.round(h * 0.07)));
  ctx.fillStyle = lit;
  lobes(ctx, list, -2, -Math.max(4, Math.round(h * 0.16)));
  ctx.globalCompositeOperation = 'source-over';

  harden(ctx, w, h);
  return canvas;
}

// ---------------------------------------------------------------------------
// The static half of the scene
// ---------------------------------------------------------------------------
/**
 * Sky and treeline. Neither moves, so both are painted once into a buffer and
 * blitted; only the clouds and the birds are redrawn.
 */
function buildBackdrop(w, h) {
  const { canvas, ctx } = makeCanvas(w, h);
  // The horizon sits low on purpose. This is a SKY, and the reference artwork
  // it stands in for gives four fifths of the frame to cloud; a treeline
  // halfway up turned the bottom half into an empty rose field and pushed the
  // clouds into a strip.
  const horizon = Math.round(h * 0.80);

  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, w, horizon);

  // The sky fades to haze at the horizon, and the fade is DITHERED. Two colours
  // and a Bayer threshold, one pixel at a time - a gradient here would be the
  // one soft thing in a hard-edged picture and would read as a filter laid over
  // the art rather than as part of it.
  const band = Math.round(h * 0.13);
  ctx.fillStyle = HAZE;
  for (let y = horizon - band; y < horizon; y++) {
    const k = (y - (horizon - band)) / band;          // 0 at the top of the band
    const threshold = k * 16;
    for (let x = 0; x < w; x++) {
      if (BAYER[y & 3][x & 3] < threshold) ctx.fillRect(x, y, 1, 1);
    }
  }

  // The treeline. Three ridges of foliage, each one lower, darker and larger
  // than the one behind it, so the wood recedes by SIZE and OVERLAP rather than
  // by being faded out - haze over distant trees is the sort of thing that
  // needs a gradient, and there are none here.
  //
  // The lit rim along the top of each ridge is made by stamping the silhouette
  // TWICE: once in the lighter tone lifted two pixels, then again in the darker
  // tone at rest, which covers all but that two-pixel crest. It is the same
  // trick the clouds use, and it is done this way rather than with a clipped
  // `source-atop` pass - that was the first attempt, and compositing against a
  // half-transparent destination punched holes clean through the canopy that
  // showed up as black slashes once the buffer was blitted onto the opaque
  // canvas. Two ordinary fills cannot do that.
  const r = rng(0x9e3779b9);

  // Ground first, so no gap between the ridges can ever be transparent. Below
  // the horizon this picture is opaque by construction.
  ctx.fillStyle = CANOPY_DARK;
  ctx.fillRect(0, horizon, w, h - horizon);

  const ridges = [
    { lit: CANOPY_LIT, body: CANOPY_MID, y: horizon + 1, rad: [4, 8], step: 6 },
    { lit: CANOPY_MID, body: CANOPY_DARK, y: horizon + Math.round(h * 0.055), rad: [6, 11], step: 8 },
    { lit: CANOPY_DARK, body: CANOPY_DARK, y: horizon + Math.round(h * 0.12), rad: [8, 15], step: 10 },
  ];

  for (const R of ridges) {
    const clumps = [];
    for (let x = -24; x < w + 24; x += R.step) {
      clumps.push({
        x: Math.round(x + r() * R.step),
        y: R.y + Math.round((r() - 0.5) * 7),
        r: Math.round(R.rad[0] + r() * (R.rad[1] - R.rad[0])),
      });
    }
    const floor = R.y + R.rad[1];
    ctx.fillStyle = R.lit;
    lobes(ctx, clumps, 0, -2);
    ctx.fillStyle = R.body;
    lobes(ctx, clumps, 0, 0);
    ctx.fillRect(0, floor, w, h - floor);
  }

  harden(ctx, w, h);
  return canvas;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let buf = null;            // the low-resolution scene
let bufCtx = null;
let backdrop = null;
let clouds = [];
let bufW = 0, bufH = 0, bufScale = 1;

let photo = null;          // img/ui/mobile.png, on phones only
let photoTried = false;

/**
 * The artwork is used on touch devices and nowhere else, which is what was
 * asked for. It also happens to be the right call on the merits: a phone gets a
 * finished 9-colour painting for one decode and no per-frame work, which is the
 * cheapest thing this menu could possibly be doing.
 */
function isMobile() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

function loadPhoto() {
  if (photoTried || typeof Image === 'undefined') return;
  photoTried = true;
  const im = new Image();
  im.decoding = 'async';
  im.onload = () => { photo = im; };
  im.src = new URL('../../img/ui/mobile.png', import.meta.url).href;
}

function rebuild(w, h) {
  // The scale is a WHOLE number, always. That is the entire reason this looks
  // like pixel art, so it is the one thing here that never gets a fractional
  // value for the sake of a perfect fit; the buffer is made slightly large
  // instead and the overflow falls off the edge.
  bufScale = Math.max(1, Math.round(h / SCENE_H));
  bufW = Math.ceil(w / bufScale);
  bufH = Math.ceil(h / bufScale);
  const made = makeCanvas(bufW, bufH);
  buf = made.canvas;
  bufCtx = made.ctx;
  backdrop = buildBackdrop(bufW, bufH);

  // Three depths, moving at three speeds. The far layer is haze-coloured and
  // small, the near one is warm and large: parallax doing the work that a blur
  // would otherwise be asked to do.
  // Six drifting bands over three depths. Two clouds per depth, with different
  // shapes and different gaps, so the repeat does not land on a rhythm you can
  // count - one sprite per layer reads as wallpaper the moment it wraps.
  //
  // Far clouds are small, flat and haze-coloured; near ones are large, warm and
  // fast. That is the whole depth cue, and it is the honest one: distance in
  // pixel art is size and colour, not blur.
  clouds = [
    { img: buildCloud(40, 15, 11, HAZE, HAZE, HAZE), y: Math.round(bufH * 0.10), speed: 1.4, gap: 74 },
    { img: buildCloud(30, 12, 71, HAZE, HAZE, HAZE), y: Math.round(bufH * 0.20), speed: 1.9, gap: 108 },
    { img: buildCloud(64, 26, 23, CLOUD_LIT, CLOUD_MID, CLOUD_WARM), y: Math.round(bufH * 0.15), speed: 3.4, gap: 118 },
    { img: buildCloud(52, 22, 91, CLOUD_LIT, CLOUD_MID, CLOUD_WARM), y: Math.round(bufH * 0.33), speed: 4.1, gap: 143 },
    { img: buildCloud(104, 42, 37, CLOUD_LIT, CLOUD_MID, CLOUD_SHADE), y: Math.round(bufH * 0.27), speed: 6.2, gap: 171 },
    { img: buildCloud(86, 36, 53, CLOUD_LIT, CLOUD_MID, CLOUD_SHADE), y: Math.round(bufH * 0.48), speed: 7.6, gap: 197 },
  ];
}

/**
 * Draw the menu's backdrop.
 * @param {CanvasRenderingContext2D} ctx  the game canvas
 * @param {HTMLCanvasElement} canvas
 * @param {number} t                      seconds since the menu appeared
 */
export function renderTitle(ctx, canvas, t) {
  const w = canvas.width, h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  if (isMobile()) {
    loadPhoto();
    if (photo) {
      // Cover, on whole pixels, drifting slowly across whatever the crop leaves
      // spare. The artwork is 16:9 and a phone is not, so on a portrait screen
      // the drift is vertical and the sky stays in frame.
      const k = Math.max(w / photo.width, h / photo.height);
      const dw = Math.ceil(photo.width * k), dh = Math.ceil(photo.height * k);
      const slackX = Math.max(0, dw - w), slackY = Math.max(0, dh - h);
      const ox = slackX ? Math.round((Math.sin(t * 0.06) * 0.5 + 0.5) * slackX) : 0;
      const oy = slackY ? Math.round((Math.sin(t * 0.045) * 0.5 + 0.5) * slackY) : 0;
      ctx.drawImage(photo, -ox, -oy, dw, dh);
      return;
    }
    ctx.fillStyle = SKY;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (!buf || bufW * bufScale < w || bufH * bufScale < h ||
      Math.abs(bufScale - Math.max(1, Math.round(h / SCENE_H))) > 0) {
    rebuild(w, h);
  }

  bufCtx.imageSmoothingEnabled = false;
  bufCtx.drawImage(backdrop, 0, 0);

  for (const layer of clouds) {
    const span = layer.img.width + layer.gap;
    // Whole-pixel positions. A cloud at x=12.4 is a cloud with a soft edge, and
    // one soft edge is enough to make the whole picture look like a filter.
    const drift = Math.round(t * layer.speed) % span;
    for (let x = -span; x < bufW + span; x += span) {
      bufCtx.drawImage(layer.img, x - drift, layer.y);
    }
  }

  ctx.drawImage(buf, 0, 0, bufW * bufScale, bufH * bufScale);
}

/** Drop the cached scene — called when quality or size changes underneath it. */
export function resetTitle() { buf = null; }
