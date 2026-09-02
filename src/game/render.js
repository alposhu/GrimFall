// ---------------------------------------------------------------------------
// render.js — everything that reaches the canvas.
//
// Draw order is: ground, ground effects, depth-sorted actors, airborne effects,
// particles, then full-screen grading. Actors and scenery share one sorted list
// so the hero can walk behind a tree.
// ---------------------------------------------------------------------------

import { TAU, clamp } from '../core/util.js';
import { blit, glow } from '../art/pixel.js';
import { heroSprites } from '../art/hero.js';
import { mobSprite, championSprite } from '../art/bestiary.js';
import { drawBossFigure } from '../art/bosses.js';
import { pickupSprite } from '../art/props.js';
import { foodSprite } from '../art/food.js';
import { drawParduin } from '../art/dragon.js';
import { drawGround, drawDecor, collectProps, biomeAt } from './world.js';
import { drawParticles, drawTexts, drawAmbient } from './particles.js';
import { S, maxHp } from './state.js';
import { q } from '../core/quality.js';

const drawList = [];

export function render(ctx, canvas, zoom, opts = {}) {
  // One flag drives every optional flourish; the quality governor owns it.
  const lowFx = !q.glows;
  const w = canvas.width, h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const biome = biomeAt(S.cam.x, S.cam.y);
  ctx.fillStyle = biome.ground;
  ctx.fillRect(0, 0, w, h);

  if (!S.player) return;

  // --- camera ---
  const shake = S.shake > 0 && opts.shakeEnabled !== false ? S.shake : 0;
  const sx = shake ? (Math.random() * 2 - 1) * shake : 0;
  const sy = shake ? (Math.random() * 2 - 1) * shake : 0;
  ctx.save();
  ctx.translate(w / 2 + sx, h / 2 + sy);
  ctx.scale(zoom, zoom);
  ctx.translate(-S.cam.x, -S.cam.y);

  const view = S.view;

  drawGround(ctx, view);
  drawDecor(ctx, view, q.decorDensity);
  drawGroundEffects(ctx, lowFx);
  drawPortal(ctx, lowFx);

  // --- depth-sorted actors ---
  drawList.length = 0;
  collectProps(view, drawList, q.propDensity);
  for (const e of S.enemies) {
    if (e.x < view.left - 90 || e.x > view.right + 90 || e.y < view.top - 90 || e.y > view.bottom + 90) continue;
    drawList.push({ enemy: e, sortY: e.y });
  }
  for (const it of S.pickups) drawList.push({ pickup: it, sortY: it.y - 2 });
  drawList.push({ player: S.player, sortY: S.player.y });
  drawList.sort((a, b) => a.sortY - b.sortY);

  for (const d of drawList) {
    if (d.prop) drawProp(ctx, d);
    else if (d.enemy) drawEnemy(ctx, d.enemy, lowFx);
    else if (d.pickup) drawPickup(ctx, d.pickup);
    else drawPlayer(ctx, d.player, lowFx);
  }

  drawAirEffects(ctx, lowFx);
  drawParticles(ctx, lowFx);
  if (q.ambient) drawAmbient(ctx, biome.ambientColor, S.time, biome.ambient);
  drawTexts(ctx);

  ctx.restore();

  drawPortalMarker(ctx, w, h, zoom);
  drawGrading(ctx, w, h, biome, lowFx);
}

// A portal you cannot see is a portal you cannot find. Once it is off-screen,
// a chevron rides the edge of the view pointing at it, with the distance under
// it — the same job a quest marker does, without a minimap to maintain.
function drawPortalMarker(ctx, w, h, zoom) {
  const g = S.portal;
  if (!g || g.taken) return;

  const dx = g.x - S.cam.x;
  const dy = g.y - S.cam.y;
  const sx = w / 2 + dx * zoom;
  const sy = h / 2 + dy * zoom;
  const pad = 46;
  if (sx > pad && sx < w - pad && sy > pad && sy < h - pad) return;   // visible

  const a = Math.atan2(dy, dx);
  // Push out to the view rectangle rather than to a circle, so the marker sits
  // against the edge you are actually looking at.
  const hw = w / 2 - pad, hh = h / 2 - pad;
  const scale = Math.min(hw / Math.abs(Math.cos(a) || 1e-6), hh / Math.abs(Math.sin(a) || 1e-6));
  const mx = w / 2 + Math.cos(a) * scale;
  const my = h / 2 + Math.sin(a) * scale;
  const metres = Math.round(Math.hypot(dx, dy) / 10);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(mx, my);
  ctx.globalAlpha = 0.55 + Math.sin(S.time * 4) * 0.18;

  ctx.save();
  ctx.rotate(a);
  ctx.fillStyle = '#9ad4ff';
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(-8, 9);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, -9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#c9e8ff';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${metres} m`, 0, 24);
  ctx.restore();
}

// ---------------------------------------------------------------------------
function drawShadow(ctx, x, y, r, alpha = 0.32) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawProp(ctx, d) {
  drawShadow(ctx, d.x, d.y, d.img.width * 0.3, 0.22);
  ctx.drawImage(d.img, Math.round(d.x - d.img.width / 2), Math.round(d.y - d.img.height));
}

function drawEnemy(ctx, e, lowFx) {
  if (e.sprite === 'parduin') { drawDragon(ctx, e, lowFx); return; }
  if (e.isBoss) { drawHierarch(ctx, e, lowFx); return; }
  const img = e.isChampion ? championSprite(e.sprite, 2) : mobSprite(e.sprite, 2);
  // Sprites are pre-rasterised at 2x/3x; these divisors land every creature at
  // roughly `size * 2.2` on screen, so art and hitbox stay in proportion.
  const scale = e.scale / (e.isBoss ? 2.3 : e.isChampion ? 1.7 : 1.9);
  const bob = e.isBoss ? Math.sin(S.time * 2) * 3 : Math.sin(S.time * 6 + e.wobble) * 1.5;
  const footY = e.y + (img.height * scale) / 2 - 3;

  drawShadow(ctx, e.x, footY, e.size * 0.55, e.isBoss ? 0.4 : 0.3);

  if (e.elite && !lowFx) glow(ctx, e.x, e.y, e.size * 1.8, e.elite.color, 0.35);
  if ((e.isBoss || e.isChampion) && !lowFx) glow(ctx, e.x, e.y, e.size * 2.2, e.tint, 0.28);

  const alpha = e.alpha ?? 1;
  const frozen = (e.frozen || 0) > 0;
  blit(ctx, img, e.x, e.y + bob, {
    scale, alpha,
    anchorBottom: false,
    tint: e.flash > 0 ? '#ffffff' : frozen ? '#9ad8ff' : e.slow > 0 ? '#7fb8ff' : null,
    tintAlpha: e.flash > 0 ? 0.85 : frozen ? 0.5 : e.slow > 0 ? 0.28 : 0,
  });

  if (e.stun > 0 && !lowFx) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffe86a';
    for (let i = 0; i < 3; i++) {
      const a = S.time * 6 + (i / 3) * TAU;
      ctx.fillRect(e.x + Math.cos(a) * 12 - 1.5, e.y - e.size - 8 + Math.sin(a) * 4 - 1.5, 3, 3);
    }
    ctx.restore();
  }

  // Champions get a compact health bar; the boss uses the HUD bar instead.
  if (e.isChampion && e.hp < e.maxHp) {
    const bw = e.size * 1.6, bh = 4;
    const x = e.x - bw / 2, y = e.y - e.size - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
    ctx.fillStyle = e.tint;
    ctx.fillRect(x, y, bw * clamp(e.hp / e.maxHp, 0, 1), bh);
  }
}

/** The four hierarchs, composed from parts so their ornament can move. */
function drawHierarch(ctx, e, lowFx) {
  const scale = (e.size / 100) * 1.9;
  drawShadow(ctx, e.x, e.y + e.size * 0.62, e.size * 0.72, 0.36);
  if (!lowFx) glow(ctx, e.x, e.y, e.size * 2.1, e.tint, 0.2 + (e.rage || 0) * 0.15);

  drawBossFigure(ctx, e.sprite, e.x, e.y, scale, {
    t: S.time,
    casting: e.castTell || 0,
    rage: e.rage || 0,
    lowFx,
  });

  if (e.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, e.x, e.y, e.size * 1.5, '#ffffff', e.flash * 3);
    ctx.restore();
  }
}

/** Parduin is composed from parts every frame rather than blitted. */
function drawDragon(ctx, e, lowFx) {
  const scale = (e.renderScale || 1) * 1.05;
  const lift = e.airborne ? 34 : 0;

  // The shadow stays on the ground and shrinks as he climbs.
  drawShadow(ctx, e.x, e.y + e.size * 0.5, e.size * (e.airborne ? 0.62 : 0.78), e.airborne ? 0.28 : 0.42);

  if (!lowFx) glow(ctx, e.x, e.y - 10, e.size * 2.4, '#ff7a2a', 0.22 + (e.rage || 0) * 0.16);

  drawParduin(ctx, e.x, e.y - lift, scale, {
    t: S.time,
    flap: e.airborne ? 1 : 0.22,
    airborne: !!e.airborne,
    breath: e.breath || 0,
    rage: e.rage || 0,
  });

  if (e.flash > 0) {
    // Hit flash: a bright wash over his silhouette.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = e.flash * 3;
    glow(ctx, e.x, e.y - lift, e.size * 1.4, '#ffffff', 0.5);
    ctx.restore();
  }
}

function drawPickup(ctx, it) {
  const img = it.kind === 'food'
    ? foodSprite(it.variant, 2)
    : pickupSprite(it.kind, it.kind === 'chest' ? 3 : 2);
  const bob = Math.sin(it.t * 4) * 2.5;
  if (it.kind === 'chest') glow(ctx, it.x, it.y, 28, '#ffd75e', 0.5);
  else if (it.kind === 'food') glow(ctx, it.x, it.y, 20, '#ffc98a', 0.3);
  else if (it.kind === 'heart') glow(ctx, it.x, it.y, 16, '#ff6a86', 0.35);
  else if (it.kind === 'coin') glow(ctx, it.x, it.y, 13, '#ffd75e', 0.3);
  blit(ctx, img, it.x, it.y + bob, { scale: 1 });
}

function drawPlayer(ctx, p, lowFx) {
  const frames = heroSprites(p.charId, 3);
  const set = frames[p.dir] || frames.south;
  const img = set[p.moving ? p.frame : 0];
  const bob = p.moving && (p.frame === 1 || p.frame === 3) ? -1.5 : 0;

  drawShadow(ctx, p.x, p.y + 22, 15, 0.34);

  const blink = p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0;
  const hurt = p.hurtFlash > 0;
  if (!lowFx) glow(ctx, p.x, p.y, 46, '#ffe6b0', 0.12);

  blit(ctx, img, p.x, p.y + bob, {
    scale: 1,
    alpha: blink ? 0.55 : 1,
    tint: hurt ? '#ff2a4a' : null,
    tintAlpha: hurt ? 0.7 : 0,
  });

  if (p.chilled > 0 && !lowFx) glow(ctx, p.x, p.y, 34, '#8fd8ff', 0.3);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// The portal a dead boss leaves behind
// ---------------------------------------------------------------------------
// Drawn on the ground rather than as an actor: it is a hole, so nothing should
// pass behind it. It opens over about a second — a seam that widens into a
// disc — and then breathes, with a ring of runes turning slowly around the rim
// so it reads as made rather than as a puddle of light.
function drawPortal(ctx, lowFx) {
  const g = S.portal;
  if (!g || g.taken) return;

  const open = clamp(g.t / 1.1, 0, 1);
  const ease = 1 - (1 - open) * (1 - open);          // fast, then settling
  const R = 46 * ease;
  const t = g.t;

  ctx.save();
  ctx.translate(g.x, g.y);
  // Standing on the ground, so it is an ellipse rather than a circle.
  ctx.scale(1, 0.62);

  if (!lowFx) glow(ctx, 0, 0, 108 * ease, '#6aa8ff', 0.3 + Math.sin(t * 2.2) * 0.05);

  // The hole itself: dark in the middle, bright at the rim.
  const grad = ctx.createRadialGradient(0, 0, R * 0.12, 0, 0, R);
  grad.addColorStop(0, 'rgba(6,4,16,0.96)');
  grad.addColorStop(0.62, 'rgba(46,30,96,0.85)');
  grad.addColorStop(1, 'rgba(154,212,255,0.75)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();

  // Rim.
  ctx.strokeStyle = '#9ad4ff';
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.stroke();

  // Two counter-turning rune rings, which is most of what sells it as a door.
  if (!lowFx && open > 0.5) {
    ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.12;
    for (const [count, radius, speed, size] of [[9, R * 0.82, 0.6, 3], [6, R * 1.14, -0.9, 2]]) {
      ctx.fillStyle = '#c9e8ff';
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + t * speed;
        ctx.fillRect(Math.cos(a) * radius - size / 2, Math.sin(a) * radius - size / 2, size, size);
      }
    }
  }

  // Light spilling up out of it, undoing the ground squash so the column
  // stands vertically rather than lying down with the disc.
  if (!lowFx && open > 0.7) {
    ctx.scale(1, 1 / 0.62);
    const col = ctx.createLinearGradient(0, -96, 0, 6);
    col.addColorStop(0, 'rgba(154,212,255,0)');
    col.addColorStop(1, `rgba(154,212,255,${0.22 + Math.sin(t * 2.6) * 0.05})`);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-R * 0.5, 6);
    ctx.lineTo(R * 0.5, 6);
    ctx.lineTo(R * 0.24, -96);
    ctx.lineTo(-R * 0.24, -96);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawGroundEffects(ctx, lowFx) {
  for (const z of S.zones) {
    const t = clamp(z.life / z.maxLife, 0, 1);
    switch (z.kind) {
      case 'bramble':
      case 'thorn': {
        ctx.save();
        ctx.globalAlpha = 0.35 * t + 0.15;
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.8 * t;
        ctx.strokeStyle = z.color;
        ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU + z.life;
          ctx.beginPath();
          ctx.moveTo(z.x + Math.cos(a) * z.r * 0.2, z.y + Math.sin(a) * z.r * 0.2);
          ctx.lineTo(z.x + Math.cos(a) * z.r * 0.92, z.y + Math.sin(a) * z.r * 0.92);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'fire': {
        ctx.save();
        ctx.globalCompositeOperation = lowFx ? 'source-over' : 'lighter';
        ctx.globalAlpha = 0.35 * t;
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'ice':
      case 'web': {
        ctx.save();
        ctx.globalAlpha = 0.3 * t;
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.6 * t;
        ctx.strokeStyle = z.color;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          ctx.beginPath();
          ctx.moveTo(z.x, z.y);
          ctx.lineTo(z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'cone': {
        // A wedge of fire that sweeps outward as it lands.
        const reach = z.range * Math.min(1, (1 - t) * 2.2);
        ctx.save();
        ctx.globalCompositeOperation = lowFx ? 'source-over' : 'lighter';
        ctx.translate(z.x, z.y);
        ctx.rotate(z.angle);
        const g = ctx.createLinearGradient(0, 0, reach, 0);
        g.addColorStop(0, 'rgba(255,246,201,0.85)');
        g.addColorStop(0.45, 'rgba(255,138,42,0.55)');
        g.addColorStop(1, 'rgba(194,67,26,0)');
        ctx.globalAlpha = Math.min(1, t * 2.4);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, reach, -z.spread / 2, z.spread / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'telegraph': {
        const grow = 1 - t;
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.4 * (1 - t);
        ctx.strokeStyle = z.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * grow, 0, TAU);
        ctx.fill();
        ctx.restore();
        break;
      }
    }
  }
}

function drawAirEffects(ctx, lowFx) {
  // --- melee arcs ---
  for (const s of S.sweeps) {
    const t = clamp(s.life / s.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = t * 0.85;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    const swing = (1 - t) * s.arc - s.arc / 2;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 7 * t + 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, s.radius * (0.7 + 0.3 * (1 - t)), swing - 0.35, swing + 0.35);
    ctx.stroke();
    ctx.restore();
  }

  // --- orbiting nodes ---
  for (const o of S.orbs) {
    if (!lowFx) glow(ctx, o.x, o.y, o.r * 2.4, o.evolved ? '#ffffff' : '#ffe07a', 0.5);
    ctx.save();
    ctx.fillStyle = o.evolved ? '#ffffff' : '#ffe07a';
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r * 0.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // --- lightning arcs and blasts ---
  for (const z of S.zones) {
    const t = clamp(z.life / z.maxLife, 0, 1);
    if (z.kind === 'bolt') {
      ctx.save();
      ctx.globalAlpha = t;
      ctx.strokeStyle = z.color;
      ctx.lineWidth = 3 * t + 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(z.ax, z.ay);
      const segs = 5;
      for (let i = 1; i <= segs; i++) {
        const k = i / segs;
        const jitter = i === segs ? 0 : (Math.random() - 0.5) * 22;
        const nx = z.ax + (z.bx - z.ax) * k - (z.by - z.ay) * 0.001 * jitter;
        const ny = z.ay + (z.by - z.ay) * k + (z.bx - z.ax) * 0.001 * jitter;
        ctx.lineTo(nx + jitter * 0.3, ny + jitter * 0.3);
      }
      ctx.stroke();
      ctx.restore();
    } else if (z.kind === 'blast') {
      ctx.save();
      ctx.globalCompositeOperation = lowFx ? 'source-over' : 'lighter';
      ctx.globalAlpha = t * 0.8;
      const r = z.r * (1.1 - t * 0.35);
      const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, r);
      g.addColorStop(0, '#fff3c4');
      g.addColorStop(0.5, z.color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (z.kind === 'nova') {
      ctx.save();
      ctx.globalAlpha = t;
      ctx.strokeStyle = z.color;
      ctx.lineWidth = 6 * t + 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = t * 0.25;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- ember aura rings ---
  for (const w of S.player.weapons) {
    if (w.id !== 'aura' || !w.auraR) continue;
    ctx.save();
    ctx.globalCompositeOperation = lowFx ? 'source-over' : 'lighter';
    ctx.globalAlpha = 0.16 + 0.05 * Math.sin(S.time * 6);
    const g = ctx.createRadialGradient(S.player.x, S.player.y, w.auraR * 0.35, S.player.x, S.player.y, w.auraR);
    g.addColorStop(0, 'transparent');
    g.addColorStop(0.75, w.evolved ? '#ffd75e' : '#ff8a2a');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(S.player.x, S.player.y, w.auraR, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // --- player projectiles ---
  for (const s of S.shots) {
    ctx.save();
    if (s.glow && !lowFx) glow(ctx, s.x, s.y, s.size * 2.6, s.color, 0.55);
    ctx.translate(s.x, s.y - (s.hop || 0));
    ctx.rotate(s.kind === 'bolt' || s.kind === 'pike' ? s.rot : (s.rot || 0));
    ctx.fillStyle = s.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    switch (s.kind) {
      case 'bolt':
        ctx.beginPath();
        ctx.moveTo(s.size * 0.9, 0);
        ctx.lineTo(-s.size * 0.6, s.size * 0.34);
        ctx.lineTo(-s.size * 0.3, 0);
        ctx.lineTo(-s.size * 0.6, -s.size * 0.34);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      case 'mjolnir': {
        // A short-hafted hammer, drawn rather than sheeted so the head can
        // carry its own charge: a bright core, a dark iron body, and a halo
        // that pulses independently of the spin.
        const t = S.time * 14;
        const L = s.size;
        if (!lowFx) {
          ctx.save();
          ctx.rotate(-s.rot);                      // the glow does not tumble
          glow(ctx, 0, 0, L * 2.4, s.color, 0.34 + Math.sin(t) * 0.1);
          ctx.restore();
        }
        // Haft.
        ctx.fillStyle = '#8a5a33';
        ctx.fillRect(-L * 0.16, -L * 0.1, L * 0.32, L * 1.15);
        ctx.strokeRect(-L * 0.16, -L * 0.1, L * 0.32, L * 1.15);
        // Head: a squat block with a lighter face.
        ctx.fillStyle = '#5a6274';
        ctx.fillRect(-L * 0.62, -L * 0.72, L * 1.24, L * 0.66);
        ctx.strokeRect(-L * 0.62, -L * 0.72, L * 1.24, L * 0.66);
        ctx.fillStyle = s.color;
        ctx.fillRect(-L * 0.52, -L * 0.62, L * 0.42, L * 0.46);
        ctx.fillStyle = '#c9d2e0';
        ctx.fillRect(L * 0.16, -L * 0.62, L * 0.36, L * 0.46);
        // A crackle across the head, redrawn each frame so it never repeats.
        if (!lowFx) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.5 + Math.sin(t * 1.7) * 0.35;
          ctx.beginPath();
          let hx = -L * 0.55;
          ctx.moveTo(hx, -L * 0.4);
          for (let k = 0; k < 4; k++) {
            hx += L * 0.28;
            ctx.lineTo(hx, -L * 0.4 + (k % 2 ? 1 : -1) * L * 0.16);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'pike':
        // A long head on a shaft, drawn along its own heading.
        ctx.beginPath();
        ctx.moveTo(s.size * 1.5, 0);
        ctx.lineTo(s.size * 0.4, s.size * 0.3);
        ctx.lineTo(-s.size * 1.5, s.size * 0.13);
        ctx.lineTo(-s.size * 1.5, -s.size * 0.13);
        ctx.lineTo(s.size * 0.4, -s.size * 0.3);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      case 'glaive':
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU;
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * s.size, Math.sin(a) * s.size);
          ctx.lineTo(Math.cos(a + 0.5) * s.size * 0.5, Math.sin(a + 0.5) * s.size * 0.5);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      case 'bomb':
        ctx.beginPath();
        ctx.arc(0, 0, s.size * 0.55, 0, TAU);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd75e';
        ctx.fillRect(-1, -s.size * 0.9, 2, 4);
        break;
      default:
        ctx.beginPath();
        ctx.arc(0, 0, s.size * 0.5, 0, TAU);
        ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // --- enemy projectiles ---
  for (const s of S.hostileShots) {
    if (!lowFx) glow(ctx, s.x, s.y, s.size * 2.4, s.color, 0.45);
    ctx.save();
    ctx.fillStyle = s.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * 0.55, 0, TAU);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(s.x - s.size * 0.16, s.y - s.size * 0.16, s.size * 0.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
let vignette = null, vignetteKey = '';
function drawGrading(ctx, w, h, biome, lowFx) {
  if (!lowFx) {
    const key = `${w}x${h}:${biome.fog}`;
    if (key !== vignetteKey) {
      vignetteKey = key;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.36, w / 2, h / 2, Math.max(w, h) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, biome.fog);
      vignette = g;
    }
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (S.flashAlpha > 0.001) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.75, S.flashAlpha);
    ctx.fillStyle = S.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Low-health warning frame.
  const hpFrac = S.player.hp / Math.max(1, maxHp());
  if (S.running && S.player.hp > 0 && hpFrac < 0.35) {
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.12 * Math.sin(S.time * 6);
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, '#ff1e3c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Attract mode: the same world, drifting behind the menus.
// ---------------------------------------------------------------------------
export function renderBackdrop(ctx, canvas, zoom, t) {
  const w = canvas.width, h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  S.cam.x = Math.cos(t * 0.055) * 2600 + t * 26;
  S.cam.y = Math.sin(t * 0.041) * 2200 + t * 14;
  const vw = w / zoom, vh = h / zoom;
  S.view = {
    left: S.cam.x - vw / 2, right: S.cam.x + vw / 2,
    top: S.cam.y - vh / 2, bottom: S.cam.y + vh / 2, w: vw, h: vh,
  };
  S.time = t;

  const biome = biomeAt(S.cam.x, S.cam.y);
  ctx.fillStyle = biome.ground;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-S.cam.x, -S.cam.y);

  drawGround(ctx, S.view);
  drawDecor(ctx, S.view, 1);

  drawList.length = 0;
  collectProps(S.view, drawList, q.propDensity);
  drawList.sort((a, b) => a.sortY - b.sortY);
  for (const d of drawList) drawProp(ctx, d);

  drawAmbient(ctx, biome.ambientColor, t, biome.ambient);
  ctx.restore();

  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, biome.fog);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
