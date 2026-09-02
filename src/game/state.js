// ---------------------------------------------------------------------------
// state.js — the live run: every entity array, the derived player stats and
// the shared damage pipeline. Weapons, enemies and the renderer all talk to
// this module rather than to each other.
// ---------------------------------------------------------------------------

import { clamp, rand, TAU, swapRemove } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { say } from '../core/voice.js';
import { burst, floatText, ring, emit } from './particles.js';
import { PASSIVES, DIFFICULTIES, weaponStats, WEAPONS, xpForLevel } from './config.js';
import { randomFood } from '../art/food.js';

export const S = {
  time: 0,
  running: false,
  paused: false,
  outcome: null,            // null | 'dead' | 'won'
  difficulty: 'normal',
  seed: 1,

  player: null,
  enemies: [],
  shots: [],                // player projectiles
  hostileShots: [],
  zones: [],                // lingering ground effects
  pickups: [],
  orbs: [],                 // orbiting weapon nodes (recomputed each frame)
  sweeps: [],               // short-lived melee arcs

  cam: { x: 0, y: 0, tx: 0, ty: 0 },
  view: { left: 0, top: 0, right: 0, bottom: 0, w: 0, h: 0 },

  kills: 0,
  gold: 0,
  damageDealt: 0,
  shake: 0,
  hitStop: 0,
  flashAlpha: 0,
  flashColor: '#ffffff',

  boss: null,
  champion: null,
  championTimer: 0,
  bossIndex: 0,
  spawnAccum: 0,
  nextEnemyId: 1,

  pendingLevels: 0,
  rerolls: 0,
  banishes: 0,
  banished: [],
  revives: 0,

  toast: null,
  banner: null,
  cutscene: null,
  pendingBoss: null,
  arena: null,               // { bossId, name, engaged } during a boss-arena fight
  musicPhase: null,          // which battle theme is currently playing

  inventory: {},             // flask id -> how many are in the belt
  purchases: [],             // every good bought this run, for the results screen
  marketVisits: 0,
  // While this is running, everything on the ground comes to you and comes
  // fast. Set by the magnet drop; counted down in updatePickups.
  vacuumT: 0,

  // A killed boss leaves a way out rather than teleporting you: the portal
  // stands where it fell and you walk into it when you are ready.
  portal: null,              // { x, y, t, bossName, taken }
  pendingMarket: null,       // { bossName } — set on stepping through, consumed by main
};

export const diff = () => DIFFICULTIES[S.difficulty] || DIFFICULTIES.normal;

/**
 * How far into a run the world should behave as if it is, in minutes.
 * A Boss Arena fight is pinned to the minute its boss belongs to, so the trash
 * around it never outgrows the fight you came to see.
 */
export const runMinutes = () => (S.arena ? S.arena.minute : S.time / 60);

// ---------------------------------------------------------------------------
// Derived player stats
// ---------------------------------------------------------------------------
export function passiveLevel(id) { return S.player?.passives[id] || 0; }

export function passiveValue(id) {
  const def = PASSIVES[id];
  if (!def) return 0;
  return passiveLevel(id) * def.step;
}

/** Damage multiplier applied to every source. */
export function mightMult() {
  return (1 + passiveValue('might')) * (S.player?.mightBase || 1) * (S.player?.metaMight || 1);
}
export function areaMult() { return 1 + passiveValue('area'); }
export function speedMult() { return 1 + passiveValue('velocity'); }
export function sizeMult() { return 1 + passiveValue('caliber'); }
export function cooldownMult() {
  return clamp((1 - passiveValue('cooldown')) * (S.player?.cooldownBase || 1) * (S.player?.metaHaste || 1), 0.25, 2);
}
export function extraCount() { return passiveValue('amount'); }
export function critChance() { return clamp(passiveValue('wrath'), 0, 0.85); }
export function magnetRadius() {
  return (S.player?.magnetBase || 90) * (1 + passiveValue('magnet')) * (S.player?.metaMagnet || 1);
}
export function luck() { return (S.player?.luckBase || 1) * (1 + passiveValue('fortune')) * (S.player?.metaLuck || 1); }
export function maxHp() { return (S.player?.hpBase || 100) + passiveValue('vitality') + (S.player?.metaHp || 0); }
export function armorValue() { return (S.player?.armorBase || 0) + passiveValue('armor') + (S.player?.metaArmor || 0); }
export function moveSpeed() {
  return (S.player?.speedBase || 110) * (1 + passiveValue('swiftness')) * (S.player?.metaSpeed || 1);
}

/** Final stats for one equipped weapon, after passives. */
export function resolvedStats(w) {
  const base = weaponStats(w.id, w.level, w.evolved);
  if (!base) return null;
  const s = { ...base };
  s.damage *= mightMult();
  if (s.cooldown) s.cooldown = Math.max(0.06, s.cooldown * cooldownMult());
  if (s.area) s.area *= areaMult();
  if (s.speed) s.speed *= speedMult();
  if (s.radius) s.radius *= (1 + passiveValue('area') * 0.5);
  if (s.range) s.range *= (1 + passiveValue('area') * 0.4);
  if (s.count) s.count += extraCount();
  s.size = (s.size || 1) * sizeMult();
  return s;
}

export function weaponDisplayName(w) {
  const def = WEAPONS[w.id];
  return w.evolved ? def.evolution.name : def.name;
}

export function weaponIcon(w) {
  const def = WEAPONS[w.id];
  return w.evolved ? def.evolution.icon : def.icon;
}

// ---------------------------------------------------------------------------
// Spatial grid — rebuilt each frame so projectile/enemy tests stay cheap
// ---------------------------------------------------------------------------
const CELL = 72;
let grid = new Map();

export function rebuildGrid() {
  grid.clear();
  for (const e of S.enemies) {
    const k = ((Math.floor(e.x / CELL) & 0xffff) << 16) | (Math.floor(e.y / CELL) & 0xffff);
    let arr = grid.get(k);
    if (!arr) { arr = []; grid.set(k, arr); }
    arr.push(e);
  }
}

/** Calls `fn(enemy)` for every enemy whose cell overlaps the circle. */
export function forEachNear(x, y, radius, fn) {
  const x0 = Math.floor((x - radius) / CELL), x1 = Math.floor((x + radius) / CELL);
  const y0 = Math.floor((y - radius) / CELL), y1 = Math.floor((y + radius) / CELL);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const arr = grid.get(((cx & 0xffff) << 16) | (cy & 0xffff));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) fn(arr[i]);
    }
  }
}

/**
 * Auto-aim target. Bosses and champions read as nearer than they are, so your
 * damage actually reaches them through a crowd — without this, a screen full of
 * trash absorbs every shot and the boss never takes a hit.
 */
export function nearestEnemy(x, y, maxDist = 900, filter = null) {
  let best = null, bestScore = Infinity;
  const maxSq = maxDist * maxDist;
  for (const e of S.enemies) {
    if (e.dead || (filter && !filter(e))) continue;
    const dx = e.x - x, dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d > maxSq) continue;
    const score = e.isBoss ? d * 0.3 : e.isChampion ? d * 0.6 : d;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

/** Enemies sorted by distance — used by chaining and multi-target weapons. */
export function nearestEnemies(x, y, n, maxDist = 900, exclude = null) {
  const out = [];
  for (const e of S.enemies) {
    if (e.dead || (exclude && exclude.has(e))) continue;
    const dx = e.x - x, dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > maxDist * maxDist) continue;
    out.push({ e, d2 });
  }
  out.sort((a, b) => a.d2 - b.d2);
  return out.slice(0, n).map((o) => o.e);
}

// ---------------------------------------------------------------------------
// Spawning helpers
// ---------------------------------------------------------------------------
export function spawnShot(opts) {
  S.shots.push({
    x: 0, y: 0, vx: 0, vy: 0, dmg: 10, life: 2, size: 6, pierce: 1,
    color: '#ffffff', kind: 'bolt', rot: 0, spin: 0, hits: null,
    homing: 0, knockback: 60, crit: false, ...opts,
  });
}

export function spawnZone(opts) {
  S.zones.push({
    x: 0, y: 0, r: 40, life: 2, maxLife: 2, dps: 10, tick: 0, tickRate: 0.35,
    color: '#ff8a2a', kind: 'fire', slow: 0, root: 0, delay: 0, ...opts,
  });
}

export function spawnSweep(opts) {
  S.sweeps.push({
    x: 0, y: 0, angle: 0, arc: 1.4, radius: 90, life: 0.2, maxLife: 0.2,
    dmg: 10, color: '#ffffff', hits: new Set(), knockback: 140, ...opts,
  });
}

export function spawnHostileShot(opts) {
  S.hostileShots.push({
    x: 0, y: 0, vx: 0, vy: 0, dmg: 10, life: 6, size: 7,
    color: '#ff6a86', homing: 0, kind: 'orb', ...opts,
  });
}

export function spawnPickup(kind, x, y, value = 0, variant = null) {
  S.pickups.push({
    kind, x, y, value, variant,
    vx: rand(-40, 40), vy: rand(-40, 40),
    life: 60, t: rand(0, TAU), magnetised: false,
  });
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------
export function damageEnemy(e, amount, opts = {}) {
  if (!e || e.dead) return 0;
  let dmg = amount;
  let crit = opts.crit;
  if (crit === undefined && Math.random() < critChance()) crit = true;
  if (crit) dmg *= 2;
  if (e.shatter && e.frozen > 0) dmg *= e.shatter;

  e.hp -= dmg;
  e.flash = 0.12;
  S.damageDealt += dmg;

  if (opts.knockback && !e.isBoss) {
    const k = opts.knockback * (1 - (e.knockResist || 0));
    const a = opts.angle ?? Math.atan2(e.y - (opts.fromY ?? e.y), e.x - (opts.fromX ?? e.x));
    e.kx += Math.cos(a) * k;
    e.ky += Math.sin(a) * k;
  }
  if (opts.slow) {
    e.slow = Math.max(e.slow, opts.slow);
    e.slowT = Math.max(e.slowT, opts.slowTime || 1.2);
  }
  if (opts.stun) e.stun = Math.max(e.stun, opts.stun);
  if (opts.root) e.root = Math.max(e.root, opts.root);
  if (opts.burn) { e.burn = Math.max(e.burn, opts.burn * mightMult()); e.burnT = Math.max(e.burnT, 2.5); }

  if (S.player.showDamage) {
    floatText(e.x + rand(-6, 6), e.y - e.size * 0.8, Math.round(dmg).toString(),
      crit ? '#ffd75e' : '#ffffff', { crit, size: crit ? 15 : 11 });
  }
  sfx(crit ? 'crit' : 'hit');

  if (opts.leech) healPlayer(dmg * opts.leech);

  if (e.hp <= 0) killEnemy(e, opts);
  return dmg;
}

export function killEnemy(e, opts = {}) {
  if (e.dead) return;
  e.dead = true;
  S.kills++;

  burst(e.x, e.y, e.isBoss ? 46 : e.isChampion ? 26 : 8, e.tint || '#ffffff', {
    speed: e.isBoss ? 260 : 150, life: 0.5, glow: true,
  });
  if (e.isChampion || e.isBoss) {
    ring(e.x, e.y, e.size * 4, e.tint || '#fff', { life: 0.5 });
    S.shake = Math.max(S.shake, e.isBoss ? 16 : 8);
  }
  sfx(e.isBoss ? 'boom' : 'kill');

  if (e.explodes) {
    spawnZone({ x: e.x, y: e.y, r: 70, life: 0.35, maxLife: 0.35, dps: 0, kind: 'blast', color: '#ff8a2a' });
    forEachNear(e.x, e.y, 70, (o) => {
      if (o !== e && !o.dead) damageEnemy(o, e.maxHp * 0.25, { crit: false });
    });
    burst(e.x, e.y, 20, '#ff8a2a', { speed: 220, glow: true });
  }

  dropLoot(e);
}

function dropLoot(e) {
  const l = luck();
  const xp = e.xp;
  const tier = xp >= 20 ? 'gem3' : xp >= 4 ? 'gem2' : 'gem1';
  spawnPickup(tier, e.x, e.y, xp);

  const goldChance = (e.goldChance ?? 0.05) * l;
  if (Math.random() < goldChance) spawnPickup('coin', e.x + rand(-8, 8), e.y + rand(-8, 8), e.goldValue || 1);
  if (Math.random() < 0.012 * l) spawnPickup('heart', e.x, e.y, 25);
  // Something in the horde was carrying lunch.
  if (Math.random() < 0.03 * l) spawnPickup('food', e.x, e.y, 0, randomFood());
  if (Math.random() < 0.004 * l) spawnPickup('magnet', e.x, e.y, 0);
  if (Math.random() < 0.003 * l) spawnPickup('bombpick', e.x, e.y, 0);

  if (e.isChampion) {
    spawnPickup('chest', e.x, e.y, 1);
    spawnPickup('food', e.x + rand(-20, 20), e.y + rand(-20, 20), 0, randomFood());
    for (let i = 0; i < 6; i++) spawnPickup('coin', e.x + rand(-26, 26), e.y + rand(-26, 26), 3);
  }
  if (e.isBoss) {
    spawnPickup('chest', e.x, e.y, 3);
    for (let i = 0; i < 4; i++) spawnPickup('food', e.x + rand(-60, 60), e.y + rand(-60, 60), 0, randomFood());
    for (let i = 0; i < 22; i++) spawnPickup('coin', e.x + rand(-60, 60), e.y + rand(-60, 60), 5);
    for (let i = 0; i < 3; i++) spawnPickup('heart', e.x + rand(-40, 40), e.y + rand(-40, 40), 40);
  }
}

export function healPlayer(amount) {
  const p = S.player;
  const before = p.hp;
  p.hp = Math.min(maxHp(), p.hp + amount);
  return p.hp - before;
}

export function damagePlayer(amount, source) {
  const p = S.player;
  if (p.invuln > 0 || p.dead) return;
  const dmg = Math.max(1, amount * diff().dmg - armorValue());
  p.hp -= dmg;
  p.invuln = 0.55;
  p.hurtFlash = 0.3;
  S.shake = Math.max(S.shake, Math.min(12, 4 + dmg * 0.2));
  S.flashAlpha = 0.35;
  S.flashColor = '#ff2a4a';
  floatText(p.x, p.y - 26, `-${Math.round(dmg)}`, '#ff6a86', { size: 13 });
  burst(p.x, p.y, 8, '#ff4a5e', { speed: 120 });
  sfx('hurt');
  say('hurt');
  if (p.hp > 0 && p.hp / maxHp() < 0.3) say('lowhp');
  if (p.hp <= 0) {
    if (S.revives > 0) {
      S.revives--;
      p.hp = maxHp() * 0.6;
      p.invuln = 2.5;
      S.flashAlpha = 0.7;
      S.flashColor = '#ffd75e';
      ring(p.x, p.y, 240, '#ffd75e', { life: 0.8 });
      showBanner('SECOND WIND', '#ffd75e');
      sfx('levelup');
    } else {
      p.hp = 0;
      p.dead = true;
      say('die', { force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------
export function gainXp(amount) {
  const p = S.player;
  p.xp += amount * diff().xp * (p.metaGrowth || 1);
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = xpForLevel(p.level);
    S.pendingLevels++;
    say('levelup');
  }
}

export function gainGold(n) {
  const g = Math.max(1, Math.round(n * diff().gold * (S.player.metaGreed || 1) * (1 + passiveValue('fortune'))));
  S.gold += g;
  return g;
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------
export function showToast(text, color = '#ffd75e', time = 2.2) {
  S.toast = { text, color, life: time, maxLife: time };
}

export function showBanner(text, color = '#ffffff', sub = '', time = 2.6) {
  S.banner = { text, sub, color, life: time, maxLife: time };
}

export function screenFlash(color, alpha = 0.4) {
  S.flashColor = color;
  S.flashAlpha = Math.max(S.flashAlpha, alpha);
}

export function addShake(v) { S.shake = Math.max(S.shake, v); }

export { swapRemove, emit };
