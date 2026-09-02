// ---------------------------------------------------------------------------
// game.js — run lifecycle, the fixed-step update and the upgrade economy.
// ---------------------------------------------------------------------------

import { clamp, randInt, pick, shuffle, swapRemove, formatTime } from '../core/util.js';
import { sfx, playMusic } from '../core/audio.js';
import { input, pollInput } from '../core/input.js';
import { q } from '../core/quality.js';
import { say, setVoiceActor, stopVoice } from '../core/voice.js';
import { captureRun, restoreRun, writeSlot, readSlot } from '../core/saves.js';
import * as store from '../core/storage.js';
import {
  ring, emit, updateParticles, updateTexts, floatText, clearParticles,
  clearTexts, updateAmbient,
} from './particles.js';
import {
  RUN_LENGTH, WEAPONS, WEAPON_IDS, WEAPON_MAX_LEVEL, PASSIVES, PASSIVE_IDS,
  MAX_WEAPONS, MAX_PASSIVES, BOSSES, CHAMPION_FIRST, xpForLevel, DIFFICULTIES,
} from './config.js';
import {
  S, rebuildGrid, gainXp, gainGold, healPlayer, maxHp, moveSpeed,
  magnetRadius, luck, passiveLevel, showToast, showBanner, damageEnemy,
  killEnemy, resolvedStats, addShake, screenFlash,
} from './state.js';
import { updateWeapons, updateShots, updateSweeps, updateZones } from './weapons.js';
import { updateSpawning, updateEnemies, updateHostileShots, updateHazards, spawnPendingBoss } from './enemies.js';
import { updateCutscene, startCutscene } from './cutscene.js';
import { characterById } from '../art/hero.js';
import { foodName, foodHeal } from '../art/food.js';
import { setWorldSeed, ambientAt } from './world.js';

const listeners = {};
export function on(event, fn) { (listeners[event] ||= []).push(fn); }
function fire(event, payload) { (listeners[event] || []).forEach((f) => f(payload)); }

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------
export function startRun(charId, difficulty) {
  const ch = characterById(charId);
  const lvl = (id) => store.upgradeLevel(id);

  Object.assign(S, {
    time: 0, running: true, paused: false, outcome: null,
    difficulty, seed: (Math.random() * 1e9) | 0,
    enemies: [], shots: [], hostileShots: [], zones: [], pickups: [], orbs: [], sweeps: [],
    kills: 0, gold: 0, damageDealt: 0,
    shake: 0, hitStop: 0, flashAlpha: 0,
    boss: null, champion: null, championTimer: CHAMPION_FIRST,
    bossIndex: 0, spawnAccum: 0, nextEnemyId: 1,
    pendingLevels: 0, banished: [], toast: null, banner: null,
    cutscene: null, pendingBoss: null, arena: null, musicPhase: null,
    rerolls: lvl('m_reroll'), banishes: lvl('m_banish'),
    revives: lvl('m_revive') + (ch.stats.revives || 0),
    finalDefeated: false,
    inventory: {}, purchases: [], marketVisits: 0, pendingMarket: null, portal: null,
    vacuumT: 0,
  });
  setWorldSeed(S.seed);

  S.player = {
    charId, x: 0, y: 0, vx: 0, vy: 0,
    dir: 'south', frame: 0, animT: 0, faceAngle: 0, moving: false,
    level: 1, xp: 0, xpNext: xpForLevel(1),
    hpBase: ch.stats.hp, speedBase: ch.stats.speed,
    mightBase: ch.stats.might, cooldownBase: ch.stats.cooldown,
    magnetBase: 92 * ch.stats.magnet, luckBase: ch.stats.luck,
    armorBase: ch.stats.armor,
    metaMight: 1 + lvl('m_might') * 0.05,
    metaHp: lvl('m_hp') * 10,
    metaArmor: lvl('m_armor'),
    metaSpeed: 1 + lvl('m_speed') * 0.04,
    metaMagnet: 1 + lvl('m_magnet') * 0.15,
    metaHaste: 1 - lvl('m_haste') * 0.03,
    metaGrowth: 1 + lvl('m_growth') * 0.06,
    metaGreed: 1 + lvl('m_greed') * 0.12,
    metaLuck: 1 + lvl('m_luck') * 0.08,
    weapons: [{ id: ch.weapon, level: 1, cd: 0.3, evolved: false }],
    passives: {},
    kx: 0, ky: 0, swiftT: 0,
    invuln: 1.2, hurtFlash: 0, dead: false,
    showDamage: store.settings().damageNumbers,
    chilled: 0, webbed: 0,
  };
  S.player.hp = maxHp();

  clearParticles();
  clearTexts();
  S.musicPhase = battleTrackName(0);
  playMusic(S.musicPhase);
  setVoiceActor(charId);
  say('getready', { force: true });
  showBanner('SURVIVE', '#ffd75e', DIFFICULTIES[difficulty].label);
  fire('runStart');
}

export function endRun(outcome) {
  if (!S.running) return;
  S.running = false;
  S.outcome = outcome;
  // Arena fights are practice: they neither pay out nor count towards records,
  // so a boss cannot be farmed for gold.
  const arena = S.arena;
  const earned = arena ? 0 : S.gold;
  if (!arena) {
    store.addGold(earned);
    store.recordRun({ time: S.time, kills: S.kills, level: S.player.level, won: outcome === 'won' });
  }
  playMusic(outcome === 'won' ? 'victory' : 'gameover');
  sfx(outcome === 'won' ? 'win' : 'death');
  stopVoice();
  setTimeout(() => say(outcome === 'won' ? 'wow' : 'gameover', { force: true }), 700);
  fire('runEnd', { outcome, gold: earned, arena: arena ? { ...arena } : null });
}

/**
 * Drop straight into one boss fight, carrying the build you would plausibly
 * have by the minute that boss normally appears.
 */
export function startArena(charId, difficulty, bossId) {
  const def = BOSSES.find((b) => b.id === bossId) || BOSSES[0];
  startRun(charId, difficulty);
  S.arena = { bossId: def.id, name: def.name, minute: def.at, engaged: false };
  S.time = def.at * 60;          // the scaling curves read the clock
  grantArenaLoadout(def);
  S.bossIndex = BOSSES.length;   // nothing else is scheduled
  S.pendingBoss = def;
  startCutscene(def);
}

function grantArenaLoadout(def) {
  const p = S.player;
  // Tier is the minute the boss belongs to: 4, 8, 12, 16, 20. The grant has to
  // be enough to actually cut through to the boss, not merely plausible.
  const tier = def.at;
  const weaponCount = clamp(2 + Math.round(tier / 4.5), 3, MAX_WEAPONS);
  const wLevel = clamp(3 + Math.round(tier / 4), 4, WEAPON_MAX_LEVEL);
  const passiveCount = clamp(1 + Math.round(tier / 4), 2, MAX_PASSIVES);
  const pLevel = clamp(1 + Math.round(tier / 5), 2, 5);

  // Curated, not random: a showcase should never hand you a loadout that cannot
  // finish the fight. This order covers single-target, area, and always-on
  // damage before it reaches anything situational.
  const KIT = ['bolt', 'nova', 'aura', 'glaive', 'lightning', 'orbit', 'firebomb', 'orb', 'slash', 'brambles'];
  const BOONS = ['might', 'cooldown', 'area', 'amount', 'velocity', 'vitality'];

  const owned = new Set(p.weapons.map((w) => w.id));
  for (const w of p.weapons) w.level = wLevel;
  for (const id of KIT) {
    if (p.weapons.length >= weaponCount) break;
    if (owned.has(id)) continue;
    owned.add(id);
    p.weapons.push({ id, level: wLevel, cd: 0.2, evolved: false });
  }

  for (const id of BOONS) {
    if (Object.keys(p.passives).length >= passiveCount) break;
    p.passives[id] = Math.min(PASSIVES[id].max, pLevel);
  }

  // The late bosses deserve to be met by an evolved build.
  if (tier >= 16) {
    for (const w of p.weapons.slice(0, 2)) {
      w.level = WEAPON_MAX_LEVEL;
      const req = WEAPONS[w.id].evolution.requires;
      p.passives[req] = Math.max(p.passives[req] || 0, 3);
      w.evolved = true;
    }
  }

  p.level = 4 + tier * 3;
  p.xp = 0;
  p.xpNext = xpForLevel(p.level);
  S.rerolls += 2;
  p.hp = maxHp();
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
export function update(dt, view) {
  S.view = view;
  if (!S.running || S.paused || S.pendingLevels > 0) {
    // Even while a menu is open, keep presentation timers ticking.
    decayPresentation(dt);
    return;
  }

  // A boss entrance freezes the world; only the cinematic advances.
  if (S.cutscene) {
    if (updateCutscene(dt)) spawnPendingBoss();
    updateParticles(dt);
    decayPresentation(dt);
    return;
  }

  if (S.hitStop > 0) { S.hitStop -= dt; dt = Math.min(dt, 0.004); }

  S.time += dt;
  const p = S.player;

  pollInput();
  rebuildGrid();

  // --- movement ---
  let mx = input.x, my = input.y;
  const mag = Math.hypot(mx, my);
  if (mag > 1) { mx /= mag; my /= mag; }
  let speed = moveSpeed();
  if (p.chilled > 0) { speed *= 1 - p.chilled; p.chilled -= dt * 1.6; }
  if (p.webbed > 0) { speed *= 0.45; p.webbed -= dt; }
  if (p.swiftT > 0) { speed *= 1.35; p.swiftT -= dt; }

  p.vx = mx * speed;
  p.vy = my * speed;
  p.x += (p.vx + p.kx) * dt;
  p.y += (p.vy + p.ky) * dt;
  // External shoves (a dragon's wingbeat) decay independently of input.
  const kd = Math.pow(0.0022, dt);
  p.kx *= kd; p.ky *= kd;
  p.moving = mag > 0.02;

  if (p.moving) {
    p.faceAngle = Math.atan2(my, mx);
    p.dir = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'east' : 'west') : (my > 0 ? 'south' : 'north');
    p.animT += dt * (6 + mag * 3);
    p.frame = Math.floor(p.animT) % 4;
  } else {
    p.animT = 0;
    p.frame = 0;
  }

  if (p.invuln > 0) p.invuln -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;

  const regen = passiveLevel('regen') * PASSIVES.regen.step;
  if (regen) healPlayer(regen * dt);

  // --- systems ---
  updateWeapons(dt);
  updateSpawning(dt);
  updateEnemies(dt);
  updateShots(dt);
  updateSweeps(dt);
  updateZones(dt);
  updateHostileShots(dt);
  updateHazards(dt);
  updatePickups(dt);
  updateParticles(dt);
  updateTexts(dt);

  const amb = ambientAt(p.x, p.y);
  updateAmbient(dt, view, amb.kind, S.time);

  // Outside a boss fight the soundtrack escalates with the clock, and this is
  // also what restores the battle theme once a boss is dead.
  if (!S.boss && !S.cutscene) {
    const want = battleTrackName(S.arena ? S.arena.minute : S.time / 60);
    if (S.musicPhase !== want) { S.musicPhase = want; playMusic(want); }
  }

  updatePortal(dt);
  decayPresentation(dt);

  // --- win / lose ---
  if (p.dead) { endRun('dead'); return; }

  if (S.arena) {
    if (S.boss) S.arena.engaged = true;
    else if (S.arena.engaged && !S.pendingBoss && !S.cutscene && !S.finalDefeated) {
      S.finalDefeated = true;
      endRun('won');
    }
    return;
  }

  if (S.bossIndex >= BOSSES.length && !S.boss && !S.pendingBoss && !S.cutscene && !S.finalDefeated) {
    S.finalDefeated = true;
    endRun('won');
  }
}

// ---------------------------------------------------------------------------
// The market
// ---------------------------------------------------------------------------
/**
 * Step out of the run and into the Long Market. The clock stops because nothing
 * calls `update` while the market owns the frame; this just clears the board so
 * there is no shot in flight waiting to land when you come back.
 */
export function suspendForMarket() {
  const info = S.pendingMarket;
  S.pendingMarket = null;
  S.portal = null;
  S.marketVisits++;
  S.hostileShots.length = 0;
  S.zones.length = 0;
  S.champion = null;
  stopVoice();
  return { visit: S.marketVisits, bossName: info?.bossName || '' };
}

/** Back to the hunt. You get a moment of air rather than a face full of horde. */
export function resumeFromMarket() {
  const p = S.player;
  // Anything that wandered up to the shopfront while you were inside is gone.
  for (let i = S.enemies.length - 1; i >= 0; i--) {
    const e = S.enemies[i];
    if (e.isBoss) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) < 420) swapRemove(S.enemies, i);
  }
  p.invuln = Math.max(p.invuln, 2.5);
  p.kx = 0; p.ky = 0;
  S.spawnAccum = 0;
  S.musicPhase = battleTrackName(S.time / 60);
  playMusic(S.musicPhase);
  say('battlecry', { force: true });
  fire('marketLeft');
}

// ---------------------------------------------------------------------------
// Saving and loading
// ---------------------------------------------------------------------------
/** Write the run to a slot. Returns false when storage refuses it. */
export function saveRun(slot) {
  const data = captureRun(S);
  if (!data) return false;
  const ok = writeSlot(slot, data);
  if (ok) sfx('save');
  return ok;
}

/**
 * Resume a saved run. Builds a fresh run for the same hero and difficulty so
 * every derived value is correct, then pours the save over the top.
 */
export function loadRun(slot) {
  const data = readSlot(slot);
  if (!data || !data.player) return false;
  startRun(data.player.charId || 'ranger', data.difficulty || 'normal');
  if (!restoreRun(S, data)) return false;
  setWorldSeed(S.seed);
  // Start clear: the world respawns around you rather than being serialised.
  S.enemies.length = 0;
  S.pickups.length = 0;
  S.hostileShots.length = 0;
  S.boss = null;
  S.pendingBoss = null;
  S.cutscene = null;
  S.championTimer = CHAMPION_FIRST;
  S.player.hp = clamp(S.player.hp, 1, maxHp());
  S.musicPhase = battleTrackName(S.time / 60);
  playMusic(S.musicPhase);
  setVoiceActor(S.player.charId);
  showBanner('RESUMED', '#9ad4ff', `${formatTime(S.time)} in`);
  fire('runStart');
  return true;
}

/** Which battle theme the run has earned by now. */
export function battleTrackName(minutes) {
  return minutes >= 14 ? 'battle3' : minutes >= 7 ? 'battle2' : 'battle';
}

// ---------------------------------------------------------------------------
// The portal
// ---------------------------------------------------------------------------
// How close you have to be before it takes you. Generous, because being pulled
// in is the point — you should not have to aim at it.
export const PORTAL_RADIUS = 46;
const PORTAL_OPEN = 1.1;          // seconds spent tearing itself open

function updatePortal(dt) {
  const g = S.portal;
  if (!g || g.taken) return;
  g.t += dt;

  // Sparks drawn inward, so the thing looks like it is pulling before it does.
  if (g.t > PORTAL_OPEN * 0.4 && Math.random() < dt * 26) {
    const a = Math.random() * Math.PI * 2;
    const d = 52 + Math.random() * 46;
    emit('spark', g.x + Math.cos(a) * d, g.y + Math.sin(a) * d, {
      vx: -Math.cos(a) * 110, vy: -Math.sin(a) * 110,
      life: 0.45, size: 3, color: '#9ad4ff', glow: true, drag: 0.9,
    });
  }

  // It has to finish opening before it will take you, or a boss killed at
  // point-blank range would swallow you mid-swing with no time to read it.
  if (g.t < PORTAL_OPEN) return;

  const p = S.player;
  const d = Math.hypot(p.x - g.x, p.y - g.y);
  if (d > PORTAL_RADIUS) return;

  g.taken = true;
  S.pendingMarket = { bossName: g.bossName };
  ring(g.x, g.y, 90, '#9ad4ff', { life: 0.5 });
  addShake(4);
  sfx('market-open');
}

/** Close the portal without using it — the run has ended, or you went through. */
export function clearPortal() { S.portal = null; }

function decayPresentation(dt) {
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 26);
  if (S.flashAlpha > 0) S.flashAlpha = Math.max(0, S.flashAlpha - dt * 2.2);
  if (S.toast) { S.toast.life -= dt; if (S.toast.life <= 0) S.toast = null; }
  if (S.banner) { S.banner.life -= dt; if (S.banner.life <= 0) S.banner = null; }
}

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------
// How long a magnet's vacuum lasts, and how hard it pulls. The ordinary pull
// tops out around 22; this is an order of magnitude past it, which is what
// makes the difference read as a vacuum rather than as a slightly wider magnet.
export const VACUUM_TIME = 7;
const VACUUM_PULL = 190;

function updatePickups(dt) {
  const p = S.player;
  const mag = magnetRadius();

  // The vacuum takes everything, not just gems: food, coins, hearts, chests.
  // Seven seconds is long enough to clear a boss's whole drop and short enough
  // that it is a moment rather than a mode.
  const vac = S.vacuumT > 0;
  if (vac) S.vacuumT = Math.max(0, S.vacuumT - dt);

  for (let i = S.pickups.length - 1; i >= 0; i--) {
    const it = S.pickups[i];
    it.t += dt;
    const dx = p.x - it.x, dy = p.y - it.y;
    const d = Math.hypot(dx, dy) || 1;

    const attractR = it.kind === 'chest' ? 60 : mag;
    if (vac || it.magnetised || d < attractR) {
      it.magnetised = true;
      // Under the vacuum the pull is flat and enormous rather than falling off
      // with distance, so something across the field arrives about as fast as
      // something at your feet — which is what "like a vacuum" has to feel like.
      const pull = vac ? VACUUM_PULL : clamp(620 / Math.max(28, d), 3, 22);
      it.vx += (dx / d) * pull * 60 * dt;
      it.vy += (dy / d) * pull * 60 * dt;
      // Streaks, so the screen reads as a rush of things being drawn in.
      if (vac && q.glows && Math.random() < dt * 26) {
        emit('spark', it.x, it.y, {
          vx: (dx / d) * 120, vy: (dy / d) * 120,
          life: 0.22, size: 2, color: '#9ad4ff', glow: true, drag: 0.9,
        });
      }
    }
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    // Less drag while vacuuming, or the flat pull would be fought to a crawl.
    const drag = vac ? 0.35 : 0.02;
    it.vx *= Math.pow(drag, dt);
    it.vy *= Math.pow(drag, dt);

    // A wider mouth while it lasts: at this speed a pickup can cross the old
    // 22px collection radius inside a single frame and sail straight past.
    if (d < (vac ? 46 : 22)) { collect(it); swapRemove(S.pickups, i); }
  }
}

function collect(it) {
  const p = S.player;
  switch (it.kind) {
    case 'gem1': case 'gem2': case 'gem3':
      gainXp(it.value);
      sfx('gem');
      emit('spark', it.x, it.y, { life: 0.25, size: 3, color: '#9ad4ff', glow: true });
      break;
    case 'coin': {
      const g = gainGold(it.value);
      floatText(it.x, it.y - 12, `+${g}`, '#ffd75e', { size: 10 });
      sfx('gold');
      break;
    }
    case 'heart': {
      const healed = healPlayer(it.value);
      if (healed > 0) floatText(p.x, p.y - 30, `+${Math.round(healed)}`, '#7fe05a', { size: 13 });
      sfx('heal');
      break;
    }
    case 'food': {
      // Food heals first. Anything it cannot heal because you are already
      // topped up is not wasted — it turns into experience instead, so a meal
      // picked up at full health is still worth walking over.
      const amount = foodHeal(it.variant);
      const healed = healPlayer(amount);
      const spare = amount - healed;
      floatText(p.x, p.y - 40, foodName(it.variant), '#ffd75e', { size: 11, life: 1.1 });

      if (healed > 0) floatText(p.x, p.y - 24, `+${Math.round(healed)}`, '#7fe05a', { size: 13 });
      if (spare > 0) {
        // Priced against the level you are on rather than as a flat number, or
        // a dumpling would be two levels at the start of a run and a rounding
        // error by the end. A whole meal is worth about a fifth of a level,
        // whenever you eat it.
        const xp = Math.max(1, Math.round(xpForLevel(p.level) * 0.18 * (spare / 35)));
        gainXp(xp);
        floatText(p.x, p.y - (healed > 0 ? 10 : 24), `+${xp} XP`, '#9ad4ff', { size: 13 });
      }
      sfx(healed > 0 ? 'heal' : 'gem');
      break;
    }
    case 'magnet':
      // Everything on the ground, not only the gems, and everything dropped
      // during the next seven seconds too.
      for (const o of S.pickups) o.magnetised = true;
      S.vacuumT = VACUUM_TIME;
      showToast('Everything comes to you', '#9ad4ff', 1.6);
      screenFlash('#9ad4ff', 0.16);
      ring(p.x, p.y, 240, '#9ad4ff', { life: 0.5 });
      showToast('Everything comes to you', '#ff9ad2', 1.4);
      sfx('chest');
      break;
    case 'bombpick': {
      screenFlash('#ffffff', 0.55);
      addShake(14);
      let n = 0;
      for (const e of [...S.enemies]) {
        if (e.isBoss) { damageEnemy(e, e.maxHp * 0.06); continue; }
        if (e.isChampion) { damageEnemy(e, e.maxHp * 0.3); continue; }
        killEnemy(e); n++;
      }
      showToast(`Purged ${n}`, '#ffffff', 1.4);
      sfx('boom');
      break;
    }
    case 'chest':
      openChest(it.value || 1);
      break;
  }
}

function openChest(tier) {
  const rolls = tier >= 3 ? randInt(3, 5) : tier >= 2 ? randInt(2, 3) : randInt(1, 2);
  const granted = [];
  for (let i = 0; i < rolls; i++) {
    const options = buildPool().filter((c) => c.type !== 'heal' && c.type !== 'gold');
    if (!options.length) break;
    const choice = pick(options);
    applyChoice(choice, true);
    granted.push(choice.label);
  }
  gainGold(20 * tier);
  showBanner('TREASURE', '#ffd75e', granted.join(' · '), 3);
  screenFlash('#ffd75e', 0.35);
  sfx('chest');
}

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------
function weaponEntry(id) { return S.player.weapons.find((w) => w.id === id); }

/** Every upgrade currently legal, as card descriptors. */
export function buildPool() {
  const p = S.player;
  const pool = [];

  for (const w of p.weapons) {
    const def = WEAPONS[w.id];
    if (w.evolved) continue;
    if (w.level >= WEAPON_MAX_LEVEL) {
      const evo = def.evolution;
      const req = evo.requires;
      if ((p.passives[req] || 0) >= 3) {
        pool.push({
          type: 'evolve', id: w.id, icon: evo.icon, rarity: 'evolution',
          label: evo.name, sub: 'EVOLUTION',
          desc: evo.desc, weight: 40,
        });
      }
      continue;
    }
    pool.push({
      type: 'weapon', id: w.id, icon: def.icon, rarity: 'upgrade',
      label: def.name, sub: `Level ${w.level + 1}`,
      desc: upgradeBlurb(w),
      weight: 10,
    });
  }

  if (p.weapons.length < MAX_WEAPONS) {
    for (const id of WEAPON_IDS) {
      if (weaponEntry(id)) continue;
      const def = WEAPONS[id];
      pool.push({
        type: 'newWeapon', id, icon: def.icon, rarity: 'new',
        label: def.name, sub: 'NEW WEAPON', desc: def.desc, weight: 8,
      });
    }
  }

  for (const id of PASSIVE_IDS) {
    const lvl = p.passives[id] || 0;
    const def = PASSIVES[id];
    if (lvl >= def.max) continue;
    if (lvl === 0 && Object.keys(p.passives).length >= MAX_PASSIVES) continue;
    pool.push({
      type: 'passive', id, icon: def.icon,
      rarity: lvl === 0 ? 'new' : 'upgrade',
      label: def.name, sub: lvl === 0 ? 'NEW' : `Level ${lvl + 1}`,
      desc: `${def.fmt(def.step * (lvl + 1))} — ${def.desc}`,
      weight: 9,
    });
  }

  if (!pool.length) {
    pool.push({ type: 'heal', id: 'heal', icon: 'vitality', rarity: 'upgrade', label: 'Restoration', sub: '', desc: 'Recover 60 health.', weight: 1 });
    pool.push({ type: 'gold', id: 'gold', icon: 'fortune', rarity: 'upgrade', label: 'Coin Purse', sub: '', desc: 'Gain 80 gold.', weight: 1 });
  }
  return pool.filter((c) => !S.banished.includes(cardKey(c)));
}

function upgradeBlurb(w) {
  const now = resolvedStats(w);
  const next = resolvedStats({ ...w, level: w.level + 1 });
  const parts = [];
  const fmt = (k, label, pct = false, invert = false) => {
    const a = now[k] || 0, b = next[k] || 0;
    if (Math.abs(b - a) < 0.001) return;
    const delta = b - a;
    const good = invert ? delta < 0 : delta > 0;
    if (pct) parts.push(`${good ? '+' : ''}${Math.round((delta / (a || 1)) * 100)}% ${label}`);
    else parts.push(`${delta > 0 ? '+' : ''}${Math.round(delta * 10) / 10} ${label}`);
  };
  fmt('damage', 'damage');
  fmt('count', 'projectiles');
  fmt('pierce', 'pierce');
  fmt('cooldown', 'cooldown', true, true);
  fmt('area', 'area', true);
  fmt('radius', 'radius');
  return parts.slice(0, 3).join(', ') || 'Improves the weapon.';
}

export function cardKey(c) { return `${c.type}:${c.id}`; }

/** Three (or four, when lucky) distinct offers. */
export function rollChoices() {
  const pool = buildPool();
  const n = Math.random() < clamp((luck() - 1) * 0.5, 0, 0.45) ? 4 : 3;
  const evolutions = pool.filter((c) => c.type === 'evolve');
  const rest = shuffle(pool.filter((c) => c.type !== 'evolve'));
  const out = [...evolutions.slice(0, 2)];
  const seen = new Set(out.map(cardKey));
  for (const c of rest) {
    if (out.length >= n) break;
    if (seen.has(cardKey(c))) continue;
    seen.add(cardKey(c));
    out.push(c);
  }
  return out;
}

export function applyChoice(c, silent = false) {
  const p = S.player;
  switch (c.type) {
    case 'weapon': {
      const w = weaponEntry(c.id);
      if (w) w.level = Math.min(WEAPON_MAX_LEVEL, w.level + 1);
      break;
    }
    case 'newWeapon':
      p.weapons.push({ id: c.id, level: 1, cd: 0.2, evolved: false });
      break;
    case 'evolve': {
      const w = weaponEntry(c.id);
      if (w) {
        w.evolved = true;
        say('wow', { force: true });
        screenFlash('#ffd75e', 0.6);
        addShake(10);
        ring(p.x, p.y, 260, '#ffd75e', { life: 0.8 });
        if (!silent) showBanner('EVOLVED', '#ffd75e', WEAPONS[c.id].evolution.name);
      }
      break;
    }
    case 'passive':
      p.passives[c.id] = (p.passives[c.id] || 0) + 1;
      if (c.id === 'vitality') healPlayer(PASSIVES.vitality.step);
      break;
    case 'heal':
      healPlayer(60);
      break;
    case 'gold':
      gainGold(80);
      break;
  }
  if (!silent) sfx('select');
}

export function takeLevelUp(choice) {
  applyChoice(choice);
  S.pendingLevels = Math.max(0, S.pendingLevels - 1);
}

export function skipLevelUp() {
  healPlayer(maxHp() * 0.1);
  gainGold(15);
  S.pendingLevels = Math.max(0, S.pendingLevels - 1);
  sfx('back');
}

export function banishCard(c) {
  if (S.banishes <= 0) return false;
  S.banishes--;
  S.banished.push(cardKey(c));
  sfx('back');
  return true;
}

export function useReroll() {
  if (S.rerolls <= 0) return false;
  S.rerolls--;
  sfx('select');
  return true;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
export function updateCamera(dt, w, h) {
  const p = S.player;
  if (!p) return;
  // Lead the camera slightly in the direction of travel so you see what's coming.
  S.cam.tx = p.x + p.vx * 0.16;
  S.cam.ty = p.y + p.vy * 0.16;
  const k = 1 - Math.pow(0.0008, dt);
  S.cam.x += (S.cam.tx - S.cam.x) * k;
  S.cam.y += (S.cam.ty - S.cam.y) * k;
}

export function computeView(w, h, zoom) {
  const vw = w / zoom, vh = h / zoom;
  return {
    left: S.cam.x - vw / 2, right: S.cam.x + vw / 2,
    top: S.cam.y - vh / 2, bottom: S.cam.y + vh / 2,
    w: vw, h: vh,
  };
}

export { RUN_LENGTH };
