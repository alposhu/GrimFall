// ---------------------------------------------------------------------------
// weapons.js — how each weapon fires, and how everything it spawns behaves.
//
// Firing is table-driven: `FIRE[id]` receives already-resolved stats, so the
// same function serves a weapon and its evolution.
// ---------------------------------------------------------------------------

import { TAU, rand, angleTo, angleDelta, clamp, swapRemove } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { q } from '../core/quality.js';
import { burst, ring, emit, smoke } from './particles.js';
import { WEAPONS } from './config.js';
import {
  S, resolvedStats, damageEnemy, nearestEnemy, nearestEnemies, forEachNear,
  spawnShot, spawnZone, spawnSweep, addShake, damagePlayer,
} from './state.js';

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------
const FIRE = {
  bolt(s, w) {
    const p = S.player;
    const target = nearestEnemy(p.x, p.y, 640);
    const baseAngle = target ? angleTo(p.x, p.y, target.x, target.y) : p.faceAngle;
    const n = Math.max(1, Math.round(s.count));
    const spread = w.evolved ? 0.62 : 0.16;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * 2;
      const a = baseAngle + off;
      spawnShot({
        x: p.x, y: p.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
        dmg: s.damage, pierce: s.pierce, life: 1.5, size: 7 * s.size,
        rot: a, color: w.evolved ? '#ffe86a' : '#e8eef8', kind: 'bolt',
        knockback: s.knockback, hits: new Set(), trail: w.evolved ? '#ffb02a' : null,
      });
    }
    sfx('shoot');
  },

  slash(s, w) {
    const p = S.player;
    const target = nearestEnemy(p.x, p.y, 260);
    const a = target ? angleTo(p.x, p.y, target.x, target.y) : p.faceAngle;
    const n = Math.max(1, Math.round(s.count));
    for (let i = 0; i < n; i++) {
      spawnSweep({
        x: p.x, y: p.y, angle: a + (i % 2 ? Math.PI : 0) + (i > 1 ? rand(-0.5, 0.5) : 0),
        arc: (w.evolved ? 2.4 : 1.5) * clamp(s.area, 0.6, 3),
        radius: (w.evolved ? 120 : 92) * s.area,
        life: s.duration, maxLife: s.duration, dmg: s.damage,
        knockback: s.knockback, color: w.evolved ? '#ff8aa4' : '#dff0ff',
        armorPierce: !!w.evolved,
      });
    }
    sfx('slash');
  },

  orb(s, w) {
    const p = S.player;
    const n = Math.max(1, Math.round(s.count));
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      spawnShot({
        x: p.x, y: p.y, vx: Math.cos(a) * s.speed * 0.5, vy: Math.sin(a) * s.speed * 0.5,
        dmg: s.damage, pierce: s.pierce, life: 4.5, size: 9 * s.size,
        color: w.evolved ? '#ffc7f0' : '#c9a8ff', kind: 'orb', homing: w.evolved ? 7 : 4,
        maxSpeed: s.speed, knockback: s.knockback, hits: new Set(), glow: true,
      });
    }
    sfx('shoot');
  },

  firebomb(s, w) {
    const p = S.player;
    const n = Math.max(1, Math.round(s.count));
    for (let i = 0; i < n; i++) {
      let tx, ty;
      const t = w.evolved ? pickCrowdTarget() : nearestEnemy(p.x, p.y, 460);
      if (t) { tx = t.x + rand(-30, 30); ty = t.y + rand(-30, 30); }
      else { const a = rand(0, TAU); tx = p.x + Math.cos(a) * 180; ty = p.y + Math.sin(a) * 180; }
      const a = angleTo(p.x, p.y, tx, ty);
      const d = Math.hypot(tx - p.x, ty - p.y);
      spawnShot({
        x: p.x, y: p.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
        dmg: s.damage, pierce: 0, life: Math.max(0.15, d / s.speed), size: 8 * s.size,
        color: '#ff8a2a', kind: 'bomb', spin: 8, aoe: 68 * s.area,
        knockback: s.knockback, arcT: 0, arcDur: Math.max(0.15, d / s.speed),
        fromX: p.x, fromY: p.y, toX: tx, toY: ty, hits: new Set(),
      });
    }
    sfx('shoot');
  },

  aura(s, w) {
    const p = S.player;
    const r = (w.evolved ? 132 : 84) * s.area;
    w.auraR = r;
    let hit = 0;
    forEachNear(p.x, p.y, r, (e) => {
      if (e.dead) return;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > r + e.size * 0.5) return;
      damageEnemy(e, s.damage, {
        knockback: s.knockback, fromX: p.x, fromY: p.y,
        burn: s.burn ? s.damage * 0.35 : 0,
      });
      hit++;
    });
    if (hit) {
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU);
        emit('spark', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, {
          vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 20,
          life: 0.4, size: 3, color: w.evolved ? '#ffd75e' : '#ff8a2a', glow: true,
        });
      }
    }
  },

  lightning(s, w) {
    const p = S.player;
    let cur = nearestEnemy(p.x, p.y, 520);
    if (!cur) return;
    const chained = new Set();
    let from = { x: p.x, y: p.y };
    const links = Math.max(1, Math.round(s.count));
    for (let i = 0; i < links && cur; i++) {
      chained.add(cur);
      spawnZone({
        x: 0, y: 0, kind: 'bolt', life: 0.16, maxLife: 0.16,
        ax: from.x, ay: from.y, bx: cur.x, by: cur.y,
        color: w.evolved ? '#ffffff' : '#ffe86a', dps: 0, r: 0,
      });
      damageEnemy(cur, s.damage * (1 - i * 0.04), {
        stun: s.stun || 0, knockback: 30, fromX: from.x, fromY: from.y,
      });
      burst(cur.x, cur.y, 5, '#ffe86a', { speed: 90, glow: true });
      from = { x: cur.x, y: cur.y };
      const next = nearestEnemies(cur.x, cur.y, 1, s.range, chained);
      cur = next[0] || null;
    }
    sfx('zap');
  },

  nova(s, w) {
    const p = S.player;
    const r = (w.evolved ? 300 : 210) * s.area;
    spawnZone({
      x: p.x, y: p.y, kind: 'nova', r: 12, maxR: r, life: 0.55, maxLife: 0.55,
      dps: 0, dmg: s.damage, slow: s.slow, slowTime: s.slowTime,
      shatter: s.shatter || 0, hits: new Set(),
      color: w.evolved ? '#ffffff' : '#9ad8ff',
    });
    sfx('frost');
  },

  glaive(s, w) {
    const p = S.player;
    const n = Math.max(1, Math.round(s.count));
    const t = nearestEnemy(p.x, p.y, 520);
    const base = t ? angleTo(p.x, p.y, t.x, t.y) : p.faceAngle;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.5;
      spawnShot({
        x: p.x, y: p.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
        dmg: s.damage, pierce: 999, life: 6, size: 11 * s.size, spin: 16,
        color: w.evolved ? '#c9f2ff' : '#d9e2f0', kind: 'glaive',
        knockback: s.knockback || 90, range: s.range, travelled: 0,
        returning: false, loops: s.loops || 1, hits: new Set(), hitCd: new Map(),
      });
    }
    sfx('slash');
  },

  orbit() { /* handled continuously in updateOrbits */ },

  brambles(s, w) {
    const p = S.player;
    const n = Math.max(1, Math.round(s.count));
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const d = rand(30, 130) * (w.evolved ? 1.5 : 1);
      spawnZone({
        x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
        r: 42 * s.area, life: s.duration, maxLife: s.duration,
        dps: s.damage, tickRate: 0.4, kind: 'bramble',
        root: s.root || 0, slow: s.root ? 0 : 0.25, color: w.evolved ? '#c9f26a' : '#4f9a3c',
      });
    }
    sfx('slash');
  },

  // Mjolnir does not fly straight and it does not come back on its own line.
  // It is thrown, it picks a target, it turns towards it like a missile, and
  // when it connects it picks another — so what you watch is a hammer touring
  // the crowd. On the way it throws lightning: sometimes into a nearby enemy,
  // sometimes straight up into the air, which is what makes it a storm rather
  // than a projectile. It comes home at the end.
  mjolnir(s, w) {
    const p = S.player;
    const n = Math.max(1, Math.round(s.count));
    const t = nearestEnemy(p.x, p.y, 620);
    const base = t ? angleTo(p.x, p.y, t.x, t.y) : p.faceAngle;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.72;
      spawnShot({
        x: p.x, y: p.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
        dmg: s.damage, pierce: 999, life: s.duration, size: 13 * s.size,
        color: w.evolved ? '#ffe86a' : '#d9e2f0', kind: 'mjolnir',
        knockback: s.knockback, stun: s.stun || 0,
        speed: s.speed, turn: s.turn, area: s.area,
        arcRate: Math.max(0.12, s.arcRate), arcT: Math.random() * 0.3,
        arcs: Math.max(1, Math.round(s.arcs)), chain: s.chain || 0,
        evolved: !!w.evolved, spin: 19, rot: a,
        target: null, hitCd: new Map(), returning: false, spark: 0,
      });
    }
    sfx('hammer');
  },

  // Lobbed like a firebomb, but what matters is what it leaves behind.
  censer(s, w) {
    const p = S.player;
    const n = Math.max(1, Math.round(s.count));
    for (let i = 0; i < n; i++) {
      const t = nearestEnemy(p.x, p.y, 420);
      let tx, ty;
      if (t) { tx = t.x + rand(-40, 40); ty = t.y + rand(-40, 40); }
      else { const a = rand(0, TAU); tx = p.x + Math.cos(a) * 150; ty = p.y + Math.sin(a) * 150; }
      const a = angleTo(p.x, p.y, tx, ty);
      const d = Math.hypot(tx - p.x, ty - p.y);
      const flight = Math.max(0.15, d / s.speed);
      spawnShot({
        x: p.x, y: p.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
        dmg: s.damage * 0.45, pierce: 0, life: flight, size: 7 * s.size,
        color: w.evolved ? '#ffd75e' : '#8fd8ff', kind: 'bomb', spin: 5,
        aoe: 44 * s.area, knockback: 60, arcT: 0, arcDur: flight,
        fromX: p.x, fromY: p.y, toX: tx, toY: ty, hits: new Set(),
        // What makes it a censer rather than a bomb: the fire stays.
        pool: { r: 56 * s.area, life: s.duration, dps: s.damage * 0.5,
          color: w.evolved ? '#ffd75e' : '#ff8a2a' },
      });
    }
    sfx('shoot');
  },

  // No auto-aim: a pike goes where you are looking, and rewards you for
  // lining the crowd up before it fires.
  pike(s, w) {
    const p = S.player;
    const n = Math.max(1, Math.round(s.count));
    const spread = w.evolved ? 0.34 : 0.13;
    for (let i = 0; i < n; i++) {
      const a = p.faceAngle + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * 2);
      spawnShot({
        x: p.x, y: p.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
        dmg: s.damage, pierce: s.pierce, life: 0.85, size: 13 * s.size,
        rot: a, color: w.evolved ? '#ffe86a' : '#c9d2e0', kind: 'pike',
        knockback: s.knockback, hits: new Set(),
        trail: w.evolved ? '#ffb02a' : null,
      });
    }
    sfx('slash');
  },
};

/** For Meteor Rain: aim where the crowd is densest, not just nearest. */
function pickCrowdTarget() {
  let best = null, bestScore = -1;
  const sample = Math.min(S.enemies.length, 40);
  for (let i = 0; i < sample; i++) {
    const e = S.enemies[(Math.random() * S.enemies.length) | 0];
    if (!e || e.dead) continue;
    let score = e.isBoss ? 12 : e.isChampion ? 8 : 0;
    forEachNear(e.x, e.y, 90, (o) => { if (!o.dead) score++; });
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

/** Advance every equipped weapon's cooldown and fire when ready. */
export function updateWeapons(dt) {
  const p = S.player;
  for (const w of p.weapons) {
    const s = resolvedStats(w);
    if (!s) continue;
    if (w.id === 'orbit') { updateOrbits(dt, w, s); continue; }
    // Familiars are not fired: the bird decides when, in familiars.js.
    if (WEAPONS[w.id]?.familiar) continue;
    w.cd -= dt;
    if (w.cd <= 0) {
      w.cd += Math.max(0.06, s.cooldown);
      const fn = FIRE[w.id];
      if (fn) fn(s, w);
    }
  }
}

// ---------------------------------------------------------------------------
// Orbiting weapon
// ---------------------------------------------------------------------------
let orbitAngle = 0;
function updateOrbits(dt, w, s) {
  const p = S.player;
  orbitAngle += s.speed * dt;
  const n = Math.max(1, Math.round(s.count));
  S.orbs.length = 0;
  for (let i = 0; i < n; i++) {
    const a = orbitAngle + (i / n) * TAU;
    const r = s.radius;
    const ox = p.x + Math.cos(a) * r;
    const oy = p.y + Math.sin(a) * r;
    S.orbs.push({ x: ox, y: oy, r: 13 * s.size * (s.area || 1), evolved: w.evolved });
    forEachNear(ox, oy, 22 * (s.area || 1), (e) => {
      if (e.dead || (e.orbCd || 0) > 0) return;
      if (Math.hypot(e.x - ox, e.y - oy) > 20 * (s.area || 1) + e.size * 0.5) return;
      e.orbCd = 0.42;
      damageEnemy(e, s.damage, { knockback: 120, fromX: p.x, fromY: p.y });
      burst(ox, oy, 4, '#ffe07a', { speed: 90, glow: true });
    });
  }
}

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------
export function updateShots(dt) {
  for (let i = S.shots.length - 1; i >= 0; i--) {
    const s = S.shots[i];
    s.life -= dt;

    if (s.kind === 'bomb') {
      // Lobbed: interpolate towards the landing point, then detonate.
      s.arcT += dt;
      const t = clamp(s.arcT / s.arcDur, 0, 1);
      s.x = s.fromX + (s.toX - s.fromX) * t;
      s.y = s.fromY + (s.toY - s.fromY) * t;
      s.hop = Math.sin(t * Math.PI) * 34;
      s.rot += s.spin * dt;
      if (t >= 1 || s.life <= 0) { detonate(s); swapRemove(S.shots, i); continue; }
      continue;
    }

    if (s.kind === 'mjolnir') {
      updateMjolnir(s, dt);
      if (s.done) { swapRemove(S.shots, i); continue; }
    }

    if (s.kind === 'glaive') {
      const sp = Math.hypot(s.vx, s.vy);
      s.travelled += sp * dt;
      if (!s.returning && s.travelled >= s.range) { s.returning = true; }
      if (s.returning) {
        const a = angleTo(s.x, s.y, S.player.x, S.player.y);
        const target = sp;
        s.vx += (Math.cos(a) * target - s.vx) * Math.min(1, dt * 5);
        s.vy += (Math.sin(a) * target - s.vy) * Math.min(1, dt * 5);
        if (Math.hypot(s.x - S.player.x, s.y - S.player.y) < 26) {
          s.loops--;
          if (s.loops <= 0) { swapRemove(S.shots, i); continue; }
          s.returning = false;
          s.travelled = 0;
          const t = nearestEnemy(s.x, s.y, 520);
          const na = t ? angleTo(s.x, s.y, t.x, t.y) : rand(0, TAU);
          s.vx = Math.cos(na) * target;
          s.vy = Math.sin(na) * target;
        }
      }
      s.rot += s.spin * dt;
    }

    if (s.homing) {
      const t = nearestEnemy(s.x, s.y, 420);
      if (t) {
        const want = angleTo(s.x, s.y, t.x, t.y);
        const cur = Math.atan2(s.vy, s.vx);
        const na = cur + clamp(angleDelta(cur, want), -s.homing * dt, s.homing * dt);
        const sp = Math.min(s.maxSpeed || 260, Math.hypot(s.vx, s.vy) + 300 * dt);
        s.vx = Math.cos(na) * sp;
        s.vy = Math.sin(na) * sp;
        s.rot = na;
      }
    }

    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.trail && Math.random() < 0.6) {
      emit('spark', s.x, s.y, { life: 0.18, size: 3, color: s.trail, glow: true, drag: 0.8 });
    }

    if (s.life <= 0) { swapRemove(S.shots, i); continue; }

    // Off-screen cull with a generous margin so returning glaives survive.
    if (s.x < S.view.left - 400 || s.x > S.view.right + 400 ||
        s.y < S.view.top - 400 || s.y > S.view.bottom + 400) {
      swapRemove(S.shots, i); continue;
    }

    let consumed = false;
    forEachNear(s.x, s.y, s.size + 26, (e) => {
      if (consumed || e.dead) return;
      if (s.hits && s.hits.has(e)) return;
      const r = s.size * 0.5 + e.size * 0.8;
      if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > r * r) return;

      if (s.kind === 'glaive' || s.kind === 'mjolnir') {
        const last = s.hitCd.get(e) || 0;
        if (last > performance.now()) return;
        // A hammer will not hit the same body twice in a row; that cooldown is
        // also what makes it choose someone new to fly at.
        s.hitCd.set(e, performance.now() + (s.kind === 'mjolnir' ? 400 : 320));
      } else if (s.hits) {
        s.hits.add(e);
      }

      damageEnemy(e, s.dmg, {
        knockback: s.knockback, stun: s.stun || 0,
        fromX: s.x - s.vx * 0.01, fromY: s.y - s.vy * 0.01,
      });
      burst(s.x, s.y, 4, s.color, { speed: 90 });

      if (s.kind === 'mjolnir') {
        // A hammer blow is not a pinprick: everything standing around the body
        // it landed on takes it too, which is what stops a weapon that visits
        // one enemy at a time from being strictly worse than one that pierces.
        const blow = 54 * s.area;
        forEachNear(s.x, s.y, blow + 24, (o) => {
          if (o === e || o.dead) return;
          if (Math.hypot(o.x - s.x, o.y - s.y) > blow + o.size * 0.4) return;
          damageEnemy(o, s.dmg * 0.6, {
            knockback: s.knockback * 0.7, stun: (s.stun || 0) * 0.5,
            fromX: s.x, fromY: s.y,
          });
        });
        ring(s.x, s.y, blow, s.evolved ? '#ffe86a' : '#c9e8ff', { life: 0.24 });
        burst(s.x, s.y, 9, '#ffffff', { speed: 190, life: 0.3, glow: true });
        addShake(2);
        sfx('hammer');
        if (s.target === e) s.target = null;
      }

      if (s.kind !== 'glaive' && s.kind !== 'mjolnir') {
        s.pierce--;
        if (s.pierce <= 0) consumed = true;
      }
    });
    if (consumed) {
      if (s.kind === 'bolt') burst(s.x, s.y, 3, s.color, { speed: 70 });
      swapRemove(S.shots, i);
    }
  }
}

// ---------------------------------------------------------------------------
// Mjolnir
// ---------------------------------------------------------------------------
// Three things happen every frame: it steers, it storms, and it decides whether
// it is still hunting or on its way home.
function updateMjolnir(s, dt) {
  const p = S.player;
  const sp = Math.max(1, Math.hypot(s.vx, s.vy));

  // --- steering ------------------------------------------------------------
  // A target is kept until it dies or is struck, rather than re-picked every
  // frame: constantly re-aiming at whatever is marginally nearest produces a
  // hammer that jitters on the spot instead of committing to a run at someone.
  if (!s.returning) {
    if (!s.target || s.target.dead) s.target = pickHammerTarget(s);
    if (s.life <= 0.55) s.returning = true;
  }

  const goal = s.returning ? p : s.target;
  if (goal) {
    const want = angleTo(s.x, s.y, goal.x, goal.y);
    const cur = Math.atan2(s.vy, s.vx);
    // Turning harder the closer it is stops it orbiting a target it cannot
    // quite bend onto.
    const d = Math.hypot(goal.x - s.x, goal.y - s.y);
    const agility = s.turn * (d < 120 ? 1.7 : 1);
    const na = cur + clamp(angleDelta(cur, want), -agility * dt, agility * dt);
    s.vx = Math.cos(na) * s.speed;
    s.vy = Math.sin(na) * s.speed;
    s.rot = na;
  }

  // Home: it is caught rather than expiring in mid-air.
  if (s.returning && Math.hypot(s.x - p.x, s.y - p.y) < 30) {
    burst(s.x, s.y, 10, s.color, { speed: 110, glow: true });
    s.done = true;
    return;
  }

  // --- the storm -----------------------------------------------------------
  s.arcT -= dt;
  if (s.arcT <= 0) {
    s.arcT = s.arcRate;
    throwLightning(s);
  }

  // A trail of sparks and a crackle at the head, so it reads as charged even
  // in the gaps between arcs.
  s.spark -= dt;
  if (s.spark <= 0 && q.glows) {
    s.spark = 0.03;
    const a = Math.atan2(s.vy, s.vx) + Math.PI + rand(-0.5, 0.5);
    emit('spark', s.x, s.y, {
      vx: Math.cos(a) * rand(30, 90), vy: Math.sin(a) * rand(30, 90) - 20,
      life: rand(0.16, 0.34), size: 2, glow: true,
      color: Math.random() < 0.4 ? '#ffffff' : (s.evolved ? '#ffe86a' : '#9ad4ff'),
    });
  }
}

/** The next thing worth flying at: near, alive, and not just hit. */
function pickHammerTarget(s) {
  const now = performance.now();
  const near = nearestEnemies(s.x, s.y, 6, 520);
  for (const e of near) {
    if (!e || e.dead) continue;
    if ((s.hitCd.get(e) || 0) > now) continue;      // struck a moment ago
    return e;
  }
  return null;
}

/**
 * Lightning off the hammer. Most of it goes to something nearby; the rest goes
 * straight up into the air and hits nothing, because a storm is not a targeting
 * system and the ones that miss are what make it look like weather.
 */
function throwLightning(s) {
  const struck = new Set();
  for (let k = 0; k < s.arcs; k++) {
    const skyward = Math.random() < 0.34 || !S.enemies.length;
    if (skyward) {
      // Up and out, fading — no damage, all presence.
      const a = -Math.PI / 2 + rand(-0.8, 0.8);
      const len = rand(70, 150) * s.area;
      spawnZone({
        x: 0, y: 0, kind: 'bolt', life: 0.2, maxLife: 0.2, dps: 0, r: 0,
        ax: s.x, ay: s.y,
        bx: s.x + Math.cos(a) * len, by: s.y + Math.sin(a) * len,
        color: '#ffffff',
      });
      continue;
    }

    const near = nearestEnemies(s.x, s.y, 3, 190 * s.area, struck);
    const e = near[0];
    if (!e) continue;
    struck.add(e);
    spawnZone({
      x: 0, y: 0, kind: 'bolt', life: 0.16, maxLife: 0.16, dps: 0, r: 0,
      ax: s.x, ay: s.y, bx: e.x, by: e.y,
      color: s.evolved ? '#ffe86a' : '#9ad4ff',
    });
    damageEnemy(e, s.dmg * 0.5, { knockback: 40, fromX: s.x, fromY: s.y });
    burst(e.x, e.y, 4, '#ffe86a', { speed: 80, glow: true });

    // Stormbreaker's arcs jump once more on their own.
    if (s.chain) {
      const on = nearestEnemies(e.x, e.y, 1, 150, struck)[0];
      if (on) {
        struck.add(on);
        spawnZone({
          x: 0, y: 0, kind: 'bolt', life: 0.14, maxLife: 0.14, dps: 0, r: 0,
          ax: e.x, ay: e.y, bx: on.x, by: on.y, color: '#ffffff',
        });
        damageEnemy(on, s.dmg * 0.22, { knockback: 30, fromX: e.x, fromY: e.y });
      }
    }
  }
  sfx('zap');
}

function detonate(s) {
  spawnZone({ x: s.x, y: s.y, r: s.aoe, life: 0.3, maxLife: 0.3, kind: 'blast', color: '#ff8a2a', dps: 0 });
  // A censer's vial leaves a burning patch; a firebomb's does not.
  if (s.pool) {
    spawnZone({
      x: s.x, y: s.y, r: s.pool.r, life: s.pool.life, maxLife: s.pool.life,
      kind: 'fire', dps: s.pool.dps, tickRate: 0.35, color: s.pool.color,
    });
  }
  forEachNear(s.x, s.y, s.aoe + 30, (e) => {
    if (e.dead) return;
    if (Math.hypot(e.x - s.x, e.y - s.y) > s.aoe + e.size * 0.5) return;
    damageEnemy(e, s.dmg, { knockback: s.knockback, fromX: s.x, fromY: s.y });
  });
  burst(s.x, s.y, 22, '#ffb648', { speed: 240, life: 0.55, glow: true });
  smoke(s.x, s.y, 5, '#6b4a3a');
  ring(s.x, s.y, s.aoe, '#ffd75e', { life: 0.32 });
  addShake(3);
  // Deliberately not `boom`. This fires every second or so for the whole run,
  // and a full detonation at that rate stops reading as impact and starts
  // reading as noise.
  sfx('thud');
}

// ---------------------------------------------------------------------------
// Sweeps (melee arcs)
// ---------------------------------------------------------------------------
export function updateSweeps(dt) {
  for (let i = S.sweeps.length - 1; i >= 0; i--) {
    const s = S.sweeps[i];
    s.life -= dt;
    s.x = S.player.x;
    s.y = S.player.y;
    if (s.life <= 0) { swapRemove(S.sweeps, i); continue; }

    forEachNear(s.x, s.y, s.radius + 30, (e) => {
      if (e.dead || s.hits.has(e)) return;
      const d = Math.hypot(e.x - s.x, e.y - s.y);
      if (d > s.radius + e.size * 0.5) return;
      const a = angleTo(s.x, s.y, e.x, e.y);
      if (Math.abs(angleDelta(s.angle, a)) > s.arc / 2) return;
      s.hits.add(e);
      damageEnemy(e, s.dmg, { knockback: s.knockback, fromX: s.x, fromY: s.y });
      burst(e.x, e.y, 5, s.color, { speed: 120 });
    });
  }
}

// ---------------------------------------------------------------------------
// Zones (fire patches, novas, brambles, lightning arcs, blasts)
// ---------------------------------------------------------------------------
export function updateZones(dt) {
  for (let i = S.zones.length - 1; i >= 0; i--) {
    const z = S.zones[i];
    z.life -= dt;
    if (z.life <= 0) {
      // A telegraph is a promise: when it expires, the thing it warned about lands.
      if (z.kind === 'telegraph') detonateTelegraph(z);
      swapRemove(S.zones, i);
      continue;
    }

    if (z.kind === 'nova') {
      // A delayed ring sits at its origin until its moment, which is how the
      // Sunderer's second shock lands after the crowd has closed back in.
      if (z.delay > 0) { z.delay -= dt; z.life += dt; continue; }
      const t = 1 - z.life / z.maxLife;
      z.r = 12 + (z.maxR - 12) * t;
      forEachNear(z.x, z.y, z.r + 30, (e) => {
        if (e.dead || z.hits.has(e)) return;
        const d = Math.hypot(e.x - z.x, e.y - z.y);
        if (d > z.r + e.size * 0.5 || d < z.r - 46) return;
        z.hits.add(e);
        if (z.shatter) e.shatter = z.shatter;
        damageEnemy(e, z.dmg, {
          slow: z.slow, slowTime: z.slowTime, stun: z.stun || 0,
          shred: z.shred || 0, shredTime: z.shredTime || 4,
          knockback: z.knockback || 60, fromX: z.x, fromY: z.y,
        });
        if (z.slowTime) e.frozen = Math.max(e.frozen || 0, z.slowTime * 0.6);
        burst(e.x, e.y, 4, z.color || '#c9f2ff', { speed: 80, glow: true });
      });
      continue;
    }

    if (z.kind === 'bramble' || z.kind === 'fire') {
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = z.tickRate;
        forEachNear(z.x, z.y, z.r + 20, (e) => {
          if (e.dead) return;
          if (Math.hypot(e.x - z.x, e.y - z.y) > z.r + e.size * 0.4) return;
          damageEnemy(e, z.dps, { slow: z.slow, slowTime: 0.6, root: z.root });
        });
      }
      if (Math.random() < dt * 12) {
        const a = rand(0, TAU), d = Math.sqrt(Math.random()) * z.r;
        emit('spark', z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, {
          vx: rand(-10, 10), vy: rand(-30, -6), life: 0.5, size: 3, color: z.color, glow: true,
        });
      }
    }
  }
}

function detonateTelegraph(z) {
  spawnZone({ x: z.x, y: z.y, r: z.r, life: 0.3, maxLife: 0.3, kind: 'blast', color: z.color, dps: 0 });
  if (Math.hypot(S.player.x - z.x, S.player.y - z.y) < z.r) damagePlayer(z.payload || 0);
  burst(z.x, z.y, 18, '#ffb648', { speed: 220, glow: true });
  addShake(5);
  sfx('boom');
}

export { FIRE };
