// ---------------------------------------------------------------------------
// familiars.js — the four budgies, and what each of them does.
//
// A familiar differs from every other weapon in this game in one way that
// matters: it is on screen when it is not attacking. The rest of the arsenal
// exists only during its own animation, so it can be a function that runs on a
// cooldown and forgets. A bird has to be somewhere at all times, which means it
// needs state of its own, and that is `S.familiars`.
//
// The flock is DERIVED, never authored. `syncFlock` reconciles it against the
// weapons you own every frame, so a level-up that grants a second bird makes
// one appear, an evolution repalettes the ones already flying, and a loaded
// save rebuilds the flock without saving a single bird — there is nothing in a
// bird that is not already implied by the weapon it belongs to.
//
// Movement and attack are kept apart on purpose. `fly()` and the STATION table
// know where a bird should be; the ACT table knows what it does when it gets
// there. Neither reads the other's numbers, so retuning one cannot break the
// other. Flight parameters live in FAMILIARS in config.js; damage numbers live
// in WEAPONS, resolved through the same `weaponStats` as everything else.
// ---------------------------------------------------------------------------

import { TAU, rand, clamp } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { q } from '../core/quality.js';
import { burst, emit } from './particles.js';
import { FAMILIARS, WEAPONS } from './config.js';
import {
  S, resolvedStats, damageEnemy, killEnemy, nearestEnemy, nearestEnemies,
  forEachNear, spawnShot, spawnZone,
} from './state.js';
import { BUDGIE_FRAMES } from '../art/familiars.js';

// ---------------------------------------------------------------------------
// The flock
// ---------------------------------------------------------------------------
/**
 * Bring `S.familiars` in line with the weapons the player owns.
 *
 * Cheap enough to run every frame: it is a walk over at most six weapons and a
 * handful of birds, and doing it here rather than on level-up means there is no
 * event to forget to fire — buying a budgie in the market, loading a save and
 * evolving one all go through exactly this.
 */
function syncFlock(p) {
  const flock = S.familiars;
  let wanted = 0;

  for (const w of p.weapons) {
    const kind = WEAPONS[w.id]?.familiar;
    if (!kind) continue;
    const s = resolvedStats(w);
    if (!s) continue;
    // `birds` and not `count`: the ember budgie fires three shells from one
    // bird, so the two numbers cannot be the same number.
    const n = Math.max(1, Math.round(s.birds || 1));
    for (let i = 0; i < n; i++) {
      let b = flock[wanted];
      if (!b || b.kind !== kind || b.slot !== i) {
        b = hatch(kind, i, p);
        flock[wanted] = b;
      }
      b.weapon = w;                  // live reference: level-ups are picked up free
      b.evolved = !!w.evolved;
      b.of = n;
      wanted++;
    }
  }
  if (flock.length > wanted) flock.length = wanted;
}

function hatch(kind, slot, p) {
  const def = FAMILIARS[kind];
  const a = rand(0, TAU);
  return {
    kind, slot, of: 1,
    weapon: null, evolved: false,
    // Born at the player's shoulder rather than at the origin, so a bird
    // granted mid-fight does not streak in from off-screen.
    x: p.x + Math.cos(a) * (def?.radius || 40),
    y: p.y + Math.sin(a) * (def?.radius || 40),
    vx: 0, vy: 0,
    phase: rand(0, TAU),
    anim: rand(0, 4), frame: 0, west: false, bob: 0,
    cd: rand(0.1, 0.6),
    // roamers only
    mode: 'hunt', modeT: -1, target: null,
  };
}

/** Everything the renderer needs to draw the flock. Read-only for callers. */
export const flock = () => S.familiars;

// ---------------------------------------------------------------------------
// Flight
// ---------------------------------------------------------------------------
// Each station answers one question: where does this bird want to be right
// now? Steering, facing and animation are shared, so a new behaviour only has
// to add a line here.
const STATION = {
  ring(b, def, p) {
    const a = S.time * def.spin + (b.slot / Math.max(1, b.of)) * TAU;
    return { x: p.x + Math.cos(a) * def.radius, y: p.y + Math.sin(a) * def.radius * 0.72 };
  },

  shoulder(b, def, p) {
    // Mirrors to whichever side the player is facing away from, so the bird
    // never sits on top of the character sprite.
    const side = Math.cos(p.faceAngle) >= 0 ? -1 : 1;
    const spread = b.of > 1 ? (b.slot - (b.of - 1) / 2) * 18 : 0;
    return { x: p.x + def.offset.x * side + spread, y: p.y + def.offset.y };
  },

  trail(b, def, p) {
    const spread = b.of > 1 ? (b.slot - (b.of - 1) / 2) * 22 : 0;
    return {
      x: p.x - Math.cos(p.faceAngle) * def.distance - Math.sin(p.faceAngle) * spread,
      y: p.y - Math.sin(p.faceAngle) * def.distance + def.lift + Math.cos(p.faceAngle) * spread,
    };
  },

  // The white one is the only bird that does not orbit a person. It picks a
  // crowd and goes, and when its wind runs out it comes back to rest.
  roam(b, def, p) {
    if (b.mode === 'rest') return { x: p.x + def.restOffset.x, y: p.y + def.restOffset.y };
    if (!b.target || b.target.dead) b.target = pickCluster(b, def, p);
    if (!b.target) return { x: p.x + def.restOffset.x, y: p.y + def.restOffset.y };
    return { x: b.target.x, y: b.target.y };
  },
};

/** The fattest crowd the roamer can reach, weighted towards big things. */
function pickCluster(b, def, p) {
  let best = null, bestScore = -1;
  const cands = nearestEnemies(b.x, b.y, 14, def.hunt);
  for (const e of cands) {
    if (e.dead) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) > def.leash) continue;
    let score = e.isBoss ? 10 : e.isChampion ? 6 : 1;
    forEachNear(e.x, e.y, 80, (o) => { if (!o.dead) score += 0.6; });
    // Prefer near over far, but not so hard that it never crosses the screen.
    score -= Math.hypot(e.x - b.x, e.y - b.y) / 400;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function fly(b, def, dt) {
  const p = S.player;
  const want = (STATION[def.station] || STATION.shoulder)(b, def, p);
  const ease = b.mode === 'rest' ? (def.restEase || def.ease) : def.ease;

  // Critically damped-ish approach: fast when far, calm when close, and
  // frame-rate independent so a 144 Hz screen does not fly the bird differently.
  const k = 1 - Math.exp(-ease * dt);
  b.x += (want.x - b.x) * k;
  b.y += (want.y - b.y) * k;

  b.phase += dt * def.bobRate;
  b.bob = Math.sin(b.phase) * def.bob;

  // Facing follows travel, with a dead zone: a bird hovering in place should
  // not flicker between left and right on sub-pixel drift.
  const dx = want.x - b.x;
  if (dx > 3) b.west = false;
  else if (dx < -3) b.west = true;
}

function animate(b, def, dt) {
  b.anim += dt * def.flap;
  b.frame = Math.floor(b.anim) % BUDGIE_FRAMES;
}

// ---------------------------------------------------------------------------
// What each one does
// ---------------------------------------------------------------------------
const ACT = {
  // --- storm: lightning, from the bird, into the nearest thing -------------
  storm(b, s, w, dt) {
    b.cd -= dt;
    if (b.cd > 0) return;
    const first = nearestEnemy(b.x, b.y, s.range);
    if (!first) { b.cd = 0.12; return; }        // retry soon rather than idle a full cooldown
    b.cd = Math.max(0.12, s.cooldown);

    const chained = new Set();
    let from = { x: b.x, y: b.y + b.bob };
    let cur = first;
    const links = 1 + Math.max(0, Math.round(s.chain || 0));
    for (let i = 0; i < links && cur; i++) {
      chained.add(cur);
      spawnZone({
        x: 0, y: 0, kind: 'bolt', life: 0.16, maxLife: 0.16,
        ax: from.x, ay: from.y, bx: cur.x, by: cur.y,
        color: b.evolved ? '#ffffff' : '#9ad4ff', dps: 0, r: 0,
      });
      damageEnemy(cur, s.damage * (1 - i * 0.08), {
        stun: s.stun || 0, knockback: 40, fromX: from.x, fromY: from.y,
      });
      if (q.glows) burst(cur.x, cur.y, 4, '#c9f2ff', { speed: 90, glow: true });
      from = { x: cur.x, y: cur.y };
      cur = nearestEnemies(cur.x, cur.y, 1, 190, chained)[0] || null;
    }
    sfx('zap');
  },

  // --- chime: an expanding ring that slows, and later strips armour -------
  chime(b, s, w, dt) {
    b.cd -= dt;
    if (b.cd > 0) return;
    b.cd = Math.max(0.25, s.cooldown);
    spawnZone({
      x: b.x, y: b.y + b.bob, kind: 'nova',
      r: 12, maxR: s.radius * s.area, life: 0.62, maxLife: 0.62,
      dps: 0, dmg: s.damage, slow: clamp(s.slow, 0, 0.85), slowTime: 1.8,
      shred: s.shred || 0, knockback: 30,
      hits: new Set(),
      color: b.evolved ? '#ffffff' : '#8fe6ff',
    });
    sfx('frost');
  },

  // --- ember: fire into whichever crowd is thickest ------------------------
  ember(b, s, w, dt) {
    b.cd -= dt;
    if (b.cd > 0) return;
    b.cd = Math.max(0.25, s.cooldown);

    const n = Math.max(1, Math.round(s.count || 1));
    let fired = 0;
    for (let i = 0; i < n; i++) {
      const t = pickBlastTarget(b, s);
      if (!t) break;
      const from = { x: b.x, y: b.y + b.bob };
      const d = Math.hypot(t.x - from.x, t.y - from.y);
      const flight = Math.max(0.14, d / Math.max(60, s.speed));
      spawnShot({
        x: from.x, y: from.y, vx: 0, vy: 0,
        dmg: s.damage, pierce: 0, life: flight, size: 8 * (s.area || 1),
        color: b.evolved ? '#ff9a3c' : '#ffd75e', kind: 'bomb', spin: 7,
        aoe: 62 * (s.area || 1), knockback: 90,
        arcT: 0, arcDur: flight,
        fromX: from.x, fromY: from.y, toX: t.x, toY: t.y, hits: new Set(),
        // The fire that stays is the level-5 upgrade, and it is simply a pool
        // handed to the same detonation every other lobbed weapon uses.
        pool: s.puddle > 0
          ? { r: 52 * (s.area || 1), life: s.puddle, dps: s.damage * 0.32,
              color: b.evolved ? '#ff9a3c' : '#ff8a2a' }
          : null,
      });
      fired++;
    }
    if (!fired) { b.cd = 0.15; return; }

    // Kicked backwards by its own shot. Small, but it is the difference
    // between a bird that fires and a turret that happens to have feathers.
    const def = FAMILIARS.ember;
    b.x += (b.west ? 1 : -1) * def.recoil * 0.06;
    sfx('shoot');
  },

  // --- wraith: it goes out, it kills, it comes back ------------------------
  wraith(b, s, w, dt) {
    const def = FAMILIARS.wraith;
    // A new bird starts its first hunt immediately rather than serving a rest
    // it has not earned.
    if (b.modeT < 0) { b.mode = 'hunt'; b.modeT = s.uptime; }
    b.modeT -= dt;
    if (b.modeT <= 0) {
      if (b.mode === 'hunt' && s.rest > 0) { b.mode = 'rest'; b.modeT = s.rest; b.target = null; }
      else { b.mode = 'hunt'; b.modeT = s.uptime; }
    }
    if (b.mode === 'rest') return;

    // Contact damage. It has no cooldown of its own — the pacing IS the flight,
    // which is why speed is its most valuable upgrade.
    const reach = 17 * (s.area || 1);
    forEachNear(b.x, b.y, reach + 30, (e) => {
      if (e.dead || (e.reapCd || 0) > 0) return;
      if (Math.hypot(e.x - b.x, e.y - (b.y + b.bob)) > reach + e.size * 0.5) return;
      e.reapCd = Math.max(0.08, s.rehit ?? 0.26);
      const big = e.isBoss || e.isChampion || e.elite;
      if (!big && e.hp <= e.maxHp * clamp(s.execute, 0, 0.95)) {
        // Taken outright. Not damage — there is no number big enough to be
        // reliable against a scaling mob, and "it simply stops" is the point.
        if (q.glows) burst(e.x, e.y, 10, '#ffffff', { speed: 150, glow: true });
        killEnemy(e);
        sfx('kill');
      } else {
        damageEnemy(e, s.damage * (big ? Math.max(1, s.bossMult) : 1), {
          knockback: big ? 0 : 120, fromX: b.x, fromY: b.y,
        });
      }
      b.target = null;                   // pick a new one, keep moving
    });

    if (q.glows && Math.random() < dt * 22) {
      emit('spark', b.x + rand(-5, 5), b.y + b.bob + rand(-4, 4), {
        vx: rand(-14, 14), vy: rand(-6, 14), life: 0.34, size: 2,
        color: b.evolved ? '#c9a8ff' : '#dfe6f2', glow: true,
      });
    }
  },
};

/** Where a fire shell does the most good: density first, then distance. */
function pickBlastTarget(b, s) {
  const cands = nearestEnemies(b.x, b.y, 12, s.range || 460);
  if (!cands.length) return null;
  let best = null, bestScore = -1;
  for (const e of cands) {
    if (e.dead) continue;
    let score = e.isBoss ? 6 : e.isChampion ? 3 : 0;
    forEachNear(e.x, e.y, 70, (o) => { if (!o.dead) score++; });
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best ? { x: best.x + rand(-14, 14), y: best.y + rand(-14, 14) } : null;
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------
/** Called once per frame from the run loop, before weapons fire. */
export function updateFamiliars(dt) {
  const p = S.player;
  if (!p || p.dead) { S.familiars.length = 0; return; }
  syncFlock(p);
  for (const b of S.familiars) {
    const s = resolvedStats(b.weapon);
    if (!s) continue;
    const def = FAMILIARS[b.kind];
    if (!def) continue;
    fly(b, def, dt);
    animate(b, def, dt);
    ACT[b.kind]?.(b, s, b.weapon, dt);
  }
}

/** Send the flock home — the run ended, or the market took the frame. */
export function clearFamiliars() { S.familiars.length = 0; }
