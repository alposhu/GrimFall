// ---------------------------------------------------------------------------
// demos.js — the little animations on the How to Play cards.
//
// Each one is a loop that shows the thing rather than describing it, drawn with
// the game's own sprites so what you see on the card is what you meet in a run.
// A single shared frame loop drives them, and only while the help screen is up.
// ---------------------------------------------------------------------------

import { TAU, clamp } from '../core/util.js';
import { heroSprites } from '../art/hero.js';
import { mobSprite } from '../art/bestiary.js';
import { pickupSprite, iconSprite } from '../art/props.js';
import { bossPortraitArt } from '../art/bosses.js';
import { dragonPortrait } from '../art/dragon.js';
import { foodSprite } from '../art/food.js';
import { BOSSES } from '../game/config.js';

const INK = '#f2ecff';
const DIM = '#7d7496';
const EMBER = '#ff8a2a';
const GOLD = '#ffd75e';
const VOID = '#b76bff';
const BLOOD = '#ff4d6a';

function ground(ctx, w, h) {
  ctx.fillStyle = '#171022';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 16) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }
}

function shadow(ctx, x, y, r) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function blitc(ctx, img, x, y, scale = 1, alpha = 1) {
  if (!img) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(x - (img.width * scale) / 2), Math.round(y - (img.height * scale) / 2),
    img.width * scale, img.height * scale);
  ctx.restore();
}

function label(ctx, text, x, y, color = DIM, size = 9) {
  ctx.save();
  ctx.font = `${size}px "Chakra Petch", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A key cap that lights up while held. */
function keycap(ctx, x, y, ch, lit) {
  const s = 15;
  ctx.save();
  ctx.fillStyle = lit ? 'rgba(255,138,42,0.9)' : 'rgba(255,255,255,0.07)';
  ctx.strokeStyle = lit ? EMBER : 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - s / 2, y - s / 2, s, s, 3);
  ctx.fill();
  ctx.stroke();
  ctx.font = '8px "Chakra Petch", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = lit ? '#1a0d04' : DIM;
  ctx.fillText(ch, x, y + 0.5);
  ctx.restore();
}

// ---------------------------------------------------------------------------
export const DEMOS = {
  // --- moving: the hero walks a circuit, the inputs light up with it ---
  move(ctx, w, h, t) {
    ground(ctx, w, h);
    const loop = 6;
    const k = (t % loop) / loop;
    // A square patrol so every direction gets shown.
    const leg = Math.floor(k * 4);
    const f = (k * 4) % 1;
    const cx = w * 0.36, cy = h * 0.5, rx = 34, ry = 16;
    const corners = [[-rx, -ry], [rx, -ry], [rx, ry], [-rx, ry]];
    const a = corners[leg], b = corners[(leg + 1) % 4];
    const x = cx + a[0] + (b[0] - a[0]) * f;
    const y = cy + a[1] + (b[1] - a[1]) * f;
    const dir = ['east', 'south', 'west', 'north'][leg];

    const frames = heroSprites('ranger', 3)[dir];
    shadow(ctx, x, y + 20, 13);
    blitc(ctx, frames[Math.floor(t * 8) % 4], x, y, 0.62);

    // Keys, lit for the current direction.
    const kx = w * 0.76, ky = h * 0.42;
    keycap(ctx, kx, ky - 9, 'W', dir === 'north');
    keycap(ctx, kx - 17, ky + 9, 'A', dir === 'west');
    keycap(ctx, kx, ky + 9, 'S', dir === 'south');
    keycap(ctx, kx + 17, ky + 9, 'D', dir === 'east');
    label(ctx, 'or drag anywhere', kx, h - 12, DIM, 8);
  },

  // --- attacking: you never press a button; the weapons do the work ---
  attack(ctx, w, h, t) {
    ground(ctx, w, h);
    const cx = w / 2, cy = h / 2;
    const frames = heroSprites('ranger', 3).south;
    shadow(ctx, cx, cy + 20, 13);
    blitc(ctx, frames[0], cx, cy, 0.62);

    const kinds = ['slime', 'bat', 'skeleton', 'imp'];
    for (let i = 0; i < 4; i++) {
      const phase = (t * 0.42 + i / 4) % 1;
      const ang = (i / 4) * TAU + t * 0.25;
      const dist = 78 - phase * 62;
      const ex = cx + Math.cos(ang) * dist * 1.5;
      const ey = cy + Math.sin(ang) * dist * 0.7;
      const dying = phase > 0.86;
      if (dying) {
        // The kill: a small burst where it stood.
        const dk = (phase - 0.86) / 0.14;
        ctx.save();
        ctx.globalAlpha = 1 - dk;
        ctx.fillStyle = GOLD;
        for (let s = 0; s < 6; s++) {
          const sa = (s / 6) * TAU;
          ctx.fillRect(ex + Math.cos(sa) * dk * 12 - 1, ey + Math.sin(sa) * dk * 12 - 1, 2, 2);
        }
        ctx.restore();
        continue;
      }
      blitc(ctx, mobSprite(kinds[i], 2), ex, ey, 0.5);

      // A bolt in flight, fired without any input.
      const bt = (phase * 3) % 1;
      const bx = cx + (ex - cx) * bt, by = cy + (ey - cy) * bt;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(Math.atan2(ey - cy, ex - cx));
      ctx.fillStyle = '#e8eef8';
      ctx.beginPath();
      ctx.moveTo(4, 0); ctx.lineTo(-3, 1.6); ctx.lineTo(-3, -1.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    label(ctx, 'weapons fire on their own', cx, h - 11, DIM, 8);
  },

  // --- growing: shards come to you, the bar fills, you level ---
  grow(ctx, w, h, t) {
    ground(ctx, w, h);
    const loop = 4;
    const k = (t % loop) / loop;
    const cx = w / 2, cy = h * 0.44;
    const frames = heroSprites('ranger', 3).south;
    shadow(ctx, cx, cy + 20, 13);
    blitc(ctx, frames[0], cx, cy, 0.62);

    // Gems streaming inward.
    for (let i = 0; i < 7; i++) {
      const p = clamp((k * 1.6) - i * 0.06, 0, 1);
      if (p <= 0) continue;
      const ang = (i / 7) * TAU + 1.1;
      const d = (1 - p) * 58;
      blitc(ctx, pickupSprite(i % 3 === 0 ? 'gem2' : 'gem1', 2),
        cx + Math.cos(ang) * d * 1.6, cy + Math.sin(ang) * d * 0.8, 0.7, p < 1 ? 1 : 0);
    }

    // Experience bar.
    const bw = w * 0.66, bx = (w - bw) / 2, by = h - 24;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx, by, bw, 6);
    const fill = clamp(k * 1.7, 0, 1);
    ctx.fillStyle = VOID;
    ctx.fillRect(bx, by, bw * fill, 6);

    if (k > 0.62) {
      const fk = (k - 0.62) / 0.38;
      ctx.save();
      ctx.globalAlpha = 1 - fk;
      label(ctx, 'LEVEL UP', cx, cy - 26 - fk * 12, GOLD, 12);
      ctx.restore();
    }
    label(ctx, 'shards level you up', cx, h - 10, DIM, 8);
  },

  // --- evolving: max weapon + its passive = something else entirely ---
  evolve(ctx, w, h, t) {
    ground(ctx, w, h);
    const loop = 5;
    const k = (t % loop) / loop;
    const cy = h * 0.44;
    const merge = clamp((k - 0.35) / 0.3, 0, 1);
    const done = k > 0.68;

    const lx = w * 0.24 + merge * (w * 0.5 - w * 0.24);
    const rx = w * 0.5 + (1 - merge) * (w * 0.76 - w * 0.5);

    if (!done) {
      blitc(ctx, iconSprite('glaive', 4), lx, cy, 0.9, 1 - merge * 0.2);
      label(ctx, 'Lv 8', lx, cy + 24, EMBER, 9);
      blitc(ctx, iconSprite('velocity', 4), rx, cy, 0.9, 1 - merge * 0.2);
      label(ctx, 'Lv 3', rx, cy + 24, VOID, 9);
      if (merge < 0.1) label(ctx, '+', w / 2, cy, DIM, 14);
    } else {
      const dk = (k - 0.68) / 0.32;
      const pop = 1 + Math.sin(Math.min(1, dk * 3) * Math.PI) * 0.35;
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - dk);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, cy, 16 + dk * 40, 0, TAU);
      ctx.stroke();
      ctx.restore();
      blitc(ctx, iconSprite('glaive_evo', 4), w / 2, cy, 0.9 * pop);
      label(ctx, 'CYCLONE', w / 2, cy + 26, GOLD, 10);
    }
    label(ctx, 'max weapon + its passive', w / 2, h - 11, DIM, 8);
  },

  // --- surviving: what the twenty minutes actually contains ---
  survive(ctx, w, h, t) {
    ground(ctx, w, h);
    const loop = 8;
    const k = (t % loop) / loop;
    const y = h * 0.62;
    const x0 = 18, x1 = w - 18;

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();

    ctx.strokeStyle = EMBER;
    ctx.beginPath();
    ctx.moveTo(x0, y); ctx.lineTo(x0 + (x1 - x0) * k, y); ctx.stroke();

    BOSSES.forEach((b, i) => {
      const bx = x0 + (x1 - x0) * (b.at / 20);
      const reached = k >= b.at / 20;
      ctx.fillStyle = reached ? b.color : 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.arc(bx, y, reached ? 4 : 3, 0, TAU);
      ctx.fill();
      label(ctx, String(b.at), bx, y + 13, reached ? b.color : DIM, 8);

      // The most recently passed boss rises above the line.
      const justPassed = reached && k - b.at / 20 < 0.16;
      if (justPassed) {
        const pk = (k - b.at / 20) / 0.16;
        const art = b.id === 'parduin' ? dragonPortrait(2) : bossPortraitArt(b.sprite, 1);
        ctx.save();
        ctx.globalAlpha = Math.sin(pk * Math.PI);
        const sc = Math.min(38 / art.width, 40 / art.height);
        blitc(ctx, art, bx, y - 26, sc);
        ctx.restore();
      }
      if (i === BOSSES.length - 1) label(ctx, 'min', x1 - 2, y + 13, DIM, 8);
    });
    label(ctx, 'a boss every four minutes', w / 2, 14, DIM, 8);
  },

  // --- the arena: any of them, on demand ---
  arena(ctx, w, h, t) {
    ground(ctx, w, h);
    const idx = Math.floor(t / 1.6) % BOSSES.length;
    const b = BOSSES[idx];
    const k = (t / 1.6) % 1;
    const art = b.id === 'parduin' ? dragonPortrait(2) : bossPortraitArt(b.sprite, 1);
    const sc = Math.min(64 / art.width, 62 / art.height);
    ctx.save();
    ctx.globalAlpha = clamp(Math.sin(k * Math.PI) * 2.2, 0, 1);
    blitc(ctx, art, w / 2, h * 0.44, sc);
    ctx.restore();

    // A selection frame that steps between five slots.
    const slots = BOSSES.length;
    for (let i = 0; i < slots; i++) {
      const sx = w / 2 + (i - (slots - 1) / 2) * 18;
      const on = i === idx;
      ctx.fillStyle = on ? BOSSES[i].color : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.roundRect(sx - 6, h - 22, 12, 8, 2);
      ctx.fill();
    }
    label(ctx, b.cutsceneName || b.name, w / 2, h - 33, b.color, 9);
  },

  // --- carrying it out: gold survives death ---
  meta(ctx, w, h, t) {
    ground(ctx, w, h);
    const loop = 5;
    const k = (t % loop) / loop;
    const cx = w * 0.26, cy = h * 0.44;

    // The hero falls, and the coins keep going.
    const fallen = k > 0.22;
    ctx.save();
    if (fallen) { ctx.translate(cx, cy); ctx.rotate(1.5); ctx.translate(-cx, -cy); ctx.globalAlpha = 0.45; }
    shadow(ctx, cx, cy + 20, 13);
    blitc(ctx, heroSprites('ranger', 3).south[0], cx, cy, 0.62);
    ctx.restore();

    const vaultX = w * 0.76;
    for (let i = 0; i < 6; i++) {
      const p = clamp((k - 0.26) * 2.4 - i * 0.09, 0, 1);
      if (p <= 0 || p >= 1) continue;
      const px = cx + (vaultX - cx) * p;
      const py = cy - Math.sin(p * Math.PI) * 26 + i * 1.5;
      blitc(ctx, pickupSprite('coin', 2), px, py, 0.75);
    }

    // Upgrade pips filling in the Sanctuary.
    const filled = Math.floor(clamp((k - 0.5) * 2.6, 0, 1) * 5);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < filled ? GOLD : 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.roundRect(vaultX - 26 + i * 11, cy + 14, 8, 5, 2);
      ctx.fill();
    }
    blitc(ctx, iconSprite('might', 4), vaultX, cy - 6, 0.8);
    label(ctx, 'gold survives death', w / 2, h - 11, DIM, 8);
  },

  // --- food: the one thing that heals ---
  food(ctx, w, h, t) {
    ground(ctx, w, h);
    // A spread of the menu — the full thirteen would crowd the ring.
    const ids = ['etli_ekmek', 'dumpling', 'salmon_nigiri', 'avocado_maki', 'california_roll',
      'salmon_uramaki', 'lasagna', 'heaven_persimmon', 'cookies'];
    const cy = h * 0.44;
    for (let i = 0; i < ids.length; i++) {
      const a = (i / ids.length) * TAU + t * 0.5;
      const x = w / 2 + Math.cos(a) * (w * 0.31);
      const y = cy + Math.sin(a) * 15;
      const front = Math.sin(a) > 0;
      blitc(ctx, foodSprite(ids[i], 2), x, y, front ? 0.85 : 0.6, front ? 1 : 0.45);
    }
    // Which of the two outcomes you get depends on how hurt you are, so the
    // card shows the health bar filling, then overflowing into experience.
    const cycle = (t % 8) / 8;
    const hurt = cycle < 0.5;
    const fill = hurt ? clamp(cycle / 0.42, 0, 1) : 1;
    const barW = Math.min(w * 0.34, 110);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(w / 2 - barW / 2, cy + 16, barW, 6);
    ctx.fillStyle = hurt ? '#7fe05a' : '#4a7a3a';
    ctx.fillRect(w / 2 - barW / 2, cy + 16, barW * fill, 6);

    ctx.save();
    ctx.globalAlpha = 0.5 + 0.35 * Math.sin(t * 3);
    label(ctx, hurt ? '+HP' : '+XP', w / 2, cy - 2, hurt ? BLOOD : '#9ad4ff', 13);
    ctx.restore();
    label(ctx, hurt ? 'hurt: it heals you' : 'full up: it feeds your level instead',
      w / 2, h - 11, DIM, 8);
  },

  // --- market: the hub between boss fights ---
  market(ctx, w, h, t) {
    ctx.fillStyle = '#241a1e';
    ctx.fillRect(0, 0, w, h);
    // Cobbles, suggested rather than tiled — this card is 128px tall.
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 34; y < h; y += 7) {
      for (let x = ((y / 7) % 2) * 7; x < w; x += 14) ctx.fillRect(x, y, 11, 5);
    }
    // Three awnings across the back, with a warm glow under each.
    const cloths = ['#8f2f2a', '#3f7d5a', '#3c4f8f'];
    for (let i = 0; i < 3; i++) {
      const x = w * (0.2 + i * 0.3);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.ellipse(x, 52, 30, 16, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      for (let s = 0; s < 5; s++) {
        ctx.fillStyle = s % 2 ? '#e8dcc0' : cloths[i];
        ctx.fillRect(x - 22 + s * 9, 20, 9, 11);
      }
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(x - 24, 31, 48, 4);
      ctx.fillRect(x - 22, 35, 3, 12);
      ctx.fillRect(x + 19, 35, 3, 12);
      // The vendor behind the counter.
      ctx.fillStyle = ['#6b4a25', '#3f7d5a', '#3d334a'][i];
      ctx.fillRect(x - 5, 22 + Math.sin(t * 1.6 + i) * 0.8, 10, 12);
    }
    // Townsfolk crossing, and the hero walking up to the middle stall.
    const set = heroSprites('ranger', 2);
    for (let i = 0; i < 4; i++) {
      const p = ((t * 0.11 + i * 0.25) % 1);
      const x = i % 2 ? w * p : w * (1 - p);
      const dir = i % 2 ? 'east' : 'west';
      const img = set[dir][Math.floor(t * 5 + i) % 4];
      shadow(ctx, x, 80 + i * 5, 7);
      blitc(ctx, img, x, 72 + i * 5, 0.8, 0.5);
    }
    const hx = w / 2 + Math.sin(t * 0.8) * 22;
    shadow(ctx, hx, 96, 9);
    blitc(ctx, set[Math.sin(t * 0.8) > 0 ? 'east' : 'west'][Math.floor(t * 6) % 4], hx, 88, 1);
    // Coins changing hands.
    const beat = (t * 0.7) % 1;
    if (beat < 0.5) {
      const cp = beat / 0.5;
      blitc(ctx, pickupSprite('coin', 2), hx + (w / 2 - hx) * cp * 0.4, 74 - Math.sin(cp * Math.PI) * 16, 0.7, 1 - cp * 0.4);
    }
    label(ctx, 'spend it here, or bank it', w / 2, h - 11, DIM, 8);
  },

  // --- saves: the run keeps ---
  saves(ctx, w, h, t) {
    ground(ctx, w, h);
    const cycle = t % 6;
    const cx = w / 2;
    // A save slot filling in, then being picked back up.
    const cardW = Math.min(w - 40, 210);
    const y = 40;
    ctx.fillStyle = 'rgba(30,22,44,0.9)';
    ctx.fillRect(cx - cardW / 2, y, cardW, 40);
    ctx.strokeStyle = cycle > 2 ? 'rgba(255,215,94,0.5)' : 'rgba(255,236,210,0.13)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - cardW / 2 + 0.5, y + 0.5, cardW - 1, 39);

    if (cycle > 1.2) {
      blitc(ctx, heroSprites('ada', 2).south[0], cx - cardW / 2 + 22, y + 20, 0.8);
      ctx.textAlign = 'left';
      label(ctx, 'Ada — LV 24', cx - cardW / 2 + 42 + 30, y + 15, INK, 10);
      label(ctx, '12:40 · 4 210 slain', cx - cardW / 2 + 42 + 34, y + 28, DIM, 8);
      ctx.textAlign = 'center';
    } else {
      label(ctx, 'empty', cx, y + 20, DIM, 9);
    }

    // The autosave stamp lands when you walk into the market.
    if (cycle > 2 && cycle < 4.4) {
      const p = clamp((cycle - 2) / 0.5, 0, 1);
      ctx.save();
      ctx.globalAlpha = cycle > 3.9 ? 1 - (cycle - 3.9) / 0.5 : 1;
      ctx.fillStyle = GOLD;
      ctx.fillRect(cx + cardW / 2 - 40, y - 9, 36 * p, 13);
      ctx.fillStyle = '#1a1119';
      ctx.font = '8px "Silkscreen", monospace';
      ctx.textAlign = 'center';
      if (p > 0.9) ctx.fillText('AUTO', cx + cardW / 2 - 22, y - 1);
      ctx.restore();
    }
    label(ctx, cycle > 4.4 ? 'pick it up where you left it' : 'the market saves for you',
      w / 2, h - 11, cycle > 4.4 ? GOLD : DIM, 8);
  },
};

export const DEMO_KEYS = Object.keys(DEMOS);
