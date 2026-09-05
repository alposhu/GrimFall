// ---------------------------------------------------------------------------
// hubRender.js — drawing the Waystation.
//
// The layer order is the one every top-down scene needs and most get wrong:
//
//   1. floor            the tile grid
//   2. shadows          under everything, so they never fall on each other
//   3. sorted band      props AND people in one list, ordered by their feet
//   4. overlays         name tags, the interact prompt
//
// Layer 3 is the whole trick. Props and people are not separate passes: if they
// were, a person would be permanently in front of every tree or permanently
// behind it, and walking "around" the back of a tent would be impossible to
// draw. One list, sorted by the Y of the ground each thing stands on, and a
// player walking up the map slides behind the tent at exactly the moment their
// feet pass its base.
//
// Only what is on screen is drawn. The map is 72x56 tiles and a view holds
// maybe 26x15 of them, so the cull is the difference between four thousand
// draws a frame and four hundred.
// ---------------------------------------------------------------------------

import { H, TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, floorAt } from './hub.js';
import { rtpTerrain, rtpProp, rtpPropSize, hasTerrain } from '../art/rtp.js';
import { heroSprites } from '../art/hero.js';

// Fallback colours, used when the RTP atlas is missing or still decoding. The
// camp stays walkable and legible without a single image file — the same
// promise the market makes.
const FLAT = {
  grass: '#3c5a34', moss: '#44603a', dirt: '#4d3d2e', sand: '#6b5c3f',
  road: '#4a4238', cobble: '#4f4d4a', brick: '#5a4740', clay: '#5c3f34',
  slab: '#494a4d', dark: '#2b2733',
};

function shadow(ctx, x, y, r, alpha = 0.3) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function renderHub(ctx, canvas, zoom = 1) {
  const w = canvas.width / zoom;
  const h = canvas.height / zoom;
  const view = {
    left: H.cam.x - w / 2, right: H.cam.x + w / 2,
    top: H.cam.y - h / 2, bottom: H.cam.y + h / 2,
  };

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#171320';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-H.cam.x, -H.cam.y);

  drawFloor(ctx, view);
  drawBand(ctx, view);
  ctx.restore();

  drawPrompt(ctx, canvas, zoom);
}

function drawFloor(ctx, view) {
  const x0 = Math.max(0, Math.floor(view.left / TILE));
  const x1 = Math.min(MAP_W - 1, Math.ceil(view.right / TILE));
  const y0 = Math.max(0, Math.floor(view.top / TILE));
  const y1 = Math.min(MAP_H - 1, Math.ceil(view.bottom / TILE));
  const art = hasTerrain();

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const name = floorAt(tx, ty);
      const px = tx * TILE, py = ty * TILE;
      if (art) {
        const tile = rtpTerrain(name, TILE);
        if (tile) { ctx.drawImage(tile, px, py); continue; }
      }
      ctx.fillStyle = FLAT[name] || FLAT.grass;
      ctx.fillRect(px, py, TILE, TILE);
    }
  }
}

/**
 * Props and people together, ordered by their feet.
 *
 * Rebuilt per frame rather than kept sorted: the props never move, but the
 * people do, and merging a handful of moving things into a pre-sorted array of
 * a few hundred static ones costs about as much as sorting the visible slice
 * outright — and this way there is one code path and nothing to keep in sync.
 */
function drawBand(ctx, view) {
  const band = [];
  const pad = TILE * 3;                 // a tall prop reaches above its own tile

  for (const p of H.props) {
    if (p.x < view.left - pad || p.x > view.right + pad) continue;
    if (p.y < view.top - pad || p.y > view.bottom + pad) continue;
    band.push(p);
  }
  band.push(H.player);
  for (const o of H.others) band.push(o);

  band.sort((a, b) => (a.sortY ?? a.y) - (b.sortY ?? b.y));

  for (const thing of band) {
    if (thing.prop) drawProp(ctx, thing);
    else drawAvatar(ctx, thing);
  }
}

function drawProp(ctx, p) {
  const art = rtpProp(p.prop, 1);
  if (!art) {
    // No atlas: a dark block the right size, so the collision you can feel and
    // the thing you can see still agree.
    ctx.fillStyle = '#2a2433';
    ctx.fillRect(p.x - TILE / 2, p.y - TILE, TILE, TILE);
    return;
  }
  const [pw, ph] = rtpPropSize(p.prop) || [TILE, TILE];
  shadow(ctx, p.x, p.y - 2, Math.max(10, pw * 0.34), 0.26);
  ctx.drawImage(art, Math.round(p.x - pw / 2), Math.round(p.y - ph));
}

function drawAvatar(ctx, a) {
  const set = heroSprites(a.charId || 'ranger', 3);
  const frames = set[a.dir] || set.south;
  const img = frames[a.moving ? (a.frame || 0) : 0];
  shadow(ctx, a.x, a.y + 4, 13, 0.32);
  ctx.drawImage(img, Math.round(a.x - img.width / 2), Math.round(a.y - img.height + 6));
  if (a.name) drawTag(ctx, a);
}

/** A teammate's name over their head. The local player has no tag — they know. */
function drawTag(ctx, a) {
  ctx.save();
  ctx.font = '600 12px "Pixelify Sans", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const y = a.y - 54;
  const w = ctx.measureText(a.name).width + 10;
  ctx.globalAlpha = 0.66;
  ctx.fillStyle = '#0d0a14';
  ctx.fillRect(Math.round(a.x - w / 2), y - 11, Math.round(w), 15);
  ctx.globalAlpha = 1;
  ctx.fillStyle = a.speaking ? '#7ee08a' : '#e8e2d8';
  ctx.fillText(a.name, Math.round(a.x), y);
  ctx.restore();
}

/**
 * What you are standing at.
 *
 * Drawn in SCREEN space, not world space: a label anchored to the world drifts
 * as you walk and can end up half off the edge, and this one has to be readable
 * at the moment it appears or it is not doing its job.
 */
function drawPrompt(ctx, canvas, zoom) {
  const near = H.near;
  if (!near) return;
  const bounce = Math.sin(H.t * 5) * 2;

  ctx.save();
  ctx.font = '500 15px "Pixelify Sans", monospace';
  ctx.textAlign = 'center';
  const text = near.label;
  const w = ctx.measureText(text).width + 28;
  const x = canvas.width / 2;
  const y = canvas.height - 54 + bounce;

  ctx.globalAlpha = 0.86;
  ctx.fillStyle = '#0d0a14';
  ctx.fillRect(Math.round(x - w / 2), Math.round(y - 20), Math.round(w), 30);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#7a5c2e';
  ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(x - w / 2), Math.round(y - 20), Math.round(w), 30);
  ctx.fillStyle = '#ffd75e';
  ctx.fillText(text, Math.round(x), Math.round(y));
  ctx.restore();
}

/** The whole map, small, for a minimap or a debug view. */
export const hubBounds = () => ({ w: WORLD_W, h: WORLD_H });
