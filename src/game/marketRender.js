// ---------------------------------------------------------------------------
// marketRender.js — drawing the Long Market.
//
// Same depth-sorted approach as the run's renderer, but the light is doing the
// heavy lifting: everything outside the lamps falls into shadow, so a square of
// flat cobbles reads as a place at dusk. Braziers, lanterns and pennants are
// drawn live rather than baked, because a still market is a dead one.
// ---------------------------------------------------------------------------

import { TAU } from '../core/util.js';
import { q } from '../core/quality.js';
import { glow } from '../art/pixel.js';
import { heroSprites } from '../art/hero.js';
import { folkSprites } from '../art/folk.js';
import { drawBalloon, balloonProgress } from '../art/balloons.js';
import {
  cobbleTile, stallSprite, marketProp, vendorSprite,
  drawFlame, drawPennant, drawLanternLine, drawTradeSign, drawWallBanner,
} from '../art/market.js';
import { iconForGood } from '../art/items.js';
import {
  rtpGround, rtpGroundCount, rtpProp, rtpBanner, rtpFolkSprites, rtpVendorSprites,
} from '../art/rtp.js';
import { VENDORS } from './shop.js';
import { S } from './state.js';
import { M, BOUNDS, marketLayout as L, marketEntry as ENTRY } from './market.js';

// The drawn paving is authored at 32px; the sheeted paving is 48px and is laid
// at its own size rather than squeezed, because a mortar line does not survive
// being resampled to two thirds.
const DRAWN_TILE = 32;
const SHEET_TILE = 48;
const list = [];

// The code-drawn market and the sheeted one name the same furniture
// differently, so this is where the two vocabularies meet. A prop with no
// entry keeps its drawn form; the market does not have to know which it got.
const RTP_PROP_FOR = {
  well: 'well', barrel: 'barrel', crate: 'crate', basket: 'basket',
  urn: 'urn', sack: 'haystack', bench: 'log',
};

// The stalls are not in this table on purpose — see drawStall. `signs.png` and
// `rtpSign()` still ship for the same reason: nothing draws them today, but the
// slices are cut and documented if the stalls ever want a hanging board.

export function renderMarket(ctx, canvas, zoom) {
  const w = canvas.width, h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#140f14';
  ctx.fillRect(0, 0, w, h);
  if (!M.active && M.fade >= 1) return;

  const view = {
    left: M.cam.x - w / (2 * zoom), right: M.cam.x + w / (2 * zoom),
    top: M.cam.y - h / (2 * zoom), bottom: M.cam.y + h / (2 * zoom),
  };

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-M.cam.x, -M.cam.y);

  drawGround(ctx, view);
  drawWalls(ctx);

  // --- depth-sorted furniture, crowd and vendors ---------------------------
  list.length = 0;
  for (const s of L.stalls) list.push({ stall: s, sortY: s.y + 30 });
  for (const [kind, x, y] of L.props) list.push({ prop: kind, x, y, sortY: y });
  for (const [x, y] of L.braziers) list.push({ brazier: true, x, y, sortY: y });
  for (const [x, y] of L.lamps) list.push({ lamp: true, x, y, sortY: y });
  for (const v of M.vendors) list.push({ vendor: v, sortY: v.y + 6 });
  for (const f of M.folk) list.push({ folk: f, sortY: f.y });
  list.push({ hero: M.player, sortY: M.player.y });
  list.push({ arch: true, x: ENTRY.x, y: ENTRY.y + 40, sortY: ENTRY.y + 40 });
  list.sort((a, b) => a.sortY - b.sortY);

  for (const d of list) {
    if (d.stall) drawStall(ctx, d.stall);
    else if (d.prop) drawProp(ctx, d);
    else if (d.brazier) drawBrazier(ctx, d);
    else if (d.lamp) drawLamp(ctx, d);
    else if (d.arch) drawArch(ctx, d);
    else if (d.vendor) drawVendor(ctx, d.vendor);
    else if (d.folk) drawFolk(ctx, d.folk);
    else drawHero(ctx, d.hero);
  }

  if (q.glows) drawStrings(ctx);
  drawPrompt(ctx);

  ctx.restore();

  drawGrading(ctx, w, h);
}

// ---------------------------------------------------------------------------
function drawGround(ctx, view) {
  const variants = rtpGroundCount();
  const TILE = variants ? SHEET_TILE : DRAWN_TILE;
  const x0 = Math.floor(Math.max(BOUNDS.left, view.left) / TILE) * TILE;
  const x1 = Math.min(BOUNDS.right, view.right);
  const y0 = Math.floor(Math.max(BOUNDS.top, view.top) / TILE) * TILE;
  const y1 = Math.min(BOUNDS.bottom, view.bottom);
  for (let y = y0; y < y1; y += TILE) {
    for (let x = x0; x < x1; x += TILE) {
      // Hashing the tile position picks the variant, so paving never repeats
      // in an obvious grid but is identical every frame.
      const v = ((x * 73856093) ^ (y * 19349663)) >>> 28 & 3;
      const paved = variants ? rtpGround(v % variants, TILE) : null;
      ctx.drawImage(paved || cobbleTile(v, DRAWN_TILE), x, y);
    }
  }
  // A worn path from the arch to the middle of the square.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#8a7b6a';
  ctx.beginPath();
  ctx.ellipse(0, 120, 120, 210, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawWalls(ctx) {
  // The square is bounded by dark building fronts rather than an invisible wall.
  ctx.save();
  ctx.fillStyle = '#211823';
  ctx.fillRect(BOUNDS.left - 200, BOUNDS.top - 200, (BOUNDS.right - BOUNDS.left) + 400, 200);
  ctx.fillRect(BOUNDS.left - 200, BOUNDS.bottom, (BOUNDS.right - BOUNDS.left) + 400, 200);
  ctx.fillRect(BOUNDS.left - 200, BOUNDS.top - 200, 200, (BOUNDS.bottom - BOUNDS.top) + 400);
  ctx.fillRect(BOUNDS.right, BOUNDS.top - 200, 200, (BOUNDS.bottom - BOUNDS.top) + 400);
  ctx.fillStyle = '#2e2130';
  ctx.fillRect(BOUNDS.left - 200, BOUNDS.top - 14, (BOUNDS.right - BOUNDS.left) + 400, 14);
  // Lit windows in the dark, a few storeys up.
  ctx.fillStyle = '#e8b25e';
  for (let i = 0; i < 26; i++) {
    const x = BOUNDS.left + ((i * 197) % (BOUNDS.right - BOUNDS.left));
    const y = BOUNDS.top - 60 - ((i * 53) % 110);
    if ((i * 31) % 5 === 0) continue;
    ctx.globalAlpha = 0.5 + ((i * 17) % 5) * 0.09;
    ctx.fillRect(x, y, 9, 12);
  }
  ctx.restore();

  // Banners down the far wall, so the boundary is architecture rather than a
  // black band at the top of the screen.
  const BANNERS = [
    [-360, '#8f2f2a', '#c9a45c'], [-120, '#3c4f8f', '#c9a45c'],
    [120, '#3f7d5a', '#c9a45c'], [360, '#5a3a6b', '#c9a45c'],
  ];
  BANNERS.forEach(([bx, col, trim], i) => {
    const cloth = rtpBanner(i, 1.4);
    if (cloth) {
      // The sheeted banner does not animate, so it gets its sway from a very
      // slight horizontal drift rather than from a redrawn hem.
      const sway = Math.sin(M.t * 0.9 + i * 1.7) * 2.5;
      ctx.drawImage(cloth, Math.round(bx - cloth.width / 2 + sway), BOUNDS.top - 118);
    } else {
      drawWallBanner(ctx, bx, BOUNDS.top - 96, 84, col, trim, M.t, bx * 0.01);
    }
  });
}

function shadow(ctx, x, y, r, alpha = 0.3) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// The stalls stay drawn in code, deliberately, even though the market around
// them is sheeted. The RPG Maker stalls are shopfronts — timber buildings with
// a roof — and at market scale they read as architecture you walk past rather
// than as a counter you walk up to. These are the market's own furniture and
// they say "trader" at a glance, so they stay.
function drawStall(ctx, s) {
  const img = stallSprite(s.kind, 2);
  shadow(ctx, s.x, s.y + 46, 60, 0.3);
  ctx.drawImage(img, Math.round(s.x - img.width / 2), Math.round(s.y - img.height / 2 + 20));
  // A pennant on the left post of every stall.
  drawPennant(ctx, s.x - img.width / 2 + 6, s.y - img.height / 2 + 26, 1.2, M.t,
    s.vendor ? '#c9a45c' : '#7a3a4a', s.x * 0.01);

  // A trading stall hangs its mark over the counter, so you can read the shelf
  // from across the square without walking up to it.
  if (s.vendor) {
    const def = VENDORS[s.vendor];
    const mark = iconForGood(def.goods[0].id);
    drawTradeSign(ctx, s.x + 44, s.y - img.height / 2 + 34, mark, M.t, s.x * 0.02);
  }
}

function drawProp(ctx, d) {
  // Sheeted props stand on their own base rather than being centred on it, so
  // they anchor differently: the drawn ones hang two-thirds above their point.
  const sheeted = rtpProp(RTP_PROP_FOR[d.prop], 1);
  if (sheeted) {
    shadow(ctx, d.x, d.y + 4, sheeted.width * 0.28, 0.26);
    ctx.drawImage(sheeted, Math.round(d.x - sheeted.width / 2),
      Math.round(d.y - sheeted.height + 10));
    return;
  }
  const img = marketProp(d.prop, 2);
  shadow(ctx, d.x, d.y + img.height * 0.34, img.width * 0.3, 0.26);
  ctx.drawImage(img, Math.round(d.x - img.width / 2), Math.round(d.y - img.height * 0.66));
}

function drawBrazier(ctx, d) {
  const img = marketProp('brazierBase', 2);
  shadow(ctx, d.x, d.y + 14, 20, 0.3);
  ctx.drawImage(img, Math.round(d.x - img.width / 2), Math.round(d.y - img.height + 14));
  drawFlame(ctx, d.x, d.y - img.height + 30, 1.1, M.t, d.x * 0.03 + d.y * 0.017);
}

function drawLamp(ctx, d) {
  const img = rtpProp('lamppost', 1) || marketProp('lamppost', 2);
  shadow(ctx, d.x, d.y + 10, 12, 0.28);
  ctx.drawImage(img, Math.round(d.x - img.width / 2), Math.round(d.y - img.height + 10));
  const ly = d.y - img.height + 24;
  if (q.glows) glow(ctx, d.x, ly, 78, '#ffd75e', 0.3 + Math.sin(M.t * 2.4 + d.x) * 0.04);
}

function drawArch(ctx, d) {
  const img = rtpProp('arch', 2) || marketProp('arch', 2);
  ctx.drawImage(img, Math.round(d.x - img.width / 2), Math.round(d.y - img.height + 30));
  // The way out glows faintly, so it reads as the exit without a label.
  if (q.glows) glow(ctx, d.x, d.y - 30, 70, '#9ad4ff', 0.16 + Math.sin(M.t * 1.6) * 0.05);
}

function drawStrings(ctx) {
  for (const [a, b] of L.strings) {
    const p = L.lamps[a], r = L.lamps[b];
    if (!p || !r) continue;
    drawLanternLine(ctx, p[0], p[1] - 78, r[0], r[1] - 78, 1.1, M.t, 8);
  }
}

function drawVendor(ctx, v) {
  // A merchant is cut from the same townsfolk sheets their customers are, so
  // the person behind the counter belongs to the crowd in front of it. They
  // face south and stand still; only the breathing bob moves them.
  const set = rtpVendorSprites(v.id, 1);
  const img = set ? set.south[0] : vendorSprite(v.id, 3);
  const bob = Math.sin(M.t * 1.6 + v.bob) * 1.5;
  shadow(ctx, v.x, v.y + 16, 20, 0.3);
  ctx.drawImage(img, Math.round(v.x - img.width / 2),
    Math.round(v.y - img.height + (set ? 8 : 18) + bob));

  // A vendor you can reach gets a soft halo, so you know who is a shop.
  const near = M.prompt?.kind === 'vendor' && M.prompt.id === v.id;
  if (near && q.glows) glow(ctx, v.x, v.y - 10, 58, '#ffd75e', 0.22);
  emoteOver(ctx, v, v.y - img.height + 12, 1.7);
}

function drawFolk(ctx, f) {
  // A townsperson's silhouette drives their behaviour, so `variant` stays put
  // and only the artwork swaps. `sheet` was dealt from the same seeded shuffle,
  // which is why the crowd is identical whether or not the atlas loaded.
  const set = rtpFolkSprites(f.sheet, f.scale / 3) || folkSprites(f.variant, f.scale);
  const img = set[f.dir][f.moving ? f.frame : 0];
  shadow(ctx, f.x, f.y + 4, 9 + f.scale, 0.28);
  ctx.drawImage(img, Math.round(f.x - img.width / 2), Math.round(f.y - img.height + 6));
  emoteOver(ctx, f, f.y - img.height - 2, 1.4);
}

/** Whatever this person is currently expressing, floating over their head. */
function emoteOver(ctx, e, y, scale) {
  if (!e.bal) return;
  drawBalloon(ctx, e.x + 6, y, e.bal.kind, balloonProgress(e), scale);
}

function drawHero(ctx, p) {
  const set = heroSprites(S.player?.charId || 'ranger', 3);
  const img = set[p.dir][p.moving ? p.frame : 0];
  shadow(ctx, p.x, p.y + 4, 13, 0.32);
  ctx.drawImage(img, Math.round(p.x - img.width / 2), Math.round(p.y - img.height + 6));
  emoteOver(ctx, p, p.y - img.height - 2, 1.6);
}

function drawPrompt(ctx) {
  if (!M.prompt) return;
  const p = M.player;
  const y = p.y - 62;
  const bounce = Math.sin(M.t * 5) * 2;
  ctx.save();
  // A chevron over your own head rather than over the target: it never gets
  // hidden behind a stall, and it reads at any zoom.
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ffd75e';
  ctx.beginPath();
  ctx.moveTo(p.x, y + bounce + 8);
  ctx.lineTo(p.x - 7, y + bounce);
  ctx.lineTo(p.x + 7, y + bounce);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGrading(ctx, w, h) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Warm wash — the market is the only warm place in the game.
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#ff9a4a';
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(8,4,10,0.62)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (M.fade > 0) {
    ctx.fillStyle = `rgba(6,4,8,${M.fade})`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}
