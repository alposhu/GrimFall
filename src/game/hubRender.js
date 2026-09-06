// ---------------------------------------------------------------------------
// hubRender.js — drawing the Hearthhall.
//
// Four passes, and the last one is the one that matters most:
//
//   1. floor          the tile grid
//   2. sorted band    props, posts, the door AND people in one list, by feet
//   3. light          warm pools cut out of a dark overlay
//   4. overlays       name tags, speech, the interact prompt, the fade out
//
// PASS 2 IS THE DEPTH TRICK. Props and people are not separate passes: if they
// were, a person would be permanently in front of every table or permanently
// behind it, and walking around the back of the bar would be impossible to
// draw. One list, sorted by the Y of the ground each thing stands on.
//
// PASS 3 IS WHY IT LOOKS LIKE A ROOM. A flat-lit tile grid reads as a floor
// plan no matter how good the tiles are, because real interiors at night are
// mostly dark with warm pools in them — that contrast is what the eye reads as
// "inside, in the evening". So a dark sheet is laid over the whole view and
// holes are punched in it at every fire, candle and lantern, then a little warm
// light is added back on top. The lights come from the FURNITURE (hub.js reads
// them off the hearths and candelabra), so moving a fireplace moves its light
// and the two can never disagree.
//
// The flicker is per-source and out of phase. One global flicker makes the
// whole room pulse like a failing bulb; separate ones read as separate fires.
// ---------------------------------------------------------------------------

import { H, A, TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, floorAt, leaveProgress } from './hub.js';
import { rtpTerrain, rtpProp, rtpPropSize, hasTerrain, rtpFolkSprites } from '../art/rtp.js';
import { folkSprites } from '../art/folk.js';
import { heroSprites } from '../art/hero.js';
import { postSprite, doorSprite, lanternSprite } from '../art/inn.js';
import { makeCanvas } from '../art/pixel.js';

// Fallback colours, used when the RTP atlas is missing or still decoding. The
// inn stays walkable and legible without a single image file.
const FLAT = {
  grass: '#3c5a34', moss: '#44603a', dirt: '#4d3d2e', sand: '#6b5c3f',
  road: '#4a4238', cobble: '#4f4d4a', brick: '#5a4740', clay: '#5c3f34',
  slab: '#494a4d', dark: '#2b2733',
  plank: '#4a3526', board: '#3d2c1f', flag: '#474645', hearthstone: '#544a3c',
  rug_gold: '#6a5320', rug_blue: '#2f3f5c', rug_red: '#5a2a2a',
  wall: '#3a3a3e', wall_dark: '#1d1a24',
  oak: '#7a5a34', parquet: '#6b4a2a', kitchen: '#5a5750', marble: '#6d6455',
  carpet_c: '#5e2a1e', rugblue_c: '#2c4358',
  walltop: '#2a2119', wallhigh: '#4a3b2a', walllow: '#3a2b1c',
};
const flatFor = (name) => FLAT[name] || (name.startsWith('carpet') ? FLAT.carpet_c
  : name.startsWith('rugblue') ? FLAT.rugblue_c
    : name.startsWith('wall') ? FLAT.walltop : FLAT.oak);

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
  ctx.fillStyle = '#0b0910';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-H.cam.x, -H.cam.y);

  drawFloor(ctx, view);
  drawBand(ctx, view);
  ctx.restore();

  drawLight(ctx, canvas, zoom);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-H.cam.x, -H.cam.y);
  drawTalk(ctx, view);
  ctx.restore();

  drawPrompt(ctx, canvas);
  drawLeaving(ctx, canvas);
}

function drawFloor(ctx, view) {
  const x0 = Math.max(0, Math.floor(view.left / TILE));
  const x1 = Math.min(MAP_W() - 1, Math.ceil(view.right / TILE));
  const y0 = Math.max(0, Math.floor(view.top / TILE));
  const y1 = Math.min(MAP_H() - 1, Math.ceil(view.bottom / TILE));
  const art = hasTerrain();

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const name = floorAt(tx, ty);
      const px = tx * TILE, py = ty * TILE;
      if (art) {
        const tile = rtpTerrain(name, TILE);
        if (tile) { ctx.drawImage(tile, px, py); continue; }
      }
      ctx.fillStyle = flatFor(name);
      ctx.fillRect(px, py, TILE, TILE);
    }
  }
}

/**
 * Everything that stands on the floor, ordered by its feet.
 *
 * Rebuilt per frame rather than kept sorted: the props never move but the
 * people do, and merging a handful of moving things into a pre-sorted array
 * costs about as much as sorting the visible slice outright — and this way
 * there is one code path and nothing to keep in sync.
 */
function drawBand(ctx, view) {
  const a = A();
  const band = [];
  const pad = TILE * 3;
  const near = (o) => o.x >= view.left - pad && o.x <= view.right + pad
    && o.y >= view.top - pad && o.y <= view.bottom + pad;

  for (const p of a.props) if (near(p)) band.push(p);
  for (const p of a.posts) if (near(p)) band.push(p);
  for (const f of a.folk) if (near(f)) band.push(f);
  band.push(H.player);
  for (const o of H.others) band.push(o);
  if (a.door) {
    band.push({ door: a.door, x: a.door.x * TILE + TILE / 2, y: a.door.y * TILE + TILE,
      sortY: a.door.y * TILE + TILE });
  }

  band.sort((p, q) => (p.sortY ?? p.y) - (q.sortY ?? q.y));

  for (const thing of band) {
    if (thing.prop) drawProp(ctx, thing);
    else if (thing.post) drawPost(ctx, thing);
    else if (thing.door) drawDoor(ctx, thing);
    else drawAvatar(ctx, thing);
  }

  // Lanterns hang on the wall above head height, so they are drawn after
  // everything rather than sorted into it — nobody walks in front of one.
  for (const l of a.lanterns) {
    if (!near(l)) continue;
    const art = lanternSprite(3);
    ctx.drawImage(art, Math.round(l.x - art.width / 2), Math.round(l.y - art.height / 2));
  }
}

function drawProp(ctx, p) {
  const art = rtpProp(p.prop, 1);
  if (!art) {
    ctx.fillStyle = '#2a2433';
    ctx.fillRect(p.x - TILE / 2, p.y - TILE, TILE, TILE);
    return;
  }
  const [pw, ph] = rtpPropSize(p.prop) || [TILE, TILE];
  shadow(ctx, p.x, p.y - 2, Math.max(10, pw * 0.34), 0.26);
  ctx.drawImage(art, Math.round(p.x - pw / 2), Math.round(p.y - ph));
}

function drawPost(ctx, p) {
  const art = postSprite(4);
  shadow(ctx, p.x, p.y - 2, 18, 0.34);
  ctx.drawImage(art, Math.round(p.x - art.width / 2), Math.round(p.y - art.height));
}

function drawDoor(ctx, d) {
  const art = doorSprite(d.door.frame, 4);
  ctx.drawImage(art, Math.round(d.x - art.width / 2), Math.round(d.y - art.height));
}

function drawAvatar(ctx, a) {
  // Townsfolk wear the RTP cast; players wear their hero. Both come back in the
  // same {south,north,east,west} shape, so there is one drawing path.
  const set = a.folk !== undefined
    ? (rtpFolkSprites(a.folk, 1) || folkSprites(a.folk, 3))
    : heroSprites(a.charId || 'ranger', 3);
  if (!set) return;
  const frames = set[a.dir] || set.south;
  const img = frames[a.moving ? (a.frame || 0) : 0];
  shadow(ctx, a.x, a.y + 4, 13, 0.32);
  ctx.drawImage(img, Math.round(a.x - img.width / 2), Math.round(a.y - img.height + 6));
  if (a.name && a.folk === undefined) drawTag(ctx, a);
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

// ---------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------
let sheet = null;
let sheetCtx = null;

/**
 * Punch the fires out of a dark sheet, then add a little warmth back.
 *
 * Two operations rather than one, because they do different jobs. The cut-out
 * decides what you can SEE — it is the difference between a lit room and a dark
 * one. The additive pass decides what the light FEELS like, and it is the part
 * that makes a hearth read as fire rather than as a hole in a filter. Doing
 * only the first gives a room lit by grey torches; only the second gives a
 * flat room with glowing blobs on it.
 */
function drawLight(ctx, canvas, zoom) {
  const a = A();
  if (!a.lights || !a.lights.length) return;

  if (!sheet || sheet.width !== canvas.width || sheet.height !== canvas.height) {
    const made = makeCanvas(canvas.width, canvas.height);
    sheet = made.canvas;
    sheetCtx = made.ctx;
  }
  const lc = sheetCtx;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.clearRect(0, 0, canvas.width, canvas.height);
  lc.fillStyle = 'rgba(9, 6, 16, 0.66)';
  lc.fillRect(0, 0, canvas.width, canvas.height);

  const halfW = canvas.width / 2;
  const halfH = canvas.height / 2;
  const toScreen = (wx, wy) => [(wx - H.cam.x) * zoom + halfW, (wy - H.cam.y) * zoom + halfH];
  const t = H.t;

  lc.globalCompositeOperation = 'destination-out';
  for (const l of a.lights) {
    const [sx, sy] = toScreen(l.x, l.y);
    const r = l.r * zoom * (0.94 + Math.sin(t * 3.1 + l.flicker) * 0.06);
    if (sx < -r || sy < -r || sx > canvas.width + r || sy > canvas.height + r) continue;
    const g = lc.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.72)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = g;
    lc.beginPath();
    lc.arc(sx, sy, r, 0, Math.PI * 2);
    lc.fill();
  }
  lc.globalCompositeOperation = 'source-over';
  ctx.drawImage(sheet, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of a.lights) {
    const [sx, sy] = toScreen(l.x, l.y);
    const r = l.r * zoom * 0.72 * (0.92 + Math.sin(t * 3.1 + l.flicker) * 0.08);
    if (sx < -r || sy < -r || sx > canvas.width + r || sy > canvas.height + r) continue;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(255, 186, 92, ${0.20 * l.warm})`);
    g.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------
/** Chatter first, then whoever is being spoken to — last, so it is never behind. */
function drawTalk(ctx, view) {
  const a = A();
  for (const f of a.folk) {
    if (!f.says) continue;
    if (f.x < view.left || f.x > view.right || f.y < view.top || f.y > view.bottom) continue;
    bubble(ctx, f, f.says.text, '#cfc7bb', null);
  }
  if (H.speech) bubble(ctx, H.speech.who, H.speech.text, '#e8e2d8', H.speech.who.name);
}

/**
 * A line of speech over somebody's head.
 *
 * Anchored to the SPEAKER, not to the screen: in a room with two dozen people
 * in it you have to be able to tell which one is talking, and a caption at the
 * bottom of the screen cannot tell you that.
 */
function bubble(ctx, who, text, colour, name) {
  ctx.save();
  ctx.font = '500 14px "Pixelify Sans", monospace';
  ctx.textAlign = 'center';

  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > 250 && line) { lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);

  const wide = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
  const head = name ? 18 : 0;
  const tall = lines.length * 18 + 14 + head;
  const x = who.x;
  const y = who.y - 58 - tall;

  ctx.globalAlpha = name ? 0.92 : 0.78;
  ctx.fillStyle = '#0d0a14';
  ctx.fillRect(Math.round(x - wide / 2), Math.round(y), Math.round(wide), tall);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = name ? '#7a5c2e' : '#3b3442';
  ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(x - wide / 2), Math.round(y), Math.round(wide), tall);

  let ty = y + 15;
  if (name) {
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(name, Math.round(x), Math.round(ty));
    ty += head;
  }
  ctx.fillStyle = colour;
  lines.forEach((l, i) => ctx.fillText(l, Math.round(x), Math.round(ty + i * 18)));
  ctx.restore();
}

/**
 * What you are standing at.
 *
 * Drawn in SCREEN space: a label anchored to the world drifts as you walk and
 * can end up half off the edge, and this one has to be readable the moment it
 * appears or it is not doing its job.
 */
function drawPrompt(ctx, canvas) {
  if (H.leaving) return;
  const near = H.near;
  const folk = H.nearFolk;
  if (!near && !folk) return;
  const text = folk ? `Talk to ${folk.name}` : near.label;
  const bounce = Math.sin(H.t * 5) * 2;

  ctx.save();
  ctx.font = '500 15px "Pixelify Sans", monospace';
  ctx.textAlign = 'center';
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

/**
 * Walking out.
 *
 * The fade starts late and finishes with the walk, so the player sees
 * themselves go through the door rather than watching a screen dim over a
 * room they are still standing in.
 */
function drawLeaving(ctx, canvas) {
  const k = leaveProgress();
  if (k <= 0) return;
  const alpha = Math.max(0, (k - 0.45) / 0.55);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

export const hubBounds = () => ({ w: WORLD_W(), h: WORLD_H() });
