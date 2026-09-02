// ---------------------------------------------------------------------------
// enemies.js — spawning, movement, status effects and every boss script.
// ---------------------------------------------------------------------------

import { TAU, rand, randInt, pick, clamp, angleTo, weightedPick, swapRemove } from '../core/util.js';
import { sfx, playMusic, setIntensity } from '../core/audio.js';
import { burst, ring, emit } from './particles.js';
import { MOB_TINT } from '../art/bestiary.js';
import {
  ENEMY_TYPES, ELITE_MODS, CHAMPIONS, BOSSES, hpScale, dmgScale, spawnRate,
  maxAlive, CHAMPION_EVERY,
} from './config.js';
import {
  S, diff, damagePlayer, spawnHostileShot, showBanner, showToast, addShake,
  forEachNear, screenFlash, killEnemy, spawnZone, runMinutes,
} from './state.js';
import { q } from '../core/quality.js';
import { startCutscene } from './cutscene.js';
import { say } from '../core/voice.js';

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------
function spawnRadius() {
  return Math.max(S.view.w, S.view.h) * 0.62 + 90;
}

function spawnPoint() {
  const a = rand(0, TAU);
  const r = spawnRadius() * rand(1.0, 1.15);
  return { x: S.player.x + Math.cos(a) * r, y: S.player.y + Math.sin(a) * r };
}

function availableTypes(minutes) {
  return ENEMY_TYPES.filter((t) => minutes >= t.from && minutes <= t.to);
}

export function makeEnemy(type, x, y, opts = {}) {
  const minutes = runMinutes();
  const hp = type.hp * hpScale(minutes) * diff().hp * (opts.hpMult || 1);
  const e = {
    id: S.nextEnemyId++,
    type: type.id,
    sprite: type.sprite,
    x, y, vx: 0, vy: 0, kx: 0, ky: 0,
    hp, maxHp: hp,
    speed: type.speed * (opts.speedMult || 1),
    damage: type.dmg * dmgScale(minutes) * (opts.dmgMult || 1),
    xp: type.xp * (opts.xpMult || 1),
    size: type.size * (opts.sizeMult || 1),
    scale: type.scale * (opts.sizeMult || 1),
    tint: MOB_TINT[type.sprite] || '#ffffff',
    flash: 0, slow: 0, slowT: 0, stun: 0, root: 0, burn: 0, burnT: 0,
    shred: 0, shredT: 0, reapCd: 0,
    frozen: 0, orbCd: 0, contactCd: 0, wobble: rand(0, TAU),
    knockResist: type.knockResist || 0,
    elite: null, dead: false,
    goldChance: 0.07, goldValue: 1,
    ranged: type.ranged ? { ...type.ranged, cd0: type.ranged.cd, cd: rand(0.5, type.ranged.cd) } : null,
    erratic: type.erratic || 0,
    lunge: type.lunge || 0,
    drift: type.drift || 0,
    web: type.web || 0,
    phase: type.phase || 0,
  };
  return e;
}

function applyElite(e, mod) {
  e.elite = mod;
  e.hp *= mod.hp; e.maxHp = e.hp;
  e.damage *= mod.dmg;
  e.speed *= mod.speed;
  e.size *= 1.25; e.scale *= 1.25;
  e.xp *= 4;
  e.goldChance = 1;
  e.goldValue = mod.gold;
  e.knockResist = Math.max(e.knockResist, 0.5);
  if (mod.explodes) e.explodes = 1;
  if (mod.leech) e.leech = 1;
}

export function updateSpawning(dt) {
  const minutes = runMinutes();
  // The arena is about the boss: a thin, fixed trickle of trash, nothing else
  // scheduled, and a hard cap so the crowd can never bury the fight.
  const trash = S.arena ? 0.22 : 1;
  const cap = S.arena ? Math.min(30, maxAlive(minutes) * q.enemyScale) : maxAlive(minutes) * q.enemyScale;
  if (S.enemies.length < cap) {
    S.spawnAccum += spawnRate(minutes) * diff().spawn * trash * dt;
    const types = availableTypes(minutes);
    while (S.spawnAccum >= 1 && types.length) {
      S.spawnAccum -= 1;
      const t = weightedPick(types);
      const p = spawnPoint();
      const e = makeEnemy(t, p.x, p.y);
      // Elites become steadily more common as the run wears on.
      if (Math.random() < clamp(0.008 + minutes * 0.005, 0, 0.07)) applyElite(e, pick(ELITE_MODS));
      S.enemies.push(e);
    }
  }

  if (S.arena) return;

  // Champions on a fixed cadence, bosses on the clock.
  S.championTimer -= dt;
  if (S.championTimer <= 0 && !S.boss) {
    S.championTimer = CHAMPION_EVERY;
    spawnChampion();
  }

  const nextBoss = BOSSES[S.bossIndex];
  if (nextBoss && S.time >= nextBoss.at * 60 && !S.boss && !S.pendingBoss && !S.cutscene) {
    // The boss does not exist yet — the cutscene runs first and spawns it.
    S.bossIndex++;
    S.pendingBoss = nextBoss;
    startCutscene(nextBoss);
  }
}

/** Called when a boss cutscene finishes: the boss lands in front of the player. */
export function spawnPendingBoss() {
  const def = S.pendingBoss;
  S.pendingBoss = null;
  if (!def) return;
  const p = S.player;
  spawnBoss(def, { x: p.x, y: p.y - 250 });

  // It arrives hard: everything nearby is thrown clear.
  for (const e of S.enemies) {
    if (e.isBoss) continue;
    const a = angleTo(p.x, p.y - 250, e.x, e.y);
    e.kx += Math.cos(a) * 900;
    e.ky += Math.sin(a) * 900;
  }
  burst(p.x, p.y - 250, 40, def.color, { speed: 420, life: 0.8, glow: true });
  ring(p.x, p.y - 250, 420, def.color, { life: 0.7 });
  addShake(18);
}

export function spawnChampion() {
  const minutes = runMinutes();
  const def = CHAMPIONS[randInt(0, CHAMPIONS.length - 1)];
  const p = spawnPoint();
  const hp = def.hp * hpScale(minutes) * 0.55 * diff().hp;
  const e = {
    ...makeEnemy({ ...def, from: 0, to: 99 }, p.x, p.y),
    sprite: def.sprite, name: def.name, isChampion: true,
    hp, maxHp: hp, speed: def.speed, damage: def.dmg * dmgScale(minutes),
    xp: def.xp, size: def.size, scale: def.scale, ai: def.ai,
    tint: MOB_TINT[def.sprite] || '#ffffff', knockResist: 0.85,
    phaseT: 0, actionCd: 2, goldChance: 1, goldValue: 8,
  };
  S.enemies.push(e);
  S.champion = e;
  showToast(`${def.name} approaches`, e.tint);
  ring(e.x, e.y, 90, e.tint, { life: 0.6 });
  sfx('spawn');
  say('enemy');
}

export function spawnBoss(def, at = null) {
  const minutes = runMinutes();
  const p = at || spawnPoint();
  const hp = def.hp * diff().hp * (1 + minutes * 0.02);
  const e = {
    ...makeEnemy({ ...ENEMY_TYPES[0], ...def, from: 0, to: 99 }, p.x, p.y),
    sprite: def.sprite, name: def.name, isBoss: true, ai: def.ai,
    bossId: def.id,          // `id` is the entity id; this is which boss it is
    hp, maxHp: hp, speed: def.speed, damage: def.dmg * dmgScale(minutes),
    xp: def.xp, size: def.size, scale: def.scale, tint: def.color,
    knockResist: 1, phaseT: 0, actionCd: 2.2, pattern: 0, enraged: false,
    goldChance: 1, goldValue: 20,
    breath: 0, airborne: false, rage: 0, renderScale: def.renderScale || 1,
  };
  S.enemies.push(e);
  S.boss = e;
  screenFlash(def.color, 0.5);
  addShake(14);
  playMusic(`boss:${def.id}`);
  sfx(`boss-${def.id}-arrive`);
}

// ---------------------------------------------------------------------------
// Movement + status
// ---------------------------------------------------------------------------
export function updateEnemies(dt) {
  const p = S.player;
  const cullR = spawnRadius() * 2.6;

  for (let i = S.enemies.length - 1; i >= 0; i--) {
    const e = S.enemies[i];
    if (e.dead) {
      if (e === S.boss) onBossDefeated(e);
      if (e === S.champion) S.champion = null;
      swapRemove(S.enemies, i);
      continue;
    }

    // --- status effects ---
    if (e.flash > 0) e.flash -= dt;
    if (e.orbCd > 0) e.orbCd -= dt;
    if (e.reapCd > 0) e.reapCd -= dt;
    if (e.contactCd > 0) e.contactCd -= dt;
    if (e.shredT > 0) { e.shredT -= dt; if (e.shredT <= 0) e.shred = 0; }
    if (e.frozen > 0) e.frozen -= dt;
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
    if (e.stun > 0) e.stun -= dt;
    if (e.root > 0) e.root -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt;
      e.hp -= e.burn * dt;
      if (Math.random() < dt * 6) {
        emit('spark', e.x + rand(-6, 6), e.y + rand(-6, 6), { vy: -30, life: 0.3, size: 2, color: '#ff8a2a', glow: true });
      }
      if (e.hp <= 0) { killEnemy(e); continue; }
    }

    // --- far-away cleanup keeps the crowd around the player ---
    const dx = p.x - e.x, dy = p.y - e.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > cullR * cullR && !e.isBoss && !e.isChampion) {
      swapRemove(S.enemies, i);
      continue;
    }

    if (e.isBoss || e.isChampion) {
      // The ornament reacts to the fight: halos brighten and cracks run molten
      // in the last moments before an attack, so the wind-up is readable, and
      // a wounded boss burns hotter.
      if (e.isBoss) {
        const prevTell = e.castTell || 0;
        e.castTell = e.actionCd < 0.7 && e.actionCd > 0
          ? clamp(1 - e.actionCd / 0.7, 0, 1)
          : Math.max(0, prevTell - dt * 2.5);
        // Rising edge only: the tell announces itself once, not every frame.
        if (prevTell < 0.04 && e.castTell >= 0.04) sfx(`boss-${e.bossId}-cast`);
        if (e.ai !== 'parduin') e.rage = clamp(1 - (e.hp / e.maxHp) / 0.45, 0, 1);
      }
      runScript(e, dt);
    }

    // --- steering ---
    const dist = Math.sqrt(distSq) || 1;
    let ax = dx / dist, ay = dy / dist;

    if (e.erratic) {
      e.wobble += dt * 4;
      ax += Math.cos(e.wobble) * 0.5;
      ay += Math.sin(e.wobble * 1.3) * 0.5;
    }
    if (e.drift) {
      e.wobble += dt * 1.6;
      const s = Math.sin(e.wobble);
      ax += -ay * s * 0.7; ay += ax * s * 0.7;
    }
    if (e.lunge) {
      e.wobble += dt;
      if (e.wobble > 2.2) { e.wobble = 0; e.lungeT = 0.45; }
      if (e.lungeT > 0) e.lungeT -= dt;
    }
    if (e.phase && dist < 260) {
      // Shades fade in and out, becoming briefly untargetable-looking.
      e.alpha = 0.45 + 0.55 * Math.abs(Math.sin(S.time * 2 + e.id));
    } else e.alpha = 1;

    const stunned = e.stun > 0 || e.root > 0;
    const slowFactor = 1 - clamp(e.slow, 0, 0.95);
    let spd = stunned ? 0 : e.speed * slowFactor * (e.lungeT > 0 ? 2.6 : 1) * (e.moveScale ?? 1);

    e.vx = ax * spd;
    e.vy = ay * spd;

    // --- separation so the horde spreads instead of stacking ---
    if (!e.isBoss) {
      let sx = 0, sy = 0, n = 0;
      forEachNear(e.x, e.y, e.size * 1.6, (o) => {
        if (o === e || o.dead) return;
        const ox = e.x - o.x, oy = e.y - o.y;
        const d2 = ox * ox + oy * oy;
        const minD = (e.size + o.size) * 0.62;
        if (d2 > 0.01 && d2 < minD * minD) {
          const d = Math.sqrt(d2);
          sx += (ox / d) * (1 - d / minD);
          sy += (oy / d) * (1 - d / minD);
          n++;
        }
      });
      if (n) { e.vx += sx * 90; e.vy += sy * 90; }
    }

    e.x += (e.vx + e.kx) * dt;
    e.y += (e.vy + e.ky) * dt;
    const kd = Math.pow(0.0016, dt);
    e.kx *= kd; e.ky *= kd;

    // --- ranged attacks ---
    if (e.ranged && dist < 420 && !stunned) {
      e.ranged.cd -= dt;
      if (e.ranged.cd <= 0) {
        e.ranged.cd = e.ranged.cd0 * rand(0.85, 1.2);
        const a = angleTo(e.x, e.y, p.x, p.y);
        spawnHostileShot({
          x: e.x, y: e.y, vx: Math.cos(a) * e.ranged.speed, vy: Math.sin(a) * e.ranged.speed,
          dmg: e.ranged.dmg * dmgScale(runMinutes()), color: '#ff8a4a', size: 7, life: 4,
        });
      }
    }

    // --- contact damage ---
    const touch = e.size * 0.55 + 12;
    if (distSq < touch * touch && e.contactCd <= 0) {
      e.contactCd = 0.5;
      damagePlayer(e.damage);
      if (e.leech) e.hp = Math.min(e.maxHp, e.hp + e.damage * 2);
      if (e.web) { p.webbed = 1.1; }
    }
  }

  setIntensity(clamp(S.enemies.length / 220, 0, 1));
}

function onBossDefeated(e) {
  S.boss = null;
  screenFlash(e.tint, 0.6);
  addShake(20);
  showBanner('VANQUISHED', e.tint, e.name);
  for (let i = 0; i < 5; i++) {
    setTimeout(() => { if (S.running) { burst(e.x + rand(-60, 60), e.y + rand(-60, 60), 24, e.tint, { speed: 260, glow: true }); } }, i * 90);
  }
  // Clear the arena a little as a reward.
  for (const o of S.enemies) if (!o.isBoss && !o.isChampion && Math.random() < 0.6) killEnemy(o);
  sfx(`boss-${e.bossId}-die`);

  // A killed boss tears a way through to the market and leaves it standing
  // where it fell. You go when you choose to, which means you can finish
  // collecting the field first — the run is paused the moment you step in, and
  // a boss drops a lot of gems. Arena fights are practice and pay nothing, so
  // they never open one; neither does the last boss of the run, because there
  // is no run left to spend on.
  if (!S.arena && S.bossIndex < BOSSES.length) {
    S.portal = { x: e.x, y: e.y, t: 0, bossName: e.name, taken: false };
    showToast('A way through has opened — step into it when you are ready', '#9ad4ff', 4.2);
  }
}

// ---------------------------------------------------------------------------
// Champion + boss scripts
// ---------------------------------------------------------------------------
function radialShots(e, count, speed, opts = {}) {
  const off = opts.offset ?? rand(0, TAU);
  for (let i = 0; i < count; i++) {
    const a = off + (i / count) * TAU;
    if (opts.gap && Math.abs(((a - opts.gapDir + Math.PI) % TAU) - Math.PI) < opts.gap) continue;
    spawnHostileShot({
      x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      dmg: e.damage * (opts.dmgMult ?? 0.7), color: opts.color || e.tint,
      size: opts.size || 8, life: opts.life || 5, homing: opts.homing || 0,
    });
  }
}

function fanShots(e, count, speed, spread, opts = {}) {
  const base = angleTo(e.x, e.y, S.player.x, S.player.y);
  for (let i = 0; i < count; i++) {
    const a = base + (count === 1 ? 0 : (i / (count - 1) - 0.5) * spread);
    spawnHostileShot({
      x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      dmg: e.damage * (opts.dmgMult ?? 0.7), color: opts.color || e.tint,
      size: opts.size || 8, life: 5, homing: opts.homing || 0,
    });
  }
}

function summon(e, typeId, n, opts = {}) {
  const type = ENEMY_TYPES.find((t) => t.id === typeId) || ENEMY_TYPES[0];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(-0.3, 0.3);
    const d = e.size + rand(30, 70);
    const m = makeEnemy(type, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, opts);
    S.enemies.push(m);
    burst(m.x, m.y, 6, e.tint, { speed: 90, glow: true });
  }
  sfx('spawn');
}

const SCRIPTS = {
  // --- champions ---
  slam(e, dt) {
    e.actionCd -= dt;
    e.moveScale = e.windup > 0 ? 0.15 : 1;
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) {
        spawnZone({ x: e.x, y: e.y, r: 150, life: 0.35, maxLife: 0.35, kind: 'blast', color: e.tint, dps: 0 });
        if (Math.hypot(S.player.x - e.x, S.player.y - e.y) < 150) damagePlayer(e.damage * 1.3);
        radialShots(e, 10, 150, { size: 9, dmgMult: 0.5 });
        addShake(10);
        burst(e.x, e.y, 26, e.tint, { speed: 240 });
        sfx('boom');
      }
    } else if (e.actionCd <= 0) {
      e.actionCd = 4.2;
      e.windup = 0.8;
      ring(e.x, e.y, 150, e.tint, { life: 0.8 });
    }
  },
  split(e, dt) {
    e.actionCd -= dt;
    if (e.actionCd <= 0) {
      e.actionCd = 5.0;
      summon(e, 'slime', 4, { hpMult: 0.5, xpMult: 0.5 });
      radialShots(e, 8, 130, { size: 8, dmgMult: 0.5 });
    }
  },
  caster(e, dt) {
    e.actionCd -= dt;
    e.moveScale = 0.7;
    if (e.actionCd <= 0) {
      e.actionCd = 3.4;
      if (Math.random() < 0.5) fanShots(e, 5, 190, 0.9, { size: 9 });
      else summon(e, 'skeleton', 3, { hpMult: 0.7 });
      sfx('zap');
    }
  },
  weaver(e, dt) {
    e.actionCd -= dt;
    if (e.actionCd <= 0) {
      e.actionCd = 3.8;
      for (let i = 0; i < 3; i++) {
        const a = rand(0, TAU), d = rand(60, 180);
        spawnZone({
          x: S.player.x + Math.cos(a) * d, y: S.player.y + Math.sin(a) * d,
          r: 62, life: 5, maxLife: 5, kind: 'web', color: '#d8d3f0', dps: 0, slow: 0.55,
        });
      }
      summon(e, 'spider', 2, { hpMult: 0.6 });
    }
  },
  root(e, dt) {
    e.actionCd -= dt;
    e.moveScale = 0.75;
    if (e.actionCd <= 0) {
      e.actionCd = 4.6;
      radialShots(e, 14, 120, { size: 10, color: '#7ec95a', dmgMult: 0.55 });
      for (let i = 0; i < 4; i++) {
        const a = rand(0, TAU), d = rand(40, 150);
        spawnZone({
          x: S.player.x + Math.cos(a) * d, y: S.player.y + Math.sin(a) * d,
          r: 52, life: 4, maxLife: 4, kind: 'thorn', color: '#4f9a3c', dps: 0, slow: 0.35,
        });
      }
    }
  },
  blink(e, dt) {
    e.actionCd -= dt;
    if (e.actionCd <= 0) {
      e.actionCd = 3.0;
      burst(e.x, e.y, 16, e.tint, { speed: 180, glow: true });
      const a = rand(0, TAU);
      e.x = S.player.x + Math.cos(a) * 150;
      e.y = S.player.y + Math.sin(a) * 150;
      burst(e.x, e.y, 16, e.tint, { speed: 180, glow: true });
      fanShots(e, 7, 200, 1.4, { size: 8 });
      sfx('dash');
    }
  },

  // --- bosses ---
  magus(e, dt) {
    e.actionCd -= dt;
    e.moveScale = 0.6;
    const hpFrac = e.hp / e.maxHp;
    if (e.actionCd <= 0) {
      e.pattern = (e.pattern + 1) % 4;
      e.actionCd = hpFrac < 0.4 ? 1.7 : 2.4;
      switch (e.pattern) {
        case 0: radialShots(e, hpFrac < 0.5 ? 22 : 16, 170, { size: 9 }); break;
        case 1: fanShots(e, 7, 230, 1.1, { size: 10 }); break;
        case 2: {
          burst(e.x, e.y, 20, e.tint, { speed: 200, glow: true });
          const a = rand(0, TAU);
          e.x = S.player.x + Math.cos(a) * 210;
          e.y = S.player.y + Math.sin(a) * 210;
          burst(e.x, e.y, 20, e.tint, { speed: 200, glow: true });
          radialShots(e, 12, 150, { size: 8 });
          break;
        }
        case 3: summon(e, 'shade', 4, { hpMult: 0.5 }); break;
      }
      sfx('boss-magus-attack');
    }
    // A slow spiral that always fills the arena.
    e.spiral = (e.spiral || 0) + dt;
    if (e.spiral > 0.28) {
      e.spiral = 0;
      const a = (e.spiralA = (e.spiralA || 0) + 0.55);
      for (const off of [0, Math.PI]) {
        spawnHostileShot({
          x: e.x, y: e.y, vx: Math.cos(a + off) * 140, vy: Math.sin(a + off) * 140,
          dmg: e.damage * 0.55, color: '#d0b6ff', size: 7, life: 5,
        });
      }
    }
  },

  demon(e, dt) {
    e.actionCd -= dt;
    const hpFrac = e.hp / e.maxHp;
    e.moveScale = e.charging > 0 ? 3.2 : 1;

    if (e.charging > 0) {
      e.charging -= dt;
      if (Math.random() < dt * 30) {
        spawnZone({ x: e.x, y: e.y, r: 40, life: 2.4, maxLife: 2.4, kind: 'fire', color: '#ff8a2a', dps: e.damage * 0.28, tickRate: 0.4 });
      }
      if (e.charging <= 0) { addShake(8); radialShots(e, 14, 190, { color: '#ffb648' }); }
      return;
    }

    if (e.actionCd <= 0) {
      e.pattern = (e.pattern + 1) % 3;
      e.actionCd = hpFrac < 0.35 ? 2.0 : 2.9;
      switch (e.pattern) {
        case 0:
          e.charging = 1.4;
          showToast('The Tyrant charges!', '#ff8a2a', 1.2);
          break;
        case 1: {
          // Meteors rain around the player.
          for (let i = 0; i < 8; i++) {
            const a = rand(0, TAU), d = rand(40, 240);
            const mx = S.player.x + Math.cos(a) * d, my = S.player.y + Math.sin(a) * d;
            spawnZone({ x: mx, y: my, r: 56, life: 1.0, maxLife: 1.0, kind: 'telegraph', color: '#ff6a3c', dps: 0, payload: e.damage * 0.9 });
          }
          break;
        }
        case 2: fanShots(e, 9, 210, 1.6, { color: '#ffb648', size: 9 }); break;
      }
      sfx('boss-demon-attack');
    }
  },

  frost(e, dt) {
    e.actionCd -= dt;
    const hpFrac = e.hp / e.maxHp;
    e.moveScale = 0.85;
    if (e.actionCd <= 0) {
      e.pattern = (e.pattern + 1) % 4;
      e.actionCd = hpFrac < 0.4 ? 1.9 : 2.6;
      switch (e.pattern) {
        case 0: {
          const gapDir = angleTo(e.x, e.y, S.player.x, S.player.y) + rand(-0.6, 0.6);
          radialShots(e, 26, 165, { gap: 0.45, gapDir, color: '#c9f2ff', size: 9 });
          break;
        }
        case 1:
          for (let i = 0; i < 5; i++) {
            const a = rand(0, TAU), d = rand(60, 220);
            spawnZone({
              x: S.player.x + Math.cos(a) * d, y: S.player.y + Math.sin(a) * d,
              r: 70, life: 5, maxLife: 5, kind: 'ice', color: '#8fd8ff', dps: 0, slow: 0.6,
            });
          }
          break;
        case 2: fanShots(e, 11, 200, 2.0, { color: '#e0f7ff' }); break;
        case 3: summon(e, 'wisp', 5, { hpMult: 0.6, speedMult: 1.2 }); break;
      }
      sfx('boss-frosttitan-attack');
    }
    // A permanent chilling aura near the colossus.
    if (Math.hypot(S.player.x - e.x, S.player.y - e.y) < 190) S.player.chilled = 0.5;
  },

  void(e, dt) {
    e.actionCd -= dt;
    const hpFrac = e.hp / e.maxHp;
    if (!e.enraged && hpFrac < 0.45) {
      e.enraged = true;
      showBanner('THE LAST HOUR', '#c05bff', 'The Sovereign sheds its form');
      screenFlash('#c05bff', 0.6);
      addShake(18);
      e.speed *= 1.3;
    }
    e.moveScale = 0.9;
    if (e.actionCd <= 0) {
      e.pattern = (e.pattern + 1) % 5;
      e.actionCd = e.enraged ? 1.6 : 2.3;
      switch (e.pattern) {
        case 0: radialShots(e, e.enraged ? 30 : 20, 175, { size: 9 }); break;
        case 1: fanShots(e, 9, 240, 1.2, { homing: 1.2, size: 9, color: '#ffd75e' }); break;
        case 2: {
          const gapDir = angleTo(e.x, e.y, S.player.x, S.player.y);
          radialShots(e, 30, 160, { gap: 0.5, gapDir, color: '#c05bff' });
          break;
        }
        case 3: summon(e, 'shade', e.enraged ? 8 : 5, { hpMult: 0.6 }); break;
        case 4: {
          burst(e.x, e.y, 26, e.tint, { speed: 240, glow: true });
          const a = rand(0, TAU);
          e.x = S.player.x + Math.cos(a) * 240;
          e.y = S.player.y + Math.sin(a) * 240;
          burst(e.x, e.y, 26, e.tint, { speed: 240, glow: true });
          for (let k = 0; k < 3; k++) {
            const gapDir = rand(0, TAU);
            radialShots(e, 18, 130 + k * 40, { gap: 0.4, gapDir, color: '#9ad4ff' });
          }
          break;
        }
      }
      sfx('boss-sovereign-attack');
    }
    e.spiral = (e.spiral || 0) + dt;
    if (e.spiral > (e.enraged ? 0.16 : 0.26)) {
      e.spiral = 0;
      const a = (e.spiralA = (e.spiralA || 0) - 0.44);
      for (let k = 0; k < 3; k++) {
        const off = (k / 3) * TAU;
        spawnHostileShot({
          x: e.x, y: e.y, vx: Math.cos(a + off) * 150, vy: Math.sin(a + off) * 150,
          dmg: e.damage * 0.5, color: '#c05bff', size: 8, life: 6,
        });
      }
    }
  },

  // --- Parduin, the Drake God -------------------------------------------
  // Three phases, each announced by what he does with his wings: he fights on
  // the ground, then takes the air, then stops pretending he needs either.
  parduin(e, dt) {
    const hpFrac = e.hp / e.maxHp;
    const phase = hpFrac > 0.66 ? 1 : hpFrac > 0.33 ? 2 : 3;
    if (e.dragonPhase !== phase) {
      e.dragonPhase = phase;
      e.actionCd = 1.2;
      if (phase === 2) {
        showBanner('HE TAKES THE SKY', '#ff9a3c', 'Parduin, the Drake God');
        screenFlash('#ff9a3c', 0.45);
        addShake(14);
      } else if (phase === 3) {
        showBanner('RUIN ON WINGS', '#ff4a1e', 'Nothing below survives the third');
        screenFlash('#ff4a1e', 0.55);
        addShake(20);
        e.speed *= 1.25;
      }
    }
    e.rage = phase === 3 ? 1 : phase === 2 ? 0.45 : 0.15;

    // --- breath windup: the throat lights before the cone lands ---
    if (e.windup > 0) {
      e.windup -= dt;
      e.breath = 1 - e.windup / (e.windupMax || 1);
      e.moveScale = 0.12;
      if (e.windup <= 0) {
        breathCone(e, e.breathAngle, phase);
        e.breath = 0;
      }
      return;
    }
    e.breath = Math.max(0, e.breath - dt * 2);

    // --- flight: he lifts off, crosses the arena, and lands on the player ---
    if (e.airborne) {
      e.flightT -= dt;
      e.moveScale = 2.4;
      // Fire falls from him as he passes overhead.
      if ((e.dropCd = (e.dropCd || 0) - dt) <= 0) {
        e.dropCd = phase === 3 ? 0.26 : 0.42;
        spawnZone({
          x: e.x + rand(-40, 40), y: e.y + rand(-40, 40),
          r: 58, life: 0.9, maxLife: 0.9, kind: 'telegraph',
          color: '#ff8a2a', dps: 0, payload: e.damage * 0.75,
        });
      }
      if (e.flightT <= 0) {
        e.airborne = false;
        e.moveScale = 1;
        // Landing shockwave.
        spawnZone({ x: e.x, y: e.y, r: 190, life: 0.35, maxLife: 0.35, kind: 'blast', color: '#ff8a2a', dps: 0 });
        if (Math.hypot(S.player.x - e.x, S.player.y - e.y) < 190) damagePlayer(e.damage * 1.1);
        radialShots(e, phase === 3 ? 22 : 14, 200, { color: '#ffb648', size: 10 });
        burst(e.x, e.y, 34, '#ffb648', { speed: 320, glow: true });
        addShake(16);
        sfx('boss-parduin-land');
        e.actionCd = 1.4;
      }
      return;
    }

    e.actionCd -= dt;
    e.moveScale = 1;
    if (e.actionCd > 0) return;

    const patterns = phase === 1
      ? ['breath', 'fan', 'charge']
      : phase === 2
        ? ['breath', 'fly', 'fan', 'meteors']
        : ['breath', 'fly', 'gust', 'spiral', 'brood', 'meteors'];
    e.pattern = (e.pattern + 1) % patterns.length;
    const move = patterns[e.pattern];
    e.actionCd = phase === 3 ? 1.9 : phase === 2 ? 2.4 : 2.9;

    switch (move) {
      case 'breath':
        e.breathAngle = angleTo(e.x, e.y, S.player.x, S.player.y);
        e.windup = e.windupMax = phase === 3 ? 0.75 : 1.0;
        e.breath = 0.05;
        showToast('Parduin draws breath', '#ff8a2a', 1.0);
        break;

      case 'fan':
        fanShots(e, phase === 3 ? 13 : 9, 230, 1.5, { color: '#ffb648', size: 10 });
        sfx('boss-parduin-attack');
        break;

      case 'charge': {
        // A short, brutal lunge along the ground.
        const a = angleTo(e.x, e.y, S.player.x, S.player.y);
        e.kx += Math.cos(a) * 760;
        e.ky += Math.sin(a) * 760;
        for (let i = 0; i < 5; i++) {
          spawnZone({
            x: e.x + Math.cos(a) * i * 60, y: e.y + Math.sin(a) * i * 60,
            r: 46, life: 2.2, maxLife: 2.2, kind: 'fire',
            color: '#ff8a2a', dps: e.damage * 0.22, tickRate: 0.4,
          });
        }
        sfx('dash');
        break;
      }

      case 'fly':
        e.airborne = true;
        e.flightT = phase === 3 ? 4.2 : 3.2;
        burst(e.x, e.y, 26, '#ffb648', { speed: 260, glow: true });
        addShake(8);
        sfx('dash');
        break;

      case 'gust': {
        // A wingbeat that physically throws the player back.
        const a = angleTo(e.x, e.y, S.player.x, S.player.y);
        const p = S.player;
        p.kx += Math.cos(a) * 900;
        p.ky += Math.sin(a) * 900;
        damagePlayer(e.damage * 0.55);
        ring(e.x, e.y, 460, '#ffd9a0', { life: 0.5 });
        sfx('boss-parduin-wing');
        for (const o of S.enemies) {
          if (o === e) continue;
          o.kx += Math.cos(angleTo(e.x, e.y, o.x, o.y)) * 620;
          o.ky += Math.sin(angleTo(e.x, e.y, o.x, o.y)) * 620;
        }
        addShake(12);
        sfx('boom');
        break;
      }

      case 'spiral': {
        e.spiralA = (e.spiralA || 0) + 0.5;
        for (let arm = 0; arm < 4; arm++) {
          const a = e.spiralA + (arm / 4) * TAU;
          spawnHostileShot({
            x: e.x, y: e.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170,
            dmg: e.damage * 0.5, color: '#ff8a2a', size: 9, life: 6,
          });
        }
        e.actionCd = 0.22;      // the spiral fires in a fast burst
        break;
      }

      case 'brood':
        summon(e, 'imp', 5, { hpMult: 0.7, speedMult: 1.2 });
        showToast('Drakelings!', '#ff8a2a', 1.2);
        break;

      case 'meteors':
        for (let i = 0; i < (phase === 3 ? 10 : 6); i++) {
          const a = rand(0, TAU), d = rand(50, 280);
          spawnZone({
            x: S.player.x + Math.cos(a) * d, y: S.player.y + Math.sin(a) * d,
            r: 62, life: 1.1, maxLife: 1.1, kind: 'telegraph',
            color: '#ff6a3c', dps: 0, payload: e.damage * 0.85,
          });
        }
        break;
    }
  },
};

/** Parduin's signature: a cone of fire that leaves the ground burning. */
function breathCone(e, angle, phase) {
  const range = phase === 3 ? 620 : 480;
  const spread = phase === 3 ? 1.15 : 0.85;
  spawnZone({
    x: e.x, y: e.y, kind: 'cone', angle, spread, range,
    life: 0.85, maxLife: 0.85, r: range, dps: 0,
    color: '#ff8a2a', payload: e.damage * 1.35, hit: false,
  });
  // A wall of flame rolling out along the cone's spine.
  for (let i = 0; i < 7; i++) {
    const d = (i + 1) * (range / 8);
    for (const off of [-spread * 0.32, 0, spread * 0.32]) {
      spawnZone({
        x: e.x + Math.cos(angle + off) * d,
        y: e.y + Math.sin(angle + off) * d,
        r: 54, life: 2.6, maxLife: 2.6, kind: 'fire',
        color: '#ff8a2a', dps: e.damage * 0.2, tickRate: 0.4,
      });
    }
  }
  addShake(14);
  screenFlash('#ff8a2a', 0.35);
  sfx('boss-parduin-breath');
}

function runScript(e, dt) {
  const fn = SCRIPTS[e.ai];
  if (fn) fn(e, dt);
}

// ---------------------------------------------------------------------------
// Hostile projectiles + hazard zones that hurt the player
// ---------------------------------------------------------------------------
export function updateHostileShots(dt) {
  const p = S.player;
  for (let i = S.hostileShots.length - 1; i >= 0; i--) {
    const s = S.hostileShots[i];
    s.life -= dt;
    if (s.homing) {
      const want = angleTo(s.x, s.y, p.x, p.y);
      const cur = Math.atan2(s.vy, s.vx);
      let d = want - cur;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const na = cur + clamp(d, -s.homing * dt, s.homing * dt);
      const sp = Math.hypot(s.vx, s.vy);
      s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;

    if (s.life <= 0 ||
        s.x < S.view.left - 300 || s.x > S.view.right + 300 ||
        s.y < S.view.top - 300 || s.y > S.view.bottom + 300) {
      swapRemove(S.hostileShots, i);
      continue;
    }
    const r = s.size + 10;
    if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 < r * r) {
      damagePlayer(s.dmg);
      burst(s.x, s.y, 8, s.color, { speed: 130 });
      swapRemove(S.hostileShots, i);
    }
  }
}

/** Hazard zones (boss telegraphs, ice, webs) tick against the player. */
export function updateHazards(dt) {
  const p = S.player;
  for (let i = S.zones.length - 1; i >= 0; i--) {
    const z = S.zones[i];
    if (z.kind === 'cone') {
      if (!z.hit) {
        const d = Math.hypot(p.x - z.x, p.y - z.y);
        if (d <= z.range) {
          const a = angleTo(z.x, z.y, p.x, p.y);
          let da = a - z.angle;
          while (da > Math.PI) da -= TAU;
          while (da < -Math.PI) da += TAU;
          if (Math.abs(da) <= z.spread / 2) {
            z.hit = true;
            damagePlayer(z.payload);
          }
        }
      }
      continue;
    }
    if (z.kind === 'ice' || z.kind === 'web' || z.kind === 'thorn') {
      if (Math.hypot(p.x - z.x, p.y - z.y) < z.r) {
        p.chilled = Math.max(p.chilled || 0, z.slow || 0.4);
        if (z.kind === 'thorn') {
          z.pTick = (z.pTick || 0) - dt;
          if (z.pTick <= 0) { z.pTick = 1; damagePlayer(6 * dmgScale(S.time / 60)); }
        }
      }
    }
  }
}
