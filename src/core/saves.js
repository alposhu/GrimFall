// ---------------------------------------------------------------------------
// saves.js — suspending a run and picking it up later.
//
// Four slots: three you choose plus an autosave the market writes every time
// you walk into it. What gets written is the *state you built*, not the world
// around you — level, weapons, passives, purchases, what is in your belt. The
// horde, the loose gems and the particles are all deliberately dropped: they
// are regenerated from the seed and the clock, and serialising a thousand
// enemies to reproduce a moment you were in the middle of losing helps nobody.
//
// Slots live in their own storage key, so a corrupt save can never take the
// settings and meta progression down with it.
// ---------------------------------------------------------------------------

import { DIFFICULTY_ORDER } from '../game/config.js';

const KEY = 'grimfall.slots.v1';
export const VERSION = 3;
export const SLOTS = ['auto', '1', '2', '3'];

let cache = null;

function readAll() {
  if (cache) return cache;
  cache = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') cache = parsed;
    }
  } catch (e) {
    cache = {};                       // unreadable or blocked: start clean
  }
  return cache;
}

function writeAll(data) {
  cache = data;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;                     // private window or quota: the run goes on
  }
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------
const PLAYER_FIELDS = [
  'charId', 'x', 'y', 'level', 'xp', 'xpNext', 'hp',
  'hpBase', 'speedBase', 'mightBase', 'cooldownBase', 'magnetBase', 'luckBase', 'armorBase',
  'metaMight', 'metaHp', 'metaArmor', 'metaSpeed', 'metaMagnet', 'metaHaste',
  'metaGrowth', 'metaGreed', 'metaLuck', 'swiftT',
];

const RUN_FIELDS = [
  'time', 'difficulty', 'seed', 'kills', 'gold', 'damageDealt',
  'bossIndex', 'rerolls', 'banishes', 'revives', 'marketVisits',
];

/** Snapshot the live run. Returns null when there is nothing worth saving. */
export function captureRun(S) {
  if (!S.running || !S.player || S.arena) return null;
  const p = S.player;
  const data = { v: VERSION, savedAt: Date.now() };
  for (const k of RUN_FIELDS) data[k] = S[k];
  data.banished = [...(S.banished || [])];
  // An open portal is part of what you built: you earned it by killing a boss,
  // and a save must not quietly cost you the market visit. It is stored reset
  // to fully open, since the tearing-open animation has already been seen.
  data.portal = S.portal && !S.portal.taken
    ? { x: S.portal.x, y: S.portal.y, bossName: S.portal.bossName }
    : null;
  data.purchases = [...(S.purchases || [])];
  data.inventory = { ...(S.inventory || {}) };
  data.player = {};
  for (const k of PLAYER_FIELDS) data.player[k] = p[k];
  data.player.weapons = p.weapons.map((w) => ({ id: w.id, level: w.level, evolved: !!w.evolved }));
  data.player.passives = { ...p.passives };
  return data;
}

/**
 * Pour a save back into a run that `startRun` has already initialised.
 * Anything the save does not carry keeps the fresh value, so an older save
 * missing a newer field still loads.
 */
export function restoreRun(S, data) {
  if (!data || !data.player) return false;
  const p = S.player;
  for (const k of RUN_FIELDS) if (data[k] !== undefined) S[k] = data[k];
  S.banished = [...(data.banished || [])];
  S.portal = data.portal
    ? { x: data.portal.x, y: data.portal.y, t: 99, bossName: data.portal.bossName, taken: false }
    : null;
  S.purchases = [...(data.purchases || [])];
  S.inventory = { ...(data.inventory || {}) };
  for (const k of PLAYER_FIELDS) if (data.player[k] !== undefined) p[k] = data.player[k];
  p.weapons = (data.player.weapons || []).map((w) => ({
    id: w.id, level: w.level, evolved: !!w.evolved, cd: 0.3,
  }));
  if (!p.weapons.length) p.weapons = [{ id: 'bolt', level: 1, cd: 0.3, evolved: false }];
  p.passives = { ...(data.player.passives || {}) };
  // A loaded run should not immediately die to something standing on the spawn.
  p.invuln = Math.max(p.invuln || 0, 2);
  p.dead = false;
  return true;
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------
export function writeSlot(slot, data) {
  if (!SLOTS.includes(slot) || !data) return false;
  const all = { ...readAll() };
  all[slot] = data;
  return writeAll(all);
}

export function readSlot(slot) {
  const d = readAll()[slot];
  if (!d || typeof d !== 'object') return null;
  // A save from a future version is not something this build can be trusted to
  // load; an older one is fine because restore only reads fields it knows.
  if ((d.v | 0) > VERSION) return null;
  return d;
}

export function clearSlot(slot) {
  const all = { ...readAll() };
  delete all[slot];
  return writeAll(all);
}

export const hasSlot = (slot) => !!readSlot(slot);

/** Everything the load screen needs, without loading anything. */
export function slotSummaries() {
  return SLOTS.map((slot) => {
    const d = readSlot(slot);
    if (!d) return { slot, empty: true };
    return {
      slot,
      empty: false,
      charId: d.player?.charId || 'ranger',
      level: d.player?.level || 1,
      time: d.time || 0,
      kills: d.kills || 0,
      gold: d.gold || 0,
      // Constrained to a known key rather than passed through. The saves
      // screen builds its rows with innerHTML, and this is the only field in
      // them that comes out of storage as free text — so it is narrowed here,
      // at the boundary, instead of being escaped at every use.
      difficulty: DIFFICULTY_ORDER.includes(d.difficulty) ? d.difficulty : 'normal',
      bossIndex: d.bossIndex || 0,
      visits: d.marketVisits || 0,
      savedAt: d.savedAt || 0,
      weapons: (d.player?.weapons || []).length,
    };
  });
}

/** The newest save of any kind — what a "Continue" button should pick up. */
export function mostRecent() {
  let best = null;
  for (const s of slotSummaries()) {
    if (s.empty) continue;
    if (!best || s.savedAt > best.savedAt) best = s;
  }
  return best;
}

export function resetSaves() {
  writeAll({});
}
