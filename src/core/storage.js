// ---------------------------------------------------------------------------
// storage.js — persistence for settings, meta progression and records.
// Everything degrades gracefully when localStorage is unavailable (private
// windows, embedded webviews), so the game is always playable.
// ---------------------------------------------------------------------------

const KEY = 'grimfall.save.v1';

const DEFAULTS = {
  settings: {
    music: true,
    musicVol: 0.5,
    sfx: true,
    sfxVol: 0.7,
    voice: true,
    voiceVol: 0.85,
    difficulty: 'normal',
    joystick: 'auto',       // 'auto' | 'fixed' | 'dynamic'
    screenShake: true,
    damageNumbers: true,
    quality: 'auto',        // 'auto' | 'high' | 'medium' | 'low'
  },
  meta: {
    gold: 0,
    upgrades: {},           // id -> level
    unlocked: ['ranger'],   // character ids
    lastCharacter: 'ranger',
    // What the Hearthhall can still pay out today. See src/game/purse.js for
    // why the inn's games draw on a capped, slowly-refilling pot rather than
    // printing gold: it is the one thing stopping the lobby from being a better
    // way to earn than the game.
    purse: { coin: 120, at: 0 },
  },
  records: {
    bestTime: 0,
    bestKills: 0,
    bestLevel: 0,
    runs: 0,
    wins: 0,
    totalKills: 0,
  },
};

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!patch || typeof patch !== 'object') return out;
  for (const k of Object.keys(patch)) {
    const b = base[k], p = patch[k];
    if (b && p && typeof b === 'object' && typeof p === 'object' && !Array.isArray(b)) out[k] = deepMerge(b, p);
    else if (p !== undefined) out[k] = p;
  }
  return out;
}

let state = structuredClone(DEFAULTS);

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = deepMerge(DEFAULTS, JSON.parse(raw));
  } catch (e) {
    // Corrupt or blocked storage: keep defaults, never crash the boot.
  }
  return state;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* read-only storage */ }
}

export const settings = () => state.settings;
export const meta = () => state.meta;
export const records = () => state.records;

export function setSetting(key, value) { state.settings[key] = value; save(); }

export function addGold(n) {
  state.meta.gold = Math.max(0, Math.floor(state.meta.gold + n));
  save();
}

export function spendGold(n) {
  if (state.meta.gold < n) return false;
  state.meta.gold -= n;
  save();
  return true;
}

export function upgradeLevel(id) { return state.meta.upgrades[id] | 0; }

export function setUpgradeLevel(id, lvl) { state.meta.upgrades[id] = lvl; save(); }

export function isUnlocked(id) { return state.meta.unlocked.includes(id); }

export function unlock(id) {
  if (!state.meta.unlocked.includes(id)) { state.meta.unlocked.push(id); save(); }
}

export function recordRun({ time, kills, level, won }) {
  const r = state.records;
  r.runs++;
  r.totalKills += kills;
  if (won) r.wins++;
  r.bestTime = Math.max(r.bestTime, time);
  r.bestKills = Math.max(r.bestKills, kills);
  r.bestLevel = Math.max(r.bestLevel, level);
  save();
}

/**
 * Take progression out of an imported backup.
 *
 * Merged onto the defaults rather than assigned, so a file missing a field —
 * an older backup, a hand-edited one — gets the default instead of `undefined`
 * leaking into the game. Everything is coerced to the type it is supposed to
 * be: this data came off a disk and may have been edited by anyone.
 */
export function importProgress({ meta, records, settings } = {}) {
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

  if (meta && typeof meta === 'object') {
    const upgrades = {};
    if (meta.upgrades && typeof meta.upgrades === 'object') {
      for (const [k, v] of Object.entries(meta.upgrades)) {
        // `JSON.parse` puts `__proto__` in as an ordinary own key, and copying
        // it across with `[k] =` would set this object's prototype instead of
        // storing an upgrade. Nothing good is ever spelled like this.
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        upgrades[String(k)] = num(v) | 0;
      }
    }
    const unlocked = Array.isArray(meta.unlocked)
      ? [...new Set(meta.unlocked.filter((x) => typeof x === 'string'))]
      : DEFAULTS.meta.unlocked.slice();
    if (!unlocked.length) unlocked.push('ranger');     // never lock everyone out
    // A save from before the inn had a purse gets a full one. Anything absurd
    // in the file — a hand-edited coin count, a timestamp from the future — is
    // clamped rather than trusted, because this is the one number a player
    // could edit for free gold.
    const p = meta.purse && typeof meta.purse === 'object' ? meta.purse : null;
    const purse = {
      coin: p ? Math.max(0, Math.min(120, num(p.coin) | 0)) : 120,
      at: p ? Math.min(Date.now(), Math.max(0, num(p.at) | 0)) : 0,
    };
    state.meta = {
      gold: Math.max(0, num(meta.gold) | 0),
      upgrades,
      unlocked,
      lastCharacter: typeof meta.lastCharacter === 'string' ? meta.lastCharacter : 'ranger',
      purse,
    };
  }

  if (records && typeof records === 'object') {
    state.records = {
      bestTime: Math.max(0, num(records.bestTime)),
      bestKills: Math.max(0, num(records.bestKills) | 0),
      bestLevel: Math.max(0, num(records.bestLevel) | 0),
      runs: Math.max(0, num(records.runs) | 0),
      wins: Math.max(0, num(records.wins) | 0),
      totalKills: Math.max(0, num(records.totalKills) | 0),
    };
  }

  // Settings are optional: a player importing a save onto a phone rarely wants
  // the volume and quality settings from their desktop.
  if (settings && typeof settings === 'object') {
    state.settings = deepMerge(DEFAULTS.settings, settings);
  }

  save();
  return true;
}

export function resetAll() {
  state = structuredClone(DEFAULTS);
  save();
}
